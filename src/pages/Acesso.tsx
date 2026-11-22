import { useState, type FormEvent, type ReactNode } from 'react'
import { Mail, Lock, User, Users, KeyRound, LogIn, UserPlus, Upload, Trash2, Building2, ChevronRight, Plus, Fingerprint, Eye, EyeOff } from 'lucide-react'
import { verificarBio, ultimoBio, marcarLiberado } from '../bloqueio'
import { consultarCNPJ } from '../nota'
import { formatarCNPJ } from '../utils'
import { supabase } from '../supabase'
import { criarFamilia, entrarFamilia, traduzir, useSessao, sair, resolverMigracao, concluirRecuperacao, escolherPerfil, abrirNovoPerfil, entrarComSenha, aposBiometria } from '../sessao'

const Moldura = ({ children, subtitulo }: { children: ReactNode; subtitulo?: string }) => (
  <div className="min-h-full flex items-center justify-center p-4 bg-gradient-to-br from-brand-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center mb-6"><img src="/icon.svg" className="w-16 h-16 mb-2" alt="" /><h1 className="text-2xl font-bold">Minhas Finanças</h1>{subtitulo && <p className="text-slate-500 text-center">{subtitulo}</p>}</div>
      <div className="card p-6">{children}</div>
    </div>
  </div>
)
const Campo = ({ icone, ...p }: { icone: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div className="relative mb-3"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icone}</span><input className="input pl-10" required {...p} /></div>
)
/** Campo de senha com olho para mostrar/esconder. */
function CampoSenha({ icone, ...p }: { icone: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  const [ver, setVer] = useState(false)
  return (
    <div className="relative mb-3"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{icone}</span>
      <input className="input pl-10 pr-11" required {...p} type={ver ? 'text' : 'password'} />
      <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Esconder senha' : 'Mostrar senha'} title={ver ? 'Esconder senha' : 'Mostrar senha'} className="absolute right-1.5 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-slate-600">{ver ? <EyeOff size={18} /> : <Eye size={18} />}</button>
    </div>
  )
}
const Aviso = ({ tipo, children }: { tipo: 'erro' | 'ok'; children: ReactNode }) => (
  <div className={`rounded-xl p-3 text-sm mb-3 ${tipo === 'erro' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200'}`}>{children}</div>
)
const base = () => location.origin + location.pathname

export function Login() {
  const expirada = useSessao().sessaoExpirada
  const [modo, setModo] = useState<'entrar' | 'criar' | 'esqueci'>('entrar')
  const [email, setEmail] = useState(''), [senha, setSenha] = useState(''), [nome, setNome] = useState('')
  const [erro, setErro] = useState(''), [ok, setOk] = useState(''), [ocupado, setOcupado] = useState(false)
  const convite = sessionStorage.getItem('convite')
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(''); setOk(''); setOcupado(true)
    try {
      if (modo === 'entrar') { marcarLiberado(); const { error } = await supabase!.auth.signInWithPassword({ email, password: senha }); if (error) throw error }
      else if (modo === 'criar') {
        const { data, error } = await supabase!.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: base() } })
        if (error) throw error
        if (!data.session) setOk('Conta criada! Enviamos um e-mail de confirmação. Abra o link e depois entre aqui.')
      } else {
        const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: base() + '?recuperar=1' })
        if (error) throw error
        setOk('Se esse e-mail tiver conta, você vai receber um link para criar uma nova senha.')
      }
    } catch (err: any) { setErro(traduzir(err.message)) } finally { setOcupado(false) }
  }
  const aba = (m: typeof modo, t: string) => <button type="button" onClick={() => { setModo(m); setErro(''); setOk('') }} className={`flex-1 py-2 rounded-lg font-semibold text-sm ${modo === m ? 'bg-white dark:bg-slate-700 shadow' : 'text-slate-500'}`}>{t}</button>
  return (
    <Moldura subtitulo={convite ? 'Você recebeu um convite para um perfil financeiro. Entre ou crie sua conta para participar.' : 'O controle financeiro da casa e da empresa, junto com quem você quiser.'}>
      {expirada && <Aviso tipo="erro">Seu login neste aparelho expirou. Entre com a senha uma vez; depois a biometria volta a funcionar.</Aviso>}
      {modo !== 'esqueci' && <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 mb-5">{aba('entrar', 'Entrar')}{aba('criar', 'Criar conta')}</div>}
      {modo === 'esqueci' && <h2 className="font-bold text-lg mb-1">Recuperar senha</h2>}
      {modo === 'esqueci' && <p className="text-sm text-slate-500 mb-4">Informe seu e-mail e enviaremos um link para criar uma nova senha.</p>}
      <form onSubmit={enviar}>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}{ok && <Aviso tipo="ok">{ok}</Aviso>}
        {modo === 'criar' && <Campo icone={<User size={18} />} placeholder="Seu nome" value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" />}
        <Campo icone={<Mail size={18} />} type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        {modo !== 'esqueci' && <CampoSenha icone={<Lock size={18} />} placeholder={modo === 'criar' ? 'Crie uma senha (mín. 6 caracteres)' : 'Senha'} minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />}
        <button className="btn-primary w-full py-3 mt-1" disabled={ocupado}>{modo === 'entrar' ? <><LogIn size={18} />Entrar</> : modo === 'criar' ? <><UserPlus size={18} />Criar conta</> : <><Mail size={18} />Enviar link</>}</button>
      </form>
      <div className="text-center mt-4 text-sm">{modo === 'esqueci' ? <button className="text-brand-600 font-semibold" onClick={() => setModo('entrar')}>Voltar para entrar</button> : <button className="text-brand-600 font-semibold" onClick={() => setModo('esqueci')}>Esqueci minha senha</button>}</div>
    </Moldura>
  )
}

