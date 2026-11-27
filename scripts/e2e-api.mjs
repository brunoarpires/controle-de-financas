// Teste ponta a ponta da API (Auth + REST + Storage) com o supabase-js, contra o Supabase local de teste.
// Uso: VITE_SUPABASE_URL=http://localhost:54321 VITE_SUPABASE_ANON_KEY=... node scripts/e2e-api.mjs
import { createClient } from '@supabase/supabase-js'
const URL = process.env.VITE_SUPABASE_URL, KEY = process.env.VITE_SUPABASE_ANON_KEY
const cli = () => createClient(URL, KEY, { auth: { persistSession: false }, realtime: { transport: class { constructor() {} } } })
let n = 0, falhas = 0
const ok = (c, msg) => { n++; if (c) console.log('  ✔', msg); else { falhas++; console.log('  ✘', msg) } }
const sufixo = Date.now()
async function conta(nome) {
  const c = cli()
  if (process.env.CONTAS_PRONTAS) { // projeto real com confirmação de e-mail: usuários de teste já confirmados (criados via SQL)
    const email = `${nome.toLowerCase()}.e2e@teste.invalid`
    const { data, error } = await c.auth.signInWithPassword({ email, password: process.env.CONTAS_PRONTAS }); if (error) throw error
    return { c, id: data.user.id, email }
  }
  const email = `${nome.toLowerCase()}.${sufixo}@teste.local`
  const { data, error } = await c.auth.signUp({ email, password: 'senha123', options: { data: { nome } } }); if (error) throw error
  return { c, id: data.user.id, email }
}
const alex = await conta('Alex'), ana = await conta('Ana'), estranho = await conta('Estranho')
console.log('Família')
const { data: fam, error: e1 } = await alex.c.rpc('criar_familia', { p_nome: 'Família Silva', p_meu_nome: 'Alex' }); ok(!e1 && fam.id, 'Alex cria a família Família Silva')
const { error: e2 } = await ana.c.rpc('entrar_familia', { p_codigo: 'ERRADO00', p_meu_nome: 'Ana' }); ok(e2, 'código errado é recusado')
const { error: e3 } = await ana.c.rpc('entrar_familia', { p_codigo: fam.codigo_convite.toLowerCase(), p_meu_nome: 'Ana' }); ok(!e3, 'Ana entra com o código (minúsculas aceitas)')
const { data: ms } = await ana.c.from('membros').select('*'); ok(ms.length === 2 && ms.find((m) => m.user_id === ana.id).papel === 'membro', 'Ana vê 2 membros e é "membro"')
const { data: cats } = await ana.c.from('categorias').select('*').eq('tipo', 'despesa'); ok(cats.length === 10, 'categorias padrão criadas (10 de despesa)')
const { data: contas } = await alex.c.from('contas').select('*'); ok(contas.length === 4, '4 contas padrão (inclui Pix)')
console.log('Lançamentos')
const idA = crypto.randomUUID(), idB = crypto.randomUUID()
const lanc = (id, desc, v) => ({ id, familia_id: fam.id, tipo: 'despesa', valor: v, data: '2026-10-20', descricao: desc, categoria_id: cats[0].id, conta_id: contas[0].id })
ok(!(await ana.c.from('lancamentos').upsert(lanc(idA, 'Padaria', 12.5))).error, 'Ana lança uma despesa (upsert)')
ok(!(await alex.c.from('lancamentos').upsert(lanc(idB, 'Mercado', 230))).error, 'Alex lança uma despesa')
const { data: l1 } = await alex.c.from('lancamentos').select('*').eq('id', idA).single(); ok(l1?.user_id === ana.id, 'Alex vê o lançamento da Ana, com autora = Ana')
const { data: up1 } = await ana.c.from('lancamentos').update({ valor: 1 }).eq('id', idB).select(); ok(up1.length === 0, 'Ana NÃO altera o lançamento do Alex')
const r2 = await ana.c.from('lancamentos').upsert({ ...lanc(idB, 'hack', 1) }); ok(r2.error, 'Ana NÃO sobrescreve o do Alex via upsert')
const { data: up2 } = await alex.c.from('lancamentos').update({ valor: 13 }).eq('id', idA).select(); ok(up2.length === 1 && up2[0].user_id === ana.id, 'Alex (admin) corrige o da Ana e a autoria continua da Ana')
const r3 = await ana.c.from('lancamentos').upsert({ ...lanc(crypto.randomUUID(), 'x', 1), user_id: alex.id }).select(); ok(!r3.error && r3.data[0].user_id === ana.id, 'Ana não consegue se passar pelo Alex (user_id forçado)')
const { data: est } = await estranho.c.from('lancamentos').select('*'); ok(est.length === 0, 'Estranho não vê nada')
ok((await estranho.c.from('lancamentos').insert(lanc(crypto.randomUUID(), 'x', 1))).error, 'Estranho não grava na família')
console.log('Administração')
ok((await ana.c.from('categorias').insert({ familia_id: fam.id, nome: 'X', tipo: 'despesa' })).error, 'Membro não cria categoria')
ok((await ana.c.from('orcamentos').upsert({ familia_id: fam.id, categoria_id: cats[0].id, limite: 10 })).error, 'Membro não define orçamento')
ok(!(await alex.c.from('orcamentos').upsert({ familia_id: fam.id, categoria_id: cats[0].id, limite: 800 }, { onConflict: 'familia_id,categoria_id' })).error, 'Admin define orçamento')
ok(!(await ana.c.from('regras_categoria').upsert({ familia_id: fam.id, palavra: 'padaria', categoria_id: cats[1].id }, { onConflict: 'familia_id,palavra' })).error, 'Membro ensina regra de categoria')
ok((await ana.c.rpc('definir_papel', { p_user: ana.id, p_papel: 'administrador' })).error, 'Membro não se promove')
ok((await alex.c.rpc('definir_papel', { p_user: alex.id, p_papel: 'membro' })).error, 'Último admin não pode deixar de ser admin')
console.log('Fotos (Storage)')
const foto = new Blob([Buffer.from('/9j/4AAQSkZJRgABAQ==', 'base64')], { type: 'image/jpeg' })
ok(!(await ana.c.storage.from('notas').upload(`${fam.id}/${idA}.jpg`, foto, { upsert: true })).error, 'Ana envia foto na pasta da família')
ok((await ana.c.storage.from('notas').upload(`outra-familia/${idA}.jpg`, foto)).error, 'Ana não envia fora da pasta da família')
ok(!(await alex.c.storage.from('notas').upload(`${fam.id}/${idB}.jpg`, foto, { upsert: true })).error, 'Alex envia foto')
ok((await ana.c.storage.from('notas').upload(`${fam.id}/${idB}.jpg`, foto, { upsert: true })).error, 'Ana não sobrescreve a foto do Alex')
const s1 = await alex.c.storage.from('notas').createSignedUrl(`${fam.id}/${idA}.jpg`, 60); ok(!s1.error && (await fetch(s1.data.signedUrl)).ok, 'Alex abre a foto da Ana por link temporário')
ok((await estranho.c.storage.from('notas').createSignedUrl(`${fam.id}/${idA}.jpg`, 60)).error, 'Estranho não abre a foto')
console.log('Sincronização')
const { data: d1 } = await alex.c.from('lancamentos').select('atualizado_em').order('atualizado_em', { ascending: false }).limit(1)
await ana.c.from('lancamentos').update({ excluido: true }).eq('id', idA)
const { data: d2 } = await alex.c.from('lancamentos').select('*').gt('atualizado_em', d1[0].atualizado_em); ok(d2.length === 1 && d2[0].excluido, 'exclusão chega como "excluido" para o outro aparelho')
console.log('Remoção de membro')
ok(!(await alex.c.rpc('remover_membro', { p_user: ana.id })).error, 'Admin remove a Ana')
const { data: dep } = await ana.c.from('lancamentos').select('*'); ok(dep.length === 0, 'Ana removida não vê mais nada')
const { data: fic } = await alex.c.from('lancamentos').select('*').eq('user_id', ana.id); ok(fic.length >= 1, 'lançamentos da Ana continuam na família')
console.log(falhas ? `\n${falhas} de ${n} FALHARAM` : `\nTODOS OS ${n} TESTES PASSARAM`)
process.exit(falhas ? 1 : 0)
