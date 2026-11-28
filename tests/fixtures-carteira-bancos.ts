/** Textos sanitizados (sem dados pessoais). Layouts típicos de apps bancários e da carteira Google, para o leitor de comprovante. */

export const HOJE_AMOSTRA = new Date(2026, 10, 28, 12, 0, 0) // 28/11/2026

/** Print de detalhe de transação do Google Wallet / Google Pay (Android, tema escuro), exemplo fictício. */
export const googleWalletLimpo = `09:42
97%
IFD*FARMACIA BAIRRO EXEMPLO
R$ 37,40
sábado, 28 de nov., às 09:42
Cartão C6 Carbon Mastercard ••1234
Para proteger sua compra, são mostrados os detalhes do cartão virtual Mastercard ••9876, e não os dados reais do seu cartão. Os detalhes ajudam a monitorar suas compras, mas não substituem o comprovante original. Entre em contato diretamente com a loja se precisar de ajuda.
Nome no extrato
IFD*FARMACIA BAIRRO EXEMPLO
ID da transação
000111222333:MSC.444555666777.88899900011122233 01
Dúvidas sobre esta transação?
Entrar em contato com o emissor`

/** Mesmo comprovante com ruído típico de OCR. */
export const googleWalletOcrRuido = `10:15
97%
IFD*FARMACIA BAIRRO EXEMPLO
R$ 37,40
sabado, 28 de nov., as 09:42
Cartao C6 Carbon Mastercard ..1234
Para proteger sua compra, sao mostrados os detalhes do cartao virtual Mastercard ..9876, e nao os dados reais do seu cartao.
Nome no extrato
IFD*FARMACIA BAIRRO EXEMPLO
ID da transacao
000111222333:MSC.444555666777.88899900011122233 01
Duvidas sobre esta transacao?
Entrar em contato com o emissor`

export type CasoBanco = {
  banco: string
  tipoDoc: 'pix_enviado' | 'pix_recebido' | 'ted' | 'boleto' | 'cartao'
  texto: string
  favorecido: RegExp
  valor: number
  data: string
  hora: string
  tipo: 'pix' | 'transferencia' | 'boleto' | 'credito'
  pagamento: 'pix' | 'debito' | 'credito'
  natureza: 'despesa' | 'receita'
}

const casos: CasoBanco[] = []
function add(c: CasoBanco) { casos.push(c); return c.texto }

export const nubankPixRecebido = add({
  banco: 'Nubank', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 180, data: '2026-11-28', hora: '14:22', favorecido: /carlos exemplo/i,
  texto: `Nubank
Pix recebido
R$ 180,00
28 NOV 2026 - 14:22
De
Carlos Exemplo
Instituição
Itaú
ID da transação
E11112222333344445555666677778888`,
})

export const nubankBoleto = add({
  banco: 'Nubank', tipoDoc: 'boleto', tipo: 'boleto', pagamento: 'debito', natureza: 'despesa',
  valor: 129.9, data: '2026-11-28', hora: '09:05', favorecido: /companhia de luz exemplo/i,
  texto: `Nubank
Comprovante de pagamento
Boleto
Valor pago
R$ 129,90
Beneficiário
Companhia de Luz Exemplo
CNPJ
11.222.333/0001-44
Linha digitável
10490.12345 12345.123456 12345.123456 1 12340000012990
28/11/2026 09:05`,
})

export const itauPixEnviado = add({
  banco: 'Itaú', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 75.4, data: '2026-11-28', hora: '09:15', favorecido: /ana exemplo/i,
  texto: `Itaú
Comprovante
Pix enviado
Valor
R$ 75,40
Data e hora
28/11/2026 09:15
Para
Nome
Ana Exemplo
Instituição
Nubank
ID da transação
E0041696820261128ABCDEFGHIJKLMNOP`,
})

export const itauPixRecebido = add({
  banco: 'Itaú', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 210, data: '2026-11-27', hora: '18:40', favorecido: /paulo exemplo/i,
  texto: `Itaú
Comprovante
Você recebeu um Pix
Valor
R$ 210,00
Data e hora
27/11/2026 18:40
De
Paulo Exemplo
Instituição
Inter`,
})

