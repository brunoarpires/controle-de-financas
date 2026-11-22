import { bioAtiva, travar, destravar, voltouDeLogin, TEMPO_FORA, ultimoBio, marcarLiberado, foiLiberado } from './bloqueio'
import { useSyncExternalStore } from 'react'
import type { User } from '@supabase/supabase-js'
import { db, base, definirUsuario, garantirDadosLocais, migrarBancoAntigo, limparDadosLocais, getMeta, setMeta, salvar, usarBancoDoPerfil, usarBancoBase, apagarCachePerfil, type Membro, type Categoria, type Conta } from './db'
import { supabase, modoNuvem } from './supabase'
import { iniciarSync, pararSync, sincronizar } from './sync'
import { normalizar } from './categorizar'

export interface Familia { id: string; nome: string; codigo_convite: string; tipo: 'pessoal' | 'empresa'; cnpj?: string | null; razao_social?: string | null }
/** Um perfil financeiro ao qual o usuário pertence (no banco: tabela "familias"). */
export interface Perfil { familia: Familia; eu: Membro }
export interface Sessao {
  carregando: boolean
  user: User | null
  /** Todos os perfis do usuário. */
  perfis: Perfil[]
  /** Perfil ativo (null = ainda escolhendo). */
  familia: Familia | null
  eu: Membro | null
  admin: boolean
  recuperandoSenha: boolean
  /** Mostrar a tela de criar/entrar em perfil mesmo já tendo perfis. */
  novoPerfil: boolean
  /** A biometria passou mas a sessão guardada expirou: precisa da senha uma vez. */
  sessaoExpirada?: boolean
  /** Quantos lançamentos locais (de antes do login) aguardam a decisão de enviar para o perfil. */
  migracaoPendente: number
}
let s: Sessao = { carregando: true, user: null, perfis: [], familia: null, eu: null, admin: !modoNuvem, recuperandoSenha: false, novoPerfil: false, migracaoPendente: 0 }
const ouvintes = new Set<() => void>()
const set = (p: Partial<Sessao>) => { s = { ...s, ...p }; ouvintes.forEach((f) => f()) }
export const sessao = () => s
export const useSessao = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => s)

/** Pode alterar categorias, contas e orçamentos? (no modo local, sempre) */
export const podeAdministrar = () => !modoNuvem || s.admin
/** Pode editar/excluir este lançamento? Membro só os próprios; administrador, todos. */
export const podeEditar = (t?: { userId?: string }) => !modoNuvem || !t?.userId || s.admin || t.userId === s.user?.id

export async function iniciarSessao() {
  await migrarBancoAntigo()
  if (!supabase) { await garantirDadosLocais(); set({ carregando: false }); return }
  if (new URLSearchParams(location.search).has('recuperar')) set({ recuperandoSenha: true })
  // Segurança ao abrir o app: biometria (se ativada) ou novo login
  // biometria ativa: trava ANTES de olhar a sessão (nunca pede senha só por abrir o app)
  if (!voltouDeLogin && ultimoBio()) travar()
  const { data: ini } = await supabase.auth.getSession()
  const u0 = ini.session?.user
  if (u0 && !voltouDeLogin) await exigirAcesso(u0.id)
  else if (voltouDeLogin) marcarLiberado()
  // ao voltar depois de um tempo fora do app, pede de novo
  let saiuEm = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { saiuEm = Date.now(); return }
    if (saiuEm && Date.now() - saiuEm > TEMPO_FORA && s.user) { void exigirAcesso(s.user.id) }
  })
  supabase.auth.onAuthStateChange((evento, sess) => {
    if (evento === 'PASSWORD_RECOVERY') set({ recuperandoSenha: true })
    const novo = sess?.user ?? null
    // sessão chegou depois (ex.: renovação lenta): se tem biometria e ainda não liberou, trava
    if (novo && bioAtiva(novo.id) && !foiLiberado()) travar()
    if (novo?.id !== s.user?.id) setTimeout(() => carregarFamilia(novo), 0) // fora do callback (recomendação do supabase-js)
    else set({ user: novo })
  })
  const { data } = await supabase.auth.getSession()
  await carregarFamilia(data.session?.user ?? null)
}

/** Biometria ativa: trava a tela. Senão: encerra a sessão neste aparelho (os dados pendentes ficam guardados e sobem no próximo login). */
async function exigirAcesso(uid: string) {
  if (bioAtiva(uid)) { travar(); return }
  if (s.familia) await sincronizar().catch(() => {})
  await supabase!.auth.signOut({ scope: 'local' })
}
/** Desistiu da biometria: entra com senha. */
export async function entrarComSenha() { await supabase!.auth.signOut({ scope: 'local' }); destravar() }
/** Após a biometria: garante a sessão (renova o token se preciso). Sem sessão válida, só a senha resolve. */
export async function aposBiometria() {
  const { data } = await supabase!.auth.getSession()
  if (!data.session) { const r = await supabase!.auth.refreshSession(); if (!r.data.session) { set({ sessaoExpirada: true }); return false } }
  return true
}

