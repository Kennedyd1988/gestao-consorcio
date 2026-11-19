-- =====================================================================
-- SOFT+ Consórcios | Gestão de Consórcio
-- 11_consorciados.sql  (reexecutável, schema consorcio, rodar depois do 10)
-- Módulo "Cadastro de Consorciados": cadastro único dos entes, base de todos os módulos.
--
--   * O ente continua sendo uma linha de consorcio.orgaos (a mesma tabela das Adesões; nada é duplicado).
--   * Ganha: situação no consórcio, endereço, WhatsApp, site, brasão e timbre, leis ratificadoras,
--     gestores com mandato e histórico, contatos por área.
--   * Pessoas do CIMOP: quem é do próprio consórcio (Presidente, Diretor Executivo, agente de contratação…),
--     para ser ligado a qualquer módulo (signatário do edital da IRP, Presidente do ofício das adesões…).
--   * Só o módulo Cadastro edita o ente. Os outros módulos só completam campos vazios
--     (ex.: CNPJ vindo do PNCP) e, quando precisam de um ente novo, ele entra como "pendente de confirmação".
-- =====================================================================

-- ---------- Módulo -------------------------------------------------------
insert into consorcio.modulos (id, nome, descricao, ordem) values
  ('consorciados', 'Cadastro de Consorciados', 'Cadastro único dos entes: situação no consórcio, lei ratificadora, gestores, contatos e timbre. Também as pessoas do CIMOP.', 5)
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;

create or replace function consorcio.pode_editar_cadastro()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.pode_editar_modulo('consorciados')
$$;

-- ---------- Ente: campos novos em orgaos ---------------------------------
alter table consorcio.orgaos add column if not exists sigla text;
alter table consorcio.orgaos add column if not exists vinculo text;                -- consorciado | nao_consorciado | cooperado (vazio = a definir)
alter table consorcio.orgaos add column if not exists situacao_consorcio text not null default 'ativo';
alter table consorcio.orgaos add column if not exists data_ingresso date;
alter table consorcio.orgaos add column if not exists endereco text;
alter table consorcio.orgaos add column if not exists bairro text;
alter table consorcio.orgaos add column if not exists cep text;
alter table consorcio.orgaos add column if not exists whatsapp text;
alter table consorcio.orgaos add column if not exists site text;
alter table consorcio.orgaos add column if not exists brasao_url text;             -- caminho no bucket consorcio-cadastro
alter table consorcio.orgaos add column if not exists timbre_cabecalho_url text;
alter table consorcio.orgaos add column if not exists timbre_rodape_url text;
alter table consorcio.orgaos add column if not exists pendente boolean not null default false;
alter table consorcio.orgaos add column if not exists pendente_origem text;        -- de onde veio o ente pendente
alter table consorcio.orgaos add column if not exists observacoes text;
alter table consorcio.orgaos add column if not exists atualizado_em timestamptz;

do $$ begin
  alter table consorcio.orgaos drop constraint if exists orgaos_vinculo_check;
  alter table consorcio.orgaos add constraint orgaos_vinculo_check check (vinculo is null or vinculo in ('consorciado','nao_consorciado','cooperado'));
  alter table consorcio.orgaos drop constraint if exists orgaos_situacao_consorcio_check;
  alter table consorcio.orgaos add constraint orgaos_situacao_consorcio_check check (situacao_consorcio in ('ativo','suspenso','retirado','excluido'));
end $$;

-- ---------- Leis (ratificação do protocolo de intenções e alterações) ---
create table if not exists consorcio.orgao_leis (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references consorcio.orgaos(id) on delete no action,
  tipo text not null default 'ratificacao' check (tipo in ('ratificacao','alteracao','retirada','outra')),
  numero text not null,                      -- ex.: 1.234/2021
  data date,
  ementa text,
  arquivo_url text,                          -- PDF no bucket consorcio-cadastro
  criado_em timestamptz not null default now()
);
create index if not exists orgao_leis_orgao on consorcio.orgao_leis(orgao_id);

