import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { saldoLancamentos } from '../src/utils.ts'
import { transacaoDaPessoa, TIPO_VR } from '../src/vrTicket.ts'
import type { Conta, Transacao } from '../src/db.ts'

const alex = 'u-alex'
const maria = 'u-maria'
const vrMaria: Conta = { id: 'vr-maria', nome: 'VR - Ticket', tipo: TIPO_VR, icone: '🎫', titularId: maria }
const pix: Conta = { id: 'pix', nome: 'Pix', tipo: 'pix', icone: '💠' }
const contas = [vrMaria, pix]

function tx(p: Partial<Transacao> & Pick<Transacao, 'id' | 'tipo' | 'valor' | 'contaId' | 'userId' | 'data'>): Transacao {
  return { descricao: 'x', categoriaId: 'c', criadoEm: 1, ...p }
}

const lista = [
  tx({ id: 'r1', tipo: 'receita', valor: 1000, contaId: pix.id, userId: alex, data: '2026-10-05' }),
  tx({ id: 'd1', tipo: 'despesa', valor: 200, contaId: pix.id, userId: alex, data: '2026-11-02' }),
  tx({ id: 'r2', tipo: 'receita', valor: 400, contaId: vrMaria.id, userId: alex, data: '2026-11-23' }),
  tx({ id: 'd2', tipo: 'despesa', valor: 80, contaId: vrMaria.id, userId: alex, data: '2026-11-24' }),
  tx({ id: 'd3', tipo: 'despesa', valor: 50, contaId: pix.id, userId: maria, data: '2026-09-01' }),
]

describe('saldoLancamentos (todo o período)', () => {
  it('soma receitas menos despesas de todos os meses', () => {
    // 1000 - 200 + 400 - 80 - 50 = 1070, incluindo meses fora do recorte atual
    assert.equal(saldoLancamentos(lista), 1070)
  })

  it('não muda se o recorte do mês for outro (usa a lista completa)', () => {
    const soNovembro = lista.filter((t) => t.data.startsWith('2026-11'))
    assert.equal(saldoLancamentos(soNovembro), 120)
    assert.equal(saldoLancamentos(lista), 1070)
  })

  it('respeita o filtro por pessoa como o saldo do mês (autor ou titular do VR)', () => {
    const daMaria = lista.filter((t) => transacaoDaPessoa(t, maria, contas))
    // crédito/gasto no ticket dela (lançados pelo Alex) + a despesa Pix dela
    assert.equal(saldoLancamentos(daMaria), 400 - 80 - 50)
    const doAlex = lista.filter((t) => transacaoDaPessoa(t, alex, contas))
    // o que o Alex lançou (inclui o uso do ticket da Maria) — não a despesa Pix dela
    assert.equal(saldoLancamentos(doAlex), 1000 - 200 + 400 - 80)
  })

  it('lista vazia (ou só lançamentos já removidos do cache) dá zero', () => {
    assert.equal(saldoLancamentos([]), 0)
  })
})
