-- Testes das regras de segurança (RLS). Rodar num banco de TESTE:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_test.sql
-- Tudo roda dentro de uma transação desfeita no final (rollback).
begin;
create or replace function pg_temp.como(uid uuid, email text) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uid::text, true);
end $$;
create or replace function pg_temp.root() returns void language plpgsql as $$
begin perform set_config('role', 'postgres', true); perform set_config('request.jwt.claims', '', true); perform set_config('request.jwt.claim.sub', '', true); end $$;
create or replace function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond, false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok - %', msg; end $$;
create or replace function pg_temp.falha(q text, msg text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then raise notice 'ok - % (%)', msg, sqlerrm; return; end;
  raise exception 'FALHOU (deveria ser bloqueado): %', msg;
end $$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-00000000000a', 'alex@teste.com', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000b', 'maria@teste.com', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-00000000000c', 'estranho@teste.com', 'authenticated', 'authenticated');
grant execute on function pg_temp.como, pg_temp.root, pg_temp.ok, pg_temp.falha to authenticated;
create temp table ids (k text primary key, v text); grant all on ids to authenticated;

-- Alex cria a família
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'alex@teste.com');
insert into ids select 'fam', (public.criar_familia('Família Silva', 'Alex')).id;
select pg_temp.ok((select papel from membros where user_id = auth.uid()) = 'administrador', 'criador vira administrador');
select pg_temp.ok((select count(*) from categorias) = 13 and (select count(*) from contas) = 3, 'categorias e contas padrão criadas');
insert into ids select 'codigo', codigo_convite from familias;
insert into ids select 'cat', id from categorias where nome = 'Mercado';
insert into ids select 'conta', id from contas limit 1;
insert into lancamentos (familia_id, tipo, valor, data, descricao, categoria_id, conta_id)
  select (select v::uuid from ids where k='fam'), 'despesa', 100, '2026-10-01', 'Mercado do Alex', (select v::uuid from ids where k='cat'), (select v::uuid from ids where k='conta');
select pg_temp.falha('select public.criar_familia(''Outra'', ''x'')', 'não pode criar segunda família');

-- Esposa entra com o código
select pg_temp.como('00000000-0000-0000-0000-00000000000b', 'maria@teste.com');
select pg_temp.ok((select count(*) from lancamentos) = 0 and (select count(*) from familias) = 0, 'antes de entrar não vê nada');
select pg_temp.falha('select public.entrar_familia(''XXXXXXXX'', ''Ana'')', 'código inválido é rejeitado');
select public.entrar_familia((select v from ids where k='codigo'), 'Ana');
select pg_temp.ok((select papel from membros where user_id = auth.uid()) = 'membro', 'quem entra vira membro');
select pg_temp.ok((select count(*) from lancamentos) = 1, 'membro vê lançamentos da família');
select pg_temp.ok((select count(*) from membros) = 2, 'membro vê os membros');
-- membro cria o seu lançamento (tentando se passar pelo Alex: user_id é forçado)
insert into lancamentos (familia_id, user_id, tipo, valor, data, descricao)
  select (select v::uuid from ids where k='fam'), '00000000-0000-0000-0000-00000000000a', 'despesa', 50, '2026-10-02', 'Farmácia da Ana';
select pg_temp.ok((select user_id from lancamentos where descricao = 'Farmácia da Ana') = auth.uid(), 'autor do lançamento é sempre quem está logado');
update lancamentos set valor = 55 where descricao = 'Farmácia da Ana';
select pg_temp.ok((select valor from lancamentos where descricao = 'Farmácia da Ana') = 55, 'membro edita o próprio lançamento');
update lancamentos set valor = 1 where descricao = 'Mercado do Alex';
select pg_temp.ok((select valor from lancamentos where descricao = 'Mercado do Alex') = 100, 'membro NÃO edita lançamento de outro (update ignorado)');
delete from lancamentos where descricao = 'Mercado do Alex';
select pg_temp.ok((select count(*) from lancamentos where descricao = 'Mercado do Alex') = 1, 'membro NÃO exclui lançamento de outro');
update lancamentos set user_id = '00000000-0000-0000-0000-00000000000a' where descricao = 'Farmácia da Ana';
select pg_temp.ok((select user_id from lancamentos where descricao = 'Farmácia da Ana') = auth.uid(), 'membro não troca o autor');
select pg_temp.falha('insert into categorias (familia_id, nome, tipo) values ((select v::uuid from ids where k=''fam''), ''Hack'', ''despesa'')', 'membro não cria categoria');
update categorias set nome = 'Hack' where nome = 'Mercado';
select pg_temp.ok(not exists (select 1 from categorias where nome = 'Hack'), 'membro não renomeia categoria');
select pg_temp.falha('insert into orcamentos (familia_id, categoria_id, limite) values ((select v::uuid from ids where k=''fam''), (select v::uuid from ids where k=''cat''), 10)', 'membro não define orçamento');
select pg_temp.falha('insert into contas (familia_id, nome) values ((select v::uuid from ids where k=''fam''), ''X'')', 'membro não cria conta');
insert into regras_categoria (familia_id, palavra, categoria_id) select (select v::uuid from ids where k='fam'), 'drogaria', (select v::uuid from ids where k='cat');
select pg_temp.ok((select count(*) from regras_categoria) = 1, 'membro grava regra de categoria (aprendizado)');
select pg_temp.falha('select public.definir_papel(''00000000-0000-0000-0000-00000000000b'', ''administrador'')', 'membro não se promove');
select pg_temp.falha('select public.remover_membro(''00000000-0000-0000-0000-00000000000a'')', 'membro não remove ninguém');
select pg_temp.falha('select public.novo_codigo_convite()', 'membro não gera convite');
select pg_temp.falha('update membros set papel = ''administrador'' where user_id = auth.uid()', 'membro não altera tabela membros direto');
update familias set nome = 'Hack';
select pg_temp.ok((select nome from familias) = 'Família Silva', 'membro não renomeia a família');
-- foto da nota no Storage
insert into storage.objects (bucket_id, name, owner) select 'notas', (select v from ids where k='fam') || '/foto-ana.jpg', auth.uid();
select pg_temp.falha('insert into storage.objects (bucket_id, name, owner) values (''notas'', ''11111111-1111-1111-1111-111111111111/x.jpg'', auth.uid())', 'não envia foto para pasta de outra família');

