import type { Conta } from './db'
import type { FormaPagamento } from './nota'

const sem = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

/** Escolhe a conta/forma de pagamento a pré-selecionar ao importar um comprovante ou nota. */
export function escolherContaPorPagamento(
  contas: Conta[],
  pagamento?: FormaPagamento,
  bancoPagador?: string,
): Conta | undefined {
  if (!contas.length) return
  if (pagamento === 'credito') return contas.find((x) => x.tipo === 'cartao') ?? contas[0]
  if (pagamento === 'dinheiro') return contas.find((x) => x.tipo === 'dinheiro') ?? contas[0]
  if (pagamento === 'pix') {
    return contas.find((x) => x.tipo === 'pix')
      ?? contas.find((x) => /\bpix\b/i.test(x.nome))
      ?? contas.find((x) => x.tipo === 'conta')
      ?? contas[0]
  }
  const banco = sem(bancoPagador ?? '').replace(/\b(banco|s\.?a\.?|s\/a|ip|pagamentos?|instituicao|de|do|bco)\b/g, ' ').split(/\s+/).filter((w) => w.length >= 2)
  return contas.find((x) => x.tipo !== 'dinheiro' && banco.some((w) => sem(x.nome).includes(w)))
    ?? contas.find((x) => x.tipo === 'conta')
    ?? contas[0]
}
