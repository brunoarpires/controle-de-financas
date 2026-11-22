import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  hostPermitido, montarUrlConsulta, parseHtmlNfce, validarUrlNfce,
} from '../api/lib/nfce-parse.ts'

const dir = dirname(fileURLToPath(import.meta.url))
const html = readFileSync(join(dir, 'fixtures/nfce-sp-exemplo.html'), 'utf8')

describe('allowlist SEFAZ (anti-SSRF)', () => {
  it('aceita hosts oficiais SP e padrões estaduais', () => {
    assert.equal(hostPermitido('www.nfce.fazenda.sp.gov.br'), true)
    assert.equal(hostPermitido('nfce.fazenda.sp.gov.br'), true)
    assert.equal(hostPermitido('www.sefaz.rj.gov.br'), true)
    assert.equal(hostPermitido('nfce.svrs.rs.gov.br'), true)
  })

  it('rejeita hosts arbitrários, IP e http', () => {
    assert.equal(hostPermitido('evil.com'), false)
    assert.equal(hostPermitido('fazenda.sp.gov.br.evil.com'), false)
    assert.throws(() => validarUrlNfce('http://www.nfce.fazenda.sp.gov.br/x'), /HTTPS/)
    assert.throws(() => validarUrlNfce('https://127.0.0.1/x'), /IP|allowlist/)
    assert.throws(() => validarUrlNfce('https://evil.com/?u=nfce.fazenda.sp.gov.br'), /allowlist/)
  })
})

describe('montarUrlConsulta SP', () => {
  const qr = 'https://www.nfce.fazenda.sp.gov.br/qrcode?p=35261111222333000181650010000123451000123457|2|1|4|401331EC26981B0093D181D69C0C518254719ACE'
  it('reescreve QR SP para ConsultaQRCode', () => {
    const m = montarUrlConsulta({ url: qr })
    assert.match(m.fetchUrl, /ConsultaQRCode\.aspx\?p=/)
    assert.equal(m.chave, '35261111222333000181650010000123451000123457')
    assert.equal(m.uf, '35')
    validarUrlNfce(m.fetchUrl)
  })
})

describe('parseHtmlNfce (fixture supermercado SP)', () => {
  it('extrai valor a pagar, data/hora, CNPJ, pagamento e itens', () => {
    const d = parseHtmlNfce(html, { chave: '35261111222333000181650010000123451000123457', uf: '35' })
    assert.equal(d.fonte, 'SEFAZ')
    assert.match(d.estabelecimento ?? '', /supermercado exemplo/i)
    assert.equal(d.cnpj, '11.222.333/0001-81')
    assert.equal(d.total, 89.90)
    assert.notEqual(d.total, 99.90)
    assert.equal(d.data, '2026-10-20')
    assert.equal(d.hora, '18:42')
    assert.equal(d.pagamento, 'credito')
    assert.ok((d.itens?.length ?? 0) >= 8)
    assert.match(d.itens[0].descricao, /ARROZ TIPO 1/i)
    assert.equal(d.itens[0].valor, 7.58)
    assert.ok(d.endereco && /sao paulo/i.test(d.endereco))
  })
})
