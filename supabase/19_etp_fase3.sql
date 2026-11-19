-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 19
-- Módulo Pesquisa de preços e quantitativos (ETP) – fase 3:
--   · empenhos do TCE-RN (SIAI, Anexo 14) por unidade (prefeitura e fundos), com classificação por palavras-chave;
--   · população do IBGE (estimativa) e IPCA (número-índice) para porte e correção de preços;
--   · pesquisa ampliada no PNCP (RN, Nordeste, Brasil) a partir de um termo;
--   · estimativas de quantitativos por ente (modelo guardado em JSON) e ligação com a IRP.
-- Coleta pelo próprio banco (pg_net), como no script 18. Requer os scripts 17 e 18. Pode rodar de novo.
-- =====================================================================

-- ---------------------------------------------------------------- ajustes do histórico do PNCP
alter table consorcio.etp_orgaos add column if not exists origem text not null default 'ente' check (origem in ('ente','ampliada'));

-- Só os CNPJs dos entes têm fila de leitura por ano; os da pesquisa ampliada só têm as compras achadas na busca
create or replace function consorcio.etp_sincronizar()
returns int language plpgsql security definer set search_path = consorcio, public as $$
declare r record; n int := 0;
begin
  for r in select distinct on (regexp_replace(o.cnpj, '\D', '', 'g')) regexp_replace(o.cnpj, '\D', '', 'g') cnpj, o.nome, o.uf,
             case when o.vinculo in ('consorciado','referendado','cooperado') or o.vinculo is null then 3 else 6 end prio
           from consorcio.orgaos o where regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$' loop
    perform consorcio.etp_garantir_orgao(r.cnpj, r.nome, r.uf, r.prio); n := n + 1;
  end loop;
  for r in select distinct regexp_replace(cnpj, '\D', '', 'g') cnpj from consorcio.pncp_config where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') ~ '^\d{14}$' loop
    perform consorcio.etp_garantir_orgao(r.cnpj, null, null, 1); n := n + 1;
  end loop;
  for r in select distinct cnpj from consorcio.etp_entes_cnpj loop
    update consorcio.etp_orgaos set origem = 'ente' where cnpj = r.cnpj and origem <> 'ente';
    perform consorcio.etp_garantir_orgao(r.cnpj, null, null, 2);
  end loop;
  insert into consorcio.etp_fila (cnpj, ano) select cnpj, extract(year from now())::int from consorcio.etp_orgaos where origem = 'ente' on conflict do nothing;
  return n;
end $$;

create or replace function consorcio.etp_garantir_orgao(p_cnpj text, p_nome text default null, p_uf text default null, p_prioridade int default 5)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_ini int := (select ano_inicial from consorcio.etp_config where id = 1);
begin
  if p_cnpj !~ '^\d{14}$' then raise exception 'CNPJ inválido.'; end if;
  insert into consorcio.etp_orgaos (cnpj, nome, uf, prioridade, origem) values (p_cnpj, p_nome, p_uf, p_prioridade, 'ente')
  on conflict (cnpj) do update set nome = coalesce(consorcio.etp_orgaos.nome, excluded.nome), uf = coalesce(consorcio.etp_orgaos.uf, excluded.uf),
    prioridade = least(consorcio.etp_orgaos.prioridade, excluded.prioridade), origem = 'ente';
  insert into consorcio.etp_fila (cnpj, ano)
    select p_cnpj, a from generate_series(v_ini, extract(year from now())::int) a
  on conflict do nothing;
end $$;

-- ---------------------------------------------------------------- dados públicos (comuns a todos os consórcios)
create table if not exists consorcio.etp_ipca (
  mes text primary key check (mes ~ '^\d{6}$'),   -- AAAAMM
  indice numeric not null
);
create table if not exists consorcio.etp_populacao (
  codigo_ibge text primary key,
  nome text not null,
  uf text not null,
  nome_norm text not null,
  populacao int,
  ano int,
  atualizado_em timestamptz not null default now()
);
create index if not exists etp_populacao_nome on consorcio.etp_populacao (uf, nome_norm);

create table if not exists consorcio.etp_tce_unidades (
  identificador int primary key,
  codigo text,
  nome text not null,
  cnpj text,
  municipio text,           -- nome normalizado do município (RN), quando a unidade é municipal
  tipo text,                -- prefeitura, fundo, camara, previdencia, outro
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);
create index if not exists etp_tce_unidades_mun on consorcio.etp_tce_unidades (municipio);

create table if not exists consorcio.etp_tce_fila (
  identificador int not null references consorcio.etp_tce_unidades(identificador) on delete cascade,
  ano int not null,
  empenhos int not null default 0,
  lido_em timestamptz,
  pedido_em timestamptz,
  erro text,
  primary key (identificador, ano)
);

create table if not exists consorcio.etp_empenhos (
  identificador int not null,
  ano int not null,
  data date not null,
  numero text not null,
  valor numeric,
  credor text,
  institucional text,
  programatica text,
  funcional text,
  processo text,
  justificativa text,
  justificativa_norm text,
  primary key (identificador, ano, data, numero)
);
create index if not exists etp_empenhos_unid on consorcio.etp_empenhos (identificador, ano);
create index if not exists etp_empenhos_trgm on consorcio.etp_empenhos using gin (justificativa_norm extensions.gin_trgm_ops);

