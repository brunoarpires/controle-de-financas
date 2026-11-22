import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Copy, Share2, RefreshCw, Shield, UserMinus, Pencil, LogOut, Crown, Check } from 'lucide-react'
import { db } from '../db'
import { Titulo } from '../components/ui'
import { formatarCNPJ } from '../utils'
import { brl, mesAtual } from '../utils'
import { useSessao, novoCodigo, definirPapel, removerMembro, renomearMembro, renomearFamilia, sairDaFamilia, sair } from '../sessao'

export default function Familia() {
  const ses = useSessao(), adm = ses.admin
  const membros = useLiveQuery(() => db.membros.toArray(), []) ?? []
  const mes = mesAtual()
  const trans = useLiveQuery(() => db.transacoes.where('data').startsWith(mes).toArray(), [mes]) ?? []
  const [copiado, setCopiado] = useState('')
  const link = `${location.origin}${location.pathname}?convite=${ses.familia?.codigo_convite}`
  const copiar = async (t: string, o: string) => { try { await navigator.clipboard.writeText(t); setCopiado(o); setTimeout(() => setCopiado(''), 2000) } catch { prompt('Copie:', t) } }
  const compartilhar = () => navigator.share ? navigator.share({ title: 'Convite — Minhas Finanças', text: `Entre no perfil ${ses.familia?.nome} no app Minhas Finanças. Código: ${ses.familia?.codigo_convite}`, url: link }).catch(() => {}) : copiar(link, 'link')
  const tentar = (f: () => Promise<any>) => async () => { try { await f() } catch (e: any) { alert(e.message) } }
  const gasto = (uid: string) => trans.filter((t) => t.userId === uid && t.tipo === 'despesa').reduce((s, t) => s + t.valor, 0)
  const qtd = (uid: string) => trans.filter((t) => t.userId === uid).length
  const ordenados = [...membros].sort((a, b) => (a.papel === b.papel ? a.nome.localeCompare(b.nome) : a.papel === 'administrador' ? -1 : 1))

  return (
    <div className="space-y-4">
      <Titulo extra={adm && <button className="btn-ghost text-sm" onClick={tentar(async () => { const n = prompt('Nome do perfil', ses.familia?.nome); if (n?.trim()) await renomearFamilia(n.trim()) })}><Pencil size={16} />Renomear</button>}>{ses.familia?.tipo === 'empresa' ? '🏢' : '👨‍👩‍👧'} {ses.familia?.nome}</Titulo>
      {ses.familia?.tipo === 'empresa' && ses.familia.cnpj && <p className="text-sm text-slate-500 -mt-2 mb-4">CNPJ {formatarCNPJ(ses.familia.cnpj)}{ses.familia.razao_social ? ` · ${ses.familia.razao_social}` : ''}</p>}

      {adm ? (
        <div className="card bg-brand-50 dark:bg-brand-700/10 border-brand-200 dark:border-brand-800">
          <h2 className="font-bold mb-1">Convidar pessoas da casa</h2>
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">Mande o link (ou o código) para quem vai participar. A pessoa cria a conta dela e entra direto neste perfil como <b>membro</b>.</p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-mono text-2xl tracking-[0.3em] font-bold bg-white dark:bg-slate-900 rounded-xl px-4 py-2 border border-brand-200 dark:border-brand-800" data-testid="codigo">{ses.familia?.codigo_convite}</div>
            <button className="btn-ghost" onClick={() => copiar(ses.familia!.codigo_convite, 'codigo')}>{copiado === 'codigo' ? <Check size={18} /> : <Copy size={18} />}Código</button>
            <button className="btn-primary" onClick={compartilhar}>{copiado === 'link' ? <Check size={18} /> : <Share2 size={18} />}Enviar link</button>
            <button className="btn-ghost text-sm" title="Gera um código novo; o antigo para de funcionar" onClick={tentar(async () => { if (confirm('Gerar um novo código? O código e o link atuais param de funcionar.')) await novoCodigo() })}><RefreshCw size={16} />Novo código</button>
          </div>
        </div>
      ) : <div className="card text-sm text-slate-600 dark:text-slate-300">Você é <b>membro</b>: pode lançar e editar os seus gastos e ver tudo do perfil. Categorias, contas, orçamentos e membros são gerenciados pelos administradores.</div>}

      <div className="card">
        <h2 className="font-bold mb-3">Membros ({membros.length})</h2>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {ordenados.map((m) => { const eu = m.userId === ses.user?.id; return (
            <li key={m.userId} className="py-3 flex flex-wrap items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-700/30 text-brand-700 dark:text-brand-100 font-bold flex items-center justify-center">{m.nome.slice(0, 1).toUpperCase()}</div>
              <div className="flex-1 min-w-[10rem]">
                <div className="font-semibold flex items-center gap-1.5">{m.nome}{eu && <span className="text-xs text-slate-400">(você)</span>}{m.papel === 'administrador' && <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 rounded-full px-2 py-0.5"><Crown size={12} />Administrador</span>}</div>
                <div className="text-xs text-slate-500">{m.email} · este mês: {qtd(m.userId)} lançamento(s), {brl(gasto(m.userId))} em despesas</div>
              </div>
              <div className="flex flex-wrap gap-1">
                {(eu || adm) && <button className="btn-ghost text-xs py-1.5 px-2.5" onClick={tentar(async () => { const n = prompt('Nome', m.nome); if (n?.trim()) await renomearMembro(m.userId, n.trim()) })}><Pencil size={14} />Nome</button>}
                {adm && (m.papel === 'membro'
                  ? <button className="btn-ghost text-xs py-1.5 px-2.5" onClick={tentar(() => definirPapel(m.userId, 'administrador'))}><Shield size={14} />Tornar admin</button>
                  : <button className="btn-ghost text-xs py-1.5 px-2.5" onClick={tentar(async () => { if (!eu || confirm('Você deixará de ser administrador. Continuar?')) await definirPapel(m.userId, 'membro') })}>Tornar membro</button>)}
                {adm && !eu && <button className="btn-danger text-xs py-1.5 px-2.5" onClick={tentar(async () => { if (confirm(`Remover ${m.nome} deste perfil? Os lançamentos já feitos por essa pessoa continuam salvos.`)) await removerMembro(m.userId) })}><UserMinus size={14} />Remover</button>}
              </div>
            </li>) })}
        </ul>
      </div>

      <div className="card flex flex-wrap gap-2 items-center">
        <div className="flex-1 text-sm text-slate-500">Conectado como <b>{ses.user?.email}</b></div>
        <button className="btn-ghost" onClick={sair}><LogOut size={18} />Sair da conta</button>
        <button className="btn-danger" onClick={tentar(async () => { if (confirm('Sair deste perfil? Você perderá o acesso aos dados dele (seus lançamentos continuam no perfil).')) await sairDaFamilia() })}>Deixar a família</button>
      </div>
    </div>
  )
}
