-- =====================================================================
-- 14 · Módulo Consórcio (dados, timbre, normas e modelos, documentos,
--      pessoas e site) e generalização para qualquer consórcio.
-- Reexecutável. Rodar depois do 13.
-- =====================================================================

-- ---------- Módulo ---------------------------------------------------------
insert into consorcio.modulos (id, nome, descricao, ordem, ativo) values
  ('consorcio', 'Consórcio', 'Dados do consórcio, brasão e timbre, normas e modelos de documentos, documentos constitutivos, atas e orçamento, pessoas e integração com o site.', 2, true)
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;
update consorcio.modulos set descricao = 'Cadastro único dos entes: situação no consórcio, lei ratificadora, gestores, contatos e timbre. Base de todos os módulos.'
 where id = 'consorciados';

-- Quem administra o Cadastro passa a ter o módulo Consórcio com o mesmo perfil
insert into consorcio.usuario_modulos (usuario_id, modulo_id, perfil)
select usuario_id, 'consorcio', perfil from consorcio.usuario_modulos where modulo_id = 'consorciados'
on conflict do nothing;

-- ---------- Configurações: redes, timbre e modelos -------------------------
alter table consorcio.configuracoes alter column resolucao_alteracao drop not null;   -- pode não haver norma que altere
alter table consorcio.configuracoes add column if not exists instagram text;
alter table consorcio.configuracoes add column if not exists facebook text;
alter table consorcio.configuracoes add column if not exists youtube text;
alter table consorcio.configuracoes add column if not exists site_url text;
alter table consorcio.configuracoes add column if not exists timbre_cabecalho_url text;
alter table consorcio.configuracoes add column if not exists timbre_rodape_url text;
alter table consorcio.configuracoes add column if not exists usar_timbre_modelo boolean not null default false;
alter table consorcio.configuracoes add column if not exists modelo_irp_edital text;
alter table consorcio.configuracoes add column if not exists modelo_irp_declaracoes text;
-- O CIMOP já tem o timbre dentro dos modelos em Word (ofício e edital)
update consorcio.configuracoes set usar_timbre_modelo = true where id = 1 and upper(coalesce(sigla, '')) = 'CIMOP' and not usar_timbre_modelo
  and not exists (select 1 from consorcio.configuracoes where id = 1 and timbre_cabecalho_url is not null);

drop policy if exists alterar_consorcio on consorcio.configuracoes;
create policy alterar_consorcio on consorcio.configuracoes for update to authenticated
  using (consorcio.pode_editar_modulo('consorcio')) with check (consorcio.pode_editar_modulo('consorcio'));

