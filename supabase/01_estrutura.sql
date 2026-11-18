-- =====================================================================
-- SOFT+ | Controle de Adesões às ARPs – CIMOP
-- 01_estrutura.sql  (reexecutável)
-- Rodar no SQL Editor do Supabase, em ordem.
-- =====================================================================

-- ---------- Usuários e perfis -----------------------------------------
-- perfis: administrador (tudo, inclusive usuários) | operador (lança e edita) | consulta (só vê)
create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  perfil text not null default 'operador' check (perfil in ('administrador','operador','consulta')),
  ativo boolean not null default true,
  troca_senha boolean not null default true,
  criado_em timestamptz not null default now()
);

create or replace function public.meu_perfil()
returns text language sql stable security definer set search_path = public as $$
  select perfil from public.usuarios where id = auth.uid() and ativo
$$;

create or replace function public.pode_editar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() in ('administrador','operador'), false)
$$;

create or replace function public.e_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.meu_perfil() = 'administrador', false)
$$;

-- ---------- Configurações (linha única) -------------------------------
create table if not exists public.configuracoes (
  id int primary key default 1 check (id = 1),
  orgao_nome text not null default 'Consórcio Intermunicipal Multifinalitário dos Municípios do Oeste Potiguar',
  sigla text not null default 'CIMOP',
  cidade_uf text not null default 'Portalegre/RN',
  presidente_nome text not null default 'MARCOS AURÉLIO DE PAIVA RÊGO',
  presidente_cargo text not null default 'Presidente do CIMOP',
  resolucao_srp text not null default 'Resolução CIMOP nº 018/2023',
  resolucao_alteracao text not null default 'Resolução CIMOP nº 001/2026',
  texto_anexos text not null default 'Conforme solicitado, encaminhamos, em anexo, o processo integral do {pregao}, bem como a Resolução CIMOP nº 018/2023 e a Resolução CIMOP nº 001/2026, que a altera.',
  atualizado_em timestamptz not null default now()
);
alter table public.configuracoes add column if not exists texto_anexos text not null default 'Conforme solicitado, encaminhamos, em anexo, o processo integral do {pregao}, bem como a Resolução CIMOP nº 018/2023 e a Resolução CIMOP nº 001/2026, que a altera.';
insert into public.configuracoes (id) values (1) on conflict do nothing;

-- ---------- Atas e itens ----------------------------------------------
create table if not exists public.atas (
  id uuid primary key default gen_random_uuid(),
  pregao text not null,
  numero text not null unique,               -- 001/2026
  processo text,
  objeto text,
  detentora text not null,
  cnpj_detentora text,
  data_assinatura date,
  vigencia_fim date,
  prorrogada boolean not null default false,
  clausulas_adesao text,
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.itens (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references public.atas(id) on delete no action,
  numero int not null,
  descricao text not null,
  unidade text,
  qtd_registrada numeric(18,4) not null check (qtd_registrada > 0),
  preco_unitario numeric(18,4),
  unique (ata_id, numero)
);

-- ---------- Órgãos (aderentes) – limite de 50% é por CNPJ --------------
create table if not exists public.orgaos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cnpj text unique,                           -- só números
  municipio text,
  uf text,
  esfera text not null default 'Municipal' check (esfera in ('Municipal','Estadual','Federal','Consórcio','Outro')),
  responsavel text,
  cargo text,
  email text,
  tratamento text default 'Ao Senhor',
  vocativo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- ---------- Pedidos de adesão -----------------------------------------
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_oficio text unique,                  -- nº do ofício do CIMOP, digitado pelo usuário (ex.: 105/2026)
  data_oficio date default current_date,
  orgao_id uuid not null references public.orgaos(id) on delete no action,
  oficio_solicitante text,
  data_solicitante date,
  finalidade text,
  anexos_texto text,
  situacao text not null default 'autorizado' check (situacao in ('autorizado','parcial','negado','cancelado')),
  motivo_cancelamento text,
  origem text not null default 'sistema' check (origem in ('sistema','migracao')),
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now()
);

create table if not exists public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  item_id uuid not null references public.itens(id) on delete no action,
  qtd_solicitada numeric(18,4) not null check (qtd_solicitada > 0),
  qtd_autorizada numeric(18,4) not null default 0,
  decisao text not null check (decisao in ('autorizado','negado')),
  motivo text,
  usado_orgao_antes numeric(18,4),
  usado_total_antes numeric(18,4)
);
create index if not exists pedido_itens_item on public.pedido_itens(item_id);
create index if not exists pedidos_orgao on public.pedidos(orgao_id);

-- ---------- Histórico (quem fez o quê) --------------------------------
create table if not exists public.historico (
  id bigserial primary key,
  tabela text not null,
  registro uuid,
  operacao text not null,
  dados jsonb,
  usuario uuid default auth.uid(),
  quando timestamptz not null default now()
);

