-- 23: desempenho da conferência de CNPJs e das unidades do TCE-RN (erro "statement timeout").
-- Reexecutável. Já aplicado no banco em 19/11/2026.
-- As permissões passam a ser avaliadas uma vez por consulta (select …) em vez de linha a linha,
-- e as duas funções da aba "CNPJs e fontes de dados" calculam o município uma vez só.

create index if not exists etp_tce_unidades_municipio on consorcio.etp_tce_unidades (municipio);

do $$ declare t text; begin
  foreach t in array array['etp_orgaos','etp_fila','etp_populacao','etp_tce_unidades','etp_tce_fila','etp_indicadores','etp_indicador_valores','etp_indicador_lidos','etp_entes_cnpj','etp_entes_tce'] loop
    execute format('alter policy ler on consorcio.%I using ((select consorcio.pode_ver_entes()))', t);
  end loop;
  foreach t in array array['etp_entes_cnpj','etp_entes_tce'] loop
    execute format('alter policy gravar on consorcio.%I with check ((select consorcio.pode_editar_entes()))', t);
    execute format('alter policy alterar on consorcio.%I using ((select consorcio.pode_editar_entes()))', t);
    execute format('alter policy excluir on consorcio.%I using ((select consorcio.pode_editar_entes()))', t);
  end loop;
end $$;

create or replace function consorcio.entes_conferir_cnpj()
returns jsonb language plpgsql stable security definer set search_path = consorcio, public as $$
begin
  if not consorcio.pode_ver_entes() then raise exception 'Sem permissão.'; end if;
  return (
    with e as (
      select o.id, o.nome, regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') cnpj, consorcio.etp_municipio_do_ente(o.nome, o.municipio) mun
      from consorcio.orgaos o where o.consorcio_id = consorcio.atual() and upper(coalesce(o.uf, '')) = 'RN')
    select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'cnpj', e.cnpj,
        'cnpj_tce', u.cnpj, 'unidade', u.nome,
        'situacao', case when e.cnpj = '' then 'falta' when e.cnpj = u.cnpj then 'ok' else 'diferente' end,
        'nome_pncp', (select g.nome from consorcio.etp_orgaos g where g.cnpj = e.cnpj))
      order by e.nome), '[]'::jsonb)
    from e join lateral (select u.cnpj, u.nome from consorcio.etp_tce_unidades u where u.municipio = e.mun and u.tipo = 'prefeitura' and u.ativo and u.cnpj ~ '^\d{14}$' limit 1) u on true);
end $$;

create or replace function consorcio.ente_unidades_tce(p_orgao uuid)
returns jsonb language plpgsql stable security definer set search_path = consorcio, public as $$
declare v_mun text;
begin
  if not consorcio.pode_ver_entes() then raise exception 'Sem permissão.'; end if;
  select consorcio.etp_municipio_do_ente(nome, municipio) into v_mun from consorcio.orgaos where id = p_orgao and consorcio_id = consorcio.atual();
  if v_mun is null then return '[]'::jsonb; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('identificador', u.identificador, 'nome', u.nome, 'tipo', u.tipo, 'cnpj', u.cnpj,
      'incluir', coalesce(x.incluir, false), 'ligada', x.identificador is not null,
      'anos', (select jsonb_agg(jsonb_build_object('ano', f.ano, 'empenhos', f.empenhos, 'lido_em', f.lido_em, 'erro', f.erro) order by f.ano) from consorcio.etp_tce_fila f where f.identificador = u.identificador))
    order by (u.tipo = 'prefeitura') desc, coalesce(x.incluir, false) desc, u.nome), '[]'::jsonb)
  from consorcio.etp_tce_unidades u
  left join consorcio.etp_entes_tce x on x.orgao_id = p_orgao and x.identificador = u.identificador
  where u.municipio = v_mun and u.ativo);
end $$;
grant execute on function consorcio.entes_conferir_cnpj(), consorcio.ente_unidades_tce(uuid) to authenticated;
notify pgrst, 'reload schema';
