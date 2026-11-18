/* Regras de adesão – art. 86, §§ 4º, 5º e 8º, da Lei nº 14.133/2021 e art. 29 da Resolução CIMOP nº 018/2023.
   As mesmas regras rodam no banco (registrar_pedido); aqui servem para mostrar o resultado enquanto se digita. */
(function () {
  const R = {};
  const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

  // Soma do que já foi autorizado, ignorando pedidos cancelados (e, se indicado, um pedido específico)
  R.usado = function (base, itemId, orgaoId, ignorarPedidoId) {
    let org = 0, tot = 0;
    for (const pi of base.pedido_itens) {
      if (pi.item_id !== itemId || pi.decisao !== 'autorizado') continue;
      const p = base.pedidosPorId[pi.pedido_id];
      if (!p || p.situacao === 'cancelado' || p.id === ignorarPedidoId) continue;
      tot += Number(pi.qtd_autorizada) || 0;
      if (p.orgao_id === orgaoId) org += Number(pi.qtd_autorizada) || 0;
    }
    return { org: r4(org), tot: r4(tot) };
  };

  // linhas: [{item_id, qtd}]  -> resultado por linha, na ordem
  R.analisar = function (base, orgao, dataOficio, linhas) {
    const acumOrg = {}, acumTot = {};
    return linhas.map((l) => {
      const item = base.itensPorId[l.item_id];
      const ata = item && base.atasPorId[item.ata_id];
      const q = r4(l.qtd);
      const res = { item, ata, q, decisao: 'autorizado', motivo: '', alertas: [] };
      if (!item) { res.decisao = 'invalido'; res.motivo = 'Item não encontrado.'; return res; }
      const u = R.usado(base, item.id, orgao && orgao.id);
      const uo = r4(u.org + (acumOrg[item.id] || 0)), ut = r4(u.tot + (acumTot[item.id] || 0));
      const reg = Number(item.qtd_registrada);
      Object.assign(res, {
        registrado: reg, limiteOrgao: r4(reg * 0.5), limiteTotal: r4(reg * 2),
        usadoOrgao: uo, usadoTotal: ut,
        dispOrgao: Math.max(0, r4(reg * 0.5 - uo)), dispTotal: Math.max(0, r4(reg * 2 - ut)),
      });
      res.disponivel = Math.min(res.dispOrgao, res.dispTotal);
      if (!(q > 0)) { res.decisao = 'invalido'; res.motivo = 'Informe a quantidade.'; return res; }
      if (orgao && orgao.esfera === 'Federal') {
        res.decisao = 'negado';
        res.motivo = 'Vedada a adesão de órgão ou entidade federal a ata gerenciada por ente municipal ou consórcio de municípios (art. 86, § 8º, da Lei nº 14.133/2021).';
      } else if (ata.vigencia_fim && dataOficio && dataOficio > ata.vigencia_fim) {
        res.decisao = 'negado'; res.motivo = 'Ata com vigência encerrada em ' + R.dataBR(ata.vigencia_fim) + '.';
      } else if (r4(uo + q) > res.limiteOrgao) {
        res.decisao = 'negado'; res.motivo = 'Ultrapassa o limite de 50% por órgão (art. 86, § 4º, da Lei nº 14.133/2021).';
      } else if (r4(ut + q) > res.limiteTotal) {
        res.decisao = 'negado'; res.motivo = 'Ultrapassa o limite total do dobro do quantitativo registrado (art. 86, § 5º, da Lei nº 14.133/2021).';
      }
      if (!ata.vigencia_fim) res.alertas.push('Vigência da ata não informada.');
      if (item.preco_unitario == null || item.preco_unitario === '') res.alertas.push('Preço unitário não informado.');
      if (orgao && orgao.esfera === 'Estadual') res.alertas.push('Órgão estadual: confira o fundamento (art. 86, § 3º, da Lei nº 14.133/2021).');
      if (res.decisao === 'autorizado') {
        acumOrg[item.id] = (acumOrg[item.id] || 0) + q;
        acumTot[item.id] = (acumTot[item.id] || 0) + q;
        const pctOrg = (uo + q) / res.limiteOrgao, pctTot = (ut + q) / res.limiteTotal;
        if (pctOrg >= 0.9 || pctTot >= 0.9) res.alertas.push('Com este pedido o item fica perto do limite.');
      }
      return res;
    });
  };

  R.situacao = function (res) {
    const a = res.filter((r) => r.decisao === 'autorizado').length;
    const n = res.filter((r) => r.decisao === 'negado').length;
    return n === 0 ? 'autorizado' : a === 0 ? 'negado' : 'parcial';
  };

  // Ocorrências no histórico (adesões que já passaram dos limites)
  R.conferirHistorico = function (base) {
    const porOrg = {}, porItem = {}, out = [];
    for (const pi of base.pedido_itens) {
      const p = base.pedidosPorId[pi.pedido_id];
      if (!p || p.situacao === 'cancelado' || pi.decisao !== 'autorizado') continue;
      const k = pi.item_id + '|' + p.orgao_id;
      porOrg[k] = (porOrg[k] || 0) + Number(pi.qtd_autorizada);
      porItem[pi.item_id] = (porItem[pi.item_id] || 0) + Number(pi.qtd_autorizada);
    }
    for (const k in porOrg) {
      const [itemId, orgId] = k.split('|');
      const it = base.itensPorId[itemId];
      if (r4(porOrg[k]) > r4(it.qtd_registrada * 0.5))
        out.push({ tipo: '50%', item: it, orgao: base.orgaosPorId[orgId], valor: porOrg[k], limite: it.qtd_registrada * 0.5 });
    }
    for (const id in porItem) {
      const it = base.itensPorId[id];
      if (r4(porItem[id]) > r4(it.qtd_registrada * 2))
        out.push({ tipo: 'dobro', item: it, valor: porItem[id], limite: it.qtd_registrada * 2 });
    }
    return out;
  };

  R.dataBR = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  R.num = (n, casas) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas ?? 0, maximumFractionDigits: casas ?? 4 }));
  R.moeda = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  R.r4 = r4;
  window.REGRAS = R;
})();
