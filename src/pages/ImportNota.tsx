import { useEffect, useState } from 'react'
import { Camera, ImagePlus, Check, Search, X, Loader2 } from 'lucide-react'
import { uuid, salvar as salvarReg, type ItemNota, type Transacao } from '../db'
import { useCategorias, useContas } from '../hooks'
import { brl, comprimirImagem, formatarCNPJ, hojeISO, parseValorBR, addMeses, dividirParcelas } from '../utils'
import { analisarNota, consultarCNPJ, resumoCNPJ, type DadosNota } from '../nota'
import { rotuloComprovante } from '../comprovante'
import { aprender, sugerirCategoria } from '../categorizar'
import { CampoData, CampoHora, Titulo } from '../components/ui'
import { ir } from '../rota'
import { escolherContaPorPagamento } from '../contaPagamento'
const resumoComprovante = (c: NonNullable<DadosNota['comprovante']>) => [c.favorecido && `${c.natureza === 'receita' ? 'De' : 'Favorecido'}: ${c.favorecido}`, c.documento && `Doc: ${c.documento}`, c.instituicao && `Instituição: ${c.instituicao}`, c.bandeira && `Bandeira: ${c.bandeira}`, c.finalCartao && `Final ${c.finalCartao}`, c.parcelas && c.parcelas >= 2 && `${c.parcelas}x`, c.telefone && `Telefone: ${c.telefone}`, c.bancoPagador && `Pago via: ${c.bancoPagador}`, c.idTransacao && `ID: ${c.idTransacao}`].filter(Boolean).join(' · ')
const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

