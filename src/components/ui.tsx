import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { dataBR, parseDataBR } from '../utils'

/** Data em texto dd/mm/aaaa (evita picker nativo cortado no mobile). Valor armazenado: yyyy-mm-dd. */
export function CampoData({ value, onChange, disabled, id }: { value: string; onChange: (iso: string) => void; disabled?: boolean; id?: string }) {
  const [rascunho, setRascunho] = useState<string | null>(null)
  const texto = rascunho ?? dataBR(value)

  function formatarDigitos(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 8)
    if (d.length <= 2) return d
    if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`
    return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="dd/mm/aaaa"
      className="input tabular-nums"
      value={texto}
      disabled={disabled}
      aria-label="Data"
      onChange={(e) => {
        const fmt = formatarDigitos(e.target.value)
        setRascunho(fmt)
        if (fmt.replace(/\D/g, '').length === 8) {
          const iso = parseDataBR(fmt)
          if (iso) onChange(iso)
        }
      }}
      onBlur={() => {
        const iso = parseDataBR(texto)
        if (iso) onChange(iso)
        setRascunho(null)
      }}
    />
  )
}

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

/** Horário com selects de hora/minuto (evita picker nativo cortado no Chrome Android). Valor: HH:MM ou ''. */
export function CampoHora({ value, onChange, disabled, optional }: { value: string; onChange: (hhmm: string) => void; disabled?: boolean; optional?: boolean }) {
  const m = String(value ?? '').match(/^(\d{1,2}):(\d{2})/)
  const h = m ? m[1].padStart(2, '0') : ''
  const min = m ? m[2] : ''

  function aplicar(nh: string, nm: string) {
    if (!nh && !nm) { onChange(''); return }
    if (!nh || !nm) { onChange(''); return }
    onChange(`${nh}:${nm}`)
  }

  return (
    <div className="flex items-stretch gap-1.5 min-w-0">
      <select
        className="input flex-1"
        value={h}
        disabled={disabled}
        aria-label="Hora"
        onChange={(e) => {
          const nh = e.target.value
          if (!nh) aplicar('', '')
          else aplicar(nh, min || '00')
        }}
      >
        {optional && <option value="">—</option>}
        {HORAS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="self-center text-slate-400 font-bold select-none" aria-hidden>:</span>
      <select
        className="input flex-1"
        value={min}
        disabled={disabled}
        aria-label="Minuto"
        onChange={(e) => {
          const nm = e.target.value
          if (!nm) aplicar('', '')
          else aplicar(h || '00', nm)
        }}
      >
        {optional && <option value="">—</option>}
        {MINUTOS.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  )
}

export function Modal({ titulo, onFechar, children, footer }: { titulo: string; onFechar: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40" onClick={onFechar}>
      <div
        className="bg-white dark:bg-slate-900 w-full md:max-w-lg max-h-[min(92dvh,92vh)] rounded-t-3xl md:rounded-3xl shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h2 className="text-xl font-bold">{titulo}</h2>
          <button type="button" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" onClick={onFechar} aria-label="Fechar"><X /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-4 overscroll-contain">{children}</div>
        {footer && (
          <div className="shrink-0 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
export const Titulo = ({ children, extra }: { children: ReactNode; extra?: ReactNode }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5"><h1 className="text-2xl md:text-3xl font-bold min-w-0 break-words">{children}</h1>{extra}</div>
)
export function SeletorMes({ mes, setMes, rotulo }: { mes: string; setMes: (m: string) => void; rotulo: string }) {
  return (
    <div className="flex w-full sm:w-auto items-center justify-between gap-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
      <button className="px-3 py-2 text-lg" aria-label="Mês anterior" onClick={() => setMes(shift(mes, -1))}>‹</button>
      <span className="font-semibold text-sm flex-1 sm:flex-none sm:min-w-[8.5rem] text-center truncate">{rotulo}</span>
      <button className="px-3 py-2 text-lg" aria-label="Próximo mês" onClick={() => setMes(shift(mes, 1))}>›</button>
    </div>
  )
}
function shift(ym: string, d: number) { const [y, m] = ym.split('-').map(Number); const x = new Date(y, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` }

/** Filtro "Família toda" / por pessoa. Só aparece no modo família com 2+ membros. */
export function FiltroMembro({ valor, onChange, membros }: { valor: string; onChange: (v: string) => void; membros: { userId: string; nome: string }[] }) {
  if (membros.length < 2) return null
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="tablist" aria-label="Filtrar por pessoa">
      {[{ userId: '', nome: '👥 Todos' }, ...membros].map((m) => (
        <button key={m.userId} role="tab" aria-selected={valor === m.userId} onClick={() => onChange(m.userId)}
          className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold border transition ${valor === m.userId ? 'bg-brand-600 text-white border-brand-600' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'}`}>{m.nome}</button>
      ))}
    </div>
  )
}
