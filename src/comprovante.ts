import type { FormaPagamento } from './nota'
import { parseDataBR, parseValorBR } from './utils'

export type TipoComprovante = 'pix' | 'transferencia' | 'boleto' | 'recarga' | 'debito' | 'credito'
export type NaturezaLancamento = 'receita' | 'despesa'
export interface DadosComprovante {
  tipo: TipoComprovante; valor?: number; data?: string; hora?: string
  favorecido?: string; documento?: string; instituicao?: string; telefone?: string
  bancoPagador?: string; idTransacao?: string; descricao: string; pagamento: FormaPagamento
  natureza: NaturezaLancamento
  parcelas?: number; bandeira?: string; finalCartao?: string
}
export interface OpcoesComprovante { hoje?: Date }

export const ROTULO_COMPROVANTE: Record<TipoComprovante, string> = {
  pix: 'PIX', transferencia: 'Transferência', boleto: 'Boleto', recarga: 'Recarga',
  debito: 'Débito', credito: 'Crédito',
}
export const rotuloComprovante = (t: TipoComprovante) => ROTULO_COMPROVANTE[t]

const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const NFCE = /nfc-?e|documento auxiliar|nota fiscal|chave de acesso|consumidor final/
const COMPROV = /comprovante|\bpix\b|transfer[eê]ncia|\bted\b|\bdoc\b|boleto|recarga|conta debitada|conta de origem|pagamento (efetuado|realizado|de conta|de boleto|de convenio)|recebedor|favorecido|quem recebeu|quem enviou|id da transa|codigo de barras|nome no extrato|cartao virtual|pix recebido|voce recebeu|voce enviou|compra aprovada|google (wallet|pay|pagamento)/
const POS = /via (do )?(cliente|estabelecimento)|stoneid|\bsitef\b|si\s*tef|autorizacao sem senha|credito a vista|credito parcelado|compra no credito|\bcielo\b|\bgetnet\b|\bsumup\b|pagseguro|moderninha|infinitepay|safrapay|safra pay|mercado pago point/
const PIX_STATUS = /pix\s*(realizado|em andamento|concluido|enviado|recebido|creditado)/
const RE_BRL = /r\s*[s$]\s*(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/i
const RE_DINHEIRO = /(\d{1,3}(?:[.\s]\d{3})*[,.]\d{2})/
const IGNORAR_VALOR = /aut\s*:|auto\s*:|stoneid|cnpj|lancamento|sc\s*:|doc\s*:|caixa\s*:|autorizacao|identificacao no extrato|cartao virtual|final\s*[•*.]|\bnsu\b|\bcv\s*:|\bec\s*:|\baid\s*:|arqc|\bterm\s*:|\bmid\s*:|\btid\s*:|\bpos-/
const BANDEIRA = /mastercard|mastercar|visa\b|elo\b|hipercard|amex|diners/
const COMPRA_CARTAO = /cartao virtual|compra aprovada|compra no cartao|nome no extrato|para proteger sua compra|duvidas sobre esta transacao|contato com o emissor|google (wallet|pay|pagamento)/

/** É um comprovante bancário, de maquininha ou da carteira (e não uma nota fiscal)? */
export function ehComprovante(texto: string) {
  const t = sem(texto)
  // NFC-e com cupom de cartão (SiTef/Rede) no rodapé continua sendo nota fiscal
  if (NFCE.test(t)) return false
  if (POS.test(t) || PIX_STATUS.test(t) || COMPRA_CARTAO.test(t) || ehCarteiraGoogle(t)) return true
  if (BANDEIRA.test(t) && /cartao\b/.test(t)) return true
  return COMPROV.test(t)
}

export function ehCarteiraGoogle(texto: string) {
  const t = sem(texto)
  return /nome no extrato/.test(t)
    || /cartao virtual/.test(t)
    || /para proteger sua compra/.test(t)
    || /duvidas sobre esta transacao/.test(t)
    || /entrar em contato com o emissor/.test(t)
    || /google (wallet|pay|pagamento)/.test(t)
}

/** Via do cliente / comprovante de maquininha (Cielo, Rede, Getnet, Stone, etc.). */
export function ehMaquininha(texto: string) {
  const t = sem(texto)
  if (POS.test(t) || /via (do )?(cliente|estabelecimento)/.test(t)) return true
  if (/\bcielo\b|\bgetnet\b|\bsumup\b|pagseguro|moderninha|infinitepay|safrapay|safra pay|mercado pago point/.test(t)) return true
  if (/(?:^|\n)\s*ton\s*$/m.test(t) && /aut\s*:|\bnsu\b|via /.test(t)) return true
  if (/(?:^|\n)\s*rede\s*$/m.test(t) || /e-rede|\brede\b.*via |via .*\brede\b/.test(t)) return true
  if (/\bsicredi\b/.test(t) && /via (do )?cliente|\bnsu\b|aut\s*:/.test(t)) return true
  return false
}

export function ehPixRecebido(texto: string) {
  const t = sem(texto)
  if (/comprovante do pix|informacao para o pagador|valor pago/.test(t) && /dados do recebedor|\bpara\b/.test(t)) return false
  return /pix\s*(recebido|creditado)/.test(t)
    || /voce\s+recebeu(\s+(um\s+)?pix)?/.test(t)
    || /recebimento\s+(de\s+)?pix/.test(t)
    || /pix\s+recebido\s+de/.test(t)
}

/** Ano da data sem ano no texto: ano corrente, ou o anterior se essa data ainda não chegou. */
export function anoImplicito(mes: number, dia: number, hoje = new Date()) {
  const y = hoje.getFullYear()
  const cand = new Date(y, mes - 1, dia)
  const ref = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return cand > ref ? y - 1 : y
}

/** Remove prefixos de adquirente (IFD*, MP*) e normaliza MAIÚSCULAS. Se o resultado ficar curto demais, devolve o original. */
export function limparNomeEstabelecimento(nome: string) {
  const orig = nome.trim()
  let s = orig.replace(/^[A-Z]{2,5}\s*\*\s*/i, '').replace(/\s+/g, ' ').trim()
  if (s.replace(/[^A-Za-zÀ-ú]/g, '').length < 3) return orig
  if (s === s.toUpperCase() && /[A-ZÀ-Ú]/.test(s)) {
    s = s.toLowerCase().replace(/(^|[\s/&.'-])(\p{L})/gu, (_, a, c) => a + c.toUpperCase())
  }
  return s
}

const MESES: Record<string, string> = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' }

function limparBanco(s: string) {
  return s.replace(/^\d{3}\s*[-–.]?\s*/, '').replace(/\b(banco|s\.?a\.?|s\/a|ip|pagamentos?|instituicao|de|do|bco)\b/gi, ' ').replace(/[().]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Layout "Comprovante do Pix" (Pix Cobrança): Valor pago, Dados do recebedor / Para, Valor original, Vencimento. */
function ehPixCobranca(tudo: string, N: string[]) {
  const temValorPago = /valor\s+pago/.test(tudo)
  const temRecebedor = /dados do recebedor/.test(tudo) || N.some((l) => /^para$/.test(l))
  const temMarca = /comprovante do pix/.test(tudo) || /informacao para o pagador/.test(tudo)
  return temValorPago && temRecebedor && temMarca
}

function ehRotuloCampo(n: string) {
  const t = n.replace(/[:.\s]+$/g, '').trim()
  return /^(para|de|nome|cnpj|cpf|cpe|instituicao|banco|agencia|conta|valor(?:\s+(original|pago|a\s+pagar))?|total|vencimento|validade|devedor|recebedor|favorecido|pagador|forma de pagamento|identificacao|informacao|informacoes|dados do|comprovante|id\/?transacao|data e hora|codigo de autenticacao|nome no extrato)$/.test(t)
    || /^(dados do|informacao|informacoes|forma de|identificacao do|codigo de|valor original|nome no extrato|id da transacao|duvidas sobre)\b/.test(t)
}

function proximoConteudo(L: string[], N: string[], de: number, ate: number) {
  for (let i = de; i < ate && i < de + 5; i++) {
    const l = L[i]
    if (!l || ehRotuloCampo(N[i]) || pareceId(l) || linhaBarraStatus(l)) continue
    if (l.length >= 3) return l
  }
}

export function interpretarComprovante(texto: string, opts: OpcoesComprovante = {}): DadosComprovante {
  const L = texto.split('\n').map((l) => l.trim()).filter(Boolean)
  const N = L.map(sem)
  const tudo = N.join('\n')
  const campo = (re: RegExp, de = 0, ate = L.length): string | undefined => {
    for (let i = de; i < ate; i++) {
      const m = N[i].match(re); if (!m || (m.index ?? 0) > 3) continue
      const resto = L[i].slice((m.index ?? 0) + m[0].length).replace(/^[\s:.-]+/, '').trim()
      if (resto.length >= 2 && !ehRotuloCampo(sem(resto))) return resto
      if (L[i + 1]) return L[i + 1]
    }
  }
  const secao = (re: RegExp) => { const i = N.findIndex((l) => re.test(l) && l.length < 50); return i < 0 ? -1 : i }

  const carteira = ehCarteiraGoogle(tudo)
  const recebido = ehPixRecebido(tudo)
  let tipo: TipoComprovante = 'transferencia'
  if (/recarga/.test(tudo)) tipo = 'recarga'
  else if (ehPixCobranca(tudo, N) || /\bpix\b/.test(tudo) || PIX_STATUS.test(tudo) || recebido) tipo = 'pix'
  else if (/boleto|codigo de barras|linha digitavel|pagamento de (conta|convenio|fatura)/.test(tudo)) tipo = 'boleto'
  else if (carteira || COMPRA_CARTAO.test(tudo) || ehMaquininha(tudo) || POS.test(tudo) || /compra no credito|cartao de credito/.test(tudo)) {
    const creditoExplicit = /credito a vista|credito parcelado|venda (no )?credito|compra no credito|cartao de credito/.test(tudo)
    const debitoExplicit = /venda (no )?debito|compra no debito|cartao de debito|(?:^|\n)\s*debito(?: a vista)?\s*$/m.test(tudo) || /\bdebito a vista\b/.test(tudo)
    if (!carteira && debitoExplicit && !creditoExplicit) tipo = 'debito'
    else tipo = 'credito'
  }
  else if (BANDEIRA.test(tudo) && /cartao\b/.test(tudo)) tipo = 'credito'
  else if ((BANDEIRA.test(tudo) && /via cliente|sitef|stone/.test(tudo))) tipo = 'credito'
  else if (/compra no debito|cartao de debito|\bdebito\b/.test(tudo) && !/conta debitada/.test(tudo)) tipo = 'debito'

  const valor = extrairValor(L, N, tudo)
  const { data, hora } = extrairDataHora(L, N, tudo, campo, opts.hoje)

  const iOrig = secao(/^(conta debitada|conta de origem|dados da origem|origem|quem pagou|quem enviou|dados do pagad|de|remetente)\b/)
  const iDest = secao(/^(destino|para|recebedor|favorecido|quem recebeu|destinatario|beneficiario|dados do (recebedor|favorecido|beneficiario)|nome no extrato)\b/)
  const iDevedor = secao(/^(devedor)\b/)
  const iInfoPag = secao(/^informacoes do pagament/)
  const fimDest = [iOrig, iDevedor, iInfoPag].filter((i) => i > (iDest >= 0 ? iDest : -1)).sort((a, b) => a - b)[0] ?? L.length
  let favorecido = campo(/^(operadora|recebedor|favorecido|beneficiario|destinatario|quem recebeu|quem enviou|para|de|nome do (recebedor|favorecido|beneficiario|pagador)|empresa|cedente|nome no extrato)\b/)
  if (favorecido && ehRotuloCampo(sem(favorecido))) favorecido = undefined
  if (recebido) {
    const fimOrig = [iDest, iDevedor, iInfoPag].filter((i) => i > (iOrig >= 0 ? iOrig : -1)).sort((a, b) => a - b)[0] ?? L.length
    const ini = iOrig >= 0 ? iOrig : 0
    favorecido = campo(/^(nome|de|quem enviou|pagador|remetente)\b/, ini, fimOrig)
      ?? proximoConteudo(L, N, ini + (iOrig >= 0 ? 1 : 0), fimOrig)
      ?? favorecido
  } else if (iDest >= 0) {
    favorecido = campo(/^nome\b/, iDest, fimDest)
      ?? proximoConteudo(L, N, iDest + 1, fimDest)
      ?? favorecido
  }
  if (carteira) favorecido = nomeCarteira(L, N) ?? favorecido
  else if (ehMaquininha(tudo) || tipo === 'credito') favorecido = nomeMaquininha(L, N) ?? favorecido
  if (tipo === 'pix' && !recebido) favorecido = nomePixDestino(L, N, iOrig, iDest, favorecido)
  if (favorecido) favorecido = limparNomeEstabelecimento(favorecido)

  const docRe = /(\*{3}\.?\d{3}\.?\d{3}-?\*{2}|[\d*•]{3}\.[\d*•]{3}\.[\d*•]{3}-[\d*•]{2}|\d{2}[.\s]*[*•\d]{2,4}[.\s]*[*•\d]*\s*\/\s*\d{4}\s*-\s*[*•\d]{1,2})/
  const trechoDest = (iDest >= 0 ? L.slice(iDest, fimDest) : L.filter((_, i) => iOrig < 0 || i < iOrig)).join('\n')
  const documento = trechoDest.match(docRe)?.[1]
  let instituicao = iDest >= 0 ? campo(/^(instituicao|banco)\b/, iDest, fimDest) : undefined
  if (!instituicao) instituicao = campo(/^(instituicao|banco)\b/, 0, fimDest)

  let bancoPagador = iOrig >= 0 ? campo(/^(banco|instituicao)\b/, iOrig) : undefined
  bancoPagador ??= campo(/^(pago via|instituicao (de origem|do pagador))\b/)
  if (bancoPagador) bancoPagador = limparBanco(bancoPagador)
  if (instituicao) instituicao = limparBanco(instituicao)
  instituicao ??= extrairAdquirente(tudo)
  if (bancoPagador && instituicao && sem(bancoPagador) === sem(instituicao) && iOrig >= 0) {
    const destBanco = campo(/^(banco|instituicao)\b/, 0, iOrig)
    if (destBanco) instituicao = limparBanco(destBanco)
  }

  let idTransacao: string | undefined
  const idc = campo(/^(id da transacao|in da transacao|id\/?transacao|identificador|codigo da transacao|id\b|e2e|end ?to ?end|autenticacao|controle)\b/)
  if (idc && /^[A-Za-z0-9:.-]{10,}$/.test(idc.replace(/\s/g, ''))) idTransacao = idc.replace(/\s/g, '')
  if (!idTransacao) { const e2e = texto.replace(/\s/g, '').match(/E\d{8}[A-Za-z0-9]{20,}/); if (e2e) idTransacao = e2e[0] }
  if (!idTransacao && (tipo === 'credito' || tipo === 'debito')) {
    const aut = texto.match(/\bAUT(?:O|ORIZACAO)?\s*[:.]?\s*([A-Z0-9]{4,})/i)
    if (aut) idTransacao = aut[1]
  }

  const parcelas = extrairParcelas(tudo)
  const bandeira = extrairBandeira(tudo)
  const finalCartao = extrairFinalCartao(texto)
  const telefone = texto.match(/\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g)?.find((t) => /^\(?\d{2}\)?\s?9/.test(t) && !/^\(?0?800|^\(?300/.test(t))
  const rotulo = tipo === 'recarga' ? 'Recarga de celular' : tipo === 'debito' ? 'Compra no débito' : tipo === 'credito' ? 'Compra no crédito' : ROTULO_COMPROVANTE[tipo]
  const rotuloParc = tipo === 'credito' && parcelas && parcelas >= 2 ? `${rotulo} (${parcelas}x)` : rotulo
  const descricao = tipo === 'recarga' && telefone ? `${rotuloParc} - ${telefone}` : favorecido ? `${rotuloParc} - ${favorecido}` : rotuloParc
  const pagamento: FormaPagamento = tipo === 'pix' ? 'pix' : tipo === 'credito' ? 'credito' : 'debito'
  const natureza: NaturezaLancamento = recebido ? 'receita' : 'despesa'
  return { tipo, valor, data, hora, favorecido, documento, instituicao, telefone: tipo === 'recarga' ? telefone : undefined, bancoPagador, idTransacao, descricao, pagamento, natureza, parcelas, bandeira, finalCartao }
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
    else if (/^valor original\b/.test(n)) continue // nunca usar "Valor original" (pode ser 0,00 ou valor de boleto)
    else if (/^(valor|total)\b/.test(n)) prio = 70
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

function extrairDataHora(L: string[], N: string[], tudo: string, campo: (re: RegExp, de?: number, ate?: number) => string | undefined, hoje?: Date) {
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
  const datasComHora: string[] = []
  for (let i = 0; i < L.length; i++) {
    const l = L[i]
    const n = N[i] ?? sem(l)
    const prev = i > 0 ? (N[i - 1] ?? sem(L[i - 1])) : ''
    if (/\d{2}\.\d{3}\.\d{3}\/\d{4}/.test(l) || /cnpj|stoneid|aut\s*:/i.test(l)) continue
    if (/^vencimento\b/.test(n) || /^vencimento\b/.test(prev) || /validade apos/.test(n)) continue
    for (const m of l.matchAll(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:\s*[-–T]?\s*([01]?\d|2[0-3])[:h.]([0-5]\d))?/g)) {
      const iso = parseDataBR(`${m[1]}/${m[2]}/${m[3]}`); if (!iso) continue
      datas.push(iso)
      if (m[4]) {
        datasComHora.push(iso)
        if (!hora) hora = `${m[4].padStart(2, '0')}:${m[5]}`
      }
    }
    const ext = dataPorExtenso(n, hoje)
    if (ext) {
      datas.push(ext.data)
      if (ext.hora) {
        datasComHora.push(ext.data)
        hora ??= ext.hora
      }
    }
  }
  if (!data) {
    const pref = datasComHora.length ? datasComHora : datas
    if (pref.length) {
      const uniq = [...new Set(pref)]
      data = uniq.length === 1 ? uniq[0] : pref[0]
    }
  }
  if (!data) {
    const md = tudo.match(/(\d{1,2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{2,4})(?:\D{0,12}?(\d{2})\s*[:h.]\s*(\d{2}))?/)
    if (md) { data = parseDataBR(`${md[1]}/${md[2]}/${md[3]}`) ?? undefined; if (md[4]) hora ??= `${md[4]}:${md[5]}` }
  }
  if (!data) {
    const ext = dataPorExtenso(tudo, hoje)
    if (ext) { data = ext.data; if (ext.hora) hora ??= ext.hora }
  }
  if (!hora) {
    for (let i = 0; i < L.length; i++) {
      if (linhaBarraStatus(L[i])) continue
      const h = L[i].match(/\b([01]?\d|2[0-3])\s*[:h.]\s*([0-5]\d)(?::\d{2})?\b/)
      if (h) { hora = `${h[1].padStart(2, '0')}:${h[2]}`; break }
    }
  }
  return { data, hora }
}

const RE_DATA_EXT = /(?:(?:seg|ter|qua|qui|sex|sab|dom)\w*[.,]?\s+)?(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\w*\.?(?:\s*(?:de\s+)?(\d{4}))?(?:\s*[,.]?\s*(?:as|a[s]|-|•|·)\s*([01]?\d|2[0-3])\s*[:h.]\s*([0-5]\d))?/

/** "sábado, 28 de nov., às 09:42", "28 NOV 2026 - 10:30", "28 nov 2026 às 19:01". */
export function dataPorExtenso(texto: string, hoje?: Date): { data: string; hora?: string } | undefined {
  const t = sem(texto)
  const m = t.match(RE_DATA_EXT)
  if (!m) return
  const mes = MESES[m[2]]
  if (!mes) return
  const dia = m[1].padStart(2, '0')
  const ano = m[3] ?? String(anoImplicito(Number(mes), Number(m[1]), hoje))
  const hora = m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : undefined
  return { data: `${ano}-${mes}-${dia}`, hora }
}

/** Relógio / bateria da barra de status do Android — não é a hora da transação. */
export function linhaBarraStatus(l: string) {
  const n = sem(l).trim()
  if (/\d{1,3}\s*%/.test(n)) return true
  if (/^(?:[01]?\d|2[0-3])[:h.]\d{2}$/.test(n)) return true
  return /^bar+a de status/.test(n)
}

const PULAR_NOME = /^(c6\s?bank|nubank|itau|bradesco|banco|santander|caixa|inter|picpay|pagbank|mercado pago|pix|em andamento|andamento|realizado|codigo|autenticacao|autensacao|id da transacao|in da transacao|chave|cpf|cpe|cnpj|valor|data|identificacao|agencia|conta|comprovante|extrato|nome no extrato|master\s?card|visa\b|elo\b|hipercard|stone|via cliente|sitef|fiserv|autorizacao|caixa|lancamento|total|credito|debito|onl|nfc|si\s*tef|hora|sexta|sabado|domingo|segunda|terca|quarta|quinta|para$|de$|devedor|dados do|informacao|forma de pagamento|duvidas|emissor|proteger sua compra|contato com)/

function pareceId(l: string) {
  const s = l.replace(/\s/g, '')
  return !/\s/.test(l) && s.length >= 10 && /^[A-Za-z0-9-]+$/.test(s) && /\d/.test(s)
}

function nomePixDestino(L: string[], N: string[], iOrig: number, iDest: number, atual?: string): string | undefined {
  if (atual && ehRotuloCampo(sem(atual))) atual = undefined
  if (iDest >= 0 && atual && atual.length >= 3 && !PULAR_NOME.test(sem(atual))) return atual
  const fim = iOrig >= 0 ? iOrig : L.length
  const nomesAntesBanco = (ate: number) => {
    const iBanco = N.findIndex((l, i) => i < ate && /^(banco|instituicao)\s*:/.test(l))
    const nomes: string[] = []
    const ini = iBanco > 0 ? Math.max(0, iBanco - 4) : 0
    const fimNomes = iBanco > 0 ? iBanco : ate
    for (let i = ini; i < fimNomes; i++) {
      const n = N[i], l = L[i]
      if (PULAR_NOME.test(n) || linhaBarraStatus(l)) continue
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
  const skip = /stone|via (do )?(cliente|estabelecimento)|mastercard|mastercar|visa\b|elo\b|hipercard|amex|diners|credito|debito|nfc|sitef|fiserv|autorizacao|caixa|lancamento|total|doc[:;]|aut[:;]|auto[:;]|sc[:;]|onl|cnpj|\d{2}[.,]\d{3}|nome no extrato|id da transacao|cartao virtual|proteger sua compra|duvidas sobre|contato com o emissor|google (wallet|pay)|compra aprovada|final\s*[•*.]|nubank|itau|bradesco|santander|\binter\b|picpay|pagbank|mercado pago|c6\s?bank|voce (pagou|enviou|recebeu)|\bcielo\b|\bgetnet\b|\bsumup\b|pagseguro|moderninha|infinitepay|safrapay|sicredi|\bton\b|\brede\b|\bpoint\b|\bnsu\b|^valor\b|^aut\b|^auto\b|^doc\b|^cv\b|r\s*[s$]|favorecido|comprovante|estabelecimento|endereco|^(rua|r\.|av\.|avenida|alameda|travessa|al\.|rodovia|estrada|cep|praca)\b/
  const nomes: string[] = []
  for (let i = 0; i < Math.min(L.length, 20); i++) {
    if (skip.test(N[i]) || linhaBarraStatus(L[i])) continue
    if (/^[\d\s.,/:*#%-]+$/.test(L[i])) continue
    if (/[-–]\s*[a-z]{2}$/.test(N[i]) || /\/\s*[a-z]{2}$/.test(N[i])) continue // CIDADE - SP
    if (/^(rua|r\.|av\.?|avenida|alameda|travessa|al\.|rodovia|estrada|cep|praca)\b/.test(N[i])) continue
    if (/transacao aprovada|aprovada|uso de senha|^aid\b|^arqc\b|^term\b|^ec\b/.test(N[i])) continue
    if (!/[A-Za-zÀ-ú]{3,}/.test(L[i]) || L[i].length < 4 || L[i].length > 60) continue
    const limpo = L[i].replace(/^[^\p{L}]+/gu, '').replace(/[^\p{L}\d &.'*-]+$/gu, '').trim()
    if (limpo.length >= 4) nomes.push(limpo)
  }
  const juridico = nomes.filter((s) => /ltda|eireli|\bme\b|s\/?a\b|comercio/i.test(sem(s)))
  if (juridico.length) return juridico[0]
  if (nomes.length >= 2) return nomes[1]
  return nomes[0]
}

function nomeCarteira(L: string[], N: string[]): string | undefined {
  const i = N.findIndex((n) => /^nome no extrato/.test(n))
  if (i >= 0) {
    const resto = L[i].replace(/nome no extrato/i, '').replace(/^[\s:.-]+/, '').trim()
    if (resto.length >= 3) return resto
    const prox = proximoConteudo(L, N, i + 1, Math.min(L.length, i + 4))
    if (prox) return prox
  }
  return nomeMaquininha(L, N)
}

export function extrairParcelas(texto: string): number | undefined {
  const t = sem(texto)
  if (/\ba vista\b/.test(t) && !/parcelad/.test(t)) return undefined
  const m = t.match(/(?:credito|parcelad[oa])\s*(?:em\s*)?(\d{1,2})\s*[x×]\b/)
    || t.match(/(\d{1,2})\s*[x×]\s*(?:de\s+)?(?:r\s*\$|parc)/)
    || t.match(/\b(\d{1,2})\s*[x×]\b/)
    || t.match(/parcelad[oa]\s*(?:em\s*)?(\d{1,2})\b/)
    || t.match(/\b(\d{1,2})\s*parcelas?\b/)
  if (!m) return
  const n = Number(m[1])
  return n >= 2 && n <= 24 ? n : undefined
}

export function extrairBandeira(texto: string): string | undefined {
  const t = sem(texto)
  if (/hipercard/.test(t)) return 'Hipercard'
  if (/amex|american express/.test(t)) return 'Amex'
  if (/diners/.test(t)) return 'Diners'
  if (/\belo\b/.test(t)) return 'Elo'
  if (/mastercard|master\s?card|mastercar/.test(t)) return 'Mastercard'
  if (/\bvisa\b|\bvlsa\b|\bv1sa\b|\bvis0\b/.test(t)) return 'Visa'
}

export function extrairFinalCartao(texto: string): string | undefined {
  const m = texto.match(/\*{4,}\s*(\d{4})/)
    || texto.match(/\bfinal\s*[•*.]{0,4}\s*(\d{4})\b/i)
    || texto.match(/\bxxxx\s*(\d{4})\b/i)
    || texto.match(/(?:cartao|card)\s+[•*.x]{2,}\s*(\d{4})\b/i)
  return m?.[1]
}

export function extrairAdquirente(texto: string): string | undefined {
  const t = sem(texto)
  const pares: [RegExp, string][] = [
    [/pagseguro|moderninha/, 'PagBank'],
    [/mercado pago point/, 'Mercado Pago Point'],
    [/infinitepay/, 'InfinitePay'],
    [/safrapay|safra pay/, 'SafraPay'],
    [/\bsicredi\b/, 'Sicredi'],
    [/\bgetnet\b/, 'Getnet'],
    [/\bcielo\b/, 'Cielo'],
    [/\bsumup\b/, 'SumUp'],
    [/(?:^|\n)\s*ton\s*$/m, 'Ton'],
    [/\bstone\b|stoneid/, 'Stone'],
    [/(?:^|\n)\s*rede\s*$|e-rede|\brede\b.*via |via .*\brede\b/m, 'Rede'],
  ]
  for (const [re, nome] of pares) if (re.test(t)) return nome
}
