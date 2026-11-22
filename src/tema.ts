export type Tema = 'claro' | 'escuro' | 'sistema'
export const temaAtual = (): Tema => (localStorage.getItem('tema') as Tema) || 'sistema'
export function aplicarTema(t: Tema = temaAtual()) {
  localStorage.setItem('tema', t)
  const escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', escuro)
}