-- Pedidos das novas fontes (TCE-RN, IBGE, busca no PNCP)
create table if not exists consorcio.etp_pedidos_fontes (
  id bigint primary key,
  tipo text not null check (tipo in ('tce_unidades','tce_empenhos','ibge_pop','ipca','busca')),
  url text not null,
  chave text,               -- identificador da unidade, UF, id da pesquisa…
  ano int,
  pagina int,
  tentativa int not null default 0,
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------- de cada consórcio
-- Unidades do TCE-RN de cada ente (prefeitura e fundos; câmara e previdência ficam de fora por padrão)
create table if not exists consorcio.etp_entes_tce (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  orgao_id uuid not null references consorcio.orgaos(id) on delete cascade,
  identificador int not null references consorcio.etp_tce_unidades(identificador),
  incluir boolean not null default true,
  automatico boolean not null default false,
  primary key (consorcio_id, orgao_id, identificador)
);
-- Categorias de despesa (classificação dos empenhos por palavras-chave)
create table if not exists consorcio.etp_categorias (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  nome text not null,
  termos text[] not null default '{}',       -- basta um aparecer
  excluir text[] not null default '{}',      -- nenhum pode aparecer
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists consorcio.etp_empenho_ajuste (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  categoria_id uuid not null references consorcio.etp_categorias(id) on delete cascade,
  identificador int not null, ano int not null, data date not null, numero text not null,
  incluir boolean not null,
  primary key (categoria_id, identificador, ano, data, numero)
);
-- Pesquisa ampliada no PNCP (um termo, uma abrangência)
create table if not exists consorcio.etp_pesquisas (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  termo text not null,
  ufs text[] not null,
  abrangencia text not null default 'RN',
  situacao text not null default 'buscando' check (situacao in ('buscando','lendo','pronta','erro')),
  achadas int not null default 0,
  limite int not null default 300,
  erro text,
  criado_em timestamptz not null default now()
);
create table if not exists consorcio.etp_pesquisa_compras (
  pesquisa_id uuid not null references consorcio.etp_pesquisas(id) on delete cascade,
  numero_controle text not null,
  cnpj text not null,
  ano int not null,
  sequencial int not null,
  orgao text,
  uf text,
  municipio text,
  objeto text,
  data_publicacao date,
  primary key (pesquisa_id, numero_controle)
);
-- Estimativas de quantitativos (modelo, entes, itens e quantidades em JSON; as contas são feitas na tela)
create table if not exists consorcio.etp_estimativas (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  titulo text not null,
  processo text,
  objeto text,
  dados jsonb not null default '{}'::jsonb,
  irp_id uuid references consorcio.irps(id) on delete set null,
  criado_em timestamptz not null default now(),
  criado_por_nome text,
  atualizado_em timestamptz not null default now()
);

-- Itens da IRP que vieram de uma estimativa (para comparar a quantidade do ente com o estimado)
alter table consorcio.irp_itens add column if not exists estimativa_id uuid references consorcio.etp_estimativas(id) on delete set null;
alter table consorcio.irp_itens add column if not exists estimativa_item text;

-- ---------------------------------------------------------------- segurança
do $$
declare t text;
begin
  foreach t in array array['etp_ipca','etp_populacao','etp_tce_unidades','etp_tce_fila','etp_empenhos','etp_pedidos_fontes',
                           'etp_entes_tce','etp_categorias','etp_empenho_ajuste','etp_pesquisas','etp_pesquisa_compras','etp_estimativas'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('revoke all on consorcio.%I from anon, authenticated', t);
    execute format('grant all on consorcio.%I to service_role', t);
  end loop;
  foreach t in array array['etp_ipca','etp_populacao','etp_tce_unidades','etp_tce_fila','etp_empenhos','etp_pesquisa_compras'] loop
    execute format('grant select on consorcio.%I to authenticated', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.perfil_modulo(''etp'') is not null)', t);
  end loop;
  foreach t in array array['etp_entes_tce','etp_categorias','etp_empenho_ajuste','etp_pesquisas','etp_estimativas'] loop
    execute format('grant select, insert, update, delete on consorcio.%I to authenticated', t);
    execute format('drop policy if exists isolar_consorcio on consorcio.%I', t);
    execute format('create policy isolar_consorcio on consorcio.%I as restrictive to authenticated using (consorcio_id = consorcio.atual()) with check (consorcio_id = consorcio.atual())', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.perfil_modulo(''etp'') is not null)', t);
    execute format('drop policy if exists gravar on consorcio.%I', t);
    execute format('create policy gravar on consorcio.%I for insert to authenticated with check (consorcio.pode_editar_etp())', t);
    execute format('drop policy if exists alterar on consorcio.%I', t);
    execute format('create policy alterar on consorcio.%I for update to authenticated using (consorcio.pode_editar_etp())', t);
    execute format('drop policy if exists excluir on consorcio.%I', t);
    execute format('create policy excluir on consorcio.%I for delete to authenticated using (consorcio.pode_editar_etp())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- coletor das novas fontes
create or replace function consorcio.etp_pedir_fonte(p_tipo text, p_url text, p_chave text default null, p_ano int default null, p_pagina int default null, p_tentativa int default 0)
returns void language plpgsql security definer set search_path = consorcio, public, extensions as $$
begin
  insert into consorcio.etp_pedidos_fontes (id, tipo, url, chave, ano, pagina, tentativa)
  -- o servidor do TCE-RN recusa cabeçalhos extras (HTTP 400 "Invalid Header"): só o accept
  values (net.http_get(url := p_url, headers := '{"accept":"application/json"}'::jsonb,
            timeout_milliseconds := case when p_tipo = 'tce_empenhos' then 180000 else 60000 end),
          p_tipo, p_url, p_chave, p_ano, p_pagina, p_tentativa);
end $$;
revoke all on function consorcio.etp_pedir_fonte(text, text, text, int, int, int) from public, anon, authenticated;

create or replace function consorcio.etp_uf_codigo(p_uf text) returns text language sql immutable as $$
  select (jsonb_build_object('AC','12','AL','27','AP','16','AM','13','BA','29','CE','23','DF','53','ES','32','GO','52','MA','21','MT','51','MS','50','MG','31',
    'PA','15','PB','25','PR','41','PE','26','PI','22','RJ','33','RN','24','RS','43','RO','11','RR','14','SC','42','SP','35','SE','28','TO','17') ->> upper(p_uf))
$$;

-- Município (nome normalizado) do ente: campo município do Cadastro ou o nome "Município de X/UF"
create or replace function consorcio.etp_municipio_do_ente(p_nome text, p_municipio text)
returns text language sql immutable as $$
  select consorcio.etp_norm(coalesce(nullif(p_municipio, ''), regexp_replace(regexp_replace(coalesce(p_nome, ''), '^\s*munic[ií]pio\s+de\s+', '', 'i'), '\s*[/-]\s*[A-Za-z]{2}\s*$', '')))
$$;

-- Liga cada ente do RN às unidades do TCE-RN do seu município (uma vez; depois o usuário ajusta)
create or replace function consorcio.etp_mapear_tce()
returns int language plpgsql security definer set search_path = consorcio, public as $$
declare n int;
begin
  insert into consorcio.etp_entes_tce (consorcio_id, orgao_id, identificador, incluir, automatico)
  select o.consorcio_id, o.id, u.identificador, u.tipo in ('prefeitura','fundo'), true
  from consorcio.orgaos o join consorcio.etp_tce_unidades u on u.municipio = consorcio.etp_municipio_do_ente(o.nome, o.municipio)
  where upper(coalesce(o.uf, '')) = 'RN' and u.ativo
    and not exists (select 1 from consorcio.etp_entes_tce x where x.consorcio_id = o.consorcio_id and x.orgao_id = o.id)
  on conflict do nothing;
  get diagnostics n = row_count;
  -- unidade nova de um município já ligado (fundo criado depois): entra desligada para o usuário decidir
  insert into consorcio.etp_entes_tce (consorcio_id, orgao_id, identificador, incluir, automatico)
  select distinct x.consorcio_id, x.orgao_id, u.identificador, false, true
  from consorcio.etp_entes_tce x join consorcio.orgaos o on o.id = x.orgao_id
  join consorcio.etp_tce_unidades u on u.municipio = consorcio.etp_municipio_do_ente(o.nome, o.municipio) and u.ativo
  on conflict do nothing;
  -- fila de empenhos das unidades incluídas, de 2023 até o ano em curso
  insert into consorcio.etp_tce_fila (identificador, ano)
  select distinct x.identificador, a from consorcio.etp_entes_tce x, generate_series(2023, extract(year from now())::int) a where x.incluir
  on conflict do nothing;
  return n;
end $$;

create or replace function consorcio.etp_disparar_fontes()
returns jsonb language plpgsql security definer set search_path = consorcio, public, extensions as $$
declare
  r record; j jsonb; x jsonb; s jsonb; v_ano int := extract(year from now())::int; n_resp int := 0; em_voo int; v_pesq consorcio.etp_pesquisas;
  v_n int; v_mun text; v_uf text;
  API constant text := 'https://pncp.gov.br/api';
  TCE constant text := 'https://apidadosabertos.tce.rn.gov.br/api';
  IBGE constant text := 'https://servicodados.ibge.gov.br/api/v3/agregados';
begin
  if not pg_try_advisory_xact_lock(hashtext('consorcio.etp_disparar_fontes')) then return jsonb_build_object('ocupado', true); end if;

  -- ------------------------------------------------ respostas
  for r in select p.*, h.status_code, h.content, h.error_msg from consorcio.etp_pedidos_fontes p join net._http_response h on h.id = p.id order by p.id limit 200 loop
    delete from consorcio.etp_pedidos_fontes where id = r.id;
    n_resp := n_resp + 1;
    if r.status_code is null or r.status_code = 429 or r.status_code >= 500 then
      if r.tentativa < 5 then perform consorcio.etp_pedir_fonte(r.tipo, r.url, r.chave, r.ano, r.pagina, r.tentativa + 1);
      elsif r.tipo = 'tce_empenhos' then update consorcio.etp_tce_fila set erro = left(coalesce(r.error_msg, 'HTTP ' || r.status_code), 300), pedido_em = now() where identificador = r.chave::int and ano = r.ano;
      elsif r.tipo = 'busca' then update consorcio.etp_pesquisas set situacao = 'erro', erro = 'O PNCP não respondeu à busca.' where id = r.chave::uuid;
      end if;
      continue;
    end if;
    begin j := case when r.status_code = 200 and coalesce(r.content, '') <> '' then r.content::jsonb else null end; exception when others then j := null; end;

    if r.tipo = 'ipca' and j is not null then
      insert into consorcio.etp_ipca (mes, indice)
      select k, v::numeric from jsonb_each_text(j #> '{0,resultados,0,series,0,serie}') as t(k, v) where v ~ '^[0-9.]+$'
      on conflict (mes) do update set indice = excluded.indice;

    elsif r.tipo = 'ibge_pop' and j is not null then
      insert into consorcio.etp_populacao (codigo_ibge, nome, uf, nome_norm, populacao, ano, atualizado_em)
      select l->'localidade'->>'id', split_part(l->'localidade'->>'nome', ' - ', 1), r.chave, consorcio.etp_norm(split_part(l->'localidade'->>'nome', ' - ', 1)),
        (select v::int from jsonb_each_text(l->'serie') as t(k, v) where v ~ '^\d+$' order by k desc limit 1),
        (select k::int from jsonb_each_text(l->'serie') as t(k, v) where v ~ '^\d+$' order by k desc limit 1), now()
      from jsonb_array_elements(j #> '{0,resultados,0,series}') l
      on conflict (codigo_ibge) do update set populacao = excluded.populacao, ano = excluded.ano, nome = excluded.nome, nome_norm = excluded.nome_norm, atualizado_em = now();

    elsif r.tipo = 'tce_unidades' and j is not null and jsonb_typeof(j) = 'array' then
      insert into consorcio.etp_tce_unidades (identificador, codigo, nome, cnpj, ativo, atualizado_em)
      select (u->>'identificadorUnidade')::int, u->>'codigoOrgao', u->>'nomeOrgao', nullif(u->>'cnpj', ''), u->>'dataTerminoAtividade' is null, now()
      from jsonb_array_elements(j) u
      on conflict (identificador) do update set codigo = excluded.codigo, nome = excluded.nome, cnpj = excluded.cnpj, ativo = excluded.ativo, atualizado_em = now();
      -- município: o nome de município do RN (IBGE) mais longo com que o nome da unidade termina
      update consorcio.etp_tce_unidades u set
        municipio = (select p.nome_norm from consorcio.etp_populacao p where p.uf = 'RN' and consorcio.etp_norm(u.nome) like '% ' || p.nome_norm order by length(p.nome_norm) desc limit 1),
        tipo = case when consorcio.etp_norm(u.nome) like 'prefeitura%' then 'prefeitura'
                    when consorcio.etp_norm(u.nome) like 'camara%' then 'camara'
                    when consorcio.etp_norm(u.nome) like '%previdencia%' then 'previdencia'
                    when consorcio.etp_norm(u.nome) like 'fundo%' or consorcio.etp_norm(u.nome) like 'fundacao municipal%' or consorcio.etp_norm(u.nome) like 'secretaria municipal%' then 'fundo'
                    else 'outro' end;
      perform consorcio.etp_mapear_tce();

    elsif r.tipo = 'tce_empenhos' then
      if j is not null and jsonb_typeof(j) = 'array' then
        delete from consorcio.etp_empenhos where identificador = r.chave::int and ano = r.ano;
        insert into consorcio.etp_empenhos (identificador, ano, data, numero, valor, credor, institucional, programatica, funcional, processo, justificativa, justificativa_norm)
        select r.chave::int, r.ano, left(e->>'dataEmpenho', 10)::date, coalesce(e->>'numeroEmpenho', '?'), (e->>'valorEmpenhado')::numeric, e->>'documentoCredor',
          e->>'classificacaoInstitucional', e->>'classificacaoProgramatica', e->>'classificacaoFuncional', e->>'numeroProcessoDespesa',
          left(e->>'justificativa', 1000), consorcio.etp_norm(left(e->>'justificativa', 1000))
        from jsonb_array_elements(j) e where e->>'dataEmpenho' is not null
        on conflict do nothing;
        get diagnostics v_n = row_count;
        update consorcio.etp_tce_fila set empenhos = v_n, lido_em = now(), erro = null where identificador = r.chave::int and ano = r.ano;
      else
        update consorcio.etp_tce_fila set empenhos = 0, lido_em = now(), erro = case when r.status_code in (200, 204, 404) then null else 'HTTP ' || r.status_code end
        where identificador = r.chave::int and ano = r.ano;
      end if;

    elsif r.tipo = 'busca' then
      select * into v_pesq from consorcio.etp_pesquisas where id = r.chave::uuid;
      if not found then continue; end if;
      if j is not null then
        for x in select it from jsonb_array_elements(coalesce(j->'items', '[]'::jsonb)) it loop
          exit when v_pesq.achadas >= v_pesq.limite;
          continue when coalesce(x->>'orgao_cnpj', '') !~ '^\d{14}$' or coalesce(x->>'cancelado', 'false') = 'true';
          continue when left(x->>'data_publicacao_pncp', 10) < to_char(now() - interval '30 months', 'YYYY-MM-DD');
          insert into consorcio.etp_orgaos (cnpj, nome, uf, municipio, codigo_ibge, esfera, prioridade, origem, situacao)
          values (x->>'orgao_cnpj', x->>'orgao_nome', x->>'uf', x->>'municipio_nome', x->>'codigo_ibge', x->>'esfera_id', 9, 'ampliada', 'em_dia')
          on conflict (cnpj) do nothing;
          insert into consorcio.etp_pesquisa_compras (pesquisa_id, numero_controle, cnpj, ano, sequencial, orgao, uf, municipio, objeto, data_publicacao)
          values (v_pesq.id, x->>'numero_controle_pncp', x->>'orgao_cnpj', (x->>'ano')::int, (x->>'numero_sequencial')::int, x->>'orgao_nome', x->>'uf',
            x->>'municipio_nome', x->>'description', left(x->>'data_publicacao_pncp', 10)::date)
          on conflict do nothing;
          get diagnostics v_n = row_count;
          if v_n > 0 then
            v_pesq.achadas := v_pesq.achadas + 1;
            if not exists (select 1 from consorcio.etp_compras where numero_controle = x->>'numero_controle_pncp') then
              perform consorcio.etp_pedir('compra', API || '/consulta/v1/orgaos/' || (x->>'orgao_cnpj') || '/compras/' || (x->>'ano') || '/' || (x->>'numero_sequencial'),
                x->>'orgao_cnpj', (x->>'ano')::int, (x->>'numero_sequencial')::int, null, null, null, 0, true);
            end if;
          end if;
        end loop;
        update consorcio.etp_pesquisas set achadas = v_pesq.achadas where id = v_pesq.id;
        if v_pesq.achadas < v_pesq.limite and jsonb_array_length(coalesce(j->'items', '[]'::jsonb)) >= 50 and r.pagina < 10 then
          perform consorcio.etp_pedir_fonte('busca', regexp_replace(r.url, '&pagina=\d+', '&pagina=' || (r.pagina + 1)), r.chave, null, r.pagina + 1);
        end if;
      end if;
    end if;
  end loop;

  -- pesquisas: buscando → lendo (sem busca pendente) → pronta (sem compra pendente)
  update consorcio.etp_pesquisas p set situacao = 'lendo' where situacao = 'buscando'
    and not exists (select 1 from consorcio.etp_pedidos_fontes f where f.tipo = 'busca' and f.chave = p.id::text);
  update consorcio.etp_pesquisas p set situacao = 'pronta' where situacao = 'lendo'
    and not exists (select 1 from consorcio.etp_pesquisa_compras c join consorcio.etp_pedidos d on d.cnpj = c.cnpj and d.ano = c.ano and d.seq = c.sequencial where c.pesquisa_id = p.id);

  -- ------------------------------------------------ novas consultas
  -- IPCA e população: uma vez por mês
  if not exists (select 1 from consorcio.etp_ipca where mes >= to_char(now() - interval '3 months', 'YYYYMM'))
     and not exists (select 1 from consorcio.etp_pedidos_fontes where tipo = 'ipca') then
    perform consorcio.etp_pedir_fonte('ipca', IBGE || '/1737/periodos/-72/variaveis/2266?localidades=N1[all]');
  end if;
  for v_uf in select distinct upper(u) from (select uf u from consorcio.orgaos where uf is not null union select 'RN') q
              where consorcio.etp_uf_codigo(u) is not null
                and not exists (select 1 from consorcio.etp_populacao p where p.uf = upper(q.u) and p.atualizado_em > now() - interval '30 days')
                and not exists (select 1 from consorcio.etp_pedidos_fontes f where f.tipo = 'ibge_pop' and f.chave = upper(q.u)) loop
    perform consorcio.etp_pedir_fonte('ibge_pop', IBGE || '/6579/periodos/-1/variaveis/9324?localidades=N6[N3[' || consorcio.etp_uf_codigo(v_uf) || ']]', v_uf);
  end loop;
  -- unidades do TCE-RN: uma vez por semana (depois da população do RN, que dá os nomes dos municípios)
  if exists (select 1 from consorcio.etp_populacao where uf = 'RN')
     and not exists (select 1 from consorcio.etp_tce_unidades where atualizado_em > now() - interval '7 days')
     and not exists (select 1 from consorcio.etp_pedidos_fontes where tipo = 'tce_unidades') then
    perform consorcio.etp_pedir_fonte('tce_unidades', TCE || '/InformacoesBasicasApi/JurisdicionadosTCE/json');
  end if;
  perform consorcio.etp_mapear_tce();
  -- empenhos: ano em curso a cada 7 dias, ano anterior a cada 30, anos fechados uma vez; no máximo 4 ao mesmo tempo (educado com o TCE)
  select count(*) into em_voo from consorcio.etp_pedidos_fontes where tipo = 'tce_empenhos';
  for r in select f.* from consorcio.etp_tce_fila f
           where exists (select 1 from consorcio.etp_entes_tce x where x.identificador = f.identificador and x.incluir)
             and (f.pedido_em is null or f.pedido_em < now() - interval '1 hour')
             and (f.lido_em is null or (f.ano = v_ano and f.lido_em < now() - interval '7 days') or (f.ano = v_ano - 1 and f.lido_em < now() - interval '30 days'))
           order by f.lido_em nulls first, f.ano desc limit greatest(4 - em_voo, 0) loop
    update consorcio.etp_tce_fila set pedido_em = now() where identificador = r.identificador and ano = r.ano;
    perform consorcio.etp_pedir_fonte('tce_empenhos', TCE || '/EmpenhosLiquidacoesPagamentosApi/Empenhos/json/' || r.ano || '/' || r.identificador, r.identificador::text, r.ano);
  end loop;
  return jsonb_build_object('respostas', n_resp);
end $$;
revoke all on function consorcio.etp_disparar_fontes() from public, anon, authenticated;

create or replace function consorcio.etp_url(t text) returns text language sql immutable as $$
  select string_agg(case when ch ~ '^[A-Za-z0-9_.~-]$' then ch when ch = ' ' then '+'
    else regexp_replace(upper(encode(convert_to(ch, 'UTF8'), 'hex')), '(..)', '%\1', 'g') end, '' order by n)
  from regexp_split_to_table(coalesce(t, ''), '') with ordinality as q(ch, n)
$$;

-- ---------------------------------------------------------------- funções para as telas
-- Pesquisa ampliada: cria e dispara a busca em cada UF da abrangência
create or replace function consorcio.etp_pesquisar_ampliada(p_termo text, p_abrangencia text default 'RN', p_limite int default 300)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
declare v_id uuid; v_ufs text[]; u text;
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  if length(btrim(coalesce(p_termo, ''))) < 3 then raise exception 'Digite o que procurar (pelo menos 3 letras).'; end if;
  v_ufs := case upper(p_abrangencia) when 'NE' then array['AL','BA','CE','MA','PB','PE','PI','RN','SE']
                                     when 'BR' then array['BR']
                                     else array[upper(p_abrangencia)] end;
  insert into consorcio.etp_pesquisas (consorcio_id, termo, ufs, abrangencia, limite)
  values (consorcio.atual(), btrim(p_termo), v_ufs, upper(p_abrangencia), least(greatest(coalesce(p_limite, 300), 20), 600)) returning id into v_id;
  foreach u in array v_ufs loop
    perform consorcio.etp_pedir_fonte('busca', 'https://pncp.gov.br/api/search/?q=' || consorcio.etp_url(btrim(p_termo)) ||
      '&tipos_documento=edital&ordenacao=-data&status=todos&tam_pagina=50' || case when u = 'BR' then '' else '&ufs=' || u end || '&pagina=1', v_id::text, null, 1);
  end loop;
  return v_id;
end $$;
grant execute on function consorcio.etp_pesquisar_ampliada(text, text, int) to authenticated;

create or replace function consorcio.etp_pesquisas_lista()
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'termo', p.termo, 'abrangencia', p.abrangencia, 'situacao', p.situacao, 'achadas', p.achadas, 'erro', p.erro,
    'criado_em', p.criado_em, 'lidas', (select count(*) from consorcio.etp_pesquisa_compras c join consorcio.etp_compras k on k.numero_controle = c.numero_controle where c.pesquisa_id = p.id),
    'cnpjs', (select coalesce(jsonb_agg(distinct c.cnpj), '[]'::jsonb) from consorcio.etp_pesquisa_compras c where c.pesquisa_id = p.id)) order by p.criado_em desc), '[]'::jsonb)
  from consorcio.etp_pesquisas p
$$;
grant execute on function consorcio.etp_pesquisas_lista() to authenticated;

-- Dados dos entes para a estimativa: população (IBGE), unidades do TCE-RN e CNPJs do histórico
create or replace function consorcio.etp_entes_dados()
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'uf', o.uf, 'vinculo', o.vinculo, 'ativo', o.ativo,
    'municipio', consorcio.etp_municipio_do_ente(o.nome, o.municipio),
    'populacao', (select jsonb_build_object('populacao', p.populacao, 'ano', p.ano, 'codigo_ibge', p.codigo_ibge, 'nome', p.nome) from consorcio.etp_populacao p
                  where p.uf = upper(o.uf) and p.nome_norm = consorcio.etp_municipio_do_ente(o.nome, o.municipio) limit 1),
    'unidades', coalesce((select jsonb_agg(jsonb_build_object('identificador', u.identificador, 'nome', u.nome, 'tipo', u.tipo, 'cnpj', u.cnpj, 'incluir', x.incluir,
        'anos', (select jsonb_agg(jsonb_build_object('ano', f.ano, 'empenhos', f.empenhos, 'lido_em', f.lido_em, 'erro', f.erro) order by f.ano) from consorcio.etp_tce_fila f where f.identificador = u.identificador))
        order by x.incluir desc, u.nome) from consorcio.etp_entes_tce x join consorcio.etp_tce_unidades u on u.identificador = x.identificador where x.orgao_id = o.id), '[]'::jsonb),
    'cnpjs', (select coalesce(jsonb_agg(distinct c), '[]'::jsonb) from (
        select regexp_replace(o.cnpj, '\D', '', 'g') c where regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$'
        union select e.cnpj from consorcio.etp_entes_cnpj e where e.orgao_id = o.id) q))
    order by o.nome), '[]'::jsonb)
  from consorcio.orgaos o
