// Teste ponta a ponta + capturas de tela: node scripts/screenshots.mjs (com `npm run preview` rodando)
import puppeteer from 'puppeteer-core'
const BASE = process.env.BASE ?? 'http://localhost:4173'
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=pt-BR'], env: { ...process.env, LANG: 'pt_BR.UTF-8', LANGUAGE: 'pt_BR' } })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const clickText = async (p, txt) => { await p.$$eval('button,a,label', (els, t) => els.find((e) => e.textContent.includes(t))?.click(), txt) }
const shot = (p, n) => p.screenshot({ path: `screenshots/${n}.png`, fullPage: true })

async function rodar(nome, viewport, popular) {
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage(); await p.setViewport(viewport)
  p.on('console', (m) => m.type() === 'error' && console.log('[console]', m.text()))
  await p.goto(BASE + '/#/importar/planilha', { waitUntil: 'networkidle0' })
  // Importa planilha
  const inp = await p.$('input[type=file]'); await inp.uploadFile('exemplos/extrato-exemplo.csv'); await sleep(800)
  await shot(p, `${nome}-importar-planilha-colunas`)
  await clickText(p, 'Pré-visualizar'); await sleep(1500)
  await shot(p, `${nome}-importar-planilha-revisao`)
  await clickText(p, 'Importar '); await sleep(1000)
  const n = await p.evaluate(() => new Promise((r) => { const q = indexedDB.open('financas-v2'); q.onsuccess = () => { const c = q.result.transaction('transacoes').objectStore('transacoes').count(); c.onsuccess = () => r(c.result) } }))
  console.log(nome, 'lançamentos importados:', n)
  // Orçamento
  await p.goto(BASE + '/#/orcamento'); await sleep(800)
  const ins = await p.$$('input[inputmode=decimal]')
  for (const [i, v] of [[0, '400'], [2, '300'], [5, '150']]) { await ins[i].type(v); await p.keyboard.press('Tab'); await sleep(200) }
  await sleep(500); await shot(p, `${nome}-orcamento`)
  await p.goto(BASE + '/#/'); await sleep(1500); await shot(p, `${nome}-dashboard`)
  await p.goto(BASE + '/#/lancamentos'); await sleep(1000); await p.screenshot({ path: `screenshots/${nome}-lancamentos.png` })
  // Novo lançamento (formulário)
  await p.goto(BASE + '/#/'); await sleep(500); await clickText(p, '− Despesa'); await sleep(300)
  await p.type('input[placeholder="0,00"]', '42,90'); await p.type('input[placeholder^="Ex.:"]', 'Padaria Pão Quente'); await sleep(800)
  await p.screenshot({ path: `screenshots/${nome}-novo-lancamento.png` })
  await clickText(p, 'Salvar'); await sleep(500)
  if (popular) {
    // Nota fiscal (QR + OCR + BrasilAPI)
    await p.goto(BASE + '/#/importar/nota'); await sleep(500)
    const f = (await p.$$('input[type=file]'))[1]; await f.uploadFile('exemplos/nota-exemplo.jpg')
    const t0 = Date.now()
    await p.waitForFunction(() => document.body.innerText.includes('Confira os dados'), { timeout: 180000 })
    console.log(nome, 'nota analisada em', ((Date.now() - t0) / 1000).toFixed(1), 's')
    const campos = await p.$$eval('input,select', (els) => els.filter((e) => e.type !== 'file').map((e) => e.tagName === 'SELECT' ? e.options[e.selectedIndex]?.text : e.value))
    console.log(nome, 'campos da nota:', JSON.stringify(campos))
    console.log(nome, 'fontes:', await p.$eval('h2 + p', (e) => e.textContent).catch(() => '?'))
    await shot(p, `${nome}-importar-nota-revisao`)
    await clickText(p, 'Salvar despesa'); await sleep(800)
  }
  await ctx.close()
}
await rodar('desktop', { width: 1366, height: 900 }, true)
await rodar('mobile', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, true)
// modo escuro
{ const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true })
  await p.goto(BASE + '/#/importar/planilha', { waitUntil: 'networkidle0' }); await p.evaluate(() => localStorage.setItem('tema', 'escuro'))
  const inp = await p.$('input[type=file]'); await inp.uploadFile('exemplos/extrato-exemplo.csv'); await sleep(500); await clickText(p, 'Pré-visualizar'); await sleep(1200); await clickText(p, 'Importar '); await sleep(800)
  await p.goto(BASE + '/#/'); await p.reload(); await sleep(1500); await shot(p, 'mobile-dashboard-escuro'); await ctx.close() }
await browser.close()
