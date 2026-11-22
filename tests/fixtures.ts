/** Textos sanitizados (sem dados pessoais reais). Espelham layouts PIX/TED/boleto/nota e os modelos Stone/C6. */

export const pixNubank = `Comprovante de Pix
Valor
R$ 50,00
Destino
Nome
Maria Exemplo
CPF
***.123.456-**
Instituição
Nubank
ID da transação
E1234567820261106ABCDEFGHIJKLMNOP
06/11/2026 10:30`

export const tedItau = `Comprovante de transferência
TED
Valor da transferência
R$ 1.200,00
Favorecido
João da Silva
CPF
***.987.654-**
Instituição
Banco do Brasil
Conta debitada
Banco
Itaú
Data
05/11/2026 14:15`

export const boleto = `Comprovante de pagamento
Boleto
Linha digitável
23790.12345 12345.123456 12345.123456 1 12340000008990
Valor pago
R$ 89,90
Beneficiário
Empresa Exemplo LTDA
CNPJ
12.345.678/0001-95
05/11/2026 09:10`

export const recarga = `Comprovante
Recarga de celular
Operadora
Vivo
Valor da recarga
R$ 20,00
(11) 98765-4321
04/11/2026 18:00`

export const debito = `Comprovante
Compra no débito
Valor
R$ 32,50
Favorecido
Mercado Exemplo
03/11/2026 11:45`

export const nfce = `SUPERMERCADO EXEMPLO LTDA
CNPJ: 11.222.333/0001-81
AV. EXEMPLO, 100 - CENTRO - SAO PAULO/SP
Documento Auxiliar da Nota Fiscal
de Consumidor Eletronica
001 ARROZ TIPO 1 5KG 27,90
002 FEIJAO CARIOCA 1KG 8,99
003 LEITE INTEGRAL 1L 4,99
QTD. TOTAL DE ITENS 3
VALOR TOTAL R$ 41,88
Cartao de Debito 41,88
NFC-e n 000012345 Serie 001
Emissao: 20/10/2026 18:42:10
Consulte pela Chave de Acesso em
35261011222333000181650010000123451000123453`

export const stoneLimpo = `PADARIA EXEMPLO LTDA
A PADARIA DO BAIRRO
11.222.333/0001-81
STONE - Via CLIENTE
MasterCard
Credito a vista-NFC
************1234     07/11/26  09:26
SC:111222333                    AUT:654321
StoneID:999000111222333
DOC:000100                      ONL-NFC
TOTAL                           R$ 19,63
Autorizacao sem senha
SiTef from Fiserv
Caixa: 001
Lancamento: 00100200`

export const stoneOcrRuido = `SBANIFICADORA EXEMPLO PR
A PADARIA DO BAIRRO
11,222, 333/0001-81
C&A oo STONE - Via CLIENTE
oo Masterard
Creditoa vista-NFEG
deEFIAAIAAA TOS 07/11/26 09:26
SC:I3B81BIAGA AUT:654321
StoneIlD:+999000111222333
DoC:000100 ONL-NFGC
TOTAL R$ 19,63
Autor izacao sem senha
3ilef from Fiserv
Caixa; DOZ Lancamento: 00100200`

export const stoneOcrSemValor = `STONE - Via CLIENTE
MasterCard
Credito a vista-NFC
07/11/26 09:26
SC:111222333 AUT:654321
StoneID:999000111222333
DOC:000100
TOTAL R$ PIOR a
Autorizacao sem senha
Lancamento: 00100200`

export const c6PixLimpo = `C6BANK
Pix em andamento          Pix realizado!
06/11/2026                06/11/2026
08:56                     08:56
TE
Telefonia Exemplo SA
Banco: 033 - BCO SANTANDER (BRASIL) S.A.
Agência: ****
Conta: *****-8
Código de autenticação
O1ABCDEFGHIJKLMNOPQRSTUV
ID da transação
E1234567820261106ABCDEFGHIJKLMNOP
Chave
00000000-0000-4000-8000-000000000001
CPF / CNPJ
11.222.333/0001-81
Valor
R$ 99,90
Data e hora da transação
sexta-feira, 06 de novembro de 2026, 08:56
Identificação no extrato
0000000000000000000000000000000000
Valor original
R$ 99,90
Conta de origem
AC
Paula Remetente
Banco: 336 - Banco C6 S.A.
Agência: ****
Conta: *****-8
Você deverá informar o ID da transação que
aparece nesse comprovante.`

