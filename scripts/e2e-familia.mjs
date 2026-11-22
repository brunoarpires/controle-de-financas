// Teste ponta a ponta no navegador do modo FAMÍLIA (2 pessoas, 2 navegadores) + capturas de tela.
// Precisa: Supabase (local de teste: scripts/supabase-local.mjs, ou um projeto real) e o app compilado
// com VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY servido em BASE.
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE ?? 'http://localhost:4174'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shot = (p, n, full = true) => p.screenshot({ path: `screenshots/${n}.png`, fullPage: full })
const clicar = async (p, txt, sel = 'button,a,label') => { const ok = await p.$$eval(sel, (els, t) => { const e = els.find((e) => e.textContent.trim().includes(t) && !e.disabled); e?.click(); return !!e }, txt); if (!ok) throw new Error('não achei: ' + txt) }
const esperarTexto = (p, t, timeout = 15000) => p.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, t)
let falhas = 0
const ok = (c, msg) => { console.log(c ? '  ✔' : '  ✘', msg); if (!c) falhas++ }
const sufixo = Date.now().toString(36)

async function pagina(viewport) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport(viewport)
  p.on('console', (m) => m.type() === 'error' && !/realtime|websocket|404/i.test(m.text()) && console.log('   [console]', m.text()))
  p.on('dialog', (d) => d.accept(d.defaultValue()))
  return p
}
async function criarConta(p, nome, email) {
  await esperarTexto(p, 'Criar conta'); await clicar(p, 'Criar conta', 'button[type=button]')
  await p.type('input[placeholder="Seu nome"]', nome); await p.type('input[type=email]', email); await p.type('input[type=password]', 'senha123')
  await clicar(p, 'Criar conta', 'button:not([type=button])')
}
async function lancar(p, tipo, valor, desc, cat) {
  await p.goto(BASE + '/#/'); await esperarTexto(p, 'Saldo do mês')
  await clicar(p, tipo === 'despesa' ? '− Despesa' : '+ Receita'); await sleep(300)
  await p.type('input[placeholder="0,00"]', valor); await p.type('input[placeholder^="Ex.:"]', desc); await sleep(500)
  if (cat) await clicar(p, cat, 'button'); await clicar(p, 'Salvar', 'button'); await sleep(400)
}
const esperarSync = (p) => p.waitForFunction(() => document.body.innerText.includes('Tudo salvo na nuvem'), { timeout: 20000 })

// ---------- Alex: cria conta e a família ----------
console.log('Alex (desktop)')
const alex = await pagina({ width: 1280, height: 860 })
await alex.goto(BASE, { waitUntil: 'networkidle0' }); await esperarTexto(alex, 'Esqueci minha senha')
await shot(alex, 'familia-login')
await clicar(alex, 'Esqueci minha senha'); await sleep(300); await shot(alex, 'familia-recuperar-senha'); await clicar(alex, 'Voltar para entrar')
await criarConta(alex, 'Alex', `alex.${sufixo}@teste.local`)
await esperarTexto(alex, 'Nome da família'); await shot(alex, 'familia-criar')
await alex.type('input[placeholder="Ex.: Família Silva"]', 'Família Silva'); await clicar(alex, 'Criar família', 'button:not([type=button])')
await esperarTexto(alex, 'Saldo do mês'); await esperarSync(alex); ok(true, 'conta criada, família criada, dashboard aberto')
await alex.goto(BASE + '/#/familia'); await esperarTexto(alex, 'Convidar pessoas')
const codigo = await alex.$eval('[data-testid=codigo]', (e) => e.textContent.trim()); ok(/^[0-9A-F]{8}$/.test(codigo), 'código de convite: ' + codigo)

