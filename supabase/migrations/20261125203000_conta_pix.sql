-- Permite o tipo "pix" em contas (formas de pagamento) e inclui Pix nos perfis.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'contas' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table public.contas drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.contas add constraint contas_tipo_check check (tipo in ('conta', 'cartao', 'dinheiro', 'pix'));

create or replace function public.semear_perfil(p_familia uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := p_familia;
begin
  if p_tipo = 'empresa' then
    insert into categorias (familia_id, nome, icone, cor, tipo) values
      (f,'Fornecedores','🚚','#0ea5e9','despesa'),(f,'Impostos','🧾','#ef4444','despesa'),(f,'Pró-labore e salários','👔','#8b5cf6','despesa'),
      (f,'Aluguel e condomínio','🏢','#f97316','despesa'),(f,'Software e serviços','💻','#6366f1','despesa'),(f,'Marketing','📣','#ec4899','despesa'),
      (f,'Tarifas bancárias','🏦','#eab308','despesa'),(f,'Transporte','🚗','#14b8a6','despesa'),(f,'Material e equipamentos','🖇️','#16a34a','despesa'),
      (f,'Outros','📦','#64748b','despesa'),(f,'Vendas e serviços','💼','#059669','receita'),(f,'Outras receitas','📥','#84cc16','receita');
    insert into contas (familia_id, nome, tipo, icone) values
      (f,'Conta PJ','conta','🏦'),(f,'Cartão PJ','cartao','💳'),(f,'Caixa','dinheiro','💵'),(f,'Pix','pix','💠');
  else
    insert into categorias (familia_id, nome, icone, cor, tipo) values
      (f,'Mercado','🛒','#16a34a','despesa'),(f,'Alimentação','🍔','#f97316','despesa'),(f,'Transporte','🚗','#0ea5e9','despesa'),
      (f,'Moradia','🏠','#8b5cf6','despesa'),(f,'Contas','💡','#eab308','despesa'),(f,'Saúde','💊','#ef4444','despesa'),
      (f,'Educação','📚','#6366f1','despesa'),(f,'Lazer','🎉','#ec4899','despesa'),(f,'Compras','🛍️','#14b8a6','despesa'),
      (f,'Outros','📦','#64748b','despesa'),(f,'Salário','💰','#059669','receita'),(f,'Extra','✨','#22c55e','receita'),(f,'Outras receitas','📥','#84cc16','receita');
    insert into contas (familia_id, nome, tipo, icone) values
      (f,'Conta corrente','conta','🏦'),(f,'Cartão de crédito','cartao','💳'),(f,'Dinheiro','dinheiro','💵'),(f,'Pix','pix','💠');
  end if;
end $$;
revoke execute on function public.semear_perfil(uuid, text) from public, anon, authenticated;

insert into public.contas (familia_id, nome, tipo, icone)
select f.id, 'Pix', 'pix', '💠'
from public.familias f
where not exists (
  select 1 from public.contas c
  where c.familia_id = f.id and c.tipo = 'pix' and coalesce(c.excluido, false) = false
);