export function NovaSenha() {
  const [senha, setSenha] = useState(''), [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  async function enviar(e: FormEvent) {
    e.preventDefault(); setOcupado(true); setErro('')
    const { error } = await supabase!.auth.updateUser({ password: senha })
    setOcupado(false)
    if (error) return setErro(traduzir(error.message))
    alert('Senha alterada!'); concluirRecuperacao()
  }
  return (
    <Moldura subtitulo="Crie sua nova senha">
      <form onSubmit={enviar}>{erro && <Aviso tipo="erro">{erro}</Aviso>}
        <CampoSenha icone={<KeyRound size={18} />} minLength={6} placeholder="Nova senha (mín. 6 caracteres)" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="new-password" />
        <button className="btn-primary w-full py-3" disabled={ocupado}>Salvar nova senha</button>
      </form>
    </Moldura>
  )
}

export function InicioFamilia() {
  const ses = useSessao()
  const conv = sessionStorage.getItem('convite') ?? ''
  const [modo, setModo] = useState<'criar' | 'entrar'>(conv ? 'entrar' : 'criar')
  const [tipo, setTipo] = useState<'pessoal' | 'empresa'>('pessoal')
  const [nomeFam, setNomeFam] = useState(''), [codigo, setCodigo] = useState(conv)
  const [cnpj, setCnpj] = useState(''), [razao, setRazao] = useState('')
  const [meuNome, setMeuNome] = useState((ses.perfis[0]?.eu.nome) ?? (ses.user?.user_metadata?.nome as string) ?? '')
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  const voltar = ses.perfis.length > 0
  async function buscarCnpj() {
    const c = cnpj.replace(/\D/g, ''); if (c.length !== 14) return
    try { const d = await consultarCNPJ(c); if (d?.razao_social) { setRazao(d.razao_social); if (!nomeFam) setNomeFam(d.nome_fantasia || d.razao_social) } } catch { /* sem internet: segue sem */ }
  }
  async function enviar(e: FormEvent) {
    e.preventDefault(); setErro(''); setOcupado(true)
    try {
      if (modo === 'criar') await criarFamilia(nomeFam.trim(), meuNome.trim(), tipo, tipo === 'empresa' ? cnpj : undefined, tipo === 'empresa' ? razao : undefined)
      else await entrarFamilia(codigo, meuNome.trim())
      sessionStorage.removeItem('convite')
    }
    catch (err: any) { setErro(/inválid|not found|Convite/i.test(err.message) ? 'Código de convite não encontrado. Confira com quem te convidou.' : err.message) } finally { setOcupado(false) }
  }
  const cartao = (ativo: boolean) => `rounded-2xl border-2 p-3 text-left ${ativo ? 'border-brand-500 bg-brand-50 dark:bg-brand-700/20' : 'border-slate-200 dark:border-slate-700'}`
  return (
    <Moldura subtitulo={voltar ? 'Novo perfil financeiro' : `Olá! Falta só um passo, ${ses.user?.email}.`}>
      <div className="grid grid-cols-2 gap-2 mb-5">
        <button type="button" onClick={() => setModo('criar')} className={cartao(modo === 'criar')}><Users className="mb-1 text-brand-600" /><div className="font-semibold">Criar perfil</div><div className="text-xs text-slate-500">Família ou empresa</div></button>
        <button type="button" onClick={() => setModo('entrar')} className={cartao(modo === 'entrar')}><KeyRound className="mb-1 text-brand-600" /><div className="font-semibold">Tenho um convite</div><div className="text-xs text-slate-500">Entrar com código</div></button>
      </div>
      <form onSubmit={enviar}>{erro && <Aviso tipo="erro">{erro}</Aviso>}
        <label className="label">Seu nome (como os membros vão te ver)</label>
        <Campo icone={<User size={18} />} placeholder="Ex.: Alex" value={meuNome} onChange={(e) => setMeuNome(e.target.value)} />
        {modo === 'criar'
          ? <>
            <label className="label">Tipo de perfil</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button type="button" onClick={() => setTipo('pessoal')} className={cartao(tipo === 'pessoal')}><div className="text-xl">👨‍👩‍👧</div><div className="font-semibold text-sm">Pessoal / família</div></button>
              <button type="button" onClick={() => setTipo('empresa')} className={cartao(tipo === 'empresa')}><div className="text-xl">🏢</div><div className="font-semibold text-sm">Empresa</div></button>
            </div>
            {tipo === 'empresa' && <><label className="label">CNPJ (opcional)</label><Campo icone={<Building2 size={18} />} required={false} inputMode="numeric" placeholder="00.000.000/0000-00" value={cnpj} onChange={(e) => setCnpj(e.target.value)} onBlur={buscarCnpj} />{razao && <p className="text-xs text-slate-500 -mt-2 mb-3">Razão social: <b>{razao}</b></p>}</>}
            <label className="label">Nome do perfil</label><Campo icone={<Users size={18} />} placeholder={tipo === 'empresa' ? 'Ex.: Oficina Exemplo' : 'Ex.: Família Silva'} value={nomeFam} onChange={(e) => setNomeFam(e.target.value)} />
            <p className="text-xs text-slate-500 mb-3">Você será o administrador e poderá convidar outras pessoas para este perfil.</p></>
          : <><label className="label">Código do convite</label><Campo icone={<KeyRound size={18} />} placeholder="Ex.: 7KQ2M9XA" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} className="input pl-10 uppercase tracking-widest font-mono" /></>}
        <button className="btn-primary w-full py-3" disabled={ocupado}>{modo === 'criar' ? 'Criar perfil' : 'Entrar no perfil'}</button>
      </form>
      <div className="text-center mt-4 text-sm">{voltar
        ? <button className="text-brand-600 font-semibold" onClick={() => { sessionStorage.removeItem('convite'); abrirNovoPerfil(false) }}>Voltar para meus perfis</button>
        : <button className="text-slate-500" onClick={sair}>Sair da conta</button>}</div>
    </Moldura>
  )
}