create or replace function public.registrar_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.historico(tabela, registro, operacao, dados)
  values (tg_table_name, coalesce((case when tg_op='DELETE' then old.id else new.id end)::uuid, null), tg_op,
          case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array['atas','itens','orgaos','pedidos','configuracoes'] loop
    execute format('drop trigger if exists hist_%1$s on public.%1$s', t);
    if t <> 'configuracoes' then
      execute format('create trigger hist_%1$s after insert or update or delete on public.%1$s for each row execute function public.registrar_historico()', t);
    end if;
  end loop;
end $$;

-- Pedidos não são apagados: só cancelados (o saldo volta)
create or replace function public.bloquear_exclusao_pedido()
returns trigger language plpgsql as $$
begin
  raise exception 'Pedidos não podem ser excluídos. Use "Cancelar pedido" — o saldo volta para a ata.';
end $$;
drop trigger if exists nao_excluir_pedido on public.pedidos;
create trigger nao_excluir_pedido before delete on public.pedidos for each row execute function public.bloquear_exclusao_pedido();

-- ---------- Saldos ------------------------------------------------------
create or replace view public.v_saldo_itens with (security_invoker = true) as
select i.id as item_id, i.ata_id, i.numero, i.descricao, i.unidade, i.qtd_registrada, i.preco_unitario,
       coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado'), 0) as aderido,
       2 * i.qtd_registrada - coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado'), 0) as saldo_dobro
from public.itens i
left join public.pedido_itens pi on pi.item_id = i.id and pi.decisao = 'autorizado'
left join public.pedidos p on p.id = pi.pedido_id
group by i.id;

create or replace view public.v_aderido_orgao with (security_invoker = true) as
select pi.item_id, p.orgao_id, sum(pi.qtd_autorizada) as aderido
from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
where p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
group by pi.item_id, p.orgao_id;

-- ---------- Registro do pedido (decide no banco, com trava) ------------
-- p = {numero_oficio, data_oficio, orgao_id, oficio_solicitante, data_solicitante, finalidade, anexos_texto,
--      origem, itens:[{item_id, qtd}]}
create or replace function public.registrar_pedido(p jsonb)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid; v_org public.orgaos; v_data date := coalesce((p->>'data_oficio')::date, current_date);
  v_item public.itens; v_ata public.atas; l jsonb; q numeric; u_org numeric; u_tot numeric;
  v_dec text; v_mot text; n_aut int := 0; n_neg int := 0; v_forcar boolean := coalesce((p->>'origem')='migracao', false) and public.e_admin();
begin
  if not public.pode_editar() then raise exception 'Sem permissão para lançar pedidos.'; end if;
  select * into v_org from public.orgaos where id = (p->>'orgao_id')::uuid;
  if not found then raise exception 'Órgão não encontrado.'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then raise exception 'Informe ao menos um item.'; end if;

  insert into public.pedidos(numero_oficio, data_oficio, orgao_id, oficio_solicitante, data_solicitante,
                             finalidade, anexos_texto, origem, criado_por_nome)
  values (nullif(trim(p->>'numero_oficio'),''), case when v_forcar then (p->>'data_oficio')::date else v_data end, v_org.id, p->>'oficio_solicitante',
          (p->>'data_solicitante')::date, p->>'finalidade', p->>'anexos_texto',
          coalesce(p->>'origem','sistema'), (select nome from public.usuarios where id = auth.uid()))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p->'itens') loop
    q := (l->>'qtd')::numeric;
    select * into v_item from public.itens where id = (l->>'item_id')::uuid for update;   -- trava o item
    if not found then raise exception 'Item não encontrado.'; end if;
    select * into v_ata from public.atas where id = v_item.ata_id;

    select coalesce(sum(pi.qtd_autorizada),0) into u_org from public.pedido_itens pi join public.pedidos pp on pp.id = pi.pedido_id
     where pi.item_id = v_item.id and pp.orgao_id = v_org.id and pp.situacao <> 'cancelado' and pi.decisao = 'autorizado';
    select coalesce(sum(pi.qtd_autorizada),0) into u_tot from public.pedido_itens pi join public.pedidos pp on pp.id = pi.pedido_id
     where pi.item_id = v_item.id and pp.situacao <> 'cancelado' and pi.decisao = 'autorizado';

    v_dec := 'autorizado'; v_mot := null;
    if v_forcar then
      null; -- histórico migrado: grava como foi autorizado na época
    elsif v_org.esfera = 'Federal' then
      v_dec := 'negado'; v_mot := 'Vedada a adesão de órgão ou entidade federal a ata gerenciada por ente municipal ou consórcio de municípios (art. 86, § 8º, da Lei nº 14.133/2021).';
    elsif v_ata.vigencia_fim is not null and v_data > v_ata.vigencia_fim then
      v_dec := 'negado'; v_mot := 'Ata com vigência encerrada em ' || to_char(v_ata.vigencia_fim,'DD/MM/YYYY') || '.';
    elsif round(u_org + q, 4) > round(v_item.qtd_registrada * 0.5, 4) then
      v_dec := 'negado'; v_mot := 'Ultrapassa o limite de 50% por órgão (art. 86, § 4º, da Lei nº 14.133/2021).';
    elsif round(u_tot + q, 4) > round(v_item.qtd_registrada * 2, 4) then
      v_dec := 'negado'; v_mot := 'Ultrapassa o limite total do dobro do quantitativo registrado (art. 86, § 5º, da Lei nº 14.133/2021).';
    end if;

    insert into public.pedido_itens(pedido_id, item_id, qtd_solicitada, qtd_autorizada, decisao, motivo, usado_orgao_antes, usado_total_antes)
    values (v_id, v_item.id, q, case when v_dec='autorizado' then q else 0 end, v_dec, v_mot, u_org, u_tot);
    if v_dec = 'autorizado' then n_aut := n_aut + 1; else n_neg := n_neg + 1; end if;
  end loop;

  update public.pedidos set situacao = case when n_neg = 0 then 'autorizado' when n_aut = 0 then 'negado' else 'parcial' end
   where id = v_id;
  return v_id;