-- Pessoas do consórcio: agora no módulo Consórcio (o Cadastro continua podendo, na transição)
drop policy if exists inserir on consorcio.pessoas;
create policy inserir on consorcio.pessoas for insert to authenticated with check (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio'));
drop policy if exists alterar on consorcio.pessoas;
create policy alterar on consorcio.pessoas for update to authenticated
  using (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio'))
  with check (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio'));

-- Arquivos do bucket consorcio-cadastro
drop policy if exists consorcio_cadastro_enviar on storage.objects;
create policy consorcio_cadastro_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'consorcio-cadastro' and (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio')));
drop policy if exists consorcio_cadastro_trocar on storage.objects;
create policy consorcio_cadastro_trocar on storage.objects for update to authenticated
  using (bucket_id = 'consorcio-cadastro' and (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio')));
drop policy if exists consorcio_cadastro_apagar on storage.objects;
create policy consorcio_cadastro_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'consorcio-cadastro' and (consorcio.pode_editar_cadastro() or consorcio.pode_editar_modulo('consorcio')));

-- ---------- Normas do consórcio --------------------------------------------
create table if not exists consorcio.normas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default 'resolucao' check (tipo in ('resolucao','portaria','decreto','lei','estatuto','regimento','outro')),
  titulo text not null check (length(trim(titulo)) >= 3),          -- como é citada: "Resolução CIMOP nº 018/2023"
  numero text,
  data date,
  ementa text,
  arquivo_url text,
  -- papel nos documentos do sistema: 'srp' = regulamento do SRP; 'srp_alteracao' = norma que o altera
  papel text check (papel in ('srp','srp_alteracao')),
  vigente boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists normas_papel_unico on consorcio.normas (papel) where papel is not null;

-- O título da norma com papel vai para as configurações (ofício, textos e IRP usam)
create or replace function consorcio.normas_para_config()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  update consorcio.configuracoes set
    resolucao_srp = coalesce((select titulo from consorcio.normas where papel = 'srp'), resolucao_srp),
    resolucao_alteracao = (select titulo from consorcio.normas where papel = 'srp_alteracao')
   where id = 1;
  return null;
end $$;

-- Carga inicial a partir das configurações atuais
insert into consorcio.normas (tipo, titulo, numero, papel)
select 'resolucao', c.resolucao_srp, substring(c.resolucao_srp from '(\d+/\d{4})'), 'srp'
  from consorcio.configuracoes c where c.id = 1 and nullif(trim(c.resolucao_srp), '') is not null
   and not exists (select 1 from consorcio.normas where papel = 'srp');
insert into consorcio.normas (tipo, titulo, numero, papel)
select 'resolucao', c.resolucao_alteracao, substring(c.resolucao_alteracao from '(\d+/\d{4})'), 'srp_alteracao'
  from consorcio.configuracoes c where c.id = 1 and nullif(trim(c.resolucao_alteracao), '') is not null
   and not exists (select 1 from consorcio.normas where papel = 'srp_alteracao');

-- O gatilho entra depois da carga (senão a 1ª inserção apagaria a norma que altera)
drop trigger if exists normas_config on consorcio.normas;
create trigger normas_config after insert or update or delete on consorcio.normas for each statement execute function consorcio.normas_para_config();

-- ---------- Documentos do consórcio (vão para "Consórcio público" no site) ----
create table if not exists consorcio.documentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('protocolo_intencoes','contrato_consorcio','estatuto','alteracao_estatutaria','contrato_rateio','contrato_programa',
                                     'ata_eleicao','ata_assembleia','orcamento','outros')),
  titulo text not null check (length(trim(titulo)) >= 3),
  numero text,
  exercicio int check (exercicio between 1990 and 2100),
  data date not null default current_date,
  orgao_id uuid references consorcio.orgaos(id),                 -- ente (rateio, programa ou opcional)
  valor numeric(16,2),
  vigencia_inicio date,
  vigencia_fim date,
  descricao text,
  arquivo_url text,
  mostrar_site boolean not null default true,
  portal_documento_id uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio),
  check (tipo not in ('contrato_rateio','orcamento') or exercicio is not null),
  check (tipo not in ('contrato_rateio','contrato_programa') or orgao_id is not null)
);
create index if not exists documentos_tipo on consorcio.documentos (tipo, data desc);

create or replace function consorcio.marcar_atualizado()
returns trigger language plpgsql as $$ begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists normas_atualizado on consorcio.normas;
create trigger normas_atualizado before update on consorcio.normas for each row execute function consorcio.marcar_atualizado();
drop trigger if exists documentos_atualizado on consorcio.documentos;
create trigger documentos_atualizado before update on consorcio.documentos for each row execute function consorcio.marcar_atualizado();

do $$ declare t text; begin
  foreach t in array array['normas','documentos'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.meu_perfil_geral() is not null)', t);
    execute format('drop policy if exists inserir on consorcio.%I', t);
    execute format('create policy inserir on consorcio.%I for insert to authenticated with check (consorcio.pode_editar_modulo(''consorcio''))', t);
    execute format('drop policy if exists alterar on consorcio.%I', t);
    execute format('create policy alterar on consorcio.%I for update to authenticated using (consorcio.pode_editar_modulo(''consorcio'')) with check (consorcio.pode_editar_modulo(''consorcio''))', t);
    execute format('drop policy if exists excluir on consorcio.%I', t);
    execute format('create policy excluir on consorcio.%I for delete to authenticated using (consorcio.perfil_modulo(''consorcio'') = ''administrador'' or consorcio.e_admin_sistema())', t);
    execute format('grant select, insert, update, delete on consorcio.%I to authenticated', t);
    execute format('grant all on consorcio.%I to service_role', t);
  end loop;
end $$;

-- Histórico
drop trigger if exists hist_normas on consorcio.normas;
create trigger hist_normas after insert or update or delete on consorcio.normas for each row execute function consorcio.registrar_historico();
drop trigger if exists hist_documentos on consorcio.documentos;
create trigger hist_documentos after insert or update or delete on consorcio.documentos for each row execute function consorcio.registrar_historico();

-- ---------- Identidade pública (telas públicas e cabeçalho antes do login) ----
create or replace function consorcio.publico_identidade()
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('orgao_nome', orgao_nome, 'sigla', sigla, 'cidade_uf', cidade_uf, 'email', email_institucional, 'telefone', telefone,
    'whatsapp', whatsapp, 'logo_url', consorcio.url_cadastro(logo_url), 'site_url', site_url)
  from consorcio.configuracoes where id = 1
$$;
grant execute on function consorcio.publico_identidade() to anon, authenticated;

-- ---------- Integração: novo item "documentos" -------------------------------
alter table consorcio.integracao drop constraint if exists integracao_item_check;
alter table consorcio.integracao add constraint integracao_item_check check (item in ('entes','pessoas','identidade','documentos'));
insert into consorcio.integracao (item) values ('documentos') on conflict do nothing;

create or replace function consorcio.site_marcar_flags()
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id();
begin
  if v_portal is null then return; end if;
  update public.orgaos set configuracoes = coalesce(configuracoes, '{}'::jsonb) || jsonb_build_object('integracao_gestao', jsonb_build_object(
      'entes', consorcio.integracao_ativa('entes'), 'pessoas', consorcio.integracao_ativa('pessoas'), 'identidade', consorcio.integracao_ativa('identidade'),
      'documentos', consorcio.integracao_ativa('documentos'),
      'sigla', (select sigla from consorcio.configuracoes where id = 1),
      'url', 'https://gestao-consorcio.pages.dev/'))
   where id = v_portal;
end $$;

-- Identidade: também sigla e redes sociais
create or replace function consorcio.site_enviar_identidade()
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); c consorcio.configuracoes;
begin
  if v_portal is null then return; end if;
  select * into c from consorcio.configuracoes where id = 1;
  begin
    update public.orgaos set
      sigla = coalesce(nullif(trim(c.sigla), ''), sigla),
      configuracoes = coalesce(configuracoes, '{}'::jsonb) || jsonb_build_object(
        'nome_exibicao', c.orgao_nome, 'endereco', coalesce(c.endereco, ''), 'cep', coalesce(c.cep, ''), 'telefone', coalesce(c.telefone, ''),
        'whatsapp', coalesce(c.whatsapp, ''), 'email', coalesce(c.email_institucional, ''), 'horario', coalesce(c.horario, ''),
        'brasao_url', consorcio.url_cadastro(c.logo_url),
        'instagram', coalesce(c.instagram, ''), 'facebook', coalesce(c.facebook, ''), 'youtube', coalesce(c.youtube, ''))
     where id = v_portal;
    delete from consorcio.integracao_erros where item = 'identidade';
  exception when others then
    perform consorcio.registrar_erro_site('identidade', '00000000-0000-0000-0000-000000000001'::uuid, 'Dados do consórcio', sqlerrm);
  end;
end $$;

-- Documento -> public.consorcio_documentos
create or replace function consorcio.site_enviar_documento(p_id uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); d consorcio.documentos; v_ente uuid; v_novo uuid; v_arq text;
begin
  if v_portal is null then return; end if;
  select * into d from consorcio.documentos where id = p_id;
  if not found then return; end if;
  begin
    if not d.mostrar_site then
      if d.portal_documento_id is not null then
        delete from public.consorcio_documentos where id = d.portal_documento_id;
        update consorcio.documentos set portal_documento_id = null where id = d.id;
      end if;
      delete from consorcio.integracao_erros where item = 'documentos' and registro = d.id;
      return;
    end if;
    if d.orgao_id is not null then
      select portal_ente_id into v_ente from consorcio.orgaos where id = d.orgao_id;
      if v_ente is null and d.tipo in ('contrato_rateio','contrato_programa') then
        raise exception 'O ente deste contrato ainda não está no site. Ligue a integração dos entes (ou marque o ente como consorciado) e envie de novo.';
      end if;
    end if;
    v_arq := consorcio.url_cadastro(d.arquivo_url);
    if d.portal_documento_id is not null and exists (select 1 from public.consorcio_documentos where id = d.portal_documento_id) then
      update public.consorcio_documentos set tipo = d.tipo, titulo = left(d.titulo, 300), numero = d.numero, exercicio = d.exercicio, data = d.data,
        ente_id = v_ente, valor = d.valor, vigencia_inicio = d.vigencia_inicio, vigencia_fim = d.vigencia_fim, descricao = d.descricao,
        arquivo_url = v_arq, situacao = case when v_arq is null then 'rascunho' else 'publicado' end
       where id = d.portal_documento_id;
    else
      insert into public.consorcio_documentos (orgao_id, tipo, titulo, numero, exercicio, data, ente_id, valor, vigencia_inicio, vigencia_fim, descricao, arquivo_url, situacao)
      values (v_portal, d.tipo, left(d.titulo, 300), d.numero, d.exercicio, d.data, v_ente, d.valor, d.vigencia_inicio, d.vigencia_fim, d.descricao, v_arq,
        case when v_arq is null then 'rascunho' else 'publicado' end)
      returning id into v_novo;
      update consorcio.documentos set portal_documento_id = v_novo where id = d.id;
    end if;
    delete from consorcio.integracao_erros where item = 'documentos' and registro = d.id;
  exception when others then
    perform consorcio.registrar_erro_site('documentos', d.id, d.titulo, sqlerrm);
  end;
end $$;
revoke all on function consorcio.site_enviar_documento(uuid), consorcio.site_enviar_identidade(), consorcio.site_marcar_flags() from public, anon, authenticated;

create or replace function consorcio.gatilho_site_documentos()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.integracao_ativa('documentos') then return null; end if;
  if tg_op = 'DELETE' then
    if old.portal_documento_id is not null then
      begin delete from public.consorcio_documentos where id = old.portal_documento_id; exception when others then null; end;
    end if;
    delete from consorcio.integracao_erros where item = 'documentos' and registro = old.id;
    return null;
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'portal_documento_id' - 'atualizado_em') = (to_jsonb(old) - 'portal_documento_id' - 'atualizado_em') then return null; end if;
  perform consorcio.site_enviar_documento(new.id);
  return null;
