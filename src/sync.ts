import { db as dbAtivo, getMeta, setMeta, definirAoEscrever, type Tabela, type Membro, type BD } from './db'
import { supabase } from './supabase'

/* Mapeamento entre o cache local (camelCase) e as tabelas do Supabase (snake_case). */
const SRV: Record<Tabela, { tabela: string; conflito: string; pk: string }> = {
  transacoes: { tabela: 'lancamentos', conflito: 'id', pk: 'id' },
  categorias: { tabela: 'categorias', conflito: 'id', pk: 'id' },
  contas: { tabela: 'contas', conflito: 'id', pk: 'id' },
  orcamentos: { tabela: 'orcamentos', conflito: 'familia_id,categoria_id', pk: 'categoria_id' },
  regras: { tabela: 'regras_categoria', conflito: 'familia_id,palavra', pk: 'palavra' },
}
function paraServidor(t: Tabela, r: any, familia_id: string): any {
  switch (t) {
    case 'transacoes': return { id: r.id, familia_id, tipo: r.tipo, valor: r.valor, data: r.data, descricao: r.descricao ?? '', categoria_id: r.categoriaId ?? null, conta_id: r.contaId ?? null,
      observacao: (typeof r.observacao === 'string' ? r.observacao.trim() : r.observacao) || null, hora: r.hora || null, foto_path: r.fotoPath ?? null, nota: r.nota ?? null,
      parcela_grupo_id: r.parcelaGrupoId ?? null, parcela_numero: r.parcelaNumero ?? null, parcela_total: r.parcelaTotal ?? null,
      criado_em: new Date(r.criadoEm ?? Date.now()).toISOString(), excluido: false }
    case 'categorias': return { id: r.id, familia_id, nome: r.nome, icone: r.icone, cor: r.cor, tipo: r.tipo, excluido: false }
    case 'contas': return { id: r.id, familia_id, nome: r.nome, tipo: r.tipo, icone: r.icone, titular_id: r.tipo === 'vr_ticket' ? (r.titularId ?? null) : null, excluido: false }
    case 'orcamentos': return { familia_id, categoria_id: r.categoriaId, limite: r.limite, excluido: false }
    case 'regras': return { familia_id, palavra: r.palavra, categoria_id: r.categoriaId, peso: r.peso, excluido: false }
  }
}
function deServidor(t: Tabela, r: any): any {
  switch (t) {
    case 'transacoes': return { id: r.id, tipo: r.tipo, valor: Number(r.valor), data: r.data, descricao: r.descricao, categoriaId: r.categoria_id ?? '', contaId: r.conta_id ?? '',
      userId: r.user_id, observacao: r.observacao ?? undefined, hora: r.hora ? String(r.hora).slice(0, 5) : undefined, fotoPath: r.foto_path ?? undefined, nota: r.nota ?? undefined, criadoEm: Date.parse(r.criado_em),
      parcelaGrupoId: r.parcela_grupo_id ?? undefined, parcelaNumero: r.parcela_numero ?? undefined, parcelaTotal: r.parcela_total ?? undefined }
    case 'categorias': return { id: r.id, nome: r.nome, icone: r.icone, cor: r.cor, tipo: r.tipo }
    case 'contas': return { id: r.id, nome: r.nome, tipo: r.tipo, icone: r.icone, titularId: r.titular_id ?? undefined }
    case 'orcamentos': return { categoriaId: r.categoria_id, limite: Number(r.limite) }
    case 'regras': return { palavra: r.palavra, categoriaId: r.categoria_id, peso: r.peso }
  }
}

/* ---------- Estado observável (para o indicador de sincronização) ---------- */
export interface EstadoSync { online: boolean; sincronizando: boolean; pendentes: number; ultimo?: number; erro?: string }
let estado: EstadoSync = { online: typeof navigator === 'undefined' ? true : navigator.onLine, sincronizando: false, pendentes: 0 }
const ouvintes = new Set<() => void>()
const emitir = (p: Partial<EstadoSync>) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()) }
export const syncAssinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export const syncEstado = () => estado

let familiaAtual: string | null = null
let rodando: Promise<void> | null = null
let deNovo = false
let timer: any, intervalo: any, canal: any

const ehErroDeRede = (e: any) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(String(e?.message ?? e))

/** Envia a fila de alterações locais. Alterações recusadas pelo servidor (ex.: sem permissão) são descartadas e o dado volta ao que está na nuvem. */
async function enviar(fam: string, db: BD) {
  const fila = await db.pendentes.orderBy('ts').toArray()
  for (const p of fila) {
    const cfg = SRV[p.tabela]
    let erro: any = null
    if (p.op === 'del') {
      const q = supabase!.from(cfg.tabela).update({ excluido: true }).eq('familia_id', fam).eq(cfg.pk, p.id)
      erro = (await q).error
    } else {
      const row: any = await db.table(p.tabela).get(p.id)
      if (!row) { await db.pendentes.delete(p.chave); continue }
      if (p.tabela === 'transacoes' && row.foto && !row.fotoPath) {
        const caminho = `${fam}/${row.id}.jpg`
        const up = await supabase!.storage.from('notas').upload(caminho, row.foto, { upsert: true, contentType: row.foto.type || 'image/jpeg' })
        if (up.error && ehErroDeRede(up.error)) throw up.error
        if (!up.error) { row.fotoPath = caminho; await db.transacoes.update(row.id, { fotoPath: caminho }) }
        else console.warn('Falha ao enviar foto', up.error)
      }
      erro = (await supabase!.from(cfg.tabela).upsert(paraServidor(p.tabela, row, fam), { onConflict: cfg.conflito })).error
    }
    if (erro) {
      if (ehErroDeRede(erro)) throw erro
      console.warn('Alteração recusada pelo servidor', p, erro)
      emitir({ erro: erro.code === '42501' ? 'Você não tem permissão para essa alteração — ela foi desfeita.' : `Não foi possível salvar na nuvem: ${erro.message}` })
      await setMeta(`pull:${p.tabela}`, null, db) // força baixar de novo a versão do servidor
    }
    // só apaga se ninguém alterou o registro de novo enquanto enviávamos
    await db.transaction('rw', db.pendentes, async () => { const atual = await db.pendentes.get(p.chave); if (atual && atual.ts === p.ts) await db.pendentes.delete(p.chave) })
  }
}