// ---------- Ana: já usava o app no celular sem login (dados antigos) e recebe o link ----------
console.log('Ana (celular)')
const ana = await pagina({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await ana.goto(BASE + '/icon.svg')
await ana.evaluate(() => new Promise((r) => { // banco da versão anterior (ids numéricos), como se ela já usasse o app
  const q = indexedDB.open('financas', 10)
  q.onupgradeneeded = () => { const d = q.result; d.createObjectStore('transacoes', { keyPath: 'id', autoIncrement: true }); d.createObjectStore('categorias', { keyPath: 'id', autoIncrement: true }); d.createObjectStore('contas', { keyPath: 'id', autoIncrement: true }); for (const t of ['orcamentos', 'regras', 'cnpjCache']) d.createObjectStore(t, { keyPath: t === 'orcamentos' ? 'categoriaId' : t === 'regras' ? 'palavra' : 'cnpj' }) }
  q.onsuccess = () => { const tx = q.result.transaction(['transacoes', 'categorias', 'contas'], 'readwrite')
    tx.objectStore('categorias').put({ id: 1, nome: 'Alimentação', icone: '🍔', cor: '#f97316', tipo: 'despesa' }); tx.objectStore('categorias').put({ id: 2, nome: 'Pets', icone: '🐶', cor: '#a855f7', tipo: 'despesa' })
    tx.objectStore('contas').put({ id: 1, nome: 'Dinheiro', tipo: 'dinheiro', icone: '💵' })
    const m = new Date().toISOString().slice(0, 8)
    tx.objectStore('transacoes').put({ id: 1, tipo: 'despesa', valor: 35.9, data: m + '03', descricao: 'Lanche escola', categoriaId: 1, contaId: 1, criadoEm: Date.now() })
    tx.objectStore('transacoes').put({ id: 2, tipo: 'despesa', valor: 89, data: m + '05', descricao: 'Ração', categoriaId: 2, contaId: 1, criadoEm: Date.now() })
    tx.oncomplete = () => { q.result.close(); r() } }
}))
await ana.goto(`${BASE}/?convite=${codigo}`, { waitUntil: 'networkidle0' }); await esperarTexto(ana, 'convite para uma família')
await criarConta(ana, 'Ana', `ana.${sufixo}@teste.local`)
await esperarTexto(ana, 'Código do convite')
ok((await ana.$eval('input.uppercase', (e) => e.value)) === codigo, 'código já preenchido pelo link')
await shot(ana, 'familia-convite-celular')
await clicar(ana, 'Entrar na família', 'button:not([type=button])')
await esperarTexto(ana, 'Encontramos dados neste aparelho'); await shot(ana, 'familia-migrar-dados-celular'); ok(true, 'ofereceu enviar os 2 lançamentos antigos')
await clicar(ana, 'Sim, enviar para a família'); await esperarTexto(ana, 'Saldo do mês'); await esperarSync(ana)
await lancar(ana, 'despesa', '58,40', 'Farmácia'); await lancar(ana, 'despesa', '120,00', 'Feira', 'Mercado'); await esperarSync(ana)

// ---------- Alex lança, vê os da Ana e administra ----------
console.log('Alex de novo')
await lancar(alex, 'despesa', '412,35', 'Supermercado', 'Mercado'); await lancar(alex, 'despesa', '189,90', 'Conta de luz', 'Contas'); await lancar(alex, 'receita', '7500', 'Salário', 'Salário')
await esperarSync(alex); await alex.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(1500); await esperarSync(alex)
await alex.goto(BASE + '/#/lancamentos'); await esperarTexto(alex, 'Farmácia', 20000)
ok(await alex.evaluate(() => document.body.innerText.includes('Ração')), 'Alex vê os lançamentos migrados e novos da Ana')
await shot(alex, 'familia-lancamentos-desktop')
await alex.goto(BASE + '/#/'); await esperarTexto(alex, 'Quem gastou no mês'); await sleep(1200); await shot(alex, 'familia-dashboard-familia-toda')
await clicar(alex, 'Ana', '[role=tab]'); await sleep(1200); await shot(alex, 'familia-dashboard-so-ana')
const saldoAna = await alex.evaluate(() => document.querySelector('.text-4xl').textContent); ok(/303,30/.test(saldoAna), 'filtro "Ana": despesas dela = 35,90+89+58,40+120 → ' + saldoAna)
await clicar(alex, 'Alex', '[role=tab]'); await sleep(1000); await shot(alex, 'familia-dashboard-so-alex')
await clicar(alex, 'Família toda', '[role=tab]')
await alex.goto(BASE + '/#/ajustes'); await esperarTexto(alex, 'Categorias'); ok(!(await alex.evaluate(() => document.body.innerText.includes('Pets'))), 'categoria "Pets" da Ana não foi criada (membro não cria categoria; foi para Outros)') 
await alex.goto(BASE + '/#/familia'); await esperarTexto(alex, 'Membros (2)', 20000); await shot(alex, 'familia-admin-desktop')

// ---------- Ana: membro vê tudo, mas não edita o que não é dela ----------
console.log('Ana: permissões')
await ana.evaluate(() => window.dispatchEvent(new Event('online'))); await sleep(1500); await esperarSync(ana)
await ana.goto(BASE + '/#/'); await esperarTexto(ana, 'Supermercado', 20000); await sleep(800); await shot(ana, 'familia-dashboard-ana-celular')
await ana.goto(BASE + '/#/lancamentos'); await esperarTexto(ana, 'Supermercado'); await clicar(ana, 'Supermercado', 'button'); await sleep(500)
ok(await ana.evaluate(() => document.body.innerText.includes('só essa pessoa ou um administrador pode alterar')), 'Ana abre o do Alex: somente leitura')
await shot(ana, 'familia-lancamento-de-outro-celular', false)
await ana.keyboard.press('Escape'); await ana.goto(BASE + '/#/familia'); await esperarTexto(ana, 'Você é membro'); await shot(ana, 'familia-membro-celular')
ok(!(await ana.evaluate(() => document.body.innerText.includes('Tornar admin'))), 'Ana não vê botões de administração')

// ---------- Alex promove e remove ----------
console.log('Administração')
await alex.goto(BASE + '/#/familia'); await clicar(alex, 'Tornar admin'); await esperarTexto(alex, 'Tornar membro'); await sleep(500)
ok((await alex.evaluate(() => document.querySelectorAll('li').length)) === 2 && (await alex.evaluate(() => (document.body.innerText.match(/Administrador/g) ?? []).length)) === 2, 'Ana promovida a administradora')
await clicar(alex, 'Tornar membro'); await sleep(1000)
await clicar(alex, 'Remover'); await esperarTexto(alex, 'Membros (1)'); ok(true, 'Ana removida da família')
await ana.reload({ waitUntil: 'networkidle0' }); await esperarTexto(ana, 'Tenho um convite', 20000); ok(true, 'Ana removida volta para a tela de criar/entrar em família')
await browser.close()
console.log(falhas ? `\n${falhas} FALHA(S)` : '\nE2E FAMÍLIA OK'); process.exit(falhas ? 1 : 0)
