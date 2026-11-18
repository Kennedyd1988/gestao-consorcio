-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 08_precos_reequilibrio.sql  (reexecutável, schema consorcio, rodar depois do 07)
--
-- Reequilíbrio econômico-financeiro com linha do tempo de preços por item:
--   · consorcio.precos: cada preço do item e a data a partir da qual vale (original e reequilíbrios);
--   · cada item de pedido guarda o preço unitário da época (pedido_itens.preco_unitario), definido
--     pela data do ofício; ofício, mapa e relatórios passam a usar esse preço;
--   · registrar_reequilibrio(item, preço, desde, instrumento) e definir_preco_adesao(pedido_item, preço).
-- =====================================================================

create table if not exists consorcio.precos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references consorcio.itens(id),
  preco numeric(18,4) not null check (preco >= 0),
  vigente_desde date not null,
  instrumento text,
  observacoes text,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  unique (item_id, vigente_desde)
);
create index if not exists precos_item on consorcio.precos(item_id, vigente_desde);

alter table consorcio.pedido_itens add column if not exists preco_unitario numeric(18,4);
alter table consorcio.pedido_itens add column if not exists preco_conferir boolean not null default false;

-- Preço do item numa data (último preço com vigente_desde <= data; sem linha do tempo, o preço do item)
create or replace function consorcio.preco_na_data(p_item uuid, p_data date)
returns numeric language sql stable set search_path = consorcio, public as $$
  select coalesce(
    (select preco from consorcio.precos where item_id = p_item and vigente_desde <= coalesce(p_data, current_date) order by vigente_desde desc limit 1),
    (select preco from consorcio.precos where item_id = p_item order by vigente_desde limit 1),
    (select preco_unitario from consorcio.itens where id = p_item));
$$;

-- Ao lançar um item de pedido, congela o preço da data do ofício
create or replace function consorcio.congelar_preco()
returns trigger language plpgsql set search_path = consorcio, public as $$
begin
  if new.preco_unitario is null then
    new.preco_unitario := consorcio.preco_na_data(new.item_id, (select data_oficio from consorcio.pedidos where id = new.pedido_id));
  end if;
  return new;
end $$;
drop trigger if exists congelar_preco on consorcio.pedido_itens;
create trigger congelar_preco before insert on consorcio.pedido_itens for each row execute function consorcio.congelar_preco();

-- Cria a linha do preço original do item, se ainda não houver linha do tempo
create or replace function consorcio.garantir_preco_original(p_item uuid)
returns void language plpgsql set search_path = consorcio, public as $$
declare v_item consorcio.itens; v_desde date;
begin
  if exists (select 1 from consorcio.precos where item_id = p_item) then return; end if;
  select * into v_item from consorcio.itens where id = p_item;
  if v_item.preco_unitario is null then return; end if;
  select coalesce(a.data_assinatura, (select min(inicio) from consorcio.periodos where ata_id = a.id), '2000-01-01')
    into v_desde from consorcio.atas a where a.id = v_item.ata_id;
  insert into consorcio.precos (item_id, preco, vigente_desde, instrumento) values (p_item, v_item.preco_unitario, v_desde, 'Preço registrado na ata');
end $$;

-- Registra um reequilíbrio (ou corrige a linha do mesmo dia). Os pedidos já lançados mantêm o preço da época.
create or replace function consorcio.registrar_reequilibrio(p_item uuid, p_preco numeric, p_desde date, p_instrumento text, p_obs text default null)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  if p_preco is null or p_preco < 0 then raise exception 'Informe o novo preço.'; end if;
  if p_desde is null then raise exception 'Informe a data a partir da qual o novo preço vale.'; end if;
  perform consorcio.garantir_preco_original(p_item);
  insert into consorcio.precos (item_id, preco, vigente_desde, instrumento, observacoes, criado_por_nome)
  values (p_item, p_preco, p_desde, p_instrumento, p_obs, (select nome from consorcio.usuarios where id = auth.uid()))
  on conflict (item_id, vigente_desde) do update set preco = excluded.preco, instrumento = excluded.instrumento, observacoes = excluded.observacoes;
  update consorcio.itens set preco_unitario = consorcio.preco_na_data(p_item, current_date) where id = p_item;