/** Ao abrir o app com mais de um perfil: escolher qual usar agora. */
export function EscolherPerfil() {
  const ses = useSessao()
  return (
    <Moldura subtitulo="Qual perfil você quer usar agora?">
      <div className="space-y-2">
        {ses.perfis.map(({ familia: f, eu }) => (
          <button key={f.id} data-testid="perfil" onClick={() => escolherPerfil(f.id)} disabled={ses.carregando}
            className="w-full rounded-2xl border-2 border-slate-200 dark:border-slate-700 hover:border-brand-500 p-4 text-left flex items-center gap-3 active:scale-[.99]">
            <span className="text-3xl">{f.tipo === 'empresa' ? '🏢' : '👨‍👩‍👧'}</span>
            <span className="flex-1 min-w-0"><span className="block font-bold truncate">{f.nome}</span>
              <span className="block text-xs text-slate-500 truncate">{f.tipo === 'empresa' ? `Empresa${f.cnpj ? ' · ' + formatarCNPJ(f.cnpj) : ''}` : 'Pessoal'} · {eu.papel === 'administrador' ? 'administrador' : 'membro'}</span></span>
            <ChevronRight className="text-slate-400" />
          </button>
        ))}
      </div>
      <button className="btn-ghost w-full mt-4" onClick={() => abrirNovoPerfil()}><Plus size={18} />Novo perfil ou convite</button>
      <div className="text-center mt-3 text-sm"><button className="text-slate-500" onClick={sair}>Sair da conta</button></div>
    </Moldura>
  )
}

