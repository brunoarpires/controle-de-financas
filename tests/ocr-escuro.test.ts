import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { deveInverterOcr, inverterSeEscuro, mediaCinza, LIMIAR_INVERSAO_OCR } from '../src/nota.ts'
import { interpretarComprovante } from '../src/comprovante.ts'
import { HOJE_AMOSTRA } from './fixtures-carteira-bancos.ts'

const raiz = join(dirname(fileURLToPath(import.meta.url)))
const pngEscuro = join(raiz, 'fixtures/google-wallet-escuro.png')
const tmp = join(tmpdir(), 'financas-ocr-escuro')

describe('pré-processamento de print em modo escuro', () => {
  it('inverte quando a média do cinza é baixa (fundo escuro, texto claro)', () => {
    assert.equal(deveInverterOcr(28), true)
    assert.equal(deveInverterOcr(LIMIAR_INVERSAO_OCR), false)
    assert.equal(deveInverterOcr(180), false)
    const escuro = new Uint8ClampedArray(100).fill(20)
    escuro[0] = 250 // um pixel de texto claro
    inverterSeEscuro(escuro)
    assert.equal(escuro[1], 235) // 255-20
    assert.equal(escuro[0], 5)
  })

  it('o PNG sintético do Wallet é predominantemente escuro', () => {
    const { gray } = pixelsDoPng(pngEscuro)
    const media = mediaCinza(gray)
    assert.ok(media < LIMIAR_INVERSAO_OCR, `média ${media} deveria ser < ${LIMIAR_INVERSAO_OCR}`)
    const copia = new Uint8ClampedArray(gray)
    inverterSeEscuro(copia)
    assert.ok(mediaCinza(copia) > 140, 'depois da inversão o fundo deve ficar claro')
  })
})

describe('OCR no print sintético (tema escuro)', { timeout: 120_000 }, () => {
  it('depois da inversão, o Tesseract lê valor, data e o estabelecimento', async () => {
    const { gray, w, h } = pixelsDoPng(pngEscuro)
    inverterSeEscuro(gray)
    mkdirSync(tmp, { recursive: true })
    const claro = join(tmp, 'google-wallet-claro.png')
    escreverPngCinza(claro, gray, w, h)
    const { createWorker } = await import('tesseract.js')
    const worker = await createWorker('por', 1)
    try {
      const { data } = await worker.recognize(claro)
      const texto = data.text || ''
      assert.ok(texto.length > 20, `OCR devolveu pouco texto: ${JSON.stringify(texto)}`)
      const c = interpretarComprovante(texto, { hoje: HOJE_AMOSTRA })
      assert.equal(c.valor, 37.4)
      assert.equal(c.data, '2026-11-28')
      assert.match(c.favorecido ?? texto, /farmacia/i)
    } finally {
      await worker.terminate()
    }
  })
})

/** Decodifica o PNG de fixture via Python/Pillow (sem dependência extra no Node). */
function pixelsDoPng(caminho: string): { gray: Uint8ClampedArray; w: number; h: number } {
  const py = `
import sys
from PIL import Image
im = Image.open(sys.argv[1]).convert('L')
sys.stdout.buffer.write(im.size[0].to_bytes(4,'little') + im.size[1].to_bytes(4,'little') + im.tobytes())
`
  const buf = execFileSync('python3', ['-c', py, caminho], { maxBuffer: 20 * 1024 * 1024 })
  const w = buf.readUInt32LE(0)
  const h = buf.readUInt32LE(4)
  return { gray: new Uint8ClampedArray(buf.subarray(8)), w, h }
}

function escreverPngCinza(caminho: string, gray: Uint8ClampedArray, w: number, h: number) {
  const raw = join(tmp, 'gray.bin')
  writeFileSync(raw, gray)
  const py = `
import sys
from PIL import Image
w, h = int(sys.argv[2]), int(sys.argv[3])
im = Image.frombytes('L', (w, h), open(sys.argv[1], 'rb').read())
im.convert('RGB').save(sys.argv[4], 'PNG')
`
  execFileSync('python3', ['-c', py, raw, String(w), String(h), caminho])
}
