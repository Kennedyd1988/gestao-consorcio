-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 17
-- Módulo "Pesquisa de preços e quantitativos (ETP)" – fases 1 e 2:
--   histórico das contratações de cada órgão no PNCP (compras, itens, resultados e contratos)
--   e agrupamento dos itens parecidos em séries.
-- Os dados do PNCP são públicos e ficam num lugar só para todos os consórcios (um CNPJ é o mesmo
-- em qualquer consórcio). O que é de cada consórcio: os CNPJs ligados aos seus entes e os ajustes
-- de agrupamento. Quem grava os dados do PNCP é só a função consorcio-etp-pncp (chave secreta).
-- Pode rodar de novo.
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

insert into consorcio.modulos (id, nome, descricao, ordem) values
  ('etp', 'Pesquisa de preços e quantitativos (ETP)', 'Histórico das contratações de cada ente no PNCP (licitações, dispensas, itens, preços e contratos), com os itens agrupados em séries para justificar quantitativos e pesquisar preços.', 30)
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;

-- ---------------------------------------------------------------- normalização dos itens
create or replace function consorcio.etp_norm(t text)
returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(regexp_replace(public.normalizar_texto(t), '[^a-z0-9]+', ' ', 'g'), '\s+', ' ', 'g'))
$$;

create or replace function consorcio.etp_unidade(u text)
returns text language sql immutable parallel safe as $$
  select case
    when x in ('un','und','unid','unidade','unidades','uni','ud','unit','pc','pca','peca','pecas','unidade de medida') then 'unidade'
    when x in ('cx','caixa','caixas') then 'caixa'
    when x in ('pct','pc pacote','pacote','pacotes','pt') then 'pacote'
    when x in ('kg','quilo','quilos','quilograma','quilogramas','kilo') then 'quilo'
    when x in ('g','gr','grama','gramas') then 'grama'
    when x in ('l','lt','lts','litro','litros') then 'litro'
    when x in ('ml','mililitro','mililitros') then 'mililitro'
    when x in ('m','mt','mts','metro','metros','metro linear','ml linear') then 'metro'
    when x in ('m2','mt2','metro quadrado','metros quadrados') then 'metro quadrado'
    when x in ('m3','mt3','metro cubico','metros cubicos') then 'metro cubico'
    when x in ('t','ton','tonelada','toneladas') then 'tonelada'
    when x in ('sv','serv','servico','servicos') then 'servico'
    when x in ('mes','meses','mensal') then 'mes'
    when x in ('h','hr','hora','horas') then 'hora'
    when x in ('dia','dias','diaria','diarias') then 'diaria'
    when x in ('kit','kits') then 'kit'
    when x in ('par','pares') then 'par'
    when x in ('fd','fardo','fardos') then 'fardo'
    when x in ('gl','galao','galoes') then 'galao'
    when x in ('rs','resma','resmas') then 'resma'
    when x in ('rl','rolo','rolos') then 'rolo'
    when x in ('fr','frasco','frascos') then 'frasco'
    when x in ('km','quilometro','quilometros') then 'quilometro'
    else x end
  from (select consorcio.etp_norm(u) x) s
$$;

-- Chave automática do item: código do catálogo (CATMAT/CATSER) ou as 3 primeiras palavras significativas + unidade
create or replace function consorcio.etp_chave(p_desc text, p_unidade text, p_catalogo text)
returns text language sql immutable parallel safe as $$
  select case when nullif(btrim(coalesce(p_catalogo, '')), '') is not null then 'cat:' || btrim(p_catalogo)
  else 'txt:' || coalesce((
    select string_agg(w, ' ' order by o) from (
      select w, o from unnest(string_to_array(consorcio.etp_norm(p_desc), ' ')) with ordinality as t(w, o)
      where length(w) > 1 and w !~ '^[0-9]+$'
        and w not in ('de','da','do','das','dos','para','com','sem','em','no','na','nos','nas','e','ou','a','o','as','os','um','uma',
                      'tipo','marca','modelo','referencia','ref','cor','tamanho','aquisicao','fornecimento','contratacao','empresa',
                      'especializada','servico','servicos','item','itens','material','materiais','conforme','termo','especificacao',
                      'especificacoes','minimo','minima','aproximadamente','medindo','medida','medidas','sendo','deve','devera')
      order by o limit 3) p), '') || '|' || consorcio.etp_unidade(p_unidade)
  end
