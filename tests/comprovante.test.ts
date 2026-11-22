import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ehComprovante, interpretarComprovante } from '../src/comprovante.ts'
import { extrairTotalNota, interpretarLeitura, interpretarTextoOCR, pontuarTextoOCR } from '../src/nota.ts'
import {
  pixNubank, tedItau, boleto, recarga, debito, nfce,
  stoneLimpo, stoneOcrRuido, stoneOcrSemValor, c6PixLimpo, c6PixOcrRuido,
  mercadoNfce, mercadoNfceOcrRuido,
} from './fixtures.ts'

describe('formatos atuais', () => {
  it('PIX rotulado (Nubank-like)', () => {
    assert.equal(ehComprovante(pixNubank), true)
    const c = interpretarComprovante(pixNubank)
    assert.equal(c.tipo, 'pix')
    assert.equal(c.pagamento, 'pix')
    assert.equal(c.valor, 50)
    assert.equal(c.data, '2026-11-06')
    assert.equal(c.hora, '10:30')
    assert.equal(c.favorecido, 'Maria Exemplo')
    assert.equal(c.instituicao, 'Nubank')
    assert.ok(c.idTransacao?.startsWith('E12345678'))
    assert.match(c.descricao, /PIX.*Maria Exemplo/)
  })

  it('TED', () => {
    assert.equal(ehComprovante(tedItau), true)
    const c = interpretarComprovante(tedItau)
    assert.equal(c.tipo, 'transferencia')
    assert.equal(c.valor, 1200)
    assert.equal(c.data, '2026-11-05')
    assert.equal(c.hora, '14:15')
    assert.equal(c.favorecido, 'João da Silva')
    assert.match(c.bancoPagador ?? '', /ita/i)
  })

  it('boleto', () => {
    assert.equal(ehComprovante(boleto), true)
    const c = interpretarComprovante(boleto)
    assert.equal(c.tipo, 'boleto')
    assert.equal(c.valor, 89.9)
    assert.equal(c.data, '2026-11-05')
    assert.equal(c.favorecido, 'Empresa Exemplo LTDA')
    assert.equal(c.documento, '12.345.678/0001-95')
  })

  it('recarga', () => {
    assert.equal(ehComprovante(recarga), true)
    const c = interpretarComprovante(recarga)
    assert.equal(c.tipo, 'recarga')
    assert.equal(c.valor, 20)
    assert.equal(c.favorecido, 'Vivo')
    assert.equal(c.telefone, '(11) 98765-4321')
    assert.match(c.descricao, /98765/)
  })

  it('débito', () => {
    assert.equal(ehComprovante(debito), true)
    const c = interpretarComprovante(debito)
    assert.equal(c.tipo, 'debito')
    assert.equal(c.pagamento, 'debito')
    assert.equal(c.valor, 32.5)
    assert.equal(c.favorecido, 'Mercado Exemplo')
  })

  it('NFC-e não é comprovante e não perde itens/total', () => {
    assert.equal(ehComprovante(nfce), false)
    const l = interpretarLeitura(nfce)
    assert.equal(l.comprovante, undefined)
    assert.equal(l.total, 41.88)
    assert.equal(l.data, '2026-10-20')
    assert.equal(l.hora, '18:42')
    assert.equal(l.pagamento, 'debito')
    assert.ok((l.itens?.length ?? 0) >= 2)
    assert.ok(l.itens!.every((i) => i.descricao && i.valor != null))
    const ocr = interpretarTextoOCR(nfce)
    assert.ok((ocr.itens?.length ?? 0) >= 2)
  })
})

describe('Stone via cliente (crédito NFC)', () => {
  for (const [nome, texto] of [['limpo', stoneLimpo], ['ocr-ruído', stoneOcrRuido]] as const) {
    it(`${nome}: crédito, valor, data aa, sem itens, sem IDs como valor`, () => {
      assert.equal(ehComprovante(texto), true)
      const l = interpretarLeitura(texto)
      assert.ok(l.comprovante)
      const c = l.comprovante!
      assert.equal(c.tipo, 'credito')
      assert.equal(c.pagamento, 'credito')
      assert.equal(c.valor, 19.63)
      assert.equal(c.data, '2026-11-07')
      assert.equal(c.hora, '09:26')
      assert.notEqual(c.valor, 654321)
      assert.notEqual(c.valor, 100200)
      assert.match(c.favorecido ?? '', /padaria/i)
      assert.equal(l.itens.length, 0)
      assert.equal(l.total, 19.63)
    })
  }

  it('não usa autorização como valor quando o R$ falha no OCR', () => {
    const c = interpretarComprovante(stoneOcrSemValor)
    assert.equal(c.tipo, 'credito')
    assert.notEqual(c.valor, 654321)
    assert.equal(c.valor, undefined)
    assert.equal(c.data, '2026-11-07')
    assert.equal(c.hora, '09:26')
  })
})