export const c6PixOcrRuido = `Pix em Pix
andamento realizado!
06/11/2026 06/11/2026
08:56 08:56
TE
Telefonia Exemplo SA
Banco: 033 - BCO SANTANDER (BRASIL) S.A.
Código de autens ação
ol ABCDEFGHIJKLMNOPQRSTUV
ID da transação
E1234567820261106ABCDEFGHIJKLMNOP
Chave
00000000-0000-4000-8000-00000000000l
CPF ! CNPJ
11.222.333/0001-81
Valor
R$99,90
Data e nora da transação
sexta-feira, 06 de novembro de 2026, 08:56
Identificação no extrato
0000000000000000000000000000000000
valor original
R$ 99,90
Conta de origem
AC
Paula Remetente
Banco: 336 - Banco C6 S.A.
aparece nesse comprovante.`

/** NFC-e de supermercado de exemplo com desconto + cupom SiTef/Rede no rodapé. */
export const mercadoNfce = `SUPERMERCADO EXEMPLO LTDA
CNPJ: 11.222.333/0001-81
AV EXEMPLO 100, CENTRO - Sao Paulo - SP
Documento Auxiliar da Nota Fiscal
de Consumidor Eletronica
001 00001879 ARROZ TIPO 1 5KG 2,000 un x 3,79 7,58
002 00001234 FEIJAO CARIOCA 1KG 1,000 un x 12,90 12,90
Desconto sobre item 003  -4,80
Qtde total de itens 13
Valor total R$ 99,90
Desconto R$ -10,00
Valor a Pagar R$ 89,90
FORMA PAGAMENTO: Cartao de Credito
VALOR PAGO R$ 89,90
***VOCE ECONOMIZOU R$ 10,00***
Tributos Totais Incidentes (Lei 12.741/2012) R$ 12,00
Consulte pela Chave de Acesso em
3526 1111 2223 3300 0181 6500 1000 0123 4510 0012 3457
NFC-e N:12345 Serie:001 20/10/2026 18:42:10
Protocolo de Autorizacao: 135000000000001
Data da Autorizacao: 20/10/2026 18:42:10
COMPROVANTE DE CREDITO OU DEBITO
REDE
MASTERCARD
VALOR: 89,90
SUPERMERCADO EXEMPLO 001 20.10.26-18:42
CARTAO: xxxx.xxxx.xxxx.1234
AUT: 654321
SiTef from Fiserv
OP: 00001 PDV: 01
20/10/26 18:42`

/** Mesma nota com ruído típico de OCR + data só no formato do comprovante de cartão (foto invertida / OCR frágil). */
export const mercadoNfceOcrRuido = `SUPERMERCADO EXEMPLO LTDA
CNPJ: 11.222.333/O001-81
AV EXEMPLO 100, CENTRO - Sao Paulo - SP
Documento Auxi1iar da Nota Fiscal
de Consumidor E1etronica
001 00001879 ARROZ TIPO 1 5KG 2,000 un x 3,79 7,58
Desconto sobre item 003  -4,80
Qtde total de itens 13
Va1or total R$ 99,90
Desconto R$ -10,00
Va1or a Pagar R$ 89,90
FORMA PAGAMENTO Cartao de Credito
VALOR PAGO R$ 89,90
***VOCE ECONOMIZOU R$ 10,00***
Tributos Totais Incidentes R$ 12,00
Chave de Acesso
3526 1111 2223 3300 0181 6500 1000 0123 4510 0012 3457
COMPROVANTE DE CREDITO OU DEBITO
REDE
MASTERCARD
VALOR: 89,90
SUPERMERCADO EXEMPLO 001 20.10.26-18:42
CARTAO: xxxx.xxxx.xxxx.1234
SiTef from Fiserv`
