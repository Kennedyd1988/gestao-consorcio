-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 18
-- Coletor do PNCP feito no próprio banco (pg_net + pg_cron), no lugar da função na nuvem.
-- Motivo: o PNCP limita as consultas vindas dos servidores compartilhados das funções (HTTP 429);
-- as consultas saindo do banco do projeto passam normalmente.
-- A cada minuto: lê as respostas que chegaram, grava compras, itens, resultados e contratos e
-- dispara as próximas consultas (no máximo etp_config.max_em_voo ao mesmo tempo).
-- Requer o script 17. Pode rodar de novo.
-- =====================================================================

alter table consorcio.etp_config add column if not exists janela int not null default 15;
alter table consorcio.etp_config add column if not exists max_em_voo int not null default 80;
alter table consorcio.etp_fila add column if not exists janela_pendente int not null default 0;
alter table consorcio.etp_fila add column if not exists janela_fim int not null default 0;
alter table consorcio.etp_fila add column if not exists contratos_em timestamptz;
alter table consorcio.etp_fila add column if not exists erros int not null default 0;
create index if not exists etp_compras_seq on consorcio.etp_compras (cnpj, ano, sequencial);

create table if not exists consorcio.etp_pedidos (
  id bigint primary key,                  -- id do pedido no pg_net
  tipo text not null check (tipo in ('compra','itens','resultado','contratos')),
  url text not null,
  cnpj text not null,
  ano int not null,
  seq int,
  controle text,
  numero_item int,
  pagina int,
  tentativa int not null default 0,
  revisita boolean not null default false,
  criado_em timestamptz not null default now()
);
alter table consorcio.etp_pedidos enable row level security;
revoke all on consorcio.etp_pedidos from anon, authenticated;
grant all on consorcio.etp_pedidos to service_role;

-- Dispara uma consulta ao PNCP e guarda o que ela é
create or replace function consorcio.etp_pedir(p_tipo text, p_url text, p_cnpj text, p_ano int, p_seq int default null, p_controle text default null,
  p_item int default null, p_pagina int default null, p_tentativa int default 0, p_revisita boolean default false)
returns void language plpgsql security definer set search_path = consorcio, public, extensions as $$
begin
  insert into consorcio.etp_pedidos (id, tipo, url, cnpj, ano, seq, controle, numero_item, pagina, tentativa, revisita)
  values (net.http_get(url := p_url, headers := '{"accept":"application/json","user-agent":"SOFT+ Consorcios (gestao-consorcio; etp)"}'::jsonb, timeout_milliseconds := 60000),
          p_tipo, p_url, p_cnpj, p_ano, p_seq, p_controle, p_item, p_pagina, p_tentativa, p_revisita);
end $$;
revoke all on function consorcio.etp_pedir(text, text, text, int, int, text, int, int, int, boolean) from public, anon, authenticated;

