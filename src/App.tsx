import { useTravado } from './bloqueio'
import { useOcultos } from './hooks'
import { ocultarValores } from './utils'
import { Home, List, PieChart, Upload, Settings, Plus, Users, Cloud, CloudOff, RefreshCw, ArrowLeftRight } from 'lucide-react'
import { useState, useSyncExternalStore, useEffect } from 'react'
import { modoNuvem } from './supabase'
import { useSessao, trocarPerfil } from './sessao'
import { syncAssinar, syncEstado, sincronizar, limparErroSync } from './sync'
import Familia from './pages/Familia'
import { TelaBloqueio, Login, NovaSenha, InicioFamilia, Migracao, Carregando, EscolherPerfil } from './pages/Acesso'
import { useRota, ir } from './rota'
import Dashboard from './pages/Dashboard'
import Lancamentos from './pages/Lancamentos'
import Orcamento from './pages/Orcamento'
import Importar from './pages/Importar'
import ImportPlanilha from './pages/ImportPlanilha'
import ImportNota from './pages/ImportNota'
import Ajustes from './pages/Ajustes'
import TransacaoForm from './components/TransacaoForm'
import type { Tipo } from './db'

const NAV = [
  { r: '/', nome: 'Início', Icon: Home }, { r: '/lancamentos', nome: 'Lançamentos', Icon: List },
  { r: '/importar', nome: 'Importar', Icon: Upload }, { r: '/orcamento', nome: 'Orçamento', Icon: PieChart }, { r: '/ajustes', nome: 'Ajustes', Icon: Settings },
]

function StatusSync({ compacto }: { compacto?: boolean }) {
  const e = useSyncExternalStore(syncAssinar, syncEstado)
  const txt = !e.online ? `Sem internet${e.pendentes ? ` · ${e.pendentes} a enviar` : ''}` : e.sincronizando ? 'Sincronizando…' : e.pendentes ? `${e.pendentes} a enviar` : 'Tudo salvo na nuvem'
  const Ic = !e.online ? CloudOff : e.sincronizando ? RefreshCw : Cloud
  return (
    <>
      <button onClick={() => sincronizar()} title={e.ultimo ? `Última sincronização: ${new Date(e.ultimo).toLocaleTimeString('pt-BR')}` : ''} className={`flex items-center gap-1.5 text-xs ${!e.online ? 'text-amber-600' : 'text-slate-500'} ${compacto ? '' : 'px-3 py-2'}`}>
        <Ic size={14} className={e.sincronizando ? 'animate-spin' : ''} />{txt}
      </button>
      {e.erro && <div className="fixed top-3 inset-x-3 md:left-auto md:w-96 z-50 rounded-xl bg-rose-600 text-white p-3 text-sm shadow-lg flex gap-2" role="alert"><span className="flex-1">{e.erro}</span><button onClick={limparErroSync} className="font-bold">OK</button></div>}
    </>
  )
}

export default function App() {
  const ses = useSessao()
  const travado = useTravado()
  if (ses.carregando && !ses.familia && !travado) return <Carregando />
  if (modoNuvem) {
    if (ses.recuperandoSenha && ses.user) return <NovaSenha />
    if (travado) return <TelaBloqueio /> // antes do login: com biometria ativa nunca cai na tela de senha
    if (!ses.user) return <Login />
    if (ses.novoPerfil || (!ses.familia && !ses.perfis.length) || (!ses.familia && sessionStorage.getItem('convite'))) return <InicioFamilia />
    if (!ses.familia) return <EscolherPerfil />
    if (ses.migracaoPendente) return <Migracao />
  }
  return <Principal key={ses.familia?.id ?? 'local'} /> // remonta ao trocar de perfil (cada perfil tem o próprio cache)
}