$$;

-- ---------------------------------------------------------------- dados do PNCP (comuns a todos os consórcios)
create table if not exists consorcio.etp_config (
  id int primary key default 1 check (id = 1),
  chave_sinc text not null default replace(gen_random_uuid()::text, '-', ''),
  ano_inicial int not null default 2023,
  ativo boolean not null default true,
  rodando_ate timestamptz,
  ultima_execucao timestamptz,
  ultimo_resultado jsonb
);
insert into consorcio.etp_config (id) values (1) on conflict (id) do nothing;

create table if not exists consorcio.etp_orgaos (
  cnpj text primary key check (cnpj ~ '^\d{14}$'),
  nome text,
  uf text,
  municipio text,
  codigo_ibge text,
  esfera text,
  prioridade int not null default 5,
  situacao text not null default 'na_fila' check (situacao in ('na_fila','carregando','em_dia','erro','pausado')),
  compras int not null default 0,
  itens int not null default 0,
  contratos int not null default 0,
  ultima_leitura timestamptz,
  erro text,
  criado_em timestamptz not null default now()
);

create table if not exists consorcio.etp_fila (
  cnpj text not null references consorcio.etp_orgaos(cnpj) on delete cascade,
  ano int not null,
  proximo_seq int not null default 1,
  ultimo_achado int not null default 0,
  falhas_seguidas int not null default 0,
  concluido boolean not null default false,
  contratos_lidos boolean not null default false,
  atualizado_em timestamptz not null default now(),
  primary key (cnpj, ano)
);

create table if not exists consorcio.etp_compras (
  numero_controle text primary key,
  cnpj text not null references consorcio.etp_orgaos(cnpj) on delete cascade,
  ano int not null,
  sequencial int not null,
  numero_compra text,
  processo text,
  modalidade_id int,
  modalidade text,
  srp boolean,
  objeto text,
  situacao text,
  valor_estimado numeric,
  valor_homologado numeric,
  data_publicacao date,
  data_abertura date,
  unidade text,
  municipio text,
  uf text,
  codigo_ibge text,
  amparo text,
  link text,
  itens_qtd int not null default 0,
  resultados_pendentes int not null default 0,
  lido_em timestamptz not null default now()
);
create index if not exists etp_compras_cnpj_ano on consorcio.etp_compras (cnpj, ano);
create index if not exists etp_compras_pendentes on consorcio.etp_compras (lido_em) where resultados_pendentes > 0;

create table if not exists consorcio.etp_itens (
  id bigint generated always as identity primary key,
  numero_controle text not null references consorcio.etp_compras(numero_controle) on delete cascade,
  cnpj text not null,
  ano int not null,
  data_ref date,
  numero_item int not null,
  descricao text not null,
  material_servico text,
  unidade text,
  quantidade numeric,
  valor_unitario_estimado numeric,
  valor_total_estimado numeric,
  catalogo_codigo text,
  ncm text,
  criterio text,
  situacao text,
  tem_resultado boolean not null default false,
  desc_norm text,
  unid_norm text,
  chave_auto text,
  unique (numero_controle, numero_item)
);
create index if not exists etp_itens_cnpj_ano on consorcio.etp_itens (cnpj, ano);
create index if not exists etp_itens_chave on consorcio.etp_itens (chave_auto);
create index if not exists etp_itens_desc_trgm on consorcio.etp_itens using gin (desc_norm extensions.gin_trgm_ops);