export default function ImportNota() {
  const todasCats = useCategorias(), contas = useContas()
  const [foto, setFoto] = useState<Blob>()
  const [url, setUrl] = useState('')
  const [etapa, setEtapa] = useState<{ msg: string; p?: number } | null>(null)
  const [d, setD] = useState<DadosNota | null>(null)
  const [valor, setValor] = useState('')
  const [categoriaId, setCategoriaId] = useState<string>()
  const [contaId, setContaId] = useState<string>()
  const [parcelado, setParcelado] = useState(false)
  const [nParcelas, setNParcelas] = useState('2')
  const [obsLivre, setObsLivre] = useState('')
  const [buscandoCnpj, setBuscando] = useState(false)
  useEffect(() => { if (!contaId && contas[0]) setContaId(contas[0].id) }, [contas, contaId])

  async function escolher(f: File) {
    const c = await comprimirImagem(f, 1600, 0.8)
    setFoto(c); setUrl(URL.createObjectURL(c)); setD(null)
    setEtapa({ msg: 'Preparando…' })
    try {
      const r = await analisarNota(f, (msg, p) => setEtapa({ msg, p }))
      r.data ??= hojeISO()
      const comp = r.comprovante
      if (comp || r.pagamento) {
        const c = escolherContaPorPagamento(contas, comp?.pagamento ?? r.pagamento, comp?.bancoPagador, comp?.tipo)
        if (c) setContaId(c.id)
      }
      setD(r); setValor(r.total ? r.total.toFixed(2).replace('.', ',') : '')
      const nat = comp?.natureza ?? 'despesa'
      const catsNat = todasCats.filter((c) => c.tipo === nat)
      const catRecarga = comp?.tipo === 'recarga' ? catsNat.find((c) => /telefon|celular|internet/i.test(sem(c.nome)))?.id : undefined
      if (catRecarga) setCategoriaId(catRecarga)
      else setCategoriaId((await sugerirCategoria(comp ? `${comp.favorecido ?? ''} ${comp.descricao}` : `${r.estabelecimento ?? ''} ${r.razaoSocial ?? ''}`, nat, r.cnae)) ?? catsNat.find((c) => c.nome === 'Outros')?.id)
    } finally { setEtapa(null) }
  }
  async function buscarCNPJ() {
    if (!d?.cnpj) return
    setBuscando(true)
    const r = await consultarCNPJ(d.cnpj); setBuscando(false)
    if (!r) return alert('Não foi possível consultar esse CNPJ agora. Confira o número ou preencha manualmente.')
    const s = resumoCNPJ(r); setD({ ...d, ...s, cnpj: formatarCNPJ(d.cnpj) })
    const cat = await sugerirCategoria(`${s.estabelecimento} ${s.razaoSocial}`, 'despesa', s.cnae); if (cat) setCategoriaId(cat)
  }
  const set = (p: Partial<DadosNota>) => setD({ ...d!, ...p })
  const setItem = (i: number, p: Partial<ItemNota>) => set({ itens: d!.itens.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const v = parseValorBR(valor)
  const somaItens = d?.itens.reduce((s, i) => s + (i.valor ?? 0), 0) ?? 0
  const natureza = d?.comprovante?.natureza ?? 'despesa'
  const cats = todasCats.filter((c) => c.tipo === natureza)

  const nParc = Math.max(0, Math.min(48, Math.floor(Number(String(nParcelas).replace(/\D/g, '')) || 0)))
  const querParcelar = natureza === 'despesa' && parcelado && nParc >= 2

  async function salvar() {
    if (!d || !v || !categoriaId || !contaId) return
    if (parcelado && nParc < 2) return
    const descricao = d.estabelecimento?.trim() || 'Compra (nota fiscal)'
    const fotoComp = foto && (await comprimirImagem(foto, 1280, 0.6))
    const nota = { cnpj: d.cnpj, chave: d.chave, url: d.url, estabelecimento: d.estabelecimento, razaoSocial: d.razaoSocial, endereco: d.endereco, cnae: d.cnae, itens: d.itens, comprovante: d.comprovante }
    const obsComp = d.comprovante ? resumoComprovante(d.comprovante) : undefined
    const obs = [obsLivre.trim(), obsComp].filter(Boolean).join(' · ') || undefined
    if (querParcelar) {
      const grupo = uuid()
      const vals = dividirParcelas(Math.abs(v), nParc)
      const agora = Date.now()
      const rows: Transacao[] = vals.map((valorParc, i) => ({
        id: uuid(), tipo: natureza, valor: valorParc, data: addMeses(d.data!, i),
        hora: i === 0 ? (d.hora || undefined) : undefined,
        descricao, categoriaId, contaId, foto: i === 0 ? fotoComp || undefined : undefined,
        criadoEm: agora + i, nota: i === 0 ? nota : undefined, observacao: i === 0 ? obs : undefined,
        parcelaGrupoId: grupo, parcelaNumero: i + 1, parcelaTotal: nParc,
      }))
      await salvarReg('transacoes', rows)
    } else {
      await salvarReg('transacoes', { id: uuid(), tipo: natureza, valor: Math.abs(v), data: d.data!, hora: d.hora || undefined, descricao, categoriaId, contaId, foto: fotoComp || undefined, criadoEm: Date.now(), nota, observacao: obs })
    }
    await aprender(descricao, categoriaId)
    ir('/lancamentos')
  }

  return (
    <div>
      <Titulo>Foto da nota fiscal</Titulo>
      {!foto && (
        <div className="card text-center py-10">
          <Camera size={48} className="mx-auto text-brand-600 mb-3" />
          <p className="mb-1 font-semibold">Fotografe o cupom inteiro, bem iluminado e reto.</p>
          <p className="text-sm text-slate-500 mb-6">Se a nota tiver QR Code, deixe ele aparecendo: assim a leitura fica bem mais precisa.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <label className="btn-primary py-4 text-lg cursor-pointer"><Camera />Tirar foto<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])} /></label>
            <label className="btn-ghost py-4 text-lg cursor-pointer"><ImagePlus />Escolher da galeria<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && escolher(e.target.files[0])} /></label>
          </div>
        </div>
      )}
      {foto && (
        <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4 items-start">
          <div className="card p-2 md:sticky md:top-4"><img src={url} alt="Nota fiscal" className="rounded-xl w-full max-h-[70vh] object-contain" />
            <button className="btn-ghost w-full mt-2 text-sm" onClick={() => { setFoto(undefined); setD(null) }}>Usar outra foto</button></div>
          {etapa && (
            <div className="card text-center py-10"><Loader2 className="animate-spin mx-auto text-brand-600 mb-3" size={36} /><p className="font-semibold">{etapa.msg}</p>
              {etapa.p !== undefined && <div className="h-2 bg-slate-200 dark:bg-slate-800 rounded-full mt-3 overflow-hidden"><div className="h-full bg-brand-500" style={{ width: `${Math.round(etapa.p * 100)}%` }} /></div>}
              <p className="text-xs text-slate-500 mt-3">Na primeira vez o app baixa o leitor de texto (~2 MB). Depois funciona mais rápido.</p></div>
          )}
          {d && (
            <div className="card space-y-3">
              <div><h2 className="font-bold text-lg">Confira os dados</h2>
                <p className="text-xs text-slate-500">Lido via: {d.fontes.join(' + ') || 'nada encontrado — preencha manualmente'}. Corrija o que estiver errado e toque em Salvar.</p></div>
              {d.comprovante && <div className="rounded-xl bg-brand-50 dark:bg-slate-800 p-3 text-sm"><b>Comprovante ({ rotuloComprovante(d.comprovante.tipo) })</b><p className="text-xs text-slate-500 mt-1">{resumoComprovante(d.comprovante) || 'Confira os dados abaixo.'}</p></div>}
              <div><label className="label">{d.comprovante ? 'Descrição' : 'Estabelecimento'}</label><input className="input" value={d.estabelecimento ?? ''} onChange={(e) => set({ estabelecimento: e.target.value })} /></div>
              {!d.comprovante && <div><label className="label">Razão social</label><input className="input" value={d.razaoSocial ?? ''} onChange={(e) => set({ razaoSocial: e.target.value })} placeholder="Opcional" /></div>}
              {!d.comprovante && <div><label className="label">CNPJ</label><div className="flex gap-2"><input className="input" inputMode="numeric" value={d.cnpj ?? ''} onChange={(e) => set({ cnpj: e.target.value })} placeholder="00.000.000/0000-00" /><button className="btn-ghost" onClick={buscarCNPJ} disabled={!d.cnpj || buscandoCnpj}>{buscandoCnpj ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}Buscar</button></div></div>}
              <div><label className="label">Endereço</label><input className="input" value={d.endereco ?? ''} onChange={(e) => set({ endereco: e.target.value })} placeholder="Opcional" /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Data</label><CampoData value={d.data ?? ''} onChange={(data) => set({ data })} /></div>
                <div><label className="label">Horário</label><CampoHora value={d.hora ?? ''} onChange={(hora) => set({ hora })} optional /></div>
                <div className="sm:col-span-2"><label className="label">Total</label><div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">R$</span><input inputMode="decimal" className="input pl-10 font-bold text-lg" value={valor} onChange={(e) => setValor(e.target.value)} /></div></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Categoria</label><select className="input" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select></div>
                <div><label className="label">Pago com</label><select className="input" value={contaId} onChange={(e) => setContaId(e.target.value)}>{contas.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select></div>
              </div>
              {natureza === 'despesa' && <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
                <label className="flex items-center gap-3 text-sm font-medium">
                  <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} />
                  Parcelado
                </label>
                {parcelado && (
                  <div>
                    <label className="label">Número de parcelas</label>
                    <input inputMode="numeric" className="input" value={nParcelas}
                      onChange={(e) => setNParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))}
                      onBlur={() => { if (nParc < 2) setNParcelas('2'); if (nParc > 48) setNParcelas('48') }} />
                    {querParcelar && v && v > 0 && <p className="text-xs text-slate-500 mt-1">{nParc}× de R$ {dividirParcelas(Math.abs(v), nParc)[0].toFixed(2).replace('.', ',')}</p>}
                  </div>
                )}
              </div>}
              <div><label className="label">Observação (opcional)</label><textarea className="input min-h-[4rem] resize-y" rows={2} value={obsLivre} onChange={(e) => setObsLivre(e.target.value)} placeholder="Anotação livre sobre este lançamento" /></div>
              {!d.comprovante && <div><label className="label">Chave de acesso</label><input className="input font-mono text-xs" value={d.chave ?? ''} onChange={(e) => set({ chave: e.target.value.replace(/\s/g, '') })} placeholder="44 dígitos (opcional)" /></div>}
              {d.itens.length > 0 && (
                <details open={d.itens.length <= 8}><summary className="cursor-pointer font-semibold text-sm">{d.itens.length} itens encontrados {somaItens > 0 && <span className="font-normal text-slate-500">(soma {brl(somaItens)})</span>}</summary>
                  <div className="mt-2 space-y-1">{d.itens.map((it, i) => (
                    <div key={i} className="flex gap-2 items-center"><input className="input py-1.5 text-sm" value={it.descricao} onChange={(e) => setItem(i, { descricao: e.target.value })} /><input className="input py-1.5 text-sm w-20 shrink-0 text-right" inputMode="decimal" value={it.valor != null ? it.valor.toFixed(2).replace('.', ',') : ''} onChange={(e) => setItem(i, { valor: parseValorBR(e.target.value) })} /><button className="p-1 text-slate-400" onClick={() => set({ itens: d.itens.filter((_, k) => k !== i) })} aria-label="Remover item"><X size={16} /></button></div>
                  ))}</div></details>
              )}
              {d.url && <a className="text-xs text-brand-600 underline break-all" href={d.url} target="_blank" rel="noreferrer">Abrir nota no site da Sefaz</a>}
              <button className="btn-primary w-full py-3.5 text-lg" disabled={!v || !categoriaId || !d.data || (natureza === 'despesa' && parcelado && nParc < 2)} onClick={salvar}><Check />{querParcelar ? `Salvar ${nParc} parcelas` : natureza === 'receita' ? 'Salvar receita' : 'Salvar despesa'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
