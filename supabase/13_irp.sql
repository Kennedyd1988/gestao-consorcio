-- =====================================================================
-- SOFT+ Consórcios | Gestão de Consórcio
-- 13_irp.sql  (reexecutável, schema consorcio, rodar depois do 12)
-- Módulo IRP – Procedimento Público de Intenção de Registro de Preços
-- (art. 86 da Lei nº 14.133/2021; Resolução CIMOP nº 018/2023, alterada pela nº 001/2026).
--
--   * O número do processo administrativo é a chave que liga a IRP à Ata (Controle de Adesões) e aos próximos módulos.
--   * Numeração automática por ano (o usuário define o número inicial de cada ano).
--   * Prazo mínimo: 8 dias úteis (3 em contratação direta), contados do 1º dia útil após a divulgação (art. 8º e § 1º).
--   * Formulário público (sem login): o ente informa itens, quantidades e local de entrega, baixa o PDF
--     preenchido com o próprio timbre, assina e anexa. Só com o anexo a manifestação conta como recebida.
--   * Demandas do ETP dos consorciados (art. 8º, § 3º), inclusão posterior até o edital (art. 8º, §§ 4º a 7º),
--     análise por item (art. 4º, II e IV), prorrogação, encerramento automático, consolidação e envio à Ata.
-- =====================================================================

-- ---------- Cadastro: vínculo "referendado" (Res. 001/2026, art. 2º, X, d) ----
do $$ begin
  alter table consorcio.orgaos drop constraint if exists orgaos_vinculo_check;
  alter table consorcio.orgaos add constraint orgaos_vinculo_check check (vinculo is null or vinculo in ('consorciado','nao_consorciado','cooperado','referendado'));
end $$;

-- ---------- Módulo ---------------------------------------------------------------
insert into consorcio.modulos (id, nome, descricao, ordem) values
  ('irp', 'Intenção de Registro de Preços', 'IRP: edital em Word, formulário online com PDF no timbre do ente, divulgação por e-mail e WhatsApp, análise, consolidação e participantes da Ata.', 20)
on conflict (id) do update set nome = excluded.nome, descricao = excluded.descricao, ordem = excluded.ordem;

create or replace function consorcio.pode_editar_irp()
returns boolean language sql stable security definer set search_path = consorcio, public as $$
  select consorcio.pode_editar_modulo('irp')
$$;
grant execute on function consorcio.pode_editar_irp() to authenticated;

-- ---------- Tabelas ---------------------------------------------------------------
create table if not exists consorcio.irp_numeracao (
  ano int primary key,
  proximo int not null check (proximo > 0)
);

create table if not exists consorcio.irps (
  id uuid primary key default gen_random_uuid(),
  numero int not null,
  ano int not null,
  processo text not null,
  processo_chave text generated always as (regexp_replace(processo, '\D', '', 'g')) stored,
  objeto text not null,
  contratacao_direta boolean not null default false,
  data_divulgacao date,
  prazo_fim date,
  situacao text not null default 'rascunho' check (situacao in ('rascunho','aberta','encerrada','consolidada','cancelada')),
  signatario_id uuid references consorcio.pessoas(id) on delete no action,
  data_documento date,
  edital_licitacao_em date,                  -- publicação do edital da licitação: fecha a inclusão posterior
  ata_id uuid references consorcio.atas(id) on delete no action,
  observacoes text,
  motivo_cancelamento text,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (numero, ano)
);
create unique index if not exists irps_processo on consorcio.irps(processo_chave) where situacao <> 'cancelada';

create table if not exists consorcio.irp_itens (
  id uuid primary key default gen_random_uuid(),
  irp_id uuid not null references consorcio.irps(id) on delete no action,
  numero int not null check (numero > 0),
  descricao text not null,
  unidade text not null default 'Unidade',
  unique (irp_id, numero)
);

