-- =====================================================================
-- Perfis financeiros: a mesma pessoa pode participar de vários perfis
-- (ex.: um perfil "pessoal" para a casa e um perfil "empresa").
-- No banco a tabela continua "familias" (cada linha = um perfil).
-- =====================================================================

-- ---------- Colunas novas ----------
alter table public.familias add column if not exists tipo text not null default 'pessoal';
alter table public.familias add column if not exists cnpj text;
alter table public.familias add column if not exists razao_social text;
do $$ begin
  alter table public.familias add constraint familias_tipo_chk check (tipo in ('pessoal','empresa'));
exception when duplicate_object then null; end $$;
grant update (nome, cnpj, razao_social) on public.familias to authenticated;

-- uma pessoa pode estar em vários perfis (a chave continua (familia_id, user_id))
alter table public.membros drop constraint if exists membros_user_id_key;
create index if not exists membros_user on public.membros (user_id);

-- ---------- Funções auxiliares por perfil ----------
create or replace function public.sou_membro(p_familia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where familia_id = p_familia and user_id = auth.uid()) $$;

create or replace function public.sou_admin(p_familia uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where familia_id = p_familia and user_id = auth.uid() and papel = 'administrador') $$;

-- pasta do Storage (texto): evita erro de conversão quando o nome não é um uuid
create or replace function public.sou_membro_pasta(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where familia_id::text = p_pasta and user_id = auth.uid()) $$;
create or replace function public.sou_admin_pasta(p_pasta text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.membros where familia_id::text = p_pasta and user_id = auth.uid() and papel = 'administrador') $$;

-- compatibilidade com versões antigas do app (aparelhos com cache): primeiro perfil da pessoa
create or replace function public.minha_familia() returns uuid
language sql stable security definer set search_path = public as $$
  select m.familia_id from public.membros m join public.familias f on f.id = m.familia_id
  where m.user_id = auth.uid() order by f.criado_em limit 1 $$;
create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_admin(public.minha_familia()) $$;

-- ---------- Row Level Security por perfil ----------
do $$ declare p record; begin
  for p in select policyname, tablename from pg_policies where schemaname = 'public'
    and tablename in ('familias','membros','contas','categorias','orcamentos','regras_categoria','lancamentos') loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy familia_ver on public.familias for select to authenticated using (public.sou_membro(id));
create policy familia_editar on public.familias for update to authenticated using (public.sou_admin(id)) with check (public.sou_admin(id));
create policy membros_ver on public.membros for select to authenticated using (public.sou_membro(familia_id));

create policy contas_ver on public.contas for select to authenticated using (public.sou_membro(familia_id));
create policy contas_admin on public.contas for all to authenticated using (public.sou_admin(familia_id)) with check (public.sou_admin(familia_id));
create policy categorias_ver on public.categorias for select to authenticated using (public.sou_membro(familia_id));
create policy categorias_admin on public.categorias for all to authenticated using (public.sou_admin(familia_id)) with check (public.sou_admin(familia_id));
create policy orcamentos_ver on public.orcamentos for select to authenticated using (public.sou_membro(familia_id));
create policy orcamentos_admin on public.orcamentos for all to authenticated using (public.sou_admin(familia_id)) with check (public.sou_admin(familia_id));
create policy regras_familia on public.regras_categoria for all to authenticated using (public.sou_membro(familia_id)) with check (public.sou_membro(familia_id));

create policy lanc_ver on public.lancamentos for select to authenticated using (public.sou_membro(familia_id));
create policy lanc_criar on public.lancamentos for insert to authenticated with check (public.sou_membro(familia_id) and user_id = auth.uid());
create policy lanc_editar on public.lancamentos for update to authenticated using (public.sou_membro(familia_id) and (user_id = auth.uid() or public.sou_admin(familia_id))) with check (public.sou_membro(familia_id));
create policy lanc_excluir on public.lancamentos for delete to authenticated using (public.sou_membro(familia_id) and (user_id = auth.uid() or public.sou_admin(familia_id)));

-- categoria/conta de um lançamento precisa ser do mesmo perfil (evita misturar perfis)
create or replace function public.checar_perfil_lancamento() returns trigger language plpgsql set search_path = public as $$
begin
  if new.categoria_id is not null and not exists (select 1 from categorias where id = new.categoria_id and familia_id = new.familia_id)
    then raise exception 'Categoria de outro perfil'; end if;
  if new.conta_id is not null and not exists (select 1 from contas where id = new.conta_id and familia_id = new.familia_id)
    then raise exception 'Conta de outro perfil'; end if;
  return new;
