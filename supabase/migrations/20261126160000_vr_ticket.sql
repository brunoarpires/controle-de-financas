-- VR - Ticket: tipo vr_ticket e titular_id (de quem é o saldo do ticket).
-- Qualquer integrante do perfil pode lançar receita ou despesa em qualquer
-- conta VR. O titular só identifica de quem é o saldo; o autor do lançamento
-- continua sendo quem registrou (user_id / proteger_lancamento).
-- Não cria contas VR automaticamente — o administrador cria em Ajustes.
-- As políticas atuais (contas_ver, lanc_criar) já permitem o uso por qualquer
-- membro; esta migration não adiciona restrição por titular.

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
      and c.conname <> 'contas_titular_somente_vr'
  loop
    execute format('alter table public.contas drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.contas add constraint contas_tipo_check
  check (tipo in ('conta', 'cartao', 'dinheiro', 'pix', 'vr_ticket'));

alter table public.contas add column if not exists titular_id uuid;

alter table public.contas drop constraint if exists contas_titular_somente_vr;
alter table public.contas add constraint contas_titular_somente_vr
  check (titular_id is null or tipo = 'vr_ticket');

alter table public.contas drop constraint if exists contas_titular_membro_fk;
alter table public.contas
  add constraint contas_titular_membro_fk
  foreign key (familia_id, titular_id)
  references public.membros (familia_id, user_id)
  on delete set null;

create index if not exists contas_titular_idx
  on public.contas (familia_id, titular_id)
  where titular_id is not null;

create or replace function public.semear_perfil(p_familia uuid, p_tipo text) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := p_familia;
begin
  if p_tipo = 'empresa' then
    insert into categorias (familia_id, nome, icone, cor, tipo) values
      (f,'Fornecedores','🚚','#0ea5e9','despesa'),(f,'Impostos','🧾','#ef4444','despesa'),(f,'Pró-labore e salários','👔','#8b5cf6','despesa'),
      (f,'Aluguel e condomínio','🏢','#f97316','despesa'),(f,'Software e serviços','💻','#6366f1','despesa'),(f,'Marketing','📣','#ec4899','despesa'),
      (f,'Tarifas bancárias','🏦','#eab308','despesa'),(f,'Transporte','🚗','#14b8a6','despesa'),(f,'Material e equipamentos','🖇️','#16a34a','despesa'),
      (f,'Outros','📦','#64748b','despesa'),(f,'Vendas e serviços','💼','#059669','receita'),(f,'VR - Ticket','🎫','#f59e0b','receita'),(f,'Outras receitas','📥','#84cc16','receita');
    insert into contas (familia_id, nome, tipo, icone) values
      (f,'Conta PJ','conta','🏦'),(f,'Cartão PJ','cartao','💳'),(f,'Caixa','dinheiro','💵'),(f,'Pix','pix','💠');
  else
    insert into categorias (familia_id, nome, icone, cor, tipo) values
      (f,'Mercado','🛒','#16a34a','despesa'),(f,'Alimentação','🍔','#f97316','despesa'),(f,'Transporte','🚗','#0ea5e9','despesa'),
      (f,'Moradia','🏠','#8b5cf6','despesa'),(f,'Contas','💡','#eab308','despesa'),(f,'Saúde','💊','#ef4444','despesa'),
      (f,'Educação','📚','#6366f1','despesa'),(f,'Lazer','🎉','#ec4899','despesa'),(f,'Compras','🛍️','#14b8a6','despesa'),
      (f,'Outros','📦','#64748b','despesa'),(f,'Salário','💰','#059669','receita'),(f,'Extra','✨','#22c55e','receita'),
      (f,'VR - Ticket','🎫','#f59e0b','receita'),(f,'Outras receitas','📥','#84cc16','receita');
    insert into contas (familia_id, nome, tipo, icone) values
      (f,'Conta corrente','conta','🏦'),(f,'Cartão de crédito','cartao','💳'),(f,'Dinheiro','dinheiro','💵'),(f,'Pix','pix','💠');
  end if;
end $$;
revoke execute on function public.semear_perfil(uuid, text) from public, anon, authenticated;

insert into public.categorias (familia_id, nome, icone, cor, tipo)
select f.id, 'VR - Ticket', '🎫', '#f59e0b', 'receita'
from public.familias f
where not exists (
  select 1 from public.categorias c
  where c.familia_id = f.id
    and c.tipo = 'receita'
    and lower(c.nome) = 'vr - ticket'
    and coalesce(c.excluido, false) = false
);
