-- =====================================================================
-- SOFT+ Consórcios | Gestão de Consórcio
-- 12_integracao_site.sql  (reexecutável, schema consorcio, rodar depois do 11)
-- Integração com o site do CIMOP no Portal SOFT+ GOV (mesmo banco, schema public).
--
-- Em "Integração com o site" (administrador do sistema) cada item tem uma chave:
--   entes      -> página "Entes consorciados" do Portal (public.consorcio_entes; PNTP 25.7)
--   pessoas    -> "Gestores" do Portal (public.gestores; PNTP 2.3), só as pessoas com "Mostrar no site"
--   identidade -> nome exibido, endereço, CEP, telefone, WhatsApp, e-mail, horário e brasão (Aparência do Portal)
-- Item ligado: a Gestão controla. Cada gravação aqui atualiza o Portal na hora (já publicado) e o Portal
-- fica só para consulta nesse item (trava no banco). Item desligado: cada sistema cadastra o seu; nada é apagado.
-- A autoavaliação do PNTP continua lendo as tabelas do Portal, que passam a ser abastecidas por aqui.
-- =====================================================================

-- ---------- Dados do CIMOP e ligação com o Portal ---------------------
alter table consorcio.configuracoes add column if not exists portal_orgao_id uuid;
alter table consorcio.configuracoes add column if not exists cnpj text;
alter table consorcio.configuracoes add column if not exists endereco text;
alter table consorcio.configuracoes add column if not exists cep text;
alter table consorcio.configuracoes add column if not exists telefone text;
alter table consorcio.configuracoes add column if not exists whatsapp text;
alter table consorcio.configuracoes add column if not exists email_institucional text;
alter table consorcio.configuracoes add column if not exists horario text;
alter table consorcio.configuracoes add column if not exists logo_url text;

update consorcio.configuracoes c set portal_orgao_id = o.id, cnpj = coalesce(c.cnpj, regexp_replace(o.cnpj, '\D', '', 'g'))
  from public.orgaos o
 where c.id = 1 and c.portal_orgao_id is null and o.tipo = 'consorcio' and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = '15185079000140';

-- Administrador do módulo Cadastro também edita os Dados do CIMOP.
drop policy if exists alterar_cadastro on consorcio.configuracoes;
create policy alterar_cadastro on consorcio.configuracoes for update to authenticated
  using (consorcio.perfil_modulo('consorciados') = 'administrador') with check (consorcio.perfil_modulo('consorciados') = 'administrador');

-- ---------- Campos novos -------------------------------------------------
alter table consorcio.orgaos add column if not exists data_saida date;
alter table consorcio.orgaos add column if not exists portal_ente_id uuid;
do $$ begin
  alter table consorcio.orgaos drop constraint if exists orgaos_saida_check;
  alter table consorcio.orgaos add constraint orgaos_saida_check
    check (situacao_consorcio not in ('retirado','excluido') or data_saida is not null);
end $$;

alter table consorcio.pessoas add column if not exists mostrar_site boolean not null default false;
alter table consorcio.pessoas add column if not exists foto_url text;
alter table consorcio.pessoas add column if not exists curriculo_url text;
alter table consorcio.pessoas add column if not exists destaque_capa boolean not null default false;
alter table consorcio.pessoas add column if not exists ordem_site int not null default 0;
alter table consorcio.pessoas add column if not exists unidade_site_id uuid;     -- unidade do Portal (public.unidades)
alter table consorcio.pessoas add column if not exists portal_gestor_id uuid;

-- ---------- Chaves da integração e erros ---------------------------------
create table if not exists consorcio.integracao (
  item text primary key check (item in ('entes','pessoas','identidade')),
  ativo boolean not null default false,
  ativado_em timestamptz,
  ativado_por_nome text,
  ultimo_envio timestamptz,
  ultimo_resultado jsonb
);
insert into consorcio.integracao (item) values ('entes'), ('pessoas'), ('identidade') on conflict do nothing;

create table if not exists consorcio.integracao_erros (
  item text not null,
  registro uuid not null,
  nome text,
  mensagem text,
  quando timestamptz not null default now(),
  primary key (item, registro)
);

