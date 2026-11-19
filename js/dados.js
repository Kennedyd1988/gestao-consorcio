/* Camada de dados: Supabase (produção) ou demonstração (prévia, dados só no navegador). */
(function () {
  const R = window.REGRAS;
  const CFG = window.CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const CONFIG_PADRAO = {
    orgao_nome: 'Consórcio Intermunicipal Multifinalitário dos Municípios do Oeste Potiguar', sigla: 'CIMOP', cidade_uf: 'Portalegre/RN',
    presidente_nome: 'MARCOS AURÉLIO DE PAIVA RÊGO', presidente_cargo: 'Presidente do CIMOP',
    resolucao_srp: 'Resolução CIMOP nº 018/2023', resolucao_alteracao: 'Resolução CIMOP nº 001/2026',
    texto_anexos: 'Conforme solicitado, encaminhamos, em anexo, o processo integral do {pregao}, bem como a Resolução CIMOP nº 018/2023 e a Resolução CIMOP nº 001/2026, que a altera.',
    documentos: [], email_resposta: '', email_copia: '',
    email_assunto: 'Ofício nº {oficio} – {sigla} · {assunto}',
    email_corpo: '{vocativo},\n\nEncaminhamos, em anexo, o Ofício nº {oficio} – {sigla}, em resposta à solicitação de adesão {solicitacao}.\n\n{documentos}\n\nPermanecemos à disposição.\n\nAtenciosamente,\n{presidente}\n{presidente_cargo}\n{orgao}',
  };

  function indexar(b) {
    b.config = b.config || {}; for (const k in CONFIG_PADRAO) if (b.config[k] == null) b.config[k] = CONFIG_PADRAO[k];
    b.atasPorId = {}; b.itensPorId = {}; b.orgaosPorId = {}; b.pedidosPorId = {};
    b.periodos = b.periodos || []; b.importacoes = b.importacoes || []; b.pncpPartes = b.pncpPartes || []; b.precos = b.precos || []; b.pncp = (b.pncp || []).sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || ''));
    b.solicitacoes = (b.solicitacoes || []).sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || ''));
    b.atas.forEach((a) => { b.atasPorId[a.id] = a; a._qtdItens = 0; });
    b.itens.forEach((i) => { b.itensPorId[i.id] = i; if (b.atasPorId[i.ata_id]) b.atasPorId[i.ata_id]._qtdItens++; });
    b.orgaos.forEach((o) => (b.orgaosPorId[o.id] = o));
    b.pedidos.forEach((p) => (b.pedidosPorId[p.id] = p));
    b.itens.sort((x, y) => x.numero - y.numero);
    b.atas.sort((x, y) => y.numero.slice(-4).localeCompare(x.numero.slice(-4)) || y.numero.localeCompare(x.numero));
    b.orgaos.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
    return b;
  }

  // Prévia: órgãos que o PNCP mostrava na ARP 007/2025 em 18/11/2026 (aba Órgãos/Entidades)
  function sementePartes(b) {
    const a = b.atas.find((x) => x.numero === '007/2025'); if (!a) return [];
    a.numero_controle_pncp = a.numero_controle_pncp || '15185079000140-1-000025/2025-000001';
    return [['29138286000158', 'MUNICIPIO DE NILOPOLIS', 'Nilópolis', 'RJ'], ['08234148000100', 'MUNICIPIO DE MACAIBA', 'Macaíba', 'RN'], ['08311904000140', 'MUNICIPIO DE POCO BRANCO', 'Poço Branco', 'RN'],
      ['08079402000135', 'MUNICIPIO DE SAO GONCALO DO AMARANTE', 'São Gonçalo do Amarante', 'RN'], ['13927819000140', 'MUNICIPIO DE LAURO DE FREITAS', 'Lauro de Freitas', 'BA'],
      ['09159666000161', 'MUNICIPIO DE SANTA RITA', 'Santa Rita', 'PB'], ['08184111000107', 'MUNICIPIO DE ALTO DO RODRIGUES', 'Alto do Rodrigues', 'RN']]
      .map(([cnpj, nome, municipio, uf]) => ({ ata_id: a.id, cnpj, tipo: 'Não Participante', nome, municipio, uf, incluido_em: '2026-08-20T14:38:08' }))
      .concat([{ ata_id: a.id, cnpj: '15185079000140', tipo: 'Gerenciadora', nome: 'CONSORCIO INTERMUNICIPAL MULTIFINALITARIO DOS MUNICIPIOS DO OESTE POTIGUAR', municipio: 'Portalegre', uf: 'RN' }]);
  }

  // Exemplos da prévia para a tela "Atualizações do PNCP"
  function sementePncp(b) {
    const ata = (n) => b.atas.find((x) => x.numero === n);
    const out = []; const a8 = ata('008/2025'), a3 = ata('003/2026');
    if (a8) out.push({ id: uid(), chave: 'ex1', tipo: 'prorrogacao', ata_id: a8.id, ata_numero: a8.numero, situacao: 'pendente', criado_em: '2026-11-17T07:00:10-03:00',
      resumo: 'ARP 008/2025 prorrogada até 09/12/2027, com renovação dos quantitativos (EXEMPLO da prévia).', documento_titulo: '1º Termo Aditivo (exemplo)',
      dados: { inicio: '2026-12-10', fim: '2027-12-09', renova: true, renova_lido: true, instrumento: '1º Termo Aditivo', trecho: 'Fica prorrogada por 12 (doze) meses, passando a vigorar de 10/12/2026 a 09/12/2027. Ficam renovados os quantitativos originalmente registrados…' } });
    if (a3) { const it = b.itens.find((x) => x.ata_id === a3.id && x.numero === 3);
      if (it) out.push({ id: uid(), chave: 'ex2', tipo: 'reequilibrio', ata_id: a3.id, ata_numero: a3.numero, situacao: 'pendente', criado_em: '2026-11-17T07:00:12-03:00',
        resumo: 'ARP 003/2026: novo preço em 1 item(ns) (EXEMPLO da prévia).', documento_titulo: '3º Termo Aditivo (exemplo)',
        dados: { itens: [{ numero: 3, preco_anterior: Number(it.preco_unitario), preco_novo: Math.round(Number(it.preco_unitario) * 1.0412 * 100) / 100 }], instrumento: '3º Termo Aditivo' } }); }
    out.push({ id: uid(), chave: 'ex3', tipo: 'nova_ata', ata_numero: '006/2026', situacao: 'pendente', criado_em: '2026-11-17T07:00:14-03:00',
      resumo: 'ARP 006/2026 publicada no PNCP – EMPRESA EXEMPLO LTDA (2 item(ns)) (EXEMPLO da prévia).',
      dados: { numero: '006/2026', pregao: '002/2026', processo: '00000/2026', objeto: 'Registro de preços para aquisição de material de exemplo', detentora: 'EMPRESA EXEMPLO LTDA', cnpj_detentora: '11222333000181',
        data_assinatura: '2026-11-10', inicio: '2026-11-10', fim: '2027-11-10', itens: [{ numero: 1, descricao: 'Item de exemplo A', unidade: 'Unidade', qtd: 500, preco: 12.5 }, { numero: 2, descricao: 'Item de exemplo B', unidade: 'Caixa', qtd: 80, preco: 230 }] } });
    return out;
  }

  // O Presidente que assina os ofícios vem das Pessoas do CIMOP (Cadastro), quando houver um ativo.
  function presidenteDoCadastro(config, pessoas) {
    const p = (pessoas || []).filter((x) => x.ativo !== false && x.cargo === 'Presidente').sort((a, b) => String(b.inicio || '').localeCompare(String(a.inicio || '')))[0];
    if (p) { config.presidente_nome = p.nome; config._presidenteCadastro = true; }
  }

  // ===================== DEMONSTRAÇÃO =====================
  function criarDemo() {
    const CHAVE = 'gestao-consorcio-demo-v2';
    let base;
    const salvarLocal = () => { try { localStorage.setItem(CHAVE, JSON.stringify(limpo())); } catch (e) {} };
    const limpo = () => ({ irps: base.irps, irp_itens: base.irp_itens, irp_respostas: base.irp_respostas, irp_resposta_itens: base.irp_resposta_itens, irp_envios: base.irp_envios, irp_prorrogacoes: base.irp_prorrogacoes, irp_numeracao: base.irp_numeracao, ata_participantes: base.ata_participantes, orgao_leis: base.orgao_leis, orgao_gestores: base.orgao_gestores, orgao_contatos: base.orgao_contatos, pessoas: base.pessoas, integracao: base.integracao, config: base.config, atas: base.atas, itens: base.itens, orgaos: base.orgaos, pedidos: base.pedidos, pedido_itens: base.pedido_itens, solicitacoes: base.solicitacoes, periodos: base.periodos, importacoes: base.importacoes, pncp: base.pncp, pncpCfg: base.pncpCfg, pncpPartes: base.pncpPartes, precos: base.precos });
    function semente() {
      const b = { config: { ...CONFIG_PADRAO }, atas: [], itens: [], orgaos: [], pedidos: [], pedido_itens: [], solicitacoes: [], periodos: [], importacoes: [], pncp: [] };
      if (window.DEMO_SEMENTE) importarLocal(b, window.DEMO_SEMENTE);
      b.pncp = sementePncp(b); b.pncpPartes = sementePartes(b); b.pncpCfg = { ultima_execucao: '2026-11-17T07:00:00-03:00', ultimo_resultado: { atas_pncp: 11, novas: 1, prorrogacoes: 1, reequilibrios: 1, cancelamentos: 0, documentos_lidos: 3, erros: [], origem: 'agenda' } };
      // Uma solicitação de exemplo, como se tivesse chegado pelo formulário online
      const it = (arp, n) => { const a = b.atas.find((x) => x.numero === arp); const i = a && b.itens.find((x) => x.ata_id === a.id && x.numero === n); return i && i.id; };
      const i1 = it('001/2026', 1), i3 = it('003/2026', 3);
      if (i1 && i3) b.solicitacoes.push({ id: uid(), protocolo: 'SOL-2026-0001', situacao: 'recebida', cnpj: '08358013000106', orgao_nome: 'Município de Severiano Melo/RN',
        municipio: 'Severiano Melo', uf: 'RN', esfera: 'Municipal', responsavel: 'NOME DO PREFEITO (EXEMPLO)', cargo: 'Prefeito Municipal', email: 'gabinete@severianomelo.rn.gov.br', telefone: '(84) 0000-0000',
        oficio_numero: '088/2026', oficio_data: '2026-11-14', finalidade: 'à recuperação de estradas vicinais da zona rural do Município',
        itens: [{ item_id: i1, qtd: 200 }, { item_id: i3, qtd: 60 }], arquivos: [{ tipo: 'Ofício de solicitação', nome: 'Oficio_088_2026_Severiano_Melo.pdf', tamanho: 182000 }],
        declaracao: true, criado_em: '2026-11-17T09:12:00-03:00' });
      return b;
    }
    async function carregar() {
      if (!base) {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) {}
        base = s || semente();
        base.solicitacoes = base.solicitacoes || [];
        if (!base.pncp) { base.pncp = sementePncp(base); base.pncpCfg = { ultima_execucao: null, ultimo_resultado: null }; }
        if (!base.pncpPartes) base.pncpPartes = sementePartes(base);
      }
      presidenteDoCadastro(base.config, base.pessoas || []);
      return indexar(base);
    }
    // Usuários de exemplo (só na prévia), para ver os acessos por módulo
    const demoUsuarios = [
      { id: '1', nome: 'Kennedy Dantas Francelino', email: 'kennedyfrancelino@gmail.com', perfil: 'administrador', ativo: true },
      { id: '2', nome: 'Servidor de Exemplo', email: 'licitacao@cimop.rn.gov.br', perfil: 'operador', ativo: true },
      { id: '3', nome: 'Controle Interno (exemplo)', email: 'controle@cimop.rn.gov.br', perfil: 'consulta', ativo: true },
    ];
    let demoAcessos = [{ usuario_id: '2', modulo_id: 'adesoes', perfil: 'operador' }, { usuario_id: '3', modulo_id: 'adesoes', perfil: 'consulta' }];
    const api = {
      modo: 'demo',
      async sessao() { return { id: '1', nome: 'Kennedy Dantas Francelino', email: 'kennedyfrancelino@gmail.com', perfil: 'administrador' }; },
      async entrar() { return api.sessao(); }, async sair() {}, async trocarSenha() {}, async esqueci() {},
      carregar,
      async reiniciarDemo() { try { localStorage.removeItem(CHAVE); } catch (e) {} base = semente(); return indexar(base); },
      async salvar(tabela, reg) {
        const lista = base[tabela] = base[tabela] || [];
        if (tabela === 'orgao_gestores' && reg.atual !== false) {
          const g = { ...(lista.find((x) => x.id === reg.id) || {}), ...reg };
          lista.forEach((x) => { if (x.id !== reg.id && x.orgao_id === g.orgao_id && x.funcao === g.funcao) x.atual = false; });
          const o = base.orgaos.find((x) => x.id === g.orgao_id);
          if (o && g.funcao === 'titular') Object.assign(o, { responsavel: g.nome, cargo: g.cargo || o.cargo, tratamento: g.tratamento || o.tratamento, vocativo: g.vocativo || null });
        }
        if (!reg.id) { reg.id = uid(); lista.push(reg); } else { const i = lista.findIndex((x) => x.id === reg.id); i >= 0 ? (lista[i] = { ...lista[i], ...reg }) : lista.push(reg); }
        if (tabela === 'pedidos' && reg.numero_oficio && lista.some((p) => p.id !== reg.id && p.numero_oficio === reg.numero_oficio)) throw new Error('Já existe um ofício com o número ' + reg.numero_oficio + '.');
        if (tabela === 'periodos') sincronizarVigencia(base, reg.ata_id);
        if (tabela === 'normas') {
          const n = lista.find((x) => x.id === reg.id);
          if (n.papel) lista.forEach((x) => { if (x.id !== n.id && x.papel === n.papel) x.papel = null; });
          const t = (pp) => (lista.find((x) => x.papel === pp) || {}).titulo;
          base.config.resolucao_srp = t('srp') || base.config.resolucao_srp; base.config.resolucao_alteracao = t('srp_alteracao') || null;
        }
        salvarLocal(); indexar(base); return reg;
      },
      async salvarConfig(c) { base.config = { ...base.config, ...c }; salvarLocal(); },
      async carregarCadastro() {
        await carregar();
        for (const t of ['orgao_leis', 'orgao_gestores', 'orgao_contatos', 'pessoas']) base[t] = base[t] || [];
        if (!base.pessoas.length) base.pessoas.push({ id: uid(), nome: base.config.presidente_nome, cargo: 'Presidente', ativo: true, assina_documentos: true });
        base.integracao = base.integracao || ['entes', 'pessoas', 'identidade'].map((item) => ({ item, ativo: false }));
        if (!base.integracao.some((i) => i.item === 'documentos')) base.integracao.push({ item: 'documentos', ativo: false });
        if (!base.normas) base.normas = [{ id: uid(), tipo: 'resolucao', titulo: base.config.resolucao_srp, numero: '018/2023', data: '2023-05-02', papel: 'srp', vigente: true },
          { id: uid(), tipo: 'resolucao', titulo: base.config.resolucao_alteracao, numero: '001/2026', data: '2026-02-10', papel: 'srp_alteracao', vigente: true }];
        base.documentos = base.documentos || [];
        if (base.config.usar_timbre_modelo == null) base.config.usar_timbre_modelo = true;
        if (base.config.logo_url === undefined) base.config.logo_url = 'logo-cimop.jpg';   // demonstração: logotipo que vem no app
        return { orgaos: base.orgaos, leis: base.orgao_leis, gestores: base.orgao_gestores, contatos: base.orgao_contatos, pessoas: base.pessoas, config: base.config, integracao: base.integracao, errosSite: [],
          normas: base.normas, documentos: base.documentos };
      },
      async identidade() { await carregar(); const c = base.config; if (c.logo_url === undefined) c.logo_url = 'logo-cimop.jpg'; return { orgao_nome: c.orgao_nome, sigla: c.sigla, cidade_uf: c.cidade_uf, email: c.email_institucional || 'cimop.rn@gmail.com', telefone: c.telefone, logo_url: c.logo_url || null }; },
      async siteOrgaos() { return [{ id: 'p1', nome: 'Consórcio Intermunicipal Multifinalitário dos Municípios do Oeste Potiguar', sigla: 'CIMOP', cnpj: '15185079000140', atual: !!base.config.portal_orgao_id }]; },
      async siteDefinirPortal(id) { if (base.integracao.some((i) => i.ativo)) throw new Error('Desligue todas as integrações antes de trocar o órgão do Portal.'); base.config.portal_orgao_id = id || null; salvarLocal(); },
      async integracao() { await api.carregarCadastro(); return { itens: base.integracao, erros: [] }; },
      async integracaoConferir(item) {
        if (item === 'identidade') return { site: { nome_exibicao: base.config.orgao_nome, email: 'cimop.rn@gmail.com' }, gestao: { nome_exibicao: base.config.orgao_nome } };
        return { site: [], gestao: item === 'entes' ? base.orgaos.filter((o) => o.vinculo === 'consorciado').length : (base.pessoas || []).filter((p) => p.mostrar_site).length, a_definir: base.orgaos.filter((o) => !o.vinculo).length };
      },
      async integracaoLigar(item) { const x = base.integracao.find((i) => i.item === item); Object.assign(x, { ativo: true, ativado_em: new Date().toISOString(), ativado_por_nome: 'Kennedy Dantas Francelino', ultimo_envio: new Date().toISOString(), ultimo_resultado: { enviados: 0, erros: 0 } }); salvarLocal(); return { enviados: 0, erros: 0, ligados: 0, trazidos: 0, apagados: 0 }; },
      async integracaoEnviarTudo(item) { const x = base.integracao.find((i) => i.item === item); x.ultimo_envio = new Date().toISOString(); x.ultimo_resultado = { enviados: 0, erros: 0 }; salvarLocal(); return x.ultimo_resultado; },
      async integracaoDesligar(item) { base.integracao.find((i) => i.item === item).ativo = false; salvarLocal(); },
      async siteUnidades() { return [{ id: 'u1', nome: 'Assembleia Geral' }, { id: 'u2', nome: 'Diretoria Executiva' }]; },
      ...window.DEMO_IRP ? window.DEMO_IRP(() => base, { uid, salvarLocal, carregar: () => carregar() }) : {},
      async excluir(tabela, id) { base[tabela] = (base[tabela] || []).filter((x) => x.id !== id); salvarLocal(); },
      async enviarArquivoCadastro(arquivo) { return URL.createObjectURL(arquivo); },
      async apagarArquivoCadastro() {},
      urlCadastro(caminho) { return caminho || null; },
      async importacaoExistente(hash) { return (base.importacoes || []).find((x) => x.hash === hash) || null; },
      async registrarImportacao(r) { base.importacoes = base.importacoes || []; base.importacoes.push({ ...r, id: uid(), criado_em: new Date().toISOString(), criado_por_nome: 'Kennedy Dantas Francelino' }); salvarLocal(); },
      async registrarPedido(p) {
        indexar(base);
        if (p.numero_oficio && base.pedidos.some((x) => x.numero_oficio === p.numero_oficio)) throw new Error('Já existe um ofício com o número ' + p.numero_oficio + '.');
        const org = base.orgaosPorId[p.orgao_id];
        const perMig = (l) => { const it = base.itensPorId[l.item_id]; const ps = R.periodosDa(base, it.ata_id); const pm = l.periodo ? ps.find((x) => x.numero === Number(l.periodo)) : (p.data_oficio ? R.periodoNaData(base, it.ata_id, p.data_oficio) : ps[0]); return pm ? pm.id : null; };
        const res = p.origem === 'migracao' ? p.itens.map((l) => ({ item: base.itensPorId[l.item_id], q: Number(l.qtd), decisao: 'autorizado', periodo_id: perMig(l), ...R.usado(base, l.item_id, org.id, null, null) }))
          : R.analisar(base, org, p.data_oficio, p.itens);
        const ped = { id: uid(), numero_oficio: p.numero_oficio || null, data_oficio: p.data_oficio, orgao_id: org.id, oficio_solicitante: p.oficio_solicitante, data_solicitante: p.data_solicitante,
          finalidade: p.finalidade, anexos_texto: p.anexos_texto, origem: p.origem || 'sistema', situacao: R.situacao(res), criado_em: new Date().toISOString(), criado_por_nome: 'Kennedy Dantas Francelino' };
        base.pedidos.push(ped);
        res.forEach((r) => base.pedido_itens.push({ id: uid(), pedido_id: ped.id, item_id: r.item.id, preco_unitario: R.precoNaData(base, r.item, p.data_oficio), qtd_solicitada: r.q, qtd_autorizada: r.decisao === 'autorizado' ? r.q : 0,
          decisao: r.decisao, motivo: r.motivo || null, usado_orgao_antes: r.usadoOrgao ?? r.org, usado_total_antes: r.usadoTotal ?? r.tot, periodo_id: r.periodo_id || null }));
        salvarLocal(); indexar(base); return ped.id;
      },
      async cancelarPedido(id, motivo) { const p = base.pedidos.find((x) => x.id === id); p.situacao = 'cancelado'; p.motivo_cancelamento = motivo; salvarLocal(); },
      async substituirPedido(id, novo) {
        const o = base.pedidos.find((x) => x.id === id);
        if (!o || o.situacao === 'cancelado') throw new Error('Este pedido já foi cancelado ou substituído.');
        const quando = new Date().toLocaleString('pt-BR');
        const num = novo.numero_oficio || o.numero_oficio;
        Object.assign(o, { situacao: 'cancelado', motivo_cancelamento: 'Substituído pela correção de itens e quantidades em ' + quando + '.', numero_oficio: o.numero_oficio ? o.numero_oficio + ' (substituído em ' + quando + ')' : null });
        const nid = await api.registrarPedido({ ...novo, numero_oficio: num });
        const n = base.pedidos.find((x) => x.id === nid); n.substitui_id = id; o.substituido_por = nid;
        base.solicitacoes.forEach((s) => { if (s.pedido_id === id) s.pedido_id = nid; });
        salvarLocal(); indexar(base); return nid;
      },
      async importar(dados, aoProgredir) { const r = importarLocal(base, dados, aoProgredir, api); salvarLocal(); indexar(base); return r; },
      async publicoAtas() {
        await carregar();
        const hojeISO = new Date().toISOString().slice(0, 10);
        return base.atas.filter((a) => a.ativo !== false && (!a.vigencia_fim || a.vigencia_fim >= hojeISO)).map((a) => ({ ...a,
          itens: base.itens.filter((i) => i.ata_id === a.id).map((i) => ({ ...i, aderido: R.usado(base, i.id, null).tot })) }));
      },
      async publicoOrgao(cnpj) {
        await carregar();
        const o = base.orgaos.find((x) => x.cnpj === cnpj && x.ativo !== false);
        const aderido = {};
        if (o) base.itens.forEach((i) => { const u = R.usado(base, i.id, o.id).org; if (u) aderido[i.id] = u; });
        return { orgao: o ? { nome: o.nome, municipio: o.municipio, uf: o.uf, esfera: o.esfera, responsavel: o.responsavel, cargo: o.cargo, email: o.email } : null, aderido };
      },
      async enviarSolicitacao(p, arquivos) {
        await carregar();
        const ano = new Date().getFullYear();
        const n = base.solicitacoes.filter((x) => x.protocolo.includes('-' + ano + '-')).length + 1;
        const protocolo = 'SOL-' + ano + '-' + String(n).padStart(4, '0');
        base.solicitacoes.push({ ...p, id: uid(), protocolo, situacao: 'recebida', criado_em: new Date().toISOString(),
          arquivos: arquivos.map((a) => ({ tipo: a.tipo, nome: a.arquivo.name, tamanho: a.arquivo.size })) });
        salvarLocal(); return protocolo;
      },
      async consultarSolicitacao(protocolo, cnpj) {
        await carregar();
        const s = base.solicitacoes.find((x) => x.protocolo === protocolo.trim().toUpperCase() && x.cnpj === cnpj);
        return s ? { protocolo: s.protocolo, situacao: s.situacao, criado_em: s.criado_em, motivo_recusa: s.motivo_recusa, oficio: s.pedido_id && base.pedidosPorId[s.pedido_id] ? base.pedidosPorId[s.pedido_id].numero_oficio : null } : null;
      },
      async atualizarSolicitacao(id, campos) { const x = base.solicitacoes.find((y) => y.id === id); Object.assign(x, campos, { atualizado_em: new Date().toISOString() }); salvarLocal(); },
      async urlArquivo() { return null; },
      async emailsDoPedido(id) { return (base.emails || []).filter((x) => x.pedido_id === id).sort((x, y) => y.criado_em.localeCompare(x.criado_em)); },
      async enviarEmail() { throw new Error('Na prévia o e-mail não é enviado. Na versão publicada ele sai pelo servidor de e-mail do sistema.'); },
      // ---- preços e reequilíbrios (prévia)
      async registrarReequilibrio(itemId, preco, desde, instrumento, obs) {
        base.precos = base.precos || [];
        const it = base.itens.find((x) => x.id === itemId);
        if (!base.precos.some((p) => p.item_id === itemId) && it.preco_unitario != null) {
          const a = base.atas.find((x) => x.id === it.ata_id);
          base.precos.push({ id: uid(), item_id: itemId, preco: Number(it.preco_unitario), vigente_desde: a.data_assinatura || '2000-01-01', instrumento: 'Preço registrado na ata' });
        }
        const ex = base.precos.find((p) => p.item_id === itemId && p.vigente_desde === desde);
        if (ex) Object.assign(ex, { preco: Number(preco), instrumento, observacoes: obs || null });
        else base.precos.push({ id: uid(), item_id: itemId, preco: Number(preco), vigente_desde: desde, instrumento, observacoes: obs || null, criado_por_nome: 'Kennedy Dantas Francelino' });
        it.preco_unitario = R.precoNaData(base, it, new Date().toISOString().slice(0, 10));
        salvarLocal(); indexar(base);
      },
      async excluirPreco(id) {
        const p = base.precos.find((x) => x.id === id); if (!p) return;
        const ps = base.precos.filter((x) => x.item_id === p.item_id).sort((x, y) => x.vigente_desde.localeCompare(y.vigente_desde));
        if (ps[0].id === id) throw new Error('O preço original não pode ser excluído; corrija o valor.');
        base.precos = base.precos.filter((x) => x.id !== id);
        const it = base.itens.find((x) => x.id === p.item_id); it.preco_unitario = R.precoNaData(base, it, new Date().toISOString().slice(0, 10));
        salvarLocal(); indexar(base);
      },
      async definirPrecoAdesao(piId, preco) { const pi = base.pedido_itens.find((x) => x.id === piId); pi.preco_unitario = Number(preco); pi.preco_conferir = false; salvarLocal(); },
      async recalcularPrecosItem(itemId) {
        const it = base.itens.find((x) => x.id === itemId), varios = base.precos.filter((p) => p.item_id === itemId).length > 1; let n = 0;
        for (const pi of base.pedido_itens.filter((x) => x.item_id === itemId)) {
          const ped = base.pedidos.find((x) => x.id === pi.pedido_id);
          if (ped.data_oficio || !varios) pi.preco_unitario = R.precoNaData(base, it, ped.data_oficio);
          pi.preco_conferir = !ped.data_oficio && varios; n++;
        }
        salvarLocal(); indexar(base); return n;
      },
      // ---- PNCP (na prévia: exemplos fixos; confirmar aplica só neste navegador)
      async pncpConfig() { return base.pncpCfg || {}; },
      async buscarPncp() { throw new Error('Na prévia a busca no PNCP não roda. Na versão publicada ela roda sozinha toda madrugada e pelo botão "Buscar agora".'); },
      async ignorarAtualizacao(id) { const a = base.pncp.find((x) => x.id === id); Object.assign(a, { situacao: 'ignorada', decidido_por_nome: 'Kennedy Dantas Francelino', decidido_em: new Date().toISOString() }); salvarLocal(); indexar(base); },
      async confirmarAtualizacao(id, dados) {
        const a = base.pncp.find((x) => x.id === id); const d = dados || a.dados;
        if (a.situacao !== 'pendente') throw new Error('Esta atualização já foi decidida.');
        if (a.tipo === 'nova_ata') {
          if (base.atas.some((x) => x.numero === d.numero)) throw new Error('Já existe a ARP ' + d.numero + ' no sistema.');
          const ata = { id: uid(), numero: d.numero, pregao: d.pregao, processo: d.processo, objeto: d.objeto, detentora: d.detentora, cnpj_detentora: d.cnpj_detentora,
            data_assinatura: d.data_assinatura, vigencia_inicio: d.inicio, vigencia_fim: d.fim, clausulas_adesao: d.clausulas_adesao || '4.1 a 4.3', ativo: true, numero_controle_pncp: a.numero_controle };
          base.atas.push(ata);
          (d.itens || []).forEach((i) => base.itens.push({ id: uid(), ata_id: ata.id, numero: Number(i.numero), descricao: i.descricao, unidade: i.unidade, qtd_registrada: Number(i.qtd), preco_unitario: i.preco != null ? Number(i.preco) : null }));
          base.periodos.push({ id: uid(), ata_id: ata.id, numero: 1, inicio: d.inicio, fim: d.fim, renova_quantitativos: false, instrumento: 'Vigência original' });
        } else if (a.tipo === 'prorrogacao') {
          const ps = base.periodos.filter((x) => x.ata_id === a.ata_id);
          if (!ps.length) throw new Error('A ARP ' + a.ata_numero + ' não tem a vigência original cadastrada. Cadastre-a na tela da ata antes de confirmar.');
          base.periodos.push({ id: uid(), ata_id: a.ata_id, numero: Math.max(...ps.map((x) => x.numero)) + 1, inicio: d.inicio, fim: d.fim, renova_quantitativos: !!d.renova, instrumento: d.instrumento });
          sincronizarVigencia(base, a.ata_id);
        } else if (a.tipo === 'reequilibrio') {
          for (const n of d.itens) { const it = base.itens.find((x) => x.ata_id === a.ata_id && x.numero === Number(n.numero)); if (!it) throw new Error('Item ' + n.numero + ' não existe na ARP ' + a.ata_numero + '.'); await api.registrarReequilibrio(it.id, n.preco_novo, d.desde || new Date().toISOString().slice(0, 10), d.instrumento); }
        } else if (a.tipo === 'cancelamento') { const at = base.atas.find((x) => x.id === a.ata_id); if (at) at.ativo = false; }
        Object.assign(a, { situacao: 'confirmada', dados: d, decidido_por_nome: 'Kennedy Dantas Francelino', decidido_em: new Date().toISOString() });
        salvarLocal(); indexar(base);
      },
      async usuarios() { return demoUsuarios.map((u) => ({ ...u })); },
      async criarUsuario() { throw new Error('Na prévia não é possível criar usuários. Isso funciona na versão publicada.'); },
      async salvarUsuario(u) { const x = demoUsuarios.find((y) => y.id === u.id); if (x) Object.assign(x, u); },
      async acessos() { const m = {}; for (const x of window.MODULOS.lista) m[x.id] = 'administrador'; return m; },
      async acessosDeTodos() { return demoAcessos.map((a) => ({ ...a })); },
      async salvarAcessos(id, lista) { demoAcessos = demoAcessos.filter((a) => a.usuario_id !== id).concat(lista.map((a) => ({ usuario_id: id, modulo_id: a.modulo, perfil: a.perfil }))); },
      // Pesquisa de preços (ETP): o histórico do PNCP só existe com o banco
      async etpPainel() { const e = new Error('Na demonstração não há histórico do PNCP: o módulo funciona só com o banco.'); e.semScript = true; throw e; },
    };
    return api;
  }

  // Importação em memória (demo) – mesma lógica da versão Supabase
  function importarLocal(b, d) {
    const resumo = { atas: 0, itens: 0, orgaos: 0, pedidos: 0, ignorados: 0 };
    indexar(b);
    for (const a of d.atas) {
      let x = b.atas.find((y) => y.numero === a.numero);
      if (!x) { x = { id: uid() }; b.atas.push(x); }
      Object.assign(x, a); resumo.atas++;
    }
    indexar(b);
    for (const i of d.itens) {
      const ata = b.atas.find((y) => y.numero === i.ata_numero); if (!ata) continue;
      let x = b.itens.find((y) => y.ata_id === ata.id && y.numero === i.numero);
      if (!x) { x = { id: uid(), ata_id: ata.id }; b.itens.push(x); }
      const { ata_numero, ...resto } = i; Object.assign(x, resto); resumo.itens++;
    }
    for (const pr of d.periodos || []) {
      const ata = b.atas.find((y) => y.numero === pr.ata_numero); if (!ata) continue;
      let x = b.periodos.find((y) => y.ata_id === ata.id && y.numero === pr.numero);
      if (!x) { x = { id: uid(), ata_id: ata.id }; b.periodos.push(x); }
      const { ata_numero, ...resto } = pr; Object.assign(x, resto); resumo.periodos = (resumo.periodos || 0) + 1;
      sincronizarVigencia(b, ata.id);
    }
    for (const o of d.orgaos) {
      let x = (o.cnpj && b.orgaos.find((y) => y.cnpj === o.cnpj)) || b.orgaos.find((y) => R_norm(y.nome) === R_norm(o.nome));
      if (!x) { x = { id: uid() }; b.orgaos.push(x); }
      Object.assign(x, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))); resumo.orgaos++;
    }
    indexar(b);
    for (const g of agruparAdesoes(d.adesoes)) {
      if (grupoJaExiste(b, g)) { resumo.ignorados++; continue; }
      const org = b.orgaos.find((y) => R_norm(y.nome) === R_norm(g.orgao_nome)); if (!org) continue;
      const ped = { id: uid(), numero_oficio: g.numero_oficio, data_oficio: g.data_oficio, orgao_id: org.id, oficio_solicitante: g.oficio_solicitante, origem: 'migracao', situacao: 'autorizado', criado_em: new Date().toISOString(), criado_por_nome: 'Migração da planilha' };
      if (ped.numero_oficio && b.pedidos.some((p) => p.numero_oficio === ped.numero_oficio)) ped.numero_oficio = ped.numero_oficio + ' (' + (org.municipio || org.nome) + ')';
      b.pedidos.push(ped);
      for (const l of g.linhas) {
        const ata = b.atas.find((y) => y.numero === l.ata_numero); const it = ata && b.itens.find((y) => y.ata_id === ata.id && y.numero === l.item);
        if (!it) continue;
        const ps = b.periodos.filter((x) => x.ata_id === ata.id);
        const pm = l.periodo ? ps.find((x) => x.numero === Number(l.periodo)) : ps.find((x) => x.numero === 1);
        b.pedido_itens.push({ id: uid(), pedido_id: ped.id, item_id: it.id, qtd_solicitada: l.qtd, qtd_autorizada: l.qtd, decisao: 'autorizado', periodo_id: pm ? pm.id : null });
      }
      resumo.pedidos++;
    }
    return resumo;
  }
  function sincronizarVigencia(b, ataId) {
    const ps = (b.periodos || []).filter((p) => p.ata_id === ataId); const a = b.atas.find((x) => x.id === ataId);
    if (a && ps.length) { a.vigencia_fim = ps.map((p) => p.fim).sort().pop(); a.prorrogada = ps.length > 1; }
  }
  const R_norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Assinatura de um pedido sem nº de ofício: órgão + itens + quantidades (para não duplicar na reimportação)
  function assinaturaGrupo(g) { return R_norm(g.orgao_nome) + '#' + g.linhas.map((l) => l.ata_numero + '|' + l.item + '|' + Number(l.qtd)).sort().join(';'); }
  function assinaturaPedido(b, p, atasPorId, itensPorId) {
    const o = (b.orgaosPorId || {})[p.orgao_id] || b.orgaos.find((x) => x.id === p.orgao_id);
    return R_norm(o ? o.nome : '') + '#' + b.pedido_itens.filter((pi) => pi.pedido_id === p.id).map((pi) => { const it = itensPorId[pi.item_id]; return (atasPorId[it.ata_id] || {}).numero + '|' + it.numero + '|' + Number(pi.qtd_solicitada); }).sort().join(';');
  }
  function grupoJaExiste(b, g) {
    if (g.numero_oficio) return b.pedidos.some((p) => (p.numero_oficio === g.numero_oficio || String(p.numero_oficio || '').startsWith(g.numero_oficio + ' (')) && R_norm(((b.orgaosPorId || {})[p.orgao_id] || b.orgaos.find((x) => x.id === p.orgao_id) || {}).nome) === R_norm(g.orgao_nome));
    const ap = Object.fromEntries(b.atas.map((a) => [a.id, a])), ip = Object.fromEntries(b.itens.map((i) => [i.id, i]));
    const alvo = assinaturaGrupo(g);
    return b.pedidos.some((p) => !p.numero_oficio && assinaturaPedido(b, p, ap, ip) === alvo);
  }

  // Um pedido = mesmo ofício do CIMOP + mesmo órgão (sem ofício: órgão + ARP)
  function agruparAdesoes(ads) {
    const m = new Map();
    for (const a of ads) {
      const k = (a.numero_oficio || 'SEM:' + a.ata_numero) + '|' + R_norm(a.orgao_nome);
      if (!m.has(k)) m.set(k, { numero_oficio: a.numero_oficio || null, data_oficio: a.data_oficio || null, orgao_nome: a.orgao_nome, oficio_solicitante: a.oficio_solicitante || null, linhas: [] });
      const g = m.get(k);
      g.data_oficio = g.data_oficio || a.data_oficio; g.oficio_solicitante = g.oficio_solicitante || a.oficio_solicitante;
      g.linhas.push({ ata_numero: a.ata_numero, item: a.item, qtd: a.qtd, periodo: a.periodo || null });
    }
    return [...m.values()];
  }

  // ===================== SUPABASE =====================
  function criarSupabase() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { db: { schema: CFG.SCHEMA || 'consorcio' }, auth: { storageKey: 'sb-gestao-consorcio' } });
    const ok = ({ data, error }) => { if (error) throw new Error(traduzir(error)); return data; };
    const traduzir = (e) => {
      const m = e.message || String(e);
      if (/duplicate key.*numero_oficio/i.test(m)) return 'Já existe um ofício com esse número.';
      if (/duplicate key.*cnpj/i.test(m)) return 'Já existe um órgão com esse CNPJ.';
      if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
      if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
      return m;
    };
    async function tudo(tabela, ordem) {
      let out = [], de = 0;
      for (;;) { const d = ok(await sb.from(tabela).select('*').order(ordem || 'id').range(de, de + 999)); out = out.concat(d); if (d.length < 1000) break; de += 1000; }
      return out;
    }
    // Sigla do consórcio no link público (?c=SIGLA). Sem sigla, o banco usa o primeiro consórcio (links antigos).
    const SIGLA_LINK = new URLSearchParams(location.search).get('c') || null;
    // Chama a função nova (com sigla/IRP) e, se o banco ainda não tiver o script 15, a antiga.
    async function rpcCompat(nome, args, extras) {
      const r = await sb.rpc(nome, Object.assign({}, args, extras));
      if (r.error && /function|could not find|PGRST202/i.test(r.error.message + ' ' + (r.error.code || ''))) return ok(await sb.rpc(nome, args));
      return ok(r);
    }
    const api = {
      modo: 'supabase', sb, siglaLink: SIGLA_LINK,
      consorcioId: null, configId: 1,
      async sessao() {
        const { data } = await sb.auth.getSession(); if (!data.session) return null;
        const u = ok(await sb.from('usuarios').select('*').eq('id', data.session.user.id).maybeSingle());
        if (!u || !u.ativo) { await sb.auth.signOut(); throw new Error('Seu acesso não está ativo. Fale com o administrador.'); }
        // Vários consórcios (script 15): perfil no consórcio atual e a lista para trocar
        const mc = await sb.rpc('meus_consorcios');
        if (!mc.error) {
          u.consorcios = mc.data || [];
          const atual = u.consorcios.find((c) => c.atual) || null;
          u.consorcio = atual;
          api.consorcioId = atual ? atual.id : null;
          if (atual) u.perfil = atual.perfil || u.perfil;
          else if (!u.consorcios.length && !u.suporte) { await sb.auth.signOut(); throw new Error('Seu acesso não está ativo em nenhum consórcio. Fale com o administrador.'); }
        } else u.consorcios = [];
        return u;
      },
      async trocarConsorcio(id) { ok(await sb.rpc('trocar_consorcio', { p_consorcio: id })); },
      async consorciosTodos() { return ok(await sb.from('consorcios').select('*').order('sigla')); },
      async criarConsorcio(p) { return ok(await sb.rpc('criar_consorcio', { p_sigla: p.sigla, p_nome: p.nome, p_cnpj: p.cnpj || null, p_cidade_uf: p.cidade_uf || null })); },
      async alterarConsorcio(id, ativo) { ok(await sb.rpc('alterar_consorcio', { p_id: id, p_ativo: ativo })); },
      async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); return api.sessao(); },
      async sair() { await sb.auth.signOut(); },
      async esqueci(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async trocarSenha(nova) { ok(await sb.auth.updateUser({ password: nova })); const { data } = await sb.auth.getUser(); await sb.from('usuarios').update({ troca_senha: false }).eq('id', data.user.id); },
      async carregar() {
        const [config, atas, itens, orgaos, pedidos, pedido_itens, solicitacoes, periodos, pncp, partes, precos] = await Promise.all([
          sb.from('configuracoes').select('*').limit(1).single().then(ok).then((c) => { api.configId = c.id; return c; }), tudo('atas'), tudo('itens'), tudo('orgaos'), tudo('pedidos'), tudo('pedido_itens'),
          tudo('solicitacoes', 'criado_em').catch(() => []),   // sem o script 02: lista vazia
          tudo('periodos').catch(() => []),                      // sem o script 03: sem períodos
          tudo('pncp_atualizacoes', 'criado_em').catch(() => null),  // sem o script 04: null
          tudo('pncp_partes', 'ata_id').catch(() => null),           // sem o script 06: null
          tudo('precos', 'vigente_desde').catch(() => null)]);       // sem o script 08: null
        const pessoas = await tudo('pessoas').catch(() => []);         // sem o script 11: sem pessoas
        const participantes = await tudo('ata_participantes').catch(() => []);   // sem o script 13: nenhum
        presidenteDoCadastro(config, pessoas);
        return indexar({ config, atas, itens, orgaos, pedidos, pedido_itens, solicitacoes, periodos, pncp: pncp || [], pncpAtivo: pncp !== null, pncpPartes: partes || [], partesAtivo: partes !== null, precos: precos || [], precosAtivo: precos !== null, participantes });
      },
      async salvar(tabela, reg) {
        const { id, ...resto } = Object.fromEntries(Object.entries(reg).filter(([k]) => !k.startsWith('_')));
        if (id) return ok(await sb.from(tabela).update(resto).eq('id', id).select().single());
        return ok(await sb.from(tabela).insert(resto).select().single());
      },
      // ---------- Cadastro de Consorciados (script 11)
      async carregarCadastro() {
        const r = await sb.from('orgao_gestores').select('id').limit(1);
        if (r.error) { const e = new Error('Rode o script 11 na Supabase para ativar o Cadastro de Consorciados.'); e.semScript = true; throw e; }
        const [orgaos, leis, gestores, contatos, pessoas, config, integ, erros] = await Promise.all([tudo('orgaos'), tudo('orgao_leis'), tudo('orgao_gestores'), tudo('orgao_contatos'), tudo('pessoas'),
          sb.from('configuracoes').select('*').limit(1).single().then(ok).then((c) => { api.configId = c.id; return c; }),
          sb.from('integracao').select('*').then((r) => (r.error ? [] : r.data)), sb.from('integracao_erros').select('*').then((r) => (r.error ? [] : r.data))]);
        // Módulo Consórcio (script 14): sem o script, as listas ficam vazias
        const [normas, documentos] = await Promise.all([sb.from('normas').select('*').order('data', { ascending: false }).then((r) => (r.error ? null : r.data)),
          sb.from('documentos').select('*').order('data', { ascending: false }).then((r) => (r.error ? null : r.data))]);
        return { orgaos, leis, gestores, contatos, pessoas, config, integracao: integ, errosSite: erros, normas: normas || [], documentos: documentos || [], semScript14: normas === null };
      },
      async excluir(tabela, id) { ok(await sb.from(tabela).delete().eq('id', id)); },
      async identidade(sigla) { try { return await rpcCompat('publico_identidade', {}, { p_sigla: sigla || SIGLA_LINK }); } catch (e) { return null; } },
      async siteOrgaos() { return ok(await sb.rpc('site_orgaos')); },
      async siteDefinirPortal(id) { ok(await sb.rpc('site_definir_portal', { p_orgao: id || null })); },
      // ---------- Integração com o site (script 12)
      async integracao() {
        const r = await sb.from('integracao').select('*').order('item');
        if (r.error) { const e = new Error('Rode o script 12 na Supabase para ativar a integração com o site.'); e.semScript = true; throw e; }
        const er = await sb.from('integracao_erros').select('*').order('quando', { ascending: false });
        return { itens: r.data, erros: er.data || [] };
      },
      async integracaoConferir(item) { return ok(await sb.rpc('integracao_conferir', { p_item: item })); },
      async integracaoLigar(item, semPar) { return ok(await sb.rpc('integracao_ligar', { p_item: item, p_sem_par: semPar || 'trazer' })); },
      async integracaoEnviarTudo(item) { return ok(await sb.rpc('integracao_enviar_tudo', { p_item: item })); },
      async integracaoDesligar(item) { ok(await sb.rpc('integracao_desligar', { p_item: item })); },
      async siteUnidades() { const r = await sb.rpc('site_unidades'); return r.error ? [] : r.data; },
      // ---------- IRP (script 13)
      async carregarIrp() {
        const r = await sb.from('irps').select('id').limit(1);
        if (r.error) { const e = new Error('Rode o script 13 na Supabase para ativar o módulo IRP.'); e.semScript = true; throw e; }
        const vazio = () => [];
        const [irps, itens, respostas, respItens, envios, prorrogacoes, numeracao, atas, ataItens, participantes, emails] = await Promise.all([
          tudo('irps'), tudo('irp_itens'), tudo('irp_respostas'), tudo('irp_resposta_itens'), tudo('irp_envios'), tudo('irp_prorrogacoes'),
          sb.from('irp_numeracao').select('*').then(ok), tudo('atas').catch(vazio), tudo('itens').catch(vazio), tudo('ata_participantes').catch(vazio),
          sb.from('emails').select('id, irp_id, orgao_id, para, assunto, situacao, criado_em').not('irp_id', 'is', null).then((x) => x.data || [])]);
        return { irps, itens, respostas, respItens, envios, prorrogacoes, numeracao, atas, ataItens, participantes, emails };
      },
      async criarIrp(p) { return ok(await sb.rpc('criar_irp', { p })); },
      async definirNumeracaoIrp(ano, proximo) { ok(await sb.rpc('definir_numeracao_irp', { p_ano: ano, p_proximo: proximo })); },
      async prazoMinimoIrp(data, direta) { return ok(await sb.rpc('prazo_minimo_irp', { p_divulgacao: data, p_direta: !!direta })); },
      async analisarRespostaIrp(id, itens, motivo) { return ok(await sb.rpc('analisar_resposta_irp', { p_resposta: id, p_itens: itens, p_motivo: motivo || null })); },
      async lancarEtpIrp(irp, orgao, itens) { return ok(await sb.rpc('lancar_etp_irp', { p_irp: irp, p_orgao: orgao, p_itens: itens })); },
      async inclusaoPosteriorIrp(irp, p) { return ok(await sb.rpc('registrar_inclusao_posterior_irp', { p_irp: irp, p })); },
      async prorrogarIrp(irp, prazo, motivo) { ok(await sb.rpc('prorrogar_irp', { p_irp: irp, p_prazo: prazo, p_motivo: motivo })); },
      async consolidarIrp(irp) { ok(await sb.rpc('consolidar_irp', { p_irp: irp })); },
      async levarIrpParaAta(irp, ata, mapa) { return ok(await sb.rpc('levar_irp_para_ata', { p_irp: irp, p_ata: ata, p_mapa: mapa })); },
      async registrarEnvioIrp(r) { ok(await sb.from('irp_envios').insert(r)); },
      async urlIrp(caminho) { const { data } = await sb.storage.from('consorcio-irp').createSignedUrl(caminho, 600); return data && data.signedUrl; },
      async enviarExpedienteIrp(arquivo, irp) {
        const caminho = 'expedientes/' + irp + '/' + uid() + '/' + arquivo.name.normalize('NFD').replace(/[^\w.\-]+/g, '_');
        const { error } = await sb.storage.from('consorcio-irp').upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false });
        if (error) throw new Error('Não foi possível enviar o arquivo: ' + error.message);
        return caminho;
      },
      // formulário público (sem login)
      async publicoIrp(id) { return ok(await sb.rpc('publico_irp', { p_id: id })); },
      async publicoIrpEnte(id, cnpj) { return ok(await sb.rpc('publico_irp_ente', { p_id: id, p_cnpj: cnpj })); },
      async publicoIrpSalvar(id, p) { return ok(await sb.rpc('publico_irp_salvar', { p_id: id, p })); },
      async publicoIrpAnexar(irp, protocolo, cnpj, arquivo) {
        const caminho = 'envios/' + irp + '/' + uid() + '/' + arquivo.name.normalize('NFD').replace(/[^\w.\-]+/g, '_');
        const { error } = await sb.storage.from('consorcio-irp').upload(caminho, arquivo, { contentType: 'application/pdf', upsert: false });
        if (error) throw new Error('Não foi possível enviar o arquivo: ' + error.message);
        return rpcCompat('publico_irp_anexar', { p_protocolo: protocolo, p_cnpj: cnpj, p_caminho: caminho, p_nome: arquivo.name }, { p_irp: irp });
      },
      async publicoIrpConsultar(protocolo, cnpj, irp) { return rpcCompat('publico_irp_consultar', { p_protocolo: protocolo, p_cnpj: cnpj }, irp ? { p_irp: irp } : {}); },
      async enviarArquivoCadastro(arquivo, pasta) {
        const ext = (arquivo.name.match(/\.(\w+)$/) || [, 'pdf'])[1].toLowerCase();
        const caminho = pasta + '/' + Date.now() + '-' + uid().slice(0, 8) + '.' + ext;
        const { error } = await sb.storage.from('consorcio-cadastro').upload(caminho, arquivo, { contentType: arquivo.type || undefined, upsert: false });
        if (error) throw new Error('Não foi possível enviar o arquivo ' + arquivo.name + ': ' + error.message);
        return caminho;
      },
      async apagarArquivoCadastro(caminho) { if (caminho && !/^(https?|blob|data):/.test(caminho)) await sb.storage.from('consorcio-cadastro').remove([caminho]); },
      urlCadastro(caminho) { if (!caminho) return null; if (/^(https?|blob|data):/.test(caminho)) return caminho; return sb.storage.from('consorcio-cadastro').getPublicUrl(caminho).data.publicUrl; },
      async salvarConfig(c) { const { id, atualizado_em, ...r } = Object.fromEntries(Object.entries(c).filter(([k]) => !k.startsWith('_'))); ok(await sb.from('configuracoes').update({ ...r, atualizado_em: new Date().toISOString() }).eq('id', api.configId)); },
      async registrarPedido(p) { return ok(await sb.rpc('registrar_pedido', { p })); },
      async cancelarPedido(id, motivo) { ok(await sb.rpc('cancelar_pedido', { p_id: id, p_motivo: motivo })); },
      async substituirPedido(id, p) { return ok(await sb.rpc('substituir_pedido', { p_id: id, p })); },
      async importar(d, aoProgredir) {
        const resumo = { atas: 0, itens: 0, orgaos: 0, pedidos: 0, ignorados: 0 };
        const atas = ok(await sb.from('atas').upsert(d.atas, { onConflict: 'numero' }).select());
        resumo.atas = atas.length;
        const idAta = Object.fromEntries(atas.map((a) => [a.numero, a.id]));
        const todasAtas = await tudo('atas'); todasAtas.forEach((a) => (idAta[a.numero] = a.id));
        const itens = d.itens.filter((i) => idAta[i.ata_numero]).map(({ ata_numero, ...i }) => ({ ...i, ata_id: idAta[ata_numero] }));
        for (let k = 0; k < itens.length; k += 500) ok(await sb.from('itens').upsert(itens.slice(k, k + 500), { onConflict: 'ata_id,numero' }));
        resumo.itens = itens.length;
        const pers = (d.periodos || []).filter((p) => idAta[p.ata_numero]).map(({ ata_numero, ...p }) => ({ ...p, ata_id: idAta[ata_numero] }));
        if (pers.length) { ok(await sb.from('periodos').upsert(pers, { onConflict: 'ata_id,numero' })); resumo.periodos = pers.length; }
        const existentes = await tudo('orgaos');
        for (const o of d.orgaos) {
          const x = (o.cnpj && existentes.find((y) => y.cnpj === o.cnpj)) || existentes.find((y) => R_norm(y.nome) === R_norm(o.nome));
          const dados = Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
          const salvo = ok(await sb.from('orgaos').upsert(x ? { ...dados, id: x.id } : dados).select().single());
          if (!x) existentes.push(salvo); else Object.assign(x, salvo);
          resumo.orgaos++;
        }
        const todosItens = await tudo('itens');
        const pedidos = await tudo('pedidos');
        const snap = { atas: todasAtas, itens: todosItens, orgaos: existentes, pedidos, pedido_itens: await tudo('pedido_itens') };
        const grupos = agruparAdesoes(d.adesoes);
        let n = 0;
        for (const g of grupos) {
          aoProgredir && aoProgredir(++n, grupos.length);
          const org = existentes.find((y) => R_norm(y.nome) === R_norm(g.orgao_nome)); if (!org) continue;
          if (grupoJaExiste(snap, g)) { resumo.ignorados++; continue; }
          let num = g.numero_oficio;
          if (num && pedidos.some((p) => p.numero_oficio === num)) num = num + ' (' + (org.municipio || org.nome) + ')';
          const linhas = g.linhas.map((l) => ({ item_id: (todosItens.find((i) => i.ata_id === idAta[l.ata_numero] && i.numero === l.item) || {}).id, qtd: l.qtd, periodo: l.periodo || 1 })).filter((l) => l.item_id);
          if (!linhas.length) continue;
          const id = await api.registrarPedido({ numero_oficio: num, data_oficio: g.data_oficio || null, orgao_id: org.id, oficio_solicitante: g.oficio_solicitante, origem: 'migracao', itens: linhas });
          pedidos.push({ id, numero_oficio: num, orgao_id: org.id });
          resumo.pedidos++;
        }
        return resumo;
      },
      async publicoAtas() { return (await rpcCompat('publico_atas', {}, { p_sigla: SIGLA_LINK })) || []; },
      async importacaoExistente(hash) { return ok(await sb.from('importacoes').select('*').eq('hash', hash).maybeSingle()); },
      async registrarImportacao(r) {
        const { data } = await sb.auth.getUser();
        const u = data && data.user ? ok(await sb.from('usuarios').select('nome').eq('id', data.user.id).maybeSingle()) : null;
        ok(await sb.from('importacoes').insert({ ...r, criado_por_nome: u ? u.nome : null }));
      },
      async publicoOrgao(cnpj) { return rpcCompat('publico_orgao', { p_cnpj: cnpj }, { p_sigla: SIGLA_LINK }); },
      async enviarSolicitacao(p, arquivos) {
        const pasta = 'envios/' + uid() + '/';
        const lista = [];
        for (const a of arquivos) {
          const nome = a.arquivo.name.normalize('NFD').replace(/[^\w.\-]+/g, '_');
          const { error } = await sb.storage.from('consorcio-solicitacoes').upload(pasta + nome, a.arquivo, { contentType: 'application/pdf', upsert: false });
          if (error) throw new Error('Não foi possível enviar o arquivo ' + a.arquivo.name + ': ' + error.message);
          lista.push({ tipo: a.tipo, nome: a.arquivo.name, caminho: pasta + nome, tamanho: a.arquivo.size });
        }
        return ok(await sb.rpc('enviar_solicitacao', { p: { ...p, arquivos: lista, sigla: SIGLA_LINK } }));
      },
      async consultarSolicitacao(protocolo, cnpj) { return rpcCompat('consultar_solicitacao', { p_protocolo: protocolo, p_cnpj: cnpj }, { p_sigla: SIGLA_LINK }); },
      async atualizarSolicitacao(id, campos) { ok(await sb.from('solicitacoes').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id)); },
      async urlArquivo(caminho) { const { data } = await sb.storage.from('consorcio-solicitacoes').createSignedUrl(caminho, 600); return data && data.signedUrl; },
      async registrarReequilibrio(itemId, preco, desde, instrumento, obs) { ok(await sb.rpc('registrar_reequilibrio', { p_item: itemId, p_preco: preco, p_desde: desde, p_instrumento: instrumento || null, p_obs: obs || null })); },
      async excluirPreco(id) { ok(await sb.rpc('excluir_preco', { p_id: id })); },
      async definirPrecoAdesao(piId, preco) { ok(await sb.rpc('definir_preco_adesao', { p_pedido_item: piId, p_preco: preco })); },
      async recalcularPrecosItem(itemId) { return ok(await sb.rpc('recalcular_precos_item', { p_item: itemId })); },
      async emailsDoPedido(id) { try { return ok(await sb.from('emails').select('*').eq('pedido_id', id).order('criado_em', { ascending: false })); } catch (e) { return []; } },
      async enviarEmail(msg) {
        const { data, error } = await sb.functions.invoke('consorcio-enviar-email', { body: msg });
        if (data && data.erro) throw new Error(data.erro);
        if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) {} throw new Error(m); }
        return data;
      },
      async pncpConfig() { return ok(await sb.from('pncp_config').select('cnpj, desde, ultima_execucao, ultimo_resultado').limit(1).maybeSingle()) || {}; },
      async buscarPncp() {
        const { data, error } = await sb.functions.invoke('consorcio-pncp', { body: { origem: 'manual' } });
        if (data && data.erro) throw new Error(data.erro);
        if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) {} throw new Error(m); }
        return data;
      },
      async confirmarAtualizacao(id, dados) { ok(await sb.rpc('confirmar_atualizacao', { p_id: id, p_dados: dados || null })); },
      async ignorarAtualizacao(id) { ok(await sb.rpc('ignorar_atualizacao', { p_id: id })); },
      // Usuários do consórcio atual, com o perfil e a situação neste consórcio (script 15). Sem o script: a tabela antiga.
      async usuarios() {
        const r = await sb.from('usuario_consorcios').select('perfil, ativo, usuario_id, usuarios(id, nome, email, troca_senha, suporte)').eq('consorcio_id', api.consorcioId);
        if (r.error || !api.consorcioId) return ok(await sb.from('usuarios').select('*').order('nome'));
        return r.data.filter((x) => x.usuarios).map((x) => ({ ...x.usuarios, perfil: x.perfil, ativo: x.ativo })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      },
      async criarUsuario(u) {
        const { data, error } = await sb.functions.invoke('consorcio-convidar-usuario', { body: u });
        if (error) throw new Error((data && data.erro) || error.message);
        if (data && data.erro) throw new Error(data.erro);
        return data;
      },
      async salvarUsuario(u) {
        if (!api.consorcioId) { ok(await sb.from('usuarios').update({ nome: u.nome, perfil: u.perfil, ativo: u.ativo }).eq('id', u.id)); return; }
        ok(await sb.from('usuarios').update({ nome: u.nome }).eq('id', u.id));
        ok(await sb.from('usuario_consorcios').update({ perfil: u.perfil, ativo: u.ativo }).eq('usuario_id', u.id).eq('consorcio_id', api.consorcioId));
      },
      // Módulos liberados para a pessoa: { adesoes: 'operador', sistema: 'administrador' }.
      // Sem o script 10: administrador vê tudo; os demais usam o perfil antigo no módulo de adesões.
      async acessos(u) {
        const admin = u.perfil === 'administrador', mapa = {};
        let q = sb.from('usuario_modulos').select('modulo_id, perfil').eq('usuario_id', u.id);
        if (api.consorcioId) q = q.eq('consorcio_id', api.consorcioId);
        const r = await q;
        if (r.error) {   // script 10 ainda não rodado
          if (admin) for (const m of window.MODULOS.lista) mapa[m.id] = 'administrador'; else mapa.adesoes = u.perfil;
          return mapa;
        }
        const mods = await sb.from('modulos').select('id, ativo');
        const desligados = new Set((mods.data || []).filter((m) => m.ativo === false).map((m) => m.id));
        if (admin) { for (const m of window.MODULOS.lista) if (!desligados.has(m.id)) mapa[m.id] = 'administrador'; mapa.sistema = 'administrador'; }
        else for (const x of r.data) if (!desligados.has(x.modulo_id)) mapa[x.modulo_id] = x.perfil;
        return mapa;
      },
      async acessosDeTodos() {
        const r = await sb.from('usuario_modulos').select('usuario_id, modulo_id, perfil');
        if (r.error) { const e = new Error('Rode o script 10 na Supabase para liberar os acessos por módulo.'); e.semScript = true; throw e; }
        return r.data;
      },
      async salvarAcessos(id, lista) { ok(await sb.rpc('salvar_acessos', { p_usuario: id, p_acessos: lista })); },
      // ---- Pesquisa de preços e quantitativos (ETP, script 17)
      async etpPainel() {
        const { data, error } = await sb.rpc('etp_painel');
        if (error) { const e = new Error(/etp_painel|schema cache|does not exist/i.test(error.message) ? 'Rode o script 17 na Supabase para ativar o módulo.' : traduzir(error)); e.semScript = /etp_painel|schema cache|does not exist/i.test(error.message); throw e; }
        return data;
      },
      async etpCompras(f) { return ok(await sb.rpc('etp_compras_lista', { p_cnpjs: f.cnpjs, p_ano: f.ano || null, p_modalidade: f.modalidade || null, p_texto: f.texto || null, p_offset: f.offset || 0, p_limite: f.limite || 50 })); },
      async etpBuscarAgora() { return ok(await sb.rpc('etp_buscar_agora')); },
      async etpStatus() { const r = await sb.rpc('etp_status'); return r.error ? null : r.data; },
      async etpContratos(cnpjs) { return ok(await sb.from('etp_contratos').select('*').in('cnpj', cnpjs).order('data_assinatura', { ascending: false, nullsFirst: false }).limit(1000)); },
      async etpCompra(controle) { return ok(await sb.rpc('etp_compra', { p_controle: controle })); },
      async etpBuscar(f) { return ok(await sb.rpc('etp_buscar', { p_texto: f.texto, p_cnpjs: f.cnpjs, p_ano_ini: f.anoIni || null, p_ano_fim: f.anoFim || null, p_limite: f.limite || 100 })); },
      async etpItensSerie(chave, cnpjs) { return ok(await sb.rpc('etp_itens_serie', { p_chave: chave, p_cnpjs: cnpjs })); },
      async etpJuntar(chaves, destino, nome) { ok(await sb.rpc('etp_juntar', { p_chaves: chaves, p_destino: destino, p_nome: nome || null })); },
      async etpSeparar(itens, nome, voltar) { return ok(await sb.rpc('etp_separar', { p_itens: itens, p_nome: nome || null, p_voltar: !!voltar })); },
      async etpNomear(chave, nome) { ok(await sb.rpc('etp_nomear', { p_chave: chave, p_nome: nome || '' })); },
      async etpIncluirCnpj(orgao, cnpj, rotulo, nome) { ok(await sb.rpc('etp_incluir_cnpj', { p_orgao: orgao, p_cnpj: cnpj, p_rotulo: rotulo || null, p_nome: nome || null })); },
      async etpRemoverCnpj(orgao, cnpj) { ok(await sb.from('etp_entes_cnpj').delete().eq('orgao_id', orgao).eq('cnpj', cnpj)); },
      async etpFuncao(corpo) {
        const { data, error } = await sb.functions.invoke('consorcio-etp-pncp', { body: corpo });
        if (data && data.erro) throw new Error(data.erro);
        if (error) { let m = error.message; try { const j = await error.context.json(); if (j && j.erro) m = j.erro; } catch (e) {} throw new Error(m); }
        return data;
      },
    };
    return api;
  }

  window.DADOS = CFG.SUPABASE_URL && window.supabase ? criarSupabase() : criarDemo();
  window.DADOS.agruparAdesoes = agruparAdesoes;
  window.DADOS.grupoJaExiste = grupoJaExiste;
  window.DADOS.normalizar = R_norm;
})();