end $$;

-- Excluir uma linha da linha do tempo (só reequilíbrios; o preço original fica)
create or replace function consorcio.excluir_preco(p_id uuid)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
declare v consorcio.precos;
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  select * into v from consorcio.precos where id = p_id;
  if not found then return; end if;
  if v.vigente_desde = (select min(vigente_desde) from consorcio.precos where item_id = v.item_id) then raise exception 'O preço original não pode ser excluído; corrija o valor.'; end if;
  delete from consorcio.precos where id = p_id;
  update consorcio.itens set preco_unitario = consorcio.preco_na_data(v.item_id, current_date) where id = v.item_id;
end $$;

-- Define à mão o preço de uma adesão (histórico sem data, por exemplo)
create or replace function consorcio.definir_preco_adesao(p_pedido_item uuid, p_preco numeric)
returns void language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  update consorcio.pedido_itens set preco_unitario = p_preco, preco_conferir = false where id = p_pedido_item;
end $$;

-- Recalcula o preço das adesões de um item pela data do ofício (usado depois de montar a linha do tempo);
-- as que não têm data ficam marcadas para conferir quando o item tem mais de um preço.
create or replace function consorcio.recalcular_precos_item(p_item uuid)
returns int language plpgsql security invoker set search_path = consorcio, public as $$
declare n int; varios boolean;
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  select count(*) > 1 into varios from consorcio.precos where item_id = p_item;
  update consorcio.pedido_itens pi set
    preco_unitario = case when p.data_oficio is not null or not varios then consorcio.preco_na_data(p_item, p.data_oficio) else pi.preco_unitario end,
    preco_conferir = (p.data_oficio is null and varios)
  from consorcio.pedidos p where p.id = pi.pedido_id and pi.item_id = p_item;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function consorcio.confirmar_atualizacao(p_id uuid, p_dados jsonb default null)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare
  a consorcio.pncp_atualizacoes; d jsonb; v_ata uuid; v_num int; it jsonb; v_item consorcio.itens;
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  select * into a from consorcio.pncp_atualizacoes where id = p_id for update;
  if not found then raise exception 'Atualização não encontrada.'; end if;
  if a.situacao <> 'pendente' then raise exception 'Esta atualização já foi decidida.'; end if;
  d := coalesce(p_dados, a.dados);

  if a.tipo = 'nova_ata' then
    if exists (select 1 from consorcio.atas where numero = d->>'numero') then
      raise exception 'Já existe a ARP % no sistema.', d->>'numero';
    end if;
    insert into consorcio.atas (pregao, numero, processo, objeto, detentora, cnpj_detentora, data_assinatura, clausulas_adesao, observacoes, numero_controle_pncp)
    values (d->>'pregao', d->>'numero', d->>'processo', d->>'objeto', d->>'detentora', nullif(regexp_replace(coalesce(d->>'cnpj_detentora',''), '\D', '', 'g'), ''),
            (d->>'data_assinatura')::date, coalesce(d->>'clausulas_adesao', '4.1 a 4.3'),
            'Importada do PNCP em ' || to_char(now(), 'DD/MM/YYYY') || '. Conferir numeração dos itens com a ata.', a.numero_controle)
    returning id into v_ata;
    for it in select * from jsonb_array_elements(coalesce(d->'itens', '[]')) loop
      insert into consorcio.itens (ata_id, numero, descricao, unidade, qtd_registrada, preco_unitario)
      values (v_ata, (it->>'numero')::int, it->>'descricao', it->>'unidade', (it->>'qtd')::numeric, nullif(it->>'preco','')::numeric);
    end loop;
    insert into consorcio.periodos (ata_id, numero, inicio, fim, instrumento, observacoes)
    values (v_ata, 1, (d->>'inicio')::date, (d->>'fim')::date, 'Vigência original', 'Conforme PNCP');

  elsif a.tipo = 'prorrogacao' then
    select coalesce(max(numero), 0) + 1 into v_num from consorcio.periodos where ata_id = a.ata_id;
    if v_num = 1 then
      raise exception 'A ARP % não tem a vigência original cadastrada. Cadastre-a na tela da ata antes de confirmar.', a.ata_numero;
    end if;
    insert into consorcio.periodos (ata_id, numero, inicio, fim, renova_quantitativos, instrumento, observacoes)
    values (a.ata_id, v_num, (d->>'inicio')::date, (d->>'fim')::date, coalesce((d->>'renova')::boolean, false),
            coalesce(d->>'instrumento', a.documento_titulo), 'Confirmado a partir do PNCP');

  elsif a.tipo = 'reequilibrio' then
    for it in select * from jsonb_array_elements(coalesce(d->'itens', '[]')) loop
      select * into v_item from consorcio.itens where ata_id = a.ata_id and numero = (it->>'numero')::int;
      if not found then raise exception 'Item % não existe na ARP %.', it->>'numero', a.ata_numero; end if;
      perform consorcio.registrar_reequilibrio(v_item.id, (it->>'preco_novo')::numeric, coalesce((d->>'desde')::date, current_date),
        coalesce(d->>'instrumento', a.documento_titulo), 'Confirmado a partir do PNCP');
    end loop;

  elsif a.tipo = 'cancelamento' then
    update consorcio.atas set ativo = false,
      observacoes = coalesce(observacoes || ' ', '') || 'Cancelada no PNCP em ' || coalesce(d->>'data', to_char(now(), 'DD/MM/YYYY')) || '.'
    where id = a.ata_id;
  end if;

  update consorcio.pncp_atualizacoes set situacao = 'confirmada', dados = d, decidido_por = auth.uid(),
    decidido_por_nome = (select nome from consorcio.usuarios where id = auth.uid()), decidido_em = now()
  where id = p_id;
