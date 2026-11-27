import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts'
import { TrendingUp, TrendingDown, Camera, FileSpreadsheet, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { db, type Tipo, type Transacao } from '../db'
import { useCategorias, useContas, mapaPorId, useMembros, usePessoa, useOcultos } from '../hooks'
import { transacaoDaPessoa, saldosVrPorConta, rotuloConta } from '../vrTicket'
import { useSessao } from '../sessao'
import { ocultarValores, brl, mesAtual, nomeMes, somaMes, dataBR } from '../utils'
import { SeletorMes, FiltroMembro } from '../components/ui'

export default function Dashboard({ onNovo }: { onNovo: (t: Tipo) => void }) {
  const [mes, setMes] = useState(mesAtual())
  const ocultos = useOcultos()
  const cats = mapaPorId(useCategorias())
  const contasLista = useContas()
  const contas = mapaPorId(contasLista)
  const inicio6 = somaMes(mes, -5)
  const ses = useSessao()
  const membrosMap = useMembros(), membros = [...membrosMap.values()].sort((a, b) => a.nome.localeCompare(b.nome))
  const [pessoa, setPessoa] = usePessoa()
  const todas = useLiveQuery(() => db.transacoes.where('data').between(inicio6 + '-01', mes + '-31', true, true).toArray(), [mes]) ?? []
  const trans = pessoa ? todas.filter((t) => transacaoDaPessoa(t, pessoa, contas)) : todas
  const txsVr = useLiveQuery(() => {
    const ids = contasLista.filter((c) => c.tipo === 'vr_ticket').map((c) => c.id)
    return ids.length ? db.transacoes.where('contaId').anyOf(ids).toArray() : Promise.resolve([] as Transacao[])
  }, [contasLista]) ?? []
  const saldosVr = saldosVrPorConta(contasLista, txsVr, membrosMap, pessoa || undefined)
  const porPessoa = membros.map((m) => { const l = todas.filter((t) => t.data.startsWith(mes) && t.userId === m.userId); return { m, desp: l.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0), rec: l.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0), n: l.length } })
  const maxPessoa = Math.max(1, ...porPessoa.map((x) => x.desp))
  const quem = pessoa ? membrosMap.get(pessoa)?.nome : membros.length > 1 ? 'todos' : ''
  const orcs = useLiveQuery(() => db.orcamentos.toArray(), []) ?? []
  const doMes = trans.filter((t) => t.data.startsWith(mes))
  const rec = doMes.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0)
  const desp = doMes.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0)
  const porCat = new Map<string, number>()
  doMes.filter((t) => t.tipo === 'despesa').forEach((t) => porCat.set(t.categoriaId, (porCat.get(t.categoriaId) ?? 0) + t.valor))
  const pizza = [...porCat.entries()].map(([id, v]) => ({ nome: cats.get(id)?.nome ?? '?', icone: cats.get(id)?.icone, cor: cats.get(id)?.cor ?? '#999', valor: v })).sort((a, b) => b.valor - a.valor)
  const evolucao = Array.from({ length: 6 }, (_, i) => { const m = somaMes(inicio6, i); const l = trans.filter((t) => t.data.startsWith(m)); return { mes: nomeMes(m, true), Receitas: l.filter((t) => t.tipo === 'receita').reduce((s, t) => s + t.valor, 0), Despesas: l.filter((t) => t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0) } })
  const alertas = orcs.map((o) => ({ o, gasto: porCat.get(o.categoriaId) ?? 0, c: cats.get(o.categoriaId) })).filter((x) => x.c && x.o.limite > 0 && x.gasto / x.o.limite >= 0.8)
  const ultimos = [...doMes].sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm - a.criadoEm).slice(0, 5)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><h1 className="text-2xl md:text-3xl font-bold min-w-0 break-words">Olá{ses.eu ? `, ${ses.eu.nome}` : ''}! 👋</h1><SeletorMes mes={mes} setMes={setMes} rotulo={nomeMes(mes)} /></div>
      <FiltroMembro valor={pessoa} onChange={setPessoa} membros={membros} />
      <div className="card bg-gradient-to-br from-brand-600 to-emerald-700 text-white border-0">
        <div className="flex items-center justify-between gap-2"><div className="text-sm opacity-90">Saldo do mês{quem && <> · <b>{quem}</b></>}</div>
          <button data-testid="olho" onClick={() => ocultarValores(!ocultos)} aria-label={ocultos ? 'Mostrar valores' : 'Esconder valores'} title={ocultos ? 'Mostrar valores' : 'Esconder valores'} className="p-2 -m-1 rounded-full hover:bg-white/15 active:bg-white/25">{ocultos ? <EyeOff size={22} /> : <Eye size={22} />}</button></div>
        <div className="text-4xl font-bold my-1">{brl(rec - desp)}</div>
        <div className="flex gap-6 mt-3 text-sm">
          <div className="flex items-center gap-2"><TrendingUp size={18} /><div><div className="opacity-80">Receitas</div><b className="text-base">{brl(rec)}</b></div></div>
          <div className="flex items-center gap-2"><TrendingDown size={18} /><div><div className="opacity-80">Despesas</div><b className="text-base">{brl(desp)}</b></div></div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button className="btn py-4 bg-rose-600 text-white text-base" onClick={() => onNovo('despesa')}>− Despesa</button>
        <button className="btn py-4 bg-brand-600 text-white text-base" onClick={() => onNovo('receita')}>+ Receita</button>
        <a href="#/importar/nota" className="btn-ghost py-4"><Camera size={20} />Foto da nota</a>
        <a href="#/importar/planilha" className="btn-ghost py-4"><FileSpreadsheet size={20} />Planilha</a>
      </div>
      {saldosVr.length > 0 && (
        <div className="card">
          <h2 className="font-bold mb-1">Saldo VR - Ticket</h2>
          <p className="text-xs text-slate-500 mb-3">Saldo restante de cada ticket (todas as receitas e despesas). Qualquer integrante pode usar.</p>
          <ul className="space-y-2">{saldosVr.map((s) => (
            <li key={s.conta.id} className="flex items-center gap-2 text-sm">
              <span className="text-xl">{s.conta.icone || '🎫'}</span>
              <span className="flex-1 min-w-0 truncate">{s.rotulo}</span>
              <b className={s.saldo >= 0 ? 'text-brand-600' : 'text-rose-600'}>{brl(s.saldo)}</b>
            </li>
          ))}</ul>
        </div>
      )}
      {alertas.map(({ o, gasto, c }) => (
        <div key={o.categoriaId} className={`card flex items-center gap-3 ${gasto > o.limite ? 'border-rose-300 bg-rose-50 dark:bg-rose-950/40' : 'border-amber-300 bg-amber-50 dark:bg-amber-950/40'}`}>
          <AlertTriangle className={gasto > o.limite ? 'text-rose-600' : 'text-amber-600'} />
          <div className="text-sm">{c!.icone} <b>{c!.nome}</b>: {gasto > o.limite ? 'orçamento estourado' : 'perto do limite'} — {brl(gasto)} de {brl(o.limite)}</div>
        </div>
      ))}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-bold mb-2">Gastos por categoria</h2>
          {pizza.length === 0 ? <p className="text-slate-500 text-sm py-10 text-center">Nenhuma despesa neste mês ainda.</p> : (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className="w-44 h-44 shrink-0"><ResponsiveContainer><PieChart><Pie data={pizza} dataKey="valor" nameKey="nome" innerRadius={45} outerRadius={80} paddingAngle={2}>{pizza.map((p) => <Cell key={p.nome} fill={p.cor} />)}</Pie><Tooltip formatter={(v) => brl(Number(v))} /></PieChart></ResponsiveContainer></div>
              <ul className="flex-1 w-full space-y-1.5 text-sm">{pizza.map((p) => <li key={p.nome} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: p.cor }} />{p.icone} {p.nome}<span className="ml-auto font-semibold">{brl(p.valor)}</span><span className="text-slate-400 w-10 text-right">{Math.round((p.valor / desp) * 100)}%</span></li>)}</ul>
            </div>
          )}
        </div>
        <div className="card">
          <h2 className="font-bold mb-2">Evolução (6 meses)</h2>
          <div className="h-52"><ResponsiveContainer><BarChart data={evolucao}><XAxis dataKey="mes" fontSize={12} /><YAxis fontSize={11} width={48} tickFormatter={(v) => ocultos ? "•••" : (v >= 1000 ? `${Math.round(v / 1000)}mil` : v)} /><Tooltip formatter={(v) => brl(Number(v))} /><Legend /><Bar dataKey="Receitas" fill="#10b981" radius={[6, 6, 0, 0]} /><Bar dataKey="Despesas" fill="#f43f5e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </div>
      </div>
      {membros.length > 1 && (
        <div className="card">
          <h2 className="font-bold mb-3">Quem gastou no mês</h2>
          <ul className="space-y-3">{porPessoa.sort((a, b) => b.desp - a.desp).map(({ m, desp: d, rec: r, n }) => (
            <li key={m.userId}><button className="w-full text-left" onClick={() => setPessoa(pessoa === m.userId ? '' : m.userId)}>
              <div className="flex items-center gap-2 text-sm mb-1"><span className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-700/30 text-brand-700 dark:text-brand-100 font-bold flex items-center justify-center text-xs">{m.nome[0]?.toUpperCase()}</span><b>{m.nome}</b><span className="text-slate-400 text-xs">{n} lanç.{r > 0 && ` · recebeu ${brl(r)}`}</span><span className="ml-auto font-semibold">{brl(d)}</span></div>
              <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${pessoa === m.userId ? 'bg-brand-600' : 'bg-rose-400'}`} style={{ width: `${(d / maxPessoa) * 100}%` }} /></div>
            </button></li>))}</ul>
        </div>
      )}
      <div className="card">
        <div className="flex justify-between items-center mb-2"><h2 className="font-bold">Últimos lançamentos</h2><a href="#/lancamentos" className="text-sm text-brand-600 font-semibold">Ver todos</a></div>
        {ultimos.length === 0 ? <p className="text-slate-500 text-sm">Toque em <b>− Despesa</b> ou <b>+ Receita</b> para começar.</p> : ultimos.map((t) => (
          <div key={t.id} className="flex items-center gap-3 py-2 border-b last:border-0 border-slate-100 dark:border-slate-800">
            <span className="text-xl w-9 h-9 rounded-full flex items-center justify-center" style={{ background: (cats.get(t.categoriaId)?.cor ?? '#999') + '33' }}>{cats.get(t.categoriaId)?.icone}</span>
            <div className="flex-1 min-w-0"><div className="font-medium truncate flex items-center gap-1">{t.descricao}{t.parcelaTotal && t.parcelaTotal >= 2 && <span className="text-[10px] font-semibold bg-slate-200 dark:bg-slate-700 rounded px-1.5">{t.parcelaNumero}/{t.parcelaTotal}</span>}</div><div className="text-xs text-slate-500">{dataBR(t.data)}{contas.get(t.contaId) && ` · ${rotuloConta(contas.get(t.contaId)!, membrosMap)}`}{membros.length > 1 && t.userId && ` · lançado por ${membrosMap.get(t.userId)?.nome ?? 'ex-membro'}`}</div></div>
            <b className={t.tipo === 'receita' ? 'text-brand-600' : 'text-rose-600'}>{t.tipo === 'receita' ? '+' : '−'} {brl(t.valor)}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
