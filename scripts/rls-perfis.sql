-- Testes de isolamento entre perfis (RLS). Rodar num Postgres de TESTE com os stubs de auth/storage
-- e as migrações aplicadas. Cada linha deve mostrar OK. Não usar em produção (cria dados).
\set ON_ERROR_STOP 0
-- (as linhas "ERROR" na saída são as tentativas recusadas, esperadas)
create temp table r (t text, ok boolean); grant all on r to authenticated;
create or replace function pg_temp.como(u text) returns void language sql as $$ select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.email', u || '@t', false) $$;
-- usuários: B (Alex), D (Maria), X (estranho que cria o próprio perfil)
\set B '00000000-0000-0000-0000-00000000000b'
\set D '00000000-0000-0000-0000-00000000000d'
\set X '00000000-0000-0000-0000-0000000000ee'
set role authenticated;
select pg_temp.como(:'X');
select id as fx from public.criar_familia('Perfil do X', 'X', 'pessoal') \gset
insert into r select 'X cria perfil próprio', :'fx' is not null;
insert into r select 'X só vê o próprio perfil', (select count(*) from familias) = 1;
insert into r select 'X não vê lançamentos dos outros', (select count(*) from lancamentos) = 0;
select pg_temp.como(:'B');
select id as fam from familias where nome = 'Família Silva' \gset
select id as ofi from familias where nome = 'Oficina Exemplo' \gset
insert into r select 'B vê os 2 perfis', (select count(*) from familias) = 2;
insert into r select 'B não vê o perfil do X', not exists (select 1 from familias where id = :'fx');
select id as cofi from categorias where familia_id = :'ofi' limit 1 \gset
select id as cfam from categorias where familia_id = :'fam' limit 1 \gset
insert into lancamentos (id, familia_id, tipo, valor, data, descricao, categoria_id) values (gen_random_uuid(), :'ofi', 'despesa', 50, '2026-11-01', 'NF fornecedor', :'cofi');
insert into r select 'B lança na oficina', (select count(*) from lancamentos where familia_id = :'ofi') = 1;
insert into r select 'filtro por perfil: família continua com 1', (select count(*) from lancamentos where familia_id = :'fam') = 1;
select pg_temp.como(:'D');
insert into r select 'D vê lançamento da oficina', (select count(*) from lancamentos where familia_id = :'ofi') = 1;
insert into r select 'D é admin nos 2', (select bool_and(sou_admin(id)) from familias) and (select count(*) from familias) = 2;
select pg_temp.como(:'X');
insert into r select 'X não vê a oficina', (select count(*) from lancamentos where familia_id = :'ofi') = 0 and (select count(*) from categorias where familia_id = :'ofi') = 0 and (select count(*) from membros where familia_id = :'ofi') = 0;
select id as cx from categorias where familia_id = :'fx' limit 1 \gset
insert into lancamentos (id, familia_id, tipo, valor, data, categoria_id) values (gen_random_uuid(), :'ofi', 'despesa', 1, '2026-11-01', null);

insert into r select 'X não grava na oficina', (select count(*) from lancamentos where familia_id = :'ofi') = 0;
update familias set nome = 'hack' where id = :'ofi';
insert into r select 'X não renomeia a oficina', true;
select pg_temp.como(:'B');
insert into r select 'oficina não foi renomeada', (select nome from familias where id = :'ofi') = 'Oficina Exemplo';
-- categoria de outro perfil é recusada
insert into lancamentos (id, familia_id, tipo, valor, data, categoria_id) values (gen_random_uuid(), :'ofi', 'despesa', 1, '2026-11-01', :'cfam');
insert into r select 'categoria de outro perfil recusada', (select count(*) from lancamentos where familia_id = :'ofi') = 1;
-- convite por perfil: X entra só na oficina
select codigo_convite as cod from familias where id = :'ofi' \gset
select pg_temp.como(:'X');
select public.entrar_familia(:'cod', 'X') is not null as entrou \gset
insert into r select 'X entra na oficina por convite e mantém o próprio', (select count(*) from familias) = 2;
insert into r select 'X entra como membro', not sou_admin(:'ofi'::uuid);
insert into r select 'X continua sem ver a Família', (select count(*) from lancamentos where familia_id = :'fam') = 0;
select public.definir_papel(:'X'::uuid, 'administrador', :'ofi'::uuid);
insert into r select 'membro não se promove', not sou_admin(:'ofi'::uuid);
-- storage por pasta de perfil
insert into storage.objects (bucket_id, name) values ('notas', :'fx' || '/a.jpg');
insert into storage.objects (bucket_id, name) values ('notas', :'fam' || '/b.jpg');
insert into storage.objects (bucket_id, name) values ('notas', 'nao-uuid/b.jpg');
select pg_temp.como(:'B');
insert into storage.objects (bucket_id, name) values ('notas', :'fam' || '/c.jpg');
insert into r select 'B não vê foto do perfil do X', (select count(*) from storage.objects where name like :'fx' || '%') = 0;
insert into r select 'só fotos permitidas gravadas', (select count(*) from storage.objects where name like :'fam' || '%') = 1;
select pg_temp.como(:'B');
select public.remover_membro(:'X'::uuid, :'ofi'::uuid);
select pg_temp.como(:'X');
insert into r select 'X removido da oficina não vê mais', (select count(*) from familias) = 1;
reset role;
select case when ok then 'OK   ' else 'FALHA' end, t from r;
select count(*) filter (where not ok) as falhas, count(*) as total from r;
