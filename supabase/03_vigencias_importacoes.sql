-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 03_vigencias_importacoes.sql  (reexecutável, schema consorcio, rodar depois do 01 e 02)
--
-- 1) Períodos de vigência da ata (vigência original + prorrogações por termo aditivo).
--    Quando a prorrogação RENOVA os quantitativos, começa um novo "ciclo": os limites de 50% por
--    órgão e do dobro por item passam a contar só as adesões do novo ciclo (o saldo antigo não
--    se soma). Prorrogação SEM renovação continua o mesmo ciclo (o saldo segue acumulando).
-- 2) Registro das planilhas importadas, para bloquear a mesma planilha duas vezes.
-- =====================================================================

create table if not exists consorcio.periodos (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references consorcio.atas(id) on delete no action,
  numero int not null check (numero >= 1),             -- 1 = vigência original; 2 = 1ª prorrogação…
  inicio date not null,
  fim date not null,
  renova_quantitativos boolean not null default false,  -- só faz sentido a partir do período 2
  instrumento text,                                     -- ex.: "1º Termo Aditivo, de 13/11/2026"
  observacoes text,
  criado_em timestamptz not null default now(),
  unique (ata_id, numero),
  check (fim >= inicio)
);

alter table consorcio.pedido_itens add column if not exists periodo_id uuid references consorcio.periodos(id) on delete no action;

create table if not exists consorcio.importacoes (
  id uuid primary key default gen_random_uuid(),
  hash text not null unique,          -- SHA-256 do arquivo
  arquivo text,
  resumo jsonb,
  criado_por uuid default auth.uid(),
  criado_por_nome text,
  criado_em timestamptz not null default now()
);

-- ---------- Funções de ciclo -------------------------------------------
create or replace function consorcio.periodo_na_data(p_ata uuid, p_data date)
returns uuid language sql stable set search_path = consorcio, public as $$
  select id from consorcio.periodos where ata_id = p_ata and p_data between inicio and fim order by numero desc limit 1
$$;

-- Ciclo = período que abriu a contagem (o 1º ou o último que renovou quantitativos até ele).
-- periodo nulo (adesões antigas sem período) = ciclo do período 1.
create or replace function consorcio.ciclo_de(p_periodo uuid, p_ata uuid)
returns uuid language sql stable set search_path = consorcio, public as $$
  select c.id from consorcio.periodos c
  where c.ata_id = p_ata
    and c.numero <= coalesce((select numero from consorcio.periodos where id = p_periodo), 1)
    and (c.numero = 1 or c.renova_quantitativos)
  order by c.numero desc limit 1
$$;

-- Ciclo vigente hoje (ou o do último período, se a ata já venceu)
create or replace function consorcio.ciclo_atual(p_ata uuid)
returns uuid language sql stable set search_path = consorcio, public as $$
  select consorcio.ciclo_de(coalesce(consorcio.periodo_na_data(p_ata, current_date),
    (select id from consorcio.periodos where ata_id = p_ata order by numero desc limit 1)), p_ata)
$$;

-- A vigência da ata acompanha o último período
create or replace function consorcio.sincronizar_vigencia()
returns trigger language plpgsql security definer set search_path = consorcio, public as $$
declare v_ata uuid := coalesce(new.ata_id, old.ata_id);
begin
  update consorcio.atas a set
    vigencia_fim = (select max(fim) from consorcio.periodos where ata_id = v_ata),
    prorrogada = (select count(*) > 1 from consorcio.periodos where ata_id = v_ata)
  where a.id = v_ata;
  return null;
end $$;
drop trigger if exists sincronizar_vigencia on consorcio.periodos;
create trigger sincronizar_vigencia after insert or update or delete on consorcio.periodos
  for each row execute function consorcio.sincronizar_vigencia();
drop trigger if exists hist_periodos on consorcio.periodos;
create trigger hist_periodos after insert or update or delete on consorcio.periodos for each row execute function consorcio.registrar_historico();

-- ---------- Saldos passam a contar só o ciclo atual -----------------------
create or replace view consorcio.v_saldo_itens with (security_invoker = true) as
select i.id as item_id, i.ata_id, i.numero, i.descricao, i.unidade, i.qtd_registrada, i.preco_unitario,
       coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
         and consorcio.ciclo_de(pi.periodo_id, i.ata_id) is not distinct from consorcio.ciclo_atual(i.ata_id)), 0) as aderido,
       2 * i.qtd_registrada - coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
         and consorcio.ciclo_de(pi.periodo_id, i.ata_id) is not distinct from consorcio.ciclo_atual(i.ata_id)), 0) as saldo_dobro