create or replace function consorcio.etp_itens_normalizar()
returns trigger language plpgsql as $$
begin
  new.desc_norm := consorcio.etp_norm(new.descricao);
  new.unid_norm := consorcio.etp_unidade(new.unidade);
  new.chave_auto := consorcio.etp_chave(new.descricao, new.unidade, new.catalogo_codigo);
  return new;
end $$;
drop trigger if exists etp_itens_normalizar on consorcio.etp_itens;
create trigger etp_itens_normalizar before insert or update of descricao, unidade, catalogo_codigo on consorcio.etp_itens
  for each row execute function consorcio.etp_itens_normalizar();

create table if not exists consorcio.etp_resultados (
  item_id bigint not null references consorcio.etp_itens(id) on delete cascade,
  ordem int not null,
  ni_fornecedor text,
  fornecedor text,
  porte text,
  quantidade numeric,
  valor_unitario numeric,
  valor_total numeric,
  data_resultado date,
  cancelado boolean not null default false,
  primary key (item_id, ordem)
);

create table if not exists consorcio.etp_contratos (
  numero_controle text primary key,
  cnpj text not null references consorcio.etp_orgaos(cnpj) on delete cascade,
  ano int,
  compra_controle text,
  ata_controle text,
  numero text,
  processo text,
  tipo text,
  categoria text,
  objeto text,
  ni_fornecedor text,
  fornecedor text,
  valor_inicial numeric,
  valor_global numeric,
  data_assinatura date,
  vigencia_inicio date,
  vigencia_fim date
);
create index if not exists etp_contratos_cnpj on consorcio.etp_contratos (cnpj, ano);

-- ---------------------------------------------------------------- o que é de cada consórcio
-- CNPJs ligados a cada ente do Cadastro (além do CNPJ do próprio cadastro): fundos, câmara, autarquias…
create table if not exists consorcio.etp_entes_cnpj (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  orgao_id uuid not null references consorcio.orgaos(id) on delete cascade,
  cnpj text not null references consorcio.etp_orgaos(cnpj),
  rotulo text,
  criado_em timestamptz not null default now(),
  primary key (consorcio_id, orgao_id, cnpj)
);
-- Agrupamento: juntar uma série (chave) em outra, mover um item para outra série e dar nome à série
create table if not exists consorcio.etp_grupos_juntar (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  chave text not null,
  destino text not null,
  criado_em timestamptz not null default now(),
  primary key (consorcio_id, chave)
);
create table if not exists consorcio.etp_grupos_item (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  item_id bigint not null references consorcio.etp_itens(id) on delete cascade,
  destino text not null,
  criado_em timestamptz not null default now(),
  primary key (consorcio_id, item_id)
);
create table if not exists consorcio.etp_grupos_nome (
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  chave text not null,
  nome text not null,
  primary key (consorcio_id, chave)
);

-- ---------------------------------------------------------------- segurança
create or replace function consorcio.pode_editar_etp()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.perfil_modulo('etp') in ('administrador', 'operador'), false)
$$;
grant execute on function consorcio.pode_editar_etp() to authenticated;

