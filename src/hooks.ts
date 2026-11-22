import { assinarOcultos, valoresEstaoOcultos } from './utils'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Categoria, type Conta } from './db'
export const useCategorias = () => useLiveQuery(() => db.categorias.toArray(), []) ?? []
export const useContas = () => useLiveQuery(() => db.contas.toArray(), []) ?? []
export const mapaPorId = <T extends { id: string }>(l: T[]) => new Map(l.map((x) => [x.id, x]))
export type { Categoria, Conta }
/** Membros da família, por userId (vazio no modo local). */
export const useMembros = () => { const l = useLiveQuery(() => db.membros.toArray(), []) ?? []; return new Map(l.map((m) => [m.userId, m])) }
/** Pessoa selecionada no filtro ('' = família toda); lembrada entre telas. */
import { useState, useSyncExternalStore } from 'react'
export function usePessoa() {
  const [p, setP] = useState(() => sessionStorage.getItem('pessoa') ?? '')
  return [p, (v: string) => { sessionStorage.setItem('pessoa', v); setP(v) }] as const
}

/** Valores escondidos (olho fechado)? Re-renderiza quem usa ao alternar. */
export const useOcultos = () => useSyncExternalStore(assinarOcultos, valoresEstaoOcultos)