end $$;
drop trigger if exists site_documentos on consorcio.documentos;
create trigger site_documentos after insert or update or delete on consorcio.documentos for each row execute function consorcio.gatilho_site_documentos();

-- Quando um ente entra no site, os contratos dele que esperavam vão junto
create or replace function consorcio.gatilho_site()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
declare v_doc uuid;
begin
  if tg_table_name = 'orgaos' then
    if not consorcio.integracao_ativa('entes') then return null; end if;
    if tg_op = 'UPDATE' and (to_jsonb(new) - 'portal_ente_id' - 'atualizado_em') = (to_jsonb(old) - 'portal_ente_id' - 'atualizado_em') then
      if new.portal_ente_id is not null and old.portal_ente_id is null and consorcio.integracao_ativa('documentos') then
        for v_doc in select id from consorcio.documentos where orgao_id = new.id and mostrar_site loop perform consorcio.site_enviar_documento(v_doc); end loop;
      end if;
      return null;
    end if;
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
    if (new.sigla is distinct from old.sigla) then perform consorcio.site_marcar_flags(); end if;
  end if;
  return null;
end $$;

-- ---------- Travas no Portal (com o nome do consórcio nas mensagens) ----------
create or replace function consorcio.travar_portal()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
declare v_org uuid; v_item text := tg_argv[0]; v_mudou boolean := false; k text; v_sig text;
begin
  if current_user not in ('anon', 'authenticated') then return coalesce(new, old); end if;
  v_sig := coalesce(nullif((select configuracoes -> 'integracao_gestao' ->> 'sigla' from public.orgaos where id = consorcio.portal_id()), ''), 'consórcio');
  if tg_table_name = 'orgaos' then
    if (new.configuracoes -> 'integracao_gestao') is distinct from (old.configuracoes -> 'integracao_gestao') then
      raise exception 'A integração com a Gestão de Consórcio só é ligada ou desligada na própria Gestão de Consórcio.';
    end if;
    if new.id is distinct from consorcio.portal_id() or not consorcio.integracao_ativa('identidade') then return new; end if;
    foreach k in array array['nome_exibicao','endereco','cep','telefone','whatsapp','email','horario','brasao_url','instagram','facebook','youtube'] loop
      if coalesce(new.configuracoes ->> k, '') <> coalesce(old.configuracoes ->> k, '') then v_mudou := true; end if;
    end loop;
    if new.sigla is distinct from old.sigla then v_mudou := true; end if;
    if v_mudou then
      raise exception 'Nome, sigla, endereço, contatos, horário, redes sociais e brasão do % são controlados pela Gestão de Consórcio (Consórcio › Dados). Altere lá.', v_sig;
    end if;
    return new;
  end if;
  v_org := coalesce(new.orgao_id, old.orgao_id);
  if v_org = consorcio.portal_id() and consorcio.integracao_ativa(v_item) then
    raise exception '%', case v_item
      when 'entes' then format('Os entes consorciados do %s são controlados pela Gestão de Consórcio (Cadastro de Consorciados). Altere lá.', v_sig)
      when 'documentos' then format('Os documentos do %s (constitutivos, contratos, atas e orçamento) são controlados pela Gestão de Consórcio (Consórcio › Documentos). Altere lá.', v_sig)
      else format('Os gestores do %s são controlados pela Gestão de Consórcio (Consórcio › Pessoas). Altere lá.', v_sig) end;
  end if;
  return coalesce(new, old);
