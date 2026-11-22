import type { FormaPagamento } from './nota'
import { parseDataBR, parseValorBR } from './utils'

export type TipoComprovante = 'pix' | 'transferencia' | 'boleto' | 'recarga' | 'debito' | 'credito'
export interface DadosComprovante {
  tipo: TipoComprovante; valor?: number; data?: string; hora?: string
  favorecido?: string; documento?: string; instituicao?: string; telefone?: string
  bancoPagador?: string; idTransacao?: string; descricao: string; pagamento: FormaPagamento
}

export const ROTULO_COMPROVANTE: Record<TipoComprovante, string> = {
  pix: 'PIX', transferencia: 'Transferência', boleto: 'Boleto', recarga: 'Recarga',
  debito: 'Débito', credito: 'Crédito',
}
export const rotuloComprovante = (t: TipoComprovante) => ROTULO_COMPROVANTE[t]

const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const NFCE = /nfc-?e|documento auxiliar|nota fiscal|chave de acesso|consumidor final/
const COMPROV = /comprovante|\bpix\b|transfer[eê]ncia|\bted\b|\bdoc\b|boleto|recarga|conta debitada|conta de origem|pagamento (efetuado|realizado)|recebedor|favorecido|quem recebeu|id da transa|codigo de barras/
const POS = /via cliente|stoneid|\bsitef\b|si\s*tef|autorizacao sem senha|credito a vista|compra no credito/
const PIX_STATUS = /pix\s*(realizado|em andamento|concluido|enviado)/
const RE_BRL = /r\s*[s$]\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i
const RE_DINHEIRO = /(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/
const IGNORAR_VALOR = /aut\s*:|stoneid|cnpj|lancamento|sc\s*:|doc\s*:|caixa\s*:|autorizacao|identificacao no extrato/

/** É um comprovante bancário ou de maquininha (e não uma nota fiscal)? */
export function ehComprovante(texto: string) {
  const t = sem(texto)
  // NFC-e com cupom de cartão (SiTef/Rede) no rodapé continua sendo nota fiscal
  if (NFCE.test(t)) return false
  if (POS.test(t) || PIX_STATUS.test(t)) return true
  return COMPROV.test(t)
}

const MESES: Record<string, string> = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' }

function limparBanco(s: string) {
  return s.replace(/^\d{3}\s*[-–.]?\s*/, '').replace(/\b(banco|s\.?a\.?|s\/a|ip|pagamentos?|instituicao|de|do|bco)\b/gi, ' ').replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function interpretarComprovante(texto: string): DadosComprovante {
  const L = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const N = L.map(sem)
  const tudo = N.join('\n')
  const campo = (re: RegExp, de = 0, ate = L.length): string | undefined => {
    for (let i = de; i < ate; i++) {
      const m = N[i].match(re); if (!m || (m.index ?? 0) > 3) continue
      const resto = L[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:.-]+/, '').trim()
      if (resto.length >= 2) return resto
      if (L[i + 1]) return L[i + 1]
    }
  }
  const secao = (re: RegExp) => { const i = N.findIndex((l) => re.test(l) && l.length < 50); return i < 0 ? -1 : i }

  let tipo: TipoComprovante = 'transferencia'
  if (/recarga/.test(tudo)) tipo = 'recarga'
  else if (/boleto|codigo de barras|linha digitavel/.test(tudo)) tipo = 'boleto'
  else if (/\bpix\b/.test(tudo) || PIX_STATUS.test(tudo)) tipo = 'pix'
  else if (POS.test(tudo) || /compra no credito|cartao de credito/.test(tudo)) tipo = 'credito'
  else if ((/mastercard|visa\b|elo\b|hipercard|amex/.test(tudo) && /via cliente|sitef|stone/.test(tudo))) tipo = 'credito'
  else if (/compra no debito|cartao de debito|\bdebito\b/.test(tudo) && !/conta debitada/.test(tudo)) tipo = 'debito'

  const valor = extrairValor(L, N, tudo)
  const { data, hora } = extrairDataHora(texto, L, tudo, campo)

  const iOrig = secao(/^(conta debitada|conta de origem|dados da origem|origem|quem pagou|pagador|dados do pagador|de)\b/)
  const iDest = secao(/^(destino|para|recebedor|favorecido|quem recebeu|destinatario|beneficiario|dados do (recebedor|favorecido|beneficiario))\b/)
  const fimDest = iOrig > iDest && iOrig >= 0 ? iOrig : L.length
  let favorecido = campo(/^(operadora|recebedor|favorecido|beneficiario|destinatario|quem recebeu|para|nome do (recebedor|favorecido|beneficiario)|empresa|cedente)\b/)
  if (iDest >= 0) favorecido = campo(/^nome\b/, iDest, fimDest) ?? (L[iDest + 1] && !/:/.test(L[iDest + 1]) ? L[iDest + 1] : favorecido)
  if (tipo === 'credito') favorecido = nomeMaquininha(L, N) ?? favorecido
  if (tipo === 'pix') favorecido = nomePixDestino(L, N, iOrig, iDest, favorecido)

  const docRe = /(\*{3}\.?\d{3}\.?\d{3}-?\*{2}|[\d*•]{3}\.[\d*•]{3}\.[\d*•]{3}-[\d*•]{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/
  const trechoDest = (iDest >= 0 ? L.slice(iDest, fimDest) : L.filter((_, i) => iOrig < 0 || i < iOrig)).join('\n')
  const documento = trechoDest.match(docRe)?.[1]
  let instituicao = iDest >= 0 ? campo(/^(instituicao|banco)\b/, iDest, fimDest) : undefined
  if (!instituicao) instituicao = campo(/^(instituicao|banco)\b/, 0, fimDest)

  let bancoPagador = iOrig >= 0 ? campo(/^(banco|instituicao)\b/, iOrig) : undefined
  bancoPagador ??= campo(/^(pago via|instituicao (de origem|do pagador))\b/)
  if (bancoPagador) bancoPagador = limparBanco(bancoPagador)
  if (instituicao) instituicao = limparBanco(instituicao)
  if (bancoPagador && instituicao && sem(bancoPagador) === sem(instituicao) && iOrig >= 0) {
    const destBanco = campo(/^(banco|instituicao)\b/, 0, iOrig)
    if (destBanco) instituicao = limparBanco(destBanco)
  }

  let idTransacao: string | undefined
  const idc = campo(/^(id da transacao|in da transacao|id\/?transacao|identificador|codigo da transacao|id\b|e2e|end ?to ?end|autenticacao|controle)\b/)
  if (idc && /^[A-Za-z0-9-]{10,}$/.test(idc.replace(/\s/g, ''))) idTransacao = idc.replace(/\s/g, '')
  if (!idTransacao) { const e2e = texto.replace(/\s/g, '').match(/E\d{8}[A-Za-z0-9]{20,}/); if (e2e) idTransacao = e2e[0] }
  if (!idTransacao && tipo === 'credito') {
    const aut = texto.match(/\bAUT\s*[:.]?\s*(\d{4,})/i)
    if (aut) idTransacao = aut[1]
  }

  const telefone = texto.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g)?.find((t) => /^\(?\d{2}\)?\s?9/.test(t) && !/^\(?0?800|^\(?300/.test(t))
  const rotulo = tipo === 'recarga' ? 'Recarga de celular' : tipo === 'debito' ? 'Compra no débito' : tipo === 'credito' ? 'Compra no crédito' : ROTULO_COMPROVANTE[tipo]
  const descricao = tipo === 'recarga' && telefone ? `${rotulo} - ${telefone}` : favorecido ? `${rotulo} - ${favorecido}` : rotulo
  const pagamento: FormaPagamento = tipo === 'pix' ? 'pix' : tipo === 'credito' ? 'credito' : 'debito'
  return { tipo, valor, data, hora, favorecido, documento, instituicao, telefone: tipo === 'recarga' ? telefone : undefined, bancoPagador, idTransacao, descricao, pagamento }
}

function extrairValor(L: string[], N: string[], tudo: string): number | undefined {
  type Cand = { v: number; prio: number }
  const candidatos: Cand[] = []
  const add = (v: number | null | undefined, prio: number) => {
    if (v && v > 0 && v < 1e7) candidatos.push({ v, prio })
  }
  const tentar = (s: string | undefined, prio: number) => {
    if (!s || IGNORAR_VALOR.test(sem(s))) return
    const m = s.match(RE_BRL) ?? s.match(RE_DINHEIRO)
    if (!m) return
    add(parseValorBR(m[1] ?? m[0]), prio)
  }
  for (let i = 0; i < L.length; i++) {
    const n = N[i]
    if (/tribut|economiz|desconto|quantidade|itens|subtotal|valor\s+total/.test(n) && !/valor\s+a\s+pagar|valor\s+pago|total\s+a\s+pagar/.test(n)) {
      if (/valor\s+total/.test(n)) {
        const resto = L[i].replace(/^valor\s+total\b/i, '').replace(/^[\s:.-]+/, '').trim()
        for (const cand of [resto, L[i + 1]]) tentar(cand, 20)
      }
      continue
    }
    let prio = 0
    if (/valor\s+a\s+pagar|valor\s+pago|total\s+a\s+pagar/.test(n)) prio = 100
    else if (/^valor\s*:/.test(n) || /\bvalor\s*:\s*\d/.test(n)) prio = 90
    else if (/^(valor(?!\s+original)|total)\b/.test(n)) prio = 70
    else if (/^valor original\b/.test(n)) prio = 50
    else continue
    const resto = L[i].replace(/^(valor(\s+(original|a\s+pagar|pago))?|total(\s+a\s+pagar)?)\b/i, '').replace(/^[\s:.-]+/, '').trim()
    for (const cand of [resto, L[i + 1], L[i + 2]]) {
      if (!cand) continue
      if (IGNORAR_VALOR.test(sem(cand))) continue
      if (RE_BRL.test(cand) || RE_DINHEIRO.test(cand)) { tentar(cand, prio); break }
    }
  }
  if (candidatos.length) {
    candidatos.sort((a, b) => b.prio - a.prio || a.v - b.v)
    return candidatos[0].v
  }
  const rs: number[] = []
  for (const m of tudo.matchAll(new RegExp(RE_BRL, 'gi'))) {
    const v = parseValorBR(m[1])
    if (v && v > 0 && v < 1e7) rs.push(v)
  }
  const uniq = [...new Set(rs.map((v) => v.toFixed(2)))]
  if (uniq.length === 1) return Number(uniq[0])
  if (rs.length) return rs[0]
  return undefined
}

function extrairDataHora(texto: string, L: string[], tudo: string, campo: (re: RegExp, de?: number, ate?: number) => string | undefined) {
  let data: string | undefined, hora: string | undefined
  const aplicar = (s?: string) => {
    if (!s) return
    const d = parseDataBR(s)
    if (d) data ??= d
    const h = s.match(/\b([01]?\d|2[0-3])\s*[:h.]\s*([0-5]\d)(?::\d{2})?\b/)
      ?? s.match(/\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}\s*[-–T]?\s*([01]?\d|2[0-3])[:h.]([0-5]\d)/)
    if (h) hora ??= `${h[1].padStart(2, '0')}:${h[2]}`
  }
  aplicar(campo(/^(data( e hora)?( da transacao| do pagamento| da compra| da autorizacao)?|autorizacao)\b/))
  const datas: string[] = []
  for (const l of L) {
    if (/\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(l) || /cnpj|stoneid|aut\s*:/i.test(l)) continue
    for (const m of l.matchAll(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:\s*[-–T]?\s*([01]?\d|2[0-3])[:h.]([0-5]\d))?/g)) {
      const iso = parseDataBR(`${m[1]}/${m[2]}/${m[3]}`); if (iso) datas.push(iso)
      if (m[4] && !hora) hora = `${m[4].padStart(2, '0')}:${m[5]}`
    }
  }
  if (!data && datas.length) {
    const uniq = [...new Set(datas)]
    data = uniq.length === 1 ? uniq[0] : datas[0]
  }
  if (!data) {
    const md = tudo.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:\D{0,12}?(\d{2})\s*[:h.]\s*(\d{2}))?/)
    if (md) { data = parseDataBR(`${md[1]}/${md[2]}/${md[3]}`) ?? undefined; if (md[4]) hora ??= `${md[4]}:${md[5]}` }
  }
  if (!data) {
    const mm = tudo.match(/(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\.?\s*(?:de\s+)?(\d{4})(?:\D{0,12}?(\d{2})\s*[:h.]\s*(\d{2}))?/)
    if (mm) { data = `${mm[3]}-${MESES[mm[2]]}-${mm[1].padStart(2, '0')}`; if (mm[4]) hora ??= `${mm[4]}:${mm[5]}` }
  }
  if (!hora) {
    const h = texto.match(/\b([01]\d|2[0-3])\s*[:h.]\s*([0-5]\d)(?::\d{2})?\b/)
    if (h) hora = `${h[1]}:${h[2]}`
  }
  return { data, hora }
}

const PULAR_NOME = /^(c6\s?bank|nubank|itau|bradesco|banco|pix|em andamento|andamento|realizado|codigo|autenticacao|autensacao|id da transacao|in da transacao|chave|cpf|cnpj|valor|data|identificacao|agencia|conta|comprovante|extrato|master\s?card|visa\b|elo\b|hipercard|stone|via cliente|sitef|fiserv|autorizacao|caixa|lancamento|total|credito|debito|onl|nfc|si\s*tef|hora|sexta|sabado|domingo|segunda|terca|quarta|quinta)/

function pareceId(l: string) {
  const s = l.replace(/\s/g, '')
  return !/\s/.test(l) && s.length >= 10 && /^[A-Za-z0-9-]+$/.test(s) && /\d/.test(s)
}

function nomePixDestino(L: string[], N: string[], iOrig: number, iDest: number, atual?: string): string | undefined {
  if (iDest >= 0 && atual && atual.length >= 3 && !PULAR_NOME.test(sem(atual))) return atual
  const fim = iOrig >= 0 ? iOrig : L.length
  const nomesAntesBanco = (ate: number) => {
    const iBanco = N.findIndex((l, i) => i < ate && /^(banco|instituicao)\s*:/.test(l))
    const nomes: string[] = []
    const ini = iBanco > 0 ? Math.max(0, iBanco - 4) : 0
    const fimNomes = iBanco > 0 ? iBanco : ate
    for (let i = ini; i < fimNomes; i++) {
      const n = N[i], l = L[i]
      if (PULAR_NOME.test(n)) continue
      if (/banco\s*:/.test(n) || /r\s*[s$]/.test(n) || /\d{2}\s*[/-]\s*\d{2}\s*[/-]/.test(n)) continue
      if (pareceId(l) || /^\d[\d\s.,/*-]*$/.test(l)) continue
      if (/[a-zà-ú]{3,}/i.test(l) && l.length >= 4 && l.length < 80) nomes.push(l.replace(/^[\s•\-_|]+/, '').trim())
    }
    return nomes.filter((s) => s.replace(/[^A-Za-zÀ-ú]/g, '').length >= 6)
  }
  const antes = nomesAntesBanco(fim)
  if (antes.length) return antes[antes.length - 1]
  return atual
}

function nomeMaquininha(L: string[], N: string[]): string | undefined {
  const skip = /stone|via cliente|mastercard|mastercar|visa\b|elo\b|hipercard|credito|debito|nfc|sitef|fiserv|autorizacao|caixa|lancamento|total|doc[:;]|aut[:;]|sc[:;]|onl|cnpj|\d{2}[.,]\d{3}/
  const nomes: string[] = []
  for (let i = 0; i < Math.min(L.length, 16); i++) {
    if (skip.test(N[i])) continue
    if (/^[\d\s.,/:*-]+$/.test(L[i])) continue
    if (!/[A-Za-zÀ-ú]{3,}/.test(L[i]) || L[i].length < 4 || L[i].length > 60) continue
    const limpo = L[i].replace(/^[^\p{L}]+/gu, '').replace(/[^\p{L}\d &.'-]+$/gu, '').trim()
    if (limpo.length >= 4) nomes.push(limpo)
  }
  if (nomes.length >= 2) return nomes[1]
  return nomes[0]
}
