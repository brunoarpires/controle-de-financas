import { useEffect, useState } from 'react'
export function useRota() {
  const [r, setR] = useState(location.hash.slice(1) || '/')
  useEffect(() => { const f = () => { setR(location.hash.slice(1) || '/'); window.scrollTo(0, 0) }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f) }, [])
  return r
}
export const ir = (r: string) => { location.hash = r }
