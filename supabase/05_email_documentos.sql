-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 05_email_documentos.sql  (reexecutável, schema consorcio, rodar depois do 04)
--
-- E-mail de resposta ao órgão, enviado só depois que o usuário revisa e confirma:
--   · links dos documentos que acompanham todo ofício (resoluções do CIMOP etc.);
--   · link do processo completo de cada ata (PNCP, portal da transparência ou outra plataforma);
--   · registro de cada e-mail enviado (consorcio.emails), gravado pela função consorcio-enviar-email.
-- O envio usa o SMTP já configurado no projeto (secrets SMTP_HOST, SMTP_PORT, SMTP_USUARIO,
-- SMTP_SENHA, SMTP_REMETENTE). Opcional: CONSORCIO_SMTP_REMETENTE, para um remetente próprio.
-- =====================================================================

alter table consorcio.orgaos add column if not exists telefone text;
alter table consorcio.atas add column if not exists link_processo text;

alter table consorcio.configuracoes add column if not exists documentos jsonb not null default '[]'::jsonb;
alter table consorcio.configuracoes add column if not exists email_resposta text;
alter table consorcio.configuracoes add column if not exists email_copia text;
alter table consorcio.configuracoes add column if not exists email_assunto text not null default 'Ofício nº {oficio} – {sigla} · {assunto}';
alter table consorcio.configuracoes add column if not exists email_corpo text not null default
'{vocativo},

Encaminhamos, em anexo, o Ofício nº {oficio} – {sigla}, em resposta à solicitação de adesão {solicitacao}.

{documentos}

Permanecemos à disposição.

Atenciosamente,
{presidente}
{presidente_cargo}
{orgao}';

create table if not exists consorcio.emails (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid references consorcio.pedidos(id),
  para text not null,
  copia text,
  assunto text not null,
  corpo text not null,
  anexos jsonb not null default '[]'::jsonb,
  situacao text not null default 'enviado' check (situacao in ('enviado', 'erro')),
  erro text,
  enviado_por uuid,
  enviado_por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists emails_pedido on consorcio.emails(pedido_id);

alter table consorcio.emails enable row level security;
drop policy if exists ler on consorcio.emails;
create policy ler on consorcio.emails for select to authenticated using (consorcio.meu_perfil() is not null);
grant select on consorcio.emails to authenticated;
grant all on consorcio.emails to service_role;

select 'ok' as resultado;
