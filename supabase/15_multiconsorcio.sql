-- =====================================================================
-- 15 · Vários consórcios no mesmo sistema (multiconsórcio)
-- Rodar depois do 14. Compatível com o que já existe: tudo o que está no banco
-- passa a ser do CIMOP (o primeiro consórcio) e continua funcionando igual.
--
-- Como funciona
--   • consorcio.consorcios: um registro por consórcio (sigla única).
--   • Cada usuário pode estar em vários consórcios, com perfil próprio em cada um
--     (consorcio.usuario_consorcios); escolhe ao entrar e troca no topo da tela.
--   • Toda tabela de dados ganha consorcio_id (padrão: consorcio.atual()) e uma regra
--     RESTRITIVA: cada um só vê e grava os dados do consórcio em que está.
--   • As funções "security definer" passam a ser donas do papel consorcio_dono, que
--     NÃO ignora as regras: elas também ficam presas ao consórcio atual.
--   • Telas públicas (formulários sem login) fixam o consórcio pela sigla do link
--     ou pela própria IRP/protocolo (consorcio.fixar).
--   • Número de ofício, número/processo da IRP, CNPJ do ente, ata, protocolo:
--     únicos dentro de cada consórcio.
--   • Só o Suporte SOFT+ (usuarios.suporte) cria consórcios.
-- Antes de alterar qualquer coisa, copia todas as tabelas para consorcio_bkp_15.
-- =====================================================================

-- ---------- 0. Cópia de segurança ---------------------------------------------
create schema if not exists consorcio_bkp_15;
revoke all on schema consorcio_bkp_15 from public, anon, authenticated;
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'consorcio' and c.relkind = 'r' loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'consorcio_bkp_15' and c.relname = t) then
      execute format('create table consorcio_bkp_15.%I as table consorcio.%I', t, t);
    end if;
  end loop;
end $$;

