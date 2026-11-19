-- =====================================================================
-- SOFT+ Consórcios | Gestão de Consórcio
-- 10_modulos_permissoes.sql  (reexecutável)
-- Tela principal com módulos e permissão por módulo.
--
-- Como fica o acesso:
--   * usuarios.perfil = 'administrador'  -> Administrador do sistema: vê todos os módulos e cuida dos usuários.
--   * demais usuários                    -> só os módulos liberados em usuario_modulos, com o perfil de cada módulo
--                                           (administrador do módulo | operador | consulta).
-- Quem já usava o sistema continua igual: operador e consulta recebem o mesmo perfil no módulo "adesoes".
--
-- Se algum dia rodar o script 01 de novo, rode este depois dele.
-- =====================================================================

-- ---------- Catálogo de módulos -----------------------------------------
create table if not exists consorcio.modulos (
  id text primary key,                        -- ex.: adesoes
  nome text not null,
  descricao text,
  ordem int not null default 0,
  ativo boolean not null default true
);
insert into consorcio.modulos (id, nome, descricao, ordem) values
  ('adesoes', 'Controle de Adesões', 'Adesões às Atas de Registro de Preços: limites de 50% e do dobro, ofícios e PNCP.', 10)
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;

-- ---------- Acesso de cada usuário a cada módulo ------------------------
create table if not exists consorcio.usuario_modulos (
  usuario_id uuid not null references consorcio.usuarios(id) on delete cascade,
  modulo_id text not null references consorcio.modulos(id) on delete no action,
  perfil text not null default 'operador' check (perfil in ('administrador','operador','consulta')),
  criado_em timestamptz not null default now(),
  primary key (usuario_id, modulo_id)
);

-- Migração: quem já tinha perfil operador/consulta passa a ter esse perfil no módulo de adesões.
insert into consorcio.usuario_modulos (usuario_id, modulo_id, perfil)
  select id, 'adesoes', perfil from consorcio.usuarios where perfil in ('operador','consulta')
on conflict (usuario_id, modulo_id) do nothing;

-- ---------- Funções de permissão ----------------------------------------
-- Perfil geral (só diz se a pessoa é administrador do sistema ou usuário comum).
create or replace function consorcio.meu_perfil_geral()
returns text language sql stable security definer set search_path = consorcio, public as $$
  select perfil from consorcio.usuarios where id = auth.uid() and ativo
$$;

create or replace function consorcio.e_admin_sistema()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.meu_perfil_geral() = 'administrador', false)
$$;

-- Perfil da pessoa num módulo (null = sem acesso). Administrador do sistema é administrador em todos.
create or replace function consorcio.perfil_modulo(p_modulo text)
returns text language sql stable security definer set search_path = consorcio, public as $$
  select case
    when not exists (select 1 from consorcio.modulos m where m.id = p_modulo and m.ativo) then null
    when u.perfil = 'administrador' then 'administrador'
    else (select um.perfil from consorcio.usuario_modulos um where um.usuario_id = u.id and um.modulo_id = p_modulo)
  end
  from consorcio.usuarios u where u.id = auth.uid() and u.ativo
$$;

create or replace function consorcio.pode_editar_modulo(p_modulo text)
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.perfil_modulo(p_modulo) in ('administrador','operador'), false)
$$;

-- As regras já existentes do módulo de adesões (scripts 01 a 09) usam estas três funções.
-- Agora elas olham o acesso ao módulo "adesoes".
create or replace function consorcio.meu_perfil()
returns text language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.perfil_modulo('adesoes')
$$;

create or replace function consorcio.pode_editar()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.pode_editar_modulo('adesoes')
$$;

create or replace function consorcio.e_admin()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.perfil_modulo('adesoes') = 'administrador', false)
$$;