let carregandoUid: string | null | undefined
const CAMPOS_FAMILIA = 'id, nome, codigo_convite, tipo, cnpj, razao_social'
async function carregarFamilia(user: User | null, escolher?: string) {
  if (carregandoUid === (user?.id ?? null) && !s.carregando && !escolher) return
  carregandoUid = user?.id ?? null
  set({ user, carregando: true })
  definirUsuario(user?.id)
  if (!user) { pararSync(); usarBancoBase(); set({ perfis: [], familia: null, eu: null, admin: false, carregando: false }); return }
  let perfis: Perfil[] = []
  try {
    const { data: ms, error } = await supabase!.from('membros').select(`familia_id, user_id, nome, email, papel, familias(${CAMPOS_FAMILIA})`).eq('user_id', user.id)
    if (error) throw error
    perfis = (ms ?? []).filter((m: any) => m.familias).map((m: any) => ({ familia: m.familias as Familia, eu: { userId: m.user_id, nome: m.nome, email: m.email, papel: m.papel } }))
    perfis.sort((x, y) => (x.familia.tipo === y.familia.tipo ? x.familia.nome.localeCompare(y.familia.nome) : x.familia.tipo === 'pessoal' ? -1 : 1))
    await setMeta('ultimosPerfis', { perfis, uid: user.id }, base)
  } catch (e) {
    // sem internet: usa os últimos perfis conhecidos deste usuário (modo offline)
    const ult = await getMeta('ultimosPerfis', base)
    if (ult?.uid === user.id) perfis = ult.perfis
    else { const velho = await getMeta('ultimaFamilia', base); if (velho?.uid === user.id) perfis = [{ familia: { tipo: 'pessoal', ...velho.familia }, eu: velho.eu }] }
    if (!perfis.length) console.warn(e)
  }
  set({ perfis })
  const alvo = escolher ? perfis.find((p) => p.familia.id === escolher) : perfis.length === 1 ? perfis[0] : s.familia ? perfis.find((p) => p.familia.id === s.familia!.id) : undefined
  if (alvo) await ativar(alvo)
  else { pararSync(); set({ familia: null, eu: null, admin: false }) }
  set({ carregando: false })
}

async function ativar(p: Perfil) {
  pararSync()
  set({ familia: p.familia, eu: p.eu, admin: p.eu.papel === 'administrador', novoPerfil: false, migracaoPendente: 0 })
  await prepararCache(p.familia.id)
}
/** Escolhe o perfil a usar agora (tela de escolha ou botão de troca). */
export async function escolherPerfil(id: string) {
  const p = s.perfis.find((x) => x.familia.id === id); if (!p) return
  set({ carregando: true }); try { await ativar(p) } finally { set({ carregando: false }) }
}
/** Volta para a tela de escolha de perfil (envia antes o que estiver pendente). */
export async function trocarPerfil() {
  if (s.familia) await sincronizar()
  pararSync(); set({ familia: null, eu: null, admin: false })
}
export const abrirNovoPerfil = (v = true) => set({ novoPerfil: v })

async function prepararCache(fam: string) {
  await usarBancoDoPerfil(fam)
  if ((await getMeta('familiaId')) === fam) { iniciarSync(fam); return }
  // dados de antes do login (banco base sem perfil): perguntar se envia para este perfil
  const n = (await getMeta('familiaId', base)) ? 0 : await base.transacoes.count()
  if (n > 0) { set({ migracaoPendente: n }); return }
  await limparDadosLocais()
  await setMeta('familiaId', fam)
  await iniciarSync(fam)
}

/** Decide o que fazer com os dados que já estavam neste aparelho antes de entrar na família. */
export async function resolverMigracao(enviar: boolean) {
  const fam = s.familia!.id
  const antigo = enviar ? {
    transacoes: await base.transacoes.toArray(), categorias: await base.categorias.toArray(), contas: await base.contas.toArray(),
    orcamentos: await base.orcamentos.toArray(), regras: await base.regras.toArray(),
  } : null
  await limparDadosLocais(base)
  await usarBancoDoPerfil(fam)
  await limparDadosLocais()
  await setMeta('familiaId', fam)
  await iniciarSync(fam) // baixa categorias/contas da família
  if (antigo) {
    const cats = await db.categorias.toArray(), contas = await db.contas.toArray()
    const mc = new Map<string, string>(), mk = new Map<string, string>()
    const novasCats: Categoria[] = [], novasContas: Conta[] = []
    for (const c of antigo.categorias) {
      const igual = cats.find((x) => x.tipo === c.tipo && normalizar(x.nome) === normalizar(c.nome))
      if (igual) mc.set(c.id, igual.id)
      else if (s.admin) { novasCats.push(c); mc.set(c.id, c.id) }
      else { const o = cats.find((x) => x.tipo === c.tipo && /^outr/i.test(x.nome)) ?? cats.find((x) => x.tipo === c.tipo); if (o) mc.set(c.id, o.id) }
    }
    for (const k of antigo.contas) {
      const igual = contas.find((x) => normalizar(x.nome) === normalizar(k.nome))
      if (igual) mk.set(k.id, igual.id)
      else if (s.admin) { novasContas.push(k); mk.set(k.id, k.id) }
      else if (contas[0]) mk.set(k.id, contas[0].id)
    }
    if (novasCats.length) await salvar('categorias', novasCats)
    if (novasContas.length) await salvar('contas', novasContas)
    await salvar('transacoes', antigo.transacoes.map((t) => ({ ...t, userId: s.user!.id, categoriaId: mc.get(t.categoriaId) ?? '', contaId: mk.get(t.contaId) ?? '' })))
    await salvar('regras', antigo.regras.filter((r) => mc.has(r.categoriaId)).map((r) => ({ ...r, categoriaId: mc.get(r.categoriaId)! })))
    if (s.admin) await salvar('orcamentos', antigo.orcamentos.filter((o) => mc.has(o.categoriaId)).map((o) => ({ ...o, categoriaId: mc.get(o.categoriaId)! })))
    await sincronizar()
  }
  set({ migracaoPendente: 0 })
}