alter table consorcio.integracao enable row level security;
alter table consorcio.integracao_erros enable row level security;
drop policy if exists ler on consorcio.integracao;
create policy ler on consorcio.integracao for select to authenticated using (consorcio.meu_perfil_geral() is not null);
drop policy if exists ler on consorcio.integracao_erros;
create policy ler on consorcio.integracao_erros for select to authenticated using (consorcio.meu_perfil_geral() is not null);
grant select on consorcio.integracao, consorcio.integracao_erros to authenticated;
grant all on consorcio.integracao, consorcio.integracao_erros to service_role;

-- ---------- Funções de apoio ------------------------------------------------
create or replace function consorcio.integracao_ativa(p_item text)
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce((select ativo from consorcio.integracao where item = p_item), false)
$$;
create or replace function consorcio.portal_id()
returns uuid language sql stable security definer set search_path = consorcio, public as $$
  select portal_orgao_id from consorcio.configuracoes where id = 1
$$;
grant execute on function consorcio.integracao_ativa(text), consorcio.portal_id() to anon, authenticated;

-- Endereço público de um arquivo do bucket consorcio-cadastro
create or replace function consorcio.url_cadastro(p_caminho text)
returns text language sql immutable as $$
  select case when p_caminho is null or p_caminho = '' then null
              when p_caminho ~* '^https?://' then p_caminho
              else 'https://gyjfkhyufubtmowgjgrq.supabase.co/storage/v1/object/public/consorcio-cadastro/' || p_caminho end
$$;

create or replace function consorcio.registrar_erro_site(p_item text, p_registro uuid, p_nome text, p_msg text)
returns void language sql security definer set search_path = consorcio, public as $$
  insert into consorcio.integracao_erros (item, registro, nome, mensagem, quando) values (p_item, p_registro, p_nome, p_msg, now())
  on conflict (item, registro) do update set nome = excluded.nome, mensagem = excluded.mensagem, quando = now()
$$;

-- Aviso para o Portal: quais itens estão ligados (o Portal trava as telas por aqui)
create or replace function consorcio.site_marcar_flags()
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id();
begin
  if v_portal is null then return; end if;
  update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || jsonb_build_object('integracao_gestao', jsonb_build_object(
      'entes', consorcio.integracao_ativa('entes'), 'pessoas', consorcio.integracao_ativa('pessoas'), 'identidade', consorcio.integracao_ativa('identidade'),
      'url', 'https://gestao-consorcio.pages.dev/'))
   where id = v_portal;
end $$;