-- ---------- 1. Consórcios e participação dos usuários ---------------------------
create table if not exists consorcio.consorcios (
  id uuid primary key default gen_random_uuid(),
  sigla text not null check (sigla ~ '^[A-Za-z0-9]{2,20}$'),
  nome text not null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create unique index if not exists consorcios_sigla_unica on consorcio.consorcios (upper(sigla));
insert into consorcio.consorcios (sigla, nome, criado_em)
select upper(regexp_replace(coalesce(c.sigla, 'CIMOP'), '[^A-Za-z0-9]', '', 'g')), c.orgao_nome, '2026-01-01'
  from consorcio.configuracoes c where c.id = 1 and not exists (select 1 from consorcio.consorcios);

alter table consorcio.usuarios add column if not exists suporte boolean not null default false;
alter table consorcio.usuarios add column if not exists consorcio_atual uuid references consorcio.consorcios(id);

create table if not exists consorcio.usuario_consorcios (
  usuario_id uuid not null references consorcio.usuarios(id) on delete cascade,
  consorcio_id uuid not null references consorcio.consorcios(id),
  perfil text not null default 'operador' check (perfil in ('administrador','operador','consulta')),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (usuario_id, consorcio_id)
);
insert into consorcio.usuario_consorcios (usuario_id, consorcio_id, perfil, ativo)
select u.id, (select id from consorcio.consorcios order by criado_em limit 1), coalesce(u.perfil, 'operador'), u.ativo
  from consorcio.usuarios u
on conflict do nothing;

-- ---------- 2. Consórcio atual ----------------------------------------------------
-- 1º: o fixado na transação (telas públicas, agenda); 2º: o escolhido pelo usuário; 3º: o primeiro dele.
create or replace function consorcio.atual()
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(
    nullif(current_setting('consorcio.atual', true), '')::uuid,
    (select u.consorcio_atual from consorcio.usuarios u where u.id = auth.uid() and u.ativo and u.consorcio_atual is not null
        and (u.suporte or exists (select 1 from consorcio.usuario_consorcios uc where uc.usuario_id = u.id and uc.consorcio_id = u.consorcio_atual and uc.ativo))),
    (select uc.consorcio_id from consorcio.usuario_consorcios uc join consorcio.usuarios u on u.id = uc.usuario_id
       where uc.usuario_id = auth.uid() and uc.ativo and u.ativo order by uc.criado_em limit 1))
$$;
create or replace function consorcio.fixar(p_consorcio uuid)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
begin
  if p_consorcio is null then raise exception 'Consórcio não encontrado.'; end if;
  perform set_config('consorcio.atual', p_consorcio::text, true);
  return p_consorcio;
end $$;
-- Sigla do link público -> consórcio (sem sigla: o primeiro, para os links antigos continuarem valendo)
create or replace function consorcio.consorcio_da_sigla(p_sigla text)
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select case when nullif(trim(coalesce(p_sigla, '')), '') is null
    then (select id from consorcio.consorcios where ativo order by criado_em limit 1)
    else (select id from consorcio.consorcios where upper(sigla) = upper(trim(p_sigla)) and ativo) end
$$;
grant execute on function consorcio.atual() to anon, authenticated;
revoke all on function consorcio.fixar(uuid), consorcio.consorcio_da_sigla(text) from public, anon, authenticated;

-- ---------- 3. consorcio_id em todas as tabelas de dados ------------------------------
do $$
declare t text; v_cimop uuid := (select id from consorcio.consorcios order by criado_em limit 1);
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'consorcio' and c.relkind = 'r'
              and c.relname not in ('consorcios','usuarios','usuario_consorcios','modulos') loop
    execute format('alter table consorcio.%I add column if not exists consorcio_id uuid references consorcio.consorcios(id)', t);
    -- sem gatilhos na carga (histórico, travas e integração não devem disparar só por marcar o consórcio)
    execute format('alter table consorcio.%I disable trigger user', t);
    execute format('update consorcio.%I set consorcio_id = %L where consorcio_id is null', t, v_cimop);
    execute format('alter table consorcio.%I enable trigger user', t);
    execute format('alter table consorcio.%I alter column consorcio_id set not null', t);
    execute format('alter table consorcio.%I alter column consorcio_id set default consorcio.atual()', t);
    execute format('create index if not exists %I on consorcio.%I (consorcio_id)', t || '_consorcio', t);
  end loop;
end $$;

-- Configurações: uma linha por consórcio
create sequence if not exists consorcio.configuracoes_id_seq owned by consorcio.configuracoes.id;
select setval('consorcio.configuracoes_id_seq', greatest((select max(id) from consorcio.configuracoes), 1));
alter table consorcio.configuracoes alter column id set default nextval('consorcio.configuracoes_id_seq');
create unique index if not exists configuracoes_um_por_consorcio on consorcio.configuracoes (consorcio_id);
-- os valores padrão eram do CIMOP; para um consórcio novo, ficam neutros
alter table consorcio.configuracoes alter column orgao_nome drop default, alter column sigla drop default, alter column cidade_uf set default '',
  alter column presidente_nome set default '', alter column presidente_cargo set default 'Presidente',
  alter column resolucao_srp set default '', alter column texto_anexos set default 'Conforme solicitado, encaminhamos, em anexo, o processo integral do {pregao}.';
alter table consorcio.configuracoes drop constraint if exists configuracoes_id_check;

create sequence if not exists consorcio.pncp_config_id_seq owned by consorcio.pncp_config.id;
select setval('consorcio.pncp_config_id_seq', greatest((select max(id) from consorcio.pncp_config), 1));
alter table consorcio.pncp_config alter column id set default nextval('consorcio.pncp_config_id_seq');
alter table consorcio.pncp_config alter column cnpj set default '';
alter table consorcio.pncp_config drop constraint if exists pncp_config_id_check;
create unique index if not exists pncp_config_um_por_consorcio on consorcio.pncp_config (consorcio_id);

-- Chaves que passam a valer dentro de cada consórcio
alter table consorcio.integracao drop constraint if exists integracao_pkey;
alter table consorcio.integracao add primary key (consorcio_id, item);
alter table consorcio.integracao_erros drop constraint if exists integracao_erros_pkey;
alter table consorcio.integracao_erros add primary key (consorcio_id, item, registro);
alter table consorcio.irp_numeracao drop constraint if exists irp_numeracao_pkey;
alter table consorcio.irp_numeracao add primary key (consorcio_id, ano);
alter table consorcio.usuario_modulos drop constraint if exists usuario_modulos_pkey;
alter table consorcio.usuario_modulos add primary key (usuario_id, consorcio_id, modulo_id);
alter table consorcio.pncp_documentos drop constraint if exists pncp_documentos_pkey;
alter table consorcio.pncp_documentos add primary key (consorcio_id, url);

alter table consorcio.atas drop constraint if exists atas_numero_key;
create unique index if not exists atas_numero_consorcio on consorcio.atas (consorcio_id, numero);
alter table consorcio.orgaos drop constraint if exists orgaos_cnpj_key;
create unique index if not exists orgaos_cnpj_consorcio on consorcio.orgaos (consorcio_id, cnpj);
alter table consorcio.pedidos drop constraint if exists pedidos_numero_oficio_key;
create unique index if not exists pedidos_oficio_consorcio on consorcio.pedidos (consorcio_id, numero_oficio);
alter table consorcio.irps drop constraint if exists irps_numero_ano_key;
create unique index if not exists irps_numero_consorcio on consorcio.irps (consorcio_id, numero, ano);
alter table consorcio.importacoes drop constraint if exists importacoes_hash_key;
create unique index if not exists importacoes_hash_consorcio on consorcio.importacoes (consorcio_id, hash);
alter table consorcio.pncp_atualizacoes drop constraint if exists pncp_atualizacoes_chave_key;
create unique index if not exists pncp_atualizacoes_chave_consorcio on consorcio.pncp_atualizacoes (consorcio_id, chave);
alter table consorcio.solicitacoes drop constraint if exists solicitacoes_protocolo_key;
create unique index if not exists solicitacoes_protocolo_consorcio on consorcio.solicitacoes (consorcio_id, protocolo);
alter table consorcio.irp_respostas drop constraint if exists irp_respostas_protocolo_key;
create unique index if not exists irp_respostas_protocolo_consorcio on consorcio.irp_respostas (consorcio_id, protocolo);
drop index if exists consorcio.normas_papel_unico;
create unique index if not exists normas_papel_consorcio on consorcio.normas (consorcio_id, papel) where papel is not null;
-- índices únicos antigos que ainda não levam o consórcio (processo da IRP, controle PNCP da ata)
do $$ declare r record; v_def text; begin
  for r in select i.indexname, i.indexdef from pg_indexes i
            where i.schemaname = 'consorcio' and i.indexname in ('irps_processo','atas_numero_controle_pncp') and i.indexdef not like '%consorcio_id%' loop
    v_def := regexp_replace(r.indexdef, 'ON consorcio\.(\w+) USING (\w+) \(', 'ON consorcio.\1 USING \2 (consorcio_id, ');
    execute 'drop index consorcio.' || quote_ident(r.indexname);
    execute v_def;
  end loop;
end $$;

-- ---------- 4. Papel dono das funções (não ignora as regras) ---------------------------
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'consorcio_dono') then create role consorcio_dono nologin; end if;
end $$;
grant consorcio_dono to postgres;
grant usage, create on schema consorcio to consorcio_dono;
grant usage on schema public, extensions to consorcio_dono;
-- o esquema auth (auth.uid) só é liberado pelo papel authenticated; o dono herda dele
alter role consorcio_dono inherit;
grant authenticated to consorcio_dono;
grant select, insert, update, delete on all tables in schema consorcio to consorcio_dono;
grant usage, select on all sequences in schema consorcio to consorcio_dono;
-- Portal (integração com o site)
grant select, insert, update, delete on public.consorcio_entes, public.consorcio_documentos, public.gestores to consorcio_dono;
grant select, update on public.orgaos to consorcio_dono;
grant select on public.unidades to consorcio_dono;
do $$ declare t text; begin
  foreach t in array array['consorcio_entes','consorcio_documentos','gestores','orgaos','unidades'] loop
    execute format('drop policy if exists gestao_consorcio on public.%I', t);
    execute format('create policy gestao_consorcio on public.%I for all to consorcio_dono using (true) with check (true)', t);
  end loop;
