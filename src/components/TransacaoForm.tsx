import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2, Camera, X } from 'lucide-react'
import { uuid, salvar as salvarReg, excluir as excluirReg, db, type Tipo, type Transacao, type NotaInfo, type ItemNota } from '../db'
import { useCategorias, useContas } from '../hooks'
import { hojeISO, parseValorBR, comprimirImagem, addMeses, dividirParcelas, formatarCNPJ } from '../utils'
import { sugerirCategoria, aprender } from '../categorizar'
import { CampoData, CampoHora, Modal } from './ui'
import { modoNuvem } from '../supabase'
import { podeEditar } from '../sessao'
import { urlFoto } from '../sync'
import { useMembros } from '../hooks'

export default function TransacaoForm({ tipoInicial = 'despesa', transacao, onFechar }: { tipoInicial?: Tipo; transacao?: Transacao; onFechar: () => void }) {
  const cats = useCategorias(), contas = useContas()
  const [tipo, setTipo] = useState<Tipo>(transacao?.tipo ?? tipoInicial)
  const [valor, setValor] = useState(transacao ? transacao.valor.toFixed(2).replace('.', ',') : '')
  const [descricao, setDescricao] = useState(transacao?.descricao ?? '')
  const [data, setData] = useState(transacao?.data ?? hojeISO())
  const [categoriaId, setCategoriaId] = useState<string | undefined>(transacao?.categoriaId)
  const [contaId, setContaId] = useState<string | undefined>(transacao?.contaId)
  const [hora, setHora] = useState((transacao?.hora ?? '').slice(0, 5))
  const [obs, setObs] = useState(transacao?.observacao ?? '')
  const [nota, setNota] = useState<NotaInfo | undefined>(transacao?.nota ? { ...transacao.nota, itens: transacao.nota.itens?.map((i) => ({ ...i })) } : undefined)
  const [foto, setFoto] = useState<Blob | undefined>(transacao?.foto)
  const [tocouCategoria, setTocou] = useState(!!transacao)
  const catsTipo = cats.filter((c) => c.tipo === tipo)
  const [fotoPath, setFotoPath] = useState(transacao?.fotoPath)
  const blobUrl = useMemo(() => (foto ? URL.createObjectURL(foto) : ''), [foto])
  const [nuvemUrl, setNuvemUrl] = useState('')
  useEffect(() => { if (!foto && fotoPath && modoNuvem) urlFoto(fotoPath).then(setNuvemUrl).catch(() => {}) }, [foto, fotoPath])
  const fotoUrl = blobUrl || (fotoPath ? nuvemUrl : '')
  const temFoto = !!foto || !!fotoPath
  const membros = useMembros()
  const autor = transacao?.userId ? membros.get(transacao.userId) : undefined
  const editavel = podeEditar(transacao)

  const jaParcelado = !!(transacao?.parcelaTotal && transacao.parcelaTotal >= 2)
  const [parcelado, setParcelado] = useState(false)
  const [nParcelas, setNParcelas] = useState('2')

  const inicial = useMemo(() => ({
    tipo: transacao?.tipo ?? tipoInicial,
    valor: transacao ? transacao.valor.toFixed(2).replace('.', ',') : '',
    descricao: transacao?.descricao ?? '',
    data: transacao?.data ?? hojeISO(),
    categoriaId: transacao?.categoriaId,
    contaId: transacao?.contaId,
    hora: transacao?.hora ?? '',
    obs: transacao?.observacao ?? '',
    nota: JSON.stringify(transacao?.nota ?? null),
    fotoPath: transacao?.fotoPath,
  }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const sujo = editavel && (
    tipo !== inicial.tipo || valor !== inicial.valor || descricao !== inicial.descricao || data !== inicial.data ||
    categoriaId !== inicial.categoriaId || (contaId ?? '') !== (inicial.contaId ?? '') || hora !== inicial.hora ||
    obs !== inicial.obs || JSON.stringify(nota ?? null) !== inicial.nota ||
    foto !== transacao?.foto || fotoPath !== inicial.fotoPath || parcelado
  )

  useEffect(() => { if (!contaId && contas[0]) setContaId(contas[0].id) }, [contas, contaId])
  const tipoAnt = useRef(tipo)
  useEffect(() => {
    // Só limpa ao TROCAR o tipo. No mount as categorias ainda podem estar vazias e
    // apagar a categoria deixava o Salvar permanentemente desabilitado.
    if (tipoAnt.current === tipo) return
    tipoAnt.current = tipo
    if (categoriaId && catsTipo.length > 0 && !catsTipo.some((c) => c.id === categoriaId)) setCategoriaId(undefined)
  }, [tipo, catsTipo, categoriaId])
  useEffect(() => {
    // Recompõe categoria/conta se um wipe anterior as tirou e os dados já carregaram
    if (!categoriaId && transacao?.categoriaId && transacao.tipo === tipo && catsTipo.some((c) => c.id === transacao.categoriaId)) {
      setCategoriaId(transacao.categoriaId)
    }
    if (!contaId && transacao?.contaId && contas.some((c) => c.id === transacao.contaId)) {
      setContaId(transacao.contaId)
    }
  }, [catsTipo, contas, categoriaId, contaId, transacao, tipo])
  useEffect(() => {
    if (tocouCategoria || descricao.length < 3) return
    const t = setTimeout(async () => { const s = await sugerirCategoria(descricao, tipo); if (s) setCategoriaId(s) }, 300)
    return () => clearTimeout(t)
  }, [descricao, tipo, tocouCategoria])

  const v = parseValorBR(valor)
  const nParc = Math.max(0, Math.min(48, Math.floor(Number(String(nParcelas).replace(/\D/g, '')) || 0)))
  const querParcelar = !transacao && parcelado && nParc >= 2
  const parcelasPreview = querParcelar && v && v > 0 ? dividirParcelas(v, nParc) : []
  // Fallback: se o efeito antigo/wipe tirou a categoria, usa a do lançamento enquanto o tipo for o mesmo
  const catEfetiva = categoriaId || (transacao && transacao.tipo === tipo ? transacao.categoriaId : undefined)
  const contaEfetiva = contaId || (transacao ? transacao.contaId : undefined)
  const ok = !!(v && v > 0 && catEfetiva && contaEfetiva && data && (!parcelado || !!transacao || nParc >= 2))

  function setNotaCampo<K extends keyof NotaInfo>(k: K, val: NotaInfo[K]) {
    setNota((n) => ({ ...(n ?? {}), [k]: val }))
  }
  function setItem(i: number, p: Partial<ItemNota>) {
    setNota((n) => {
      const itens = [...(n?.itens ?? [])]
      itens[i] = { ...itens[i], ...p }
      return { ...(n ?? {}), itens }
    })
  }
  function tentarFechar() {
    if (sujo && !confirm('Descartar as alterações?')) return
    onFechar()
  }

  async function salvar() {
    if (!ok) return
    const descBase = descricao.trim() || nota?.estabelecimento?.trim() || catsTipo.find((c) => c.id === catEfetiva)?.nome || ''
    const obsFinal = obs.trim() || undefined
    const notaFinal = nota && (nota.estabelecimento || nota.cnpj || nota.chave || nota.endereco || nota.razaoSocial || nota.url || nota.itens?.length || nota.comprovante)
      ? {
          ...nota,
          estabelecimento: nota.estabelecimento?.trim() || undefined,
          razaoSocial: nota.razaoSocial?.trim() || undefined,
          endereco: nota.endereco?.trim() || undefined,
          cnpj: nota.cnpj?.trim() || undefined,
          chave: nota.chave?.replace(/\s/g, '') || undefined,
          itens: nota.itens?.filter((i) => i.descricao.trim() || i.valor != null) ?? [],
        }
      : undefined
    if (querParcelar) {
      const grupo = uuid()
      const vals = dividirParcelas(v!, nParc)
      const agora = Date.now()
      const rows: Transacao[] = vals.map((valorParc, i) => ({
        id: uuid(), tipo, valor: valorParc, descricao: descBase, data: addMeses(data, i),
        hora: i === 0 ? (hora || undefined) : undefined,
        categoriaId: catEfetiva!, contaId: contaEfetiva!, observacao: i === 0 ? obsFinal : undefined,
        foto: i === 0 ? foto : undefined, fotoPath: i === 0 ? fotoPath : undefined,
        nota: i === 0 ? notaFinal : undefined,
        criadoEm: agora + i,
        parcelaGrupoId: grupo, parcelaNumero: i + 1, parcelaTotal: nParc,
      }))
      await salvarReg('transacoes', rows)
      if (descricao.trim()) await aprender(descricao, catEfetiva!)
      onFechar()
      return
    }
    const t: Transacao = {
      id: transacao?.id ?? uuid(),
      tipo, valor: Math.abs(v!), descricao: descBase, data, hora: hora || undefined,
      categoriaId: catEfetiva!, contaId: contaEfetiva!,
      observacao: obsFinal,
      foto, fotoPath, nota: notaFinal,
      userId: transacao?.userId,
      criadoEm: transacao?.criadoEm ?? Date.now(),
      parcelaGrupoId: transacao?.parcelaGrupoId, parcelaNumero: transacao?.parcelaNumero, parcelaTotal: transacao?.parcelaTotal,
    }
    await salvarReg('transacoes', t)
    if (descricao.trim()) await aprender(descricao, catEfetiva!)
    onFechar()
  }

  async function excluir() {
    if (!transacao?.id) return
    if (jaParcelado && transacao.parcelaGrupoId) {
      const resto = (await db.transacoes.where('parcelaGrupoId').equals(transacao.parcelaGrupoId).toArray())
        .filter((x) => x.id !== transacao.id && (x.parcelaNumero ?? 0) >= (transacao.parcelaNumero ?? 0))
        .sort((a, b) => (a.parcelaNumero ?? 0) - (b.parcelaNumero ?? 0))
      if (resto.length) {
        const todas = confirm(`Esta é a parcela ${transacao.parcelaNumero}/${transacao.parcelaTotal}.\n\nOK = excluir esta e as próximas (${resto.length + 1})\nCancelar = só esta parcela`)
        if (todas) {
          if (!confirm(`Excluir ${resto.length + 1} parcela(s)?`)) return
          await excluirReg('transacoes', transacao.id)
          for (const r of resto) await excluirReg('transacoes', r.id)
          onFechar()
          return
        }
      }
    }
    if (!confirm('Excluir este lançamento?')) return
    await excluirReg('transacoes', transacao.id)
    onFechar()
  }

  return (
    <Modal titulo={transacao ? 'Editar lançamento' : 'Novo lançamento'} onFechar={tentarFechar} footer={editavel ? (
        <div className="flex gap-2">
          {transacao && <button type="button" className="btn-danger" onClick={excluir} aria-label="Excluir"><Trash2 size={18} /></button>}
          <button type="button" className="btn-primary flex-1 py-3.5 text-lg" disabled={!ok} onClick={() => { void salvar() }}>{querParcelar ? `Salvar ${nParc} parcelas` : 'Salvar'}</button>
        </div>
      ) : undefined}>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(['despesa', 'receita'] as Tipo[]).map((t) => (
          <button key={t} type="button" onClick={() => setTipo(t)} className={`btn py-3 text-base ${tipo === t ? (t === 'despesa' ? 'bg-rose-600 text-white' : 'bg-brand-600 text-white') : 'bg-slate-100 dark:bg-slate-800'}`}>{t === 'despesa' ? '− Despesa' : '+ Receita'}</button>
        ))}
      </div>
      <label className="label">{querParcelar ? 'Valor total' : 'Valor'}</label>
      <div className="relative mb-4"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-slate-400">R$</span>
        <input autoFocus={!transacao} inputMode="decimal" placeholder="0,00" className="input text-3xl font-bold pl-14 py-4" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ''))} disabled={!editavel} /></div>
      <label className="label">Descrição</label>
      <input className="input mb-4" placeholder="Ex.: Supermercado, Uber, Salário…" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!editavel} />
      <label className="label">Categoria</label>
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 mb-4">
        {catsTipo.map((c) => (
          <button key={c.id} type="button" disabled={!editavel} onClick={() => { setCategoriaId(c.id); setTocou(true) }} className={`flex flex-col items-center gap-1 rounded-xl p-2 text-xs border-2 transition ${categoriaId === c.id ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/20' : 'border-transparent bg-slate-100 dark:bg-slate-800'}`}>
            <span className="text-2xl w-10 h-10 rounded-full flex items-center justify-center" style={{ background: c.cor + '33' }}>{c.icone}</span><span className="truncate w-full text-center">{c.nome}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        <div><label className="label">Data{querParcelar ? ' da 1ª' : ''}</label><CampoData value={data} onChange={setData} disabled={!editavel} /></div>
        <div><label className="label">Horário (opcional)</label><CampoHora value={hora} onChange={setHora} disabled={!editavel} optional /></div>
        <div className="sm:col-span-2"><label className="label">Conta / cartão</label><select className="input" value={contaId} onChange={(e) => setContaId(e.target.value)} disabled={!editavel}>{contas.map((c) => <option key={c.id} value={c.id}>{c.icone} {c.nome}</option>)}</select></div>
      </div>

      {!transacao && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-4 space-y-3">
          <label className="flex items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="w-5 h-5 accent-emerald-600" checked={parcelado} onChange={(e) => setParcelado(e.target.checked)} />
            Parcelado
          </label>
          {parcelado && (
            <>
              <div>
                <label className="label">Número de parcelas</label>
                <input inputMode="numeric" className="input" value={nParcelas}
                  onChange={(e) => setNParcelas(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  onBlur={() => { if (nParc < 2) setNParcelas('2'); if (nParc > 48) setNParcelas('48') }} />
                <p className="text-xs text-slate-500 mt-1">De 2 a 48. Uma parcela por mês, a partir da data acima.</p>
              </div>
              {parcelasPreview.length > 0 && (
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {nParc}× de <b>R$ {parcelasPreview[0].toFixed(2).replace('.', ',')}</b>
                  {parcelasPreview[0] !== parcelasPreview[nParc - 1] && <> (última R$ {parcelasPreview[nParc - 1].toFixed(2).replace('.', ',')})</>}
                  {' · '}até {addMeses(data, nParc - 1).split('-').reverse().join('/')}
                </p>
              )}
              {parcelado && nParc < 2 && <p className="text-xs text-rose-600">Mínimo 2 parcelas.</p>}
            </>
          )}
        </div>
      )}

      {jaParcelado && (
        <div className="text-sm rounded-xl bg-slate-100 dark:bg-slate-800 p-3 mb-4">
          Parcela <b>{transacao!.parcelaNumero}/{transacao!.parcelaTotal}</b> — ao salvar, só esta muda. Para excluir várias, use a lixeira.
        </div>
      )}

      <label className="label">Observação (opcional)</label>
      <textarea className="input mb-4 min-h-[4.5rem] resize-y" rows={3} placeholder="Anotação livre sobre este lançamento"
        value={obs} onChange={(e) => setObs(e.target.value)} disabled={!editavel} />

      {nota !== undefined && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 mb-4 space-y-3">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">Dados da nota / comprovante</div>
          <div>
            <label className="label">Estabelecimento</label>
            <input className="input" value={nota?.estabelecimento ?? ''} disabled={!editavel}
              onChange={(e) => {
                const v = e.target.value
                setNotaCampo('estabelecimento', v)
                if (!descricao || descricao === (transacao?.nota?.estabelecimento ?? transacao?.descricao)) setDescricao(v)
              }}
              placeholder="Nome da loja" />
          </div>
          <div>
            <label className="label">Razão social</label>
            <input className="input" value={nota?.razaoSocial ?? ''} disabled={!editavel}
              onChange={(e) => setNotaCampo('razaoSocial', e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input className="input" inputMode="numeric" value={nota?.cnpj ?? ''} disabled={!editavel}
              onChange={(e) => setNotaCampo('cnpj', e.target.value)}
              onBlur={() => { if (nota?.cnpj) setNotaCampo('cnpj', formatarCNPJ(nota.cnpj)) }}
              placeholder="00.000.000/0000-00" />
          </div>
          <div>
            <label className="label">Endereço</label>
            <input className="input" value={nota?.endereco ?? ''} disabled={!editavel}
              onChange={(e) => setNotaCampo('endereco', e.target.value)} placeholder="Opcional" />
          </div>
          <div>
            <label className="label">Chave de acesso</label>
            <input className="input font-mono text-xs" value={nota?.chave ?? ''} disabled={!editavel}
              onChange={(e) => setNotaCampo('chave', e.target.value.replace(/\s/g, ''))} placeholder="44 dígitos (opcional)" />
          </div>
          {nota?.url && <a className="text-sm text-brand-600 underline break-all" href={nota.url} target="_blank" rel="noreferrer">Ver nota na Sefaz</a>}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0">Itens</label>
              {editavel && <button type="button" className="text-xs text-brand-600 font-semibold" onClick={() => setNotaCampo('itens', [...(nota?.itens ?? []), { descricao: '', valor: null }])}>+ item</button>}
            </div>
            {(nota?.itens?.length ?? 0) === 0 && <p className="text-xs text-slate-500">Nenhum item.</p>}
            <div className="space-y-1">
              {(nota?.itens ?? []).map((it, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <input className="input py-1.5 text-sm" value={it.descricao} disabled={!editavel}
                    onChange={(e) => setItem(i, { descricao: e.target.value })} placeholder="Item" />
                  <input className="input py-1.5 text-sm w-24 shrink-0 text-right" inputMode="decimal" disabled={!editavel}
                    value={it.valor != null ? String(it.valor).replace('.', ',') : ''}
                    onChange={(e) => setItem(i, { valor: parseValorBR(e.target.value) })} placeholder="0,00" />
                  {editavel && <button type="button" className="p-1 text-slate-400" aria-label="Remover item"
                    onClick={() => setNotaCampo('itens', (nota?.itens ?? []).filter((_, k) => k !== i))}><X size={16} /></button>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 mb-5">
        {fotoUrl && <a href={fotoUrl} target="_blank" rel="noreferrer"><img src={fotoUrl} className="w-16 h-16 object-cover rounded-xl" alt="Comprovante" /></a>}
        {editavel && <label className="btn-ghost cursor-pointer text-sm"><Camera size={18} />{temFoto ? 'Trocar foto' : 'Anexar foto'}
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setFoto(await comprimirImagem(f)); setFotoPath(undefined) } }} /></label>}
        {editavel && temFoto && <button type="button" className="text-sm text-rose-600" onClick={() => { setFoto(undefined); setFotoPath(undefined) }}>Remover</button>}
      </div>
      {modoNuvem && transacao && <p className="text-xs text-slate-500 mb-1">Lançado por <b>{autor?.nome ?? 'ex-membro'}</b>{!editavel && ' — só essa pessoa ou um administrador pode alterar.'}</p>}
    </Modal>
  )
}