const iconePerfil = (tipo?: string) => (tipo === 'empresa' ? '🏢' : '👨‍👩‍👧')
/** Mostra o perfil ativo; tocar abre a escolha de perfil (quando há mais de um) ou a página do perfil. */
function BotaoPerfil({ compacto }: { compacto?: boolean }) {
  const ses = useSessao()
  const varios = ses.perfis.length > 1
  const acao = () => (varios ? trocarPerfil() : (location.hash = '#/familia'))
  return (
    <button onClick={acao} data-testid="trocar-perfil" title={varios ? 'Trocar de perfil' : 'Perfil e membros'}
      className={compacto ? 'text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 min-w-0 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5'
        : 'mb-4 w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 flex items-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800'}>
      <span>{iconePerfil(ses.familia?.tipo)}</span><span className={`truncate ${compacto ? '' : 'flex-1 font-semibold text-sm'}`}>{ses.familia?.nome}</span>{varios && <ArrowLeftRight size={14} className="shrink-0 text-brand-600" />}
    </button>
  )
}

function Principal() {
  const ses = useSessao()
  useOcultos() // ao alternar o olho, re-renderiza todas as telas (todos os valores R$)
  useEffect(() => { ocultarValores(true) }, []) // monta de novo a cada perfil escolhido: sempre começa escondido
  const rota = useRota()
  const [novo, setNovo] = useState<Tipo | null>(null)
  const ativo = (r: string) => (r === '/' ? rota === '/' : rota.startsWith(r))
  let pagina
  if (rota.startsWith('/lancamentos')) pagina = <Lancamentos />
  else if (rota === '/orcamento') pagina = <Orcamento />
  else if (rota === '/importar/planilha') pagina = <ImportPlanilha />
  else if (rota === '/importar/nota') pagina = <ImportNota />
  else if (rota.startsWith('/importar')) pagina = <Importar />
  else if (rota === '/ajustes') pagina = <Ajustes />
  else if (rota === '/familia' && modoNuvem) pagina = <Familia />
  else pagina = <Dashboard onNovo={setNovo} />

  return (
    <div className="min-h-full md:flex">
      <aside className="hidden md:flex md:w-60 lg:w-64 shrink-0 flex-col gap-1 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sticky top-0 h-screen self-start">
        <div className="flex items-center gap-2 px-2 mb-6"><img src="/icon.svg" className="w-9 h-9" alt="" /><div className="min-w-0"><div className="font-bold text-lg leading-tight">Minhas Finanças</div>{modoNuvem && <div className="text-xs text-slate-500 truncate">{ses.eu?.nome}</div>}</div></div>
        {modoNuvem && <BotaoPerfil />}
        <button className="btn-primary mb-4" onClick={() => setNovo('despesa')}><Plus size={18} /> Novo lançamento</button>
        {[...NAV, ...(modoNuvem ? [{ r: '/familia', nome: 'Perfil e membros', Icon: Users }] : [])].map(({ r, nome, Icon }) => (
          <a key={r} href={'#' + r} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 font-medium ${ativo(r) ? 'bg-brand-50 text-brand-700 dark:bg-brand-700/20 dark:text-brand-100' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`}><Icon size={20} />{nome}</a>
        ))}
        {modoNuvem && <div className="mt-auto"><StatusSync /></div>}
      </aside>
      <main className="flex-1 min-w-0 pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-8">
        {modoNuvem && <div className="md:hidden flex items-center justify-between px-4 pt-3 -mb-2"><BotaoPerfil compacto /><StatusSync compacto /></div>}
        <div className="max-w-5xl mx-auto p-4 md:p-8">{pagina}</div>
      </main>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 grid grid-cols-5" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {NAV.map(({ r, nome, Icon }) => (
          <a key={r} href={'#' + r} className={`flex flex-col items-center gap-0.5 py-2 min-w-0 text-[11px] leading-tight font-medium ${ativo(r) ? 'text-brand-600' : 'text-slate-500'}`}><Icon size={22} /><span className="truncate max-w-full px-0.5">{nome}</span></a>
        ))}
      </nav>
      {!rota.startsWith('/importar/') && (
        <button aria-label="Novo lançamento" onClick={() => setNovo('despesa')} className="md:hidden fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 w-14 h-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center active:scale-95"><Plus size={28} /></button>
      )}
      {novo && <TransacaoForm tipoInicial={novo} onFechar={() => setNovo(null)} />}
    </div>
  )
}
export { ir }
