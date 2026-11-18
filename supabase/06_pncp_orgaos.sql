-- =====================================================================
-- SOFT+ | Gestão de Consórcio – módulo de adesões às ARPs
-- 06_pncp_orgaos.sql  (reexecutável, schema consorcio, rodar depois do 05)
--
-- Órgãos/entidades que o PNCP mostra em cada ata (aba "Órgãos/Entidades": gerenciadora,
-- participantes e não participantes). A função consorcio-pncp grava a lista toda madrugada e
-- o painel compara com as adesões autorizadas no sistema, para saber o que incluir no PNCP.
-- =====================================================================

create table if not exists consorcio.pncp_partes (
  ata_id uuid not null references consorcio.atas(id),
  cnpj text not null,
  tipo text not null,               -- Gerenciadora, Participante, Não Participante
  nome text,
  unidade text,
  municipio text,
  uf text,
  incluido_em timestamptz,
  lido_em timestamptz not null default now(),
  primary key (ata_id, cnpj, tipo)
);

alter table consorcio.pncp_partes enable row level security;
drop policy if exists ler on consorcio.pncp_partes;
create policy ler on consorcio.pncp_partes for select to authenticated using (consorcio.meu_perfil() is not null);
grant select on consorcio.pncp_partes to authenticated;
grant all on consorcio.pncp_partes to service_role;

select 'ok' as resultado;
