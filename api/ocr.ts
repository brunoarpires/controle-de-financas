/**
 * POST /api/ocr — OCR.space (tier gratuito) como fallback opcional.
 * Requer OCR_SPACE_API_KEY no ambiente Vercel. Sem a chave → 503 silencioso no cliente.
 *
 * Limites do plano free (docs/fórum OCR.space, 2024):
 * - ~1 MB (1024 KB) por arquivo
 * - ~25.000 conversões/mês
 * - ~180 conversões/hora
 * Engine 2, language por.
 */
type Req = { method?: string; body?: unknown; headers?: Record<string, string | string[] | undefined> }
type Res = {
  status: (n: number) => Res
  json: (b: unknown) => void
  setHeader: (k: string, v: string) => void
}

const MAX_B64 = Math.floor(900 * 1024 * 4 / 3) // margem sob o limite de 1 MB do arquivo

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido' })
    return
  }
  const key = process.env.OCR_SPACE_API_KEY?.trim()
  if (!key) {
    res.status(503).json({ erro: 'OCR.space não configurado', disabled: true })
    return
  }
  try {
    const body = (req.body ?? {}) as { imageBase64?: string; mime?: string }
    let b64 = (body.imageBase64 ?? '').replace(/^data:[^;]+;base64,/, '')
    if (!b64 || b64.length < 32) {
      res.status(400).json({ erro: 'imageBase64 ausente' })
      return
    }
    if (b64.length > MAX_B64) {
      res.status(413).json({ erro: 'Imagem maior que o limite free (~1 MB). Comprima antes.' })
      return
    }
    const mime = body.mime && /^image\/(jpeg|png|gif|bmp|webp)$/i.test(body.mime) ? body.mime : 'image/jpeg'
    const form = new FormData()
    form.set('base64Image', `data:${mime};base64,${b64}`)
    form.set('language', 'por')
    form.set('OCREngine', '2')
    form.set('detectOrientation', 'true')
    form.set('isOverlayRequired', 'false')
    form.set('scale', 'true')

    const r = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST',
      headers: { apikey: key },
      body: form,
      signal: AbortSignal.timeout(25_000),
    })
    const json = await r.json() as {
      IsErroredOnProcessing?: boolean
      ErrorMessage?: string | string[]
      ParsedResults?: { ParsedText?: string }[]
      OCRExitCode?: number
    }
    if (!r.ok || json.IsErroredOnProcessing) {
      const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : (json.ErrorMessage || `HTTP ${r.status}`)
      res.status(502).json({ erro: msg })
      return
    }
    const texto = (json.ParsedResults ?? []).map((p) => p.ParsedText ?? '').join('\n').trim()
    res.status(200).json({ texto, fonte: 'OCR.space' })
  } catch (e) {
    res.status(502).json({ erro: e instanceof Error ? e.message : 'Falha no OCR.space' })
  }
}