create table if not exists consorcio.irp_respostas (
  id uuid primary key default gen_random_uuid(),
  irp_id uuid not null references consorcio.irps(id) on delete no action,
  orgao_id uuid not null references consorcio.orgaos(id) on delete no action,
  protocolo text not null unique,
  origem text not null default 'formulario' check (origem in ('formulario','etp','inclusao_posterior')),
  situacao text not null default 'preenchida' check (situacao in ('preenchida','recebida','analisada','substituida','cancelada')),
  resultado text check (resultado in ('aceita','ajustada','recusada')),
  responsavel_nome text, responsavel_cargo text, responsavel_telefone text, responsavel_email text,
  autoridade_nome text, autoridade_cargo text,
  dfd_numero text,
  local_entrega text,
  arquivo_assinado text, arquivo_nome text,          -- formulário assinado (bucket consorcio-irp)
  documento_url text,                                -- expediente da inclusão posterior
  justificativa text,
  recebida_em timestamptz,
  analisada_em timestamptz, analisada_por_nome text,
  motivo_geral text,
  comunicado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists irp_respostas_irp on consorcio.irp_respostas(irp_id);
create index if not exists irp_respostas_orgao on consorcio.irp_respostas(orgao_id);

create table if not exists consorcio.irp_resposta_itens (
  id uuid primary key default gen_random_uuid(),
  resposta_id uuid not null references consorcio.irp_respostas(id) on delete cascade,
  item_id uuid references consorcio.irp_itens(id) on delete no action,   -- vazio = pedido de inclusão de item novo
  novo_descricao text, novo_unidade text, justificativa text,
  qtd_informada numeric(18,4) not null check (qtd_informada > 0),
  qtd_aceita numeric(18,4),
  decisao text not null default 'pendente' check (decisao in ('pendente','aceito','ajustado','recusado')),
  motivo text,
  check (item_id is not null or coalesce(trim(novo_descricao), '') <> '')
);
create index if not exists irp_resposta_itens_resp on consorcio.irp_resposta_itens(resposta_id);

create table if not exists consorcio.irp_prorrogacoes (
  id uuid primary key default gen_random_uuid(),
  irp_id uuid not null references consorcio.irps(id) on delete no action,
  prazo_anterior date, prazo_novo date not null, motivo text not null,
  criado_por_nome text, criado_em timestamptz not null default now()
);

create table if not exists consorcio.irp_envios (
  id uuid primary key default gen_random_uuid(),
  irp_id uuid not null references consorcio.irps(id) on delete no action,
  orgao_id uuid references consorcio.orgaos(id) on delete no action,
  canal text not null check (canal in ('email','whatsapp')),
  tipo text not null check (tipo in ('divulgacao','lembrete','resultado')),
  destino text,
  criado_por_nome text, criado_em timestamptz not null default now()
);
create index if not exists irp_envios_irp on consorcio.irp_envios(irp_id);

-- Participantes da Ata vindos da IRP (não contam como adesão)
create table if not exists consorcio.ata_participantes (
  id uuid primary key default gen_random_uuid(),
  ata_id uuid not null references consorcio.atas(id) on delete no action,
  item_id uuid not null references consorcio.itens(id) on delete no action,
  orgao_id uuid not null references consorcio.orgaos(id) on delete no action,
  quantidade numeric(18,4) not null check (quantidade > 0),
  irp_id uuid references consorcio.irps(id) on delete no action,
  irp_resposta_id uuid references consorcio.irp_respostas(id) on delete no action,
  criado_em timestamptz not null default now(),
  unique (item_id, orgao_id, irp_id)
);

alter table consorcio.emails add column if not exists irp_id uuid references consorcio.irps(id);
alter table consorcio.emails add column if not exists orgao_id uuid references consorcio.orgaos(id);

-- ---------- Datas e prazos -----------------------------------------------------------
create or replace function consorcio.hoje_br()
returns date language sql stable as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

-- Último dia do prazo mínimo: N dias úteis contados do 1º dia útil seguinte à divulgação.
create or replace function consorcio.prazo_minimo_irp(p_divulgacao date, p_direta boolean)
returns date language plpgsql stable security definer set search_path = consorcio, public as $$
declare n int := case when p_direta then 3 else 8 end; x date := p_divulgacao; c int := 0;
begin
  if p_divulgacao is null then return null; end if;
  loop
    x := x + 1;
    if public.dia_util(consorcio.portal_id(), x) then c := c + 1; if c = n then return x; end if; end if;
    if x > p_divulgacao + 60 then return x; end if;   -- trava de segurança
  end loop;
end $$;
grant execute on function consorcio.prazo_minimo_irp(date, boolean), consorcio.hoje_br() to anon, authenticated;

create or replace function consorcio.irp_aberta(i consorcio.irps)
returns boolean language sql stable as $$ select i.situacao = 'aberta' and i.prazo_fim is not null and consorcio.hoje_br() <= i.prazo_fim $$;

-- Regras da IRP ao gravar
create or replace function consorcio.validar_irp()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
declare v_min date;
begin
  new.atualizado_em := now();
  if new.situacao = 'aberta' and (tg_op = 'INSERT' or old.situacao is distinct from 'aberta' or new.prazo_fim is distinct from old.prazo_fim
      or new.data_divulgacao is distinct from old.data_divulgacao or new.contratacao_direta is distinct from old.contratacao_direta) then
    if new.data_divulgacao is null then raise exception 'Informe a data de divulgação da IRP.'; end if;
    if new.prazo_fim is null then raise exception 'Informe o prazo final para as manifestações.'; end if;
    v_min := consorcio.prazo_minimo_irp(new.data_divulgacao, new.contratacao_direta);
    if new.prazo_fim < v_min then
      raise exception 'O prazo precisa ter pelo menos % dias úteis contados do 1º dia útil após a divulgação: o prazo mínimo vai até %.',
        case when new.contratacao_direta then 3 else 8 end, to_char(v_min, 'DD/MM/YYYY');
    end if;
    if tg_op = 'UPDATE' and not exists (select 1 from consorcio.irp_itens where irp_id = new.id) then raise exception 'Cadastre os itens antes de abrir a IRP.'; end if;
    if new.signatario_id is null then raise exception 'Escolha quem assina o edital.'; end if;
  end if;
  if new.situacao = 'cancelada' and coalesce(trim(new.motivo_cancelamento), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  return new;
end $$;
drop trigger if exists validar_irp on consorcio.irps;
create trigger validar_irp before insert or update on consorcio.irps for each row execute function consorcio.validar_irp();

-- Itens só mudam enquanto a IRP é rascunho
create or replace function consorcio.travar_itens_irp()
returns trigger language plpgsql security invoker set search_path = consorcio, public as $$
begin
  if (select situacao from consorcio.irps where id = coalesce(new.irp_id, old.irp_id)) <> 'rascunho' then
    raise exception 'Os itens só podem ser alterados enquanto a IRP está em rascunho (antes de abrir).';
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists travar_itens_irp on consorcio.irp_itens;
create trigger travar_itens_irp before insert or update or delete on consorcio.irp_itens for each row execute function consorcio.travar_itens_irp();

-- ---------- Numeração automática ---------------------------------------------------------
create or replace function consorcio.criar_irp(p jsonb)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
declare v_ano int := coalesce((p->>'ano')::int, extract(year from consorcio.hoje_br())::int); v_num int; v_id uuid;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão para criar IRP.'; end if;
  if coalesce(trim(p->>'processo'), '') = '' then raise exception 'Informe o número do processo administrativo.'; end if;
  if coalesce(trim(p->>'objeto'), '') = '' then raise exception 'Informe o objeto.'; end if;
  insert into consorcio.irp_numeracao (ano, proximo)
    values (v_ano, coalesce((select max(numero) + 1 from consorcio.irps where ano = v_ano), 1))
    on conflict (ano) do nothing;
  select proximo into v_num from consorcio.irp_numeracao where ano = v_ano for update;
  while exists (select 1 from consorcio.irps where ano = v_ano and numero = v_num) loop v_num := v_num + 1; end loop;
  insert into consorcio.irps (numero, ano, processo, objeto, contratacao_direta, signatario_id, observacoes, criado_por_nome)
  values (v_num, v_ano, trim(p->>'processo'), trim(p->>'objeto'), coalesce((p->>'contratacao_direta')::boolean, false),
    nullif(p->>'signatario_id', '')::uuid, p->>'observacoes', (select nome from consorcio.usuarios where id = auth.uid()))
  returning id into v_id;
  update consorcio.irp_numeracao set proximo = v_num + 1 where ano = v_ano;
  return v_id;
end $$;

create or replace function consorcio.definir_numeracao_irp(p_ano int, p_proximo int)
returns void language plpgsql security definer set search_path = consorcio, public as $$
begin
  if coalesce(consorcio.perfil_modulo('irp'), '') <> 'administrador' then raise exception 'Só o administrador do módulo define a numeração.'; end if;
  if p_proximo < 1 then raise exception 'Número inválido.'; end if;
  if exists (select 1 from consorcio.irps where ano = p_ano and numero >= p_proximo) then
    raise exception 'Já existe IRP de % com número igual ou maior que %.', p_ano, p_proximo;
  end if;
  insert into consorcio.irp_numeracao (ano, proximo) values (p_ano, p_proximo) on conflict (ano) do update set proximo = excluded.proximo;
end $$;

-- ---------- Encerramento automático ------------------------------------------------------
create or replace function consorcio.encerrar_irps_vencidas()
returns int language plpgsql security definer set search_path = consorcio, public as $$
declare n int;
begin
  update consorcio.irps set situacao = 'encerrada' where situacao = 'aberta' and prazo_fim < consorcio.hoje_br();
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function consorcio.encerrar_irps_vencidas() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('consorcio-irp-encerrar') where exists (select 1 from cron.job where jobname = 'consorcio-irp-encerrar');
  perform cron.schedule('consorcio-irp-encerrar', '5 3 * * *', 'select consorcio.encerrar_irps_vencidas()');   -- 00:05 de Brasília
exception when others then raise notice 'pg_cron indisponível: o encerramento continua valendo pela data (o formulário fecha sozinho).';
end $$;

-- ---------- Funções públicas (formulário sem login) -----------------------------------------
create or replace function consorcio.publico_irp(p_id uuid)
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('id', i.id, 'numero', lpad(i.numero::text, 3, '0') || '/' || i.ano, 'processo', i.processo, 'objeto', i.objeto,
    'prazo_fim', i.prazo_fim, 'situacao', case when i.situacao = 'aberta' and not consorcio.irp_aberta(i) then 'encerrada' else i.situacao end,
    'aberta', consorcio.irp_aberta(i), 'contratacao_direta', i.contratacao_direta,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.numero, 'descricao', t.descricao, 'unidade', t.unidade) order by t.numero), '[]') from consorcio.irp_itens t where t.irp_id = i.id),
    'cimop', (select jsonb_build_object('nome', c.orgao_nome, 'sigla', c.sigla, 'email', c.email_institucional, 'endereco', c.endereco, 'horario', c.horario, 'telefone', c.telefone) from consorcio.configuracoes c where c.id = 1))
  from consorcio.irps i where i.id = p_id and i.situacao in ('aberta','encerrada','consolidada')
