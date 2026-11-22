import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { iniciarSessao } from './sessao'
import { aplicarTema } from './tema'

aplicarTema()
// link de convite: /?convite=CODIGO (guardado até a pessoa entrar/criar conta)
const conv = new URLSearchParams(location.search).get('convite')
if (conv) { sessionStorage.setItem('convite', conv.toUpperCase()); history.replaceState(null, '', location.pathname + location.hash) }
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
iniciarSessao()
