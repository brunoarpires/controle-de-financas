-- =====================================================================
-- Minhas Finanças: banco de dados da família (Supabase / Postgres)
-- Cole TODO este arquivo no "SQL Editor" do Supabase e clique em "Run".
-- Pode ser executado mais de uma vez sem problemas.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- Tabelas ----------
create table if not exists public.familias (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(trim(nome)) between 1 and 80),
  codigo_convite text not null unique default upper(substr(md5(random()::text), 1, 8)),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.membros (
  familia_id uuid not null references public.familias(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade, -- cada pessoa participa de 1 família
  nome text not null,
  email text,
  papel text not null default 'membro' check (papel in ('administrador', 'membro')),
  criado_em timestamptz not null default now(),
  primary key (familia_id, user_id)
);

create table if not exists public.contas (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  nome text not null, tipo text not null default 'conta' check (tipo in ('conta', 'cartao', 'dinheiro')), icone text not null default '🏦',
  excluido boolean not null default false, atualizado_em timestamptz not null default now()
);

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  nome text not null, icone text not null default '📦', cor text not null default '#64748b',
  tipo text not null check (tipo in ('receita', 'despesa')),
  excluido boolean not null default false, atualizado_em timestamptz not null default now()
);

create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  familia_id uuid not null references public.familias(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('receita', 'despesa')),
  valor numeric(14, 2) not null check (valor >= 0),
  data date not null,
  descricao text not null default '',
  categoria_id uuid references public.categorias(id) on delete set null,
  conta_id uuid references public.contas(id) on delete set null,
  observacao text,
  foto_path text,
  nota jsonb,
  criado_em timestamptz not null default now(),
  excluido boolean not null default false, atualizado_em timestamptz not null default now()
);
create index if not exists lancamentos_familia_data on public.lancamentos (familia_id, data);
create index if not exists lancamentos_sync on public.lancamentos (familia_id, atualizado_em);

create table if not exists public.orcamentos (
  familia_id uuid not null references public.familias(id) on delete cascade,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  limite numeric(14, 2) not null default 0,
  excluido boolean not null default false, atualizado_em timestamptz not null default now(),
  primary key (familia_id, categoria_id)
);

create table if not exists public.regras_categoria (
  familia_id uuid not null references public.familias(id) on delete cascade,
  palavra text not null,
  categoria_id uuid not null references public.categorias(id) on delete cascade,
  peso int not null default 1,
  excluido boolean not null default false, atualizado_em timestamptz not null default now(),
  primary key (familia_id, palavra)
);

create table if not exists public.cnpj_cache (
  cnpj text primary key check (cnpj ~ '^\d{14}$'),
  dados jsonb not null,
  atualizado_em timestamptz not null default now()
);

-- atualizado_em sempre definido pelo servidor (usado na sincronização)
create or replace function public.tocar_atualizado_em() returns trigger language plpgsql as $$
begin new.atualizado_em := clock_timestamp(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['contas','categorias','lancamentos','orcamentos','regras_categoria','cnpj_cache'] loop
    execute format('drop trigger if exists tocar on public.%I', t);
    execute format('create trigger tocar before insert or update on public.%I for each row execute function public.tocar_atualizado_em()', t);
  end loop;
end $$;

-- ---------- Funções auxiliares (usadas nas regras de segurança) ----------
create or replace function public.minha_familia() returns uuid
language sql stable security definer set search_path = public as $$
  select familia_id from public.membros where user_id = auth.uid() $$;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where user_id = auth.uid() and papel = 'administrador') $$;

-- impede que um membro mude dono/família/autor de um lançamento
create or replace function public.proteger_lancamento() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    new.user_id := old.user_id; new.familia_id := old.familia_id; new.criado_em := old.criado_em;
  elsif auth.uid() is not null then
    new.user_id := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists proteger on public.lancamentos;
create trigger proteger before insert or update on public.lancamentos for each row execute function public.proteger_lancamento();

-- ---------- Row Level Security ----------
alter table public.familias enable row level security;
alter table public.membros enable row level security;
alter table public.contas enable row level security;
alter table public.categorias enable row level security;
alter table public.lancamentos enable row level security;
alter table public.orcamentos enable row level security;
alter table public.regras_categoria enable row level security;
alter table public.cnpj_cache enable row level security;

revoke all on all tables in schema public from anon;
revoke all on public.familias, public.membros from authenticated;
grant select on public.familias, public.membros to authenticated;
grant update (nome) on public.familias to authenticated;
grant select, insert, update, delete on public.contas, public.categorias, public.lancamentos, public.orcamentos, public.regras_categoria to authenticated;
grant select, insert, update on public.cnpj_cache to authenticated;