$$;

-- Dados do ente para o formulário e o PDF (sem CPF e sem dados internos)
create or replace function consorcio.publico_irp_ente(p_id uuid, p_cnpj text)
returns jsonb language plpgsql stable security definer set search_path = consorcio, public as $$
declare v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g'); o consorcio.orgaos; g consorcio.orgao_gestores; r consorcio.irp_respostas; v_etp jsonb;
begin
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido.'; end if;
  if not exists (select 1 from consorcio.irps where id = p_id and situacao in ('aberta','encerrada','consolidada')) then raise exception 'IRP não encontrada.'; end if;
  select * into o from consorcio.orgaos where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj limit 1;
  if not found then return jsonb_build_object('orgao', null); end if;
  select * into g from consorcio.orgao_gestores where orgao_id = o.id and funcao = 'titular' and atual limit 1;
  select * into r from consorcio.irp_respostas where irp_id = p_id and orgao_id = o.id and origem = 'formulario' and situacao in ('preenchida','recebida','analisada')
    order by criado_em desc limit 1;
  select jsonb_object_agg(ri.item_id, ri.qtd_informada) into v_etp from consorcio.irp_respostas e join consorcio.irp_resposta_itens ri on ri.resposta_id = e.id
   where e.irp_id = p_id and e.orgao_id = o.id and e.origem = 'etp' and e.situacao <> 'substituida' and ri.item_id is not null;
  return jsonb_build_object(
    'orgao', jsonb_build_object('nome', o.nome, 'cnpj', o.cnpj, 'municipio', o.municipio, 'uf', o.uf, 'endereco', o.endereco, 'bairro', o.bairro, 'cep', o.cep,
      'telefone', o.telefone, 'whatsapp', o.whatsapp, 'email', o.email, 'site', o.site, 'vinculo', o.vinculo, 'situacao_consorcio', o.situacao_consorcio,
      'brasao', consorcio.url_cadastro(o.brasao_url), 'cabecalho', consorcio.url_cadastro(o.timbre_cabecalho_url), 'rodape', consorcio.url_cadastro(o.timbre_rodape_url),
      'gestor_nome', g.nome, 'gestor_cargo', g.cargo),
    'etp', v_etp,
    'resposta', case when r.id is null then null else jsonb_build_object('protocolo', r.protocolo, 'situacao', r.situacao, 'resultado', r.resultado,
      'responsavel_nome', r.responsavel_nome, 'responsavel_cargo', r.responsavel_cargo, 'responsavel_telefone', r.responsavel_telefone, 'responsavel_email', r.responsavel_email,
      'autoridade_nome', r.autoridade_nome, 'autoridade_cargo', r.autoridade_cargo, 'dfd_numero', r.dfd_numero, 'local_entrega', r.local_entrega, 'criado_em', r.criado_em, 'recebida_em', r.recebida_em,
      'itens', (select coalesce(jsonb_agg(jsonb_build_object('item_id', ri.item_id, 'qtd', ri.qtd_informada, 'novo_descricao', ri.novo_descricao, 'novo_unidade', ri.novo_unidade, 'justificativa', ri.justificativa)), '[]')
                from consorcio.irp_resposta_itens ri where ri.resposta_id = r.id)) end);
