import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ehComprovante, interpretarComprovante, extrairParcelas, ehMaquininha } from '../src/comprovante.ts'
import { interpretarLeitura } from '../src/nota.ts'
import { escolherContaPorPagamento } from '../src/contaPagamento.ts'
import type { Conta } from '../src/db.ts'
import { casosMaquininhas } from './fixtures-maquininhas.ts'
import { stoneLimpo } from './fixtures.ts'

const contas: Conta[] = [
  { id: '1', nome: 'Conta corrente', tipo: 'conta', icone: '🏦' },
  { id: '2', nome: 'Cartão de crédito', tipo: 'cartao', icone: '💳' },
  { id: '3', nome: 'Cartão de débito', tipo: 'conta', icone: '💳' },
  { id: '4', nome: 'Pix', tipo: 'pix', icone: '💠' },
]

describe('via do cliente das maquininhas', () => {
  for (const caso of casosMaquininhas) {
    it(`${caso.maquina}: ${caso.tipo} ${caso.valor}${caso.parcelas ? ` ${caso.parcelas}x` : ''}`, () => {
      assert.equal(ehComprovante(caso.texto), true)
      assert.equal(ehMaquininha(caso.texto), true)
      const c = interpretarComprovante(caso.texto)
      const l = interpretarLeitura(caso.texto)
      assert.ok(l.comprovante)
      assert.equal(c.tipo, caso.tipo)
      assert.equal(c.pagamento, caso.pagamento)
      assert.equal(c.natureza, 'despesa')
      assert.equal(c.valor, caso.valor)
      for (const n of caso.naoValor) assert.notEqual(c.valor, n)
      assert.equal(c.data, caso.data)
      assert.equal(c.hora, caso.hora)
      assert.match(c.favorecido ?? '', caso.estabelecimento)
      assert.equal(c.bandeira, caso.bandeira)
      assert.equal(c.finalCartao, caso.finalCartao)
      assert.equal(c.parcelas, caso.parcelas)
      assert.equal(c.instituicao, caso.instituicao)
      assert.equal(l.total, caso.valor)
      assert.equal(l.itens.length, 0)
      if (caso.parcelas && caso.parcelas >= 2) assert.match(c.descricao, new RegExp(`${caso.parcelas}x`))
      const conta = escolherContaPorPagamento(contas, c.pagamento, undefined, c.tipo)
      if (c.tipo === 'credito') assert.equal(conta?.nome, 'Cartão de crédito')
      if (c.tipo === 'debito') assert.equal(conta?.nome, 'Cartão de débito')
    })
  }

  it('Stone (já existente) também preenche bandeira e final, sem usar AUT/DOC como valor', () => {
    const c = interpretarComprovante(stoneLimpo)
    assert.equal(c.tipo, 'credito')
    assert.equal(c.valor, 19.63)
    assert.notEqual(c.valor, 654321)
    assert.notEqual(c.valor, 100200)
    assert.equal(c.bandeira, 'Mastercard')
    assert.equal(c.finalCartao, '1234')
    assert.equal(c.instituicao, 'Stone')
    assert.equal(c.parcelas, undefined)
  })
})

describe('parcelas no comprovante da maquininha', () => {
  it('lê 3x / 2x e ignora “à vista”', () => {
    assert.equal(extrairParcelas('CREDITO PARCELADO 3X'), 3)
    assert.equal(extrairParcelas('CREDITO 2X'), 2)
    assert.equal(extrairParcelas('em 12 parcelas'), 12)
    assert.equal(extrairParcelas('CREDITO A VISTA'), undefined)
  })
})
