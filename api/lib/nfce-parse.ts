/**
 * Parser e allowlist da consulta pública NFC-e (SEFAZ).
 * Começa por SP (ConsultaQRCode) e é extensível a outros UFs.
 */
import { cnpjValido, formatarCNPJ, parseDataBR, parseValorBR } from './br.js'

export type FormaPagamento = 'credito' | 'debito' | 'pix' | 'dinheiro' | 'outro'

export interface ItemNfce {
  descricao: string
  quantidade: number | null
  valor: number | null
}

export interface DadosNfceSefaz {
  estabelecimento?: string
  cnpj?: string
  endereco?: string
  data?: string
  hora?: string
  total?: number
  pagamento?: FormaPagamento
  itens: ItemNfce[]
  chave?: string
  url?: string
  uf?: string
  fonte: 'SEFAZ'
  aviso?: string
}

/** Domínios oficiais de consulta NFC-e (evita SSRF). */
export const SEFAZ_HOST_ALLOW: RegExp[] = [
  /^([a-z0-9-]+\.)*nfce\.fazenda\.sp\.gov\.br$/i,
  /^www\.fazenda\.sp\.gov\.br$/i,
  /^([a-z0-9-]+\.)*sefaz\.[a-z]{2}\.gov\.br$/i,
  /^([a-z0-9-]+\.)*fazenda\.[a-z]{2}\.gov\.br$/i,
  /^([a-z0-9-]+\.)*svrs\.rs\.gov\.br$/i,
  /^([a-z0-9-]+\.)*svc\.fazenda\.gov\.br$/i,
  /^([a-z0-9-]+\.)*nfe\.fazenda\.gov\.br$/i,
]

export function hostPermitido(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '')
  return SEFAZ_HOST_ALLOW.some((re) => re.test(h))
}

/** Valida URL de consulta; rejeita IPs, userinfo, portas não-padrão e hosts fora da allowlist. */
export function validarUrlNfce(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new Error('URL inválida') }
  if (u.protocol !== 'https:') throw new Error('Só HTTPS é permitido')
  if (u.username || u.password) throw new Error('URL com credenciais rejeitada')
  if (u.port && u.port !== '443') throw new Error('Porta não permitida')
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(u.hostname) || u.hostname.includes(':')) throw new Error('IP direto não permitido')
  if (!hostPermitido(u.hostname)) throw new Error('Domínio fora da allowlist SEFAZ')
  return u
}

const UF_HOST: Record<string, (p: string, chave: string) => string> = {
  // SP: página do QR (sem captcha quando `p` completo vem do cupom)
  '35': (p) => `https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=${encodeURIComponent(p)}`,
}

export function ufDaChave(chave: string): string | undefined {
  const c = chave.replace(/\D/g, '')
  return c.length >= 2 ? c.slice(0, 2) : undefined
}

/** Monta URL de consulta a partir do link do QR ou da chave (quando o UF tiver builder). */
export function montarUrlConsulta(opts: { url?: string; chave?: string }): { fetchUrl: string; chave?: string; uf?: string } {
  let chave = (opts.chave ?? '').replace(/\D/g, '')
  let pParam = ''
  let fromUrl: URL | undefined

  if (opts.url) {
    fromUrl = validarUrlNfce(opts.url)
    const p = fromUrl.searchParams.get('p') ?? ''
    if (p) {
      pParam = decodeURIComponent(p)
      const c = pParam.split('|')[0]?.replace(/\D/g, '') ?? ''
      if (c.length === 44) chave = c
    } else {
      const m = fromUrl.href.match(/\d{44}/)
      if (m) chave = m[0]
    }
  }
  if (chave && chave.length !== 44) throw new Error('Chave de acesso deve ter 44 dígitos')

  const uf = ufDaChave(chave)
  if (pParam && uf === '35') {
    return { fetchUrl: UF_HOST['35']!(pParam, chave), chave, uf }
  }
  if (fromUrl && hostPermitido(fromUrl.hostname)) {
    // Reescreve QR curto SP → ConsultaQRCode
    if (/nfce\.fazenda\.sp\.gov\.br$/i.test(fromUrl.hostname) && /\/qrcode/i.test(fromUrl.pathname) && pParam) {
      return { fetchUrl: UF_HOST['35']!(pParam, chave), chave, uf }
    }
    return { fetchUrl: fromUrl.toString(), chave, uf }
  }
  if (chave && uf && UF_HOST[uf] && pParam) {
    return { fetchUrl: UF_HOST[uf](pParam, chave), chave, uf }
  }
  if (chave && uf === '35' && !pParam) {
    throw new Error('Para SP é necessário o link completo do QR Code (parâmetro p)')
  }
  throw new Error(uf ? `Consulta automática ainda não suportada para UF ${uf}` : 'Informe url do QR ou chave')
}

function stripTags(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim()
}

function labelValor(html: string, label: RegExp): string | undefined {
  const re = new RegExp(`<label[^>]*>\\s*${label.source}\\s*:?\\s*</label>\\s*<span[^>]*>\\s*([^<]+?)\\s*</span>`, 'i')
  const m = html.match(re)
  return m?.[1]?.trim()
}