end $$;
drop trigger if exists checar_perfil on public.lancamentos;
create trigger checar_perfil before insert or update of categoria_id, conta_id on public.lancamentos for each row execute function public.checar_perfil_lancamento();

-- ---------- Storage: pasta = id do perfil ----------
drop policy if exists notas_ver on storage.objects;
drop policy if exists notas_enviar on storage.objects;
drop policy if exists notas_atualizar on storage.objects;
drop policy if exists notas_excluir on storage.objects;
create policy notas_ver on storage.objects for select to authenticated using (bucket_id = 'notas' and public.sou_membro_pasta((storage.foldername(name))[1]));
create policy notas_enviar on storage.objects for insert to authenticated with check (bucket_id = 'notas' and public.sou_membro_pasta((storage.foldername(name))[1]));
create policy notas_atualizar on storage.objects for update to authenticated using (bucket_id = 'notas' and public.sou_membro_pasta((storage.foldername(name))[1]) and (owner = auth.uid() or public.sou_admin_pasta((storage.foldername(name))[1])));
create policy notas_excluir on storage.objects for delete to authenticated using (bucket_id = 'notas' and public.sou_membro_pasta((storage.foldername(name))[1]) and (owner = auth.uid() or public.sou_admin_pasta((storage.foldername(name))[1])));

-- ---------- Padrões por tipo de perfil ----------
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
    insert into contas (familia_id, nome, tipo, icone) values (f,'Conta PJ','conta','🏦'),(f,'Cartão PJ','cartao','💳'),(f,'Caixa','dinheiro','💵');
  else
    insert into categorias (familia_id, nome, icone, cor, tipo) values
      (f,'Mercado','🛒','#16a34a','despesa'),(f,'Alimentação','🍔','#f97316','despesa'),(f,'Transporte','🚗','#0ea5e9','despesa'),
      (f,'Moradia','🏠','#8b5cf6','despesa'),(f,'Contas','💡','#eab308','despesa'),(f,'Saúde','💊','#ef4444','despesa'),
      (f,'Educação','📚','#6366f1','despesa'),(f,'Lazer','🎉','#ec4899','despesa'),(f,'Compras','🛍️','#14b8a6','despesa'),
      (f,'Outros','📦','#64748b','despesa'),(f,'Salário','💰','#059669','receita'),(f,'Extra','✨','#22c55e','receita'),(f,'Outras receitas','📥','#84cc16','receita');
    insert into contas (familia_id, nome, tipo, icone) values (f,'Conta corrente','conta','🏦'),(f,'Cartão de crédito','cartao','💳'),(f,'Dinheiro','dinheiro','💵');
  end if;
end $$;
revoke execute on function public.semear_perfil(uuid, text) from public, anon, authenticated;

-- ---------- RPCs (agora recebem o perfil; sem ele, usam o primeiro = compatibilidade) ----------
drop function if exists public.criar_familia(text, text);
create or replace function public.criar_familia(p_nome text, p_meu_nome text, p_tipo text default 'pessoal', p_cnpj text default null, p_razao_social text default null) returns public.familias
language plpgsql security definer set search_path = public as $$
declare f public.familias; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  if coalesce(p_tipo, 'pessoal') not in ('pessoal','empresa') then raise exception 'Tipo de perfil inválido'; end if;
  insert into familias (nome, criado_por, tipo, cnpj, razao_social) values (trim(p_nome), uid, coalesce(p_tipo, 'pessoal'), nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''), nullif(trim(coalesce(p_razao_social, '')), ''))
    returning * into f;
  insert into membros (familia_id, user_id, nome, email, papel) values (f.id, uid, coalesce(nullif(trim(p_meu_nome), ''), split_part(auth.jwt()->>'email', '@', 1)), auth.jwt()->>'email', 'administrador');
  perform semear_perfil(f.id, f.tipo);
  return f;
end $$;