-- ---------- Envio: ente consorciado -> public.consorcio_entes ------------
create or replace function consorcio.site_enviar_ente(p_id uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare
  v_portal uuid := consorcio.portal_id(); o consorcio.orgaos; v_lei consorcio.orgao_leis; v_novo uuid;
  v_sit text; v_cnpj text; v_lei_txt text;
begin
  if v_portal is null then return; end if;
  select * into o from consorcio.orgaos where id = p_id;
  if not found then return; end if;
  begin
    if o.vinculo is distinct from 'consorciado' then
      -- deixou de ser consorciado (ou nunca foi): sai do site
      if o.portal_ente_id is not null then
        delete from public.consorcio_entes where id = o.portal_ente_id;
        update consorcio.orgaos set portal_ente_id = null where id = o.id;
      end if;
      delete from consorcio.integracao_erros where item = 'entes' and registro = o.id;
      return;
    end if;
    if o.uf is null then raise exception 'Falta a UF do ente.'; end if;
    select * into v_lei from consorcio.orgao_leis where orgao_id = o.id and tipo = 'ratificacao' order by data desc nulls last, criado_em desc limit 1;
    v_sit := case o.situacao_consorcio when 'retirado' then 'retirado' when 'excluido' then 'excluido' else 'ativo' end;
    v_cnpj := regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g'); if length(v_cnpj) <> 14 then v_cnpj := null; end if;
    v_lei_txt := case when v_lei.id is not null then left('Lei nº ' || v_lei.numero || coalesce(', de ' || to_char(v_lei.data, 'DD/MM/YYYY'), ''), 200) end;
    if o.portal_ente_id is not null and exists (select 1 from public.consorcio_entes where id = o.portal_ente_id) then
      update public.consorcio_entes set nome = left(o.nome, 200), uf = o.uf, cnpj = v_cnpj,
        tipo_ente = case o.esfera when 'Municipal' then 'municipio' when 'Estadual' then 'estado' when 'Federal' then 'uniao' else 'outro' end,
        lei_ratificacao = v_lei_txt, lei_ratificacao_url = consorcio.url_cadastro(v_lei.arquivo_url),
        data_ingresso = o.data_ingresso, data_saida = case when v_sit = 'ativo' then null else o.data_saida end,
        situacao_ente = v_sit, situacao = 'publicado'
       where id = o.portal_ente_id;
    else
      insert into public.consorcio_entes (orgao_id, nome, tipo_ente, uf, cnpj, lei_ratificacao, lei_ratificacao_url, data_ingresso, data_saida, situacao_ente, situacao)
      values (v_portal, left(o.nome, 200), case o.esfera when 'Municipal' then 'municipio' when 'Estadual' then 'estado' when 'Federal' then 'uniao' else 'outro' end,
        o.uf, v_cnpj, v_lei_txt, consorcio.url_cadastro(v_lei.arquivo_url), o.data_ingresso, case when v_sit = 'ativo' then null else o.data_saida end, v_sit, 'publicado')
      returning id into v_novo;
      update consorcio.orgaos set portal_ente_id = v_novo where id = o.id;
    end if;
    delete from consorcio.integracao_erros where item = 'entes' and registro = o.id;
  exception when others then
    perform consorcio.registrar_erro_site('entes', o.id, o.nome,
      case when sqlerrm ~ 'consorcio_documentos' then 'O ente tem contrato de rateio ou de programa no site e não pode sair da lista. Mantenha-o como consorciado (retirado ou excluído, com a data de saída).' else sqlerrm end);
  end;
end $$;

-- ---------- Envio: pessoa do CIMOP -> public.gestores ----------------------
create or replace function consorcio.site_enviar_pessoa(p_id uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); p consorcio.pessoas; v_novo uuid; v_unid uuid;
begin
  if v_portal is null then return; end if;
  select * into p from consorcio.pessoas where id = p_id;
  if not found then return; end if;
  begin
    if not p.mostrar_site then
      if p.portal_gestor_id is not null then
        delete from public.gestores where id = p.portal_gestor_id;
        update consorcio.pessoas set portal_gestor_id = null where id = p.id;
      end if;
      delete from consorcio.integracao_erros where item = 'pessoas' and registro = p.id;
      return;
    end if;
    select id into v_unid from public.unidades where id = p.unidade_site_id and orgao_id = v_portal;
    if p.portal_gestor_id is not null and exists (select 1 from public.gestores where id = p.portal_gestor_id) then
      update public.gestores set nome = p.nome, cargo = p.cargo, email = p.email, telefone = p.whatsapp, unidade_id = v_unid,
        foto_url = consorcio.url_cadastro(p.foto_url), curriculo_url = consorcio.url_cadastro(p.curriculo_url),
        destaque_capa = p.destaque_capa, ordem = p.ordem_site, ativo = p.ativo
       where id = p.portal_gestor_id;
    else
      insert into public.gestores (orgao_id, unidade_id, nome, cargo, email, telefone, foto_url, curriculo_url, destaque_capa, ordem, ativo)
      values (v_portal, v_unid, p.nome, p.cargo, p.email, p.whatsapp, consorcio.url_cadastro(p.foto_url), consorcio.url_cadastro(p.curriculo_url),
        p.destaque_capa, p.ordem_site, p.ativo)
      returning id into v_novo;
      update consorcio.pessoas set portal_gestor_id = v_novo where id = p.id;
    end if;
    delete from consorcio.integracao_erros where item = 'pessoas' and registro = p.id;
  exception when others then
    perform consorcio.registrar_erro_site('pessoas', p.id, p.nome, sqlerrm);
  end;
end $$;

-- ---------- Envio: Dados do CIMOP -> Aparência do Portal ----------------
create or replace function consorcio.site_enviar_identidade()
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); c consorcio.configuracoes;
begin
  if v_portal is null then return; end if;
  select * into c from consorcio.configuracoes where id = 1;
  begin
    update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || jsonb_build_object(
        'nome_exibicao', c.orgao_nome, 'endereco', coalesce(c.endereco, ''), 'cep', coalesce(c.cep, ''), 'telefone', coalesce(c.telefone, ''),
        'whatsapp', coalesce(c.whatsapp, ''), 'email', coalesce(c.email_institucional, ''), 'horario', coalesce(c.horario, ''),
        'brasao_url', consorcio.url_cadastro(c.logo_url))
     where id = v_portal;
    delete from consorcio.integracao_erros where item = 'identidade';
  exception when others then
    perform consorcio.registrar_erro_site('identidade', '00000000-0000-0000-0000-000000000001'::uuid, 'Dados do CIMOP', sqlerrm);
  end;