from consorcio.itens i
left join consorcio.pedido_itens pi on pi.item_id = i.id
left join consorcio.pedidos p on p.id = pi.pedido_id
group by i.id;

create or replace view consorcio.v_saldo_itens_publico as
select i.id as item_id,
       coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
         and consorcio.ciclo_de(pi.periodo_id, i.ata_id) is not distinct from consorcio.ciclo_atual(i.ata_id)), 0) as aderido
from consorcio.itens i
left join consorcio.pedido_itens pi on pi.item_id = i.id
left join consorcio.pedidos p on p.id = pi.pedido_id
group by i.id;
revoke all on consorcio.v_saldo_itens_publico from anon, authenticated;

create or replace function consorcio.publico_orgao(p_cnpj text)
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object(
    'orgao', (select jsonb_build_object('nome', o.nome, 'municipio', o.municipio, 'uf', o.uf, 'esfera', o.esfera, 'responsavel', o.responsavel, 'cargo', o.cargo, 'email', o.email)
              from consorcio.orgaos o where o.cnpj = regexp_replace(p_cnpj, '\D', '', 'g') and o.ativo),
    'aderido', (select coalesce(jsonb_object_agg(s.item_id, s.q), '{}') from (
                  select pi.item_id, sum(pi.qtd_autorizada) q from consorcio.pedido_itens pi
                  join consorcio.pedidos p on p.id = pi.pedido_id
                  join consorcio.orgaos o on o.id = p.orgao_id
                  join consorcio.itens i on i.id = pi.item_id
                  where o.cnpj = regexp_replace(p_cnpj, '\D', '', 'g') and p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
                    and consorcio.ciclo_de(pi.periodo_id, i.ata_id) is not distinct from consorcio.ciclo_atual(i.ata_id)
                  group by pi.item_id) s)
  )
$$;

-- ---------- Registro do pedido com período/ciclo ---------------------------
-- itens: [{item_id, qtd, periodo?}]  (periodo = nº do período, só na migração)
create or replace function consorcio.registrar_pedido(p jsonb)
returns uuid language plpgsql security invoker set search_path = consorcio, public as $$
declare
  v_id uuid; v_org consorcio.orgaos; v_data date := coalesce((p->>'data_oficio')::date, current_date);
  v_item consorcio.itens; v_ata consorcio.atas; l jsonb; q numeric; u_org numeric; u_tot numeric;
  v_dec text; v_mot text; n_aut int := 0; n_neg int := 0;
  v_forcar boolean := coalesce((p->>'origem')='migracao', false) and consorcio.e_admin();
  v_per uuid; v_ciclo uuid; v_tem_periodos boolean;
