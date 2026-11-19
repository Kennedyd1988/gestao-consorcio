/* =====================================================================
   SOFT+ Consórcios · catálogo de módulos da Gestão de Consórcio
   Cada módulo é um ícone na tela principal. Para criar um módulo novo:
     1. acrescentar aqui (id igual ao de consorcio.modulos no banco);
     2. insert em consorcio.modulos (script do módulo);
     3. menu e telas do módulo em js/app.js (MENUS[id] e TELAS).
   "sistema" não existe no banco: é a área do administrador do sistema.
   ===================================================================== */
(function () {
  'use strict';
  // Ícones em linha (24×24, traço 1.8), desenhados para a SOFT+. Sempre aria-hidden.
  const ICONES = {
    // Ata (documento com dobra) + selo de autorização
    adesoes: '<path d="M6 2.8h7.2L18 7.6v4.1"/><path d="M13 2.8v4.9h5"/><path d="M6 2.8a1.6 1.6 0 0 0-1.6 1.6v15.2A1.6 1.6 0 0 0 6 21.2h5.4"/>' +
      '<path d="M7.6 10h6.6M7.6 13.4h4.2M7.6 16.8h2.6"/><circle cx="17.2" cy="17" r="4.6"/><path d="m15.1 17 1.5 1.5 2.8-2.9"/>',
    // Prédio público (frontão e colunas) + ficha: cadastro dos entes
    irp: '<rect x="4" y="3" width="12" height="16" rx="1.6"/><path d="M7 7.5h6M7 10.5h6M7 13.5h3.5"/><circle cx="17" cy="16.5" r="3.6"/><path d="m19.6 19.1 2 2"/>',
    consorciados: '<path d="M3 9.2 11 4.6l8 4.6"/><path d="M4.4 9.4h13.2"/><path d="M6.2 9.6v7.2M9.4 9.6v7.2M12.6 9.6v4.4"/><path d="M3.4 19.6h8.2"/><path d="M4.4 17h7.2"/>' +
      '<rect x="14.2" y="12.6" width="6.6" height="8.4" rx="1.2"/><path d="M15.9 15.4h3.2M15.9 17.6h3.2M15.9 19.6h1.8"/>',
    // Selo institucional (escudo) + folhas: o próprio consórcio, seus dados e documentos
    consorcio: '<path d="M12 2.8 4.6 5.6v5.6c0 4.6 3.1 8.3 7.4 9.9 4.3-1.6 7.4-5.3 7.4-9.9V5.6Z"/><path d="M8.6 9.4h6.8M8.6 12.4h6.8M8.6 15.4h4"/>',
    // Gráfico de barras + lupa: histórico de compras e pesquisa de preços
    etp: '<path d="M3.6 20.4h16.8"/><path d="M5.6 20.4v-6.2M9.4 20.4V9.8M13.2 20.4v-4.4"/><circle cx="16.4" cy="8" r="3.8"/><path d="m19.2 10.8 2.4 2.4"/><path d="M15 8h2.8M16.4 6.6v2.8"/>',
    // Pessoas + chave (usuários e acessos)
    sistema: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.6c.5-3.5 3-5.6 6.2-5.6 1.4 0 2.6.4 3.6 1.1"/>' +
      '<circle cx="17.2" cy="13.6" r="2.4"/><path d="M17.2 16v5.2M17.2 18.6h2M17.2 20.6h1.4"/><path d="M15.4 3.6a3.4 3.4 0 0 1 0 6.6"/>',
  };
  function icone(id, tamanho) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('width', tamanho || 24); s.setAttribute('height', tamanho || 24);
    s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '1.8');
    s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.innerHTML = ICONES[id] || ICONES.adesoes;   // texto fixo deste arquivo, nunca dado digitado
    return s;
  }

  const LISTA = [
    {
      id: 'consorciados',
      nome: 'Cadastro de Consorciados',
      descricao: 'Cadastro único dos entes: dados, situação no consórcio, lei ratificadora, gestores, contatos e timbre. Base de todos os módulos.',
      cor: '#0a8a62',
      inicio: '#entes',
      rotas: ['entes', 'ente', 'orgaos'],
    },
    {
      id: 'consorcio',
      nome: 'Consórcio',
      descricao: 'O próprio consórcio: dados, brasão e timbre, pessoas, normas e modelos de documentos, documentos constitutivos, atas e orçamento, e a integração com o site.',
      cor: '#b26d06',
      inicio: '#consorcio',
      rotas: ['consorcio', 'timbre', 'pessoas', 'normas', 'documentos', 'site', 'integracao', 'cimop'],
    },
    {
      id: 'adesoes',
      nome: 'Controle de Adesões',
      descricao: 'Adesões às Atas de Registro de Preços: limites de 50% e do dobro, ofícios em Word, formulário dos municípios e PNCP.',
      cor: '#1d5fd1',
      inicio: '#inicio',
      // rotas (primeira parte do endereço, antes do "-") que pertencem ao módulo
      rotas: ['inicio', 'solicitacoes', 'solicitacao', 'novo', 'pedidos', 'pedido', 'relatorio', 'atas', 'ata', 'item', 'pncp', 'importar', 'configuracoes'],
    },
    {
      id: 'irp',
      nome: 'Intenção de Registro de Preços',
      descricao: 'IRP: edital em Word, formulário online com PDF no timbre do ente, divulgação por e-mail e WhatsApp, análise, demandas do ETP, consolidação e participantes da Ata.',
      cor: '#6a4fc9',
      inicio: '#irps',
      rotas: ['irps', 'irp'],
    },
    {
      id: 'etp',
      nome: 'Pesquisa de preços e quantitativos (ETP)',
      descricao: 'Histórico das contratações de cada ente no PNCP (licitações, dispensas, itens, preços e contratos), com os itens agrupados em séries para justificar quantitativos e pesquisar preços.',
      cor: '#0a8a62',
      inicio: '#etp',
      rotas: ['etp', 'etpente', 'etpcompra', 'etpbusca', 'etpserie'],
    },
    {
      id: 'sistema',
      nome: 'Sistema',
      descricao: 'Quem entra no sistema e quais módulos cada pessoa vê, com o perfil em cada um. Para o Suporte SOFT+, também o cadastro dos consórcios.',
      cor: '#4f6378',
      inicio: '#usuarios',
      rotas: ['usuarios', 'consorcios'],
      soAdminSistema: true,
    },
  ];

  const NOME_PERFIL = { administrador: 'Administrador', operador: 'Operador', consulta: 'Consulta' };
  const AJUDA_PERFIL = {
    administrador: 'tudo no módulo, inclusive as configurações',
    operador: 'lança, cadastra e edita',
    consulta: 'só vê e emite relatórios',
  };

  window.MODULOS = {
    lista: LISTA,
    porId: (id) => LISTA.find((m) => m.id === id) || null,
    daRota: (rota) => LISTA.find((m) => m.rotas.includes(rota)) || null,
    icone,
    NOME_PERFIL,
    AJUDA_PERFIL,
  };
})();