end $$;

-- Grava o formulário preenchido (ainda sem o assinado). Devolve o protocolo.
create or replace function consorcio.publico_irp_salvar(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps; v_cnpj text := regexp_replace(coalesce(p->>'cnpj', ''), '\D', '', 'g'); o consorcio.orgaos; r consorcio.irp_respostas;
  l jsonb; v_prot text; n int; v_item consorcio.irp_itens;
begin
  select * into i from consorcio.irps where id = p_id;
  if not found or not consorcio.irp_aberta(i) then raise exception 'Esta IRP não está recebendo manifestações (prazo encerrado ou IRP fechada).'; end if;
  if length(v_cnpj) <> 14 then raise exception 'CNPJ inválido.'; end if;
  if coalesce(trim(p->>'local_entrega'), '') = '' then raise exception 'Informe o local de entrega ou de execução.'; end if;
  if coalesce(trim(p->>'autoridade_nome'), '') = '' or coalesce(trim(p->>'autoridade_cargo'), '') = '' then raise exception 'Informe o nome e o cargo de quem assina.'; end if;
  if coalesce(trim(p->>'responsavel_nome'), '') = '' or coalesce(trim(p->>'responsavel_email'), '') = '' then raise exception 'Informe o responsável pelas informações e o e-mail.'; end if;
  if jsonb_array_length(coalesce(p->'itens', '[]')) + jsonb_array_length(coalesce(p->'novos', '[]')) = 0 then raise exception 'Informe a quantidade de ao menos um item.'; end if;
  select count(*) into n from consorcio.irp_respostas where irp_id = p_id and criado_em > now() - interval '1 day'
    and orgao_id in (select id from consorcio.orgaos where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj);
  if n >= 20 then raise exception 'Limite de envios do dia atingido para este CNPJ.'; end if;

  select * into o from consorcio.orgaos where regexp_replace(coalesce(cnpj, ''), '\D', '', 'g') = v_cnpj limit 1;
  if not found then
    if coalesce(trim(p->>'nome'), '') = '' or coalesce(p->>'uf', '') = '' then raise exception 'Informe o nome e a UF do órgão ou entidade.'; end if;
    insert into consorcio.orgaos (nome, cnpj, municipio, uf, esfera, endereco, cep, telefone, email, pendente, pendente_origem)
    values (trim(p->>'nome'), v_cnpj, nullif(trim(p->>'municipio'), ''), p->>'uf', coalesce(nullif(p->>'esfera', ''), 'Municipal'), nullif(trim(p->>'endereco'), ''),
      nullif(p->>'cep', ''), nullif(p->>'telefone', ''), nullif(lower(trim(p->>'email')), ''), true,
      'Formulário da IRP nº ' || lpad(i.numero::text, 3, '0') || '/' || i.ano)
    returning * into o;
  else
    -- completa só o que estava vazio no cadastro (o cadastro é corrigido no módulo Cadastro)
    update consorcio.orgaos set endereco = coalesce(nullif(endereco, ''), nullif(trim(p->>'endereco'), '')), cep = coalesce(nullif(cep, ''), nullif(p->>'cep', '')),
      telefone = coalesce(nullif(telefone, ''), nullif(p->>'telefone', '')), email = coalesce(nullif(email, ''), nullif(lower(trim(p->>'email')), ''))
     where id = o.id;
  end if;
  if o.esfera = 'Federal' then raise exception 'Órgão ou entidade federal não participa de ata gerenciada por consórcio de municípios.'; end if;

  select * into r from consorcio.irp_respostas where irp_id = p_id and orgao_id = o.id and origem = 'formulario' and situacao = 'preenchida' order by criado_em desc limit 1;
  if r.id is null then
    select 'IRP' || lpad(i.numero::text, 3, '0') || '-' || i.ano || '-' || lpad((count(*) + 1)::text, 3, '0') into v_prot from consorcio.irp_respostas where irp_id = p_id;
    while exists (select 1 from consorcio.irp_respostas where protocolo = v_prot) loop v_prot := v_prot || 'A'; end loop;
    insert into consorcio.irp_respostas (irp_id, orgao_id, protocolo, origem, situacao) values (p_id, o.id, v_prot, 'formulario', 'preenchida') returning * into r;
  else
    delete from consorcio.irp_resposta_itens where resposta_id = r.id;
  end if;
  update consorcio.irp_respostas set responsavel_nome = trim(p->>'responsavel_nome'), responsavel_cargo = nullif(trim(p->>'responsavel_cargo'), ''),
    responsavel_telefone = nullif(p->>'responsavel_telefone', ''), responsavel_email = lower(trim(p->>'responsavel_email')),
    autoridade_nome = upper(trim(p->>'autoridade_nome')), autoridade_cargo = trim(p->>'autoridade_cargo'), dfd_numero = nullif(trim(p->>'dfd_numero'), ''),
    local_entrega = trim(p->>'local_entrega'), atualizado_em = now()
   where id = r.id;
  for l in select * from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
    select * into v_item from consorcio.irp_itens where id = (l->>'item_id')::uuid and irp_id = p_id;
    if not found then raise exception 'Item inválido.'; end if;
    if coalesce((l->>'qtd')::numeric, 0) <= 0 then continue; end if;
    insert into consorcio.irp_resposta_itens (resposta_id, item_id, qtd_informada) values (r.id, v_item.id, (l->>'qtd')::numeric);
  end loop;
  for l in select * from jsonb_array_elements(coalesce(p->'novos', '[]')) loop
    if coalesce(trim(l->>'descricao'), '') = '' or coalesce((l->>'qtd')::numeric, 0) <= 0 then continue; end if;
    if coalesce(trim(l->>'justificativa'), '') = '' then raise exception 'Justifique o pedido de inclusão do item "%".', l->>'descricao'; end if;
    insert into consorcio.irp_resposta_itens (resposta_id, novo_descricao, novo_unidade, justificativa, qtd_informada)
    values (r.id, trim(l->>'descricao'), coalesce(nullif(trim(l->>'unidade'), ''), 'Unidade'), trim(l->>'justificativa'), (l->>'qtd')::numeric);
  end loop;
  if not exists (select 1 from consorcio.irp_resposta_itens where resposta_id = r.id) then raise exception 'Informe a quantidade de ao menos um item.'; end if;
  return jsonb_build_object('protocolo', r.protocolo, 'orgao_pendente', o.pendente);
end $$;

-- Anexa o formulário assinado: a manifestação passa a valer (e substitui a anterior do mesmo ente).
create or replace function consorcio.publico_irp_anexar(p_protocolo text, p_cnpj text, p_caminho text, p_nome text)
returns jsonb language plpgsql security definer set search_path = consorcio, public as $$
declare r consorcio.irp_respostas; i consorcio.irps;
begin
  select r2.* into r from consorcio.irp_respostas r2 join consorcio.orgaos o on o.id = r2.orgao_id
   where r2.protocolo = upper(trim(p_protocolo)) and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  if not found then raise exception 'Protocolo não encontrado para este CNPJ.'; end if;
  select * into i from consorcio.irps where id = r.irp_id;
  if not consorcio.irp_aberta(i) then raise exception 'O prazo desta IRP terminou. Fale com o CIMOP.'; end if;
  if r.situacao not in ('preenchida','recebida') then raise exception 'Esta manifestação já foi analisada ou substituída.'; end if;
  if p_caminho is null or p_caminho not like 'envios/' || r.irp_id || '/%' then raise exception 'Arquivo inválido.'; end if;
  update consorcio.irp_respostas set arquivo_assinado = p_caminho, arquivo_nome = left(p_nome, 200), situacao = 'recebida', recebida_em = now(), atualizado_em = now() where id = r.id;
  update consorcio.irp_respostas set situacao = 'substituida', atualizado_em = now()
   where irp_id = r.irp_id and orgao_id = r.orgao_id and id <> r.id and origem in ('formulario','etp') and situacao in ('preenchida','recebida','analisada');
  return jsonb_build_object('protocolo', r.protocolo, 'situacao', 'recebida');
end $$;

create or replace function consorcio.publico_irp_consultar(p_protocolo text, p_cnpj text)
returns jsonb language sql stable security definer set search_path = consorcio, public as $$
  select jsonb_build_object('protocolo', r.protocolo, 'situacao', r.situacao, 'resultado', r.resultado, 'recebida_em', r.recebida_em, 'analisada_em', r.analisada_em,
    'motivo_geral', r.motivo_geral, 'irp', lpad(i.numero::text, 3, '0') || '/' || i.ano, 'objeto', i.objeto, 'orgao', o.nome,
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('numero', t.numero, 'descricao', coalesce(t.descricao, ri.novo_descricao), 'unidade', coalesce(t.unidade, ri.novo_unidade),
        'qtd_informada', ri.qtd_informada, 'qtd_aceita', ri.qtd_aceita, 'decisao', ri.decisao, 'motivo', ri.motivo) order by t.numero nulls last), '[]')
      from consorcio.irp_resposta_itens ri left join consorcio.irp_itens t on t.id = ri.item_id where ri.resposta_id = r.id))
  from consorcio.irp_respostas r join consorcio.orgaos o on o.id = r.orgao_id join consorcio.irps i on i.id = r.irp_id
  where r.protocolo = upper(trim(p_protocolo)) and regexp_replace(coalesce(o.cnpj, ''), '\D', '', 'g') = regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g')
