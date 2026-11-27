import Dexie, { type EntityTable } from 'dexie'

export type Tipo = 'receita' | 'despesa'
export interface ItemNota { descricao: string; quantidade?: number | null; valor?: number | null }
export interface NotaInfo { comprovante?: import('./comprovante').DadosComprovante; cnpj?: string; chave?: string; url?: string; estabelecimento?: string; razaoSocial?: string; endereco?: string; cnae?: string; itens?: ItemNota[] }
export interface Transacao { id: string; tipo: Tipo; valor: number; data: string; hora?: string; descricao: string; categoriaId: string; contaId: string; userId?: string; observacao?: string; foto?: Blob; fotoPath?: string; nota?: NotaInfo; criadoEm: number; parcelaGrupoId?: string; parcelaNumero?: number; parcelaTotal?: number }
export interface Categoria { id: string; nome: string; icone: string; cor: string; tipo: Tipo }
export type TipoConta = 'conta' | 'cartao' | 'dinheiro' | 'pix' | 'vr_ticket'
export interface Conta { id: string; nome: string; tipo: TipoConta; icone: string; titularId?: string }
export interface Orcamento { categoriaId: string; limite: number }
export interface Regra { palavra: string; categoriaId: string; peso: number }
export interface CnpjCache { cnpj: string; dados: any; ts: number }
export interface Membro { userId: string; nome: string; email?: string; papel: 'administrador' | 'membro' }
export type Tabela = 'transacoes' | 'categorias' | 'contas' | 'orcamentos' | 'regras'
export interface Pendente { chave: string; tabela: Tabela; id: string; op: 'put' | 'del'; ts: number }

export type BD = Dexie & {
  transacoes: EntityTable<Transacao, 'id'>; categorias: EntityTable<Categoria, 'id'>; contas: EntityTable<Conta, 'id'>
  orcamentos: EntityTable<Orcamento, 'categoriaId'>; regras: EntityTable<Regra, 'palavra'>; cnpjCache: EntityTable<CnpjCache, 'cnpj'>
  membros: EntityTable<Membro, 'userId'>; pendentes: EntityTable<Pendente, 'chave'>; meta: EntityTable<{ k: string; v: any }, 'k'>
}
function abrir(nome: string): BD {
  const d = new Dexie(nome) as BD
  d.version(1).stores({
    transacoes: 'id, data, tipo, categoriaId, contaId, userId', categorias: 'id, tipo', contas: 'id',
    orcamentos: 'categoriaId', regras: 'palavra', cnpjCache: 'cnpj', membros: 'userId', pendentes: 'chave, ts', meta: 'k',
  })
  d.version(2).stores({ transacoes: 'id, data, tipo, categoriaId, contaId, userId' }) // v2: campo opcional "hora" (HH:MM)
  d.version(3).stores({ transacoes: 'id, data, tipo, categoriaId, contaId, userId, parcelaGrupoId' }) // v3: parcelas
  d.version(4).stores({ contas: 'id, tipo, titularId' }) // v4: titular do VR - Ticket
  return d
}
/** Banco base: dados gerais do aparelho (e o cache do perfil que já existia antes dos perfis). */
export const base = abrir('financas-v2')
const PREFIXO_PERFIL = 'financas-v2-p-'
/** Cache local do perfil ATIVO. Cada perfil tem o próprio banco (dados e fila de envio separados). */
export let db: BD = base
export async function usarBancoDoPerfil(fam: string) {
  const legado = (await base.meta.get('familiaId'))?.v
  const nome = legado === fam ? 'financas-v2' : PREFIXO_PERFIL + fam
  if (db.name === nome) return
  if (db !== base) db.close()
  db = nome === 'financas-v2' ? base : abrir(nome)
}
export function usarBancoBase() { if (db !== base) db.close(); db = base }
/** Apaga o cache de um perfil (ao sair dele) ou de todos (ao sair da conta). */
export async function apagarCachePerfil(fam?: string) {
  const legado = (await base.meta.get('familiaId'))?.v
  if (!fam || legado === fam) await limparDadosLocais(base)
  const nomes = await Dexie.getDatabaseNames()
  for (const n of nomes) if (n.startsWith(PREFIXO_PERFIL) && (!fam || n === PREFIXO_PERFIL + fam)) { if (db.name === n) usarBancoBase(); await Dexie.delete(n) }
}
export const TABELAS_DADOS = ['transacoes', 'categorias', 'contas', 'orcamentos', 'regras'] as const