-- ---------- Gravar os acessos de um usuário (tudo de uma vez) -----------
-- p_acessos: [{"modulo":"adesoes","perfil":"operador"}, ...]  (módulo fora da lista = sem acesso)
create or replace function consorcio.salvar_acessos(p_usuario uuid, p_acessos jsonb)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
declare a jsonb;
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema altera os acessos.'; end if;
  if p_usuario = auth.uid() then raise exception 'Ninguém altera o próprio acesso.'; end if;
  if jsonb_typeof(coalesce(p_acessos, '[]'::jsonb)) <> 'array' then raise exception 'Lista de acessos inválida.'; end if;
  delete from consorcio.usuario_modulos where usuario_id = p_usuario
    and modulo_id not in (select x->>'modulo' from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb)) x);
  for a in select * from jsonb_array_elements(coalesce(p_acessos, '[]'::jsonb)) loop
    if coalesce(a->>'perfil', '') not in ('administrador','operador','consulta') then raise exception 'Perfil inválido no módulo %.', a->>'modulo'; end if;
    insert into consorcio.usuario_modulos (usuario_id, modulo_id, perfil) values (p_usuario, a->>'modulo', a->>'perfil')
      on conflict (usuario_id, modulo_id) do update set perfil = excluded.perfil;
  end loop;
end $$;

-- ---------- RLS -----------------------------------------------------------
alter table consorcio.modulos enable row level security;
alter table consorcio.usuario_modulos enable row level security;

drop policy if exists ler on consorcio.modulos;
create policy ler on consorcio.modulos for select to authenticated using (consorcio.meu_perfil_geral() is not null);
drop policy if exists alterar on consorcio.modulos;
create policy alterar on consorcio.modulos for update to authenticated using (consorcio.e_admin_sistema()) with check (consorcio.e_admin_sistema());

drop policy if exists ler on consorcio.usuario_modulos;
create policy ler on consorcio.usuario_modulos for select to authenticated using (usuario_id = auth.uid() or consorcio.e_admin_sistema());
drop policy if exists inserir on consorcio.usuario_modulos;
create policy inserir on consorcio.usuario_modulos for insert to authenticated with check (consorcio.e_admin_sistema() and usuario_id <> auth.uid());
drop policy if exists alterar on consorcio.usuario_modulos;
create policy alterar on consorcio.usuario_modulos for update to authenticated
  using (consorcio.e_admin_sistema() and usuario_id <> auth.uid()) with check (consorcio.e_admin_sistema() and usuario_id <> auth.uid());
drop policy if exists excluir on consorcio.usuario_modulos;
create policy excluir on consorcio.usuario_modulos for delete to authenticated using (consorcio.e_admin_sistema() and usuario_id <> auth.uid());

-- Usuários: qualquer usuário ativo vê a lista; só o administrador do sistema cria e altera.
drop policy if exists ler on consorcio.usuarios;
create policy ler on consorcio.usuarios for select to authenticated using (consorcio.meu_perfil_geral() is not null);
drop policy if exists admin_usuarios on consorcio.usuarios;
create policy admin_usuarios on consorcio.usuarios for all to authenticated using (consorcio.e_admin_sistema()) with check (consorcio.e_admin_sistema());
drop policy if exists proprio_usuario on consorcio.usuarios;
create policy proprio_usuario on consorcio.usuarios for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid() and perfil = consorcio.meu_perfil_geral() and ativo);

-- Configurações do ofício: administrador do módulo de adesões (ou do sistema).
drop policy if exists alterar on consorcio.configuracoes;
create policy alterar on consorcio.configuracoes for update to authenticated using (consorcio.e_admin()) with check (consorcio.e_admin());

-- ---------- Permissões explícitas ----------------------------------------
grant select, update on consorcio.modulos to authenticated;
grant select, insert, update, delete on consorcio.usuario_modulos to authenticated;
grant all on consorcio.modulos, consorcio.usuario_modulos to service_role;
grant execute on function consorcio.meu_perfil_geral(), consorcio.e_admin_sistema(), consorcio.perfil_modulo(text),
  consorcio.pode_editar_modulo(text), consorcio.meu_perfil(), consorcio.pode_editar(), consorcio.e_admin(),
  consorcio.salvar_acessos(uuid, jsonb) to authenticated;

-- ---------- Módulos novos ------------------------------------------------
-- Cada módulo novo entra com um insert em consorcio.modulos (id igual ao do app, em js/modulos.js)
-- e as tabelas dele usam consorcio.perfil_modulo('<id>') / consorcio.pode_editar_modulo('<id>') nas regras de RLS.