$$;

grant execute on function consorcio.publico_irp(uuid), consorcio.publico_irp_ente(uuid, text), consorcio.publico_irp_salvar(uuid, jsonb),
  consorcio.publico_irp_anexar(text, text, text, text), consorcio.publico_irp_consultar(text, text) to anon, authenticated;

-- ---------- Análise, ETP, inclusão posterior, prazo, consolidação, Ata --------------------------
-- p_itens: [{id, decisao: aceito|ajustado|recusado, qtd_aceita, motivo}]
create or replace function consorcio.analisar_resposta_irp(p_resposta uuid, p_itens jsonb, p_motivo text)
returns text language plpgsql security definer set search_path = consorcio, public as $$
declare r consorcio.irp_respostas; l jsonb; ri consorcio.irp_resposta_itens; v_dec text; v_qtd numeric; n_ac int; n_rec int; n_tot int; v_res text;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão para analisar.'; end if;
  select * into r from consorcio.irp_respostas where id = p_resposta;
  if not found then raise exception 'Manifestação não encontrada.'; end if;
  if r.situacao not in ('recebida','analisada') then raise exception 'Só se analisa manifestação recebida (com o formulário assinado anexado).'; end if;
  if (select situacao from consorcio.irps where id = r.irp_id) in ('consolidada','cancelada') then raise exception 'A IRP já foi consolidada ou cancelada.'; end if;
  for l in select * from jsonb_array_elements(p_itens) loop
    select * into ri from consorcio.irp_resposta_itens where id = (l->>'id')::uuid and resposta_id = r.id;
    if not found then raise exception 'Item da manifestação inválido.'; end if;
    v_dec := l->>'decisao';
    if v_dec not in ('aceito','ajustado','recusado') then raise exception 'Decida todos os itens.'; end if;
    v_qtd := case v_dec when 'aceito' then ri.qtd_informada when 'recusado' then 0 else (l->>'qtd_aceita')::numeric end;
    if v_dec = 'ajustado' and (v_qtd is null or v_qtd <= 0) then raise exception 'Informe a quantidade aceita nos itens ajustados.'; end if;
    if v_dec in ('ajustado','recusado') and coalesce(trim(l->>'motivo'), '') = '' then raise exception 'Informe o motivo dos itens ajustados ou recusados (art. 4º, II, da Resolução nº 018/2023).'; end if;
    update consorcio.irp_resposta_itens set decisao = v_dec, qtd_aceita = v_qtd, motivo = nullif(trim(l->>'motivo'), '') where id = ri.id;
  end loop;
  select count(*), count(*) filter (where decisao = 'aceito'), count(*) filter (where decisao = 'recusado') into n_tot, n_ac, n_rec
    from consorcio.irp_resposta_itens where resposta_id = r.id;
  if exists (select 1 from consorcio.irp_resposta_itens where resposta_id = r.id and decisao = 'pendente') then raise exception 'Decida todos os itens.'; end if;
  v_res := case when n_rec = n_tot then 'recusada' when n_ac = n_tot then 'aceita' else 'ajustada' end;
  update consorcio.irp_respostas set situacao = 'analisada', resultado = v_res, motivo_geral = nullif(trim(p_motivo), ''), analisada_em = now(),
    analisada_por_nome = (select nome from consorcio.usuarios where id = auth.uid()), atualizado_em = now() where id = r.id;
  return v_res;