export const itauBoleto = add({
  banco: 'Itaú', tipoDoc: 'boleto', tipo: 'boleto', pagamento: 'debito', natureza: 'despesa',
  valor: 54.33, data: '2026-11-28', hora: '11:20', favorecido: /condom[ií]nio exemplo/i,
  texto: `Itaú
Comprovante de pagamento de boleto
Valor pago
R$ 54,33
Beneficiário
Condomínio Exemplo
CNPJ
22.333.444/0001-55
28/11/2026 11:20`,
})

export const bradescoPixEnviado = add({
  banco: 'Bradesco', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 32, data: '2026-11-28', hora: '11:03', favorecido: /loja exemplo me/i,
  texto: `Bradesco
Comprovante de Transação
PIX
Valor: R$ 32,00
Data: 28/11/2026 11:03
Recebedor
Loja Exemplo ME
CPF/CNPJ
***.444.555-**
Instituição
Nubank`,
})

export const bradescoTed = add({
  banco: 'Bradesco', tipoDoc: 'ted', tipo: 'transferencia', pagamento: 'debito', natureza: 'despesa',
  valor: 2500, data: '2026-11-27', hora: '15:10', favorecido: /maria exemplo/i,
  texto: `Bradesco
Comprovante de transferência
TED
Valor da transferência
R$ 2.500,00
Favorecido
Maria Exemplo
Banco
Banco do Brasil
Conta debitada
Banco
Bradesco
27/11/2026 15:10`,
})

export const bradescoBoleto = add({
  banco: 'Bradesco', tipoDoc: 'boleto', tipo: 'boleto', pagamento: 'debito', natureza: 'despesa',
  valor: 199.99, data: '2026-11-26', hora: '10:00', favorecido: /escola exemplo ltda/i,
  texto: `Bradesco
Comprovante de pagamento de boleto
Código de barras
23790.00000 00000.000000 00000.000000 1 00000000019999
Valor pago
R$ 199,99
Beneficiário
Escola Exemplo LTDA
26/11/2026 10:00`,
})

export const bbPixEnviado = add({
  banco: 'Banco do Brasil', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 90, data: '2026-11-28', hora: '16:40', favorecido: /pedro exemplo/i,
  texto: `Banco do Brasil
Comprovante de débito
PIX Enviado
Valor
R$ 90,00
Beneficiário
Pedro Exemplo
Instituição
Nubank
Data da transação
28/11/2026 16:40`,
})

export const bbPixRecebido = add({
  banco: 'Banco do Brasil', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 45.5, data: '2026-11-28', hora: '08:05', favorecido: /lucia exemplo/i,
  texto: `Banco do Brasil
PIX Recebido
Valor
R$ 45,50
Quem enviou
Lucia Exemplo
Instituição
Caixa
28/11/2026 08:05`,
})

export const caixaPixEnviado = add({
  banco: 'Caixa', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 45, data: '2026-11-28', hora: '08:10', favorecido: /padaria exemplo/i,
  texto: `CAIXA
Comprovante de Pagamento
PIX
Valor
R$ 45,00
Recebedor
Padaria Exemplo
Instituição
Itaú
Data/Hora
28/11/2026 08:10`,
})

export const caixaBoleto = add({
  banco: 'Caixa', tipoDoc: 'boleto', tipo: 'boleto', pagamento: 'debito', natureza: 'despesa',
  valor: 312.15, data: '2026-11-28', hora: '13:45', favorecido: /prefeitura exemplo/i,
  texto: `CAIXA
Comprovante de pagamento de conta
Boleto
Valor pago
R$ 312,15
Beneficiário
Prefeitura Exemplo
Linha digitável
10490.11111 11111.111111 11111.111111 8 11110000031215
28/11/2026 13:45`,
})

