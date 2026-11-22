import { useSyncExternalStore } from 'react'

/* Trava do app neste aparelho.
 * - Biometria ativada: ao abrir (ou voltar depois de TEMPO_FORA) o app pede digital/rosto (WebAuthn, autenticador do aparelho).
 *   É uma trava LOCAL: a sessão do Supabase continua guardada no aparelho; a biometria só libera a tela.
 * - Biometria desativada: ao abrir (ou voltar depois de TEMPO_FORA) a sessão local é encerrada e é preciso entrar de novo. */
export const TEMPO_FORA = 2 * 60 * 1000

const chave = (uid: string) => `bio:${uid}`
export const bioAtiva = (uid?: string) => !!uid && !!localStorage.getItem(chave(uid))
/** Último usuário que ativou a biometria neste aparelho (para travar mesmo se a sessão demorar a carregar). */
export const ultimoBio = () => { const u = localStorage.getItem('bio:ultimo'); return u && bioAtiva(u) ? u : null }
/** Liberado nesta abertura do app (biometria ok ou acabou de digitar a senha). */
let liberado = false
export const marcarLiberado = () => { liberado = true }
export const foiLiberado = () => liberado
export const desativarBio = (uid: string) => { localStorage.removeItem(chave(uid)); avisar() }

const b64 = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b)))
const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const desafio = () => crypto.getRandomValues(new Uint8Array(32))

export async function suportaBiometria() {
  try { return !!window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() } catch { return false }
}

/** Cadastra a digital/rosto deste aparelho para este usuário. */
export async function ativarBio(uid: string, email: string) {
  const cred = await navigator.credentials.create({ publicKey: {
    rp: { name: 'Minhas Finanças', id: location.hostname },
    user: { id: new TextEncoder().encode(uid), name: email, displayName: email },
    challenge: desafio(),
    pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
    timeout: 60000, attestation: 'none',
  } }) as PublicKeyCredential | null
  if (!cred) throw new Error('Cadastro cancelado.')
  localStorage.setItem(chave(uid), b64(cred.rawId)); localStorage.setItem('bio:ultimo', uid); liberado = true; avisar()
}

/** Pede a biometria; true se o aparelho confirmou a pessoa. */
export async function verificarBio(uid: string) {
  const id = localStorage.getItem(chave(uid)); if (!id) return false
  const r = await navigator.credentials.get({ publicKey: {
    challenge: desafio(), rpId: location.hostname, userVerification: 'required', timeout: 60000,
    allowCredentials: [{ type: 'public-key', id: deB64(id), transports: ['internal', 'hybrid'] }],
  } }) as PublicKeyCredential | null
  const ok = !!r && (r.response as AuthenticatorAssertionResponse).authenticatorData.byteLength > 32 && (new Uint8Array((r.response as AuthenticatorAssertionResponse).authenticatorData)[32] & 0x04) !== 0 // flag UV
  if (ok) destravar()
  return ok
}

/* estado da trava (só em memória) */
let travado = false
const ouv = new Set<() => void>()
function avisar() { ouv.forEach((f) => f()) }
export const travar = () => { travado = true; liberado = false; avisar() }
export const destravar = () => { travado = false; liberado = true; avisar() }
export const estaTravado = () => travado
export const useTravado = () => useSyncExternalStore((f) => { ouv.add(f); return () => { ouv.delete(f) } }, () => travado)
/** re-renderiza quem mostra o estado da biometria (Ajustes) */
let versao = 0
ouv.add(() => { versao++ })
export const useVersaoBio = () => useSyncExternalStore((f) => { ouv.add(f); return () => { ouv.delete(f) } }, () => versao)

/** O app foi aberto agora vindo de um login (link de e-mail)? Aí não pede de novo. */
export const voltouDeLogin = /[?&](code|recuperar)=/.test(location.search) || /access_token=/.test(location.hash)