end $$;

create or replace function public.cancelar_pedido(p_id uuid, p_motivo text)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.pode_editar() then raise exception 'Sem permissão.'; end if;
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  update public.pedidos set situacao = 'cancelado', motivo_cancelamento = p_motivo where id = p_id;
end $$;

-- ---------- RLS ---------------------------------------------------------
alter table public.usuarios enable row level security;
alter table public.configuracoes enable row level security;
alter table public.atas enable row level security;
alter table public.itens enable row level security;
alter table public.orgaos enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_itens enable row level security;
alter table public.historico enable row level security;

do $$ declare t text; begin
  foreach t in array array['configuracoes','atas','itens','orgaos','pedidos','pedido_itens','historico','usuarios'] loop
    execute format('drop policy if exists ler on public.%I', t);
    execute format('create policy ler on public.%I for select to authenticated using (public.meu_perfil() is not null)', t);
  end loop;
  foreach t in array array['atas','itens','orgaos','pedidos','pedido_itens'] loop
    execute format('drop policy if exists inserir on public.%I', t);
    execute format('drop policy if exists alterar on public.%I', t);
    execute format('create policy inserir on public.%I for insert to authenticated with check (public.pode_editar())', t);
    execute format('create policy alterar on public.%I for update to authenticated using (public.pode_editar()) with check (public.pode_editar())', t);
  end loop;
end $$;

drop policy if exists alterar on public.configuracoes;
create policy alterar on public.configuracoes for update to authenticated using (public.e_admin()) with check (public.e_admin());
drop policy if exists admin_usuarios on public.usuarios;
create policy admin_usuarios on public.usuarios for all to authenticated using (public.e_admin()) with check (public.e_admin());
drop policy if exists proprio_usuario on public.usuarios;
create policy proprio_usuario on public.usuarios for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and perfil = public.meu_perfil() and ativo);

-- Trava: sempre existe pelo menos um administrador ativo
create or replace function public.manter_admin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.usuarios where perfil='administrador' and ativo) then
    raise exception 'O sistema precisa de pelo menos um administrador ativo.';
  end if;
  return null;
end $$;
drop trigger if exists manter_admin on public.usuarios;
create constraint trigger manter_admin after update or delete on public.usuarios
  deferrable initially deferred for each row execute function public.manter_admin();

-- ---------- Permissões explícitas --------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update on public.atas, public.itens, public.orgaos, public.pedidos, public.pedido_itens to authenticated;
grant select, update on public.configuracoes to authenticated;
grant select, insert, update on public.usuarios to authenticated;
grant select on public.historico, public.v_saldo_itens, public.v_aderido_orgao to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.registrar_pedido(jsonb), public.cancelar_pedido(uuid,text),
  public.meu_perfil(), public.pode_editar(), public.e_admin() to authenticated;

-- ---------- Primeiro administrador -------------------------------------
-- Depois de criar o login em Authentication > Users (e-mail kennedyfrancelino@gmail.com),
-- rode a linha abaixo uma única vez:
-- insert into public.usuarios(id, nome, email, perfil, troca_senha)
--   select id, 'Kennedy Dantas Francelino', email, 'administrador', false from auth.users
--   where email = 'kennedyfrancelino@gmail.com' on conflict (id) do update set perfil = 'administrador', ativo = true;