do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- família: vê só a sua; só administrador renomeia
create policy familia_ver on public.familias for select to authenticated using (id = public.minha_familia());
create policy familia_editar on public.familias for update to authenticated using (id = public.minha_familia() and public.sou_admin()) with check (id = public.minha_familia());
-- membros: vê os da própria família (alterações só pelas funções abaixo)
create policy membros_ver on public.membros for select to authenticated using (familia_id = public.minha_familia());

-- contas, categorias, orçamentos: todos veem; só administrador altera
create policy contas_ver on public.contas for select to authenticated using (familia_id = public.minha_familia());
create policy contas_admin on public.contas for all to authenticated using (familia_id = public.minha_familia() and public.sou_admin()) with check (familia_id = public.minha_familia() and public.sou_admin());
create policy categorias_ver on public.categorias for select to authenticated using (familia_id = public.minha_familia());
create policy categorias_admin on public.categorias for all to authenticated using (familia_id = public.minha_familia() and public.sou_admin()) with check (familia_id = public.minha_familia() and public.sou_admin());
create policy orcamentos_ver on public.orcamentos for select to authenticated using (familia_id = public.minha_familia());
create policy orcamentos_admin on public.orcamentos for all to authenticated using (familia_id = public.minha_familia() and public.sou_admin()) with check (familia_id = public.minha_familia() and public.sou_admin());
-- regras de categoria (aprendizado): qualquer membro da família
create policy regras_familia on public.regras_categoria for all to authenticated using (familia_id = public.minha_familia()) with check (familia_id = public.minha_familia());

-- lançamentos: todos da família veem; cada um cria os seus; edita/exclui os seus (administrador: todos)
create policy lanc_ver on public.lancamentos for select to authenticated using (familia_id = public.minha_familia());
create policy lanc_criar on public.lancamentos for insert to authenticated with check (familia_id = public.minha_familia() and user_id = auth.uid());
create policy lanc_editar on public.lancamentos for update to authenticated using (familia_id = public.minha_familia() and (user_id = auth.uid() or public.sou_admin())) with check (familia_id = public.minha_familia());
create policy lanc_excluir on public.lancamentos for delete to authenticated using (familia_id = public.minha_familia() and (user_id = auth.uid() or public.sou_admin()));

-- cache de CNPJ: dado público (BrasilAPI), compartilhado entre usuários logados
create policy cnpj_ver on public.cnpj_cache for select to authenticated using (true);
create policy cnpj_gravar on public.cnpj_cache for insert to authenticated with check (true);
create policy cnpj_atualizar on public.cnpj_cache for update to authenticated using (true) with check (true);

-- ---------- Funções (RPC) da família ----------
create or replace function public.criar_familia(p_nome text, p_meu_nome text) returns public.familias
language plpgsql security definer set search_path = public as $$
declare f public.familias; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from membros where user_id = uid) then raise exception 'Você já participa de uma família'; end if;
  insert into familias (nome, criado_por) values (trim(p_nome), uid) returning * into f;
  insert into membros (familia_id, user_id, nome, email, papel) values (f.id, uid, coalesce(nullif(trim(p_meu_nome), ''), split_part(auth.jwt()->>'email', '@', 1)), auth.jwt()->>'email', 'administrador');
  insert into categorias (familia_id, nome, icone, cor, tipo) values
    (f.id,'Mercado','🛒','#16a34a','despesa'),(f.id,'Alimentação','🍔','#f97316','despesa'),(f.id,'Transporte','🚗','#0ea5e9','despesa'),
    (f.id,'Moradia','🏠','#8b5cf6','despesa'),(f.id,'Contas','💡','#eab308','despesa'),(f.id,'Saúde','💊','#ef4444','despesa'),
    (f.id,'Educação','📚','#6366f1','despesa'),(f.id,'Lazer','🎉','#ec4899','despesa'),(f.id,'Compras','🛍️','#14b8a6','despesa'),
    (f.id,'Outros','📦','#64748b','despesa'),(f.id,'Salário','💰','#059669','receita'),(f.id,'Extra','✨','#22c55e','receita'),(f.id,'Outras receitas','📥','#84cc16','receita');
  insert into contas (familia_id, nome, tipo, icone) values (f.id,'Conta corrente','conta','🏦'),(f.id,'Cartão de crédito','cartao','💳'),(f.id,'Dinheiro','dinheiro','💵');
  return f;
end $$;

