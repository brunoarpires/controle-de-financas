import jsQR from 'jsqr'
import { db, type ItemNota } from './db'
import { ehComprovante, interpretarComprovante, type DadosComprovante } from './comprovante'
import { aplicarSefaz, consultarNfceSefaz, ocrSpaceFallback } from './nfceApi'
import { cnpjValido, formatarCNPJ, parseDataBR, parseValorBR } from './utils'

export interface DadosNota {
  estabelecimento?: string; razaoSocial?: string; cnpj?: string; endereco?: string; cnae?: string
  data?: string; total?: number; itens: ItemNota[]; chave?: string; url?: string
  pagamento?: FormaPagamento; hora?: string
  comprovante?: DadosComprovante // preenchido quando a foto é um comprovante bancário
  fontes: string[] // de onde veio cada informação (QR, OCR, BrasilAPI)
}

export type FormaPagamento = 'credito' | 'debito' | 'pix' | 'dinheiro' | 'outro'
const TPAG: Record<string, FormaPagamento> = { '01': 'dinheiro', '02': 'outro', '03': 'credito', '04': 'debito', '05': 'credito', '10': 'outro', '11': 'outro', '12': 'outro', '13': 'outro', '15': 'outro', '16': 'outro', '17': 'pix', '18': 'outro', '19': 'outro', '90': 'outro', '99': 'outro' }
/** Detecta a forma de pagamento no texto do cupom (prioriza o bloco "FORMA DE PAGAMENTO"). */
export function detectarPagamento(texto: string): FormaPagamento | undefined {
  const norm = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const i = norm.search(/forma\s*(de)?\s*pagamento|forma\s*pagto/)
  const trecho = i >= 0 ? norm.slice(i, i + 400) : norm
  const tp = trecho.match(/tpag\D{0,3}(\d{2})/)?.[1]; if (tp && TPAG[tp]) return TPAG[tp]
  const testes: [RegExp, FormaPagamento][] = [
    [/cart\w*\s*(de)?\s*cred|cred[i1l]to|master\s?card|visa|elo\b|amex|hipercard|diners/, 'credito'],
    [/cart\w*\s*(de)?\s*deb|deb[i1l]to|maestro|electron/, 'debito'],
    [/\bpix\b/, 'pix'],
    [/dinheiro|especie/, 'dinheiro'],
  ]
  for (const [re, f] of testes) if (re.test(trecho)) return f
  if (i >= 0) for (const [re, f] of testes) if (re.test(norm)) return f
  return undefined
}

/* ---------- QR Code da NFC-e ---------- */
async function rotacionarBitmap(bmp: ImageBitmap, graus: 0 | 90 | 180 | 270): Promise<ImageBitmap> {
  if (graus === 0) return bmp
  const rad = (graus * Math.PI) / 180
  const trocar = graus === 90 || graus === 270
  const c = document.createElement('canvas')
  c.width = trocar ? bmp.height : bmp.width
  c.height = trocar ? bmp.width : bmp.height
  const ctx = c.getContext('2d')!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  return createImageBitmap(c)
}

export async function lerQRCode(img: Blob): Promise<string | null> {
  const bmp0 = await createImageBitmap(img)
  for (const graus of [0, 180, 90, 270] as const) {
    const bmp = await rotacionarBitmap(bmp0, graus)
    for (const max of [1600, 1000, 700, 2400]) {
      const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
      const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
      const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bmp, 0, 0, c.width, c.height)
      const d = ctx.getImageData(0, 0, c.width, c.height)
      const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' })
      if (r?.data) return r.data
    }
  }
  return null
}

