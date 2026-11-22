-- Parcelas de um lançamento (receita ou despesa), em qualquer perfil.
alter table public.lancamentos
  add column if not exists parcela_grupo_id uuid,
  add column if not exists parcela_numero integer,
  add column if not exists parcela_total integer;

do $$ begin
  alter table public.lancamentos
    add constraint lancamentos_parcela_num_chk
    check (
      (parcela_grupo_id is null and parcela_numero is null and parcela_total is null)
      or (
        parcela_grupo_id is not null
        and parcela_numero is not null and parcela_total is not null
        and parcela_numero >= 1 and parcela_total >= 2
        and parcela_numero <= parcela_total
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists lancamentos_parcela_grupo
  on public.lancamentos (familia_id, parcela_grupo_id)
  where parcela_grupo_id is not null;
