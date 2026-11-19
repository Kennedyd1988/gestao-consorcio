-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 21
-- 1) Cadastro de entes num lugar só: os CNPJs extras (fundos, câmara…) e as unidades do TCE-RN de cada
--    ente passam a ser editados no Cadastro de Consorciados (ficha do ente, aba "CNPJs e fontes"),
--    e qualquer módulo lê dali. O CNPJ da prefeitura no TCE-RN serve para preencher ou conferir o Cadastro.
-- 2) Metodologias de pesquisa de preços padronizadas (critérios e texto), escolhidas em cada estimativa.
-- Requer os scripts 17 a 20. Pode rodar de novo.
-- =====================================================================

-- ---------------------------------------------------------------- permissões: Cadastro ou ETP
create or replace function consorcio.pode_editar_entes()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select coalesce(consorcio.pode_editar_cadastro(), false) or coalesce(consorcio.pode_editar_etp(), false)
$$;
create or replace function consorcio.pode_ver_entes()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.perfil_modulo('etp') is not null or consorcio.perfil_modulo('consorciados') is not null
$$;
grant execute on function consorcio.pode_editar_entes(), consorcio.pode_ver_entes() to authenticated;

do $$
declare t text;
begin
  -- leitura: quem tem o Cadastro também vê os dados públicos ligados aos entes
  foreach t in array array['etp_orgaos','etp_fila','etp_populacao','etp_tce_unidades','etp_tce_fila','etp_indicadores','etp_indicador_valores','etp_indicador_lidos'] loop
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.pode_ver_entes())', t);
  end loop;
  foreach t in array array['etp_entes_cnpj','etp_entes_tce'] loop
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.pode_ver_entes())', t);
    execute format('drop policy if exists gravar on consorcio.%I', t);
    execute format('create policy gravar on consorcio.%I for insert to authenticated with check (consorcio.pode_editar_entes())', t);
    execute format('drop policy if exists alterar on consorcio.%I', t);
    execute format('create policy alterar on consorcio.%I for update to authenticated using (consorcio.pode_editar_entes())', t);
    execute format('drop policy if exists excluir on consorcio.%I', t);
    execute format('create policy excluir on consorcio.%I for delete to authenticated using (consorcio.pode_editar_entes())', t);
  end loop;
end $$;

create or replace function consorcio.etp_incluir_cnpj(p_orgao uuid, p_cnpj text, p_rotulo text default null, p_nome text default null)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); v_uf text;
begin
  if not consorcio.pode_editar_entes() then raise exception 'Sem permissão.'; end if;
  select uf into v_uf from consorcio.orgaos where id = p_orgao and consorcio_id = consorcio.atual();
  if not found then raise exception 'Ente não encontrado neste consórcio.'; end if;
  perform consorcio.etp_garantir_orgao(v_cnpj, p_nome, v_uf, 2);
  insert into consorcio.etp_entes_cnpj (consorcio_id, orgao_id, cnpj, rotulo) values (consorcio.atual(), p_orgao, v_cnpj, nullif(btrim(p_rotulo), ''))
  on conflict (consorcio_id, orgao_id, cnpj) do update set rotulo = excluded.rotulo;
end $$;

create or replace function consorcio.etp_unidade_incluir(p_orgao uuid, p_identificador int, p_incluir boolean)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_entes() then raise exception 'Sem permissão.'; end if;
  insert into consorcio.etp_entes_tce (consorcio_id, orgao_id, identificador, incluir) values (consorcio.atual(), p_orgao, p_identificador, p_incluir)
  on conflict (consorcio_id, orgao_id, identificador) do update set incluir = excluded.incluir, automatico = false;
end $$;

-- Unidades do TCE-RN do município que ainda não estão ligadas ao ente (para o usuário incluir)
create or replace function consorcio.ente_unidades_tce(p_orgao uuid)
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('identificador', u.identificador, 'nome', u.nome, 'tipo', u.tipo, 'cnpj', u.cnpj,
      'incluir', coalesce(x.incluir, false), 'ligada', x.identificador is not null,
      'anos', (select jsonb_agg(jsonb_build_object('ano', f.ano, 'empenhos', f.empenhos, 'lido_em', f.lido_em, 'erro', f.erro) order by f.ano) from consorcio.etp_tce_fila f where f.identificador = u.identificador))
    order by (u.tipo = 'prefeitura') desc, coalesce(x.incluir, false) desc, u.nome), '[]'::jsonb)
  from consorcio.orgaos o
  join consorcio.etp_tce_unidades u on u.municipio = consorcio.etp_municipio_do_ente(o.nome, o.municipio) and u.ativo
  left join consorcio.etp_entes_tce x on x.orgao_id = o.id and x.identificador = u.identificador
  where o.id = p_orgao
$$;
grant execute on function consorcio.ente_unidades_tce(uuid) to authenticated;