end $$;

-- ---------- 5. Regras: cada consórcio só vê o seu -------------------------------------------
do $$ declare t text; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'consorcio' and c.relkind = 'r' and c.relname not in ('consorcios','usuarios','usuario_consorcios','modulos') loop
    if not (select relrowsecurity from pg_class where oid = ('consorcio.' || t)::regclass) then execute format('alter table consorcio.%I enable row level security', t); end if;
    execute format('drop policy if exists isolar_consorcio on consorcio.%I', t);
    execute format('create policy isolar_consorcio on consorcio.%I as restrictive for all to public using (consorcio_id = consorcio.atual()) with check (consorcio_id = consorcio.atual())', t);
    execute format('drop policy if exists dono on consorcio.%I', t);
    execute format('create policy dono on consorcio.%I for all to consorcio_dono using (true) with check (true)', t);
  end loop;
  foreach t in array array['consorcios','usuarios','usuario_consorcios','modulos'] loop
    if not (select relrowsecurity from pg_class where oid = ('consorcio.' || t)::regclass) then execute format('alter table consorcio.%I enable row level security', t); end if;
    execute format('drop policy if exists dono on consorcio.%I', t);
    execute format('create policy dono on consorcio.%I for all to consorcio_dono using (true) with check (true)', t);
  end loop;
end $$;
alter view consorcio.v_saldo_itens_publico set (security_invoker = true);
revoke all on consorcio.v_saldo_itens_publico from anon;

-- ---------- 6. Perfis e permissões (por consórcio) --------------------------------------------
create or replace function consorcio.e_suporte()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce((select suporte from consorcio.usuarios where id = auth.uid() and ativo), false)
$$;
-- Perfil geral no consórcio atual (administrador = administrador do sistema neste consórcio)
create or replace function consorcio.meu_perfil_geral()
returns text language sql stable security definer set search_path = consorcio, public as $$
  select case when u.suporte then 'administrador'
    else (select uc.perfil from consorcio.usuario_consorcios uc where uc.usuario_id = u.id and uc.consorcio_id = consorcio.atual() and uc.ativo) end
  from consorcio.usuarios u where u.id = auth.uid() and u.ativo
$$;
create or replace function consorcio.e_admin_sistema()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.meu_perfil_geral() = 'administrador', false)
$$;
create or replace function consorcio.perfil_modulo(p_modulo text)
returns text language sql stable security definer set search_path = consorcio, public as $$
  select case
    when not exists (select 1 from consorcio.modulos m where m.id = p_modulo and m.ativo) then null
    when consorcio.meu_perfil_geral() is null then null
    when consorcio.meu_perfil_geral() = 'administrador' then 'administrador'
    else (select um.perfil from consorcio.usuario_modulos um where um.usuario_id = auth.uid() and um.modulo_id = p_modulo and um.consorcio_id = consorcio.atual())
  end
