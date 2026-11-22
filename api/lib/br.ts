/** Helpers BR compartilhados pelas functions (sem deps do app). */

export function parseValorBR(v: unknown): number | null {
  if (typeof v === 'number') return isFinite(v) ? v : null
  if (v === null || v === undefined) return null
  let s = String(v).trim(); if (!s) return null
  const neg = /^\(.*\)$/.test(s) || /-/.test(s)
  s = s.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.')
  if (lc > ld) s = s.replace(/\./g, '').replace(',', '.')
  else if (ld > lc && lc >= 0) s = s.replace(/,/g, '')
  else if (lc === -1 && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '')
  else if (lc === -1 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '')
  const n = parseFloat(s); if (isNaN(n)) return null
  return neg ? -n : n
}

export function parseDataBR(v: unknown): string | null {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) {
    let y = m[3]; if (y.length === 2) y = '20' + y
    const d = +m[1], mo = +m[2]
    if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  return null
}

export function formatarCNPJ(c: string) {
  return c.replace(/\D/g, '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
}

export function cnpjValido(c: string) {
  const d = c.replace(/\D/g, ''); if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false
  const calc = (n: number) => {
    let s = 0, p = n - 7
    for (let i = 0; i < n; i++) { s += +d[i] * p--; if (p < 2) p = 9 }
    const r = s % 11; return r < 2 ? 0 : 11 - r
  }
  return calc(12) === +d[12] && calc(13) === +d[13]
}
