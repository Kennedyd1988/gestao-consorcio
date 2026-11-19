-- =====================================================================
-- SOFT+ Consórcios · Gestão de Consórcio · Script 16
-- Itens da IRP com lote, código CATMAT/CATSER, quantidade estimada pelo consórcio
-- e especificação resumida (para o formulário do ente). Pode rodar de novo.
-- =====================================================================

alter table consorcio.irp_itens add column if not exists lote text;
alter table consorcio.irp_itens add column if not exists codigo text;
alter table consorcio.irp_itens add column if not exists qtd_estimada numeric check (qtd_estimada is null or qtd_estimada >= 0);
alter table consorcio.irp_itens add column if not exists resumo text;

comment on column consorcio.irp_itens.lote is 'Lote ou grupo do item (opcional).';
comment on column consorcio.irp_itens.codigo is 'Código CATMAT/CATSER (opcional).';
comment on column consorcio.irp_itens.qtd_estimada is 'Quantidade estimada pelo próprio consórcio, só como referência para os entes.';
comment on column consorcio.irp_itens.resumo is 'Especificação resumida mostrada no formulário do ente; a descrição técnica completa vai no edital.';

-- O formulário público passa a receber os campos novos (mantém dono e segurança da função atual)
do $$
declare v_def text;
begin
  select pg_get_functiondef('consorcio.publico_irp_base(uuid)'::regprocedure) into v_def;
  if position('''resumo'', t.resumo' in v_def) = 0 then
    v_def := replace(v_def, '''unidade'', t.unidade)',
      '''unidade'', t.unidade, ''lote'', t.lote, ''codigo'', t.codigo, ''qtd_estimada'', t.qtd_estimada, ''resumo'', t.resumo)');
    if position('''resumo'', t.resumo' in v_def) = 0 then raise exception 'Não encontrei a lista de itens em publico_irp_base.'; end if;
    execute v_def;
  end if;
end $$;

notify pgrst, 'reload schema';
