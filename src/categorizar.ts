import { db, salvar, type Categoria } from './db'

// Regras iniciais por palavra-chave -> nome da categoria
const BASE: Record<string, string[]> = {
  Mercado: ['mercado', 'supermercado', 'atacad', 'assai', 'carrefour', 'extra', 'pao de acucar', 'hortifruti', 'sacolao', 'dia ', 'atacadao', 'mercearia', 'acougue', 'padaria'],
  Alimentação: ['restaurante', 'lanchonete', 'ifood', 'pizza', 'burger', 'mc donald', 'mcdonald', 'bk ', 'subway', 'cafe', 'bar ', 'churrascaria', 'sorvete', 'rappi', 'lanche'],
  Transporte: ['uber', '99', 'posto', 'combustivel', 'gasolina', 'etanol', 'shell', 'ipiranga', 'petrobras', 'estacionamento', 'pedagio', 'onibus', 'metro', 'sem parar'],
  Moradia: ['aluguel', 'condominio', 'iptu', 'material de construcao', 'leroy', 'telhanorte'],
  Contas: ['energia', 'luz', 'enel', 'cpfl', 'sabesp', 'agua', 'internet', 'vivo', 'claro', 'tim', 'oi ', 'net ', 'gas', 'telefone', 'netflix', 'spotify', 'assinatura'],
  Saúde: ['farmacia', 'drogaria', 'droga', 'raia', 'pacheco', 'drogasil', 'pague menos', 'hospital', 'clinica', 'laboratorio', 'medico', 'dentista', 'unimed', 'plano de saude'],
  Educação: ['escola', 'faculdade', 'curso', 'livraria', 'papelaria', 'udemy', 'mensalidade'],
  Lazer: ['cinema', 'show', 'ingresso', 'viagem', 'hotel', 'teatro', 'parque', 'steam', 'playstation'],
  Compras: ['magazine', 'americanas', 'amazon', 'mercado livre', 'shopee', 'renner', 'riachuelo', 'c&a', 'loja', 'casas bahia', 'shein'],
  Salário: ['salario', 'pagamento', 'folha', 'pro labore', 'proventos'],
}
// CNAE (2 primeiros dígitos ou 4) -> categoria
const CNAE: [RegExp, string][] = [
  [/^4711|^4712|^4721|^4722|^4723|^4724|^4729/, 'Mercado'], [/^56/, 'Alimentação'], [/^4731|^4732|^49|^52/, 'Transporte'],
  [/^4771|^4772|^86|^87|^75/, 'Saúde'], [/^85/, 'Educação'], [/^35|^36|^61/, 'Contas'], [/^4744|^41|^43/, 'Moradia'],
  [/^55|^59|^90|^91|^93|^79/, 'Lazer'], [/^47/, 'Compras'],
]

export const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const palavras = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w))

export async function sugerirCategoria(texto: string, tipo: 'receita' | 'despesa', cnae?: string): Promise<string | undefined> {
  const cats = (await db.categorias.toArray()).filter((c) => c.tipo === tipo)
  const porNome = (n: string) => cats.find((c) => normalizar(c.nome) === normalizar(n))?.id
  // 1) regras aprendidas com o usuário
  const pts = new Map<string, number>()
  for (const w of palavras(texto)) { const r = await db.regras.get(w); if (r && cats.some((c) => c.id === r.categoriaId)) pts.set(r.categoriaId, (pts.get(r.categoriaId) ?? 0) + r.peso) }
  if (pts.size) return [...pts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  // 2) regras básicas por palavra-chave
  const t = ' ' + normalizar(texto) + ' '
  for (const [cat, kws] of Object.entries(BASE)) if (kws.some((k) => t.includes(k.length <= 3 ? ` ${k} ` : k))) { const id = porNome(cat); if (id) return id }
  // 3) CNAE do CNPJ
  if (cnae) { const c = cnae.replace(/\D/g, ''); for (const [re, cat] of CNAE) if (re.test(c)) { const id = porNome(cat); if (id) return id } }
  return undefined
}

/** Aprende com a escolha do usuário: palavras da descrição passam a apontar para a categoria escolhida. */
export async function aprender(texto: string, categoriaId: string) {
  for (const w of palavras(texto).slice(0, 6)) {
    const r = await db.regras.get(w)
    if (!r || r.categoriaId !== categoriaId) await salvar('regras', { palavra: w, categoriaId, peso: 1 })
    else await salvar('regras', { ...r, peso: Math.min(r.peso + 1, 10) })
  }
}
export type { Categoria }