do $$
declare t text;
begin
  foreach t in array array['etp_config','etp_orgaos','etp_fila','etp_compras','etp_itens','etp_resultados','etp_contratos',
                           'etp_entes_cnpj','etp_grupos_juntar','etp_grupos_item','etp_grupos_nome'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('revoke all on consorcio.%I from anon, authenticated', t);
  end loop;
  -- Dados do PNCP: só leitura, para quem tem o módulo
  foreach t in array array['etp_orgaos','etp_fila','etp_compras','etp_itens','etp_resultados','etp_contratos'] loop
    execute format('grant select on consorcio.%I to authenticated', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.perfil_modulo(''etp'') is not null)', t);
  end loop;
  -- Do consórcio: isolado e editável por quem edita o módulo
  foreach t in array array['etp_entes_cnpj','etp_grupos_juntar','etp_grupos_item','etp_grupos_nome'] loop
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
-- etp_config: só a função (chave secreta) e o banco; ninguém lê pela API

-- ---------------------------------------------------------------- funções
-- Põe um CNPJ no histórico (e na fila de leitura). Interno.
create or replace function consorcio.etp_garantir_orgao(p_cnpj text, p_nome text default null, p_uf text default null, p_prioridade int default 5)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_ini int := (select ano_inicial from consorcio.etp_config where id = 1);
begin
  if p_cnpj !~ '^\d{14}$' then raise exception 'CNPJ inválido.'; end if;
  insert into consorcio.etp_orgaos (cnpj, nome, uf, prioridade) values (p_cnpj, p_nome, p_uf, p_prioridade)
  on conflict (cnpj) do update set nome = coalesce(consorcio.etp_orgaos.nome, excluded.nome), uf = coalesce(consorcio.etp_orgaos.uf, excluded.uf),
    prioridade = least(consorcio.etp_orgaos.prioridade, excluded.prioridade);
  insert into consorcio.etp_fila (cnpj, ano)
    select p_cnpj, a from generate_series(v_ini, extract(year from now())::int) a
  on conflict do nothing;
end $$;
revoke all on function consorcio.etp_garantir_orgao(text, text, text, int) from public, anon, authenticated;

-- Liga um CNPJ (prefeitura, fundo, câmara…) a um ente do consórcio atual
create or replace function consorcio.etp_incluir_cnpj(p_orgao uuid, p_cnpj text, p_rotulo text default null, p_nome text default null)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); v_uf text;
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  select uf into v_uf from consorcio.orgaos where id = p_orgao and consorcio_id = consorcio.atual();
  if not found then raise exception 'Ente não encontrado neste consórcio.'; end if;
  perform consorcio.etp_garantir_orgao(v_cnpj, p_nome, v_uf, 2);
  insert into consorcio.etp_entes_cnpj (consorcio_id, orgao_id, cnpj, rotulo) values (consorcio.atual(), p_orgao, v_cnpj, nullif(btrim(p_rotulo), ''))
  on conflict (consorcio_id, orgao_id, cnpj) do update set rotulo = excluded.rotulo;
end $$;
grant execute on function consorcio.etp_incluir_cnpj(uuid, text, text, text) to authenticated;

-- CNPJs de todos os entes do Cadastro (todos os consórcios) entram na fila. Usada pela função de leitura.
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
  -- ano novo: cria a linha do ano em curso para todos
  insert into consorcio.etp_fila (cnpj, ano) select cnpj, extract(year from now())::int from consorcio.etp_orgaos on conflict do nothing;
  return n;
end $$;
revoke all on function consorcio.etp_sincronizar() from public, anon, authenticated;

-- Chave efetiva de um item no consórcio atual (ajustes manuais primeiro)
create or replace function consorcio.etp_chave_efetiva(p_item bigint, p_chave text)
returns text language sql stable set search_path = consorcio, public as $$
  select coalesce(
    (select destino from consorcio.etp_grupos_item g where g.item_id = p_item and g.consorcio_id = consorcio.atual()),
    (select destino from consorcio.etp_grupos_juntar j where j.chave = p_chave and j.consorcio_id = consorcio.atual()),
    p_chave)
$$;
grant execute on function consorcio.etp_chave_efetiva(bigint, text) to authenticated;

