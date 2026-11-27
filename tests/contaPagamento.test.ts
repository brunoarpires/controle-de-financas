import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { escolherContaPorPagamento } from '../src/contaPagamento.ts'
import type { Conta } from '../src/db.ts'

const contas: Conta[] = [
  { id: '1', nome: 'Conta corrente', tipo: 'conta', icone: '🏦' },
  { id: '2', nome: 'Cartão de crédito', tipo: 'cartao', icone: '💳' },
  { id: '3', nome: 'Dinheiro', tipo: 'dinheiro', icone: '💵' },
  { id: '4', nome: 'Pix', tipo: 'pix', icone: '💠' },
]

describe('escolherContaPorPagamento', () => {
  it('escolhe Pix quando o comprovante ou a nota é Pix', () => {
    assert.equal(escolherContaPorPagamento(contas, 'pix')?.id, '4')
    assert.equal(escolherContaPorPagamento(contas, 'pix', 'Santander')?.id, '4')
  })

  it('cai na conta bancária se ainda não houver forma Pix', () => {
    const semPix = contas.filter((c) => c.tipo !== 'pix')
    assert.equal(escolherContaPorPagamento(semPix, 'pix')?.tipo, 'conta')
  })

  it('preserva cartão, dinheiro e PIX/TED (conta) atuais', () => {
    assert.equal(escolherContaPorPagamento(contas, 'credito')?.tipo, 'cartao')
    assert.equal(escolherContaPorPagamento(contas, 'dinheiro')?.tipo, 'dinheiro')
    assert.equal(escolherContaPorPagamento(contas, 'debito')?.tipo, 'conta')
    assert.equal(escolherContaPorPagamento(contas, undefined, 'Itaú')?.nome, 'Conta corrente')
  })
})
