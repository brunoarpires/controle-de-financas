import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  TIPO_VR, ehCategoriaVr, rotuloConta, rotuloContaComIcone, nomeTitular,
  transacaoDaPessoa, saldoConta, saldosVrPorConta,
} from '../src/vrTicket.ts'
import type { Conta, Transacao } from '../src/db.ts'

const alex = { userId: 'u-alex', nome: 'Alex', papel: 'administrador' as const }
const maria = { userId: 'u-maria', nome: 'Maria', papel: 'membro' as const }
const membros = new Map([[alex.userId, alex], [maria.userId, maria]])
const vrMaria: Conta = { id: 'vr-maria', nome: 'VR - Ticket', tipo: TIPO_VR, icone: '🎫', titularId: maria.userId }
const vrAlex: Conta = { id: 'vr-alex', nome: 'VR - Ticket', tipo: TIPO_VR, icone: '🎫', titularId: alex.userId }
const pix: Conta = { id: 'pix', nome: 'Pix', tipo: 'pix', icone: '💠' }
const contas = [vrMaria, vrAlex, pix]

function tx(p: Partial<Transacao> & Pick<Transacao, 'id' | 'tipo' | 'valor' | 'contaId' | 'userId'>): Transacao {
  return { descricao: 'x', data: '2026-11-26', categoriaId: 'c', criadoEm: 1, ...p }
}

describe('rótulo VR - Ticket', () => {
  it('mostra o titular no nome da conta', () => {
    assert.equal(rotuloConta(vrMaria, membros), 'VR - Ticket · Maria')
    assert.equal(rotuloContaComIcone(vrMaria, membros), '🎫 VR - Ticket · Maria')
    assert.equal(nomeTitular(vrMaria, membros), 'Maria')
  })

  it('não altera o rótulo de Pix e outras formas', () => {
    assert.equal(rotuloConta(pix, membros), 'Pix')
    assert.equal(nomeTitular(pix, membros), undefined)
  })

  it('funciona sem titular (modo local ou titular removido)', () => {
    assert.equal(rotuloConta({ nome: 'VR - Ticket', tipo: TIPO_VR }, membros), 'VR - Ticket')
  })
})

describe('qualquer integrante usa o ticket de qualquer titular', () => {
  it('Alex pode lançar despesa no ticket da Maria; o filtro dela vê o gasto', () => {
    const gasto = tx({ id: '1', tipo: 'despesa', valor: 40, contaId: vrMaria.id, userId: alex.userId })
    assert.equal(transacaoDaPessoa(gasto, '', contas), true)
    assert.equal(transacaoDaPessoa(gasto, maria.userId, contas), true, 'aparece no ticket da titular')
    assert.equal(transacaoDaPessoa(gasto, alex.userId, contas), true, 'aparece também com quem lançou')
  })

  it('Maria pode lançar a receita de crédito no próprio ticket ou no do Alex', () => {
    const creditoDela = tx({ id: '2', tipo: 'receita', valor: 400, contaId: vrMaria.id, userId: maria.userId })
    const creditoDele = tx({ id: '3', tipo: 'receita', valor: 400, contaId: vrAlex.id, userId: maria.userId })
    assert.equal(transacaoDaPessoa(creditoDela, maria.userId, contas), true)
    assert.equal(transacaoDaPessoa(creditoDele, alex.userId, contas), true)
    assert.equal(transacaoDaPessoa(creditoDele, maria.userId, contas), true)
  })

  it('despesa em Pix do Alex não entra no recorte da Maria', () => {
    const pixAlex = tx({ id: '4', tipo: 'despesa', valor: 10, contaId: pix.id, userId: alex.userId })
    assert.equal(transacaoDaPessoa(pixAlex, alex.userId, contas), true)
    assert.equal(transacaoDaPessoa(pixAlex, maria.userId, contas), false)
  })
})

describe('saldo do ticket é do titular', () => {
  it('separa o saldo por pessoa, mesmo quando outro lança a despesa', () => {
    const lista = [
      tx({ id: 'r1', tipo: 'receita', valor: 400, contaId: vrMaria.id, userId: alex.userId }),
      tx({ id: 'd1', tipo: 'despesa', valor: 80, contaId: vrMaria.id, userId: alex.userId }),
      tx({ id: 'r2', tipo: 'receita', valor: 200, contaId: vrAlex.id, userId: maria.userId }),
    ]
    const saldos = saldosVrPorConta(contas, lista, membros)
    assert.equal(saldos.length, 2)
    assert.equal(saldos.find((s) => s.titularId === maria.userId)?.saldo, 320)
    assert.equal(saldos.find((s) => s.titularId === alex.userId)?.saldo, 200)
    assert.equal(saldoConta(lista.filter((t) => t.contaId === vrMaria.id)), 320)
  })

  it('filtra o painel por pessoa sem misturar tickets', () => {
    const lista = [
      tx({ id: 'r1', tipo: 'receita', valor: 400, contaId: vrMaria.id, userId: alex.userId }),
      tx({ id: 'r2', tipo: 'receita', valor: 200, contaId: vrAlex.id, userId: alex.userId }),
    ]
    assert.equal(saldosVrPorConta(contas, lista, membros, maria.userId).length, 1)
    assert.equal(saldosVrPorConta(contas, lista, membros, maria.userId)[0].saldo, 400)
  })
})

describe('ehCategoriaVr', () => {
  it('reconhece o nome da categoria de receita', () => {
    assert.equal(ehCategoriaVr('VR - Ticket'), true)
    assert.equal(ehCategoriaVr('vr - ticket'), true)
    assert.equal(ehCategoriaVr('Salário'), false)
  })
})