/* ---------- Ações de família (RPCs com checagem no servidor) ---------- */
const rpc = async (f: string, args: Record<string, any> = {}) => { const { data, error } = await supabase!.rpc(f, args); if (error) throw new Error(traduzir(error.message)); return data }
export function traduzir(msg: string) {
  if (/Invalid login credentials/i.test(msg)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(msg)) return 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'
  if (/User already registered/i.test(msg)) return 'Já existe uma conta com esse e-mail. Use "Entrar" ou "Esqueci a senha".'
  if (/Password should be at least/i.test(msg)) return 'A senha precisa ter pelo menos 6 caracteres.'
  if (/rate limit|too many/i.test(msg)) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  if (/fetch|network/i.test(msg)) return 'Sem conexão com a internet.'
  return msg
}
const recarregar = async (escolher?: string) => { carregandoUid = undefined; await carregarFamilia(s.user, escolher) }
const fam = () => s.familia!.id
export async function criarFamilia(nome: string, meuNome: string, tipo: 'pessoal' | 'empresa' = 'pessoal', cnpj?: string, razaoSocial?: string) {
  const f = await rpc('criar_familia', { p_nome: nome, p_meu_nome: meuNome, p_tipo: tipo, p_cnpj: cnpj || null, p_razao_social: razaoSocial || null })
  await recarregar(f?.id)
}
export async function entrarFamilia(codigo: string, meuNome: string) { const f = await rpc('entrar_familia', { p_codigo: codigo.trim().toUpperCase(), p_meu_nome: meuNome }); await recarregar(f?.id) }
export async function novoCodigo() { const c = await rpc('novo_codigo_convite', { p_familia: fam() }); set({ familia: { ...s.familia!, codigo_convite: c } }); return c as string }
export async function definirPapel(uid: string, papel: 'administrador' | 'membro') { await rpc('definir_papel', { p_user: uid, p_papel: papel, p_familia: fam() }); await sincronizar() }
export async function removerMembro(uid: string) { await rpc('remover_membro', { p_user: uid, p_familia: fam() }); await sincronizar() }
export async function renomearMembro(uid: string, nome: string) { await rpc('renomear_membro', { p_user: uid, p_nome: nome, p_familia: fam() }); if (uid === s.user?.id) set({ eu: { ...s.eu!, nome } }); await sincronizar() }
export async function atualizarPerfil(dados: Partial<Pick<Familia, 'nome' | 'cnpj' | 'razao_social'>>) {
  const { error } = await supabase!.from('familias').update(dados).eq('id', fam()); if (error) throw new Error(traduzir(error.message))
  const familia = { ...s.familia!, ...dados }
  set({ familia, perfis: s.perfis.map((p) => (p.familia.id === familia.id ? { ...p, familia } : p)) })
}
export const renomearFamilia = (nome: string) => atualizarPerfil({ nome })
export async function sairDaFamilia() { const f = fam(); await rpc('sair_da_familia', { p_familia: f }); pararSync(); await apagarCachePerfil(f); set({ familia: null }); await recarregar() }

export async function sair() {
  if ((await db.pendentes.count()) > 0) {
    await sincronizar()
    if ((await db.pendentes.count()) > 0 && !confirm('Há alterações que ainda não foram enviadas para a nuvem (sem internet?). Se sair agora, elas serão perdidas. Sair mesmo assim?')) return
  }
  pararSync()
  await apagarCachePerfil()
  await supabase!.auth.signOut({ scope: 'local' }) // só neste aparelho (não derruba o login dos outros aparelhos)
}
export const concluirRecuperacao = () => { set({ recuperandoSenha: false }); history.replaceState(null, '', location.pathname + location.hash) }