end $$;

revoke all on function consorcio.site_enviar_ente(uuid), consorcio.site_enviar_pessoa(uuid), consorcio.site_enviar_identidade(),
  consorcio.site_marcar_flags(), consorcio.registrar_erro_site(text, uuid, text, text) from public, anon, authenticated;

-- ---------- Gatilhos: gravou na Gestão -> atualiza o site ------------------
create or replace function consorcio.gatilho_site()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if tg_table_name = 'orgaos' then
    if not consorcio.integracao_ativa('entes') then return null; end if;
    -- só a ligação com o site mudou: não reenviar (evita repetição)
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'portal_ente_id' - 'atualizado_em') = (to_jsonb(old) - 'portal_ente_id' - 'atualizado_em') then return null; end if;
    perform consorcio.site_enviar_ente(new.id);
  elsif tg_table_name = 'orgao_leis' then
    if not consorcio.integracao_ativa('entes') then return null; end if;
    perform consorcio.site_enviar_ente(coalesce(new.orgao_id, old.orgao_id));
  elsif tg_table_name = 'pessoas' then
    if not consorcio.integracao_ativa('pessoas') then return null; end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'portal_gestor_id') = (to_jsonb(old) - 'portal_gestor_id') then return null; end if;
    perform consorcio.site_enviar_pessoa(new.id);
  elsif tg_table_name = 'configuracoes' then
    if consorcio.integracao_ativa('identidade') then perform consorcio.site_enviar_identidade(); end if;
  end if;
  return null;
end $$;

drop trigger if exists site_orgaos on consorcio.orgaos;
create trigger site_orgaos after insert or update on consorcio.orgaos for each row execute function consorcio.gatilho_site();
drop trigger if exists site_leis on consorcio.orgao_leis;
create trigger site_leis after insert or update or delete on consorcio.orgao_leis for each row execute function consorcio.gatilho_site();
drop trigger if exists site_pessoas on consorcio.pessoas;
create trigger site_pessoas after insert or update on consorcio.pessoas for each row execute function consorcio.gatilho_site();
drop trigger if exists site_configuracoes on consorcio.configuracoes;
create trigger site_configuracoes after update on consorcio.configuracoes for each row execute function consorcio.gatilho_site();

-- ---------- Travas no Portal (só para quem usa o Portal; a Gestão grava como dona) ----
-- Sem security definer de propósito: current_user diz se quem grava é um usuário do Portal.
create or replace function consorcio.travar_portal()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
declare v_org uuid; v_item text := tg_argv[0]; v_mudou boolean := false; k text;
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  if tg_table_name = 'orgaos' then
    -- a marcação da integração só muda pela Gestão
    if (new.configuracoes -> 'integracao_gestao') is distinct from (old.configuracoes -> 'integracao_gestao') then
      raise exception 'A integração com a Gestão de Consórcio só é ligada ou desligada na própria Gestão de Consórcio.';
    end if;
    if new.id is distinct from consorcio.portal_id() or not consorcio.integracao_ativa('identidade') then return new; end if;
    foreach k in array array['nome_exibicao','endereco','cep','telefone','whatsapp','email','horario','brasao_url'] loop
      if coalesce(new.configuracoes ->> k, '') <> coalesce(old.configuracoes ->> k, '') then v_mudou := true; end if;
    end loop;
    if v_mudou then
      raise exception 'Nome, endereço, contatos, horário e brasão do CIMOP são controlados pela Gestão de Consórcio (Cadastro › Dados do CIMOP). Altere lá.';
    end if;
    return new;
  end if;
  v_org := coalesce(new.orgao_id, old.orgao_id);
  if v_org = consorcio.portal_id() and consorcio.integracao_ativa(v_item) then
    raise exception '%', case v_item when 'entes' then 'Os entes consorciados do CIMOP são controlados pela Gestão de Consórcio (Cadastro de Consorciados). Altere lá.'
      else 'Os gestores do CIMOP são controlados pela Gestão de Consórcio (Cadastro › Pessoas do CIMOP). Altere lá.' end;
  end if;
  return coalesce(new, old);