-- Painel: entes do consórcio atual, CNPJs e situação da leitura
create or replace function consorcio.etp_painel()
returns jsonb language sql stable set search_path = consorcio, public as $$
  with cnpjs as (
    select o.id orgao_id, regexp_replace(o.cnpj, '\D', '', 'g') cnpj, 'Cadastro' rotulo, true do_cadastro
      from consorcio.orgaos o where regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$'
    union
    select e.orgao_id, e.cnpj, coalesce(e.rotulo, 'Outro CNPJ'), false from consorcio.etp_entes_cnpj e
  )
  select jsonb_build_object(
    'entes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'uf', o.uf, 'municipio', o.municipio, 'vinculo', o.vinculo,
        'cnpjs', coalesce((select jsonb_agg(jsonb_build_object('cnpj', c.cnpj, 'rotulo', c.rotulo, 'do_cadastro', c.do_cadastro,
            'nome_pncp', g.nome, 'situacao', coalesce(g.situacao, 'na_fila'), 'compras', coalesce(g.compras, 0), 'itens', coalesce(g.itens, 0),
            'contratos', coalesce(g.contratos, 0), 'ultima_leitura', g.ultima_leitura, 'erro', g.erro,
            'anos', (select jsonb_agg(jsonb_build_object('ano', f.ano, 'concluido', f.concluido, 'lidas', f.ultimo_achado) order by f.ano) from consorcio.etp_fila f where f.cnpj = c.cnpj))
          order by c.do_cadastro desc, c.rotulo) from cnpjs c left join consorcio.etp_orgaos g on g.cnpj = c.cnpj where c.orgao_id = o.id), '[]'::jsonb))
      order by o.nome) from consorcio.orgaos o), '[]'::jsonb),
    'fila', (select jsonb_build_object('pendentes', count(*) filter (where not concluido), 'total', count(*)) from consorcio.etp_fila f
              where f.cnpj in (select cnpj from cnpjs)),
    'pode_editar', consorcio.pode_editar_etp())
$$;
grant execute on function consorcio.etp_painel() to authenticated;

-- Compras de um ou mais CNPJs, com filtros e paginação
create or replace function consorcio.etp_compras_lista(p_cnpjs text[], p_ano int default null, p_modalidade int default null,
  p_texto text default null, p_offset int default 0, p_limite int default 50)
returns jsonb language sql stable set search_path = consorcio, public as $$
  with base as (
    select c.* from consorcio.etp_compras c
    where c.cnpj = any(p_cnpjs) and (p_ano is null or c.ano = p_ano) and (p_modalidade is null or c.modalidade_id = p_modalidade)
      and (coalesce(btrim(p_texto), '') = '' or consorcio.etp_norm(coalesce(c.objeto, '') || ' ' || coalesce(c.numero_compra, '') || ' ' || coalesce(c.processo, '')) like '%' || consorcio.etp_norm(p_texto) || '%'
           or exists (select 1 from consorcio.etp_itens i where i.numero_controle = c.numero_controle and i.desc_norm like '%' || consorcio.etp_norm(p_texto) || '%'))
  )
  select jsonb_build_object('total', (select count(*) from base),
    'valor_homologado', (select sum(valor_homologado) from base),
    'linhas', coalesce((select jsonb_agg(to_jsonb(x) order by x.data_publicacao desc nulls last, x.numero_controle desc) from (
       select numero_controle, cnpj, ano, sequencial, numero_compra, processo, modalidade_id, modalidade, srp, objeto, situacao, valor_estimado, valor_homologado,
              data_publicacao, data_abertura, unidade, itens_qtd, resultados_pendentes
       from base order by data_publicacao desc nulls last, numero_controle desc offset greatest(p_offset, 0) limit least(greatest(p_limite, 1), 200)) x), '[]'::jsonb),
    'modalidades', coalesce((select jsonb_agg(jsonb_build_object('id', modalidade_id, 'nome', modalidade, 'n', n) order by n desc) from (
       select modalidade_id, modalidade, count(*) n from consorcio.etp_compras where cnpj = any(p_cnpjs) group by 1, 2) m), '[]'::jsonb),
    'anos', coalesce((select jsonb_agg(ano order by ano desc) from (select distinct ano from consorcio.etp_compras where cnpj = any(p_cnpjs)) a), '[]'::jsonb))
$$;
grant execute on function consorcio.etp_compras_lista(text[], int, int, text, int, int) to authenticated;