create or replace function public.entrar_familia(p_codigo text, p_meu_nome text) returns public.familias
language plpgsql security definer set search_path = public as $$
declare f public.familias; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  if exists (select 1 from membros where user_id = uid) then raise exception 'Você já participa de uma família'; end if;
  select * into f from familias where codigo_convite = upper(trim(p_codigo));
  if not found then raise exception 'Código de convite inválido'; end if;
  insert into membros (familia_id, user_id, nome, email, papel) values (f.id, uid, coalesce(nullif(trim(p_meu_nome), ''), split_part(auth.jwt()->>'email', '@', 1)), auth.jwt()->>'email', 'membro');
  return f;
end $$;

create or replace function public.novo_codigo_convite() returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 8));
begin
  if not sou_admin() then raise exception 'Apenas administradores'; end if;
  update familias set codigo_convite = c where id = minha_familia(); return c;
end $$;

create or replace function public.definir_papel(p_user uuid, p_papel text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then raise exception 'Apenas administradores'; end if;
  if p_papel not in ('administrador','membro') then raise exception 'Papel inválido'; end if;
  if p_papel = 'membro' and (select count(*) from membros where familia_id = minha_familia() and papel = 'administrador' and user_id <> p_user) = 0
    then raise exception 'A família precisa de pelo menos um administrador'; end if;
  update membros set papel = p_papel where user_id = p_user and familia_id = minha_familia();
  if not found then raise exception 'Membro não encontrado'; end if;
end $$;

create or replace function public.remover_membro(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not sou_admin() then raise exception 'Apenas administradores'; end if;
  if p_user = auth.uid() then raise exception 'Use "Sair da família" para remover a si mesmo'; end if;
  delete from membros where user_id = p_user and familia_id = minha_familia();
  if not found then raise exception 'Membro não encontrado'; end if;
end $$;

create or replace function public.sair_da_familia() returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := minha_familia();
begin
  if f is null then return; end if;
  if sou_admin() and (select count(*) from membros where familia_id = f and papel = 'administrador') = 1
     and (select count(*) from membros where familia_id = f) > 1
    then raise exception 'Promova outro administrador antes de sair'; end if;
  delete from membros where user_id = auth.uid();
  if not exists (select 1 from membros where familia_id = f) then delete from familias where id = f; end if;
end $$;

create or replace function public.renomear_membro(p_user uuid, p_nome text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_user <> auth.uid() and not sou_admin() then raise exception 'Sem permissão'; end if;
  update membros set nome = trim(p_nome) where user_id = p_user and familia_id = minha_familia();
end $$;

revoke execute on function public.criar_familia, public.entrar_familia, public.novo_codigo_convite, public.definir_papel,
  public.remover_membro, public.sair_da_familia, public.renomear_membro, public.minha_familia, public.sou_admin from public, anon;
grant execute on function public.criar_familia, public.entrar_familia, public.novo_codigo_convite, public.definir_papel,
  public.remover_membro, public.sair_da_familia, public.renomear_membro, public.minha_familia, public.sou_admin to authenticated;

-- ---------- Storage: fotos das notas (pasta = id da família) ----------
insert into storage.buckets (id, name, public) values ('notas', 'notas', false) on conflict (id) do nothing;
drop policy if exists notas_ver on storage.objects;
drop policy if exists notas_enviar on storage.objects;
drop policy if exists notas_atualizar on storage.objects;
drop policy if exists notas_excluir on storage.objects;
create policy notas_ver on storage.objects for select to authenticated using (bucket_id = 'notas' and (storage.foldername(name))[1] = public.minha_familia()::text);
create policy notas_enviar on storage.objects for insert to authenticated with check (bucket_id = 'notas' and (storage.foldername(name))[1] = public.minha_familia()::text);
create policy notas_atualizar on storage.objects for update to authenticated using (bucket_id = 'notas' and (storage.foldername(name))[1] = public.minha_familia()::text and (owner = auth.uid() or public.sou_admin()));
create policy notas_excluir on storage.objects for delete to authenticated using (bucket_id = 'notas' and (storage.foldername(name))[1] = public.minha_familia()::text and (owner = auth.uid() or public.sou_admin()));

-- ---------- Tempo real (atualiza os outros aparelhos na hora) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.lancamentos, public.categorias, public.contas, public.orcamentos, public.membros';
    exception when duplicate_object then null; end;
  end if;
end $$;

-- Linter do Supabase: search_path fixo nas funções de gatilho
alter function public.proteger_lancamento() set search_path = public;
alter function public.tocar_atualizado_em() set search_path = public;