$$;
grant execute on function consorcio.etp_entes_dados() to authenticated;

create or replace function consorcio.etp_unidade_incluir(p_orgao uuid, p_identificador int, p_incluir boolean)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  insert into consorcio.etp_entes_tce (consorcio_id, orgao_id, identificador, incluir) values (consorcio.atual(), p_orgao, p_identificador, p_incluir)
  on conflict (consorcio_id, orgao_id, identificador) do update set incluir = excluded.incluir, automatico = false;
end $$;
grant execute on function consorcio.etp_unidade_incluir(uuid, int, boolean) to authenticated;

-- Fila de empenhos das unidades marcadas (chamada pela tela depois de marcar)
create or replace function consorcio.etp_tce_enfileirar()
returns void language sql security definer set search_path = consorcio, public as $$
  insert into consorcio.etp_tce_fila (identificador, ano)
  select distinct x.identificador, a from consorcio.etp_entes_tce x, generate_series(2023, extract(year from now())::int) a where x.incluir
  on conflict do nothing
$$;
grant execute on function consorcio.etp_tce_enfileirar() to authenticated;

-- Empenhos que entram numa categoria (termos, exclusões e ajustes manuais)
create or replace function consorcio.etp_empenho_na_categoria(c consorcio.etp_categorias, p_norm text)
returns boolean language sql immutable as $$
  select exists (select 1 from unnest(c.termos) t where nullif(btrim(t), '') is not null and p_norm like '%' || consorcio.etp_norm(t) || '%')
     and not exists (select 1 from unnest(c.excluir) t where nullif(btrim(t), '') is not null and p_norm like '%' || consorcio.etp_norm(t) || '%')