$$;
grant execute on function consorcio.e_suporte() to authenticated;

-- Pelo menos um administrador ativo em cada consórcio
create or replace function consorcio.manter_admin()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
declare v_cons uuid;
begin
  for v_cons in select distinct x from unnest(array[case when tg_op <> 'INSERT' then old.consorcio_id end, case when tg_op <> 'DELETE' then new.consorcio_id end]) x where x is not null loop
    if exists (select 1 from consorcio.usuario_consorcios where consorcio_id = v_cons)
       and not exists (select 1 from consorcio.usuario_consorcios uc join consorcio.usuarios u on u.id = uc.usuario_id
                        where uc.consorcio_id = v_cons and uc.perfil = 'administrador' and uc.ativo and u.ativo) then
      raise exception 'O consórcio precisa de pelo menos um administrador ativo.';
    end if;
  end loop;
  return null;
end $$;
drop trigger if exists manter_admin on consorcio.usuarios;
do $$ declare r record; begin   -- tira o gatilho antigo de usuarios, seja qual for o nome
  for r in select t.tgname from pg_trigger t join pg_proc p on p.oid = t.tgfoid where t.tgrelid = 'consorcio.usuarios'::regclass and p.proname = 'manter_admin' loop
    execute format('drop trigger %I on consorcio.usuarios', r.tgname);
  end loop;
end $$;
drop trigger if exists manter_admin on consorcio.usuario_consorcios;
create trigger manter_admin after insert or update or delete on consorcio.usuario_consorcios for each row execute function consorcio.manter_admin();

-- Usuários: cada administrador vê e cuida dos usuários do seu consórcio
drop policy if exists ler on consorcio.usuarios;
create policy ler on consorcio.usuarios for select to authenticated
  using (id = auth.uid() or consorcio.e_suporte()
         or exists (select 1 from consorcio.usuario_consorcios uc where uc.usuario_id = usuarios.id and uc.consorcio_id = consorcio.atual() and consorcio.meu_perfil_geral() is not null));
drop policy if exists admin_usuarios on consorcio.usuarios;
create policy admin_usuarios on consorcio.usuarios for update to authenticated
  using (consorcio.e_admin_sistema() and id <> auth.uid() and exists (select 1 from consorcio.usuario_consorcios uc where uc.usuario_id = usuarios.id and uc.consorcio_id = consorcio.atual()))
  with check (consorcio.e_admin_sistema() and id <> auth.uid());
drop policy if exists proprio_usuario on consorcio.usuarios;
create policy proprio_usuario on consorcio.usuarios for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and ativo);
-- ninguém se promove a Suporte nem muda o e-mail pela tela
create or replace function consorcio.proteger_usuario()
returns trigger language plpgsql set search_path = consorcio, public as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.suporte is distinct from old.suporte then raise exception 'Só a equipe SOFT+ muda quem é Suporte.'; end if;
    if new.email is distinct from old.email then raise exception 'O e-mail não muda pela tela.'; end if;
    if new.id = auth.uid() and new.ativo is distinct from old.ativo then raise exception 'Ninguém altera o próprio acesso.'; end if;
  end if;
  return new;
end $$;
drop trigger if exists proteger_usuario on consorcio.usuarios;
create trigger proteger_usuario before update on consorcio.usuarios for each row execute function consorcio.proteger_usuario();

alter table consorcio.usuario_consorcios enable row level security;
drop policy if exists ler on consorcio.usuario_consorcios;
create policy ler on consorcio.usuario_consorcios for select to authenticated
  using (usuario_id = auth.uid() or consorcio.e_suporte() or (consorcio_id = consorcio.atual() and consorcio.meu_perfil_geral() is not null));
drop policy if exists inserir on consorcio.usuario_consorcios;
create policy inserir on consorcio.usuario_consorcios for insert to authenticated
  with check (consorcio_id = consorcio.atual() and consorcio.e_admin_sistema() and usuario_id <> auth.uid());
drop policy if exists alterar on consorcio.usuario_consorcios;
create policy alterar on consorcio.usuario_consorcios for update to authenticated
  using (consorcio_id = consorcio.atual() and consorcio.e_admin_sistema() and usuario_id <> auth.uid())
  with check (consorcio_id = consorcio.atual() and consorcio.e_admin_sistema() and usuario_id <> auth.uid());
grant select, insert, update on consorcio.usuario_consorcios to authenticated;
grant all on consorcio.usuario_consorcios, consorcio.consorcios to service_role;

alter table consorcio.consorcios enable row level security;
drop policy if exists ler on consorcio.consorcios;
create policy ler on consorcio.consorcios for select to authenticated
  using (consorcio.e_suporte() or exists (select 1 from consorcio.usuario_consorcios uc where uc.consorcio_id = consorcios.id and uc.usuario_id = auth.uid() and uc.ativo));
grant select on consorcio.consorcios to authenticated;

