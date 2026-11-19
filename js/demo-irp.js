/* Prévia de demonstração do módulo IRP (sem banco): mesmas regras principais do script 13, em memória. */
window.DEMO_IRP = function (obterBase, h) {
  // a base da demonstração é recriada ao recarregar: sempre ler a atual
  const base = new Proxy({}, { get: (t, k) => obterBase()[k], set: (t, k, v) => { obterBase()[k] = v; return true; } });
  const T = ['irps', 'irp_itens', 'irp_respostas', 'irp_resposta_itens', 'irp_envios', 'irp_prorrogacoes', 'irp_numeracao', 'ata_participantes'];
  const prep = () => T.forEach((t) => { base[t] = base[t] || []; });
  const hoje = () => new Date().toISOString().slice(0, 10);
  const soma = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
  const util = (d) => { const w = new Date(d + 'T12:00:00').getDay(); return w !== 0 && w !== 6; };
  const prazoMin = (d, direta) => { let x = d, c = 0; const n = direta ? 3 : 8; while (c < n) { x = soma(x, 1); if (util(x)) c++; } return x; };
  const aberta = (i) => i.situacao === 'aberta' && i.prazo_fim && hoje() <= i.prazo_fim;
  const irp = (id) => base.irps.find((x) => x.id === id);
  const salvar = () => h.salvarLocal();
  const nomeUsuario = 'Kennedy Dantas Francelino';
  function novaResposta(r) { const x = Object.assign({ id: h.uid(), criado_em: new Date().toISOString() }, r); base.irp_respostas.push(x); return x; }
  return {
    async carregarIrp() {
      await h.carregar(); prep();
      return { irps: base.irps, itens: base.irp_itens, respostas: base.irp_respostas, respItens: base.irp_resposta_itens, envios: base.irp_envios, prorrogacoes: base.irp_prorrogacoes,
        numeracao: base.irp_numeracao, atas: base.atas, ataItens: base.itens, participantes: base.ata_participantes, emails: [] };
    },
    async criarIrp(p) {
      prep(); const ano = new Date().getFullYear();
      let n = (base.irp_numeracao.find((x) => x.ano === ano) || {}).proximo || Math.max(0, ...base.irps.filter((x) => x.ano === ano).map((x) => x.numero)) + 1;
      while (base.irps.some((x) => x.ano === ano && x.numero === n)) n++;
      if (base.irps.some((x) => x.situacao !== 'cancelada' && x.processo.replace(/\D/g, '') === p.processo.replace(/\D/g, ''))) throw new Error('Já existe IRP com esse número de processo.');
      const x = { id: h.uid(), numero: n, ano, situacao: 'rascunho', contratacao_direta: !!p.contratacao_direta, processo: p.processo, objeto: p.objeto, signatario_id: p.signatario_id || null, criado_por_nome: nomeUsuario, criado_em: new Date().toISOString() };
      base.irps.push(x); const nm = base.irp_numeracao.find((y) => y.ano === ano); if (nm) nm.proximo = n + 1; else base.irp_numeracao.push({ ano, proximo: n + 1 });
      salvar(); return x.id;
    },
    async definirNumeracaoIrp(ano, proximo) { prep(); const nm = base.irp_numeracao.find((y) => y.ano === ano); if (nm) nm.proximo = proximo; else base.irp_numeracao.push({ ano, proximo }); salvar(); },
    async prazoMinimoIrp(d, direta) { return prazoMin(d, direta); },
    async analisarRespostaIrp(id, itens, motivo) {
      const r = base.irp_respostas.find((x) => x.id === id);
      itens.forEach((l) => { const ri = base.irp_resposta_itens.find((x) => x.id === l.id); if (!ri) return;
        if (l.decisao !== 'aceito' && !String(l.motivo || '').trim()) throw new Error('Informe o motivo dos itens ajustados ou recusados.');
        Object.assign(ri, { decisao: l.decisao, qtd_aceita: l.decisao === 'aceito' ? ri.qtd_informada : l.decisao === 'recusado' ? 0 : Number(l.qtd_aceita), motivo: l.motivo || null }); });
      const ls = base.irp_resposta_itens.filter((x) => x.resposta_id === id);
      r.resultado = ls.every((x) => x.decisao === 'recusado') ? 'recusada' : ls.every((x) => x.decisao === 'aceito') ? 'aceita' : 'ajustada';
      Object.assign(r, { situacao: 'analisada', analisada_em: new Date().toISOString(), analisada_por_nome: nomeUsuario, motivo_geral: motivo || null }); salvar(); return r.resultado;
    },
    async lancarEtpIrp(irpId, orgao, itens) {
      let r = base.irp_respostas.find((x) => x.irp_id === irpId && x.orgao_id === orgao && x.origem === 'etp' && x.situacao !== 'substituida');
      if (!r) r = novaResposta({ irp_id: irpId, orgao_id: orgao, origem: 'etp', situacao: 'analisada', resultado: 'aceita', protocolo: 'ETP-' + orgao.slice(0, 6).toUpperCase(), local_entrega: 'Conforme o ETP', recebida_em: new Date().toISOString() });
      base.irp_resposta_itens = base.irp_resposta_itens.filter((x) => x.resposta_id !== r.id);
      itens.filter((l) => Number(l.qtd) > 0).forEach((l) => base.irp_resposta_itens.push({ id: h.uid(), resposta_id: r.id, item_id: l.item_id, qtd_informada: Number(l.qtd), qtd_aceita: Number(l.qtd), decisao: 'aceito' }));
      salvar(); return r.id;
    },
    async inclusaoPosteriorIrp(irpId, p) {
      const r = novaResposta({ irp_id: irpId, orgao_id: p.orgao_id, origem: 'inclusao_posterior', situacao: 'recebida', protocolo: 'INC-' + h.uid().slice(0, 4).toUpperCase(), local_entrega: p.local_entrega, justificativa: p.justificativa, documento_url: p.documento_url, recebida_em: new Date().toISOString() });
      p.itens.filter((l) => Number(l.qtd) > 0).forEach((l) => base.irp_resposta_itens.push({ id: h.uid(), resposta_id: r.id, item_id: l.item_id, qtd_informada: Number(l.qtd), decisao: 'pendente' }));
      salvar(); return r.id;
    },
    async prorrogarIrp(id, prazo, motivo) { const i = irp(id); base.irp_prorrogacoes.push({ id: h.uid(), irp_id: id, prazo_anterior: i.prazo_fim, prazo_novo: prazo, motivo, criado_por_nome: nomeUsuario, criado_em: new Date().toISOString() }); i.prazo_fim = prazo; i.situacao = 'aberta'; salvar(); },
    async consolidarIrp(id) { const i = irp(id); if (aberta(i)) throw new Error('A IRP ainda está no prazo.'); if (base.irp_respostas.some((r) => r.irp_id === id && r.situacao === 'recebida')) throw new Error('Há manifestações sem análise.'); i.situacao = 'consolidada'; salvar(); },
    async levarIrpParaAta(id, ata, mapa) {
      base.ata_participantes = base.ata_participantes.filter((x) => x.irp_id !== id); let n = 0;
      base.irp_respostas.filter((r) => r.irp_id === id && r.situacao === 'analisada').forEach((r) => base.irp_resposta_itens.filter((x) => x.resposta_id === r.id && x.item_id && mapa[x.item_id] && Number(x.qtd_aceita) > 0)
        .forEach((x) => { base.ata_participantes.push({ id: h.uid(), ata_id: ata, item_id: mapa[x.item_id], orgao_id: r.orgao_id, quantidade: Number(x.qtd_aceita), irp_id: id }); n++; }));
      irp(id).ata_id = ata; salvar(); return n;
    },
    async registrarEnvioIrp(r) { prep(); base.irp_envios.push(Object.assign({ id: h.uid(), criado_em: new Date().toISOString(), criado_por_nome: nomeUsuario }, r)); salvar(); },
    async urlIrp() { return null; },
    async enviarExpedienteIrp(a) { return URL.createObjectURL(a); },
    async publicoIrp(id) {
      await h.carregar(); prep(); const i = irp(id); if (!i || !['aberta', 'encerrada', 'consolidada'].includes(i.situacao)) return null;
      return { id: i.id, numero: String(i.numero).padStart(3, '0') + '/' + i.ano, processo: i.processo, objeto: i.objeto, prazo_fim: i.prazo_fim, aberta: aberta(i), situacao: aberta(i) ? 'aberta' : i.situacao === 'aberta' ? 'encerrada' : i.situacao,
        itens: base.irp_itens.filter((t) => t.irp_id === id).sort((a, b) => a.numero - b.numero), cimop: { nome: base.config.orgao_nome, sigla: base.config.sigla, email: base.config.email_institucional || 'cimop.rn@gmail.com',
          norma: base.config.resolucao_srp, declaracoes: base.config.modelo_irp_declaracoes || null } };
    },
    async publicoIrpEnte(id, cnpj) {
      const o = base.orgaos.find((x) => String(x.cnpj || '').replace(/\D/g, '') === cnpj); if (!o) return { orgao: null };
      const r = base.irp_respostas.filter((x) => x.irp_id === id && x.orgao_id === o.id && x.origem === 'formulario' && ['preenchida', 'recebida', 'analisada'].includes(x.situacao)).pop();
      return { orgao: Object.assign({}, o, { brasao: o.brasao_url, cabecalho: o.timbre_cabecalho_url, rodape: o.timbre_rodape_url }), etp: null,
        resposta: r ? Object.assign({}, r, { itens: base.irp_resposta_itens.filter((x) => x.resposta_id === r.id).map((x) => ({ item_id: x.item_id, qtd: x.qtd_informada, novo_descricao: x.novo_descricao, novo_unidade: x.novo_unidade, justificativa: x.justificativa })) }) : null };
    },
    async publicoIrpSalvar(id, p) {
      const i = irp(id); if (!aberta(i)) throw new Error('Esta IRP não está recebendo manifestações.');
      let o = base.orgaos.find((x) => String(x.cnpj || '').replace(/\D/g, '') === p.cnpj);
      if (!o) { o = { id: h.uid(), nome: p.nome, cnpj: p.cnpj, uf: p.uf, municipio: p.municipio, pendente: true, ativo: true }; base.orgaos.push(o); }
      let r = base.irp_respostas.find((x) => x.irp_id === id && x.orgao_id === o.id && x.origem === 'formulario' && x.situacao === 'preenchida');
      if (!r) r = novaResposta({ irp_id: id, orgao_id: o.id, origem: 'formulario', situacao: 'preenchida', protocolo: 'IRP' + String(i.numero).padStart(3, '0') + '-' + i.ano + '-' + String(base.irp_respostas.filter((x) => x.irp_id === id).length + 1).padStart(3, '0') });
      Object.assign(r, { responsavel_nome: p.responsavel_nome, responsavel_cargo: p.responsavel_cargo, responsavel_email: p.responsavel_email, responsavel_telefone: p.responsavel_telefone, autoridade_nome: String(p.autoridade_nome).toUpperCase(), autoridade_cargo: p.autoridade_cargo, dfd_numero: p.dfd_numero, local_entrega: p.local_entrega });
      base.irp_resposta_itens = base.irp_resposta_itens.filter((x) => x.resposta_id !== r.id);
      p.itens.forEach((l) => base.irp_resposta_itens.push({ id: h.uid(), resposta_id: r.id, item_id: l.item_id, qtd_informada: Number(l.qtd), decisao: 'pendente' }));
      (p.novos || []).forEach((l) => base.irp_resposta_itens.push({ id: h.uid(), resposta_id: r.id, item_id: null, novo_descricao: l.descricao, novo_unidade: l.unidade, justificativa: l.justificativa, qtd_informada: Number(l.qtd), decisao: 'pendente' }));
      salvar(); return { protocolo: r.protocolo, orgao_pendente: !!o.pendente };
    },
    async publicoIrpAnexar(irpId, protocolo, cnpj, arquivo) {
      const r = base.irp_respostas.find((x) => x.protocolo === protocolo); Object.assign(r, { situacao: 'recebida', recebida_em: new Date().toISOString(), arquivo_assinado: 'demo', arquivo_nome: arquivo.name });
      base.irp_respostas.filter((x) => x.irp_id === r.irp_id && x.orgao_id === r.orgao_id && x.id !== r.id && ['formulario', 'etp'].includes(x.origem) && ['preenchida', 'recebida', 'analisada'].includes(x.situacao)).forEach((x) => { x.situacao = 'substituida'; });
      salvar(); return { protocolo, situacao: 'recebida' };
    },
    async publicoIrpConsultar(protocolo) {
      const r = base.irp_respostas.find((x) => x.protocolo === protocolo.toUpperCase()); if (!r) return null;
      const i = irp(r.irp_id), o = base.orgaos.find((x) => x.id === r.orgao_id);
      return { protocolo: r.protocolo, situacao: r.situacao, resultado: r.resultado, irp: String(i.numero).padStart(3, '0') + '/' + i.ano, objeto: i.objeto, orgao: o.nome, recebida_em: r.recebida_em, motivo_geral: r.motivo_geral,
        itens: base.irp_resposta_itens.filter((x) => x.resposta_id === r.id).map((x) => { const t = base.irp_itens.find((y) => y.id === x.item_id) || {}; return { numero: t.numero, descricao: t.descricao || x.novo_descricao, unidade: t.unidade || x.novo_unidade, qtd_informada: x.qtd_informada, qtd_aceita: x.qtd_aceita, decisao: x.decisao, motivo: x.motivo }; }) };
    },
  };
};
