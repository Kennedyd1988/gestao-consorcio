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
    consorciados: '<path d="M3 9.2 11 4.6l8 4.6"/><path d="M4.4 9.4h13.2"/><path d="M6.2 9.6v7.2M9.4 9.6v7.2M12.6 9.6v4.4"/><path d="M3.4 19.6h8.2"/><path d="M4.4 17h7.2"/>' +
      '<rect x="14.2" y="12.6" width="6.6" height="8.4" rx="1.2"/><path d="M15.9 15.4h3.2M15.9 17.6h3.2M15.9 19.6h1.8"/>',
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
      descricao: 'Cadastro único dos entes (dados, situação no consórcio, lei ratificadora, gestores, contatos e timbre) e das pessoas do CIMOP. Base de todos os módulos.',
      cor: '#0a8a62',
      inicio: '#entes',
      rotas: ['entes', 'ente', 'pessoas', 'orgaos'],
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
      id: 'sistema',
      nome: 'Usuários e acessos',
      descricao: 'Quem entra no sistema e quais módulos cada pessoa vê, com o perfil em cada um.',
      cor: '#4f6378',
      inicio: '#usuarios',
      rotas: ['usuarios'],
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
