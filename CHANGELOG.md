# Changelog

## 1.3.0 — 28/11/2026

- Leitor de comprovantes: print de transação do **Google Wallet / Google Pay** (Android, tema escuro), com data sem ano, limpeza de prefixos como `IFD*` e um único olho de valores já existente no app.
- Comprovantes típicos dos apps dos bancos (Nubank, Itaú, Bradesco, Banco do Brasil, Caixa, Santander, Inter, C6, PicPay, Mercado Pago e PagBank): Pix enviado ou recebido, TED, boleto/pagamento de conta e compra no cartão. Pix recebido entra como receita.
- Via do cliente das maquininhas: Stone (já havia), Cielo, Rede, Getnet, PagBank/Moderninha, Mercado Pago Point, SumUp, InfinitePay, Ton, SafraPay e Sicredi. Lê estabelecimento, valor, data/hora, crédito ou débito, parcelas, bandeira e final do cartão; ignora AUT/NSU/DOC/CNPJ como valor.
- Prints em modo escuro (texto claro em fundo escuro) são invertidos antes do OCR no cliente.

## 1.2.0 — 27/11/2026

- Card de **saldo total** no Início: receitas menos despesas de todo o período, acima do seletor de mês.
- Um único olho controla a visibilidade de todos os valores da tela (total, saldo do mês, receitas e despesas). A escolha vale nesta aba (`sessionStorage`); ao abrir o app ou trocar de perfil, os valores voltam a ficar escondidos.
- O total respeita o perfil ativo e o filtro por pessoa (incluindo o titular do VR - Ticket) e não muda ao trocar o mês.

## 1.1.0 — 27/11/2026

- Forma de pagamento **Pix** (tipo de conta `pix`), incluída nos perfis novos e no modo local.
- Leitor do layout **Comprovante do Pix** (Pix Cobrança): usa *Valor pago* e *Para*; ignora *Valor original* e *Vencimento*.
- Ao importar comprovante ou nota, o app sugere a forma de pagamento (Pix, cartão ou dinheiro).
- **VR - Ticket**: conta com titular (integrante do perfil), categoria de receita correspondente, uso por qualquer membro, saldo no Início e rótulo “lançado por / ticket de”.
- Migrações: `supabase/migrations/20261125203000_conta_pix.sql` e `supabase/migrations/20261126160000_vr_ticket.sql`.

## 1.0.0 — 22/11/2026

Versão pública inicial, sem dados pessoais e sem o histórico do repositório privado.
