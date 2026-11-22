// Responsividade em celulares: capturas de todas as telas em 3 larguras; falha se houver
// rolagem horizontal ou ícone sobrepondo o texto de um campo.
// LOCAL=http://localhost:4173 (modo local)  NUVEM=http://localhost:4174 (modo família, opcional)
import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'
const LOCAL = process.env.LOCAL ?? 'http://localhost:4173', NUVEM = process.env.NUVEM
const VPS = [[360, 740], [390, 844], [412, 915]]
const DIR = 'screenshots/responsivo'; mkdirSync(DIR, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME ?? '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--lang=pt-BR'] })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let falhas = 0
const ROTAS = [['inicio', '/'], ['lancamentos', '/lancamentos'], ['importar', '/importar'], ['importar-nota', '/importar/nota'], ['importar-planilha', '/importar/planilha'], ['orcamento', '/orcamento'], ['ajustes', '/ajustes']]
async function checar(p, nome) {
  await sleep(500)
  const r = await p.evaluate(() => {
    const sw = document.documentElement.scrollWidth, w = innerWidth
    const largos = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > w + 1 && !e.closest('[role=tablist]')).slice(0, 3).map((e) => e.tagName + '.' + String(e.className).slice(0, 40))
    const sobre = [...document.querySelectorAll('.relative > input')].filter((i) => {
      const ic = i.parentElement.querySelector('.absolute'); if (!ic) return false
      return ic.getBoundingClientRect().right > i.getBoundingClientRect().left + parseFloat(getComputedStyle(i).paddingLeft)
    }).length
    return { sw, w, largos, sobre }
  })
  const ok = r.sw <= r.w && r.sobre === 0
  if (!ok) falhas++
  console.log(ok ? '  ✔' : '  ✘', nome, `scrollWidth=${r.sw} vw=${r.w}`, r.sobre ? `sobrepostos=${r.sobre}` : '', ok ? '' : r.largos.join(' | '))
  await p.screenshot({ path: `${DIR}/${nome}.png` })
}
async function telas(p, base, modo, w) {
  for (const [n, r] of ROTAS) { await p.goto(base + '/#' + r, { waitUntil: 'networkidle0' }); await checar(p, `${modo}-${n}-${w}`) }
  await p.goto(base + '/#/', { waitUntil: 'networkidle0' }); await p.click('button[aria-label="Novo lançamento"]'); await checar(p, `${modo}-novo-lancamento-${w}`)
}
async function novaPagina(w, h) {
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage()
  await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); p.on('dialog', (d) => d.accept()); return [ctx, p]
}
const clicarTexto = (p, sel, t) => p.$$eval(sel, (b, t) => b.find((e) => e.textContent.includes(t) && !e.disabled).click(), t)
for (const [w, h] of VPS) {
  console.log(`Local ${w}x${h}`)
  const [ctx, p] = await novaPagina(w, h); await telas(p, LOCAL, 'local', w); await ctx.close()
}
await browser.close()
console.log(falhas ? falhas + " falha(s)" : "Tudo ok"); process.exit(falhas ? 1 : 0)