/** Interpreta a URL do QR da NFC-e (versões 1, 2 e 3). */
export function interpretarQR(url: string): Partial<DadosNota> {
  const out: Partial<DadosNota> = { url }
  const chave = (url.match(/(?:\d[\s]?){44}/)?.[0] ?? '').replace(/\D/g, '')
  if (chave.length === 44) out.chave = chave
  let p = ''
  try { p = new URL(url).searchParams.get('p') ?? '' } catch { p = url.match(/[?&]p=([^&]+)/)?.[1] ?? '' }
  const partes = decodeURIComponent(p).split('|')
  // v2/v3 offline: chave|versao|amb|dia|vNF|digVal|idCSC|hash  (online tem só 5 partes)
  if (partes.length >= 7) {
    const v = parseValorBR(partes[4]); if (v) out.total = v
    if (out.chave && /^\d{1,2}$/.test(partes[3])) out.data = `20${out.chave.slice(2, 4)}-${out.chave.slice(4, 6)}-${partes[3].padStart(2, '0')}`
  }
  // v1: ...&chNFe=...&dhEmi=<hex>&vNF=...
  const vNF = url.match(/vNF=([\d.]+)/i)?.[1]; if (vNF) out.total = parseFloat(vNF)
  const dh = url.match(/dhEmi=([0-9a-f]+)/i)?.[1]
  if (dh) { try { const s = dh.match(/../g)!.map((h) => String.fromCharCode(parseInt(h, 16))).join(''); const d = parseDataBR(s); if (d) out.data = d; const h = s.match(/T(\d{2}):(\d{2})/); if (h) out.hora = `${h[1]}:${h[2]}` } catch { /* ignora */ } }
  return out
}

/** Dígito verificador (mód. 11) da chave de acesso de 44 dígitos. */
export function chaveValida(c: string) {
  if (!/^\d{44}$/.test(c)) return false
  let s = 0, p = 2; for (let i = 42; i >= 0; i--) { s += +c[i] * p; p = p === 9 ? 2 : p + 1 }
  const r = s % 11; return (r < 2 ? 0 : 11 - r) === +c[43] && cnpjValido(c.slice(6, 20)) && /^(1[1-7]|2[1-9]|3[1-35]|4[1-3]|5[0-3])$/.test(c.slice(0, 2))
}
// confusões comuns do OCR em cupons térmicos
const TROCAS: Record<string, string> = { '0': '68', '6': '058', '8': '0369', '3': '8', '5': '6', '1': '7', '7': '1', '9': '8' }
/** Tenta corrigir um CNPJ lido errado trocando 1 dígito; só aceita se houver uma única correção válida. */
export function corrigirCNPJ(c: string): string | undefined {
  if (cnpjValido(c)) return c
  const ok = new Set<string>()
  for (let i = 0; i < 14; i++) for (const t of TROCAS[c[i]] ?? '') { const n = c.slice(0, i) + t + c.slice(i + 1); if (cnpjValido(n)) ok.add(n) }
  return ok.size === 1 ? [...ok][0] : undefined
}

export const cnpjDaChave = (chave: string) => chave.slice(6, 20)