$$;

-- Consumo por ente e ano numa categoria
create or replace function consorcio.etp_consumo(p_categoria uuid, p_ano_ini int default 2023, p_ano_fim int default null)
returns jsonb language plpgsql stable set search_path = consorcio, public as $$
declare c consorcio.etp_categorias; v jsonb;
begin
  select * into c from consorcio.etp_categorias where id = p_categoria;
  if not found then raise exception 'Categoria não encontrada.'; end if;
  with un as (
    select x.orgao_id, x.identificador from consorcio.etp_entes_tce x where x.incluir
  ), emp as (
    select un.orgao_id, e.ano, e.valor, e.identificador, e.data, e.numero, e.justificativa_norm
    from consorcio.etp_empenhos e join un on un.identificador = e.identificador
    where e.ano >= coalesce(p_ano_ini, 2023) and (p_ano_fim is null or e.ano <= p_ano_fim)
  ), cl as (
    select emp.*, coalesce(a.incluir, consorcio.etp_empenho_na_categoria(c, emp.justificativa_norm)) dentro
    from emp left join consorcio.etp_empenho_ajuste a on a.categoria_id = c.id and a.identificador = emp.identificador and a.ano = emp.ano and a.data = emp.data and a.numero = emp.numero
  )
  select jsonb_build_object('linhas', coalesce(jsonb_agg(jsonb_build_object('orgao_id', orgao_id, 'ano', ano, 'valor', total, 'empenhos', n)), '[]'::jsonb),
    'lidos', (select jsonb_object_agg(orgao_id, lidos) from (select x.orgao_id, jsonb_agg(jsonb_build_object('ano', f.ano, 'lido', f.lido_em is not null, 'empenhos', f.empenhos)) lidos
              from un x join consorcio.etp_tce_fila f on f.identificador = x.identificador group by x.orgao_id) q))
  into v from (select orgao_id, ano, sum(valor) total, count(*) n from cl where dentro group by orgao_id, ano) s;
  return v;