-- ---------- Gestores (titular e vice), com mandato e histórico ----------
create table if not exists consorcio.orgao_gestores (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references consorcio.orgaos(id) on delete no action,
  funcao text not null default 'titular' check (funcao in ('titular','vice')),
  nome text not null,
  cpf text,                                  -- só números; exibido mascarado
  cargo text,                                -- ex.: Prefeito Municipal
  tratamento text default 'Ao Senhor',
  vocativo text,
  mandato_inicio date,
  mandato_fim date,
  email text,
  whatsapp text,
  atual boolean not null default true,       -- o atual de cada função; os antigos ficam como histórico
  criado_em timestamptz not null default now()
);
create index if not exists orgao_gestores_orgao on consorcio.orgao_gestores(orgao_id);
create unique index if not exists orgao_gestores_um_atual on consorcio.orgao_gestores(orgao_id, funcao) where atual;

-- ---------- Contatos por área -------------------------------------------
create table if not exists consorcio.orgao_contatos (
  id uuid primary key default gen_random_uuid(),
  orgao_id uuid not null references consorcio.orgaos(id) on delete no action,
  area text not null,                        -- Licitação, Educação, Saúde…
  nome text,
  cargo text,
  email text,
  whatsapp text,
  telefone text,
  recebe_avisos boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists orgao_contatos_orgao on consorcio.orgao_contatos(orgao_id);

-- ---------- Pessoas do CIMOP ---------------------------------------------
create table if not exists consorcio.pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf text,
  cargo text not null,                       -- Presidente, Diretor Executivo, Agente de Contratação…
  ato_numero text,                           -- ato de nomeação/eleição
  ato_data date,
  ato_url text,
  inicio date,
  fim date,
  email text,
  whatsapp text,
  assina_documentos boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Primeiro registro: o Presidente que já está nas configurações do ofício.
insert into consorcio.pessoas (nome, cargo)
  select c.presidente_nome, 'Presidente' from consorcio.configuracoes c
   where c.id = 1 and coalesce(trim(c.presidente_nome), '') <> ''
     and not exists (select 1 from consorcio.pessoas p where p.cargo = 'Presidente');

-- ---------- Gestor atual -> campos do destinatário do ofício -------------
-- O ofício das adesões usa orgaos.responsavel/cargo/tratamento/vocativo. O titular atual copia para lá.
create or replace function consorcio.sincronizar_gestor()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if new.atual and new.funcao = 'titular' then
    update consorcio.orgaos set responsavel = new.nome, cargo = coalesce(new.cargo, cargo),
           tratamento = coalesce(new.tratamento, tratamento), vocativo = new.vocativo
     where id = new.orgao_id;
  end if;
  return new;
end $$;
drop trigger if exists sincronizar_gestor on consorcio.orgao_gestores;
-- before: desmarca o antigo antes de o índice "um atual" conferir o novo
create or replace function consorcio.desmarcar_gestor_antigo()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if new.atual then
    update consorcio.orgao_gestores set atual = false
     where orgao_id = new.orgao_id and funcao = new.funcao and atual and id <> new.id;
  end if;
  return new;
end $$;
drop trigger if exists desmarcar_gestor_antigo on consorcio.orgao_gestores;
create trigger desmarcar_gestor_antigo before insert or update on consorcio.orgao_gestores
  for each row execute function consorcio.desmarcar_gestor_antigo();
create trigger sincronizar_gestor after insert or update on consorcio.orgao_gestores
  for each row execute function consorcio.sincronizar_gestor();

-- Gestor atual que já existe hoje (responsavel do órgão) vira o primeiro registro do histórico.
insert into consorcio.orgao_gestores (orgao_id, funcao, nome, cargo, tratamento, vocativo, atual)
  select o.id, 'titular', o.responsavel, o.cargo, o.tratamento, o.vocativo, true from consorcio.orgaos o
   where coalesce(trim(o.responsavel), '') <> ''
     and not exists (select 1 from consorcio.orgao_gestores g where g.orgao_id = o.id and g.funcao = 'titular');

-- ---------- Proteção: só o Cadastro edita o ente ------------------------
-- Quem não é do módulo Cadastro (ex.: Adesões) só completa campos vazios e cria ente "pendente".
create or replace function consorcio.proteger_orgao()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
declare v_novo jsonb; v_velho jsonb; k text;
begin
  if current_user not in ('anon', 'authenticated') or consorcio.pode_editar_cadastro() then
    new.atualizado_em := now();
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pendente := true;
    new.pendente_origem := coalesce(new.pendente_origem, 'Controle de Adesões');
    return new;
  end if;
  -- UPDATE: mantém tudo o que já estava preenchido; aceita só o que estava vazio.
  v_novo := to_jsonb(new); v_velho := to_jsonb(old);
  for k in select jsonb_object_keys(v_velho) loop
    if v_velho->k is not null and v_velho->>k <> '' then v_novo := jsonb_set(v_novo, array[k], v_velho->k); end if;
  end loop;
  new := jsonb_populate_record(null::consorcio.orgaos, v_novo);
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists proteger_orgao on consorcio.orgaos;
create trigger proteger_orgao before insert or update on consorcio.orgaos
  for each row execute function consorcio.proteger_orgao();

-- ---------- Histórico ------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['orgao_leis','orgao_gestores','orgao_contatos','pessoas'] loop
    execute format('drop trigger if exists hist_%1$s on consorcio.%1$s', t);
    execute format('create trigger hist_%1$s after insert or update or delete on consorcio.%1$s for each row execute function consorcio.registrar_historico()', t);
  end loop;
end $$;

-- ---------- RLS --------------------------------------------------------------
-- Órgãos: qualquer usuário ativo lê (todos os módulos usam); escreve o Cadastro, e as Adesões
-- só do jeito limitado acima.
drop policy if exists ler on consorcio.orgaos;
create policy ler on consorcio.orgaos for select to authenticated using (consorcio.meu_perfil_geral() is not null);
drop policy if exists inserir on consorcio.orgaos;
create policy inserir on consorcio.orgaos for insert to authenticated with check (consorcio.pode_editar_cadastro() or consorcio.pode_editar());
drop policy if exists alterar on consorcio.orgaos;
create policy alterar on consorcio.orgaos for update to authenticated
  using (consorcio.pode_editar_cadastro() or consorcio.pode_editar()) with check (consorcio.pode_editar_cadastro() or consorcio.pode_editar());

do $$ declare t text; begin
  foreach t in array array['orgao_leis','orgao_gestores','orgao_contatos','pessoas'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.meu_perfil_geral() is not null)', t);
    execute format('drop policy if exists inserir on consorcio.%I', t);
    execute format('create policy inserir on consorcio.%I for insert to authenticated with check (consorcio.pode_editar_cadastro())', t);
    execute format('drop policy if exists alterar on consorcio.%I', t);
    execute format('create policy alterar on consorcio.%I for update to authenticated using (consorcio.pode_editar_cadastro()) with check (consorcio.pode_editar_cadastro())', t);
  end loop;
  -- Peças internas do ente podem ser excluídas (as pessoas do CIMOP não: são desativadas).
  foreach t in array array['orgao_leis','orgao_gestores','orgao_contatos'] loop
    execute format('drop policy if exists excluir on consorcio.%I', t);
    execute format('create policy excluir on consorcio.%I for delete to authenticated using (consorcio.pode_editar_cadastro())', t);
  end loop;
end $$;

grant select, insert, update, delete on consorcio.orgao_leis, consorcio.orgao_gestores, consorcio.orgao_contatos to authenticated;
grant select, insert, update on consorcio.pessoas to authenticated;
grant all on consorcio.orgao_leis, consorcio.orgao_gestores, consorcio.orgao_contatos, consorcio.pessoas to service_role;
grant execute on function consorcio.pode_editar_cadastro() to authenticated;

-- ---------- Arquivos do cadastro (brasão, timbre, leis, atos) -------------
-- Leitura pública: são documentos públicos e o timbre precisa sair no PDF gerado pelo formulário sem login.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consorcio-cadastro', 'consorcio-cadastro', true, 20971520, array['application/pdf','image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "consorcio_cadastro_enviar" on storage.objects;
create policy "consorcio_cadastro_enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'consorcio-cadastro' and consorcio.pode_editar_cadastro());
drop policy if exists "consorcio_cadastro_trocar" on storage.objects;
create policy "consorcio_cadastro_trocar" on storage.objects for update to authenticated
  using (bucket_id = 'consorcio-cadastro' and consorcio.pode_editar_cadastro());
drop policy if exists "consorcio_cadastro_apagar" on storage.objects;
create policy "consorcio_cadastro_apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'consorcio-cadastro' and consorcio.pode_editar_cadastro());