export const santanderPixEnviado = add({
  banco: 'Santander', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 60, data: '2026-11-28', hora: '19:01', favorecido: /mercado exemplo/i,
  texto: `Santander
Comprovante de Pix
Você enviou um Pix
R$ 60,00
28 nov 2026 às 19:01
Destinatário
Mercado Exemplo
Instituição
Inter`,
})

export const interPixEnviado = add({
  banco: 'Inter', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 25, data: '2026-11-28', hora: '12:00', favorecido: /joana exemplo/i,
  texto: `Inter
Comprovante
Pix enviado com sucesso
R$ 25,00
Para
Joana Exemplo
Instituição
Nubank
28/11/2026 às 12:00`,
})

export const interPixRecebido = add({
  banco: 'Inter', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 88, data: '2026-11-27', hora: '21:11', favorecido: /rafael exemplo/i,
  texto: `Inter
Pix recebido
Você recebeu um Pix
R$ 88,00
De
Rafael Exemplo
27/11/2026 21:11`,
})

export const interCartao = add({
  banco: 'Inter', tipoDoc: 'cartao', tipo: 'credito', pagamento: 'credito', natureza: 'despesa',
  valor: 52, data: '2026-11-28', hora: '20:15', favorecido: /farm[aá]cia exemplo/i,
  texto: `Inter
Compra aprovada
Cartão de crédito
R$ 52,00
Farmácia Exemplo
Visa final ••1234
28/11/2026 20:15`,
})

export const c6PixRecebido = add({
  banco: 'C6', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 300, data: '2026-11-06', hora: '08:56', favorecido: /lucas exemplo/i,
  texto: `C6BANK
Pix recebido
R$ 300,00
De
Lucas Exemplo
Instituição
Nubank
06/11/2026 08:56`,
})

export const picpayPixEnviado = add({
  banco: 'PicPay', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 15, data: '2026-11-28', hora: '10:05', favorecido: /rafael exemplo/i,
  texto: `PicPay
Comprovante
Você enviou um Pix
R$ 15,00
Para
Rafael Exemplo
28 de novembro de 2026 às 10:05`,
})

export const picpayPixRecebido = add({
  banco: 'PicPay', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 40, data: '2026-11-28', hora: '16:00', favorecido: /carla exemplo/i,
  texto: `PicPay
Pix recebido
R$ 40,00
De
Carla Exemplo
28/11/2026 16:00`,
})

export const mercadoPagoPixEnviado = add({
  banco: 'Mercado Pago', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 99.9, data: '2026-11-28', hora: '17:30', favorecido: /loja digital exemplo/i,
  texto: `Mercado Pago
Comprovante de pagamento
Pix
Você pagou
R$ 99,90
Para
Loja Digital Exemplo
28/11/2026 17:30`,
})

export const mercadoPagoPixRecebido = add({
  banco: 'Mercado Pago', tipoDoc: 'pix_recebido', tipo: 'pix', pagamento: 'pix', natureza: 'receita',
  valor: 12, data: '2026-11-28', hora: '09:00', favorecido: /cliente exemplo/i,
  texto: `Mercado Pago
Você recebeu um Pix
R$ 12,00
De
Cliente Exemplo
28/11/2026 09:00`,
})

export const pagbankPixEnviado = add({
  banco: 'PagBank', tipoDoc: 'pix_enviado', tipo: 'pix', pagamento: 'pix', natureza: 'despesa',
  valor: 40, data: '2026-11-28', hora: '13:20', favorecido: /carla exemplo/i,
  texto: `PagBank
Comprovante de transação
Pix enviado
Valor
R$ 40,00
Favorecido
Carla Exemplo
Instituição
Itaú
28/11/2026 13:20`,
})

export const pagbankBoleto = add({
  banco: 'PagBank', tipoDoc: 'boleto', tipo: 'boleto', pagamento: 'debito', natureza: 'despesa',
  valor: 73.8, data: '2026-11-25', hora: '11:11', favorecido: /cl[ií]nica exemplo/i,
  texto: `PagBank
Comprovante de pagamento de boleto
Valor pago
R$ 73,80
Beneficiário
Clínica Exemplo
25/11/2026 11:11`,
})

export const casosBancos = casos
