/* Privacidade: valores escondidos por padrão. A escolha do olho vale nesta aba (sessionStorage);
   ao abrir o app ou trocar de perfil, volta a esconder (ver App.tsx). */
const CHAVE_OCULTOS = 'valoresOcultos'
function lerOcultos(): boolean {
  try { if (sessionStorage.getItem(CHAVE_OCULTOS) === 'false') return false } catch { /* sem storage (SSR/testes) */ }
  return true
}
let valoresOcultos = lerOcultos()
const ouvOcultos = new Set<() => void>()
export const ocultarValores = (v: boolean) => {
  valoresOcultos = v
  try { sessionStorage.setItem(CHAVE_OCULTOS, String(v)) } catch { /* ignore */ }
  ouvOcultos.forEach((f) => f())
}
export const assinarOcultos = (f: () => void) => { ouvOcultos.add(f); return () => { ouvOcultos.delete(f) } }
export const valoresEstaoOcultos = () => valoresOcultos
export const brl = (v: number) => (valoresOcultos ? 'R$ •••••' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

/** Receitas − despesas da lista (já filtrada; lançamentos excluídos não entram no cache local). */
export function saldoLancamentos(transacoes: { tipo: 'receita' | 'despesa'; valor: number }[]) {
  return transacoes.reduce((s, t) => s + (t.tipo === 'receita' ? t.valor : -t.valor), 0)
}
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
export const mesAtual = () => hojeISO().slice(0, 7)
export const dataBR = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
export const nomeMes = (ym: string, curto = false) => { const [y, m] = ym.split('-').map(Number); const n = MESES[m - 1]; return curto ? `${n.slice(0, 3)}/${String(y).slice(2)}` : `${n[0].toUpperCase()}${n.slice(1)} de ${y}` }
export const somaMes = (ym: string, delta: number) => { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

/** Converte "1.234,56", "R$ -1234.56", "(12,30)", 1234.5 em número. */
export function parseValorBR(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (v === null || v === undefined) return null
  let s = String(v).trim(); if (!s) return null
  let neg = /^\(.*\)$/.test(s) || /-/.test(s) || /\bD$/i.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.')
  else if (ld > lc && lc >= 0) s = s.replace(/,/g, '')
  else if (lc === -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  else if (lc === -1 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '') // 1.234 -> milhar
  const n = parseFloat(s); if (isNaN(n)) return null
  return neg ? -n : n
}

/** Converte "25/10/2026", "25-10-26", "2026-10-25", número serial Excel ou Date em yyyy-mm-dd. */
export function parseDataBR(v: unknown): string | null {
  if (v instanceof Date && !isNaN(+v)) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { let y = m[3]; if (y.length === 2) y = '20' + y; const d = +m[1], mo = +m[2]; if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
  return null
}

export const formatarCNPJ = (c: string) => c.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
export function cnpjValido(c: string) {
  const d = c.replace(/\D/g, ''); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (n: number) => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9 } const r = s % 11; return r < 2 ? 0 : 11 - r }
  return calc(12) === +d[12] && calc(13) === +d[13]
}

export async function comprimirImagem(file: Blob, max = 1280, q = 0.7): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((r) => c.toBlob((b) => r(b!), 'image/jpeg', q))
}
export const baixar = (blob: Blob, nome: string) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000) }

/** Soma N meses a uma data ISO (yyyy-mm-dd), respeitando o último dia do mês. */
export function addMeses(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, 1)
  const ultimo = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate()
  const dia = Math.min(d, ultimo)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

/** Divide um valor em N parcelas (centavos). A sobra vai para a última. */
export function dividirParcelas(total: number, n: number): number[] {
  const cents = Math.round(Math.abs(total) * 100)
  if (n < 2) return [cents / 100]
  const base = Math.floor(cents / n)
  const vals = Array.from({ length: n }, () => base)
  vals[n - 1] = cents - base * (n - 1)
  return vals.map((c) => c / 100)
}
