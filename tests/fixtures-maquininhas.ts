/** Textos sanitizados (sem dados pessoais). Layouts típicos da via do cliente das maquininhas. */

export type CasoMaquininha = {
  maquina: string
  texto: string
  estabelecimento: RegExp
  valor: number
  data: string
  hora: string
  tipo: 'credito' | 'debito'
  pagamento: 'credito' | 'debito'
  bandeira: string
  finalCartao: string
  parcelas?: number
  instituicao: string
  naoValor: number[] // AUT / NSU / DOC / CNPJ / terminal que não podem virar o total
}

const casos: CasoMaquininha[] = []
function add(c: CasoMaquininha) { casos.push(c); return c.texto }

/** Cielo: NSU como DOC, autorização como AUT. */
export const cieloCredito = add({
  maquina: 'Cielo', tipo: 'credito', pagamento: 'credito', parcelas: undefined,
  valor: 87.5, data: '2026-11-28', hora: '14:32', bandeira: 'Visa', finalCartao: '4568',
  estabelecimento: /padaria exemplo/i, instituicao: 'Cielo',
  naoValor: [123456789, 654321, 11222333000181],
  texto: `PADARIA EXEMPLO LTDA
RUA DAS FLORES, 100
SAO PAULO - SP
CNPJ: 11.222.333/0001-81
CIELO
VIA DO CLIENTE
VISA
CREDITO A VISTA
************4568
28/11/2026 14:32
DOC: 123456789
AUT: 654321
VALOR: R$ 87,50
Transação aprovada`,
})

export const cieloOcrRuido = add({
  maquina: 'Cielo (OCR ruído)', tipo: 'credito', pagamento: 'credito',
  valor: 87.5, data: '2026-11-28', hora: '14:32', bandeira: 'Visa', finalCartao: '4568',
  estabelecimento: /padaria exemplo/i, instituicao: 'Cielo',
  naoValor: [123456789, 654321],
  texto: `PADARIA EXEMPLO LTDA
RUA DAS FLORES, 100
SAO PAULO - SP
CNPJ 11.222.333/0001-81
CIELO
VIA DO CLIENTE
VlSA
CREDITO A V1STA
************4568
28/11/2026 14:32
DOC:123456789 AUT:654321
VALOR R$ 87,50
Transacao aprovada`,
})

/** Rede: NSU como CV, autorização como AUTO. */
export const redeCredito = add({
  maquina: 'Rede', tipo: 'credito', pagamento: 'credito',
  valor: 45, data: '2026-11-28', hora: '15:10', bandeira: 'Mastercard', finalCartao: '5678',
  estabelecimento: /loja exemplo/i, instituicao: 'Rede',
  naoValor: [12345678, 987654],
  texto: `LOJA EXEMPLO ME
CNPJ 22.333.444/0001-55
REDE
VIA CLIENTE
MASTERCARD
CREDITO A VISTA
************5678     28/11/26 15:10
CV: 12345678
AUTO: 987654
TOTAL R$ 45,00
AID: A0000000041010
ARQC: 0011223344556677`,
})

/** Getnet: DOC / AUT, frequentemente débito. */
export const getnetDebito = add({
  maquina: 'Getnet', tipo: 'debito', pagamento: 'debito',
  valor: 32.5, data: '2026-11-28', hora: '09:15', bandeira: 'Visa', finalCartao: '4321',
  estabelecimento: /mercado exemplo/i, instituicao: 'Getnet',
  naoValor: [111222, 222333, 8000000],
  texto: `MERCADO EXEMPLO LTDA
AV. BRASIL, 200
CURITIBA - PR
CNPJ 33.444.555/0001-66
GETNET
VIA DO CLIENTE
VISA
DEBITO
************4321
28/11/2026 09:15
DOC: 111222
AUT: 222333
TERM: 8000000
VALOR R$ 32,50
Transação aprovada mediante uso de senha pessoal`,
})

/** PagSeguro / PagBank Moderninha: NSU / AUTO, crédito parcelado. */
export const pagbankModerninha = add({
  maquina: 'PagBank Moderninha', tipo: 'credito', pagamento: 'credito', parcelas: 3,
  valor: 150, data: '2026-11-28', hora: '16:40', bandeira: 'Mastercard', finalCartao: '1234',
  estabelecimento: /bazar exemplo/i, instituicao: 'PagBank',
  naoValor: [123456789, 987654],
  texto: `BAZAR EXEMPLO ME
CNPJ 12.345.678/0001-90
PAGSEGURO
PAGBANK
MODERNINHA
VIA DO CLIENTE
MASTERCARD
CREDITO PARCELADO 3X
************1234
28/11/2026 16:40
NSU: 123456789
AUTO: 987654
R$ 150,00`,
})

