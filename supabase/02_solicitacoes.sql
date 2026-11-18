-- =====================================================================
-- SOFT+ | Controle de Adesões às ARPs – CIMOP
-- 02_solicitacoes.sql  (reexecutável) – formulário online de solicitação de adesão
-- O órgão interessado preenche sem login; o pedido chega como "Recebida" para análise.
-- =====================================================================

create table if not exists public.solicitacoes (
  id uuid primary key default gen_random_uuid(),
  protocolo text not null unique,
  situacao text not null default 'recebida' check (situacao in ('recebida','em_analise','atendida','recusada')),
  cnpj text not null,
  orgao_nome text not null,
  municipio text, uf text, esfera text default 'Municipal',
  responsavel text, cargo text, email text not null, telefone text,
  oficio_numero text, oficio_data date,
  finalidade text,
  itens jsonb not null,                 -- [{item_id, qtd}]
  arquivos jsonb not null default '[]', -- [{tipo, nome, caminho, tamanho}]
  declaracao boolean not null default false,
  orgao_id uuid references public.orgaos(id) on delete no action,
  pedido_id uuid references public.pedidos(id) on delete no action,
  motivo_recusa text,
  analisado_por uuid,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists solicitacoes_situacao on public.solicitacoes(situacao);

alter table public.solicitacoes enable row level security;
drop policy if exists ler on public.solicitacoes;
create policy ler on public.solicitacoes for select to authenticated using (public.meu_perfil() is not null);
drop policy if exists alterar on public.solicitacoes;
create policy alterar on public.solicitacoes for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
grant select, update on public.solicitacoes to authenticated;

drop trigger if exists hist_solicitacoes on public.solicitacoes;
create trigger hist_solicitacoes after insert or update on public.solicitacoes for each row execute function public.registrar_historico();

-- ---------- Leitura pública (só o necessário para o formulário) ---------
-- Saldo sem security_invoker, só para a função pública acima
create or replace view public.v_saldo_itens_publico as
select i.id as item_id,
       coalesce(sum(pi.qtd_autorizada) filter (where p.situacao <> 'cancelado' and pi.decisao = 'autorizado'), 0) as aderido
from public.itens i
left join public.pedido_itens pi on pi.item_id = i.id
left join public.pedidos p on p.id = pi.pedido_id
group by i.id;
revoke all on public.v_saldo_itens_publico from anon, authenticated;

create or replace function public.publico_atas()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id, 'numero', a.numero, 'pregao', a.pregao, 'objeto', a.objeto, 'detentora', a.detentora, 'vigencia_fim', a.vigencia_fim,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'numero', i.numero, 'descricao', i.descricao, 'unidade', i.unidade,
                'qtd_registrada', i.qtd_registrada, 'preco_unitario', i.preco_unitario, 'aderido', s.aderido) order by i.numero), '[]')
              from public.itens i join public.v_saldo_itens_publico s on s.item_id = i.id where i.ata_id = a.id)
  ) order by a.numero desc), '[]')
  from public.atas a
  where a.ativo and (a.vigencia_fim is null or a.vigencia_fim >= current_date)
$$;

create or replace function public.publico_orgao(p_cnpj text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'orgao', (select jsonb_build_object('nome', o.nome, 'municipio', o.municipio, 'uf', o.uf, 'esfera', o.esfera, 'responsavel', o.responsavel, 'cargo', o.cargo, 'email', o.email)
              from public.orgaos o where o.cnpj = regexp_replace(p_cnpj, '\D', '', 'g') and o.ativo),
    'aderido', (select coalesce(jsonb_object_agg(s.item_id, s.q), '{}') from (
                  select pi.item_id, sum(pi.qtd_autorizada) q from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
                  join public.orgaos o on o.id = p.orgao_id
                  where o.cnpj = regexp_replace(p_cnpj, '\D', '', 'g') and p.situacao <> 'cancelado' and pi.decisao = 'autorizado'
                  group by pi.item_id) s)
  )
$$;

-- Envio: valida e grava; devolve o protocolo
create or replace function public.enviar_solicitacao(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare v_prot text; v_cnpj text := regexp_replace(coalesce(p->>'cnpj',''), '\D', '', 'g'); v_n int;
begin
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido.'; end if;
  if coalesce(trim(p->>'orgao_nome'),'') = '' or coalesce(trim(p->>'email'),'') = '' then raise exception 'Informe o órgão e o e-mail.'; end if;
  if jsonb_array_length(coalesce(p->'itens','[]')) = 0 then raise exception 'Informe ao menos um item.'; end if;
  if not coalesce((p->>'declaracao')::boolean, false) then raise exception 'Marque a declaração.'; end if;
  -- trava simples contra envio repetido: no máximo 10 solicitações por CNPJ por dia
  select count(*) into v_n from public.solicitacoes where cnpj = v_cnpj and criado_em > now() - interval '1 day';
  if v_n >= 10 then raise exception 'Limite de envios do dia atingido para este CNPJ.'; end if;
  select 'SOL-' || to_char(now(),'YYYY') || '-' || lpad((count(*) + 1)::text, 4, '0') into v_prot
    from public.solicitacoes where to_char(criado_em,'YYYY') = to_char(now(),'YYYY');
  insert into public.solicitacoes(protocolo, cnpj, orgao_nome, municipio, uf, esfera, responsavel, cargo, email, telefone,
    oficio_numero, oficio_data, finalidade, itens, arquivos, declaracao)
  values (v_prot, v_cnpj, trim(p->>'orgao_nome'), p->>'municipio', p->>'uf', coalesce(p->>'esfera','Municipal'), p->>'responsavel', p->>'cargo',
    trim(p->>'email'), p->>'telefone', p->>'oficio_numero', (p->>'oficio_data')::date, p->>'finalidade', p->'itens', coalesce(p->'arquivos','[]'), true);
  return v_prot;
end $$;

create or replace function public.consultar_solicitacao(p_protocolo text, p_cnpj text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('protocolo', s.protocolo, 'situacao', s.situacao, 'criado_em', s.criado_em, 'motivo_recusa', s.motivo_recusa,
    'oficio', (select numero_oficio from public.pedidos where id = s.pedido_id))
  from public.solicitacoes s where s.protocolo = upper(trim(p_protocolo)) and s.cnpj = regexp_replace(p_cnpj, '\D', '', 'g')
$$;

grant execute on function public.publico_atas(), public.publico_orgao(text), public.enviar_solicitacao(jsonb), public.consultar_solicitacao(text, text) to anon, authenticated;

-- ---------- Arquivos anexados pelo órgão (bucket privado) ---------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('solicitacoes', 'solicitacoes', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 20971520, allowed_mime_types = array['application/pdf'];

drop policy if exists "solicitacoes_enviar" on storage.objects;
create policy "solicitacoes_enviar" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'solicitacoes' and (storage.foldername(name))[1] = 'envios');
drop policy if exists "solicitacoes_ler" on storage.objects;
create policy "solicitacoes_ler" on storage.objects for select to authenticated
  using (bucket_id = 'solicitacoes' and public.meu_perfil() is not null);