end $$;
grant execute on function consorcio.etp_consumo(uuid, int, int) to authenticated;

-- Empenhos de um ente para conferir a classificação
create or replace function consorcio.etp_empenhos_lista(p_categoria uuid, p_orgao uuid, p_ano int default null, p_so_dentro boolean default true,
  p_texto text default null, p_offset int default 0, p_limite int default 100)
returns jsonb language plpgsql stable set search_path = consorcio, public as $$
declare c consorcio.etp_categorias; v jsonb;
begin
  select * into c from consorcio.etp_categorias where id = p_categoria;
  with emp as (
    select e.*, u.nome unidade, a.incluir ajuste, coalesce(a.incluir, consorcio.etp_empenho_na_categoria(c, e.justificativa_norm)) dentro
    from consorcio.etp_empenhos e join consorcio.etp_entes_tce x on x.identificador = e.identificador and x.orgao_id = p_orgao and x.incluir
    join consorcio.etp_tce_unidades u on u.identificador = e.identificador
    left join consorcio.etp_empenho_ajuste a on a.categoria_id = c.id and a.identificador = e.identificador and a.ano = e.ano and a.data = e.data and a.numero = e.numero
    where (p_ano is null or e.ano = p_ano)
      and (coalesce(btrim(p_texto), '') = '' or e.justificativa_norm like '%' || consorcio.etp_norm(p_texto) || '%')
  ), sel as (select * from emp where not p_so_dentro or dentro)
  select jsonb_build_object('total', (select count(*) from sel), 'valor', (select sum(valor) from sel),
    'linhas', coalesce((select jsonb_agg(jsonb_build_object('identificador', identificador, 'ano', ano, 'data', data, 'numero', numero, 'valor', valor, 'credor', credor,
        'unidade', unidade, 'justificativa', justificativa, 'dentro', dentro, 'ajuste', ajuste) order by data desc, numero)
      from (select * from sel order by data desc, numero offset greatest(p_offset, 0) limit least(greatest(p_limite, 1), 500)) z), '[]'::jsonb))
  into v;
  return v;