end $$;

-- Demandas dos consorciados já previstas no ETP (art. 8º, § 3º): entram como aceitas, origem "ETP".
-- p_itens: [{item_id, qtd}] (qtd 0 ou vazio = tira o item)
create or replace function consorcio.lancar_etp_irp(p_irp uuid, p_orgao uuid, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps; o consorcio.orgaos; r consorcio.irp_respostas; l jsonb; v_prot text;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão.'; end if;
  select * into i from consorcio.irps where id = p_irp;
  if i.situacao in ('consolidada','cancelada') then raise exception 'A IRP já foi consolidada ou cancelada.'; end if;
  select * into o from consorcio.orgaos where id = p_orgao;
  if o.vinculo is distinct from 'consorciado' then raise exception 'Só entes consorciados participam pela demanda do ETP (art. 8º, § 3º). Marque o ente como consorciado no Cadastro.'; end if;
  if exists (select 1 from consorcio.irp_respostas where irp_id = p_irp and orgao_id = p_orgao and origem in ('formulario','inclusao_posterior') and situacao in ('recebida','analisada')) then
    raise exception '% já se manifestou pelo formulário: a resposta dele vale no lugar da demanda do ETP.', o.nome;
  end if;
  select * into r from consorcio.irp_respostas where irp_id = p_irp and orgao_id = p_orgao and origem = 'etp' and situacao <> 'substituida' limit 1;
  if r.id is null then
    v_prot := 'ETP' || lpad(i.numero::text, 3, '0') || '-' || i.ano || '-' || left(replace(p_orgao::text, '-', ''), 6);
    insert into consorcio.irp_respostas (irp_id, orgao_id, protocolo, origem, situacao, resultado, recebida_em, analisada_em, analisada_por_nome, local_entrega)
    values (p_irp, p_orgao, upper(v_prot), 'etp', 'analisada', 'aceita', now(), now(), (select nome from consorcio.usuarios where id = auth.uid()), 'Conforme o ETP')
    returning * into r;
  else
    delete from consorcio.irp_resposta_itens where resposta_id = r.id;
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_itens, '[]')) loop
    if coalesce((l->>'qtd')::numeric, 0) <= 0 then continue; end if;
    if not exists (select 1 from consorcio.irp_itens where id = (l->>'item_id')::uuid and irp_id = p_irp) then raise exception 'Item inválido.'; end if;
    insert into consorcio.irp_resposta_itens (resposta_id, item_id, qtd_informada, qtd_aceita, decisao) values (r.id, (l->>'item_id')::uuid, (l->>'qtd')::numeric, (l->>'qtd')::numeric, 'aceito');
  end loop;
  if not exists (select 1 from consorcio.irp_resposta_itens where resposta_id = r.id) then
    update consorcio.irp_respostas set situacao = 'substituida', motivo_geral = 'Demanda do ETP retirada.' where id = r.id;
  end if;
  return r.id;