end $$;

-- Histórico antigo de reequilíbrios confirmados pelo PNCP vai para a linha do tempo
insert into consorcio.precos (item_id, preco, vigente_desde, instrumento, observacoes)
select h.item_id, h.preco_novo, h.registrado_em::date, h.instrumento, 'Migrado do histórico de reequilíbrios'
from consorcio.precos_historico h
on conflict (item_id, vigente_desde) do nothing;

-- Pedidos já lançados recebem o preço atual do item (o preço da época é ajustado na tela do item)
update consorcio.pedido_itens pi set preco_unitario = i.preco_unitario from consorcio.itens i where i.id = pi.item_id and pi.preco_unitario is null;

alter table consorcio.precos enable row level security;
drop policy if exists ler on consorcio.precos;
create policy ler on consorcio.precos for select to authenticated using (consorcio.meu_perfil() is not null);
drop policy if exists inserir on consorcio.precos;
create policy inserir on consorcio.precos for insert to authenticated with check (consorcio.pode_editar());
drop policy if exists alterar on consorcio.precos;
create policy alterar on consorcio.precos for update to authenticated using (consorcio.pode_editar()) with check (consorcio.pode_editar());
drop policy if exists excluir on consorcio.precos;
create policy excluir on consorcio.precos for delete to authenticated using (consorcio.pode_editar());
grant select, insert, update, delete on consorcio.precos to authenticated;
grant all on consorcio.precos to service_role;
grant execute on function consorcio.preco_na_data(uuid, date), consorcio.registrar_reequilibrio(uuid, numeric, date, text, text), consorcio.excluir_preco(uuid),
  consorcio.definir_preco_adesao(uuid, numeric), consorcio.recalcular_precos_item(uuid), consorcio.garantir_preco_original(uuid) to authenticated;

select 'ok' as resultado;
