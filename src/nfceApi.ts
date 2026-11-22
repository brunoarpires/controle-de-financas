import type { DadosNota, FormaPagamento } from './nota'
import { formatarCNPJ } from './utils'

export interface DadosSefaz {
  estabelecimento?: string
  cnpj?: string
  endereco?: string
  data?: string
  hora?: string
  total?: number
  pagamento?: FormaPagamento
  itens?: { descricao: string; quantidade: number | null; valor: number | null }[]
  chave?: string
  url?: string
  fonte?: string
  aviso?: string
  erro?: string
}

/** Consulta /api/nfce (SEFAZ). Falha silenciosa se offline/captcha/não deployado. Sem API key. */
export async function consultarNfceSefaz(opts: { url?: string; chave?: string }): Promise<DadosSefaz | null> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const r = await fetch('/api/nfce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: opts.url, chave: opts.chave }),
      })
      if (!r.ok) {
        if (tentativa === 0) { await new Promise((x) => setTimeout(x, 600)); continue }
        return null
      }
      const j = await r.json() as DadosSefaz
      if (!j || j.erro) return null
      return j
    } catch {
      if (tentativa === 0) { await new Promise((x) => setTimeout(x, 600)); continue }
      return null
    }
  }
  return null
}

/**
 * OCR.space via /api/ocr — estritamente opcional.
 * Sem OCR_SPACE_API_KEY no servidor a function responde 503 e isto retorna null
 * (app continua só com SEFAZ + Tesseract).
 */
export async function ocrSpaceFallback(img: Blob): Promise<string | null> {
  try {
    // Probe barato: evita comprimir/enviar imagem se a chave não está configurada
    const probe = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: '' }),
    })
    if (probe.status === 503) return null
    // 400 = chave presente mas body incompleto → seguir; outros erros → abortar
    if (probe.status !== 400 && !probe.ok) return null

    const compact = await comprimirParaOcrSpace(img)
    const buf = await compact.arrayBuffer()
    const bytes = new Uint8Array(buf)
    let bin = ''
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    const imageBase64 = btoa(bin)
    const r = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, mime: 'image/jpeg' }),
    })
    if (r.status === 503 || !r.ok) return null
    const j = await r.json() as { texto?: string }
    return j.texto?.trim() || null
  } catch { return null }
}

async function comprimirParaOcrSpace(img: Blob, maxBytes = 900_000): Promise<Blob> {
  const bmp = await createImageBitmap(img)
  let w = bmp.width, h = bmp.height
  const maxDim = 1600
  const k0 = Math.min(1, maxDim / Math.max(w, h))
  w = Math.max(1, Math.round(w * k0)); h = Math.max(1, Math.round(h * k0))
  for (const q of [0.72, 0.55, 0.4, 0.28]) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
    const blob = await new Promise<Blob>((res) => c.toBlob((b) => res(b!), 'image/jpeg', q))
    if (blob.size <= maxBytes) return blob
    w = Math.max(1, Math.round(w * 0.85)); h = Math.max(1, Math.round(h * 0.85))
  }
  const c = document.createElement('canvas'); c.width = w; c.height = h
  c.getContext('2d')!.drawImage(bmp, 0, 0, w, h)
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/jpeg', 0.25))
}

/** Mescla resultado SEFAZ por cima (preferência) nos campos oficiais. */
export function aplicarSefaz(r: DadosNota, s: DadosSefaz): void {
  if (s.estabelecimento) r.estabelecimento = s.estabelecimento
  if (s.cnpj) r.cnpj = formatarCNPJ(s.cnpj)
  if (s.endereco) r.endereco = s.endereco
  if (s.total != null) r.total = s.total
  if (s.data) r.data = s.data
  if (s.hora) r.hora = s.hora
  if (s.pagamento) r.pagamento = s.pagamento
  if (s.chave) r.chave = s.chave
  if (s.url) r.url = s.url
  if (s.itens?.length) r.itens = s.itens.map((i) => ({ descricao: i.descricao, quantidade: i.quantidade, valor: i.valor }))
  if (!r.fontes.includes('SEFAZ')) r.fontes.push('SEFAZ')
}