-- Uma compra com itens e resultados
create or replace function consorcio.etp_compra(p_controle text)
returns jsonb language sql stable set search_path = consorcio, public as $$
  select to_jsonb(c) || jsonb_build_object(
    'orgao', (select nome from consorcio.etp_orgaos where cnpj = c.cnpj),
    'itens', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'numero', i.numero_item, 'descricao', i.descricao, 'unidade', i.unidade,
        'quantidade', i.quantidade, 'valor_unitario_estimado', i.valor_unitario_estimado, 'catalogo', i.catalogo_codigo, 'situacao', i.situacao,
        'material_servico', i.material_servico, 'chave', consorcio.etp_chave_efetiva(i.id, i.chave_auto),
        'resultados', coalesce((select jsonb_agg(jsonb_build_object('fornecedor', r.fornecedor, 'ni', r.ni_fornecedor, 'quantidade', r.quantidade,
            'valor_unitario', r.valor_unitario, 'valor_total', r.valor_total, 'data', r.data_resultado, 'cancelado', r.cancelado) order by r.ordem)
          from consorcio.etp_resultados r where r.item_id = i.id), '[]'::jsonb)) order by i.numero_item)
      from consorcio.etp_itens i where i.numero_controle = c.numero_controle), '[]'::jsonb),
    'contratos', coalesce((select jsonb_agg(to_jsonb(k) order by k.data_assinatura) from consorcio.etp_contratos k where k.compra_controle = c.numero_controle), '[]'::jsonb))
  from consorcio.etp_compras c where c.numero_controle = p_controle
$$;
grant execute on function consorcio.etp_compra(text) to authenticated;

-- Busca agrupada por série (fase 2): itens com todas as palavras, agrupados pela chave efetiva
create or replace function consorcio.etp_buscar(p_texto text, p_cnpjs text[], p_ano_ini int default null, p_ano_fim int default null, p_limite int default 100)
returns jsonb language plpgsql stable set search_path = consorcio, public, extensions as $$
declare v_pal text[]; v jsonb;
begin
  v_pal := array(select w from unnest(string_to_array(consorcio.etp_norm(p_texto), ' ')) w where length(w) > 1);
  if coalesce(array_length(v_pal, 1), 0) = 0 then return jsonb_build_object('series', '[]'::jsonb); end if;
  with alvo as (
    select i.*, coalesce(gi.destino, gj.destino, i.chave_auto) chave
    from consorcio.etp_itens i
    left join consorcio.etp_grupos_item gi on gi.item_id = i.id and gi.consorcio_id = consorcio.atual()
    left join consorcio.etp_grupos_juntar gj on gj.chave = i.chave_auto and gj.consorcio_id = consorcio.atual()
    where i.cnpj = any(p_cnpjs) and (p_ano_ini is null or i.ano >= p_ano_ini) and (p_ano_fim is null or i.ano <= p_ano_fim)
  ), achadas as (
    select distinct chave from alvo a where (select bool_and(a.desc_norm like '%' || w || '%') from unnest(v_pal) w)
  ), sel as (
    select a.* from alvo a join achadas h on h.chave = a.chave
  ), res as (
    select s.chave, r.valor_unitario, r.quantidade from sel s join consorcio.etp_resultados r on r.item_id = s.id where not r.cancelado and r.valor_unitario > 0
  ), series as (
    select s.chave,
      (select nome from consorcio.etp_grupos_nome n where n.chave = s.chave and n.consorcio_id = consorcio.atual()) nome,
      mode() within group (order by s.unid_norm) unidade,
      (array_agg(s.descricao order by length(s.descricao)))[1] exemplo,
      count(*) itens, count(distinct s.numero_controle) compras, count(distinct s.cnpj) orgaos,
      sum(s.quantidade) qtd_licitada,
      max(s.data_ref) ultima_data,
      percentile_cont(0.5) within group (order by s.valor_unitario_estimado) filter (where s.valor_unitario_estimado > 0) estimado_mediana
    from sel s group by s.chave
  )
  select jsonb_build_object('series', coalesce(jsonb_agg(jsonb_build_object(
      'chave', se.chave, 'nome', se.nome, 'unidade', se.unidade, 'exemplo', se.exemplo, 'itens', se.itens, 'compras', se.compras, 'orgaos', se.orgaos,
      'qtd_licitada', se.qtd_licitada, 'ultima_data', se.ultima_data, 'estimado_mediana', se.estimado_mediana,
      'qtd_homologada', (select sum(quantidade) from res where res.chave = se.chave),
      'preco_min', (select min(valor_unitario) from res where res.chave = se.chave),
      'preco_mediana', (select percentile_cont(0.5) within group (order by valor_unitario) from res where res.chave = se.chave),
      'preco_max', (select max(valor_unitario) from res where res.chave = se.chave),
      'precos', (select count(*) from res where res.chave = se.chave),
      'anos', (select jsonb_object_agg(ano, q) from (select s2.ano, sum(coalesce((select sum(r.quantidade) from consorcio.etp_resultados r where r.item_id = s2.id and not r.cancelado), s2.quantidade)) q
                from sel s2 where s2.chave = se.chave group by s2.ano) y))
      order by se.compras desc, se.itens desc), '[]'::jsonb), 'total', count(*))
  into v from (select * from series order by compras desc, itens desc limit least(greatest(p_limite, 1), 300)) se;
  return v;
