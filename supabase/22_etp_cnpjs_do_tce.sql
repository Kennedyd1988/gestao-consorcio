-- 22: CNPJs das unidades do TCE-RN entram sozinhos na coleta do PNCP.
-- Reexecutável. Depende dos scripts 17 a 21.
-- Toda unidade ativa do município no TCE-RN com CNPJ próprio (prefeitura, fundos,
-- câmara, previdência, autarquias) vira CNPJ do ente (origem 'tce') e é lida no PNCP:
-- tudo serve para a pesquisa de preços. Para os quantitativos (histórico do ente)
-- só contam a prefeitura e os fundos (coluna quantitativo); câmara e autarquias não.
-- CNPJ igual ao do Cadastro não é duplicado. CNPJ lido sem compras no PNCP aparece
-- como "Sem publicações no PNCP".

alter table consorcio.etp_entes_cnpj add column if not exists origem text not null default 'manual';
alter table consorcio.etp_entes_cnpj add column if not exists quantitativo boolean not null default true;

-- CNPJ incluído à mão: câmara e autarquia não contam nos quantitativos
create or replace function consorcio.etp_entes_cnpj_quantitativo()
returns trigger language plpgsql set search_path = consorcio, public as $$
begin
  if new.origem = 'manual' then
    new.quantitativo := coalesce(new.rotulo, '') !~* '(c[âa]mara|autarquia|previd|instituto)';
  end if;
  return new;
end $$;
drop trigger if exists etp_entes_cnpj_quantitativo on consorcio.etp_entes_cnpj;
create trigger etp_entes_cnpj_quantitativo before insert or update of rotulo, origem on consorcio.etp_entes_cnpj
  for each row execute function consorcio.etp_entes_cnpj_quantitativo();
update consorcio.etp_entes_cnpj set rotulo = rotulo where origem = 'manual';

create or replace function consorcio.etp_sincronizar_tce()
returns integer language plpgsql security definer set search_path = consorcio, public as $$
declare r record; n int := 0;
begin
  perform set_config('consorcio.sincronizando_tce', '1', true);
  -- unidades ativas com CNPJ, por ente (o mesmo CNPJ pode ter várias unidades)
  create temp table if not exists tmp_tce_cnpj (consorcio_id uuid, orgao_id uuid, cnpj text, nome text, quantitativo boolean) on commit drop;
  truncate tmp_tce_cnpj;
  insert into tmp_tce_cnpj
  select o.consorcio_id, o.id, u.cnpj,
         (array_agg(u.nome order by (u.tipo = 'prefeitura') desc, (u.tipo = 'fundo') desc, u.nome))[1],
         bool_or(u.tipo in ('prefeitura', 'fundo'))
  from consorcio.orgaos o
  join consorcio.etp_tce_unidades u on u.municipio = consorcio.etp_municipio_do_ente(o.nome, o.municipio) and u.ativo
  where upper(coalesce(o.uf, '')) = 'RN' and u.cnpj ~ '^\d{14}$'
    and u.cnpj <> regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')
  group by o.consorcio_id, o.id, u.cnpj;

  -- tira o que não vale mais (unidade inativa, CNPJ mudou ou virou o do Cadastro)
  delete from consorcio.etp_entes_cnpj e where e.origem = 'tce'
    and not exists (select 1 from tmp_tce_cnpj t where t.consorcio_id = e.consorcio_id and t.orgao_id = e.orgao_id and t.cnpj = e.cnpj);

  for r in select * from tmp_tce_cnpj loop
    perform consorcio.etp_garantir_orgao(r.cnpj, r.nome, 'RN', case when r.quantitativo then 2 else 4 end);
    insert into consorcio.etp_entes_cnpj (consorcio_id, orgao_id, cnpj, rotulo, origem, quantitativo)
    values (r.consorcio_id, r.orgao_id, r.cnpj, r.nome, 'tce', r.quantitativo)
    on conflict (consorcio_id, orgao_id, cnpj) do update set quantitativo = excluded.quantitativo, rotulo = excluded.rotulo
      where consorcio.etp_entes_cnpj.origem = 'tce';
    if found then n := n + 1; end if;
  end loop;
  perform set_config('consorcio.sincronizando_tce', '', true);
  return n;
end $$;
grant execute on function consorcio.etp_sincronizar_tce() to service_role;

-- roda sozinha quando o CNPJ do Cadastro muda ou chegam unidades do TCE-RN
create or replace function consorcio.etp_sincronizar_tce_gatilho()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  perform consorcio.etp_sincronizar_tce();
  return null;