create or replace function public.entrar_familia(p_codigo text, p_meu_nome text) returns public.familias
language plpgsql security definer set search_path = public as $$
declare f public.familias; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Faça login primeiro'; end if;
  select * into f from familias where codigo_convite = upper(trim(p_codigo));
  if not found then raise exception 'Código de convite inválido'; end if;
  if exists (select 1 from membros where user_id = uid and familia_id = f.id) then raise exception 'Você já participa deste perfil'; end if;
  insert into membros (familia_id, user_id, nome, email, papel) values (f.id, uid, coalesce(nullif(trim(p_meu_nome), ''), split_part(auth.jwt()->>'email', '@', 1)), auth.jwt()->>'email', 'membro');
  return f;
end $$;

drop function if exists public.novo_codigo_convite();
create or replace function public.novo_codigo_convite(p_familia uuid default null) returns text
language plpgsql security definer set search_path = public as $$
declare c text := upper(substr(md5(random()::text), 1, 8)); f uuid := coalesce(p_familia, minha_familia());
begin
  if not sou_admin(f) then raise exception 'Apenas administradores'; end if;
  update familias set codigo_convite = c where id = f; return c;
end $$;

drop function if exists public.definir_papel(uuid, text);
create or replace function public.definir_papel(p_user uuid, p_papel text, p_familia uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := coalesce(p_familia, minha_familia());
begin
  if not sou_admin(f) then raise exception 'Apenas administradores'; end if;
  if p_papel not in ('administrador','membro') then raise exception 'Papel inválido'; end if;
  if p_papel = 'membro' and (select count(*) from membros where familia_id = f and papel = 'administrador' and user_id <> p_user) = 0
    then raise exception 'O perfil precisa de pelo menos um administrador'; end if;
  update membros set papel = p_papel where user_id = p_user and familia_id = f;
  if not found then raise exception 'Membro não encontrado'; end if;
end $$;

drop function if exists public.remover_membro(uuid);
create or replace function public.remover_membro(p_user uuid, p_familia uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := coalesce(p_familia, minha_familia());
begin
  if not sou_admin(f) then raise exception 'Apenas administradores'; end if;
  if p_user = auth.uid() then raise exception 'Use "Sair do perfil" para remover a si mesmo'; end if;
  delete from membros where user_id = p_user and familia_id = f;
  if not found then raise exception 'Membro não encontrado'; end if;
end $$;

drop function if exists public.sair_da_familia();
create or replace function public.sair_da_familia(p_familia uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := coalesce(p_familia, minha_familia());
begin
  if f is null or not sou_membro(f) then return; end if;
  if sou_admin(f) and (select count(*) from membros where familia_id = f and papel = 'administrador') = 1
     and (select count(*) from membros where familia_id = f) > 1
    then raise exception 'Promova outro administrador antes de sair'; end if;
  delete from membros where user_id = auth.uid() and familia_id = f;
  if not exists (select 1 from membros where familia_id = f) then delete from familias where id = f; end if;
end $$;

drop function if exists public.renomear_membro(uuid, text);
create or replace function public.renomear_membro(p_user uuid, p_nome text, p_familia uuid default null) returns void
language plpgsql security definer set search_path = public as $$
declare f uuid := coalesce(p_familia, minha_familia());
begin
  if p_user <> auth.uid() and not sou_admin(f) then raise exception 'Sem permissão'; end if;
  update membros set nome = trim(p_nome) where user_id = p_user and familia_id = f;
end $$;

revoke execute on function public.criar_familia(text, text, text, text, text), public.entrar_familia(text, text), public.novo_codigo_convite(uuid),
  public.definir_papel(uuid, text, uuid), public.remover_membro(uuid, uuid), public.sair_da_familia(uuid), public.renomear_membro(uuid, text, uuid),
  public.minha_familia(), public.sou_admin(), public.sou_admin(uuid), public.sou_membro(uuid), public.sou_membro_pasta(text), public.sou_admin_pasta(text) from public, anon;
grant execute on function public.criar_familia(text, text, text, text, text), public.entrar_familia(text, text), public.novo_codigo_convite(uuid),
  public.definir_papel(uuid, text, uuid), public.remover_membro(uuid, uuid), public.sair_da_familia(uuid), public.renomear_membro(uuid, text, uuid),
  public.minha_familia(), public.sou_admin(), public.sou_admin(uuid), public.sou_membro(uuid), public.sou_membro_pasta(text), public.sou_admin_pasta(text) to authenticated;