end $$;
grant execute on function consorcio.etp_empenhos_lista(uuid, uuid, int, boolean, text, int, int) to authenticated;

create or replace function consorcio.etp_empenho_marcar(p_categoria uuid, p_identificador int, p_ano int, p_data date, p_numero text, p_incluir boolean)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  if p_incluir is null then
    delete from consorcio.etp_empenho_ajuste where categoria_id = p_categoria and identificador = p_identificador and ano = p_ano and data = p_data and numero = p_numero;
  else
    insert into consorcio.etp_empenho_ajuste (consorcio_id, categoria_id, identificador, ano, data, numero, incluir)
    values (consorcio.atual(), p_categoria, p_identificador, p_ano, p_data, p_numero, p_incluir)
    on conflict (categoria_id, identificador, ano, data, numero) do update set incluir = excluded.incluir;
  end if;
end $$;
grant execute on function consorcio.etp_empenho_marcar(uuid, int, int, date, text, boolean) to authenticated;

-- Preços de uma ou mais séries (para a pesquisa de preços): cada resultado homologado é uma cotação
create or replace function consorcio.etp_precos(p_chaves text[], p_cnpjs text[])
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'controle', i.numero_controle, 'cnpj', i.cnpj, 'orgao', g.nome, 'uf', coalesce(c.uf, g.uf), 'municipio', coalesce(c.municipio, g.municipio),
      'data', coalesce(r.data_resultado, i.data_ref), 'compra', concat_ws(' ', c.modalidade, c.numero_compra), 'objeto', c.objeto, 'numero_item', i.numero_item,
      'descricao', i.descricao, 'unidade', i.unidade, 'quantidade', r.quantidade, 'valor', r.valor_unitario, 'fornecedor', r.fornecedor, 'ni', r.ni_fornecedor,
      'link', c.link, 'origem', g.origem) order by coalesce(r.data_resultado, i.data_ref) desc), '[]'::jsonb)
  from consorcio.etp_itens i
  join consorcio.etp_resultados r on r.item_id = i.id and not r.cancelado and r.valor_unitario > 0
  join consorcio.etp_compras c on c.numero_controle = i.numero_controle
  left join consorcio.etp_orgaos g on g.cnpj = i.cnpj
  left join consorcio.etp_grupos_item gi on gi.item_id = i.id and gi.consorcio_id = consorcio.atual()
  left join consorcio.etp_grupos_juntar gj on gj.chave = i.chave_auto and gj.consorcio_id = consorcio.atual()
  where i.cnpj = any(p_cnpjs) and coalesce(gi.destino, gj.destino, i.chave_auto) = any(p_chaves)