export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))
export const getMeta = async <T = any>(k: string, d: BD = db): Promise<T | undefined> => (await d.meta.get(k))?.v
export const setMeta = (k: string, v: any, d: BD = db) => d.meta.put({ k, v })

/* ---------- Escrita (sempre por aqui: grava local e enfileira para a nuvem) ---------- */
const chaveDe = (t: Tabela, row: any) => String(t === 'orcamentos' ? row.categoriaId : t === 'regras' ? row.palavra : row.id)
let aoEscrever: () => void = () => {}
export const definirAoEscrever = (f: () => void) => { aoEscrever = f }
let usuarioAtual: string | undefined
export const definirUsuario = (uid?: string) => { usuarioAtual = uid }
export async function salvar<T>(tabela: Tabela, rows: T | T[]) {
  let l = (Array.isArray(rows) ? rows : [rows]) as any[]
  if (tabela === 'transacoes' && usuarioAtual) l = l.map((r) => (r.userId ? r : { ...r, userId: usuarioAtual }))
  await db.transaction('rw', db.table(tabela), db.pendentes, async () => {
    await db.table(tabela).bulkPut(l)
    await db.pendentes.bulkPut(l.map((r) => { const id = chaveDe(tabela, r); return { chave: `${tabela}:${id}`, tabela, id, op: 'put' as const, ts: Date.now() } }))
  })
  aoEscrever()
}
export async function excluir(tabela: Tabela, id: string) {
  await db.transaction('rw', db.table(tabela), db.pendentes, async () => {
    await db.table(tabela).delete(id)
    await db.pendentes.put({ chave: `${tabela}:${id}`, tabela, id, op: 'del', ts: Date.now() })
  })
  aoEscrever()
}

export const CATEGORIAS_PADRAO: Omit<Categoria, 'id'>[] = [
  { nome: 'Mercado', icone: '🛒', cor: '#16a34a', tipo: 'despesa' }, { nome: 'Alimentação', icone: '🍔', cor: '#f97316', tipo: 'despesa' },
  { nome: 'Transporte', icone: '🚗', cor: '#0ea5e9', tipo: 'despesa' }, { nome: 'Moradia', icone: '🏠', cor: '#8b5cf6', tipo: 'despesa' },
  { nome: 'Contas', icone: '💡', cor: '#eab308', tipo: 'despesa' }, { nome: 'Saúde', icone: '💊', cor: '#ef4444', tipo: 'despesa' },
  { nome: 'Educação', icone: '📚', cor: '#6366f1', tipo: 'despesa' }, { nome: 'Lazer', icone: '🎉', cor: '#ec4899', tipo: 'despesa' },
  { nome: 'Compras', icone: '🛍️', cor: '#14b8a6', tipo: 'despesa' }, { nome: 'Outros', icone: '📦', cor: '#64748b', tipo: 'despesa' },
  { nome: 'Salário', icone: '💰', cor: '#059669', tipo: 'receita' }, { nome: 'Extra', icone: '✨', cor: '#22c55e', tipo: 'receita' },
  { nome: 'VR - Ticket', icone: '🎫', cor: '#f59e0b', tipo: 'receita' }, { nome: 'Outras receitas', icone: '📥', cor: '#84cc16', tipo: 'receita' },
]