begin
  if not consorcio.pode_editar() then raise exception 'Sem permissão para lançar pedidos.'; end if;
  select * into v_org from consorcio.orgaos where id = (p->>'orgao_id')::uuid;
  if not found then raise exception 'Órgão não encontrado.'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then raise exception 'Informe ao menos um item.'; end if;

  insert into consorcio.pedidos(numero_oficio, data_oficio, orgao_id, oficio_solicitante, data_solicitante,
                             finalidade, anexos_texto, origem, criado_por_nome)
  values (nullif(trim(p->>'numero_oficio'),''), case when v_forcar then (p->>'data_oficio')::date else v_data end, v_org.id, p->>'oficio_solicitante',
          (p->>'data_solicitante')::date, p->>'finalidade', p->>'anexos_texto',
          coalesce(p->>'origem','sistema'), (select nome from consorcio.usuarios where id = auth.uid()))
  returning id into v_id;

  for l in select * from jsonb_array_elements(p->'itens') loop
    q := (l->>'qtd')::numeric;
    select * into v_item from consorcio.itens where id = (l->>'item_id')::uuid for update;
    if not found then raise exception 'Item não encontrado.'; end if;
    select * into v_ata from consorcio.atas where id = v_item.ata_id;
    select exists(select 1 from consorcio.periodos where ata_id = v_ata.id) into v_tem_periodos;

    -- período do pedido
    if v_forcar and (l->>'periodo') is not null then
      select id into v_per from consorcio.periodos where ata_id = v_ata.id and numero = (l->>'periodo')::int;
    elsif v_forcar and (p->>'data_oficio') is null then
      select id into v_per from consorcio.periodos where ata_id = v_ata.id and numero = 1;
    else
      v_per := consorcio.periodo_na_data(v_ata.id, v_data);
    end if;
    v_ciclo := consorcio.ciclo_de(v_per, v_ata.id);

    select coalesce(sum(pi.qtd_autorizada),0) into u_org from consorcio.pedido_itens pi join consorcio.pedidos pp on pp.id = pi.pedido_id
     where pi.item_id = v_item.id and pp.orgao_id = v_org.id and pp.situacao <> 'cancelado' and pi.decisao = 'autorizado'
       and consorcio.ciclo_de(pi.periodo_id, v_ata.id) is not distinct from v_ciclo;
    select coalesce(sum(pi.qtd_autorizada),0) into u_tot from consorcio.pedido_itens pi join consorcio.pedidos pp on pp.id = pi.pedido_id
     where pi.item_id = v_item.id and pp.situacao <> 'cancelado' and pi.decisao = 'autorizado'
       and consorcio.ciclo_de(pi.periodo_id, v_ata.id) is not distinct from v_ciclo;

    v_dec := 'autorizado'; v_mot := null;
    if v_forcar then
      null;
    elsif v_org.esfera = 'Federal' then
      v_dec := 'negado'; v_mot := 'Vedada a adesão de órgão ou entidade federal a ata gerenciada por ente municipal ou consórcio de municípios (art. 86, § 8º, da Lei nº 14.133/2021).';
    elsif v_tem_periodos and v_per is null then
      v_dec := 'negado'; v_mot := 'Data do pedido fora da vigência da ata.';
    elsif not v_tem_periodos and v_ata.vigencia_fim is not null and v_data > v_ata.vigencia_fim then
      v_dec := 'negado'; v_mot := 'Ata com vigência encerrada em ' || to_char(v_ata.vigencia_fim,'DD/MM/YYYY') || '.';
    elsif round(u_org + q, 4) > round(v_item.qtd_registrada * 0.5, 4) then
      v_dec := 'negado'; v_mot := 'Ultrapassa o limite de 50% por órgão (art. 86, § 4º, da Lei nº 14.133/2021).';
    elsif round(u_tot + q, 4) > round(v_item.qtd_registrada * 2, 4) then
      v_dec := 'negado'; v_mot := 'Ultrapassa o limite total do dobro do quantitativo registrado (art. 86, § 5º, da Lei nº 14.133/2021).';
    end if;

    insert into consorcio.pedido_itens(pedido_id, item_id, qtd_solicitada, qtd_autorizada, decisao, motivo, usado_orgao_antes, usado_total_antes, periodo_id)
    values (v_id, v_item.id, q, case when v_dec='autorizado' then q else 0 end, v_dec, v_mot, u_org, u_tot, v_per);
    if v_dec = 'autorizado' then n_aut := n_aut + 1; else n_neg := n_neg + 1; end if;
  end loop;

  update consorcio.pedidos set situacao = case when n_neg = 0 then 'autorizado' when n_aut = 0 then 'negado' else 'parcial' end
   where id = v_id;
  return v_id;
end $$;

-- ---------- Permissões e RLS --------------------------------------------
alter table consorcio.periodos enable row level security;
alter table consorcio.importacoes enable row level security;
drop policy if exists ler on consorcio.periodos;
create policy ler on consorcio.periodos for select to authenticated using (consorcio.meu_perfil() is not null);
drop policy if exists inserir on consorcio.periodos;
create policy inserir on consorcio.periodos for insert to authenticated with check (consorcio.pode_editar());
drop policy if exists alterar on consorcio.periodos;
create policy alterar on consorcio.periodos for update to authenticated using (consorcio.pode_editar()) with check (consorcio.pode_editar());
drop policy if exists ler on consorcio.importacoes;
create policy ler on consorcio.importacoes for select to authenticated using (consorcio.meu_perfil() is not null);
drop policy if exists inserir on consorcio.importacoes;
create policy inserir on consorcio.importacoes for insert to authenticated with check (consorcio.pode_editar());

grant select, insert, update on consorcio.periodos to authenticated;
grant select, insert on consorcio.importacoes to authenticated;
grant select on consorcio.v_saldo_itens to authenticated;
grant all on consorcio.periodos, consorcio.importacoes to service_role;
grant execute on function consorcio.periodo_na_data(uuid, date), consorcio.ciclo_de(uuid, uuid), consorcio.ciclo_atual(uuid) to authenticated, anon;
grant execute on function consorcio.publico_orgao(text) to anon, authenticated;
grant execute on function consorcio.registrar_pedido(jsonb) to authenticated;

-- Atas que já têm vigência e ainda não têm período: cria o período 1 a partir dela
insert into consorcio.periodos (ata_id, numero, inicio, fim, instrumento)
select a.id, 1, coalesce(a.data_assinatura, a.vigencia_fim - interval '1 year' + interval '1 day')::date, a.vigencia_fim, 'Vigência original'
from consorcio.atas a
where a.vigencia_fim is not null and not exists (select 1 from consorcio.periodos p where p.ata_id = a.id)
on conflict (ata_id, numero) do nothing;
