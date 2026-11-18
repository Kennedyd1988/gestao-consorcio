-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 07_corrigir_pedido.sql  (reexecutável, schema consorcio, rodar depois do 06)
--
-- Corrigir itens e quantidades de um pedido já lançado: o pedido original é cancelado como
-- "substituído" (fica no histórico, com o número marcado) e um pedido novo é registrado com o
-- MESMO número de ofício, conferindo de novo os limites de 50% e do dobro sem contar o original.
-- =====================================================================

alter table consorcio.pedidos add column if not exists substitui_id uuid references consorcio.pedidos(id);
alter table consorcio.pedidos add column if not exists substituido_por uuid references consorcio.pedidos(id);

create or replace function consorcio.substituir_pedido(p_id uuid, p jsonb)
returns uuid language plpgsql security invoker set search_path = consorcio, public as $$
declare
  v_orig consorcio.pedidos; v_novo uuid; v_num text; v_nome text;
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão para corrigir pedidos.'; end if;
  select * into v_orig from consorcio.pedidos where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if v_orig.situacao = 'cancelado' then raise exception 'Este pedido já foi cancelado ou substituído.'; end if;
  select nome into v_nome from consorcio.usuarios where id = auth.uid();
  v_num := coalesce(nullif(trim(p->>'numero_oficio'), ''), v_orig.numero_oficio);

  -- o original sai do saldo e libera o número
  update consorcio.pedidos
     set situacao = 'cancelado',
         motivo_cancelamento = 'Substituído pela correção de itens e quantidades em ' || to_char(now() at time zone 'America/Fortaleza', 'DD/MM/YYYY HH24:MI') || coalesce(' por ' || v_nome, '') || '.',
         numero_oficio = case when numero_oficio is null then null else numero_oficio || ' (substituído em ' || to_char(now() at time zone 'America/Fortaleza', 'DD/MM/YYYY HH24:MI:SS') || ')' end
   where id = p_id;

  v_novo := consorcio.registrar_pedido(p || jsonb_build_object('numero_oficio', v_num));
  update consorcio.pedidos set substitui_id = p_id where id = v_novo;
  update consorcio.pedidos set substituido_por = v_novo where id = p_id;
  update consorcio.solicitacoes set pedido_id = v_novo where pedido_id = p_id;
  return v_novo;
end $$;

grant execute on function consorcio.substituir_pedido(uuid, jsonb) to authenticated;

select 'ok' as resultado;