$$;
grant execute on function consorcio.etp_precos(text[], text[]) to authenticated;

-- Situação das novas fontes (para o painel)
create or replace function consorcio.etp_status()
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('em_voo', (select count(*) from consorcio.etp_pedidos), 'ultima_execucao', ultima_execucao, 'ativo', ativo,
    'tce', (select jsonb_build_object('unidades', count(*) filter (where f.lido_em is not null), 'pendentes', count(*) filter (where f.lido_em is null)) from consorcio.etp_tce_fila f),
    'empenhos', (select count(*) from consorcio.etp_empenhos),
    'ipca_ultimo', (select max(mes) from consorcio.etp_ipca),
    'populacao_ufs', (select coalesce(jsonb_agg(distinct uf), '[]'::jsonb) from consorcio.etp_populacao))
  from consorcio.etp_config where id = 1 and consorcio.perfil_modulo('etp') is not null
$$;
grant execute on function consorcio.etp_status() to authenticated;

grant execute on function consorcio.etp_disparar_fontes(), consorcio.etp_mapear_tce(), consorcio.etp_pedir_fonte(text, text, text, int, int, int) to service_role;

-- Categoria de exemplo (estruturas para eventos), no consórcio que já usa o módulo
insert into consorcio.etp_categorias (consorcio_id, nome, termos, excluir)
select c.id, 'Estruturas para eventos (palco, som, iluminação, geradores, tendas, banheiros químicos)',
  array['locacao de estrutura','locacao de palco','palco','sonorizacao','iluminacao de grande','iluminacao cenica','grupo gerador','locacao de gerador','gerador de energia',
        'banheiro quimico','banheiros quimicos','tenda','grid','camarim','arquibancada','painel de led','telao','climatizador','praticavel','backline','box truss'],
  array['cache','show artistico','apresentacao artistica','aquisicao','obra','reforma','construcao','combustivel']
from consorcio.consorcios c
where not exists (select 1 from consorcio.etp_categorias k where k.consorcio_id = c.id);

-- Agenda: novas fontes a cada minuto
do $$
begin
  perform cron.unschedule('consorcio-etp-fontes') where exists (select 1 from cron.job where jobname = 'consorcio-etp-fontes');
  perform cron.schedule('consorcio-etp-fontes', '* * * * *', 'select consorcio.etp_disparar_fontes()');
end $$;

notify pgrst, 'reload schema';