-- Acessos por módulo: no consórcio atual
create or replace function consorcio.salvar_acessos(p_usuario uuid, p_acessos jsonb)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
declare a jsonb;
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema altera os acessos.'; end if;
  if p_usuario = auth.uid() then raise exception 'Ninguém altera o próprio acesso.'; end if;
  if jsonb_typeof(coalesce(p_acessos, '[]'::jsonb)) <> 'array' then raise exception 'Lista de acessos inválida.'; end if;
  if not exists (select 1 from consorcio.usuario_consorcios where usuario_id = p_usuario and consorcio_id = consorcio.atual()) then
    raise exception 'Este usuário não está neste consórcio.';
  end if;
  delete from consorcio.usuario_modulos where usuario_id = p_usuario and consorcio_id = consorcio.atual()
    and modulo_id not in (select x->>'modulo' from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb)) x);
  for a in select * from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb)) loop
    if coalesce(a->>'perfil', '') not in ('administrador','operador','consulta') then raise exception 'Perfil inválido no módulo %.', a->>'modulo'; end if;
    insert into consorcio.usuario_modulos (usuario_id, consorcio_id, modulo_id, perfil) values (p_usuario, consorcio.atual(), a->>'modulo', a->>'perfil')
      on conflict (usuario_id, consorcio_id, modulo_id) do update set perfil = excluded.perfil;
  end loop;
end $$;

