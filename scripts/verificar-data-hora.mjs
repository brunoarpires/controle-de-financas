// Verifica campos Data/Horário no mobile (sem picker nativo type=time/date).
// Uso: com `npm run preview` em http://localhost:4173 → node scripts/verificar-data-hora.mjs
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE ?? 'http://localhost:4173'
const DIR = 'screenshots/data-hora'
mkdirSync(DIR, { recursive: true })
const VPS = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
]
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--lang=pt-BR'],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0

async function checarCampos(p, rotulo) {
  const r = await p.evaluate(() => {
    const nativos = [...document.querySelectorAll('input[type=date],input[type=time],input[type=datetime-local]')].length
    const data = document.querySelector('input[aria-label="Data"]')
    const hora = document.querySelector('select[aria-label="Hora"]')
    const minuto = document.querySelector('select[aria-label="Minuto"]')
    const w = innerWidth
    const boxes = [data, hora, minuto].filter(Boolean).map((el) => {
      const b = el.getBoundingClientRect()
      return {
        tag: el.tagName,
        aria: el.getAttribute('aria-label'),
        left: Math.round(b.left),
        right: Math.round(b.right),
        width: Math.round(b.width),
        cortado: b.right > w + 1 || b.left < -1 || b.width < 40,
      }
    })
    return { nativos, boxes, w, temData: !!data, temHora: !!hora, temMinuto: !!minuto }
  })
  const ok = r.nativos === 0 && r.temData && r.temHora && r.temMinuto && r.boxes.every((b) => !b.cortado)
  if (!ok) falhas++
  console.log(ok ? '  ✔' : '  ✘', rotulo, JSON.stringify(r))
  return ok
}

async function shot(p, nome) {
  await p.screenshot({ path: `${DIR}/${nome}.png` })
}

for (const vp of VPS) {
  console.log(`Viewport ${vp.name}`)
  const ctx = await browser.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport({ ...vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  p.on('dialog', (d) => d.accept())

  // Novo lançamento
  await p.goto(BASE + '/#/', { waitUntil: 'networkidle0' })
  await sleep(400)
  await p.$$eval('button', (els) => els.find((e) => e.textContent.includes('− Despesa'))?.click())
  await sleep(500)
  await p.waitForSelector('input[aria-label="Data"]')
  // Preenche horário para mostrar valor legível
  await p.select('select[aria-label="Hora"]', '14')
  await p.select('select[aria-label="Minuto"]', '35')
  await sleep(200)
  await checarCampos(p, `${vp.name} novo-lancamento`)
  // Rola até Data/Horário ficarem visíveis no modal
  await p.evaluate(() => {
    const el = document.querySelector('select[aria-label="Minuto"]')
    el?.scrollIntoView({ block: 'center', inline: 'nearest' })
  })
  await sleep(200)
  await shot(p, `${vp.name}-novo-lancamento-data-hora`)
  await p.click('select[aria-label="Hora"]')
  await sleep(200)
  await shot(p, `${vp.name}-novo-lancamento-select-hora`)
  await p.keyboard.press('Escape')
  await p.$$eval('button', (els) => els.find((e) => e.getAttribute('aria-label') === 'Fechar')?.click())
  await sleep(300)

  // Editar lançamento: cria um e abre
  await p.$$eval('button', (els) => els.find((e) => e.textContent.includes('− Despesa'))?.click())
  await sleep(400)
  await p.type('input[placeholder="0,00"]', '15,50')
  await p.type('input[placeholder^="Ex.:"]', 'Teste horário mobile')
  await sleep(400)
  // Garante categoria selecionada (primeiro botão do grid de categorias)
  await p.$$eval('label', (labels) => {
    const lab = labels.find((l) => l.textContent === 'Categoria')
    const grid = lab?.nextElementSibling
    const btn = grid?.querySelector('button')
    btn?.click()
  })
  await p.select('select[aria-label="Hora"]', '09')
  await p.select('select[aria-label="Minuto"]', '05')
  await sleep(200)
  await p.$$eval('button', (els) => els.find((e) => e.textContent.trim() === 'Salvar' && !e.disabled)?.click())
  await sleep(700)
  await p.goto(BASE + '/#/lancamentos', { waitUntil: 'networkidle0' })
  await sleep(700)
  await p.$$eval('button', (els) => {
    const t = els.find((e) => e.textContent?.includes('Teste horário mobile'))
    t?.click()
  })
  await sleep(700)
  const editou = await p.$('h2')
  const titulo = editou ? await p.evaluate((el) => el.textContent, editou) : ''
  if (titulo.includes('Editar lançamento') && await p.$('input[aria-label="Data"]')) {
    await checarCampos(p, `${vp.name} editar-lancamento`)
    await p.evaluate(() => {
      document.querySelector('select[aria-label="Minuto"]')?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await sleep(200)
    await shot(p, `${vp.name}-editar-lancamento-data-hora`)
    await p.$$eval('button', (els) => els.find((e) => e.getAttribute('aria-label') === 'Fechar')?.click())
  } else {
    falhas++
    console.log('  ✘', vp.name, 'editar-lancamento não abriu', titulo)
  }

  // Importar nota: sobe exemplo e captura Data/Horário na revisão
  await p.goto(BASE + '/#/importar/nota', { waitUntil: 'networkidle0' })
  await sleep(400)
  const files = await p.$$('input[type=file]')
  const fileInput = files[files.length - 1]
  await fileInput.uploadFile('exemplos/nota-exemplo.jpg')
  try {
    await p.waitForFunction(() => document.body.innerText.includes('Confira os dados'), { timeout: 180000 })
    await sleep(500)
    await checarCampos(p, `${vp.name} importar-nota`)
    await p.evaluate(() => {
      document.querySelector('select[aria-label="Minuto"]')?.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await sleep(200)
    await shot(p, `${vp.name}-importar-nota-data-hora`)
  } catch {
    falhas++
    console.log('  ✘', vp.name, 'importar-nota revisão não carregou a tempo')
    await shot(p, `${vp.name}-importar-nota-falha`)
  }

  await ctx.close()
}

await browser.close()
console.log(falhas ? `${falhas} falha(s)` : 'Tudo ok')
process.exit(falhas ? 1 : 0)
