-- =====================================================================
-- 09_stratura_precos.sql  (rodar uma vez, depois do 08)
-- Linha do tempo de preços da ARP 003/2026 (Stratura), item 3 – emulsão asfáltica RL-1C:
--   R$ 3.520,00 (preço registrado) → 1º TA R$ 3.877,98 (+10,17%) → 2º TA R$ 4.476,90.
-- Data do 1º TA: 30/04/2026 (data do documento; o termo diz só "nesta data") – confirmar.
-- Depois, as adesões com data de ofício recebem o preço da época; as do histórico sem data
-- ficam marcadas para escolher o preço na tela do item.
-- =====================================================================
insert into consorcio.precos (item_id, preco, vigente_desde, instrumento, criado_por_nome)
select i.id, v.preco, v.desde::date, v.ins, 'Kennedy Dantas Francelino'
from consorcio.itens i
join consorcio.atas a on a.id = i.ata_id
cross join (values (3520.00, '2026-01-05', 'Preço registrado na ata'),
                   (3877.98, '2026-04-30', '1º Termo Aditivo – reequilíbrio (+10,17%)'),
                   (4476.90, '2026-06-30', '2º Termo Aditivo – reequilíbrio')) as v(preco, desde, ins)
where a.numero = '003/2026' and i.numero = 3
on conflict (item_id, vigente_desde) do update set preco = excluded.preco, instrumento = excluded.instrumento;

update consorcio.itens i set preco_unitario = 4476.90
from consorcio.atas a where a.id = i.ata_id and a.numero = '003/2026' and i.numero = 3;

update consorcio.pedido_itens pi
   set preco_unitario = case when p.data_oficio is not null then consorcio.preco_na_data(pi.item_id, p.data_oficio) else pi.preco_unitario end,
       preco_conferir = (p.data_oficio is null)
from consorcio.pedidos p, consorcio.itens i, consorcio.atas a
where p.id = pi.pedido_id and i.id = pi.item_id and a.id = i.ata_id and a.numero = '003/2026' and i.numero = 3;

select p.numero_oficio, p.data_oficio, pi.preco_unitario, pi.preco_conferir
from consorcio.pedido_itens pi join consorcio.pedidos p on p.id = pi.pedido_id
join consorcio.itens i on i.id = pi.item_id join consorcio.atas a on a.id = i.ata_id
where a.numero = '003/2026' and i.numero = 3 order by p.data_oficio nulls last, p.numero_oficio;
