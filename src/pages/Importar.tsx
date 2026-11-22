import { Camera, FileSpreadsheet } from 'lucide-react'
import { Titulo } from '../components/ui'
export default function Importar() {
  return (
    <div>
      <Titulo>Importar</Titulo>
      <div className="grid md:grid-cols-2 gap-4">
        <a href="#/importar/nota" className="card hover:border-brand-500 transition flex gap-4 items-start">
          <span className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-700/20 text-brand-600 flex items-center justify-center shrink-0"><Camera size={28} /></span>
          <div><h2 className="font-bold text-lg">Foto da nota fiscal</h2><p className="text-sm text-slate-500">Tire uma foto do cupom. O app lê o QR Code, o CNPJ, a data, o total e os itens e preenche tudo pra você conferir.</p></div>
        </a>
        <a href="#/importar/planilha" className="card hover:border-brand-500 transition flex gap-4 items-start">
          <span className="w-14 h-14 rounded-2xl bg-sky-50 dark:bg-sky-900/30 text-sky-600 flex items-center justify-center shrink-0"><FileSpreadsheet size={28} /></span>
          <div><h2 className="font-bold text-lg">Planilha ou extrato</h2><p className="text-sm text-slate-500">Arquivos CSV ou Excel (.xlsx) do banco ou da sua planilha. Você escolhe as colunas e confere antes de salvar.</p></div>
        </a>
      </div>
    </div>
  )
}