end $$;
grant execute on function consorcio.travar_portal() to anon, authenticated;

drop trigger if exists travar_gestao_consorcio on public.consorcio_entes;
create trigger travar_gestao_consorcio before insert or update or delete on public.consorcio_entes
  for each row execute function consorcio.travar_portal('entes');
drop trigger if exists travar_gestao_consorcio on public.gestores;
create trigger travar_gestao_consorcio before insert or update or delete on public.gestores
  for each row execute function consorcio.travar_portal('pessoas');
drop trigger if exists travar_gestao_consorcio on public.orgaos;
create trigger travar_gestao_consorcio before update on public.orgaos
  for each row execute function consorcio.travar_portal('identidade');

-- ---------- Para a tela: unidades do site (para ligar a pessoa a uma unidade) ----
create or replace function consorcio.site_unidades()
returns table (id uuid, nome text) language sql stable security definer set search_path = consorcio, public as $$
  select u.id, u.nome from public.unidades u where u.orgao_id = consorcio.portal_id() and u.ativo and consorcio.meu_perfil_geral() is not null order by u.nome
$$;
grant execute on function consorcio.site_unidades() to authenticated;

-- ---------- Conferência antes de ligar ------------------------------------------
-- Mostra o que já existe no Portal e como ficaria ligado ao que está na Gestão.
create or replace function consorcio.integracao_conferir(p_item text)
returns jsonb language plpgsql stable security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); r jsonb; c consorcio.configuracoes; cfg jsonb;
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema liga a integração.'; end if;
  if v_portal is null then raise exception 'O CIMOP não foi encontrado no Portal (órgão do tipo consórcio com o CNPJ do CIMOP).'; end if;
  if p_item = 'entes' then
    select jsonb_build_object(
      'site', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'uf', e.uf, 'cnpj', e.cnpj, 'situacao_ente', e.situacao_ente,
          'par', (select jsonb_build_object('id', o.id, 'nome', o.nome) from consorcio.orgaos o
                   where (o.id = (select x.id from consorcio.orgaos x where x.portal_ente_id = e.id limit 1))
                      or (e.cnpj is not null and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = e.cnpj)
                      or (public.normalizar_texto(o.nome) = public.normalizar_texto(e.nome) and o.uf = e.uf)
                   order by (o.portal_ente_id = e.id) desc nulls last limit 1)) order by e.nome)
        from public.consorcio_entes e where e.orgao_id = v_portal), '[]'),
      'gestao', (select count(*) from consorcio.orgaos where vinculo = 'consorciado'),
      'a_definir', (select count(*) from consorcio.orgaos where vinculo is null)) into r;
  elsif p_item = 'pessoas' then
    select jsonb_build_object(
      'site', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome, 'cargo', g.cargo,
          'par', (select jsonb_build_object('id', p.id, 'nome', p.nome) from consorcio.pessoas p
                   where p.portal_gestor_id = g.id or public.normalizar_texto(p.nome) = public.normalizar_texto(g.nome)
                   order by (p.portal_gestor_id = g.id) desc nulls last limit 1)) order by g.nome)
        from public.gestores g where g.orgao_id = v_portal), '[]'),
      'gestao', (select count(*) from consorcio.pessoas where mostrar_site)) into r;
  elsif p_item = 'identidade' then
    select * into c from consorcio.configuracoes where id = 1;
    select configuracoes into cfg from public.orgaos where id = v_portal;
    r := jsonb_build_object('site', jsonb_build_object('nome_exibicao', cfg->>'nome_exibicao', 'endereco', cfg->>'endereco', 'cep', cfg->>'cep', 'telefone', cfg->>'telefone',
        'whatsapp', cfg->>'whatsapp', 'email', cfg->>'email', 'horario', cfg->>'horario', 'brasao_url', cfg->>'brasao_url'),
      'gestao', jsonb_build_object('nome_exibicao', c.orgao_nome, 'endereco', c.endereco, 'cep', c.cep, 'telefone', c.telefone, 'whatsapp', c.whatsapp,
        'email', c.email_institucional, 'horario', c.horario, 'brasao_url', consorcio.url_cadastro(c.logo_url)));
  else raise exception 'Item desconhecido: %', p_item;
  end if;
  return r;