-- Conferência do CNPJ do Cadastro com o CNPJ da prefeitura no TCE-RN (entes do RN)
create or replace function consorcio.entes_conferir_cnpj()
returns jsonb language sql stable set search_path = consorcio, public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'nome', o.nome, 'cnpj', regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g'),
      'cnpj_tce', u.cnpj, 'unidade', u.nome,
      'situacao', case when coalesce(o.cnpj, '') = '' then 'falta' when regexp_replace(o.cnpj, '\D', '', 'g') = u.cnpj then 'ok' else 'diferente' end,
      'nome_pncp', (select g.nome from consorcio.etp_orgaos g where g.cnpj = regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g')))
    order by o.nome), '[]'::jsonb)
  from consorcio.orgaos o
  join lateral (select u.* from consorcio.etp_tce_unidades u where u.municipio = consorcio.etp_municipio_do_ente(o.nome, o.municipio) and u.tipo = 'prefeitura' and u.ativo and u.cnpj ~ '^\d{14}$' limit 1) u on true
  where upper(coalesce(o.uf, '')) = 'RN'
$$;
grant execute on function consorcio.entes_conferir_cnpj() to authenticated;

-- Grava o CNPJ no Cadastro (só quem edita o Cadastro)
create or replace function consorcio.ente_definir_cnpj(p_orgao uuid, p_cnpj text)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
declare v text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); v_outro text;
begin
  if not consorcio.pode_editar_cadastro() then raise exception 'Só quem edita o Cadastro de Consorciados pode mudar o CNPJ.'; end if;
  if v !~ '^\d{14}$' then raise exception 'CNPJ inválido.'; end if;
  select nome into v_outro from consorcio.orgaos where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v and id <> p_orgao limit 1;
  if v_outro is not null then raise exception 'O CNPJ já está no cadastro de %.', v_outro; end if;
  update consorcio.orgaos set cnpj = v where id = p_orgao;
  if not found then raise exception 'Ente não encontrado.'; end if;
end $$;
grant execute on function consorcio.ente_definir_cnpj(uuid, text) to authenticated;

-- ---------------------------------------------------------------- metodologias de pesquisa de preços
create table if not exists consorcio.etp_metodologias (
  id uuid primary key default gen_random_uuid(),
  consorcio_id uuid not null default consorcio.atual() references consorcio.consorcios(id),
  nome text not null,
  padrao boolean not null default false,
  params jsonb not null default '{}'::jsonb,
  texto text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists etp_metodologias_padrao on consorcio.etp_metodologias (consorcio_id) where padrao;
alter table consorcio.etp_metodologias enable row level security;
revoke all on consorcio.etp_metodologias from anon, authenticated;
grant select, insert, update, delete on consorcio.etp_metodologias to authenticated;
grant all on consorcio.etp_metodologias to service_role;
drop policy if exists isolar_consorcio on consorcio.etp_metodologias;
create policy isolar_consorcio on consorcio.etp_metodologias as restrictive to authenticated using (consorcio_id = consorcio.atual()) with check (consorcio_id = consorcio.atual());
drop policy if exists ler on consorcio.etp_metodologias;
create policy ler on consorcio.etp_metodologias for select to authenticated using (consorcio.perfil_modulo('etp') is not null);
drop policy if exists gravar on consorcio.etp_metodologias;
create policy gravar on consorcio.etp_metodologias for insert to authenticated with check (consorcio.pode_editar_etp());
drop policy if exists alterar on consorcio.etp_metodologias;
create policy alterar on consorcio.etp_metodologias for update to authenticated using (consorcio.pode_editar_etp());
drop policy if exists excluir on consorcio.etp_metodologias;
create policy excluir on consorcio.etp_metodologias for delete to authenticated using (consorcio.pode_editar_etp());

-- Torna uma metodologia a padrão do consórcio (tira a marca das outras)
create or replace function consorcio.etp_metodologia_padrao(p_id uuid)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar_etp() then raise exception 'Sem permissão.'; end if;
  update consorcio.etp_metodologias set padrao = false where padrao and consorcio_id = consorcio.atual() and id <> p_id;
  update consorcio.etp_metodologias set padrao = true where id = p_id;
end $$;
grant execute on function consorcio.etp_metodologia_padrao(uuid) to authenticated;

insert into consorcio.etp_metodologias (consorcio_id, nome, padrao, params, texto)
select c.id, 'Padrão – art. 23 (mediana, último ano, 70% a 130%)', true,
  '{"janela_meses":12,"ipca":true,"fontes":{"entes":true,"ampliadas":true},"criterio":"percentual","abaixo":70,"acima":130,"desvios":1,"referencia":"mediana","cv_limite":25,"min_precos":3}'::jsonb,
  'A pesquisa de preços observou o art. 23 da Lei nº 14.133/2021. Foram utilizados preços homologados em contratações similares publicadas no Portal Nacional de Contratações Públicas (PNCP) {FONTES}, {JANELA}. {IPCA} {CRITERIO} O valor de referência de cada item corresponde {REFERENCIA} dos preços válidos, exigindo-se no mínimo {MIN} preços por item; quando não atingido esse número, a pesquisa foi complementada por outros parâmetros do art. 23, § 1º, com a devida justificativa.'
from consorcio.consorcios c
where not exists (select 1 from consorcio.etp_metodologias m where m.consorcio_id = c.id);

notify pgrst, 'reload schema';