end $$;
grant execute on function consorcio.travar_portal() to anon, authenticated;

drop trigger if exists travar_gestao_consorcio on public.consorcio_documentos;
create trigger travar_gestao_consorcio before insert or update or delete on public.consorcio_documentos
  for each row execute function consorcio.travar_portal('documentos');

-- ---------- Conferir / ligar / enviar: com "documentos" ------------------------
create or replace function consorcio.pode_integrar()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.e_admin_sistema() or consorcio.perfil_modulo('consorcio') = 'administrador'
$$;
grant execute on function consorcio.pode_integrar() to authenticated;

create or replace function consorcio.integracao_conferir(p_item text)
returns jsonb language plpgsql stable security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); r jsonb; c consorcio.configuracoes; cfg jsonb;
begin
  if not consorcio.pode_integrar() then raise exception 'Só o administrador do módulo Consórcio liga a integração.'; end if;
  if v_portal is null then raise exception 'Escolha antes, em Consórcio › Site, qual órgão do Portal é este consórcio.'; end if;
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
  elsif p_item = 'documentos' then
    select jsonb_build_object(
      'site', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.titulo, 'tipo', s.tipo, 'data', s.data,
          'par', (select jsonb_build_object('id', d.id, 'nome', d.titulo) from consorcio.documentos d
                   where d.portal_documento_id = s.id
                      or (d.tipo = s.tipo and public.normalizar_texto(d.titulo) = public.normalizar_texto(s.titulo))
                      or (d.tipo = s.tipo and d.numero is not null and d.numero = s.numero and d.data = s.data)
                   order by (d.portal_documento_id = s.id) desc nulls last limit 1)) order by s.data desc)
        from public.consorcio_documentos s where s.orgao_id = v_portal), '[]'),
      'gestao', (select count(*) from consorcio.documentos where mostrar_site)) into r;
  elsif p_item = 'identidade' then
    select * into c from consorcio.configuracoes where id = 1;
    select configuracoes into cfg from public.orgaos where id = v_portal;
    r := jsonb_build_object('site', jsonb_build_object('nome_exibicao', cfg->>'nome_exibicao', 'endereco', cfg->>'endereco', 'cep', cfg->>'cep', 'telefone', cfg->>'telefone',
        'whatsapp', cfg->>'whatsapp', 'email', cfg->>'email', 'horario', cfg->>'horario', 'brasao_url', cfg->>'brasao_url',
        'instagram', cfg->>'instagram', 'facebook', cfg->>'facebook', 'youtube', cfg->>'youtube'),
      'gestao', jsonb_build_object('nome_exibicao', c.orgao_nome, 'endereco', c.endereco, 'cep', c.cep, 'telefone', c.telefone, 'whatsapp', c.whatsapp,
        'email', c.email_institucional, 'horario', c.horario, 'brasao_url', consorcio.url_cadastro(c.logo_url),
        'instagram', c.instagram, 'facebook', c.facebook, 'youtube', c.youtube));
  else raise exception 'Item desconhecido: %', p_item;
  end if;
  return r;