end $$;
grant execute on function consorcio.etp_buscar(text, text[], int, int, int) to authenticated;

-- Itens de uma série (para conferir, juntar e separar)
create or replace function consorcio.etp_itens_serie(p_chave text, p_cnpjs text[])
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'numero_controle', i.numero_controle, 'cnpj', i.cnpj, 'orgao', g.nome, 'ano', i.ano, 'data', i.data_ref,
      'numero', i.numero_item, 'descricao', i.descricao, 'unidade', i.unidade, 'quantidade', i.quantidade, 'estimado', i.valor_unitario_estimado,
      'chave_auto', i.chave_auto, 'objeto', c.objeto, 'modalidade', c.modalidade, 'numero_compra', c.numero_compra,
      'resultados', coalesce((select jsonb_agg(jsonb_build_object('fornecedor', r.fornecedor, 'quantidade', r.quantidade, 'valor_unitario', r.valor_unitario, 'cancelado', r.cancelado) order by r.ordem)
          from consorcio.etp_resultados r where r.item_id = i.id), '[]'::jsonb))
    order by i.data_ref desc nulls last, i.numero_controle, i.numero_item), '[]'::jsonb)
  from consorcio.etp_itens i join consorcio.etp_compras c on c.numero_controle = i.numero_controle left join consorcio.etp_orgaos g on g.cnpj = i.cnpj
  left join consorcio.etp_grupos_item gi on gi.item_id = i.id and gi.consorcio_id = consorcio.atual()
  left join consorcio.etp_grupos_juntar gj on gj.chave = i.chave_auto and gj.consorcio_id = consorcio.atual()
  where i.cnpj = any(p_cnpjs) and coalesce(gi.destino, gj.destino, i.chave_auto) = p_chave
$$;
grant execute on function consorcio.etp_itens_serie(text, text[]) to authenticated;

-- Juntar séries: todas as chaves informadas passam a apontar para o destino (sem cadeias)
create or replace function consorcio.etp_juntar(p_chaves text[], p_destino text, p_nome text default null)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
declare k text;
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  foreach k in array p_chaves loop
    if k = p_destino then continue; end if;
    update consorcio.etp_grupos_juntar set destino = p_destino where destino = k and consorcio_id = consorcio.atual();
    update consorcio.etp_grupos_item set destino = p_destino where destino = k and consorcio_id = consorcio.atual();
    insert into consorcio.etp_grupos_juntar (consorcio_id, chave, destino) values (consorcio.atual(), k, p_destino)
      on conflict (consorcio_id, chave) do update set destino = excluded.destino;
  end loop;
  delete from consorcio.etp_grupos_juntar where chave = p_destino and consorcio_id = consorcio.atual();
  if nullif(btrim(p_nome), '') is not null then
    insert into consorcio.etp_grupos_nome (consorcio_id, chave, nome) values (consorcio.atual(), p_destino, btrim(p_nome))
      on conflict (consorcio_id, chave) do update set nome = excluded.nome;
  end if;
