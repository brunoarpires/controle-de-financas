import { bioAtiva, ativarBio, desativarBio, suportaBiometria, useVersaoBio } from '../bloqueio'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useEffect } from 'react'
import { Download, Upload, Plus, Trash2 } from 'lucide-react'
import { modoNuvem } from '../supabase'
import { useSessao, sair } from '../sessao'
import { ir } from '../rota'
import { db, uuid, salvar, excluir, exportarBackup, importarBackup, type Categoria, type Conta } from '../db'
import { useCategorias, useContas, useMembros } from '../hooks'
import { rotuloContaComIcone, TIPO_VR } from '../vrTicket'
import { baixar, hojeISO } from '../utils'
import { aplicarTema, temaAtual, type Tema } from '../tema'
import { Modal, Titulo } from '../components/ui'

const CORES = ['#16a34a', '#f97316', '#0ea5e9', '#8b5cf6', '#eab308', '#ef4444', '#6366f1', '#ec4899', '#14b8a6', '#64748b', '#84cc16', '#a16207']
export default function Ajustes() {
  const ses = useSessao(), adm = !modoNuvem || ses.admin
  const cats = useCategorias(), contas = useContas()
  const membros = useMembros()
  const listaMembros = [...membros.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const [tema, setTema] = useState<Tema>(temaAtual())
  const [cat, setCat] = useState<Partial<Categoria> | null>(null)
  const [conta, setConta] = useState<Partial<Conta> | null>(null)
  const n = useLiveQuery(() => db.transacoes.count(), []) ?? 0

  async function salvarCat() { if (!cat?.nome) return; await salvar('categorias', { id: uuid(), icone: '📦', cor: CORES[0], tipo: 'despesa', ...cat } as Categoria); setCat(null) }
  async function excluirCat() {
    const usos = await db.transacoes.where('categoriaId').equals(cat!.id!).count()
    if (usos) return alert(`Essa categoria tem ${usos} lançamento(s). Mude a categoria deles antes de excluir.`)
    if (confirm('Excluir categoria?')) { await excluir('categorias', cat!.id!); if (await db.orcamentos.get(cat!.id!)) await excluir('orcamentos', cat!.id!); setCat(null) }
  }
  async function salvarConta() {
    if (!conta?.nome) return
    if (conta.tipo === TIPO_VR && listaMembros.length && !conta.titularId) return alert('Escolha de quem é este VR - Ticket.')
    const row: Conta = { id: uuid(), icone: '🏦', tipo: 'conta', ...conta, nome: conta.nome.trim() }
    if (row.tipo !== TIPO_VR) delete row.titularId
    await salvar('contas', row)
    setConta(null)
  }
  async function excluirConta() {
    if (await db.transacoes.where('contaId').equals(conta!.id!).count()) return alert('Essa conta tem lançamentos e não pode ser excluída.')
    if (confirm('Excluir conta?')) { await excluir('contas', conta!.id!); setConta(null) }
  }

  return (
    <div className="space-y-4">
      <Titulo>Ajustes</Titulo>
      {modoNuvem && <div className="card flex flex-wrap items-center gap-3"><div className="flex-1 min-w-0"><div className="font-bold">{ses.familia?.tipo === 'empresa' ? '🏢' : '👨‍👩‍👧'} {ses.familia?.nome}</div><div className="text-sm text-slate-500 truncate">{ses.eu?.nome} · {ses.user?.email} · {ses.admin ? 'administrador' : 'membro'}</div></div><button className="btn-primary" onClick={() => ir('/familia')}>Perfil e membros</button><button className="btn-ghost" onClick={sair}>Sair da conta</button></div>}
      {modoNuvem && <Seguranca />}
      <div className="card"><h2 className="font-bold mb-3">Aparência</h2>
        <div className="grid grid-cols-3 gap-2">{([['claro', '☀️ Claro'], ['escuro', '🌙 Escuro'], ['sistema', '📱 Automático']] as [Tema, string][]).map(([t, n]) => <button key={t} className={`btn ${tema === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} onClick={() => { aplicarTema(t); setTema(t) }}>{n}</button>)}</div></div>
      <div className="card"><div className="flex justify-between items-center mb-3"><h2 className="font-bold">Categorias</h2>{adm && <button className="btn-ghost text-sm py-1.5" onClick={() => setCat({ tipo: 'despesa', cor: CORES[0], icone: '📦' })}><Plus size={16} />Nova</button>}</div>
        {!adm && <p className="text-sm text-slate-500 mb-3">Só administradores do perfil alteram categorias e contas.</p>}
        {(['despesa', 'receita'] as const).map((t) => <div key={t} className="mb-3"><div className="text-xs uppercase font-semibold text-slate-500 mb-2">{t === 'despesa' ? 'Despesas' : 'Receitas'}</div>
          <div className="flex flex-wrap gap-2">{cats.filter((c) => c.tipo === t).map((c) => <button key={c.id} onClick={() => adm && setCat(c)} className="flex items-center gap-2 rounded-full pl-1 pr-3 py-1 text-sm border border-slate-200 dark:border-slate-700"><span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: c.cor + '33' }}>{c.icone}</span>{c.nome}</button>)}</div></div>)}
      </div>
      <div className="card"><div className="flex justify-between items-center mb-3"><h2 className="font-bold">Contas e formas de pagamento</h2>{adm && <button className="btn-ghost text-sm py-1.5" onClick={() => setConta({ tipo: 'conta', icone: '🏦' })}><Plus size={16} />Nova</button>}</div>
        <div className="flex flex-wrap gap-2">{contas.map((c) => <button key={c.id} onClick={() => adm && setConta(c)} className="rounded-full px-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700">{rotuloContaComIcone(c, membros)}</button>)}</div></div>
      <div className="card"><h2 className="font-bold mb-1">Backup dos dados</h2>
        <p className="text-sm text-slate-500 mb-3">{modoNuvem ? <>Os {n} lançamentos deste perfil ficam salvos na nuvem e neste aparelho. Você pode baixar uma cópia em arquivo quando quiser; restaurar um backup <b>adiciona</b> os dados dele à família.</> : <>Seus {n} lançamentos ficam salvos <b>só neste aparelho</b>. Faça backup com frequência e use o arquivo para passar os dados para outro celular ou computador.</>}</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={async () => baixar(await exportarBackup(), `financas-backup-${hojeISO()}.json`)}><Download size={18} />Baixar backup</button>
          <label className="btn-ghost cursor-pointer"><Upload size={18} />Restaurar backup<input type="file" accept=".json,application/json" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; if (!confirm(modoNuvem ? 'Os dados do backup serão ADICIONADOS à família. Continuar?' : 'Restaurar vai SUBSTITUIR todos os dados atuais por esse backup. Continuar?')) return; try { await importarBackup(await f.text(), !modoNuvem); alert('Backup restaurado!') } catch (err: any) { alert('Erro: ' + err.message) } }} /></label>
        </div></div>
      {cat && <Modal titulo={cat.id ? 'Editar categoria' : 'Nova categoria'} onFechar={() => setCat(null)}>
        <label className="label">Nome</label><input className="input mb-3" value={cat.nome ?? ''} onChange={(e) => setCat({ ...cat, nome: e.target.value })} />
        <div className="grid grid-cols-2 gap-3 mb-3"><div><label className="label">Ícone (emoji)</label><input className="input text-2xl text-center" maxLength={4} value={cat.icone} onChange={(e) => setCat({ ...cat, icone: e.target.value })} /></div>
          <div><label className="label">Tipo</label><select className="input" value={cat.tipo} disabled={!!cat.id} onChange={(e) => setCat({ ...cat, tipo: e.target.value as any })}><option value="despesa">Despesa</option><option value="receita">Receita</option></select></div></div>
        <label className="label">Cor</label><div className="flex flex-wrap gap-2 mb-5">{CORES.map((c) => <button key={c} aria-label={c} onClick={() => setCat({ ...cat, cor: c })} className={`w-9 h-9 rounded-full ${cat.cor === c ? 'ring-4 ring-offset-2 ring-slate-400' : ''}`} style={{ background: c }} />)}</div>
        <div className="flex gap-2">{cat.id && <button className="btn-danger" onClick={excluirCat}><Trash2 size={18} /></button>}<button className="btn-primary flex-1" onClick={salvarCat}>Salvar</button></div>
      </Modal>}
      {conta && <Modal titulo={conta.id ? 'Editar conta' : 'Nova conta'} onFechar={() => setConta(null)}>
        <label className="label">Nome</label><input className="input mb-3" value={conta.nome ?? ''} onChange={(e) => setConta({ ...conta, nome: e.target.value })} placeholder="Ex.: Nubank, Itaú, Carteira" />
        <div className="grid grid-cols-2 gap-3 mb-3"><div><label className="label">Ícone</label><input className="input text-2xl text-center" value={conta.icone} onChange={(e) => setConta({ ...conta, icone: e.target.value })} /></div>
          <div><label className="label">Tipo</label><select className="input" value={conta.tipo} onChange={(e) => {
            const tipo = e.target.value as Conta['tipo']
            const padrao = tipo === TIPO_VR ? '🎫' : tipo === 'pix' ? '💠' : tipo === 'cartao' ? '💳' : tipo === 'dinheiro' ? '💵' : '🏦'
            const icone = !conta.icone || ['🏦', '💳', '💵', '💠', '🎫'].includes(conta.icone) ? padrao : conta.icone
            const nome = tipo === TIPO_VR && !(conta.nome ?? '').trim() ? 'VR - Ticket' : conta.nome
            setConta({ ...conta, tipo, icone, nome, titularId: tipo === TIPO_VR ? conta.titularId : undefined })
          }}><option value="conta">Conta bancária</option><option value="cartao">Cartão de crédito</option><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="vr_ticket">VR - Ticket</option></select></div></div>
        {conta.tipo === TIPO_VR && listaMembros.length > 0 && (
          <div className="mb-5">
            <label className="label">Titular do ticket</label>
            <select className="input mb-2" value={conta.titularId ?? ''} onChange={(e) => setConta({ ...conta, titularId: e.target.value || undefined })}>
              <option value="">Selecione o integrante</option>
              {listaMembros.map((m) => <option key={m.userId} value={m.userId}>{m.nome}</option>)}
            </select>
            <p className="text-xs text-slate-500">O titular só identifica de quem é o saldo. Qualquer integrante do perfil pode lançar receita ou despesa neste ticket.</p>
          </div>
        )}
        {conta.tipo === TIPO_VR && listaMembros.length === 0 && <p className="text-xs text-slate-500 mb-5">No modo família, escolha de quem é este ticket. Qualquer integrante poderá usá-lo.</p>}
        <div className="flex gap-2">{conta.id && <button className="btn-danger" onClick={excluirConta}><Trash2 size={18} /></button>}<button className="btn-primary flex-1" onClick={salvarConta}>Salvar</button></div>
      </Modal>}
    </div>
  )
}

function Seguranca() {
  const ses = useSessao()
  useVersaoBio()
  const [suporta, setSuporta] = useState<boolean | null>(null), [erro, setErro] = useState('')
  useEffect(() => { suportaBiometria().then(setSuporta) }, [])
  const uid = ses.user?.id ?? '', ativa = bioAtiva(uid)
  async function alternar() {
    setErro('')
    try { if (ativa) desativarBio(uid); else await ativarBio(uid, ses.user?.email ?? '') }
    catch (e: any) { setErro(e?.name === 'NotAllowedError' ? 'Cadastro cancelado.' : 'Não foi possível ativar a biometria neste aparelho.') }
  }
  return (
    <div className="card"><h2 className="font-bold mb-2">Segurança</h2>
      {suporta
        ? <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" className="w-5 h-5 accent-brand-600" checked={ativa} onChange={alternar} data-testid="biometria" />
          <span className="flex-1"><span className="font-semibold">Entrar com biometria</span><span className="block text-sm text-slate-500">Digital ou rosto deste aparelho para abrir o app.</span></span></label>
        : suporta === false && <p className="text-sm text-slate-500">Este aparelho/navegador não oferece biometria para o app.</p>}
      {erro && <p className="text-sm text-red-600 mt-2">{erro}</p>}
      <p className="text-xs text-slate-500 mt-2">{ativa ? 'Ao abrir o app (ou voltar depois de 2 min fora), ele pede sua digital/rosto.' : 'Sem biometria, o app pede login (e-mail e senha) toda vez que é aberto ou após 2 min fora.'}</p>
    </div>
  )
}
