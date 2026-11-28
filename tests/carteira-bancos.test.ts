import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ehComprovante, interpretarComprovante, limparNomeEstabelecimento, anoImplicito, dataPorExtenso, linhaBarraStatus } from '../src/comprovante.ts'
import { interpretarLeitura } from '../src/nota.ts'
import { escolherContaPorPagamento } from '../src/contaPagamento.ts'
import type { Conta } from '../src/db.ts'
import { googleWalletLimpo, googleWalletOcrRuido, HOJE_AMOSTRA, casosBancos } from './fixtures-carteira-bancos.ts'

const opts = { hoje: HOJE_AMOSTRA }

const contas: Conta[] = [
  { id: '1', nome: 'Conta corrente', tipo: 'conta', icone: '🏦' },
  { id: '2', nome: 'Cartão de crédito', tipo: 'cartao', icone: '💳' },
  { id: '3', nome: 'Cartão da loja', tipo: 'cartao', icone: '💳' },
  { id: '4', nome: 'Pix', tipo: 'pix', icone: '💠' },
]

describe('limpeza e data sem ano', () => {
  it('remove prefixo IFD* e capitaliza o estabelecimento', () => {
    assert.equal(limparNomeEstabelecimento('IFD*FARMACIA BAIRRO EXEMPLO'), 'Farmacia Bairro Exemplo')
    assert.equal(limparNomeEstabelecimento('Farmacia Bairro Exemplo'), 'Farmacia Bairro Exemplo')
    assert.equal(limparNomeEstabelecimento('AB*'), 'AB*') // curto demais: mantém o original
  })

  it('ano implícito usa o ano corrente, ou o anterior se a data ainda não chegou', () => {
    assert.equal(anoImplicito(11, 28, new Date(2026, 10, 28)), 2026)
    assert.equal(anoImplicito(12, 30, new Date(2027, 0, 5)), 2026)
    assert.equal(anoImplicito(1, 1, new Date(2027, 0, 1)), 2027)
    assert.equal(anoImplicito(1, 2, new Date(2027, 0, 1)), 2026)
  })

  it('lê “28 de nov., às 09:42” e abreviações com ou sem ponto', () => {
    const a = dataPorExtenso('sábado, 28 de nov., às 09:42', HOJE_AMOSTRA)
    assert.deepEqual(a, { data: '2026-11-28', hora: '09:42' })
    const b = dataPorExtenso('sabado, 28 de nov., as 09:42', HOJE_AMOSTRA)
    assert.deepEqual(b, { data: '2026-11-28', hora: '09:42' })
    const c = dataPorExtenso('28 nov 2026 às 19:01', HOJE_AMOSTRA)
    assert.deepEqual(c, { data: '2026-11-28', hora: '19:01' })
    const d = dataPorExtenso('28 NOV 2026 - 14:22', HOJE_AMOSTRA)
    assert.deepEqual(d, { data: '2026-11-28', hora: '14:22' })
  })

  it('reconhece a barra de status (hora + bateria)', () => {
    assert.equal(linhaBarraStatus('09:42'), true)
    assert.equal(linhaBarraStatus('10:15'), true)
    assert.equal(linhaBarraStatus('97%'), true)
    assert.equal(linhaBarraStatus('sábado, 28 de nov., às 09:42'), false)
  })
})

describe('Google Wallet / Google Pay (print de transação)', () => {
  for (const [nome, texto] of [['limpo', googleWalletLimpo], ['ocr-ruído', googleWalletOcrRuido]] as const) {
    it(`${nome}: farmácia 37,40 em 28/11/2026 09:42 no crédito, ignora ID e relógio da barra`, () => {
      assert.equal(ehComprovante(texto), true)
      const l = interpretarLeitura(texto) // interpretarLeitura não recebe hoje; o texto de ruído tem só nov. sem ano
      // usar o parser com a data de referência da amostra (estável em qualquer calendário)
      const c = interpretarComprovante(texto, opts)
      assert.ok(l.comprovante)
      assert.equal(c.tipo, 'credito')
      assert.equal(c.pagamento, 'credito')
      assert.equal(c.natureza, 'despesa')
      assert.equal(c.valor, 37.4)
      assert.notEqual(c.valor, 4504)
      assert.notEqual(c.valor, 2952)
      assert.equal(c.data, '2026-11-28')
      assert.equal(c.hora, '09:42')
      assert.match(c.favorecido ?? '', /farmacia bairro exemplo/i)
      assert.doesNotMatch(c.favorecido ?? '', /ifd\*/i)
      assert.doesNotMatch(c.favorecido ?? '', /mastercard|virtual|emissor/i)
      assert.match(c.descricao, /cr[eé]dito.*farmacia bairro exemplo/i)
      assert.equal(escolherContaPorPagamento(contas, c.pagamento)?.nome, 'Cartão de crédito')
    })
  }

  it('no ruído, a hora da barra (10:15) não substitui a da transação (09:42)', () => {
    const c = interpretarComprovante(googleWalletOcrRuido, opts)
    assert.equal(c.hora, '09:42')
    assert.notEqual(c.hora, '10:15')
  })
})

describe('comprovantes dos apps bancários (layouts típicos, dados fictícios)', () => {
  for (const caso of casosBancos) {
    it(`${caso.banco} · ${caso.tipoDoc}: ${caso.natureza} ${caso.valor}`, () => {
      assert.equal(ehComprovante(caso.texto), true, 'deveria ser reconhecido como comprovante')
      const c = interpretarComprovante(caso.texto, opts)
      const l = interpretarLeitura(caso.texto)
      assert.ok(l.comprovante)
      assert.equal(c.tipo, caso.tipo)
      assert.equal(c.pagamento, caso.pagamento)
      assert.equal(c.natureza, caso.natureza)
      assert.equal(c.valor, caso.valor)
      assert.equal(c.data, caso.data)
      assert.equal(c.hora, caso.hora)
      assert.match(c.favorecido ?? '', caso.favorecido)
      assert.equal(l.total, caso.valor)
      assert.equal(l.itens.length, 0)
    })
  }
})