end $$;

-- Inclusão posterior (art. 8º, §§ 4º a 7º): pedido formal recebido depois do prazo, até a publicação do edital.
create or replace function consorcio.registrar_inclusao_posterior_irp(p_irp uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps; r consorcio.irp_respostas; l jsonb; v_prot text;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão.'; end if;
  select * into i from consorcio.irps where id = p_irp;
  if i.situacao in ('rascunho','cancelada') then raise exception 'A IRP não está em andamento.'; end if;
  if consorcio.irp_aberta(i) then raise exception 'A IRP ainda está no prazo: o ente deve usar o formulário.'; end if;
  if i.edital_licitacao_em is not null and i.edital_licitacao_em <= consorcio.hoje_br() then
    raise exception 'O edital da licitação já foi publicado (%): a inclusão posterior não é mais admitida (art. 8º, § 7º).', to_char(i.edital_licitacao_em, 'DD/MM/YYYY');
  end if;
  if coalesce(trim(p->>'justificativa'), '') = '' then raise exception 'Informe a motivação do pedido.'; end if;
  if coalesce(trim(p->>'local_entrega'), '') = '' then raise exception 'Informe o local de entrega.'; end if;
  if not coalesce((p->>'declaracao')::boolean, false) then raise exception 'O pedido precisa ter a declaração de concordância com as especificações (art. 8º, § 5º, IV).'; end if;
  select 'INC' || lpad(i.numero::text, 3, '0') || '-' || i.ano || '-' || lpad((count(*) + 1)::text, 3, '0') into v_prot from consorcio.irp_respostas where irp_id = p_irp and origem = 'inclusao_posterior';
  insert into consorcio.irp_respostas (irp_id, orgao_id, protocolo, origem, situacao, recebida_em, local_entrega, justificativa, documento_url, autoridade_nome, autoridade_cargo, dfd_numero)
  values (p_irp, (p->>'orgao_id')::uuid, v_prot, 'inclusao_posterior', 'recebida', coalesce((p->>'recebida_em')::timestamptz, now()), trim(p->>'local_entrega'), trim(p->>'justificativa'),
    nullif(p->>'documento_url', ''), nullif(upper(trim(p->>'autoridade_nome')), ''), nullif(trim(p->>'autoridade_cargo'), ''), nullif(trim(p->>'dfd_numero'), ''))
  returning * into r;
  for l in select * from jsonb_array_elements(coalesce(p->'itens', '[]')) loop
    if coalesce((l->>'qtd')::numeric, 0) <= 0 then continue; end if;
    insert into consorcio.irp_resposta_itens (resposta_id, item_id, qtd_informada) values (r.id, (l->>'item_id')::uuid, (l->>'qtd')::numeric);
  end loop;
  if not exists (select 1 from consorcio.irp_resposta_itens where resposta_id = r.id) then raise exception 'Informe a quantidade de ao menos um item.'; end if;
  update consorcio.irp_respostas set situacao = 'substituida' where irp_id = p_irp and orgao_id = r.orgao_id and origem = 'etp' and situacao <> 'substituida';
  return r.id;
end $$;

create or replace function consorcio.prorrogar_irp(p_irp uuid, p_prazo date, p_motivo text)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão.'; end if;
  select * into i from consorcio.irps where id = p_irp for update;
  if i.situacao not in ('aberta','encerrada') then raise exception 'Só se prorroga IRP aberta ou encerrada (ainda não consolidada).'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Informe a justificativa da prorrogação.'; end if;
  if p_prazo is null or p_prazo <= i.prazo_fim or p_prazo < consorcio.hoje_br() then raise exception 'O novo prazo deve ser depois do prazo atual e de hoje.'; end if;
  insert into consorcio.irp_prorrogacoes (irp_id, prazo_anterior, prazo_novo, motivo, criado_por_nome) values (p_irp, i.prazo_fim, p_prazo, trim(p_motivo), (select nome from consorcio.usuarios where id = auth.uid()));
  update consorcio.irps set prazo_fim = p_prazo, situacao = 'aberta' where id = p_irp;
end $$;

create or replace function consorcio.consolidar_irp(p_irp uuid)
returns void language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps; n int;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão.'; end if;
  select * into i from consorcio.irps where id = p_irp for update;
  if i.situacao = 'aberta' and consorcio.irp_aberta(i) then raise exception 'A IRP ainda está no prazo (até %).', to_char(i.prazo_fim, 'DD/MM/YYYY'); end if;
  if i.situacao not in ('aberta','encerrada') then raise exception 'A IRP não pode ser consolidada nesta situação.'; end if;
  select count(*) into n from consorcio.irp_respostas where irp_id = p_irp and situacao = 'recebida';
  if n > 0 then raise exception 'Há % manifestação(ões) recebida(s) sem análise.', n; end if;
  update consorcio.irps set situacao = 'consolidada' where id = p_irp;
end $$;

-- Envia à Ata os participantes e as quantidades aceitas. p_mapa: {"<irp_item_id>": "<item_id da ata>", ...}
create or replace function consorcio.levar_irp_para_ata(p_irp uuid, p_ata uuid, p_mapa jsonb)
returns int language plpgsql security definer set search_path = consorcio, public as $$
declare i consorcio.irps; n int;
begin
  if not consorcio.pode_editar_irp() then raise exception 'Sem permissão.'; end if;
  select * into i from consorcio.irps where id = p_irp;
  if i.situacao <> 'consolidada' then raise exception 'Consolide a IRP antes de levar os participantes para a Ata.'; end if;
  if not exists (select 1 from consorcio.atas where id = p_ata) then raise exception 'Ata não encontrada.'; end if;
  if exists (select 1 from jsonb_each_text(p_mapa) m where not exists (select 1 from consorcio.itens t where t.id = m.value::uuid and t.ata_id = p_ata)) then
    raise exception 'Há item ligado a outra ata.';
  end if;
  delete from consorcio.ata_participantes where irp_id = p_irp;
  insert into consorcio.ata_participantes (ata_id, item_id, orgao_id, quantidade, irp_id, irp_resposta_id)
  select p_ata, (p_mapa ->> ri.item_id::text)::uuid, r.orgao_id, sum(ri.qtd_aceita), p_irp, min(r.id::text)::uuid
    from consorcio.irp_respostas r join consorcio.irp_resposta_itens ri on ri.resposta_id = r.id
   where r.irp_id = p_irp and r.situacao = 'analisada' and ri.item_id is not null and coalesce(ri.qtd_aceita, 0) > 0 and (p_mapa ? ri.item_id::text)
   group by (p_mapa ->> ri.item_id::text)::uuid, r.orgao_id;
  get diagnostics n = row_count;
  update consorcio.irps set ata_id = p_ata where id = p_irp;
  return n;
end $$;

grant execute on function consorcio.criar_irp(jsonb), consorcio.definir_numeracao_irp(int, int), consorcio.analisar_resposta_irp(uuid, jsonb, text),
  consorcio.lancar_etp_irp(uuid, uuid, jsonb), consorcio.registrar_inclusao_posterior_irp(uuid, jsonb), consorcio.prorrogar_irp(uuid, date, text),
  consorcio.consolidar_irp(uuid), consorcio.levar_irp_para_ata(uuid, uuid, jsonb) to authenticated;

-- ---------- Histórico --------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['irps','irp_itens','irp_respostas','irp_prorrogacoes','ata_participantes'] loop
    execute format('drop trigger if exists hist_%1$s on consorcio.%1$s', t);
    execute format('create trigger hist_%1$s after insert or update or delete on consorcio.%1$s for each row execute function consorcio.registrar_historico()', t);
  end loop;
end $$;

-- ---------- RLS ------------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array['irp_numeracao','irps','irp_itens','irp_respostas','irp_resposta_itens','irp_prorrogacoes','irp_envios','ata_participantes'] loop
    execute format('alter table consorcio.%I enable row level security', t);
    execute format('drop policy if exists ler on consorcio.%I', t);
    execute format('drop policy if exists inserir on consorcio.%I', t);
    execute format('drop policy if exists alterar on consorcio.%I', t);
    execute format('drop policy if exists excluir on consorcio.%I', t);
  end loop;
end $$;
create policy ler on consorcio.irp_numeracao for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy ler on consorcio.irps for select to authenticated using (consorcio.perfil_modulo('irp') is not null or consorcio.meu_perfil() is not null);
create policy inserir on consorcio.irps for insert to authenticated with check (consorcio.pode_editar_irp());
create policy alterar on consorcio.irps for update to authenticated using (consorcio.pode_editar_irp()) with check (consorcio.pode_editar_irp());
create policy ler on consorcio.irp_itens for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy inserir on consorcio.irp_itens for insert to authenticated with check (consorcio.pode_editar_irp());
create policy alterar on consorcio.irp_itens for update to authenticated using (consorcio.pode_editar_irp()) with check (consorcio.pode_editar_irp());
create policy excluir on consorcio.irp_itens for delete to authenticated using (consorcio.pode_editar_irp());
create policy ler on consorcio.irp_respostas for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy alterar on consorcio.irp_respostas for update to authenticated using (consorcio.pode_editar_irp()) with check (consorcio.pode_editar_irp());
create policy ler on consorcio.irp_resposta_itens for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy ler on consorcio.irp_prorrogacoes for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy ler on consorcio.irp_envios for select to authenticated using (consorcio.perfil_modulo('irp') is not null);
create policy inserir on consorcio.irp_envios for insert to authenticated with check (consorcio.pode_editar_irp());
create policy ler on consorcio.ata_participantes for select to authenticated using (consorcio.perfil_modulo('irp') is not null or consorcio.meu_perfil() is not null);

grant select on consorcio.irp_numeracao, consorcio.irp_resposta_itens, consorcio.irp_prorrogacoes, consorcio.ata_participantes to authenticated;
grant select, insert, update on consorcio.irps, consorcio.irp_envios to authenticated;
grant select, insert, update, delete on consorcio.irp_itens to authenticated;
grant select, update on consorcio.irp_respostas to authenticated;
grant all on consorcio.irp_numeracao, consorcio.irps, consorcio.irp_itens, consorcio.irp_respostas, consorcio.irp_resposta_itens,
  consorcio.irp_prorrogacoes, consorcio.irp_envios, consorcio.ata_participantes to service_role;
grant execute on function consorcio.irp_aberta(consorcio.irps) to anon, authenticated;

-- ---------- Arquivos (formulários assinados e expedientes) --------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('consorcio-irp', 'consorcio-irp', false, 20971520, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
drop policy if exists "consorcio_irp_enviar" on storage.objects;
create policy "consorcio_irp_enviar" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'consorcio-irp' and (storage.foldername(name))[1] = 'envios');
drop policy if exists "consorcio_irp_expedientes" on storage.objects;
create policy "consorcio_irp_expedientes" on storage.objects for insert to authenticated
  with check (bucket_id = 'consorcio-irp' and (storage.foldername(name))[1] = 'expedientes' and consorcio.pode_editar_irp());
drop policy if exists "consorcio_irp_ler" on storage.objects;
create policy "consorcio_irp_ler" on storage.objects for select to authenticated
  using (bucket_id = 'consorcio-irp' and consorcio.perfil_modulo('irp') is not null);