end $$;

create or replace function consorcio.integracao_ligar(p_item text, p_sem_par text default 'trazer')
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
declare v_portal uuid := consorcio.portal_id(); e record; g record; s record; v_par uuid; v_ente uuid;
  v_trazidos int := 0; v_apagados int := 0; v_ligados int := 0; cfg jsonb;
begin
  if not consorcio.pode_integrar() then raise exception 'Só o administrador do módulo Consórcio liga a integração.'; end if;
  if v_portal is null then raise exception 'Escolha antes, em Consórcio › Site, qual órgão do Portal é este consórcio.'; end if;
  if p_sem_par not in ('trazer','apagar') then raise exception 'Opção inválida.'; end if;
  if p_item = 'entes' then
    for e in select * from public.consorcio_entes where orgao_id = v_portal loop
      v_par := null;
      select o.id into v_par from consorcio.orgaos o
       where o.portal_ente_id = e.id or (e.cnpj is not null and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = e.cnpj)
          or (public.normalizar_texto(o.nome) = public.normalizar_texto(e.nome) and o.uf = e.uf)
       order by (o.portal_ente_id = e.id) desc nulls last limit 1;
      if v_par is not null then
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
        exception when others then null; end;
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
  elsif p_item = 'documentos' then
    for s in select * from public.consorcio_documentos where orgao_id = v_portal loop
      v_par := null; v_ente := null;
      select d.id into v_par from consorcio.documentos d
       where d.portal_documento_id = s.id
          or (d.tipo = s.tipo and public.normalizar_texto(d.titulo) = public.normalizar_texto(s.titulo))
          or (d.tipo = s.tipo and d.numero is not null and d.numero = s.numero and d.data = s.data)
       order by (d.portal_documento_id = s.id) desc nulls last limit 1;
      select o.id into v_ente from consorcio.orgaos o where s.ente_id is not null and o.portal_ente_id = s.ente_id limit 1;
      if v_par is not null then
        update consorcio.documentos set portal_documento_id = s.id, mostrar_site = true,
          arquivo_url = coalesce(arquivo_url, s.arquivo_url, s.link_externo), orgao_id = coalesce(orgao_id, v_ente),
          descricao = coalesce(descricao, s.descricao), valor = coalesce(valor, s.valor)
         where id = v_par;
        v_ligados := v_ligados + 1;
      elsif p_sem_par = 'trazer' and (s.tipo not in ('contrato_rateio','contrato_programa') or v_ente is not null) then
        insert into consorcio.documentos (tipo, titulo, numero, exercicio, data, orgao_id, valor, vigencia_inicio, vigencia_fim, descricao, arquivo_url, mostrar_site, portal_documento_id)
        values (s.tipo, s.titulo, s.numero, coalesce(s.exercicio, case when s.tipo in ('contrato_rateio','orcamento') then extract(year from s.data)::int end), s.data, v_ente,
          s.valor, s.vigencia_inicio, s.vigencia_fim, s.descricao, coalesce(s.arquivo_url, s.link_externo), true, s.id);
        v_trazidos := v_trazidos + 1;
      elsif p_sem_par = 'apagar' then
        delete from public.consorcio_documentos where id = s.id; v_apagados := v_apagados + 1;
      end if;
    end loop;
  elsif p_item = 'identidade' then
    select configuracoes into cfg from public.orgaos where id = v_portal;
    update consorcio.configuracoes set
      endereco = coalesce(nullif(endereco, ''), nullif(cfg->>'endereco', '')), cep = coalesce(nullif(cep, ''), nullif(cfg->>'cep', '')),
      telefone = coalesce(nullif(telefone, ''), nullif(cfg->>'telefone', '')), whatsapp = coalesce(nullif(whatsapp, ''), nullif(cfg->>'whatsapp', '')),
      email_institucional = coalesce(nullif(email_institucional, ''), nullif(cfg->>'email', '')), horario = coalesce(nullif(horario, ''), nullif(cfg->>'horario', '')),
      logo_url = coalesce(nullif(logo_url, ''), nullif(cfg->>'brasao_url', '')),
      instagram = coalesce(nullif(instagram, ''), nullif(cfg->>'instagram', '')), facebook = coalesce(nullif(facebook, ''), nullif(cfg->>'facebook', '')),
      youtube = coalesce(nullif(youtube, ''), nullif(cfg->>'youtube', ''))
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
  if not consorcio.pode_integrar() then raise exception 'Só o administrador do módulo Consórcio envia a integração.'; end if;
  if not consorcio.integracao_ativa(p_item) then raise exception 'Este item não está integrado.'; end if;
  if p_item = 'entes' then
    for v_id in select id from consorcio.orgaos where vinculo = 'consorciado' or portal_ente_id is not null loop perform consorcio.site_enviar_ente(v_id); n := n + 1; end loop;
  elsif p_item = 'pessoas' then
    for v_id in select id from consorcio.pessoas where mostrar_site or portal_gestor_id is not null loop perform consorcio.site_enviar_pessoa(v_id); n := n + 1; end loop;
  elsif p_item = 'documentos' then
    for v_id in select id from consorcio.documentos where mostrar_site or portal_documento_id is not null loop perform consorcio.site_enviar_documento(v_id); n := n + 1; end loop;
  else perform consorcio.site_enviar_identidade(); n := 1;
  end if;
  r := jsonb_build_object('enviados', n, 'erros', (select count(*) from consorcio.integracao_erros where item = p_item));
  update consorcio.integracao set ultimo_envio = now(), ultimo_resultado = r where item = p_item;
  return r;