create or replace function consorcio.etp_num(v jsonb) returns numeric language sql immutable as $$
  select case when v is null or jsonb_typeof(v) = 'null' then null else (v #>> '{}')::numeric end
$$;

-- Fim de uma consulta de compra (achada, inexistente ou desistida): fecha a janela quando todas voltaram
create or replace function consorcio.etp_fim_compra(p_cnpj text, p_ano int, p_achou_seq int)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare f consorcio.etp_fila;
begin
  update consorcio.etp_fila set janela_pendente = greatest(janela_pendente - 1, 0),
    ultimo_achado = greatest(ultimo_achado, coalesce(p_achou_seq, 0)), atualizado_em = now()
  where cnpj = p_cnpj and ano = p_ano returning * into f;
  if f.janela_pendente = 0 and f.janela_fim - f.ultimo_achado >= 25 then
    update consorcio.etp_fila set concluido = true, proximo_seq = f.ultimo_achado + 1 where cnpj = p_cnpj and ano = p_ano;
  end if;
end $$;

create or replace function consorcio.etp_disparar()
returns jsonb language plpgsql security definer set search_path = consorcio, public, extensions as $$
declare
  cfg consorcio.etp_config;
  r record; j jsonb; e jsonb; f record;
  v_comp consorcio.etp_compras; v_item bigint;
  n_resp int := 0; n_novos int := 0; em_voo int; v_ano_atual int := extract(year from now())::int;
  tocados text[] := '{}';
  API constant text := 'https://pncp.gov.br/api';
begin
  if not pg_try_advisory_xact_lock(hashtext('consorcio.etp_disparar')) then return jsonb_build_object('ocupado', true); end if;
  select * into cfg from consorcio.etp_config where id = 1;

  -- ------------------------------------------------ 1. respostas que chegaram
  for r in select p.*, h.status_code, h.content, h.error_msg, h.timed_out
           from consorcio.etp_pedidos p join net._http_response h on h.id = p.id
           order by p.id limit 2000 loop
    delete from consorcio.etp_pedidos where id = r.id;
    n_resp := n_resp + 1;
    tocados := array_append(tocados, r.cnpj);
    -- falha passageira: tenta de novo (até 6 vezes)
    if r.status_code is null or r.status_code = 429 or r.status_code >= 500 then
      if r.tentativa < 6 then
        perform consorcio.etp_pedir(r.tipo, r.url, r.cnpj, r.ano, r.seq, r.controle, r.numero_item, r.pagina, r.tentativa + 1, r.revisita);
      else
        update consorcio.etp_orgaos set erro = left(coalesce(r.error_msg, 'HTTP ' || r.status_code) || ' – ' || r.url, 500) where cnpj = r.cnpj;
        update consorcio.etp_fila set erros = erros + 1 where cnpj = r.cnpj and ano = r.ano;
        if r.tipo = 'compra' then perform consorcio.etp_fim_compra(r.cnpj, r.ano, null); end if;
      end if;
      continue;
    end if;
    begin
      j := case when r.status_code = 200 and coalesce(r.content, '') <> '' then r.content::jsonb else null end;
    exception when others then j := null; end;

    if r.tipo = 'compra' then
      if j is null or jsonb_typeof(j) <> 'object' then perform consorcio.etp_fim_compra(r.cnpj, r.ano, null); continue; end if;
      insert into consorcio.etp_compras (numero_controle, cnpj, ano, sequencial, numero_compra, processo, modalidade_id, modalidade, srp, objeto, situacao,
        valor_estimado, valor_homologado, data_publicacao, data_abertura, unidade, municipio, uf, codigo_ibge, amparo, link, lido_em)
      values (coalesce(j->>'numeroControlePNCP', r.cnpj || '-1-' || lpad(r.seq::text, 6, '0') || '/' || r.ano), r.cnpj, r.ano, r.seq, j->>'numeroCompra', j->>'processo',
        (j->>'modalidadeId')::int, j->>'modalidadeNome', (j->>'srp')::boolean, j->>'objetoCompra', j->>'situacaoCompraNome',
        consorcio.etp_num(j->'valorTotalEstimado'), consorcio.etp_num(j->'valorTotalHomologado'),
        left(coalesce(j->>'dataPublicacaoPncp', j->>'dataInclusao'), 10)::date, left(j->>'dataAberturaProposta', 10)::date,
        j#>>'{unidadeOrgao,nomeUnidade}', j#>>'{unidadeOrgao,municipioNome}', j#>>'{unidadeOrgao,ufSigla}', j#>>'{unidadeOrgao,codigoIbge}', j#>>'{amparoLegal,nome}',
        'https://pncp.gov.br/app/editais/' || r.cnpj || '/' || r.ano || '/' || r.seq, now())
      on conflict (numero_controle) do update set numero_compra = excluded.numero_compra, processo = excluded.processo, modalidade_id = excluded.modalidade_id,
        modalidade = excluded.modalidade, srp = excluded.srp, objeto = excluded.objeto, situacao = excluded.situacao, valor_estimado = excluded.valor_estimado,
        valor_homologado = excluded.valor_homologado, data_publicacao = excluded.data_publicacao, data_abertura = excluded.data_abertura, unidade = excluded.unidade,
        municipio = excluded.municipio, uf = excluded.uf, codigo_ibge = excluded.codigo_ibge, amparo = excluded.amparo, lido_em = now()
      returning * into v_comp;
      update consorcio.etp_orgaos set nome = coalesce(j#>>'{orgaoEntidade,razaoSocial}', nome), uf = coalesce(v_comp.uf, uf), municipio = coalesce(v_comp.municipio, municipio),
        codigo_ibge = coalesce(v_comp.codigo_ibge, codigo_ibge), esfera = coalesce(j#>>'{orgaoEntidade,esferaId}', esfera), erro = null
      where cnpj = r.cnpj and (nome is distinct from j#>>'{orgaoEntidade,razaoSocial}' or codigo_ibge is null);
      perform consorcio.etp_pedir('itens', API || '/pncp/v1/orgaos/' || r.cnpj || '/compras/' || r.ano || '/' || r.seq || '/itens?pagina=1&tamanhoPagina=500',
        r.cnpj, r.ano, r.seq, v_comp.numero_controle, null, 1);
      n_novos := n_novos + 1;
      if not r.revisita then perform consorcio.etp_fim_compra(r.cnpj, r.ano, r.seq); end if;

    elsif r.tipo = 'itens' then
      if j is null or jsonb_typeof(j) <> 'array' or jsonb_array_length(j) = 0 then continue; end if;
      select * into v_comp from consorcio.etp_compras where numero_controle = r.controle;
      if not found then continue; end if;
      insert into consorcio.etp_itens (numero_controle, cnpj, ano, data_ref, numero_item, descricao, material_servico, unidade, quantidade,
        valor_unitario_estimado, valor_total_estimado, catalogo_codigo, ncm, criterio, situacao, tem_resultado)
      select r.controle, r.cnpj, r.ano, coalesce(v_comp.data_abertura, v_comp.data_publicacao), (x->>'numeroItem')::int,
        left(coalesce(nullif(x->>'descricao', ''), '(sem descrição)'), 6000), x->>'materialOuServico', x->>'unidadeMedida', consorcio.etp_num(x->'quantidade'),
        consorcio.etp_num(x->'valorUnitarioEstimado'), consorcio.etp_num(x->'valorTotal'), nullif(x->>'catalogoCodigoItem', ''), nullif(x->>'ncmNbsCodigo', ''),
        x->>'criterioJulgamentoNome', x->>'situacaoCompraItemNome', coalesce((x->>'temResultado')::boolean, false)
      from jsonb_array_elements(j) x
      on conflict (numero_controle, numero_item) do update set descricao = excluded.descricao, unidade = excluded.unidade, quantidade = excluded.quantidade,
        valor_unitario_estimado = excluded.valor_unitario_estimado, valor_total_estimado = excluded.valor_total_estimado, catalogo_codigo = excluded.catalogo_codigo,
        situacao = excluded.situacao, tem_resultado = excluded.tem_resultado, data_ref = excluded.data_ref;
      for e in select x from jsonb_array_elements(j) x where coalesce((x->>'temResultado')::boolean, false) loop
        perform consorcio.etp_pedir('resultado', API || '/pncp/v1/orgaos/' || r.cnpj || '/compras/' || r.ano || '/' || r.seq || '/itens/' || (e->>'numeroItem') || '/resultados',
          r.cnpj, r.ano, r.seq, r.controle, (e->>'numeroItem')::int);
      end loop;
      if jsonb_array_length(j) >= 500 then
        perform consorcio.etp_pedir('itens', API || '/pncp/v1/orgaos/' || r.cnpj || '/compras/' || r.ano || '/' || r.seq || '/itens?pagina=' || (r.pagina + 1) || '&tamanhoPagina=500',
          r.cnpj, r.ano, r.seq, r.controle, null, r.pagina + 1);
      end if;
      update consorcio.etp_compras set itens_qtd = (select count(*) from consorcio.etp_itens where numero_controle = r.controle),
        resultados_pendentes = (select count(*) from consorcio.etp_itens where numero_controle = r.controle and not tem_resultado and situacao ilike '%andamento%')
      where numero_controle = r.controle;

    elsif r.tipo = 'resultado' then
      select id into v_item from consorcio.etp_itens where numero_controle = r.controle and numero_item = r.numero_item;
      if v_item is null or j is null or jsonb_typeof(j) <> 'array' then continue; end if;
      delete from consorcio.etp_resultados where item_id = v_item;
      insert into consorcio.etp_resultados (item_id, ordem, ni_fornecedor, fornecedor, porte, quantidade, valor_unitario, valor_total, data_resultado, cancelado)
      select v_item, o::int, x->>'niFornecedor', x->>'nomeRazaoSocialFornecedor', coalesce(x->>'porteFornecedorNome', x->>'porteFornecedorId'),
        consorcio.etp_num(x->'quantidadeHomologada'), consorcio.etp_num(x->'valorUnitarioHomologado'), consorcio.etp_num(x->'valorTotalHomologado'),
        left(coalesce(x->>'dataResultado', x->>'dataInclusao'), 10)::date, x->>'dataCancelamento' is not null
      from jsonb_array_elements(j) with ordinality as t(x, o);

    elsif r.tipo = 'contratos' then
      if j is not null and jsonb_typeof(j) = 'object' then
        insert into consorcio.etp_contratos (numero_controle, cnpj, ano, compra_controle, ata_controle, numero, processo, tipo, categoria, objeto, ni_fornecedor, fornecedor,
          valor_inicial, valor_global, data_assinatura, vigencia_inicio, vigencia_fim)
        select x->>'numeroControlePNCP', r.cnpj, coalesce((x->>'anoContrato')::int, r.ano), x->>'numeroControlePncpCompra', x->>'numeroControlePncpAta', x->>'numeroContratoEmpenho',
          x->>'processo', x#>>'{tipoContrato,nome}', x#>>'{categoriaProcesso,nome}', x->>'objetoContrato', x->>'niFornecedor', x->>'nomeRazaoSocialFornecedor',
          consorcio.etp_num(x->'valorInicial'), consorcio.etp_num(x->'valorGlobal'), left(x->>'dataAssinatura', 10)::date, left(x->>'dataVigenciaInicio', 10)::date, left(x->>'dataVigenciaFim', 10)::date
        from jsonb_array_elements(coalesce(j->'data', '[]'::jsonb)) x where x->>'numeroControlePNCP' is not null
        on conflict (numero_controle) do update set valor_global = excluded.valor_global, vigencia_fim = excluded.vigencia_fim, objeto = excluded.objeto;
      end if;
      if j is not null and coalesce((j->>'paginasRestantes')::int, 0) > 0 then
        perform consorcio.etp_pedir('contratos', regexp_replace(r.url, 'pagina=\d+', 'pagina=' || (r.pagina + 1)), r.cnpj, r.ano, null, null, null, r.pagina + 1);
      else
        update consorcio.etp_fila set contratos_lidos = (r.ano < v_ano_atual) where cnpj = r.cnpj and ano = r.ano;
      end if;
    end if;
  end loop;

  -- pedidos perdidos (sem resposta há mais de 15 minutos): pede de novo
  for r in select * from consorcio.etp_pedidos p where p.criado_em < now() - interval '15 minutes'
           and not exists (select 1 from net._http_response h where h.id = p.id) limit 200 loop
    delete from consorcio.etp_pedidos where id = r.id;
    perform consorcio.etp_pedir(r.tipo, r.url, r.cnpj, r.ano, r.seq, r.controle, r.numero_item, r.pagina, r.tentativa + 1, r.revisita);
  end loop;

  if not cfg.ativo then return jsonb_build_object('respostas', n_resp, 'pausado', true); end if;

  -- ------------------------------------------------ 2. novas consultas
  perform consorcio.etp_sincronizar();
  update consorcio.etp_fila set concluido = false where ano = v_ano_atual and concluido and atualizado_em < now() - interval '1 day';

  -- compras com resultado pendente (lidas há mais de 3 dias, dos últimos 18 meses): lê os itens de novo
  for r in select * from consorcio.etp_compras where resultados_pendentes > 0 and lido_em < now() - interval '3 days'
           and data_publicacao > now() - interval '18 months' order by lido_em limit 5 loop
    update consorcio.etp_compras set lido_em = now() where numero_controle = r.numero_controle;
    perform consorcio.etp_pedir('itens', API || '/pncp/v1/orgaos/' || r.cnpj || '/compras/' || r.ano || '/' || r.sequencial || '/itens?pagina=1&tamanhoPagina=500',
      r.cnpj, r.ano, r.sequencial, r.numero_controle, null, 1, 0, true);
  end loop;

  select count(*) into em_voo from consorcio.etp_pedidos;
  -- janelas de números de compra, dos órgãos prioritários e dos anos mais recentes primeiro
  for f in select q.* from consorcio.etp_fila q join consorcio.etp_orgaos o on o.cnpj = q.cnpj
           where not q.concluido and q.janela_pendente = 0 and o.situacao <> 'pausado'
           order by o.prioridade, q.ano desc, q.cnpj loop
    exit when em_voo >= cfg.max_em_voo;
    update consorcio.etp_fila set janela_pendente = cfg.janela, janela_fim = f.proximo_seq + cfg.janela - 1, proximo_seq = f.proximo_seq + cfg.janela, atualizado_em = now()
    where cnpj = f.cnpj and ano = f.ano;
    for k in 0 .. cfg.janela - 1 loop
      perform consorcio.etp_pedir('compra', API || '/consulta/v1/orgaos/' || f.cnpj || '/compras/' || f.ano || '/' || (f.proximo_seq + k), f.cnpj, f.ano, f.proximo_seq + k);
    end loop;
    em_voo := em_voo + cfg.janela;
    tocados := array_append(tocados, f.cnpj);
  end loop;
  -- contratos dos anos já lidos (uma consulta por ano; no ano em curso, uma vez por dia)
  for f in select q.* from consorcio.etp_fila q where q.concluido and not q.contratos_lidos and (q.contratos_em is null or q.contratos_em < now() - interval '1 day')
           order by q.ano desc limit 5 loop
    exit when em_voo >= cfg.max_em_voo + 5;
    update consorcio.etp_fila set contratos_em = now() where cnpj = f.cnpj and ano = f.ano;
    perform consorcio.etp_pedir('contratos', API || '/consulta/v1/contratos?dataInicial=' || f.ano || '0101&dataFinal=' ||
      case when f.ano = v_ano_atual then to_char(now(), 'YYYYMMDD') else f.ano || '1231' end || '&cnpjOrgao=' || f.cnpj || '&pagina=1&tamanhoPagina=50', f.cnpj, f.ano, null, null, null, 1);
    em_voo := em_voo + 1;
  end loop;

  -- contadores dos órgãos mexidos
  for r in select distinct unnest(tocados) c loop perform consorcio.etp_recontar(r.c); end loop;
  update consorcio.etp_config set ultima_execucao = now(), ultimo_resultado = jsonb_build_object('respostas', n_resp, 'compras_novas', n_novos, 'em_voo', em_voo) where id = 1;
  return jsonb_build_object('respostas', n_resp, 'compras', n_novos, 'em_voo', em_voo);
end $$;
revoke all on function consorcio.etp_disparar() from public, anon, authenticated;
grant execute on function consorcio.etp_disparar() to service_role;

-- Botão "Buscar agora" (quem edita o módulo)
create or replace function consorcio.etp_buscar_agora()
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  return consorcio.etp_disparar();
end $$;
grant execute on function consorcio.etp_buscar_agora() to authenticated;

-- Situação da leitura (para o painel)
create or replace function consorcio.etp_status()
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('em_voo', (select count(*) from consorcio.etp_pedidos), 'ultima_execucao', ultima_execucao, 'ativo', ativo)
  from consorcio.etp_config where id = 1 and consorcio.perfil_modulo('etp') is not null
$$;
grant execute on function consorcio.etp_status() to authenticated;

-- Recomeça a fila do zero (o que foi tentado pela função na nuvem e bateu no limite do PNCP)
update consorcio.etp_fila set proximo_seq = 1, falhas_seguidas = 0, ultimo_achado = 0, janela_pendente = 0, janela_fim = 0, concluido = false
 where not exists (select 1 from consorcio.etp_compras c where c.cnpj = etp_fila.cnpj and c.ano = etp_fila.ano) and janela_fim = 0;

-- Agenda: troca a chamada da função na nuvem pelo coletor no banco, a cada minuto
do $$
begin
  perform cron.unschedule('consorcio-etp-pncp') where exists (select 1 from cron.job where jobname = 'consorcio-etp-pncp');
  perform cron.unschedule('consorcio-etp-coletor') where exists (select 1 from cron.job where jobname = 'consorcio-etp-coletor');
  perform cron.schedule('consorcio-etp-coletor', '* * * * *', 'select consorcio.etp_disparar()');
end $$;

notify pgrst, 'reload schema';
