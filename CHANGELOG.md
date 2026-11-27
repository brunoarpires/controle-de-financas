# Changelog

## 1.1.0 — 27/11/2026

- Forma de pagamento **Pix** (tipo de conta `pix`), incluída nos perfis novos e no modo local.
- Leitor do layout **Comprovante do Pix** (Pix Cobrança): usa *Valor pago* e *Para*; ignora *Valor original* e *Vencimento*.
- Ao importar comprovante ou nota, o app sugere a forma de pagamento (Pix, cartão ou dinheiro).
- **VR - Ticket**: conta com titular (integrante do perfil), categoria de receita correspondente, uso por qualquer membro, saldo no Início e rótulo “lançado por / ticket de”.
- Migrações: `supabase/migrations/20261125203000_conta_pix.sql` e `supabase/migrations/20261126160000_vr_ticket.sql`.

## 1.0.0 — 22/11/2026

Versão pública inicial, sem dados pessoais e sem o histórico do repositório privado.