describe('Pix C6 (duas etapas, valor repetido)', () => {
  for (const [nome, texto] of [['limpo', c6PixLimpo], ['ocr-ruído', c6PixOcrRuido]] as const) {
    it(`${nome}: um lançamento, destinatário ≠ remetente`, () => {
      assert.equal(ehComprovante(texto), true)
      const l = interpretarLeitura(texto)
      assert.ok(l.comprovante)
      const c = l.comprovante!
      assert.equal(c.tipo, 'pix')
      assert.equal(c.pagamento, 'pix')
      assert.equal(c.valor, 99.90)
      assert.notEqual(c.valor, 199.80)
      assert.equal(c.data, '2026-11-06')
      assert.equal(c.hora, '08:56')
      assert.match(c.favorecido ?? '', /telefonia exemplo/i)
      assert.doesNotMatch(c.favorecido ?? '', /paula remetente/i)
      assert.doesNotMatch(c.descricao, /paula remetente/i)
      assert.equal(l.itens.length, 0)
      assert.ok(c.idTransacao?.startsWith('E12345678'))
    })
  }
})

describe('NFC-e de supermercado com desconto + SiTef no rodapé', () => {
  for (const [nome, texto] of [['limpo', mercadoNfce], ['ocr-ruído', mercadoNfceOcrRuido]] as const) {
    it(`${nome}: não é comprovante; valor líquido 89,90; data/hora; crédito`, () => {
      assert.equal(ehComprovante(texto), false)
      const l = interpretarLeitura(texto)
      assert.equal(l.comprovante, undefined)
      assert.equal(l.total, 89.90)
      assert.notEqual(l.total, 99.90)
      assert.notEqual(l.total, 12.00)
      assert.notEqual(l.total, 10.0)
      assert.equal(l.data, '2026-10-20')
      assert.equal(l.hora, '18:42')
      assert.equal(l.pagamento, 'credito')
      assert.match(l.estabelecimento ?? '', /supermercado exemplo/i)
      assert.equal(l.cnpj, '11.222.333/0001-81')
      assert.equal(l.chave, '35261111222333000181650010000123451000123457')
      assert.ok(pontuarTextoOCR(texto) >= 90)
    })
  }

  it('prioriza Valor a Pagar sobre Valor total', () => {
    assert.equal(extrairTotalNota([
      'Valor total R$ 99,90',
      'Desconto R$ -10,00',
      'Valor a Pagar R$ 89,90',
      'VALOR PAGO R$ 89,90',
      'Tributos Totais R$ 12,00',
    ]), 89.90)
    const ocr = interpretarTextoOCR(mercadoNfce)
    assert.equal(ocr.total, 89.90)
    assert.equal(ocr.data, '2026-10-20')
    assert.equal(ocr.hora, '18:42')
  })

  it('tolera OCR "Valor e Pagar", cabeçalho VALOR TOTAL e total−desconto', () => {
    const linhas = [
      'CODIGO DESCRICAO QTDE UN VALOR UNIT VALOR TOTAL',
      '001 00001879 ARROZ TIPO 1 5KG 2,000 un x 3,79 7,58',
      'Valor total R$ 99,90',
      'DescontosR$ 10,00',
      'Valor e Pagar R$ 89,90',
      'FORMA PAGAMENTO VALOR PRGO R$',
      'Cartao de Credito 89,90',
      'COMPR:000000001, VALOR 199,90',
    ]
    assert.equal(extrairTotalNota(linhas), 89.90)
    // "a pagar" truncado: usa bruto − desconto
    assert.equal(extrairTotalNota([
      'Valor total R$ 99,90',
      'Desconto R$ 10,00',
      'Valor e Pager R$ 89,',
      'VALOR: 199,90',
    ]), 89.90)
  })

  it('lê data/hora no formato do cupom de cartão dd.mm.yy-hh:mm', () => {
    const o = interpretarTextoOCR(`SUPERMERCADO EXEMPLO
Documento Auxiliar da Nota Fiscal de Consumidor Eletronica
Valor a Pagar R$ 89,90
VALOR: 89,90
20.10.26-18:42
SiTef from Fiserv`)
    assert.equal(o.total, 89.90)
    assert.equal(o.data, '2026-10-20')
    assert.equal(o.hora, '18:42')
    assert.equal(ehComprovante(`Documento Auxiliar da Nota Fiscal\nSiTef from Fiserv`), false)
  })
})