/** Mercado Pago Point. */
export const mercadoPagoPoint = add({
  maquina: 'Mercado Pago Point', tipo: 'debito', pagamento: 'debito',
  valor: 28.9, data: '2026-11-28', hora: '11:20', bandeira: 'Visa', finalCartao: '1111',
  estabelecimento: /cafe exemplo/i, instituicao: 'Mercado Pago Point',
  naoValor: [123, 456789],
  texto: `CAFE EXEMPLO
MERCADO PAGO POINT
VIA DO CLIENTE
VISA
DEBITO
************1111
28/11/2026 11:20
NSU 000123
AUT 456789
VALOR R$ 28,90`,
})

/** SumUp. */
export const sumupCredito = add({
  maquina: 'SumUp', tipo: 'credito', pagamento: 'credito',
  valor: 18, data: '2026-11-28', hora: '10:05', bandeira: 'Mastercard', finalCartao: '4444',
  estabelecimento: /atelier exemplo/i, instituicao: 'SumUp',
  naoValor: [123456],
  texto: `ATELIER EXEMPLO
SUMUP
VIA DO CLIENTE
MASTERCARD
CREDITO A VISTA
**** 4444
28/11/2026 10:05
CODIGO DE AUTORIZACAO 123456
VALOR R$ 18,00`,
})

/** InfinitePay, crédito em 2x. */
export const infinitePay = add({
  maquina: 'InfinitePay', tipo: 'credito', pagamento: 'credito', parcelas: 2,
  valor: 200, data: '2026-11-28', hora: '13:00', bandeira: 'Elo', finalCartao: '2222',
  estabelecimento: /estudio exemplo/i, instituicao: 'InfinitePay',
  naoValor: [998877, 112233],
  texto: `ESTUDIO EXEMPLO LTDA
INFINITEPAY
VIA DO CLIENTE
ELO
CREDITO 2X
************2222
28/11/2026 13:00
NSU 998877
AUT 112233
TOTAL R$ 200,00`,
})

/** Ton (marca da Stone): mesma família da via do cliente Stone. */
export const tonCredito = add({
  maquina: 'Ton', tipo: 'credito', pagamento: 'credito',
  valor: 19.63, data: '2026-11-07', hora: '09:26', bandeira: 'Mastercard', finalCartao: '1234',
  estabelecimento: /padaria exemplo/i, instituicao: 'Ton',
  naoValor: [654321, 111222333],
  texto: `PADARIA EXEMPLO LTDA
TON
VIA DO CLIENTE
MASTERCARD
CREDITO A VISTA
************1234     07/11/26  09:26
NSU:111222333
AUT:654321
TOTAL                           R$ 19,63
Autorizacao sem senha`,
})

/** SafraPay: NSU / AUT. */
export const safraPay = add({
  maquina: 'SafraPay', tipo: 'credito', pagamento: 'credito',
  valor: 64, data: '2026-11-28', hora: '17:00', bandeira: 'Visa', finalCartao: '3333',
  estabelecimento: /farmacia exemplo/i, instituicao: 'SafraPay',
  naoValor: [555666, 777888],
  texto: `FARMACIA EXEMPLO LTDA
SAFRAPAY
VIA DO CLIENTE
VISA
CREDITO A VISTA
************3333
28/11/2026 17:00
NSU: 555666
AUT: 777888
VALOR R$ 64,00`,
})

/** Sicredi (via do cliente, CV / AUT como na família Bin/FiServ). */
export const sicrediDebito = add({
  maquina: 'Sicredi', tipo: 'debito', pagamento: 'debito',
  valor: 22, data: '2026-11-28', hora: '08:45', bandeira: 'Elo', finalCartao: '8888',
  estabelecimento: /hortifruti exemplo/i, instituicao: 'Sicredi',
  naoValor: [12345678, 234567],
  texto: `HORTIFRUTI EXEMPLO
SICREDI
VIA DO CLIENTE
ELO
DEBITO
************8888
28/11/2026 08:45
CV: 12345678
AUT: 234567
TOTAL R$ 22,00`,
})

export const casosMaquininhas = casos
