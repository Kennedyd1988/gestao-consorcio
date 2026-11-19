-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 20
-- Censo Escolar (INEP) por município, pelo IBGE Cidades (pesquisa 13: matrículas por etapa e rede,
-- docentes e escolas, de 2008 em diante). Serve de base para estimar quantidades que dependem
-- do número de alunos, professores ou escolas (kits escolares, merenda, transporte, mobiliário…).
-- Requer o script 19. Pode rodar de novo.
-- =====================================================================

create table if not exists consorcio.etp_indicadores (
  id int primary key,
  fonte text not null default 'censo_escolar',
  posicao text,
  nome text not null,          -- caminho completo: "Matrículas › Ensino fundamental › Municipal"
  unidade text
);
create table if not exists consorcio.etp_indicador_valores (
  codigo_ibge text not null,
  indicador_id int not null references consorcio.etp_indicadores(id) on delete cascade,
  ano int not null,
  valor numeric,
  primary key (codigo_ibge, indicador_id, ano)
);
create table if not exists consorcio.etp_indicador_lidos (
  codigo_ibge text primary key,
  lido_em timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['etp_indicadores','etp_indicador_valores','etp_indicador_lidos'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('revoke all on consorcio.%I from anon, authenticated', t);
    execute format('grant all on consorcio.%I to service_role', t);
    execute format('grant select on consorcio.%I to authenticated', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.perfil_modulo(''etp'') is not null)', t);
  end loop;
end $$;

-- Pedidos do Censo (tabela própria, separada do coletor das outras fontes)
create table if not exists consorcio.etp_pedidos_censo (
  id bigint primary key,
  tipo text not null check (tipo in ('censo_def','censo')),
  url text not null,
  chave text,
  tentativa int not null default 0,
  criado_em timestamptz not null default now()
);
alter table consorcio.etp_pedidos_censo enable row level security;
revoke all on consorcio.etp_pedidos_censo from anon, authenticated;
grant all on consorcio.etp_pedidos_censo to service_role;

create or replace function consorcio.etp_pedir_censo(p_tipo text, p_url text, p_chave text default null, p_tentativa int default 0)
returns void language plpgsql security definer set search_path = consorcio, public, extensions as $$
begin
  insert into consorcio.etp_pedidos_censo (id, tipo, url, chave, tentativa)
  values (net.http_get(url := p_url, headers := '{"accept":"application/json"}'::jsonb, timeout_milliseconds := 60000), p_tipo, p_url, p_chave, p_tentativa);
end $$;
revoke all on function consorcio.etp_pedir_censo(text, text, text, int) from public, anon, authenticated;

-- Lê as respostas do Censo Escolar e dispara as próximas (chamada pelo coletor das fontes)
create or replace function consorcio.etp_disparar_censo()
returns void language plpgsql security definer set search_path = consorcio, public, extensions as $$
declare r record; j jsonb; c text;
begin
  for r in select p.*, h.status_code, h.content from consorcio.etp_pedidos_censo p join net._http_response h on h.id = p.id
           order by p.id limit 50 loop
    delete from consorcio.etp_pedidos_censo where id = r.id;
    if r.status_code is null or r.status_code = 429 or r.status_code >= 500 then
      if r.tentativa < 5 then perform consorcio.etp_pedir_censo(r.tipo, r.url, r.chave, r.tentativa + 1); end if;
      continue;
    end if;
    begin j := case when r.status_code = 200 then r.content::jsonb end; exception when others then j := null; end;
    continue when j is null;
    if r.tipo = 'censo_def' then
      insert into consorcio.etp_indicadores (id, posicao, nome, unidade)
      with recursive t(no, caminho) as (
        select x, x->>'indicador' from jsonb_array_elements(j) x
        union all
        select ch, t.caminho || ' › ' || (ch->>'indicador') from t, jsonb_array_elements(coalesce(t.no->'children', '[]'::jsonb)) ch
      )
      select distinct on ((no->>'id')::int) (no->>'id')::int, no->>'posicao', caminho, no#>>'{unidade,id}' from t
      on conflict (id) do update set nome = excluded.nome, posicao = excluded.posicao, unidade = excluded.unidade;
    else
      insert into consorcio.etp_indicador_valores (codigo_ibge, indicador_id, ano, valor)
      select r.chave, (i->>'id')::int, k::int, v::numeric
      from jsonb_array_elements(j) i, jsonb_array_elements(i->'res') l, jsonb_each_text(l->'res') as e(k, v)
      where v ~ '^[0-9]+(\.[0-9]+)?$' and exists (select 1 from consorcio.etp_indicadores d where d.id = (i->>'id')::int)
      on conflict (codigo_ibge, indicador_id, ano) do update set valor = excluded.valor;
      insert into consorcio.etp_indicador_lidos (codigo_ibge, lido_em) values (r.chave, now())
      on conflict (codigo_ibge) do update set lido_em = now();
    end if;
  end loop;

  if not exists (select 1 from consorcio.etp_indicadores) then
    if not exists (select 1 from consorcio.etp_pedidos_censo where tipo = 'censo_def') then
      perform consorcio.etp_pedir_censo('censo_def', 'https://servicodados.ibge.gov.br/api/v1/pesquisas/13/indicadores');
    end if;
    return;
  end if;
  -- municípios dos entes (por nome e UF), lidos de novo a cada 30 dias; no máximo 5 por minuto
  for c in select distinct p.codigo_ibge from consorcio.orgaos o
           join consorcio.etp_populacao p on p.uf = upper(o.uf) and p.nome_norm = consorcio.etp_municipio_do_ente(o.nome, o.municipio)
           left join consorcio.etp_indicador_lidos l on l.codigo_ibge = p.codigo_ibge
           where (l.lido_em is null or l.lido_em < now() - interval '30 days')
             and not exists (select 1 from consorcio.etp_pedidos_censo f where f.tipo = 'censo' and f.chave = p.codigo_ibge)
           limit 5 loop
    perform consorcio.etp_pedir_censo('censo', 'https://servicodados.ibge.gov.br/api/v1/pesquisas/13/indicadores/0/resultados/' || c, c);
  end loop;
end $$;
revoke all on function consorcio.etp_disparar_censo() from public, anon, authenticated;

-- Valores de um indicador para os entes (último ano com dado, ou o ano pedido)
create or replace function consorcio.etp_indicador_entes(p_indicador int, p_ano int default null)
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_object_agg(o.id, v.x), '{}'::jsonb)
  from consorcio.orgaos o
  join consorcio.etp_populacao p on p.uf = upper(o.uf) and p.nome_norm = consorcio.etp_municipio_do_ente(o.nome, o.municipio)
  cross join lateral (
    select jsonb_build_object('valor', iv.valor, 'ano', iv.ano) x from consorcio.etp_indicador_valores iv
    where iv.codigo_ibge = p.codigo_ibge and iv.indicador_id = p_indicador and (p_ano is null or iv.ano = p_ano)
    order by iv.ano desc limit 1) v
$$;
grant execute on function consorcio.etp_indicador_entes(int, int) to authenticated;

-- Agenda: o Censo entra junto com as outras fontes, a cada minuto
do $$
begin
  perform cron.unschedule('consorcio-etp-censo') where exists (select 1 from cron.job where jobname = 'consorcio-etp-censo');
  perform cron.schedule('consorcio-etp-censo', '* * * * *', 'select consorcio.etp_disparar_censo()');
end $$;

notify pgrst, 'reload schema';