end $$;
grant execute on function consorcio.etp_juntar(text[], text, text) to authenticated;

-- Separar itens: vão para uma série própria (nova) ou de volta para a automática
create or replace function consorcio.etp_separar(p_itens bigint[], p_nome text default null, p_voltar boolean default false)
returns text language plpgsql security invoker set search_path = consorcio, public as $$
declare v_dest text := 'man:' || replace(gen_random_uuid()::text, '-', '');
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  if p_voltar then
    delete from consorcio.etp_grupos_item where item_id = any(p_itens) and consorcio_id = consorcio.atual();
    return null;
  end if;
  insert into consorcio.etp_grupos_item (consorcio_id, item_id, destino) select consorcio.atual(), x, v_dest from unnest(p_itens) x
    on conflict (consorcio_id, item_id) do update set destino = excluded.destino;
  if nullif(btrim(p_nome), '') is not null then
    insert into consorcio.etp_grupos_nome (consorcio_id, chave, nome) values (consorcio.atual(), v_dest, btrim(p_nome));
  end if;
  return v_dest;
end $$;
grant execute on function consorcio.etp_separar(bigint[], text, boolean) to authenticated;

create or replace function consorcio.etp_nomear(p_chave text, p_nome text)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  if nullif(btrim(p_nome), '') is null then delete from consorcio.etp_grupos_nome where chave = p_chave and consorcio_id = consorcio.atual();
  else insert into consorcio.etp_grupos_nome (consorcio_id, chave, nome) values (consorcio.atual(), p_chave, btrim(p_nome))
    on conflict (consorcio_id, chave) do update set nome = excluded.nome; end if;
end $$;
grant execute on function consorcio.etp_nomear(text, text) to authenticated;

-- Contadores do órgão (chamada pela função de leitura)
create or replace function consorcio.etp_recontar(p_cnpj text)
returns void language sql security definer set search_path = consorcio, public as $$
  update consorcio.etp_orgaos set
    compras = (select count(*) from consorcio.etp_compras where cnpj = p_cnpj),
    itens = (select count(*) from consorcio.etp_itens where cnpj = p_cnpj),
    contratos = (select count(*) from consorcio.etp_contratos where cnpj = p_cnpj),
    situacao = case when exists (select 1 from consorcio.etp_fila where cnpj = p_cnpj and not concluido) then 'carregando' else 'em_dia' end,
    ultima_leitura = now()
  where cnpj = p_cnpj
$$;
revoke all on function consorcio.etp_recontar(text) from public, anon, authenticated;

-- Já carrega os CNPJs que o Cadastro tem hoje
select consorcio.etp_sincronizar();

-- Leitura automática a cada 5 minutos (a função para sozinha quando a fila acaba)
do $$
begin
  perform cron.unschedule('consorcio-etp-pncp') where exists (select 1 from cron.job where jobname = 'consorcio-etp-pncp');
  perform cron.schedule('consorcio-etp-pncp', '*/5 * * * *', $cron$
    select net.http_post(
      url := 'https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/consorcio-etp-pncp',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave-sinc', (select chave_sinc from consorcio.etp_config where id = 1)),
      body := '{"acao":"processar"}'::jsonb,
      timeout_milliseconds := 150000)
    where (select ativo from consorcio.etp_config where id = 1)
  $cron$);
end $$;

notify pgrst, 'reload schema';