/* ---------- BrasilAPI (CNPJ) com cache local ---------- */
export async function consultarCNPJ(cnpj: string): Promise<any | null> {
  const c = cnpj.replace(/\D/g, '')
  const cache = await db.cnpjCache.get(c)
  if (cache) return cache.dados
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${c}`)
    if (!r.ok) return null
    const dados = await r.json()
    await db.cnpjCache.put({ cnpj: c, dados, ts: Date.now() })
    return dados
  } catch { return null }
}
const titulo = (s: string) => s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a, b) => a + b.toUpperCase())
export function resumoCNPJ(d: any) {
  const end = [d.descricao_tipo_de_logradouro, d.logradouro].filter(Boolean).join(' ')
  const endereco = [end && `${end}${d.numero ? ', ' + d.numero : ''}`, d.bairro, d.municipio].filter(Boolean).join(' - ')
  return { estabelecimento: titulo(d.nome_fantasia || d.razao_social || ''), razaoSocial: d.razao_social, endereco: titulo(endereco) + (d.uf ? `/${d.uf}` : ''), cnae: String(d.cnae_fiscal ?? ''), cnaeDescricao: d.cnae_fiscal_descricao }
}

/* ---------- OCR (tesseract.js, português) ---------- */
const RE_TOTAL_LINHA = /(valor\s+(total|a\s+pagar|pago)|total\s*(r\$|a\s+pagar)?|vl\.?\s*total|^valor\s*:)/i

/** Pontua qualidade estrutural do texto OCR (orientação / retry). */
export function pontuarTextoOCR(texto: string): number {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  let s = 0
  if (/nfc-?e|documento auxiliar|chave de acesso|nota fiscal|consumidor/.test(t)) s += 50
  if (/cnpj/.test(t)) s += 20
  if (/valor\s+a\s+pagar|valor\s+pago|total\s+a\s+pagar/.test(t)) s += 40
  else if (/valor\s+total|total\s*r\$|^valor\s*:/.test(t)) s += 20
  if (/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(t)) s += 15
  if (/forma\s*(de)?\s*pagamento|cartao|mastercard|visa|\bpix\b|comprovante/.test(t)) s += 10
  if (/\d{2}[.,\s]?\d{3}[.,\s]?\d{3}\s?[/|l1i]\s?\d{4}/.test(t)) s += 15
  const letras = (texto.match(/[A-Za-zÀ-ú]/g) || []).length
  s += Math.min(40, Math.floor(letras / 25))
  return s
}

export async function executarOCR(img: Blob, progresso?: (p: number) => void): Promise<string> {
  const { createWorker, PSM } = await import('tesseract.js')
  const bmp0 = await createImageBitmap(img)
  const worker = await createWorker('por', 1, { logger: (m: any) => m.status === 'recognizing text' && progresso?.(m.progress) })
  try {
    let melhor = '', melhorPts = -1
    // 0° primeiro; se fraco, tenta 180° (foto invertida) e depois 90°/270°
    for (const graus of [0, 180, 90, 270] as const) {
      const bmp = await rotacionarBitmap(bmp0, graus)
      const { blob, captura } = await preprocessarBitmap(bmp)
      if (captura) await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_COLUMN })
      else await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      const { data } = await worker.recognize(blob)
      let texto = data.text || ''
      if (captura && bmp.height > 2200) {
        const partes = await ocrEmFatias(worker, bmp)
        if (pontuarTextoOCR(partes) > pontuarTextoOCR(texto)) texto = partes
      }
      const pts = pontuarTextoOCR(texto)
      if (pts > melhorPts) { melhor = texto; melhorPts = pts }
      // texto estruturado o bastante: não gasta OCR nas outras orientações
      if (melhorPts >= 90) break
      // 90/270 só se 0° e 180° falharam de verdade
      if (graus === 180 && melhorPts >= 55) break
    }
    return melhor
  } finally { await worker.terminate() }
}

async function ocrEmFatias(worker: { recognize: (b: Blob) => Promise<{ data: { text: string } }> }, bmp: ImageBitmap): Promise<string> {
  const fatiaH = Math.min(1800, Math.max(900, Math.floor(bmp.height / 3)))
  const overlap = 120
  const textos: string[] = []
  for (let y = 0; y < bmp.height; y += fatiaH - overlap) {
    const h = Math.min(fatiaH, bmp.height - y)
    if (h < 80) break
    const c = document.createElement('canvas'); c.width = bmp.width; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, y, bmp.width, h, 0, 0, bmp.width, h)
    const { blob } = await preprocessarBitmap(await createImageBitmap(c), true)
    const { data } = await worker.recognize(blob)
    if (data.text?.trim()) textos.push(data.text.trim())
    if (y + h >= bmp.height) break
  }
  return textos.join('\n')
}

/** Captura estreita/alta (app bancário) vs foto de cupom térmico: escalas e contraste diferentes. */
function autoContraste(gray: Uint8ClampedArray, cutoffPct: number) {
  const hist = new Array(256).fill(0)
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++
  const n = gray.length, cut = Math.floor(n * cutoffPct / 100)
  let lo = 0, acc = 0; while (lo < 255 && acc < cut) acc += hist[lo++]
  let hi = 255; acc = 0; while (hi > lo && acc < cut) acc += hist[hi--]
  const span = Math.max(1, hi - lo)
  for (let i = 0; i < gray.length; i++) gray[i] = Math.max(0, Math.min(255, Math.round((gray[i] - lo) * 255 / span)))
}

async function preprocessarBitmap(bmp: ImageBitmap, forcarCaptura?: boolean): Promise<{ blob: Blob; captura: boolean }> {
  const w0 = bmp.width, h0 = bmp.height
  const captura = forcarCaptura || h0 / Math.max(1, w0) >= 2
  let k: number
  if (captura) {
    // cupom térmico longo: largura ~640–900 px; limita altura para Tesseract
    k = Math.max(1, 720 / w0)
    k = Math.min(k, 2.5)
    if (h0 * k > 3600) k = Math.max(0.5, 3600 / h0)
  } else {
    const maxDim = Math.max(w0, h0)
    k = maxDim > 2400 ? 2400 / maxDim : 1
  }
  const w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k))
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  const imgd = ctx.getImageData(0, 0, w, h)
  const gray = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < imgd.data.length; i += 4, p++) gray[p] = 0.299 * imgd.data[i] + 0.587 * imgd.data[i + 1] + 0.114 * imgd.data[i + 2]
  autoContraste(gray, captura ? 0.5 : 2)
  if (captura) {
    // reforço leve sem binarizar (binarizar demais apaga texto fino do cupom)
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i]
      gray[i] = v > 200 ? 255 : v < 60 ? 0 : v
    }
  } else {
    let mean = 0
    for (let i = 0; i < gray.length; i++) mean += gray[i]
    mean /= gray.length
    if (mean > 170) {
      for (let i = 0; i < gray.length; i++) gray[i] = gray[i] > 148 ? 255 : 0
    }
  }
  for (let i = 0, p = 0; i < imgd.data.length; i += 4, p++) imgd.data[i] = imgd.data[i + 1] = imgd.data[i + 2] = gray[p]
  ctx.putImageData(imgd, 0, 0)
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), 'image/png'))
  return { blob, captura }
}

/** Valor líquido da nota: prioriza "Valor a Pagar" / "VALOR PAGO" / cartão sobre "Valor total". */
export function extrairTotalNota(linhas: string[]): number | undefined {
  type Cand = { v: number; prio: number }
  const cands: Cand[] = []
  const add = (v: number | null | undefined, prio: number) => { if (v && v > 0 && v < 1e7) cands.push({ v, prio }) }
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const dinheiro = (s: string) => {
    const m = s.match(/\d{1,3}(?:[.\s]\d{3})*[,.]\s?\d{2}(?!\d)/g)
    if (!m) return null
    return parseValorBR(m[m.length - 1].replace(/\s/g, ''))
  }
  const ehCabecalho = (n: string) => /codigo|descricao|valor\s*un|qtde?\s*un|cul\s*tr|valor\s+total\s*$/.test(n) && !/r\s*\$|pagar|pago/.test(n)
  const ehItem = (s?: string) => !!s && /^\d{3}\s+\d{3,}/.test(s.trim())
  let bruto: number | undefined, desconto: number | undefined
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i]
    const n = norm(l)
    // Desconto total da nota (não o "Desconto sobre item NNN" / OCR "iten")
    if (/desconto\s+sobre\s+ite/.test(n)) continue
    if ((/descontos?\s*r\s*\$/.test(n) || (/^descontos?\b/.test(n) && !/sobre\s+ite/.test(n))) && !/economiz/.test(n)) {
      const d = dinheiro(l) ?? (linhas[i + 1] ? dinheiro(linhas[i + 1]) : null)
      if (d && d >= 0.01) desconto = Math.abs(d)
      continue
    }
    if (/tribut|economiz|quantidade\s+de\s+itens|qtde?\s+total\s+de\s+itens|subtotal/.test(n)) continue
    if (ehCabecalho(n)) continue
    let prio = 0
    // OCR: "Valor e Pagar", "Va1or a Pager", "VALOR PRGO"
    if (/valor\s+[ae1l]\s+pag[ae]r|va[l1]or\s+[ae1l]\s+pag[ae]r|total\s+[ae1l]\s+pag[ae]r|vl\.?\s*[ae1l]\s+pag[ae]r/.test(n)) prio = 100
    else if (/valor\s+p[ra]g[o0a]|va[l1]or\s+p[ra]g[o0a]|valor\s+prgo/.test(n)) prio = 95
    else if (/cart\w*\s*(de\s*)?cred|forma\s*pag/.test(n) && dinheiro(l)) prio = 88
    else if (/^valor\s*:/.test(n) || /\bvalor\s*:\s*\d/.test(n) || (/compr/i.test(n) && /\bvalor\b/.test(n))) prio = 50 // cupom cartão (OCR costuma errar dígito)
    else if (/valor\s+total|va[l1]or\s+total|vl\.?\s*total/.test(n)) prio = 35
    else if (/^total\b|total\s*r\s*\$/.test(n) && !/itens|qtd/.test(n)) prio = 30
    else continue
    const naLinha = dinheiro(l)
    if (prio === 35 && naLinha) bruto = naLinha
    const prox = linhas[i + 1]
    // Se a linha já tem dígitos (ex.: "Valor e Pager R$ 131," truncado), não herda o VALOR: do cupom de cartão
    const v = naLinha ?? (!/\d/.test(l) && !ehItem(prox) && prox && !ehCabecalho(norm(prox)) ? dinheiro(prox) : null)
    add(v, prio)
  }
  // fallback robusto: Valor total − Desconto = líquido (quando "a pagar" veio truncado no OCR)
  if (bruto != null && desconto != null && desconto > 0 && desconto < bruto) add(Math.round((bruto - desconto) * 100) / 100, 92)
  if (!cands.length) return undefined
  // empate: valor que aparece com maior prioridade; se vários no topo, o mais frequente entre prio>=80
  cands.sort((a, b) => b.prio - a.prio)
  const topo = cands[0].prio
  const fortes = cands.filter((c) => c.prio >= Math.min(80, topo))
  if (fortes.length > 1) {
    const freq = new Map<string, { v: number; n: number; prio: number }>()
    for (const c of fortes) {
      const k = c.v.toFixed(2)
      const cur = freq.get(k) ?? { v: c.v, n: 0, prio: c.prio }
      cur.n++; cur.prio = Math.max(cur.prio, c.prio)
      freq.set(k, cur)
    }
    const ranked = [...freq.values()].sort((a, b) => b.n - a.n || b.prio - a.prio)
    if (ranked[0].n > 1 || ranked[0].prio >= 90) return ranked[0].v
  }
  return cands[0].v
}

function extrairDataHoraNota(linhas: string[], tudo: string): { data?: string; hora?: string } {
  let data: string | undefined, hora: string | undefined
  const aplicarDt = (s: string) => {
    const d = parseDataBR(s)
    if (d) data ??= d
    const h = s.match(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\D{0,4}([01]?\d|2[0-3])[:h.]([0-5]\d)/)
      ?? s.match(/\b([01]?\d|2[0-3])\s*[:h.]\s*([0-5]\d)(?::\d{2})?\b/)
    if (h) hora ??= `${h[1].padStart(2, '0')}:${h[2]}`
  }
  const preferidas = linhas.filter((l) => /emiss|autoriz|serie|nfc-?e|data/i.test(l) && /\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(l))
  for (const l of preferidas) aplicarDt(l)
  if (!data || !hora) {
    for (const l of linhas) {
      if (/\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(l) || /cnpj/i.test(l)) continue
      if (/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(l)) aplicarDt(l)
      if (data && hora) break
    }
  }
  if (!data || !hora) {
    const m = tudo.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})\s*[-–T]?\s*([01]?\d|2[0-3])[:h.]([0-5]\d)/)
    if (m) {
      data ??= parseDataBR(`${m[1]}/${m[2]}/${m[3]}`) ?? undefined
      hora ??= `${m[4].padStart(2, '0')}:${m[5]}`
    }
  }
  return { data, hora }
}

/** Extrai dados de um texto de cupom fiscal obtido por OCR. */
export function interpretarTextoOCR(texto: string): Partial<DadosNota> {
  const out: Partial<DadosNota> = { itens: [] }
  const linhas = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const tudo = linhas.join('\n')
  // CNPJ: procura padrões e valida dígitos
  const cands = [...tudo.matchAll(/\d{2}[.,\s]?\d{3}[.,\s]?\d{3}\s?[/|l1I]\s?\d{4}\s?[-–]?\s?\d{2}/g)].map((m) => m[0].replace(/[^\d]/g, ''))
    .map((s) => (s.length === 15 ? s.slice(0, 8) + s.slice(9) : s)) // "/" lido como 1
  const c14 = cands.filter((c) => c.length === 14)
  const cnpj = c14.find((c) => cnpjValido(c)) ?? c14.map(corrigirCNPJ).find(Boolean) ?? c14[0]
  if (cnpj) out.cnpj = formatarCNPJ(cnpj)
  // chave de acesso (44 dígitos, possivelmente em blocos de 4) — só uso local, sem API paga
  const digitos = tudo.replace(/[^\d]/g, '')
  for (let i = 0; i + 44 <= digitos.length; i++) {
    const c = digitos.slice(i, i + 44)
    if (chaveValida(c)) { out.chave = c; break }
  }
  if (!out.chave) {
    const blocos4 = [...tudo.matchAll(/(?:\d{4}[\s.-]*){10}\d{4}/g)].map((m) => m[0].replace(/\D/g, ''))
    for (const c of blocos4) if (c.length === 44 && chaveValida(c)) { out.chave = c; break }
  }
  if (out.chave && !out.cnpj) {
    const c = cnpjDaChave(out.chave)
    if (cnpjValido(c)) out.cnpj = formatarCNPJ(c)
  }
  const dh = extrairDataHoraNota(linhas, tudo)
  out.data = dh.data; out.hora = dh.hora
  out.total = extrairTotalNota(linhas)
  // estabelecimento: primeiras linhas com letras antes do CNPJ
  const idxCnpj = linhas.findIndex((l) => /cnpj/i.test(l))
  const cab = linhas.slice(0, idxCnpj > 0 ? idxCnpj : 3).filter((l) => /[a-z]{3,}/i.test(l) && !/documento|auxiliar|nota fiscal|consumidor|eletr/i.test(l))
  out.pagamento = detectarPagamento(tudo)
  if (cab[0]) out.estabelecimento = cab[0].replace(/[^\p{L}\d &.'-]/gu, '').trim()
  // itens: linhas com código + descrição + ... + valor no fim
  const qtdLinha = /^(\d+(?:[,.]\d+)?)\s*(?:UN|KG|UND|PC|LT|L|CX|G)\b\.?\s*[xX*]\s*\d+[,.]\d{2}\s+(?:\S+\s+)?(\d{1,4}[,.]\d{2})$/i
  const usadas = new Set<number>()
  for (let i = 0; i + 1 < linhas.length; i++) {
    const q = linhas[i + 1].match(qtdLinha)
    const dm = linhas[i].match(/^(?:\d{1,3}\s+)?(?:\d{1,14}\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 .,/%-]{2,50}?)$/)
    if (q && dm && !/cnpj|total|pagamento|qtde|descri/i.test(linhas[i])) { out.itens!.push({ descricao: dm[1].trim(), quantidade: parseValorBR(q[1]), valor: parseValorBR(q[2]) }); usadas.add(i); usadas.add(i + 1); i++ }
  }
  for (const [k, l] of linhas.entries()) {
    if (usadas.has(k) || /^\d*[,.]?\d*\s*(UN|KG|UND|PC|LT|CX)\b/i.test(l)) continue
    if (RE_TOTAL_LINHA.test(l) || /cnpj|troco|desconto|forma|cart|dinheiro|tribut|subtotal|acr[eé]s|via cliente|sitef|autorizacao|stoneid|lancamento\s*:|caixa\s*:|credito a vista|mastercard|mastercar|economiz/i.test(l)) continue
    const m = l.match(/^(?:\d{1,3}\s+)?(?:\d{4,14}\s+)?([A-Za-zÀ-ú][A-Za-zÀ-ú0-9 .,/%-]{2,40}?)\s+(?:(\d+(?:[,.]\d+)?)\s*(?:UN|KG|UND|PC|LT|L|CX|G)?\s*[xX*]?\s*\d+[,.]\d{2}\s+)?(\d{1,4}[,.]\d{2})$/i)
    if (m) out.itens!.push({ descricao: m[1].trim(), quantidade: m[2] ? parseValorBR(m[2]) : null, valor: parseValorBR(m[3]) })
  }
  return out
}

/** Interpreta o texto já lido (OCR): comprovante bancário/maquininha ou cupom fiscal. Sem itens inventados em comprovante. */
export function interpretarLeitura(texto: string): DadosNota {
  const r: DadosNota = { itens: [], fontes: ['OCR'] }
  if (ehComprovante(texto)) {
    const c = interpretarComprovante(texto)
    Object.assign(r, { comprovante: c, total: c.valor, data: c.data, hora: c.hora, estabelecimento: c.descricao, pagamento: c.pagamento })
    return r
  }
  const t = interpretarTextoOCR(texto)
  r.chave = t.chave; r.data = t.data; r.total = t.total; r.cnpj = t.cnpj
  r.estabelecimento = t.estabelecimento; r.pagamento = t.pagamento; r.hora = t.hora
  r.itens = t.itens ?? []
  return r
}

function ocrFraco(r: DadosNota) {
  return r.total == null || !r.data
}

/** Fluxo completo: QR → SEFAZ → OCR (Tesseract) → OCR.space (opcional) → CNPJ. */
export async function analisarNota(img: Blob, etapa: (msg: string, p?: number) => void): Promise<DadosNota> {
  const r: DadosNota = { itens: [], fontes: [] }
  etapa('Procurando o QR Code da nota…')
  const qr = await lerQRCode(img).catch(() => null)
  if (qr) { Object.assign(r, interpretarQR(qr)); r.fontes.push('QR Code') }

  if (r.url || r.chave) {
    etapa('Consultando a nota na SEFAZ…')
    const sefaz = await consultarNfceSefaz({ url: r.url, chave: r.chave })
    if (sefaz?.total != null || sefaz?.data) aplicarSefaz(r, sefaz)
  }

  const sefazOk = r.fontes.includes('SEFAZ') && r.total != null && !!r.data

  // Comprovantes bancários / OCR: só se SEFAZ não fechou a nota
  if (!sefazOk) {
    etapa('Lendo o texto da nota (OCR)…', 0)
    try {
      let texto = await executarOCR(img, (p) => etapa('Lendo o texto da nota (OCR)…', p))
      r.fontes.push('OCR')
      if (!qr) {
        const l = interpretarLeitura(texto)
        if (l.comprovante) { Object.assign(r, l); r.fontes = [...new Set([...r.fontes, ...l.fontes])]; return r }
      }
      const preencherOcr = (t: Partial<DadosNota>, sobrescrever = false) => {
        if (sobrescrever) {
          if (t.total != null) r.total = t.total
          if (t.data) r.data = t.data
          if (t.hora) r.hora = t.hora
          if (t.cnpj) r.cnpj = t.cnpj
          if (t.estabelecimento) r.estabelecimento = t.estabelecimento
          if (t.pagamento) r.pagamento = t.pagamento
          if (t.chave) r.chave = t.chave
          if (t.itens?.length) r.itens = t.itens
        } else {
          r.chave ??= t.chave; r.data ??= t.data; r.total ??= t.total; r.cnpj ??= t.cnpj
          r.estabelecimento ??= t.estabelecimento; r.pagamento ??= t.pagamento; r.hora ??= t.hora
          if (!r.itens.length && t.itens?.length) r.itens = t.itens
        }
      }
      preencherOcr(interpretarTextoOCR(texto), false)

      if (ocrFraco(r)) {
        etapa('Tentando OCR reforçado…')
        const extra = await ocrSpaceFallback(img)
        if (extra) {
          texto = `${texto}\n${extra}`
          r.fontes.push('OCR.space')
          preencherOcr(interpretarTextoOCR(extra), true)
        }
      }

      if (!r.fontes.includes('SEFAZ') && (r.url || r.chave)) {
        etapa('Consultando a nota na SEFAZ…')
        const sefaz = await consultarNfceSefaz({ url: r.url, chave: r.chave })
        if (sefaz?.total != null || sefaz?.data) aplicarSefaz(r, sefaz)
      }
    } catch (e) { console.warn('OCR falhou', e) }
  }

  if (r.chave && chaveValida(r.chave)) { const c = cnpjDaChave(r.chave); if (cnpjValido(c)) r.cnpj = formatarCNPJ(c) }
  if (r.cnpj) {
    etapa('Consultando o CNPJ do estabelecimento…')
    const d = await consultarCNPJ(r.cnpj)
    if (d) {
      const s = resumoCNPJ(d)
      const pareceEndereco = (t: string) => /^(av\.?|avenida|r\.?|rua|alameda|al\.?|rod\.?|pra[cç]a|trav\.?|estrada)\b/i.test(t.trim())
      // SEFAZ/OCR já têm nome: só completa endereço/CNAE/razão; troca se OCR pegou o endereço
      r.razaoSocial ??= s.razaoSocial
      r.endereco ??= s.endereco
      r.cnae ??= s.cnae
      if (!r.estabelecimento || pareceEndereco(r.estabelecimento) || /^cnpj\b/i.test(r.estabelecimento)) {
        r.estabelecimento = s.estabelecimento
      }
      r.fontes.push('BrasilAPI (CNPJ)')
    }
  }
  return r
}
