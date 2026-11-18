-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 04_pncp.sql  (reexecutável, schema consorcio, rodar depois do 03)
--
-- Atualização diária pelo PNCP: a função "consorcio-pncp" compara as atas do CIMOP no PNCP com o
-- sistema, lê os termos aditivos (PDF) e grava PROPOSTAS em consorcio.pncp_atualizacoes.
-- Nada entra nos saldos sem confirmação: o usuário confirma ou ignora cada proposta no painel.
-- Agenda: todo dia às 04:00 (horário de Brasília) pelo pg_cron + pg_net (gratuitos).
-- =====================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table consorcio.atas add column if not exists numero_controle_pncp text;
create unique index if not exists atas_numero_controle_pncp on consorcio.atas(numero_controle_pncp) where numero_controle_pncp is not null;

create table if not exists consorcio.pncp_config (
  id int primary key default 1 check (id = 1),
  cnpj text not null default '15185079000140',
  desde date not null default '2024-01-01',
  chave_sinc text not null default md5(random()::text || clock_timestamp()::text) || md5(random()::text),
  ultima_execucao timestamptz,
  ultimo_resultado jsonb
);
insert into consorcio.pncp_config (id) values (1) on conflict do nothing;

create table if not exists consorcio.pncp_atualizacoes (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,                  -- evita repetir a mesma proposta
  tipo text not null check (tipo in ('nova_ata','prorrogacao','reequilibrio','cancelamento')),
  ata_id uuid references consorcio.atas(id) on delete no action,
  ata_numero text,
  numero_controle text,
  resumo text not null,
  dados jsonb not null default '{}',
  documento_titulo text,
  documento_url text,
  situacao text not null default 'pendente' check (situacao in ('pendente','confirmada','ignorada')),
  decidido_por uuid,
  decidido_por_nome text,
  decidido_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists pncp_atualizacoes_situacao on consorcio.pncp_atualizacoes(situacao);

create table if not exists consorcio.pncp_documentos (
  url text primary key,
  titulo text,
  ata_id uuid references consorcio.atas(id) on delete no action,
  resultado text,
  lido_em timestamptz not null default now()
);

create table if not exists consorcio.precos_historico (
  id bigserial primary key,
  item_id uuid not null references consorcio.itens(id) on delete no action,
  preco_anterior numeric(18,4),
  preco_novo numeric(18,4) not null,
  instrumento text,
  registrado_em timestamptz not null default now(),
  registrado_por uuid default auth.uid()
);

-- ---------- Confirmar / ignorar proposta ------------------------------------
-- p_dados (opcional) = dados conferidos/editados na tela; se nulo, usa os da proposta.
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
      select * into v_item from consorcio.itens where ata_id = a.ata_id and numero = (it->>'numero')::int for update;
      if not found then raise exception 'Item % não existe na ARP %.', it->>'numero', a.ata_numero; end if;
      insert into consorcio.precos_historico (item_id, preco_anterior, preco_novo, instrumento)
      values (v_item.id, v_item.preco_unitario, (it->>'preco_novo')::numeric, coalesce(d->>'instrumento', a.documento_titulo));
      update consorcio.itens set preco_unitario = (it->>'preco_novo')::numeric where id = v_item.id;
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

create or replace function consorcio.ignorar_atualizacao(p_id uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão.'; end if;
  update consorcio.pncp_atualizacoes set situacao = 'ignorada', decidido_por = auth.uid(),
    decidido_por_nome = (select nome from consorcio.usuarios where id = auth.uid()), decidido_em = now()
  where id = p_id and situacao = 'pendente';
end $$;

-- ---------- RLS e permissões -------------------------------------------------
alter table consorcio.pncp_config enable row level security;
alter table consorcio.pncp_atualizacoes enable row level security;
alter table consorcio.pncp_documentos enable row level security;
alter table consorcio.precos_historico enable row level security;
do $$ declare t text; begin
  foreach t in array array['pncp_atualizacoes','pncp_documentos','precos_historico'] loop
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('create policy ler on consorcio.%I for select to authenticated using (consorcio.meu_perfil() is not null)', t);
  end loop;
end $$;
-- pncp_config: a chave de sincronização não é lida pelo painel; só a data e o resultado
drop policy if exists ler on consorcio.pncp_config;
create policy ler on consorcio.pncp_config for select to authenticated using (consorcio.meu_perfil() is not null);
revoke all on consorcio.pncp_config from authenticated, anon;
grant select (id, cnpj, desde, ultima_execucao, ultimo_resultado) on consorcio.pncp_config to authenticated;
grant select on consorcio.pncp_atualizacoes, consorcio.pncp_documentos, consorcio.precos_historico to authenticated;
grant all on consorcio.pncp_config, consorcio.pncp_atualizacoes, consorcio.pncp_documentos, consorcio.precos_historico to service_role;
grant usage, select on all sequences in schema consorcio to service_role, authenticated;
grant select, update on consorcio.atas, consorcio.itens to service_role;
grant execute on function consorcio.confirmar_atualizacao(uuid, jsonb), consorcio.ignorar_atualizacao(uuid) to authenticated;

-- ---------- Agenda diária (04:00 de Brasília = 07:00 UTC) ---------------------
do $$ begin perform cron.unschedule('consorcio-pncp-diario'); exception when others then null; end $$;
select cron.schedule('consorcio-pncp-diario', '0 7 * * *', $cron$
  select net.http_post(
    url := 'https://gyjfkhyufubtmowgjgrq.supabase.co/functions/v1/consorcio-pncp',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-chave-sinc', (select chave_sinc from consorcio.pncp_config where id = 1)),
    body := '{"origem":"agenda"}'::jsonb,
    timeout_milliseconds := 120000)
$cron$);

-- Liga as atas já cadastradas ao PNCP (a função também faz isso sozinha)
select 'ok' as script_04;