-- Estranho (outra família) não vê nada
select pg_temp.como('00000000-0000-0000-0000-00000000000c', 'estranho@teste.com');
select public.criar_familia('Outra Família', 'Zé');
select pg_temp.ok((select count(*) from lancamentos) = 0, 'outra família não vê lançamentos');
select pg_temp.ok((select count(*) from membros) = 1 and (select count(*) from familias) = 1, 'outra família só vê a si mesma');
select pg_temp.ok((select count(*) from storage.objects) = 0, 'outra família não vê fotos');
select pg_temp.ok((select count(*) from regras_categoria) = 0, 'outra família não vê regras');
select pg_temp.falha('insert into lancamentos (familia_id, tipo, valor, data) values ((select v::uuid from ids where k=''fam''), ''despesa'', 1, ''2026-10-01'')', 'não insere lançamento em família alheia');
update lancamentos set valor = 0;
delete from lancamentos;
select pg_temp.falha('select public.entrar_familia((select v from ids where k=''codigo''), ''Zé'')', 'quem já tem família não entra em outra');

-- Anônimo (sem login)
select pg_temp.root(); set local role anon;
select pg_temp.falha('select * from lancamentos', 'anônimo não lê lançamentos');
select pg_temp.falha('select public.criar_familia(''x'',''y'')', 'anônimo não chama funções');

-- Administrador gerencia
select pg_temp.root();
select pg_temp.como('00000000-0000-0000-0000-00000000000a', 'alex@teste.com');
select pg_temp.ok((select count(*) from lancamentos) = 2, 'dados intactos após tentativas do estranho');
select pg_temp.ok((select count(*) from storage.objects) = 1, 'admin vê fotos da família');
update lancamentos set valor = 60 where descricao = 'Farmácia da Ana';
select pg_temp.ok((select valor from lancamentos where descricao = 'Farmácia da Ana') = 60, 'admin edita lançamento de membro');
insert into orcamentos (familia_id, categoria_id, limite) select (select v::uuid from ids where k='fam'), (select v::uuid from ids where k='cat'), 500;
select pg_temp.ok((select count(*) from orcamentos) = 1, 'admin define orçamento');
select pg_temp.falha('select public.definir_papel(''00000000-0000-0000-0000-00000000000a'', ''membro'')', 'último administrador não pode virar membro');
select public.definir_papel('00000000-0000-0000-0000-00000000000b', 'administrador');
select pg_temp.ok((select count(*) from membros where papel = 'administrador') = 2, 'admin promove membro');
select public.definir_papel('00000000-0000-0000-0000-00000000000b', 'membro');
select pg_temp.ok(public.novo_codigo_convite() <> (select v from ids where k='codigo'), 'admin gera novo código de convite');
select pg_temp.falha('select public.remover_membro(''00000000-0000-0000-0000-00000000000c'')', 'admin não remove quem é de outra família');
select public.remover_membro('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((select count(*) from membros) = 1, 'admin remove membro');
select pg_temp.como('00000000-0000-0000-0000-00000000000b', 'maria@teste.com');
select pg_temp.ok((select count(*) from lancamentos) = 0, 'membro removido perde acesso');
select pg_temp.root();
select 'TODOS OS TESTES DE RLS PASSARAM' as resultado;
rollback;
