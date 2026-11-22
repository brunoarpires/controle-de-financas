import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Upload, Check } from 'lucide-react'
import { db, uuid, salvar, type Tipo, type Transacao } from '../db'
import { useCategorias, useContas } from '../hooks'
import { brl, dataBR, parseDataBR, parseValorBR } from '../utils'
import { normalizar, sugerirCategoria } from '../categorizar'
import { Titulo } from '../components/ui'

type Linha = { ok: boolean; data: string; descricao: string; valor: number; tipo: Tipo; categoriaId?: string; dup: boolean; erro?: string }
const CAMPOS = [['data', 'Data'], ['descricao', 'Descrição'], ['valor', 'Valor'], ['categoria', 'Categoria (opcional)']] as const
type Campo = (typeof CAMPOS)[number][0]
const PISTAS: Record<Campo, RegExp> = { data: /data|date|dia/, descricao: /descri|hist|lancamento|estabelec|memo|nome/, valor: /valor|quantia|montante|amount|r\$/, categoria: /categ/ }

export default function ImportPlanilha() {
  const cats = useCategorias(), contas = useContas()
  const [arquivo, setArquivo] = useState('')
  const [rows, setRows] = useState<any[][]>([])
  const [map, setMap] = useState<Record<Campo, number>>({ data: -1, descricao: -1, valor: -1, categoria: -1 })
  const [modo, setModo] = useState<'sinal' | 'despesa' | 'receita'>('sinal')
  const [contaId, setContaId] = useState<string>()
  const [linhas, setLinhas] = useState<Linha[] | null>(null)
  const [msg, setMsg] = useState('')
  const cab = rows[0] ?? []

  async function abrir(f: File) {
    const buf = await f.arrayBuffer()
    const csv = /\.(csv|txt)$/i.test(f.name)
    let wb: XLSX.WorkBook
    if (csv) {
      let txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('\uFFFD')) txt = new TextDecoder('windows-1252').decode(buf)
      const sep = (txt.split('\n')[0].match(/;/g) ?? []).length > (txt.split('\n')[0].match(/,/g) ?? []).length ? ';' : ','
      wb = XLSX.read(txt, { type: 'string', raw: true, FS: sep } as any)
    } else wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const r = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }).filter((l) => l.some((c) => String(c).trim()))
    const h = (r[0] ?? []).map((x: any) => normalizar(String(x)))
    const m = { data: -1, descricao: -1, valor: -1, categoria: -1 } as Record<Campo, number>
    ;(Object.keys(PISTAS) as Campo[]).forEach((k) => { m[k] = h.findIndex((x: string, i: number) => PISTAS[k].test(x) && !Object.values(m).includes(i)) })
    setArquivo(f.name); setRows(r); setMap(m); setLinhas(null); setMsg('')
    if (!contaId && contas[0]) setContaId(contas[0].id)
  }

  async function preparar() {
    const existentes = await db.transacoes.toArray()
    const chave = (d: string, v: number, s: string) => `${d}|${v.toFixed(2)}|${normalizar(s)}`
    const set = new Set(existentes.map((t) => chave(t.data, t.valor, t.descricao)))
    const out: Linha[] = []
    for (const r of rows.slice(1)) {
      const data = parseDataBR(r[map.data]), v = parseValorBR(r[map.valor]), descricao = String(r[map.descricao] ?? '').trim()
      if (!data || v === null || v === 0) { out.push({ ok: false, data: data ?? '', descricao: descricao || String(r.join(' ')).slice(0, 40), valor: Math.abs(v ?? 0), tipo: 'despesa', dup: false, erro: !data ? 'Data inválida' : 'Valor inválido' }); continue }
      const tipo: Tipo = modo === 'sinal' ? (v < 0 ? 'despesa' : 'receita') : modo
      let categoriaId: string | undefined
      if (map.categoria >= 0 && r[map.categoria]) categoriaId = cats.find((c) => c.tipo === tipo && normalizar(c.nome) === normalizar(String(r[map.categoria])))?.id
      categoriaId ??= await sugerirCategoria(descricao, tipo)
      categoriaId ??= cats.find((c) => c.tipo === tipo && /outr/i.test(c.nome))?.id
      const dup = set.has(chave(data, Math.abs(v), descricao))
      out.push({ ok: !dup, data, descricao, valor: Math.abs(v), tipo, categoriaId, dup })
    }
    setLinhas(out)
  }

  async function confirmar() {
    const sel = linhas!.filter((l) => l.ok && !l.erro && l.categoriaId)
    const agora = Date.now()
    await salvar('transacoes', sel.map((l, i): Transacao => ({ id: uuid(), tipo: l.tipo, valor: l.valor, data: l.data, descricao: l.descricao, categoriaId: l.categoriaId!, contaId: contaId!, criadoEm: agora + i, observacao: `Importado de ${arquivo}` })))
    setMsg(`✅ ${sel.length} lançamento(s) importado(s) com sucesso!`); setLinhas(null); setRows([])
  }
  const upd = (i: number, p: Partial<Linha>) => setLinhas((ls) => ls!.map((l, k) => (k === i ? { ...l, ...p } : l)))
  const nSel = linhas?.filter((l) => l.ok && !l.erro).length ?? 0

  return (
    <div>
      <Titulo>Importar planilha</Titulo>
      {msg && <div className="card mb-4 bg-brand-50 dark:bg-brand-700/20 border-brand-200 flex items-center justify-between"><span>{msg}</span><a href="#/lancamentos" className="text-brand-700 font-semibold">Ver lançamentos</a></div>}
      <div className="card mb-4">
        <h2 className="font-bold mb-1">1. Escolha o arquivo</h2>
        <p className="text-sm text-slate-500 mb-3">CSV (separado por ; ou ,) ou Excel .xlsx. A primeira linha deve ter os nomes das colunas. Valores como <b>1.234,56</b> e datas <b>dd/mm/aaaa</b> são reconhecidos.</p>
        <label className="btn-primary cursor-pointer"><Upload size={18} />{arquivo ? 'Trocar arquivo' : 'Selecionar arquivo'}<input type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && abrir(e.target.files[0])} /></label>
        {arquivo && <span className="ml-3 text-sm">{arquivo} · {rows.length - 1} linhas</span>}
      </div>
      {rows.length > 0 && !linhas && (
        <div className="card mb-4">
          <h2 className="font-bold mb-3">2. Diga o que é cada coluna</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {CAMPOS.map(([k, nome]) => (
              <div key={k}><label className="label">{nome}</label><select className="input" value={map[k]} onChange={(e) => setMap({ ...map, [k]: +e.target.value })}><option value={-1}>—</option>{cab.map((c: any, i: number) => <option key={i} value={i}>{String(c) || `Coluna ${i + 1}`}</option>)}</select></div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-3 mb-4">
            <div><label className="label">Como saber se é receita ou despesa?</label><select className="input" value={modo} onChange={(e) => setModo(e.target.value as any)}><option value="sinal">Valor negativo = despesa, positivo = receita</option><option value="despesa">Todas as linhas são despesas</option><option value="receita">Todas as linhas são receitas</option></select></div>
            <div><label className="label">Conta / cartão</label><select className="input" value={contaId} onChange={(e) => setContaId(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select></div>
          </div>
          <div className="overflow-x-auto mb-4"><table className="text-sm w-full"><thead><tr>{cab.map((c: any, i: number) => <th key={i} className="text-left p-2 bg-slate-100 dark:bg-slate-800 whitespace-nowrap">{String(c)}{Object.entries(map).filter(([, v]) => v === i).map(([k]) => <span key={k} className="ml-1 text-xs bg-brand-600 text-white rounded px-1">{k}</span>)}</th>)}</tr></thead>
            <tbody>{rows.slice(1, 6).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="p-2 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">{c instanceof Date ? c.toLocaleDateString('pt-BR') : String(c)}</td>)}</tr>)}</tbody></table></div>
          <button className="btn-primary" disabled={map.data < 0 || map.valor < 0 || map.descricao < 0} onClick={preparar}>Pré-visualizar</button>
        </div>
      )}
      {linhas && (
        <div className="card">
          <h2 className="font-bold mb-1">3. Confira antes de salvar</h2>
          <p className="text-sm text-slate-500 mb-3">Ajuste a categoria se precisar. Linhas repetidas (já importadas) vêm desmarcadas.</p>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mb-4">
            {linhas.map((l, i) => (
              <div key={i} className={`flex flex-wrap items-center gap-2 py-2 ${l.erro ? 'opacity-50' : ''}`}>
                <input type="checkbox" className="w-5 h-5 accent-emerald-600" disabled={!!l.erro} checked={l.ok && !l.erro} onChange={(e) => upd(i, { ok: e.target.checked })} />
                <span className="text-xs text-slate-500 w-20">{dataBR(l.data)}</span>
                <span className="flex-1 min-w-[8rem] truncate">{l.descricao}{l.dup && <span className="ml-2 text-xs bg-amber-100 text-amber-800 rounded px-1">repetido</span>}{l.erro && <span className="ml-2 text-xs bg-rose-100 text-rose-800 rounded px-1">{l.erro}</span>}</span>
                <select className="input py-1.5 w-auto text-sm" value={l.categoriaId ?? ''} onChange={(e) => upd(i, { categoriaId: e.target.value })}>{cats.filter((c) => c.tipo === l.tipo).map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select>
                <b className={`w-28 text-right ${l.tipo === 'receita' ? 'text-brand-600' : 'text-rose-600'}`}>{l.tipo === 'receita' ? '+' : '−'} {brl(l.valor)}</b>
              </div>
            ))}
          </div>
          <div className="flex gap-2"><button className="btn-ghost" onClick={() => setLinhas(null)}>Voltar</button><button className="btn-primary flex-1" disabled={!nSel} onClick={confirmar}><Check size={18} />Importar {nSel} lançamento(s)</button></div>
        </div>
      )}
    </div>
  )
}