end $$;

-- ---------- Ligar / desligar / enviar tudo -----------------------------------------
-- p_sem_par: o que fazer com o que está no site e não tem par na Gestão: 'trazer' (cria na Gestão) ou 'apagar'.
create or replace function consorcio.integracao_ligar(p_item text, p_sem_par text default 'trazer')
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); e record; g record; v_par uuid; v_trazidos int := 0; v_apagados int := 0; v_ligados int := 0;
  cfg jsonb;
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema liga a integração.'; end if;
  if v_portal is null then raise exception 'O CIMOP não foi encontrado no Portal.'; end if;
  if p_sem_par not in ('trazer','apagar') then raise exception 'Opção inválida.'; end if;
  if p_item = 'entes' then
    for e in select * from public.consorcio_entes where orgao_id = v_portal loop
      v_par := null;
      select o.id into v_par from consorcio.orgaos o
       where o.portal_ente_id = e.id or (e.cnpj is not null and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = e.cnpj)
          or (public.normalizar_texto(o.nome) = public.normalizar_texto(e.nome) and o.uf = e.uf)
       order by (o.portal_ente_id = e.id) desc nulls last limit 1;
      if v_par is not null then
        -- completa na Gestão o que só o site tinha
        update consorcio.orgaos set portal_ente_id = e.id, vinculo = 'consorciado',
          data_ingresso = coalesce(data_ingresso, e.data_ingresso), data_saida = coalesce(data_saida, e.data_saida),
          situacao_consorcio = case when e.situacao_ente in ('retirado','excluido') and situacao_consorcio = 'ativo' then e.situacao_ente else situacao_consorcio end
         where id = v_par;
        v_ligados := v_ligados + 1;
      elsif p_sem_par = 'trazer' then
        insert into consorcio.orgaos (nome, cnpj, uf, esfera, vinculo, situacao_consorcio, data_ingresso, data_saida, portal_ente_id)
        values (e.nome, e.cnpj, e.uf, case e.tipo_ente when 'municipio' then 'Municipal' when 'estado' then 'Estadual' when 'uniao' then 'Federal' else 'Outro' end,
          'consorciado', e.situacao_ente, e.data_ingresso, e.data_saida, e.id) returning id into v_par;
        if e.lei_ratificacao is not null then
          insert into consorcio.orgao_leis (orgao_id, tipo, numero, arquivo_url)
          values (v_par, 'ratificacao', regexp_replace(e.lei_ratificacao, '^\s*lei\s*(n[º°o.]*)?\s*', '', 'i'), e.lei_ratificacao_url);
        end if;
        v_trazidos := v_trazidos + 1;
      else
        begin delete from public.consorcio_entes where id = e.id; v_apagados := v_apagados + 1;
        exception when others then null; end;   -- com contrato ligado: fica
      end if;
    end loop;
  elsif p_item = 'pessoas' then
    for g in select * from public.gestores where orgao_id = v_portal loop
      v_par := null;
      select p.id into v_par from consorcio.pessoas p where p.portal_gestor_id = g.id or public.normalizar_texto(p.nome) = public.normalizar_texto(g.nome)
       order by (p.portal_gestor_id = g.id) desc nulls last limit 1;
      if v_par is not null then
        update consorcio.pessoas set portal_gestor_id = g.id, mostrar_site = true,
          foto_url = coalesce(foto_url, g.foto_url), curriculo_url = coalesce(curriculo_url, g.curriculo_url),
          email = coalesce(email, g.email), whatsapp = coalesce(whatsapp, g.telefone), unidade_site_id = coalesce(unidade_site_id, g.unidade_id),
          destaque_capa = g.destaque_capa, ordem_site = g.ordem
         where id = v_par;
        v_ligados := v_ligados + 1;
      elsif p_sem_par = 'trazer' then
        insert into consorcio.pessoas (nome, cargo, email, whatsapp, foto_url, curriculo_url, destaque_capa, ordem_site, unidade_site_id, ativo, mostrar_site, assina_documentos, portal_gestor_id)
        values (g.nome, g.cargo, g.email, g.telefone, g.foto_url, g.curriculo_url, g.destaque_capa, g.ordem, g.unidade_id, g.ativo, true, false, g.id);
        v_trazidos := v_trazidos + 1;
      else
        delete from public.gestores where id = g.id; v_apagados := v_apagados + 1;
      end if;
    end loop;
  elsif p_item = 'identidade' then
    -- o que a Gestão ainda não tem vem do site (nada se perde)
    select configuracoes into cfg from public.orgaos where id = v_portal;
    update consorcio.configuracoes set
      endereco = coalesce(nullif(endereco, ''), nullif(cfg->>'endereco', '')), cep = coalesce(nullif(cep, ''), nullif(cfg->>'cep', '')),
      telefone = coalesce(nullif(telefone, ''), nullif(cfg->>'telefone', '')), whatsapp = coalesce(nullif(whatsapp, ''), nullif(cfg->>'whatsapp', '')),
      email_institucional = coalesce(nullif(email_institucional, ''), nullif(cfg->>'email', '')), horario = coalesce(nullif(horario, ''), nullif(cfg->>'horario', '')),
      logo_url = coalesce(nullif(logo_url, ''), nullif(cfg->>'brasao_url', ''))
     where id = 1;
  else raise exception 'Item desconhecido: %', p_item;
  end if;
  update consorcio.integracao set ativo = true, ativado_em = now(), ativado_por_nome = (select nome from consorcio.usuarios where id = auth.uid()) where item = p_item;
  perform consorcio.site_marcar_flags();
  return consorcio.integracao_enviar_tudo(p_item) || jsonb_build_object('ligados', v_ligados, 'trazidos', v_trazidos, 'apagados', v_apagados);