-- Trocar de consórcio (topo da tela)
create or replace function consorcio.trocar_consorcio(p_consorcio uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not (consorcio.e_suporte() or exists (select 1 from consorcio.usuario_consorcios uc where uc.usuario_id = auth.uid() and uc.consorcio_id = p_consorcio and uc.ativo)) then
    raise exception 'Você não tem acesso a este consórcio.';
  end if;
  if not exists (select 1 from consorcio.consorcios where id = p_consorcio and ativo) then raise exception 'Consórcio desativado.'; end if;
  update consorcio.usuarios set consorcio_atual = p_consorcio where id = auth.uid();
end $$;
-- Meus consórcios (para escolher ao entrar)
create or replace function consorcio.meus_consorcios()
returns table (id uuid, sigla text, nome text, perfil text, atual boolean) language sql stable security definer set search_path = consorcio, public as $$
  select c.id, c.sigla, c.nome, case when u.suporte then 'administrador' else uc.perfil end, c.id = consorcio.atual()
    from consorcio.consorcios c join consorcio.usuarios u on u.id = auth.uid() and u.ativo
    left join consorcio.usuario_consorcios uc on uc.consorcio_id = c.id and uc.usuario_id = u.id and uc.ativo
   where c.ativo and (u.suporte or uc.usuario_id is not null)
   order by c.sigla
$$;
-- Novo consórcio (só Suporte SOFT+)
create or replace function consorcio.criar_consorcio(p_sigla text, p_nome text, p_cnpj text default null, p_cidade_uf text default null)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
declare v uuid; v_sig text := upper(regexp_replace(coalesce(p_sigla, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not consorcio.e_suporte() then raise exception 'Só o Suporte SOFT+ cria consórcios.'; end if;
  if length(v_sig) < 2 then raise exception 'Informe a sigla (letras e números).'; end if;
  if coalesce(trim(p_nome), '') = '' then raise exception 'Informe o nome do consórcio.'; end if;
  if exists (select 1 from consorcio.consorcios where upper(sigla) = v_sig) then raise exception 'Já existe um consórcio com a sigla %.', v_sig; end if;
  insert into consorcio.consorcios (sigla, nome) values (v_sig, trim(p_nome)) returning id into v;
  insert into consorcio.configuracoes (consorcio_id, orgao_nome, sigla, cnpj, cidade_uf, presidente_cargo)
  values (v, trim(p_nome), v_sig, nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''), coalesce(trim(p_cidade_uf), ''), 'Presidente do ' || v_sig);
  insert into consorcio.integracao (consorcio_id, item) select v, x from unnest(array['entes','pessoas','identidade','documentos']) x;
  insert into consorcio.pncp_config (consorcio_id, cnpj) values (v, coalesce(nullif(regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'), ''), ''));
  -- quem cria entra como administrador
  insert into consorcio.usuario_consorcios (usuario_id, consorcio_id, perfil) values (auth.uid(), v, 'administrador') on conflict do nothing;
  return v;
end $$;
create or replace function consorcio.alterar_consorcio(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.e_suporte() then raise exception 'Só o Suporte SOFT+ altera consórcios.'; end if;
  update consorcio.consorcios set ativo = p_ativo where id = p_id;
end $$;
grant execute on function consorcio.trocar_consorcio(uuid), consorcio.meus_consorcios(), consorcio.criar_consorcio(text, text, text, text),
  consorcio.alterar_consorcio(uuid, boolean) to authenticated;
-- a sigla do consórcio acompanha a das configurações
create or replace function consorcio.sigla_para_consorcio()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if new.sigla is distinct from old.sigla or new.orgao_nome is distinct from old.orgao_nome then
    update consorcio.consorcios set sigla = coalesce(nullif(upper(regexp_replace(coalesce(new.sigla, ''), '[^A-Za-z0-9]', '', 'g')), ''), sigla), nome = new.orgao_nome
     where id = new.consorcio_id;
  end if;
  return null;
end $$;
drop trigger if exists sigla_consorcio on consorcio.configuracoes;
create trigger sigla_consorcio after update on consorcio.configuracoes for each row execute function consorcio.sigla_para_consorcio();

-- ---------- 7. Funções que olhavam "a" configuração (id = 1) e chaves antigas ---------------
-- Com o dono consorcio_dono, a regra já deixa só a linha do consórcio atual.
do $$
declare r record; v_def text; v_novo text;
begin
  for r in select p.oid, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'consorcio' and p.prokind = 'f' loop
    v_def := pg_get_functiondef(r.oid);
    v_novo := regexp_replace(v_def, 'where (c\.)?id = 1([^0-9])', 'where true\2', 'g');
    v_novo := replace(v_novo, 'on conflict (ano)', 'on conflict (consorcio_id, ano)');
    v_novo := replace(v_novo, 'on conflict (item, registro)', 'on conflict (consorcio_id, item, registro)');
    if v_novo <> v_def then execute v_novo; end if;
  end loop;
end $$;

-- Integração: valer por consórcio também para quem usa o Portal (trava) -----------------------
create or replace function consorcio.consorcio_do_portal(p_orgao uuid)
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select consorcio_id from consorcio.configuracoes where portal_orgao_id = p_orgao limit 1
$$;
create or replace function consorcio.integracao_ativa_em(p_item text, p_consorcio uuid)
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce((select ativo from consorcio.integracao where item = p_item and consorcio_id = p_consorcio), false)
$$;
grant execute on function consorcio.consorcio_do_portal(uuid), consorcio.integracao_ativa_em(text, uuid) to anon, authenticated;
create or replace function consorcio.travar_portal()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
declare v_org uuid; v_item text := tg_argv[0]; v_mudou boolean := false; k text; v_sig text; v_cons uuid;
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  v_org := case when tg_table_name = 'orgaos' then coalesce(new.id, old.id) else coalesce(new.orgao_id, old.orgao_id) end;
  v_cons := consorcio.consorcio_do_portal(v_org);
  if tg_table_name = 'orgaos' then
    if (new.configuracoes -> 'integracao_gestao') is distinct from (old.configuracoes -> 'integracao_gestao') then
      raise exception 'A integração com a Gestão de Consórcio só é ligada ou desligada na própria Gestão de Consórcio.';
    end if;
  end if;
  if v_cons is null then return coalesce(new, old); end if;
  v_sig := coalesce(nullif((select configuracoes -> 'integracao_gestao' ->> 'sigla' from public.orgaos where id = v_org), ''), 'consórcio');
  if tg_table_name = 'orgaos' then
    if not consorcio.integracao_ativa_em('identidade', v_cons) then return new; end if;
    foreach k in array array['nome_exibicao','endereco','cep','telefone','whatsapp','email','horario','brasao_url','instagram','facebook','youtube'] loop
      if coalesce(new.configuracoes ->> k, '') <> coalesce(old.configuracoes ->> k, '') then v_mudou := true; end if;
    end loop;
    if new.sigla is distinct from old.sigla then v_mudou := true; end if;
    if v_mudou then
      raise exception 'Nome, sigla, endereço, contatos, horário, redes sociais e brasão do % são controlados pela Gestão de Consórcio (Consórcio › Dados). Altere lá.', v_sig;
    end if;
    return new;
  end if;
  if consorcio.integracao_ativa_em(v_item, v_cons) then
    raise exception '%', case v_item
      when 'entes' then format('Os entes consorciados do %s são controlados pela Gestão de Consórcio (Cadastro de Consorciados). Altere lá.', v_sig)
      when 'documentos' then format('Os documentos do %s (constitutivos, contratos, atas e orçamento) são controlados pela Gestão de Consórcio (Consórcio › Documentos). Altere lá.', v_sig)
      else format('Os gestores do %s são controlados pela Gestão de Consórcio (Consórcio › Pessoas). Altere lá.', v_sig) end;
  end if;
  return coalesce(new, old);
end $$;
grant execute on function consorcio.travar_portal() to anon, authenticated;

-- Um mesmo órgão do Portal só pode estar ligado a um consórcio
create unique index if not exists configuracoes_portal_unico on consorcio.configuracoes (portal_orgao_id) where portal_orgao_id is not null;

-- Agenda: encerra as IRPs vencidas de todos os consórcios
create or replace function consorcio.encerrar_irps_vencidas()
returns integer language plpgsql security definer set search_path = consorcio, public as $$
declare n int := 0; m int; v uuid;
begin
  for v in select id from consorcio.consorcios loop
    perform consorcio.fixar(v);
    update consorcio.irps set situacao = 'encerrada' where situacao = 'aberta' and prazo_fim < consorcio.hoje_br();
    get diagnostics m = row_count; n := n + m;
  end loop;
  perform set_config('consorcio.atual', '', true);
  return n;
end $$;
revoke all on function consorcio.encerrar_irps_vencidas() from public, anon, authenticated;

-- ---------- 8. Telas públicas: fixar o consórcio --------------------------------------------
create or replace function consorcio.consorcio_da_irp(p_irp uuid)
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select consorcio_id from consorcio.irps where id = p_irp
$$;
create or replace function consorcio.consorcio_do_protocolo_irp(p_protocolo text, p_cnpj text)
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select r.consorcio_id from consorcio.irp_respostas r join consorcio.orgaos o on o.id = r.orgao_id
   where r.protocolo = upper(trim(p_protocolo)) and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
   order by r.criado_em desc limit 1
$$;
revoke all on function consorcio.consorcio_da_irp(uuid), consorcio.consorcio_do_protocolo_irp(text, text) from public, anon, authenticated;

-- Cada função pública vira "base" (presa ao consórcio, dona consorcio_dono) e ganha uma porta de entrada
-- que fixa o consórcio antes de chamar a base.
do $$
declare f text;
begin
  foreach f in array array['publico_atas()', 'publico_orgao(text)', 'enviar_solicitacao(jsonb)', 'consultar_solicitacao(text, text)', 'publico_identidade()',
                           'publico_irp(uuid)', 'publico_irp_ente(uuid, text)', 'publico_irp_salvar(uuid, jsonb)',
                           'publico_irp_anexar(text, text, text, text)', 'publico_irp_consultar(text, text)'] loop
    if to_regprocedure('consorcio.' || f) is not null and to_regprocedure('consorcio.' || replace(f, '(', '_base(')) is null then
      execute format('alter function consorcio.%s rename to %s', f, split_part(f, '(', 1) || '_base');
    end if;
  end loop;
end $$;

create or replace function consorcio.publico_atas(p_sigla text default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_sigla(p_sigla)); return consorcio.publico_atas_base(); end $$;
create or replace function consorcio.publico_orgao(p_cnpj text, p_sigla text default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_sigla(p_sigla)); return consorcio.publico_orgao_base(p_cnpj); end $$;
create or replace function consorcio.enviar_solicitacao(p jsonb)
returns text language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_sigla(p->>'sigla')); return consorcio.enviar_solicitacao_base(p); end $$;
create or replace function consorcio.consultar_solicitacao(p_protocolo text, p_cnpj text, p_sigla text default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_sigla(p_sigla)); return consorcio.consultar_solicitacao_base(p_protocolo, p_cnpj); end $$;
create or replace function consorcio.publico_identidade(p_sigla text default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
declare v uuid := consorcio.consorcio_da_sigla(p_sigla);
begin
  if v is null then return null; end if;
  perform consorcio.fixar(v); return consorcio.publico_identidade_base();
end $$;
create or replace function consorcio.publico_irp(p_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
declare v uuid := consorcio.consorcio_da_irp(p_id);
begin if v is null then return null; end if; perform consorcio.fixar(v); return consorcio.publico_irp_base(p_id); end $$;
create or replace function consorcio.publico_irp_ente(p_id uuid, p_cnpj text)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_irp(p_id)); return consorcio.publico_irp_ente_base(p_id, p_cnpj); end $$;
create or replace function consorcio.publico_irp_salvar(p_id uuid, p jsonb)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin perform consorcio.fixar(consorcio.consorcio_da_irp(p_id)); return consorcio.publico_irp_salvar_base(p_id, p); end $$;
create or replace function consorcio.publico_irp_anexar(p_protocolo text, p_cnpj text, p_caminho text, p_nome text, p_irp uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin
  perform consorcio.fixar(coalesce(consorcio.consorcio_da_irp(p_irp), consorcio.consorcio_do_protocolo_irp(p_protocolo, p_cnpj)));
  return consorcio.publico_irp_anexar_base(p_protocolo, p_cnpj, p_caminho, p_nome);
end $$;
create or replace function consorcio.publico_irp_consultar(p_protocolo text, p_cnpj text, p_irp uuid default null)
returns jsonb language plpgsql volatile security definer set search_path = consorcio, public as $$
begin
  perform consorcio.fixar(coalesce(consorcio.consorcio_da_irp(p_irp), consorcio.consorcio_do_protocolo_irp(p_protocolo, p_cnpj)));
  return consorcio.publico_irp_consultar_base(p_protocolo, p_cnpj);
end $$;
grant execute on function consorcio.publico_atas(text), consorcio.publico_orgao(text, text), consorcio.enviar_solicitacao(jsonb),
  consorcio.consultar_solicitacao(text, text, text), consorcio.publico_identidade(text), consorcio.publico_irp(uuid), consorcio.publico_irp_ente(uuid, text),
  consorcio.publico_irp_salvar(uuid, jsonb), consorcio.publico_irp_anexar(text, text, text, text, uuid), consorcio.publico_irp_consultar(text, text, uuid) to anon, authenticated;
do $$ declare f text; begin
  foreach f in array array['publico_atas_base()', 'publico_orgao_base(text)', 'enviar_solicitacao_base(jsonb)', 'consultar_solicitacao_base(text, text)', 'publico_identidade_base()',
                           'publico_irp_base(uuid)', 'publico_irp_ente_base(uuid, text)', 'publico_irp_salvar_base(uuid, jsonb)',
                           'publico_irp_anexar_base(text, text, text, text)', 'publico_irp_consultar_base(text, text)'] loop
    execute format('revoke all on function consorcio.%s from public, anon, authenticated', f);
  end loop;
end $$;

-- O texto "Fale com o CIMOP" do anexo da IRP passa a usar a sigla
do $$ declare v_def text; begin
  v_def := pg_get_functiondef('consorcio.publico_irp_anexar_base(text, text, text, text)'::regprocedure);
  if v_def like '%Fale com o CIMOP%' then
    execute replace(v_def, '''O prazo desta IRP terminou. Fale com o CIMOP.''', '''O prazo desta IRP terminou. Fale com o %.'', (select sigla from consorcio.configuracoes limit 1)');
  end if;
end $$;

-- ---------- 9. Donos das funções ----------------------------------------------------------------
-- Ficam com o postgres (enxergam tudo): as que escolhem o consórcio, as permissões e as portas públicas.
do $$
declare r record;
  fica text[] := array['atual','fixar','consorcio_da_sigla','consorcio_da_irp','consorcio_do_protocolo_irp','consorcio_do_portal','integracao_ativa_em',
    'e_suporte','meu_perfil_geral','e_admin_sistema','perfil_modulo','pode_editar_modulo','meu_perfil','pode_editar','e_admin','pode_editar_cadastro','pode_editar_irp','pode_integrar',
    'trocar_consorcio','meus_consorcios','criar_consorcio','alterar_consorcio','manter_admin','prazo_minimo_irp','registrar_historico','sigla_para_consorcio',
    'publico_atas','publico_orgao','enviar_solicitacao','consultar_solicitacao','publico_identidade','publico_irp','publico_irp_ente','publico_irp_salvar',
    'publico_irp_anexar','publico_irp_consultar'];
begin
  for r in select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'consorcio' and p.prosecdef and p.prokind = 'f' loop
    if r.proname = any(fica) then
      execute format('alter function consorcio.%I(%s) owner to postgres', r.proname, r.args);
    else
      execute format('alter function consorcio.%I(%s) owner to consorcio_dono', r.proname, r.args);
    end if;
  end loop;
end $$;
-- prazo mínimo: feriados do órgão do Portal deste consórcio
create or replace function consorcio.prazo_minimo_irp(p_divulgacao date, p_direta boolean)
returns date language plpgsql stable security definer set search_path = consorcio, public as $$
declare n int := case when p_direta then 3 else 8 end; x date := p_divulgacao; c int := 0;
  v_portal uuid := (select portal_orgao_id from consorcio.configuracoes where consorcio_id = consorcio.atual());
begin
  if p_divulgacao is null then return null; end if;
  loop
    x := x + 1;
    if public.dia_util(v_portal, x) then c := c + 1; if c = n then return x; end if; end if;
    if x > p_divulgacao + 60 then return x; end if;
  end loop;
end $$;

-- Histórico: o consórcio vem da própria linha (vale também para a agenda do PNCP, que roda sem usuário)
create or replace function consorcio.registrar_historico()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
declare d jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into consorcio.historico (consorcio_id, tabela, registro, operacao, dados)
  values (coalesce((d->>'consorcio_id')::uuid, consorcio.atual()), tg_table_name, (d->>'id')::uuid, tg_op, d);
  return coalesce(new, old);
exception when invalid_text_representation then   -- tabela com id que não é uuid
  insert into consorcio.historico (consorcio_id, tabela, registro, operacao, dados)
  values (coalesce((d->>'consorcio_id')::uuid, consorcio.atual()), tg_table_name, null, tg_op, d);
  return coalesce(new, old);
end $$;
alter function consorcio.registrar_historico() owner to postgres;   -- só grava o histórico: enxerga tudo

-- Funções que as donas consorcio_dono chamam
grant execute on all functions in schema consorcio to consorcio_dono;

-- ---------- 10. Agenda do PNCP: a chave de qualquer consórcio vale para rodar todos -----------------
do $$ begin
  perform cron.unschedule('consorcio-pncp-diario') where exists (select 1 from cron.job where jobname = 'consorcio-pncp-diario');
  perform cron.schedule('consorcio-pncp-diario', '0 7 * * *', $c$
    select net.http_post(
      url := 'https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/consorcio-pncp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave-sinc', (select chave_sinc from consorcio.pncp_config order by id limit 1)),
      body := '{"origem":"agenda"}'::jsonb,
      timeout_milliseconds := 300000)
  $c$);
exception when others then raise notice 'pg_cron/pg_net indisponível: agenda do PNCP não alterada (%).', sqlerrm;
end $$;

-- ---------- 11. Usuários por último (o gatilho antigo de usuarios era adiado para o fim da transação) ----
update consorcio.usuarios set consorcio_atual = (select id from consorcio.consorcios order by criado_em limit 1) where consorcio_atual is null;
-- Suporte SOFT+ (cria consórcios e entra em qualquer um)
update consorcio.usuarios set suporte = true where lower(email) = 'kennedyfrancelino@gmail.com';
