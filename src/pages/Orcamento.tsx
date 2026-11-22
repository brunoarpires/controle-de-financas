import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db, salvar as salvarReg, excluir } from '../db'
import { useCategorias } from '../hooks'
import { brl, mesAtual, nomeMes, parseValorBR } from '../utils'
import { SeletorMes, Titulo } from '../components/ui'
import { useSessao, podeAdministrar } from '../sessao'

export default function Orcamento() {
  const [mes, setMes] = useState(mesAtual())
  useSessao()
  const adm = podeAdministrar()
  const cats = useCategorias().filter((c) => c.tipo === 'despesa')
  const orcs = new Map((useLiveQuery(() => db.orcamentos.toArray(), []) ?? []).map((o) => [o.categoriaId, o.limite]))
  const trans = useLiveQuery(() => db.transacoes.where('data').startsWith(mes).toArray(), [mes]) ?? []
  const gasto = (id: string) => trans.filter((t) => t.tipo === 'despesa' && t.categoriaId === id).reduce((s, t) => s + t.valor, 0)
  const totalLim = [...orcs.values()].reduce((a, b) => a + b, 0)
  const totalG = cats.filter((c) => orcs.get(c.id!)).reduce((s, c) => s + gasto(c.id!), 0)
  const salvar = async (id: string, txt: string) => { const v = parseValorBR(txt); if (v && v > 0) await salvarReg('orcamentos', { categoriaId: id, limite: v }); else if (orcs.has(id)) await excluir('orcamentos', id) }

  return (
    <div>
      <Titulo extra={<SeletorMes mes={mes} setMes={setMes} rotulo={nomeMes(mes)} />}>Orçamento</Titulo>
      <p className="text-slate-500 mb-4 text-sm">Defina quanto quer gastar por mês em cada categoria. Você recebe um alerta no início quando chegar a 80% do limite.{!adm && <b> Só administradores do perfil alteram os limites.</b>}</p>
      {totalLim > 0 && <div className="card mb-4"><div className="flex justify-between mb-2"><b>Total planejado</b><span>{brl(totalG)} de {brl(totalLim)}</span></div><Barra p={totalG / totalLim} /></div>}
      <div className="grid md:grid-cols-2 gap-3">
        {cats.map((c) => { const lim = orcs.get(c.id!) ?? 0, g = gasto(c.id!), p = lim ? g / lim : 0; return (
          <div key={c.id} className="card">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c.cor + '33' }}>{c.icone}</span>
              <div className="flex-1"><div className="font-semibold">{c.nome}</div><div className="text-xs text-slate-500">Gasto: {brl(g)}{lim ? ` · ${lim - g >= 0 ? 'resta ' + brl(lim - g) : 'passou ' + brl(g - lim)}` : ''}</div></div>
              <div className="relative w-32"><span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span><input inputMode="decimal" className="input pl-7 py-2 text-right" placeholder="Sem limite" disabled={!adm} defaultValue={lim ? lim.toFixed(2).replace('.', ',') : ''} key={lim} onBlur={(e) => salvar(c.id!, e.target.value)} /></div>
            </div>
            {lim > 0 && <><Barra p={p} />{p >= 1 ? <p className="text-xs text-rose-600 mt-1 font-semibold">⚠️ Orçamento estourado</p> : p >= 0.8 ? <p className="text-xs text-amber-600 mt-1 font-semibold">⚠️ Atenção: {Math.round(p * 100)}% usado</p> : null}</>}
          </div>) })}
      </div>
    </div>
  )
}
const Barra = ({ p }: { p: number }) => (
  <div className="h-3 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className={`h-full rounded-full ${p >= 1 ? 'bg-rose-500' : p >= 0.8 ? 'bg-amber-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, p * 100)}%` }} /></div>
)