end $$;

create or replace function consorcio.integracao_enviar_tudo(p_item text)
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
declare v_id uuid; n int := 0; r jsonb;
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema envia a integração.'; end if;
  if not consorcio.integracao_ativa(p_item) then raise exception 'Este item não está integrado.'; end if;
  if p_item = 'entes' then
    for v_id in select id from consorcio.orgaos where vinculo = 'consorciado' or portal_ente_id is not null loop perform consorcio.site_enviar_ente(v_id); n := n + 1; end loop;
  elsif p_item = 'pessoas' then
    for v_id in select id from consorcio.pessoas where mostrar_site or portal_gestor_id is not null loop perform consorcio.site_enviar_pessoa(v_id); n := n + 1; end loop;
  else perform consorcio.site_enviar_identidade(); n := 1;
  end if;
  r := jsonb_build_object('enviados', n, 'erros', (select count(*) from consorcio.integracao_erros where item = p_item));
  update consorcio.integracao set ultimo_envio = now(), ultimo_resultado = r where item = p_item;
  return r;
end $$;

create or replace function consorcio.integracao_desligar(p_item text)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.e_admin_sistema() then raise exception 'Só o administrador do sistema desliga a integração.'; end if;
  update consorcio.integracao set ativo = false where item = p_item;
  delete from consorcio.integracao_erros where item = p_item;
  perform consorcio.site_marcar_flags();
end $$;

grant execute on function consorcio.integracao_conferir(text), consorcio.integracao_ligar(text, text), consorcio.integracao_enviar_tudo(text),
  consorcio.integracao_desligar(text) to authenticated;

select consorcio.site_marcar_flags();