export function Migracao() {
  const ses = useSessao()
  const [ocupado, setOcupado] = useState(false)
  const ir = async (enviar: boolean) => { if (!enviar && !confirm('Os dados que estão só neste aparelho serão apagados. Tem certeza?')) return; setOcupado(true); try { await resolverMigracao(enviar) } catch (e: any) { alert(e.message); setOcupado(false) } }
  return (
    <Moldura subtitulo={ses.familia?.nome}>
      <h2 className="font-bold text-lg mb-2">Encontramos dados neste aparelho</h2>
      <p className="text-slate-600 dark:text-slate-300 mb-5">Há <b>{ses.migracaoPendente} lançamento(s)</b> que você salvou aqui antes de entrar. Quer enviar para o perfil <b>{ses.familia?.nome}</b>? Eles ficarão registrados como seus.</p>
      <button className="btn-primary w-full py-3 mb-2" disabled={ocupado} onClick={() => ir(true)}><Upload size={18} />{ocupado ? 'Enviando…' : 'Sim, enviar para este perfil'}</button>
      <button className="btn-ghost w-full" disabled={ocupado} onClick={() => ir(false)}><Trash2 size={18} />Não, descartar</button>
    </Moldura>
  )
}

export const Carregando = () => <div className="min-h-full flex items-center justify-center text-slate-500"><img src="/icon.svg" className="w-14 h-14 animate-pulse" alt="Carregando" /></div>

/** Tela de desbloqueio por biometria (digital/rosto). */
export function TelaBloqueio() {
  const ses = useSessao()
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false)
  async function desbloquear() {
    setErro(''); setOcupado(true)
    try {
      const uid = ses.user?.id ?? ultimoBio()
      if (!uid || !(await verificarBio(uid))) { setErro('Não foi possível confirmar. Tente de novo.'); return }
      if (!(await aposBiometria())) await entrarComSenha() // sessão expirada no servidor: senha uma vez
    }
    catch (e: any) { setErro(e?.name === 'NotAllowedError' ? 'Biometria cancelada ou não reconhecida. Tente de novo ou entre com a senha.' : 'Biometria indisponível agora. Entre com a senha.') }
    finally { setOcupado(false) }
  }
  return (
    <Moldura subtitulo={`App bloqueado${ses.user?.email ? ' · ' + ses.user.email : ''}`}>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <button data-testid="desbloquear" className="btn-primary w-full py-4 text-base" onClick={desbloquear} disabled={ocupado}><Fingerprint size={22} />Desbloquear com biometria</button>
      <button className="btn-ghost w-full mt-3" onClick={() => entrarComSenha()}><Lock size={18} />Entrar com senha</button>
    </Moldura>
  )
}