end $$;

create or replace function consorcio.integracao_desligar(p_item text)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.pode_integrar() then raise exception 'Só o administrador do módulo Consórcio desliga a integração.'; end if;
  update consorcio.integracao set ativo = false where item = p_item;
  delete from consorcio.integracao_erros where item = p_item;
  perform consorcio.site_marcar_flags();
end $$;

-- ---------- Qual órgão do Portal é este consórcio ----------------------------
create or replace function consorcio.site_orgaos()
returns table (id uuid, nome text, sigla text, cnpj text, atual boolean) language sql stable security definer set search_path = consorcio, public as $$
  select o.id, o.nome, o.sigla, o.cnpj, o.id = consorcio.portal_id()
    from public.orgaos o where o.tipo = 'consorcio' and consorcio.pode_integrar() order by o.nome
$$;
create or replace function consorcio.site_definir_portal(p_orgao uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_antigo uuid := consorcio.portal_id();
begin
  if not consorcio.pode_integrar() then raise exception 'Só o administrador do módulo Consórcio escolhe o órgão do Portal.'; end if;
  if p_orgao is not distinct from v_antigo then return; end if;
  if exists (select 1 from consorcio.integracao where ativo) then raise exception 'Desligue todas as integrações antes de trocar o órgão do Portal.'; end if;
  if p_orgao is not null and not exists (select 1 from public.orgaos where id = p_orgao and tipo = 'consorcio') then raise exception 'Órgão do Portal não encontrado (precisa ser do tipo consórcio).'; end if;
  if v_antigo is not null then
    update public.orgaos set configuracoes = configuracoes - 'integracao_gestao' where id = v_antigo;
  end if;
  update consorcio.configuracoes set portal_orgao_id = p_orgao where id = 1;
  update consorcio.orgaos set portal_ente_id = null where portal_ente_id is not null;
  update consorcio.pessoas set portal_gestor_id = null where portal_gestor_id is not null;
  update consorcio.documentos set portal_documento_id = null where portal_documento_id is not null;
  perform consorcio.site_marcar_flags();
end $$;
grant execute on function consorcio.site_orgaos(), consorcio.site_definir_portal(uuid) to authenticated;
grant execute on function consorcio.integracao_conferir(text), consorcio.integracao_ligar(text, text), consorcio.integracao_enviar_tudo(text),
  consorcio.integracao_desligar(text) to authenticated;

select consorcio.site_marcar_flags();


-- ---------- Formulário público da IRP: norma e declarações do consórcio -------------
create or replace function consorcio.publico_irp(p_id uuid)
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('id', i.id, 'numero', lpad(i.numero::text, 3, '0') || '/' || i.ano, 'processo', i.processo, 'objeto', i.objeto,
    'prazo_fim', i.prazo_fim, 'situacao', case when i.situacao = 'aberta' and not consorcio.irp_aberta(i) then 'encerrada' else i.situacao end,
    'aberta', consorcio.irp_aberta(i), 'contratacao_direta', i.contratacao_direta,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.numero, 'descricao', t.descricao, 'unidade', t.unidade) order by t.numero), '[]') from consorcio.irp_itens t where t.irp_id = i.id),
    'cimop', (select jsonb_build_object('nome', c.orgao_nome, 'sigla', c.sigla, 'email', c.email_institucional, 'endereco', c.endereco, 'horario', c.horario, 'telefone', c.telefone,
      'norma', c.resolucao_srp, 'declaracoes', c.modelo_irp_declaracoes) from consorcio.configuracoes c where c.id = 1))
  from consorcio.irps i where i.id = p_id and i.situacao in ('aberta','encerrada','consolidada')
$$;