function detectarPagamentoHtml(texto: string): FormaPagamento | undefined {
  const t = texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (/cartao\s+de\s+credito|credito/.test(t)) return 'credito'
  if (/cartao\s+de\s+debito|debito/.test(t)) return 'debito'
  if (/\bpix\b/.test(t)) return 'pix'
  if (/dinheiro|especie/.test(t)) return 'dinheiro'
  return undefined
}

/** Extrai dados da página HTML da consulta pública (layout SP e genérico). */
export function parseHtmlNfce(html: string, meta?: { url?: string; chave?: string; uf?: string }): DadosNfceSefaz {
  if (/captcha|recaptcha|challenge-form/i.test(html) && !/valor a pagar/i.test(html)) {
    return { itens: [], fonte: 'SEFAZ', aviso: 'SEFAZ pediu captcha; use OCR', url: meta?.url, chave: meta?.chave, uf: meta?.uf }
  }
  const out: DadosNfceSefaz = { itens: [], fonte: 'SEFAZ', url: meta?.url, chave: meta?.chave, uf: meta?.uf }

  const topo = html.match(/class="txtTopo"[^>]*>([^<]+)</i)?.[1]?.trim()
  if (topo) out.estabelecimento = topo

  const cnpjM = html.match(/CNPJ:\s*([\d./-]+)/i) ?? stripTags(html).match(/CNPJ:\s*([\d./-]+)/i)
  if (cnpjM) {
    const c = cnpjM[1].replace(/\D/g, '')
    if (c.length === 14 && cnpjValido(c)) out.cnpj = formatarCNPJ(c)
  }

  const endBlock = html.match(/class="text"[^>]*>\s*CNPJ:[\s\S]*?<\/div>\s*<div class="text">([\s\S]*?)<\/div>/i)
  if (endBlock) out.endereco = stripTags(endBlock[1]).replace(/\s*,\s*,/g, ',').replace(/^,\s*|,\s*$/g, '').trim()

  const aPagar = labelValor(html, /Valor a pagar R\$/) ?? labelValor(html, /Valor a pagar/)
  const vPago = html.match(/Cart[aã]o de Cr[eé]dito[\s\S]*?<span class="totalNumb">\s*([\d.,]+)\s*</i)?.[1]
    ?? labelValor(html, /Valor pago R\$/)
  const vTotal = labelValor(html, /Valor total R\$/)
  out.total = parseValorBR(aPagar ?? vPago ?? '') ?? undefined
  if (out.total == null && vTotal) {
    const desc = labelValor(html, /Descontos? R\$/)
    const b = parseValorBR(vTotal), d = parseValorBR(desc ?? '')
    if (b != null && d != null && d > 0 && d < b) out.total = Math.round((b - d) * 100) / 100
    else if (b != null) out.total = b
  }

  const emissao = html.match(/Emiss[aã]o:\s*<\/strong>\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})/i)
    ?? html.match(/Emiss[aã]o:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})/i)
  if (emissao) {
    out.data = parseDataBR(emissao[1]) ?? undefined
    out.hora = `${emissao[2]}:${emissao[3]}`
  }
  if (!out.data) {
    const aut = html.match(/Protocolo de Autoriza[cç][aã]o:[\s\S]{0,40}?(\d{2}\/\d{2}\/\d{4})\s+(\d{2}):(\d{2})/i)
    if (aut) { out.data = parseDataBR(aut[1]) ?? undefined; out.hora = `${aut[2]}:${aut[3]}` }
  }

  out.pagamento = detectarPagamentoHtml(html)

  for (const m of html.matchAll(/<tr id="Item[^"]*">([\s\S]*?)<\/tr>/gi)) {
    const row = m[1]
    const desc = row.match(/class="txtTit"[^>]*>([^<]+)/i)?.[1]?.trim()
    const qtd = row.match(/Qtde\.:\s*<\/strong>\s*([^<]+)/i)?.[1]?.trim()
      ?? row.match(/Qtde\.:\s*([^<]+)/i)?.[1]?.trim()
    const tot = row.match(/Vl\.\s*Total[\s\S]*?<span class="valor">\s*([^<]+)/i)?.[1]?.trim()
      ?? [...row.matchAll(/class="valor"[^>]*>\s*([\d.,]+)\s*</gi)].pop()?.[1]
    const valor = tot ? parseValorBR(tot) : null
    if (desc) out.itens.push({ descricao: desc, quantidade: qtd ? parseValorBR(qtd) : null, valor })
  }

  if (!out.chave) {
    const dig = stripTags(html).replace(/\D/g, '')
    const m = html.match(/Chave de acesso:[\s\S]*?(\d{4}\s*){11}/i)
    if (m) out.chave = m[0].replace(/\D/g, '').slice(-44)
    else if (dig.length >= 44) {
      // fallback: procura bloco 44 a partir de UF conhecida
      for (let i = 0; i + 44 <= dig.length; i++) {
        const c = dig.slice(i, i + 44)
        if (/^(1[1-7]|2[1-9]|3[1-35]|4[1-3]|5[0-3])/.test(c)) { out.chave = c; break }
      }
    }
  }

  return out
}
