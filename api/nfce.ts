/**
 * GET/POST /api/nfce — consulta pública NFC-e (SEFAZ) com allowlist anti-SSRF.
 * Body/query: { url?: string, chave?: string }
 */
import { montarUrlConsulta, parseHtmlNfce, validarUrlNfce } from './lib/nfce-parse.js'

type Req = { method?: string; query?: Record<string, string | string[] | undefined>; body?: unknown }
type Res = {
  status: (n: number) => Res
  json: (b: unknown) => void
  setHeader: (k: string, v: string) => void
}

function lerParams(req: Req): { url?: string; chave?: string } {
  const q = req.query ?? {}
  const one = (v: string | string[] | undefined) => Array.isArray(v) ? v[0] : v
  let url = one(q.url)
  let chave = one(q.chave)
  const body = req.body
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (typeof b.url === 'string') url ??= b.url
    if (typeof b.chave === 'string') chave ??= b.chave
  }
  return { url, chave }
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ erro: 'Método não permitido' })
    return
  }
  try {
    const { url, chave } = lerParams(req)
    if (!url && !chave) {
      res.status(400).json({ erro: 'Informe url do QR ou chave de acesso' })
      return
    }
    // Valida URL do cliente cedo (mesmo que montarUrlConsulta reescreva)
    if (url) validarUrlNfce(url)

    const { fetchUrl, chave: ch, uf } = montarUrlConsulta({ url, chave })
    // Garante que o destino final também está na allowlist
    validarUrlNfce(fetchUrl)

    const ctrl = AbortSignal.timeout(12_000)
    const r = await fetch(fetchUrl, {
      signal: ctrl,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FinancasPessoais/1.0)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
    })
    if (!r.ok) {
      res.status(502).json({ erro: `SEFAZ respondeu ${r.status}`, uf, chave: ch })
      return
    }
    // Só aceita se o host final (após redirect) continuar permitido
    try { validarUrlNfce(r.url) } catch {
      res.status(502).json({ erro: 'Redirect para host não permitido', uf })
      return
    }
    const html = await r.text()
    if (html.length > 2_000_000) {
      res.status(502).json({ erro: 'Resposta SEFAZ grande demais' })
      return
    }
    const dados = parseHtmlNfce(html, { url: fetchUrl, chave: ch, uf })
    if (dados.aviso && !dados.total) {
      res.status(503).json({ erro: dados.aviso, ...dados })
      return
    }
    res.status(200).json(dados)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Falha na consulta'
    const code = /allowlist|inválida|credenciais|Porta|IP|HTTPS|necessário|não suportada|44 dígitos/i.test(msg) ? 400 : 502
    res.status(code).json({ erro: msg })
  }
}