/** Modo sem nuvem: cria categorias/contas padrão e migra o banco da versão anterior (ids numéricos). */
export async function garantirDadosLocais() {
  await migrarBancoAntigo()
  if ((await db.categorias.count()) === 0) await db.categorias.bulkAdd(CATEGORIAS_PADRAO.map((c) => ({ ...c, id: uuid() })))
  else if (!(await db.categorias.filter((c) => c.tipo === 'receita' && c.nome.trim().toLowerCase() === 'vr - ticket').count())) {
    await db.categorias.add({ id: uuid(), nome: 'VR - Ticket', icone: '🎫', cor: '#f59e0b', tipo: 'receita' })
  }
  if ((await db.contas.count()) === 0) await db.contas.bulkAdd([
    { id: uuid(), nome: 'Conta corrente', tipo: 'conta', icone: '🏦' }, { id: uuid(), nome: 'Cartão de crédito', tipo: 'cartao', icone: '💳' }, { id: uuid(), nome: 'Dinheiro', tipo: 'dinheiro', icone: '💵' }, { id: uuid(), nome: 'Pix', tipo: 'pix', icone: '💠' },
  ])
  else if (!(await db.contas.filter((c) => c.tipo === 'pix').count())) {
    await db.contas.add({ id: uuid(), nome: 'Pix', tipo: 'pix', icone: '💠' })
  }
}
export async function migrarBancoAntigo() {
  if (await getMeta('migrouV1')) return
  await setMeta('migrouV1', true)
  if (!(await Dexie.exists('financas'))) return
  const v1 = new Dexie('financas'); v1.version(1).stores({ transacoes: '++id', categorias: '++id', contas: '++id', orcamentos: 'categoriaId', regras: 'palavra', cnpjCache: 'cnpj' })
  const [transacoes, categorias, contas, orcamentos, regras] = await Promise.all(['transacoes', 'categorias', 'contas', 'orcamentos', 'regras'].map((t) => v1.table(t).toArray()))
  const d = remapearIds({ transacoes, categorias, contas, orcamentos, regras })
  await db.categorias.bulkPut(d.categorias); await db.contas.bulkPut(d.contas); await db.transacoes.bulkPut(d.transacoes)
  await db.orcamentos.bulkPut(d.orcamentos); await db.regras.bulkPut(d.regras)
  v1.close()
}
/** Converte dados com ids numéricos (versão 1) para ids uuid. */
function remapearIds(d: any) {
  const mc = new Map((d.categorias ?? []).map((c: any) => [String(c.id), uuid()])), mk = new Map((d.contas ?? []).map((c: any) => [String(c.id), uuid()]))
  const C = (x: any) => mc.get(String(x)) as string, K = (x: any) => mk.get(String(x)) as string
  return {
    categorias: (d.categorias ?? []).map((c: any) => ({ ...c, id: C(c.id) })),
    contas: (d.contas ?? []).map((c: any) => ({ ...c, id: K(c.id) })),
    transacoes: (d.transacoes ?? []).map((t: any) => ({ ...t, id: uuid(), categoriaId: C(t.categoriaId), contaId: K(t.contaId) })),
    orcamentos: (d.orcamentos ?? []).filter((o: any) => C(o.categoriaId)).map((o: any) => ({ ...o, categoriaId: C(o.categoriaId) })),
    regras: (d.regras ?? []).filter((r: any) => C(r.categoriaId)).map((r: any) => ({ ...r, categoriaId: C(r.categoriaId) })),
  }
}

export async function limparDadosLocais(d: BD = db) {
  await d.transaction('rw', [...TABELAS_DADOS.map((t) => d.table(t)), d.membros, d.pendentes, d.meta], async () => {
    await Promise.all([...TABELAS_DADOS.map((t) => d.table(t).clear()), d.membros.clear(), d.pendentes.clear()])
    for (const m of await d.meta.toArray()) if (m.k.startsWith('pull:') || m.k === 'familiaId') await d.meta.delete(m.k)
  })
}

/* ---------- Backup JSON ---------- */
const blobToDataURL = (b: Blob) => new Promise<string>((r) => { const f = new FileReader(); f.onload = () => r(f.result as string); f.readAsDataURL(b) })
const dataURLToBlob = async (u: string) => (await fetch(u)).blob()
export async function exportarBackup(): Promise<Blob> {
  const transacoes = await Promise.all((await db.transacoes.toArray()).map(async (t) => ({ ...t, foto: t.foto ? await blobToDataURL(t.foto) : undefined })))
  const dados = { app: 'financas-pessoais', versao: 3, exportadoEm: new Date().toISOString(), transacoes,
    categorias: await db.categorias.toArray(), contas: await db.contas.toArray(), orcamentos: await db.orcamentos.toArray(), regras: await db.regras.toArray() }
  return new Blob([JSON.stringify(dados)], { type: 'application/json' })
}
/** Restaura backup. No modo família, ADICIONA os dados (enviados para a nuvem); no modo local, substitui. */
export async function importarBackup(texto: string, substituir: boolean) {
  const d = JSON.parse(texto)
  if (d.app !== 'financas-pessoais') throw new Error('Arquivo não é um backup deste app')
  d.transacoes = await Promise.all((d.transacoes ?? []).map(async (t: any) => ({ ...t, foto: t.foto ? await dataURLToBlob(t.foto) : undefined })))
  const x = d.versao >= 2 ? d : remapearIds(d)
  if (substituir) await limparDadosLocais()
  await salvar('categorias', x.categorias); await salvar('contas', x.contas); await salvar('transacoes', x.transacoes)
  await salvar('orcamentos', x.orcamentos ?? []); await salvar('regras', x.regras ?? [])
}
