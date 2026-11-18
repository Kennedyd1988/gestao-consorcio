/* Regras de adesão – art. 86, §§ 4º, 5º e 8º, da Lei nº 14.133/2021 e art. 29 da Resolução CIMOP nº 018/2023.
   As mesmas regras rodam no banco (registrar_pedido); aqui servem para mostrar o resultado enquanto se digita. */
(function () {
  const R = {};
  const r4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

  // ---- Períodos de vigência e ciclos de quantitativos
  // Ciclo = período que abriu a contagem (o 1º, ou o último que renovou quantitativos).
  // Adesão sem período (antigas) conta no ciclo do período 1.
  const periodosDa = (base, ataId) => (base.periodos || []).filter((p) => p.ata_id === ataId).sort((a, b) => a.numero - b.numero);
  R.periodosDa = periodosDa;
  R.periodoNaData = (base, ataId, d) => { const ps = periodosDa(base, ataId).filter((p) => d && p.inicio <= d && d <= p.fim); return ps.length ? ps[ps.length - 1] : null; };
  R.cicloDe = function (base, periodoId, ataId) {
    const ps = periodosDa(base, ataId); if (!ps.length) return null;
    const ref = (periodoId && ps.find((p) => p.id === periodoId)) || ps[0];
    const cands = ps.filter((p) => p.numero <= ref.numero && (p.numero === 1 || p.renova_quantitativos));
    return cands.length ? cands[cands.length - 1].id : ps[0].id;
  };
  R.cicloAtual = function (base, ataId) {
    const ps = periodosDa(base, ataId); if (!ps.length) return null;
    const hojeISO = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const p = R.periodoNaData(base, ataId, hojeISO) || ps[ps.length - 1];
    return R.cicloDe(base, p.id, ataId);
  };
  // Ciclos da ata, com início e fim de cada um (para escolher qual ver)
  R.ciclosDa = function (base, ataId) {
    const ps = periodosDa(base, ataId), out = [];
    ps.forEach((p) => { const c = R.cicloDe(base, p.id, ataId); let g = out.find((x) => x.id === c); if (!g) { g = { id: c, inicio: p.inicio, fim: p.fim, periodos: [] }; out.push(g); } g.fim = p.fim; g.periodos.push(p); });
    return out;
  };

  // Soma do que já foi autorizado, ignorando pedidos cancelados (e, se indicado, um pedido específico).
  // ciclo: undefined = ciclo atual da ata; null = sem filtro.
  R.usado = function (base, itemId, orgaoId, ignorarPedidoId, ciclo) {
    let org = 0, tot = 0;
    const item = base.itensPorId[itemId];
    if (ciclo === undefined && item) ciclo = R.cicloAtual(base, item.ata_id);
    for (const pi of base.pedido_itens) {
      if (pi.item_id !== itemId || pi.decisao !== 'autorizado') continue;
      const p = base.pedidosPorId[pi.pedido_id];
      if (!p || p.situacao === 'cancelado' || p.id === ignorarPedidoId) continue;
      if (ciclo && R.cicloDe(base, pi.periodo_id, item.ata_id) !== ciclo) continue;
      tot += Number(pi.qtd_autorizada) || 0;
      if (p.orgao_id === orgaoId) org += Number(pi.qtd_autorizada) || 0;
    }
    return { org: r4(org), tot: r4(tot) };
  };

  // linhas: [{item_id, qtd}]  -> resultado por linha, na ordem
  R.analisar = function (base, orgao, dataOficio, linhas, ignorarPedidoId) {
    const acumOrg = {}, acumTot = {};
    return linhas.map((l) => {
      const item = base.itensPorId[l.item_id];
      const ata = item && base.atasPorId[item.ata_id];
      const q = r4(l.qtd);
      const res = { item, ata, q, decisao: 'autorizado', motivo: '', alertas: [] };
      if (!item) { res.decisao = 'invalido'; res.motivo = 'Item não encontrado.'; return res; }
      const temPeriodos = periodosDa(base, item.ata_id).length > 0;
      const per = temPeriodos ? R.periodoNaData(base, item.ata_id, dataOficio) : null;
      const ciclo = temPeriodos ? (per ? R.cicloDe(base, per.id, item.ata_id) : R.cicloAtual(base, item.ata_id)) : null;
      res.periodo = per; res.periodo_id = per ? per.id : null; res.ciclo = ciclo;
      const u = R.usado(base, item.id, orgao && orgao.id, ignorarPedidoId || null, ciclo);
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
      } else if (temPeriodos && !per) {
        res.decisao = 'negado'; res.motivo = 'Data do pedido fora da vigência da ata.';
      } else if (!temPeriodos && ata.vigencia_fim && dataOficio && dataOficio > ata.vigencia_fim) {
        res.decisao = 'negado'; res.motivo = 'Ata com vigência encerrada em ' + R.dataBR(ata.vigencia_fim) + '.';
      } else if (r4(uo + q) > res.limiteOrgao) {
        res.decisao = 'negado'; res.motivo = 'Ultrapassa o limite de 50% por órgão (art. 86, § 4º, da Lei nº 14.133/2021).';
      } else if (r4(ut + q) > res.limiteTotal) {
        res.decisao = 'negado'; res.motivo = 'Ultrapassa o limite total do dobro do quantitativo registrado (art. 86, § 5º, da Lei nº 14.133/2021).';
      }
      if (!ata.vigencia_fim && !temPeriodos) res.alertas.push('Vigência da ata não informada.');
      if (per && per.numero > 1) res.alertas.push(per.renova_quantitativos || R.cicloDe(base, per.id, item.ata_id) !== periodosDa(base, item.ata_id)[0].id ? 'Período renovado: saldos contam a partir de ' + R.dataBR(base.periodos.find((p) => p.id === ciclo).inicio) + '.' : 'Ata prorrogada sem renovação: saldo do período anterior continua valendo.');
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
      const it0 = base.itensPorId[pi.item_id];
      const c = (it0 && R.cicloDe(base, pi.periodo_id, it0.ata_id)) || '';
      const k = pi.item_id + '|' + p.orgao_id + '|' + c, ki = pi.item_id + '|' + c;
      porOrg[k] = (porOrg[k] || 0) + Number(pi.qtd_autorizada);
      porItem[ki] = (porItem[ki] || 0) + Number(pi.qtd_autorizada);
    }
    for (const k in porOrg) {
      const [itemId, orgId] = k.split('|');
      const it = base.itensPorId[itemId];
      if (r4(porOrg[k]) > r4(it.qtd_registrada * 0.5))
        out.push({ tipo: '50%', item: it, orgao: base.orgaosPorId[orgId], valor: porOrg[k], limite: it.qtd_registrada * 0.5 });
    }
    for (const ki in porItem) {
      const id = ki.split('|')[0], it = base.itensPorId[id];
      if (r4(porItem[ki]) > r4(it.qtd_registrada * 2))
        out.push({ tipo: 'dobro', item: it, valor: porItem[ki], limite: it.qtd_registrada * 2 });
    }
    return out;
  };

  R.dataBR = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  R.num = (n, casas) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas ?? 0, maximumFractionDigits: casas ?? 4 }));
  R.moeda = (n) => (n == null || n === '' ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  R.r4 = r4;
  window.REGRAS = R;
})();
