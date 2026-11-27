import type { Conta, Membro, Transacao } from './db'

export const TIPO_VR = 'vr_ticket' as const
export const NOME_CATEGORIA_VR = 'VR - Ticket'
export const ICONE_CATEGORIA_VR = '🎫'
export const COR_CATEGORIA_VR = '#f59e0b'

type ListaMembros = Map<string, Pick<Membro, 'userId' | 'nome'>> | Pick<Membro, 'userId' | 'nome'>[]

function nomeDe(id: string | undefined, membros?: ListaMembros) {
  if (!id || !membros) return undefined
  if (membros instanceof Map) return membros.get(id)?.nome
  return membros.find((m) => m.userId === id)?.nome
}

export function ehCategoriaVr(nome: string) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim() === 'vr - ticket'
}

/** Rótulo da conta, ex.: "VR - Ticket · Maria". Tipos comuns ficam só com o nome. */
export function rotuloConta(conta: Pick<Conta, 'nome' | 'tipo' | 'titularId'>, membros?: ListaMembros) {
  const nome = (conta.nome || '').trim() || (conta.tipo === TIPO_VR ? NOME_CATEGORIA_VR : 'Conta')
  if (conta.tipo !== TIPO_VR) return nome
  const titular = nomeDe(conta.titularId, membros)
  return titular ? `${nome} · ${titular}` : nome
}

export function rotuloContaComIcone(conta: Pick<Conta, 'nome' | 'tipo' | 'titularId' | 'icone'>, membros?: ListaMembros) {
  return `${conta.icone ? `${conta.icone} ` : ''}${rotuloConta(conta, membros)}`
}

export function nomeTitular(conta: Pick<Conta, 'tipo' | 'titularId'>, membros?: ListaMembros) {
  if (conta.tipo !== TIPO_VR) return undefined
  return nomeDe(conta.titularId, membros)
}

/**
 * Filtro por pessoa: entra o que a pessoa lançou e também o que saiu/entrou
 * no VR - Ticket dela (mesmo que outro integrante tenha registrado).
 */
export function transacaoDaPessoa(t: Pick<Transacao, 'userId' | 'contaId'>, pessoa: string, contas: Map<string, Pick<Conta, 'id' | 'tipo' | 'titularId'>> | Pick<Conta, 'id' | 'tipo' | 'titularId'>[]) {
  if (!pessoa) return true
  if (t.userId === pessoa) return true
  const c = contas instanceof Map ? contas.get(t.contaId) : contas.find((x) => x.id === t.contaId)
  return c?.tipo === TIPO_VR && c.titularId === pessoa
}

export function saldoConta(transacoes: Pick<Transacao, 'tipo' | 'valor'>[]) {
  return transacoes.reduce((s, t) => s + (t.tipo === 'receita' ? t.valor : -t.valor), 0)
}

/** Saldo de cada conta VR (receitas − despesas), para o painel. Qualquer um usa; o saldo é do titular. */
export function saldosVrPorConta(
  contas: Conta[],
  transacoes: Transacao[],
  membros?: ListaMembros,
  pessoa?: string,
) {
  return contas
    .filter((c) => c.tipo === TIPO_VR && (!pessoa || c.titularId === pessoa))
    .map((c) => ({
      conta: c,
      titularId: c.titularId,
      titularNome: nomeDe(c.titularId, membros),
      rotulo: rotuloConta(c, membros),
      saldo: saldoConta(transacoes.filter((t) => t.contaId === c.id)),
    }))
    .sort((a, b) => (a.titularNome ?? a.rotulo).localeCompare(b.titularNome ?? b.rotulo, 'pt-BR'))
}