/** Baixa o que mudou na nuvem desde a última vez (com 5 s de folga para não perder gravações simultâneas). */
async function receber(fam: string, db: BD) {
  for (const t of Object.keys(SRV) as Tabela[]) {
    const cfg = SRV[t]
    let desde: string | null = (await getMeta(`pull:${t}`, db)) ?? null
    for (;;) {
      let q = supabase!.from(cfg.tabela).select('*').eq('familia_id', fam).order('atualizado_em').limit(1000)
      if (desde) q = q.gt('atualizado_em', new Date(Date.parse(desde) - 5000).toISOString())
      const { data, error } = await q
      if (error) throw error
      if (!data.length) break
      const pend = new Set((await db.pendentes.where('chave').startsWith(`${t}:`).toArray()).map((p) => p.id))
      await db.transaction('rw', db.table(t), async () => {
        for (const r of data) {
          const id = String(r[cfg.pk])
          if (pend.has(id)) continue // alteração local ainda não enviada vence
          if (r.excluido) { await db.table(t).delete(id); continue }
          const novo = deServidor(t, r)
          if (t === 'transacoes') { const velho = await db.transacoes.get(id); if (velho?.foto && velho.fotoPath === novo.fotoPath) novo.foto = velho.foto }
          await db.table(t).put(novo)
        }
      })
      const ultimo = data[data.length - 1].atualizado_em
      await setMeta(`pull:${t}`, ultimo, db)
      if (data.length < 1000 || ultimo === desde) break
      desde = ultimo
    }
  }
  const { data: ms, error } = await supabase!.from('membros').select('user_id, nome, email, papel').eq('familia_id', fam)
  if (error) throw error
  await db.transaction('rw', db.membros, async () => { await db.membros.clear(); await db.membros.bulkPut(ms.map((m): Membro => ({ userId: m.user_id, nome: m.nome, email: m.email ?? undefined, papel: m.papel }))) })
}

export function sincronizar(): Promise<void> {
  if (!supabase || !familiaAtual) return Promise.resolve()
  if (rodando) { deNovo = true; return rodando }
  const fam = familiaAtual, db = dbAtivo // fixa perfil e banco: uma troca de perfil no meio não mistura dados
  rodando = (async () => {
    emitir({ sincronizando: true })
    try {
      do { deNovo = false; await enviar(fam, db); await receber(fam, db) } while (deNovo && familiaAtual === fam)
      emitir({ ultimo: Date.now(), online: true })
    } catch (e: any) {
      emitir({ online: !ehErroDeRede(e) && navigator.onLine, erro: ehErroDeRede(e) ? undefined : e?.message })
    } finally {
      emitir({ sincronizando: false, pendentes: await db.pendentes.count() })
      rodando = null
      if (familiaAtual && familiaAtual !== fam) agendarSync(50) // trocou de perfil durante o envio
    }
  })()
  return rodando
}
export const agendarSync = (ms = 800) => { clearTimeout(timer); timer = setTimeout(sincronizar, ms) }
export const limparErroSync = () => emitir({ erro: undefined })

const aoVoltar = () => { emitir({ online: navigator.onLine }); agendarSync(100) }
const aoVisivel = () => { if (document.visibilityState === 'visible') agendarSync(100) }

export function iniciarSync(fam: string) {
  pararSync()
  familiaAtual = fam
  definirAoEscrever(async () => { emitir({ pendentes: await dbAtivo.pendentes.count() }); agendarSync() })
  window.addEventListener('online', aoVoltar); window.addEventListener('offline', aoVoltar)
  document.addEventListener('visibilitychange', aoVisivel)
  intervalo = setInterval(sincronizar, 30000)
  try { // tempo real é opcional: se não estiver disponível, a sincronização periódica resolve
    canal = supabase!.channel(`perfil-${fam}-${Date.now()}`)
    for (const t of ['lancamentos', 'categorias', 'contas', 'orcamentos', 'regras_categoria', 'membros'])
      canal.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `familia_id=eq.${fam}` }, () => agendarSync(300))
    canal.subscribe()
  } catch { /* ignora */ }
  return sincronizar()
}
export function pararSync() {
  familiaAtual = null
  definirAoEscrever(() => {})
  clearInterval(intervalo); clearTimeout(timer)
  window.removeEventListener('online', aoVoltar); window.removeEventListener('offline', aoVoltar)
  document.removeEventListener('visibilitychange', aoVisivel)
  if (canal) { try { supabase!.removeChannel(canal) } catch { /* ignora */ } canal = null }
}

/** URL temporária para ver a foto de uma nota que está só na nuvem. */
const cacheUrl = new Map<string, string>()
export async function urlFoto(path: string) {
  if (cacheUrl.has(path)) return cacheUrl.get(path)!
  const { data, error } = await supabase!.storage.from('notas').createSignedUrl(path, 3600)
  if (error) throw error
  cacheUrl.set(path, data.signedUrl)
  return data.signedUrl
}