end $$;
drop trigger if exists etp_entes_tce_sincronizar on consorcio.etp_entes_tce;
drop trigger if exists orgaos_cnpj_sincronizar_tce on consorcio.orgaos;
create trigger orgaos_cnpj_sincronizar_tce after insert or update of cnpj, nome, municipio, uf on consorcio.orgaos
  for each statement execute function consorcio.etp_sincronizar_tce_gatilho();
drop trigger if exists etp_tce_unidades_sincronizar on consorcio.etp_tce_unidades;
create trigger etp_tce_unidades_sincronizar after insert or update of cnpj, ativo, municipio on consorcio.etp_tce_unidades
  for each statement execute function consorcio.etp_sincronizar_tce_gatilho();

-- CNPJ que veio do TCE-RN não sai à mão (voltaria na próxima sincronização)
create or replace function consorcio.etp_entes_cnpj_proteger()
returns trigger language plpgsql set search_path = consorcio, public as $$
begin
  if old.origem = 'tce' and coalesce(current_setting('consorcio.sincronizando_tce', true), '') <> '1' then
    raise exception 'Este CNPJ vem do cadastro de unidades do TCE-RN e é lido sozinho no PNCP.';
  end if;
  return old;
end $$;
drop trigger if exists etp_entes_cnpj_proteger on consorcio.etp_entes_cnpj;
create trigger etp_entes_cnpj_proteger before delete on consorcio.etp_entes_cnpj
  for each row execute function consorcio.etp_entes_cnpj_proteger();

-- painel: origem, se conta nos quantitativos e "sem publicações"
create or replace function consorcio.etp_painel()
returns jsonb language sql stable set search_path = consorcio, public as $$
  with cnpjs as (
    select o.id orgao_id, regexp_replace(o.cnpj, '\D', '', 'g') cnpj, 'Cadastro' rotulo, true do_cadastro, 'cadastro' origem, true quantitativo
      from consorcio.orgaos o where regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') ~ '^\d{14}$'
    union
    select e.orgao_id, e.cnpj, coalesce(e.rotulo, 'Outro CNPJ'), false, e.origem, e.quantitativo from consorcio.etp_entes_cnpj e
  )
  select jsonb_build_object(
    'entes', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'uf', o.uf, 'municipio', o.municipio, 'vinculo', o.vinculo,
        'cnpjs', coalesce((select jsonb_agg(jsonb_build_object('cnpj', c.cnpj, 'rotulo', c.rotulo, 'do_cadastro', c.do_cadastro, 'origem', c.origem, 'quantitativo', c.quantitativo,
            'nome_pncp', g.nome,
            'situacao', case when g.situacao = 'em_dia' and coalesce(g.compras, 0) = 0 then 'sem_publicacoes' else coalesce(g.situacao, 'na_fila') end,
            'compras', coalesce(g.compras, 0), 'itens', coalesce(g.itens, 0),
            'contratos', coalesce(g.contratos, 0), 'ultima_leitura', g.ultima_leitura, 'erro', g.erro,
            'anos', (select jsonb_agg(jsonb_build_object('ano', f.ano, 'concluido', f.concluido, 'lidas', f.ultimo_achado) order by f.ano) from consorcio.etp_fila f where f.cnpj = c.cnpj))
          order by c.do_cadastro desc, c.quantitativo desc, c.rotulo) from cnpjs c left join consorcio.etp_orgaos g on g.cnpj = c.cnpj where c.orgao_id = o.id), '[]'::jsonb))
      order by o.nome) from consorcio.orgaos o), '[]'::jsonb),
    'fila', (select jsonb_build_object('pendentes', count(*) filter (where not concluido), 'total', count(*)) from consorcio.etp_fila f
              where f.cnpj in (select cnpj from cnpjs)),
    'pode_editar', consorcio.pode_editar_etp())
$$;

-- estimativas: o histórico por ente usa só os CNPJs que contam nos quantitativos
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
        union select e.cnpj from consorcio.etp_entes_cnpj e where e.orgao_id = o.id and e.quantitativo) q),
    'cnpjs_fora', (select coalesce(jsonb_agg(jsonb_build_object('cnpj', e.cnpj, 'rotulo', e.rotulo)), '[]'::jsonb) from consorcio.etp_entes_cnpj e where e.orgao_id = o.id and not e.quantitativo))
    order by o.nome), '[]'::jsonb)
  from consorcio.orgaos o
$$;
grant execute on function consorcio.etp_entes_dados() to authenticated;

select consorcio.etp_sincronizar_tce();
notify pgrst, 'reload schema';
