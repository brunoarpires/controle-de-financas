import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Search, Paperclip } from 'lucide-react'
import { db, type Transacao } from '../db'
import { useCategorias, useContas, mapaPorId, useMembros, usePessoa } from '../hooks'
import { brl, dataBR, mesAtual, nomeMes } from '../utils'
import { normalizar } from '../categorizar'
import { SeletorMes, Titulo, FiltroMembro } from '../components/ui'
import TransacaoForm from '../components/TransacaoForm'
import { rotuloConta, transacaoDaPessoa } from '../vrTicket'

export default function Lancamentos() {
  const [mes, setMes] = useState(mesAtual())
  const [todos, setTodos] = useState(false)
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const [tipo, setTipo] = useState('')
  const [editando, setEditando] = useState<Transacao | null>(null)
  const catsL = useCategorias(), cats = mapaPorId(catsL), contas = mapaPorId(useContas())
  const lista = useLiveQuery(() => (todos ? db.transacoes.toArray() : db.transacoes.where('data').startsWith(mes).toArray()), [mes, todos]) ?? []
  const membrosMap = useMembros(), membros = [...membrosMap.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  const [pessoa, setPessoa] = usePessoa()
  const b = normalizar(busca)
  const filtrada = lista.filter((t) => transacaoDaPessoa(t, pessoa, contas) && (!cat || t.categoriaId === cat) && (!tipo || t.tipo === tipo) && (!b || normalizar(`${t.descricao} ${t.observacao ?? ''} ${t.nota?.estabelecimento ?? ''}`).includes(b)))
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm)
  const total = filtrada.reduce((s, t) => s + (t.tipo === 'receita' ? t.valor : -t.valor), 0)
  const grupos = new Map<string, Transacao[]>(); filtrada.forEach((t) => grupos.set(t.data, [...(grupos.get(t.data) ?? []), t]))

  return (
    <div>
      <Titulo extra={!todos && <SeletorMes mes={mes} setMes={setMes} rotulo={nomeMes(mes)} />}>Lançamentos</Titulo>
      <div className="card mb-4 space-y-3">
        <FiltroMembro valor={pessoa} onChange={setPessoa} membros={membros} />
        <div className="relative"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input className="input pl-10" placeholder="Buscar por descrição ou loja…" value={busca} onChange={(e) => setBusca(e.target.value)} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
          <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Todas as categorias</option>{catsL.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select>
          <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">Receitas e despesas</option><option value="despesa">Só despesas</option><option value="receita">Só receitas</option></select>
          <label className="flex items-center gap-2 text-sm sm:col-span-2 md:col-span-1"><input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={todos} onChange={(e) => setTodos(e.target.checked)} />Todos os meses</label>
        </div>
      </div>
      <div className="flex justify-between text-sm mb-2 px-1"><span className="text-slate-500">{filtrada.length} lançamento(s)</span><span>Saldo: <b className={total >= 0 ? 'text-brand-600' : 'text-rose-600'}>{brl(total)}</b></span></div>
      {filtrada.length === 0 && <div className="card text-center text-slate-500 py-10">Nada por aqui. Use o botão <b>+</b> para adicionar.</div>}
      {[...grupos.entries()].map(([d, ts]) => (
        <div key={d} className="mb-3">
          <div className="text-xs font-semibold text-slate-500 uppercase px-1 mb-1">{dataBR(d)}</div>
          <div className="card p-0 divide-y divide-slate-100 dark:divide-slate-800">
            {ts.map((t) => { const c = cats.get(t.categoriaId); return (
              <button key={t.id} onClick={() => setEditando(t)} className="w-full flex items-center gap-3 p-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <span className="text-xl w-10 h-10 shrink-0 rounded-full flex items-center justify-center" style={{ background: (c?.cor ?? '#999') + '33' }}>{c?.icone}</span>
                <div className="flex-1 min-w-0"><div className="font-medium truncate flex items-center gap-1">{t.descricao}{t.parcelaTotal && t.parcelaTotal >= 2 && <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded px-1.5 py-0.5">{t.parcelaNumero}/{t.parcelaTotal}</span>}{(t.foto || t.fotoPath) && <Paperclip size={14} className="text-slate-400" />}</div><div className="text-xs text-slate-500 truncate">{t.hora && <>{t.hora} · </>}{c?.nome} · {contas.get(t.contaId) ? rotuloConta(contas.get(t.contaId)!, membrosMap) : '—'}{membros.length > 1 && t.userId && <> · lançado por <span className="font-semibold">{membrosMap.get(t.userId)?.nome ?? 'ex-membro'}</span></>}</div></div>
                <b className={`whitespace-nowrap ${t.tipo === 'receita' ? 'text-brand-600' : 'text-rose-600'}`}>{t.tipo === 'receita' ? '+' : '−'} {brl(t.valor)}</b>
              </button>) })}
          </div>
        </div>
      ))}
      {editando && <TransacaoForm transacao={editando} onFechar={() => setEditando(null)} />}
    </div>
  )
}
