import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const chave = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Cliente Supabase. É `null` quando o app roda sem nuvem (modo só neste aparelho). */
export const supabase = url && chave
  ? createClient(url, chave, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null
export const modoNuvem = !!supabase
