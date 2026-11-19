/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio
   Módulo Pesquisa de preços e quantitativos (ETP) – fases 1 e 2
   Histórico das contratações de cada ente no PNCP (compras, itens, preços homologados e contratos),
   lido automaticamente pela função consorcio-etp-pncp, e agrupamento dos itens em séries.
   Telas: #etp (entes e histórico), #etpente-<id>, #etpcompra-<controle>, #etpbusca, #etpserie-<chave>.
   ===================================================================== */
(function () {
  'use strict';
  const N = window.NUCLEO;
  const { el, rc, estado, D, toast, campo, txt, sel, abrirDialogo, confirmar, tabela, cabecalho, ocupado, baixar, TELAS } = N;
  const E = (estado.etp = estado.etp || { busca: { texto: '', anoIni: '', anoFim: '', entes: null }, ente: {} });
  const pode = () => ['administrador', 'operador'].includes(N.perfilEm('etp'));

  // ---------------------------------------------------------------- utilidades
  const n0 = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const rs = (v) => (v == null || v === '' ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const cnpjF = (c) => String(c || '').replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  const soNum = (c) => String(c || '').replace(/\D/g, '');
  const SIT = { na_fila: ['Na fila', 'etiqueta-pendente'], carregando: ['Carregando', 'etiqueta-editar'], em_dia: ['Em dia', 'etiqueta-ativo'], erro: ['Erro', 'etiqueta-inativo'], pausado: ['Pausado', 'etiqueta-rascunho'] };
  const etqSit = (s) => el('span', { class: 'etiqueta ' + (SIT[s] || SIT.na_fila)[1] }, (SIT[s] || SIT.na_fila)[0]);
  const ROTULOS = ['Prefeitura', 'Fundo Municipal de Saúde', 'Fundo Municipal de Educação', 'Fundo Municipal de Assistência Social', 'Câmara Municipal', 'Autarquia', 'Outro'];
  const munDoNome = (o) => o.municipio || String(o.nome || '').replace(/^munic[ií]pio de\s+/i, '').replace(/\/[A-Z]{2}$/, '');
  const normal = (s) => N.normalizar(String(s || ''));
  const cnpjsDoEnte = (o) => (o.cnpjs || []).map((c) => c.cnpj);
  const ente = (id) => ((E.painel && E.painel.entes) || []).find((o) => o.id === id);
  const voltar = (href, txtLink) => el('p', { class: 'mb-1' }, el('a', { class: 'link', href }, '← ' + txtLink));
  const carregando = (c, t) => rc(c, el('p', { class: 'vazio' }, t || 'Carregando…'));

  async function painel(forcar) {
    if (!E.painel || forcar) E.painel = await D.etpPainel();
    return E.painel;
  }
  // O PNCP chama o CNPJ por outro nome? (cadastro com CNPJ trocado)
  function nomeConfere(o, c) {
    if (!c.nome_pncp) return true;
    const m = normal(munDoNome(o)).replace(/[^a-z0-9]/g, '');
    return !m || normal(c.nome_pncp).replace(/[^a-z0-9]/g, '').includes(m);
  }

  // ---------------------------------------------------------------- diálogos de CNPJ
  function dialogoCnpj(o, depois) {
    const f = { cnpj: txt('', { maxlength: 18, inputmode: 'numeric', placeholder: '00.000.000/0000-00' }), rot: sel(ROTULOS.map((r) => [r, r]), 'Prefeitura') };
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir');
    const d = abrirDialogo('Incluir CNPJ – ' + o.nome, el('div', null,
      el('p', null, 'Cada CNPJ que publica no PNCP entra no histórico do ente: prefeitura, fundos municipais, câmara, autarquias.'),
      el('div', { class: 'grade-campos' }, campo('etp-cnpj', 'CNPJ', f.cnpj, null, true), campo('etp-rot', 'O que é', f.rot))),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b]);
    b.addEventListener('click', async () => {
      const c = soNum(f.cnpj.value);
      if (!N.marcarErro(f.cnpj, c.length === 14 ? '' : 'CNPJ com 14 números.')) return;
      ocupado(b, 'Incluindo…');
      try { await D.etpIncluirCnpj(o.id, c, f.rot.value); d.close(); toast('CNPJ incluído. A leitura do PNCP começa na próxima rodada (até 5 minutos).'); await painel(true); depois && depois(); }
      catch (e) { toast(e.message, true); ocupado(b); }
    });
  }
  function dialogoDescobrir(o, depois) {
    const corpo = el('div', null, el('p', { class: 'vazio' }, 'Procurando no PNCP quem publicou compras em ' + munDoNome(o) + '/' + (o.uf || '') + ' nos últimos 6 meses…'));
    const b = el('button', { type: 'button', class: 'btn btn-primario', disabled: true }, 'Incluir os marcados');
    const d = abrirDialogo('Descobrir CNPJs no PNCP – ' + o.nome, corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Fechar'), b], true);
    const ja = new Set(cnpjsDoEnte(o));
    let linhas = [];
    D.etpFuncao({ acao: 'descobrir', municipio: munDoNome(o), uf: o.uf }).then((r) => {
      if (!r.cnpjs.length) { rc(corpo, el('p', { class: 'msg msg-falta' }, 'O PNCP não mostrou compras de órgãos municipais de ' + r.municipio + ' nos últimos 6 meses. Inclua o CNPJ à mão.')); return; }
      linhas = r.cnpjs.map((x) => {
        const guess = /camara/i.test(normal(x.nome)) ? 'Câmara Municipal' : /saude/.test(normal(x.nome)) ? 'Fundo Municipal de Saúde' : /educa/.test(normal(x.nome)) ? 'Fundo Municipal de Educação'
          : /assist/.test(normal(x.nome)) ? 'Fundo Municipal de Assistência Social' : /^munic|prefeitura/.test(normal(x.nome)) ? 'Prefeitura' : 'Outro';
        return { x, ck: el('input', { type: 'checkbox', checked: !ja.has(x.cnpj) && !/camara/i.test(normal(x.nome)), disabled: ja.has(x.cnpj) }), rot: sel(ROTULOS.map((q) => [q, q]), guess) };
      });
      b.disabled = false;
      rc(corpo, el('p', null, 'Órgãos municipais de ', el('strong', null, r.municipio), ' que publicaram compras no PNCP nos últimos 6 meses. Marque os que entram no histórico do ente.'),
        tabela(['', 'CNPJ', 'Nome no PNCP', 'Compras (6 meses)', 'O que é'], linhas.map((l) => el('tr', null, el('td', null, l.ck), el('td', null, cnpjF(l.x.cnpj)),
          el('td', null, l.x.nome, l.x.unidades.length ? el('div', { class: 'ajuda' }, l.x.unidades.join(' · ')) : null, ja.has(l.x.cnpj) ? el('div', null, el('span', { class: 'etiqueta etiqueta-ativo' }, 'Já incluído')) : null),
          el('td', { class: 'num' }, l.x.compras), el('td', null, l.rot)))));
    }).catch((e) => rc(corpo, el('p', { class: 'msg msg-erro' }, e.message)));
    b.addEventListener('click', async () => {
      const marcados = linhas.filter((l) => l.ck.checked && !l.ck.disabled);
      if (!marcados.length) { toast('Marque ao menos um CNPJ.', true); return; }
      ocupado(b, 'Incluindo…');
      try { for (const l of marcados) await D.etpIncluirCnpj(o.id, l.x.cnpj, l.rot.value, l.x.nome); d.close(); toast(marcados.length + ' CNPJ(s) incluído(s). A leitura começa na próxima rodada.'); await painel(true); depois && depois(); }
      catch (e) { toast(e.message, true); ocupado(b); }
    });
  }

  // CNPJs e unidades do TCE ficam no Cadastro de Consorciados (cadastro único dos entes)
  const temCadastro = () => !!N.perfilEm('consorciados');
  function linkCadastro(o, rotulo) {
    return temCadastro() ? el('a', { class: 'btn btn-texto btn-p', href: '#ente-' + o.id, onclick: () => { estado.abaEnte = 'fontes'; } }, rotulo || 'CNPJs no Cadastro')
      : el('span', { class: 'ajuda' }, 'CNPJs: no Cadastro de Consorciados');
  }
  window.ETP_DIALOGOS = { descobrir: (o, depois) => dialogoDescobrir(Object.assign({}, o, { cnpjs: (o.cnpjs || []).map((c) => (typeof c === 'string' ? { cnpj: c } : c)) }), depois) };

  // ---------------------------------------------------------------- 1. Entes e histórico
  TELAS.etp = async (c) => {
    carregando(c, 'Carregando os entes…');
    let p, st = null;
    try { p = await painel(true); st = await D.etpStatus(); } catch (e) { rc(c, cabecalho('Pesquisa de preços e quantitativos'), el('p', { class: 'msg ' + (e.semScript ? 'msg-falta' : 'msg-erro') }, e.message)); return; }
    const bAgora = el('button', { type: 'button', class: 'btn btn-claro' }, 'Buscar agora no PNCP');
    bAgora.addEventListener('click', async () => {
      ocupado(bAgora, 'Enviando…');
      try { const r = await D.etpBuscarAgora(); toast(r && r.ocupado ? 'A leitura já está em andamento.' : 'Consultas enviadas ao PNCP. As respostas entram em até 1 minuto.'); setTimeout(() => TELAS.etp(c), 1500); }
      catch (e) { toast(e.message, true); ocupado(bAgora); }
    });
    const busca = el('input', { type: 'search', placeholder: 'Buscar ente', 'aria-label': 'Buscar ente', value: E.filtroEntes || '' });
    const soCom = el('input', { type: 'checkbox', checked: !!E.soComCnpj });
    const caixa = el('div');
    const desenhar = () => {
      const t = normal(busca.value);
      const lista = p.entes.filter((o) => (!t || normal(o.nome).includes(t)) && (!soCom.checked || o.cnpjs.length));
      rc(caixa, lista.length ? tabela(['Ente', 'CNPJs no histórico', 'Compras', 'Itens', 'Contratos', ''], lista.map((o) => {
        const tot = (k) => o.cnpjs.reduce((s, x) => s + Number(x[k] || 0), 0);
        return el('tr', null,
          el('td', null, el('a', { class: 'link-forte', href: '#etpente-' + o.id }, o.nome), o.uf ? el('div', { class: 'ajuda' }, [o.municipio, o.uf].filter(Boolean).join('/')) : null),
          el('td', null, o.cnpjs.length ? o.cnpjs.map((x) => el('div', { class: 'linha-cnpj' }, el('span', { class: 'mono' }, cnpjF(x.cnpj)), ' ', el('span', { class: 'ajuda' }, x.rotulo), ' ', etqSit(x.situacao),
              !nomeConfere(o, x) ? el('div', { class: 'msg-curta msg-falta' }, 'No PNCP este CNPJ é de ' + x.nome_pncp + '. Confira o CNPJ no Cadastro.') : null))
            : el('span', { class: 'etiqueta etiqueta-pendente' }, 'Sem CNPJ')),
          el('td', { class: 'num' }, n0(tot('compras'))), el('td', { class: 'num' }, n0(tot('itens'))), el('td', { class: 'num' }, n0(tot('contratos'))),
          el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#etpente-' + o.id }, 'Abrir'),
            linkCadastro(o)));
      })) : el('p', { class: 'vazio' }, 'Nenhum ente com esses filtros.'));
    };
    const desenharTudo = () => { p = E.painel; desenhar(); };
    busca.addEventListener('input', () => { E.filtroEntes = busca.value; desenhar(); });
    soCom.addEventListener('change', () => { E.soComCnpj = soCom.checked; desenhar(); });
    const semCnpj = p.entes.filter((o) => !o.cnpjs.length).length;
    const comErro = p.entes.filter((o) => o.cnpjs.some((x) => !nomeConfere(o, x))).length;
    rc(c, cabecalho('Pesquisa de preços e quantitativos', 'Histórico das contratações de cada ente no PNCP, para justificar quantitativos e pesquisar preços no ETP.',
        el('a', { class: 'btn btn-primario', href: '#etpbusca' }, 'Pesquisar itens'), pode() ? bAgora : null),
      el('p', { class: 'msg msg-info' }, 'O sistema lê no PNCP, sozinho, a cada minuto, as licitações, dispensas e inexigibilidades de cada CNPJ (desde 2023, do ano mais recente para o mais antigo), com itens, quantidades, preços homologados e contratos. A primeira carga de um ente pode levar algumas horas. Fila: ',
        el('strong', null, p.fila.pendentes ? p.fila.pendentes + ' de ' + p.fila.total + ' ano(s) por ler' : 'tudo lido'), '.',
        st && st.em_voo ? ' Consultas ao PNCP em andamento: ' + st.em_voo + '.' : '', st && st.ultima_execucao ? ' Última rodada: ' + new Date(st.ultima_execucao).toLocaleString('pt-BR') + '.' : ''),
      semCnpj ? el('p', { class: 'msg msg-falta' }, semCnpj + ' ente(s) sem CNPJ. Os CNPJs ficam no Cadastro de Consorciados (ficha do ente, aba "CNPJs e fontes de dados"); lá dá para conferir com o TCE-RN e descobrir os fundos no PNCP.') : null,
      comErro ? el('p', { class: 'msg msg-erro' }, comErro + ' ente(s) com CNPJ que o PNCP mostra com outro nome. Confira o CNPJ no Cadastro de Consorciados.') : null,
      el('div', { class: 'filtros-linha' }, campo('etp-b', 'Buscar', busca), el('label', { class: 'check-linha' }, soCom, ' Só os que têm CNPJ')),
      caixa);
    desenhar();
  };

  // ---------------------------------------------------------------- 2. Histórico de um ente
  TELAS.etpente = async (c, id) => {
    carregando(c);
    try { await painel(); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    const o = ente(id);
    if (!o) { rc(c, voltar('#etp', 'Entes'), el('p', { class: 'msg msg-erro' }, 'Ente não encontrado.')); return; }
    const f = (E.ente[id] = E.ente[id] || { cnpjs: cnpjsDoEnte(o), ano: '', modalidade: '', texto: '', aba: 'compras' });
    f.cnpjs = f.cnpjs.filter((x) => cnpjsDoEnte(o).includes(x)); if (!f.cnpjs.length) f.cnpjs = cnpjsDoEnte(o);
    const topo = [voltar('#etp', 'Entes'), cabecalho(o.nome, [o.municipio, o.uf].filter(Boolean).join('/') || 'Histórico no PNCP',
      el('a', { class: 'btn btn-primario', href: '#etpbusca', onclick: () => { E.busca.entes = [o.id]; } }, 'Pesquisar itens deste ente'),
      linkCadastro(o, 'Editar CNPJs no Cadastro'))];
    if (!o.cnpjs.length) { rc(c, ...topo, el('p', { class: 'msg msg-falta' }, 'Este ente não tem CNPJ. Informe no Cadastro de Consorciados (ficha do ente, aba "CNPJs e fontes de dados").')); return; }
    // CNPJs: situação e escolha
    const chips = el('div', { class: 'cnpjs-ente' }, o.cnpjs.map((x) => {
      const ck = el('input', { type: 'checkbox', checked: f.cnpjs.includes(x.cnpj) });
      ck.addEventListener('change', () => { f.cnpjs = o.cnpjs.filter((y) => (y.cnpj === x.cnpj ? ck.checked : f.cnpjs.includes(y.cnpj))).map((y) => y.cnpj); f.limite = 50; desenharCompras(); if (corpoK.childNodes.length) desenharContratos(); });
      const anos = (x.anos || []).map((a) => el('span', { class: 'etiqueta ' + (a.concluido ? 'etiqueta-ativo' : 'etiqueta-pendente'), title: a.concluido ? 'Ano lido' : 'Lendo: ' + a.lidas + ' compra(s) até agora' }, a.ano + (a.concluido ? '' : '…')));
      return el('div', { class: 'cartao-cnpj' }, el('label', { class: 'check-linha' }, ck, el('strong', null, x.rotulo), ' ', el('span', { class: 'mono' }, cnpjF(x.cnpj))),
        el('div', { class: 'ajuda' }, x.nome_pncp || 'Ainda não lido no PNCP', ' · ', n0(x.compras), ' compra(s) · ', n0(x.itens), ' item(ns)'),
        !nomeConfere(o, x) ? el('div', { class: 'msg-curta msg-falta' }, 'No PNCP este CNPJ é de ' + x.nome_pncp + '. Confira o CNPJ no Cadastro.') : null,
        el('div', { class: 'etiquetas-linha' }, etqSit(x.situacao), ...anos),
        null);
    }));
    const corpo = el('div'), corpoK = el('div');
    const caixaAbas = N.abas([['compras', 'Compras e itens', () => corpo], ['contratos', 'Contratos', () => { desenharContratos(); return corpoK; }]], f.aba);
    caixaAbas.addEventListener('click', (ev) => { const t = ev.target.closest('[role="tab"]'); if (t) f.aba = t.id.replace('aba-', ''); });
    rc(c, ...topo, chips, caixaAbas);
    async function desenharCompras() {
      if (!f.cnpjs.length) { rc(corpo, el('p', { class: 'vazio' }, 'Marque ao menos um CNPJ.')); return; }
      carregando(corpo);
      let r;
      try { r = await D.etpCompras({ cnpjs: f.cnpjs, ano: f.ano || null, modalidade: f.modalidade || null, texto: f.texto, offset: 0, limite: f.limite || 50 }); }
      catch (e) { rc(corpo, el('p', { class: 'msg msg-erro' }, e.message)); return; }
      const fAno = sel([['', 'Todos os anos'], ...r.anos.map((a) => [String(a), String(a)])], String(f.ano || ''));
      const fMod = sel([['', 'Todas as modalidades'], ...r.modalidades.map((m) => [String(m.id), m.nome + ' (' + m.n + ')'])], String(f.modalidade || ''));
      const fTxt = el('input', { type: 'search', value: f.texto || '', placeholder: 'Objeto, número, processo ou item' });
      fAno.addEventListener('change', () => { f.ano = fAno.value; f.limite = 50; desenharCompras(); });
      fMod.addEventListener('change', () => { f.modalidade = fMod.value; f.limite = 50; desenharCompras(); });
      fTxt.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { f.texto = fTxt.value; f.limite = 50; desenharCompras(); } });
      const bExp = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Exportar Excel');
      bExp.addEventListener('click', () => exportarCompras(f, o, bExp));
      rc(corpo,
        el('div', { class: 'filtros-linha' }, campo('etp-ano', 'Ano', fAno), campo('etp-mod', 'Modalidade', fMod), campo('etp-txt', 'Buscar (Enter)', fTxt)),
        el('div', { class: 'barra-lista' }, el('span', null, el('strong', null, n0(r.total)), ' compra(s)', r.valor_homologado ? ' · ' + rs(r.valor_homologado) + ' homologados' : ''), bExp),
        r.linhas.length ? tabela(['Data', 'Compra', 'Modalidade', 'Objeto', 'Itens', 'Valor homologado'], r.linhas.map((x) => el('tr', null,
          el('td', null, dataBR(x.data_abertura || x.data_publicacao)),
          el('td', null, el('a', { class: 'link-forte', href: '#etpcompra-' + encodeURIComponent(x.numero_controle) }, x.numero_compra || x.sequencial + '/' + x.ano), x.processo ? el('div', { class: 'ajuda' }, 'Proc. ' + x.processo) : null),
          el('td', null, x.modalidade || '—', x.srp ? el('div', null, el('span', { class: 'etiqueta' }, 'Registro de preços')) : null),
          el('td', { class: 'texto-longo' }, x.objeto || '—'),
          el('td', { class: 'num' }, n0(x.itens_qtd), x.resultados_pendentes ? el('div', { class: 'ajuda' }, x.resultados_pendentes + ' sem resultado') : null),
          el('td', { class: 'num' }, rs(x.valor_homologado))))) : el('p', { class: 'vazio' }, 'Nenhuma compra lida com esses filtros. Se o ente acabou de entrar, aguarde a leitura do PNCP.'),
        r.total > r.linhas.length ? el('p', { class: 'centro' }, el('button', { type: 'button', class: 'btn btn-claro', onclick: () => { f.limite = (f.limite || 50) + 100; desenharCompras(); } }, 'Mostrar mais (' + (r.total - r.linhas.length) + ' restantes)')) : null);
    }
    async function desenharContratos() {
      if (!f.cnpjs.length) { rc(corpoK, el('p', { class: 'vazio' }, 'Marque ao menos um CNPJ.')); return; }
      carregando(corpoK);
      let l;
      try { l = await D.etpContratos(f.cnpjs); } catch (e) { rc(corpoK, el('p', { class: 'msg msg-erro' }, e.message)); return; }
      rc(corpoK, el('p', { class: 'ajuda' }, 'Contratos e notas de empenho que o ente publicou no PNCP. Muitos municípios ainda não publicam os contratos.'),
        l.length ? tabela(['Assinatura', 'Número', 'Tipo', 'Contratado', 'Objeto', 'Vigência', 'Valor global'], l.map((k) => el('tr', null,
          el('td', null, dataBR(k.data_assinatura)), el('td', null, k.numero || '—', k.compra_controle ? el('div', null, el('a', { class: 'link', href: '#etpcompra-' + encodeURIComponent(k.compra_controle) }, 'ver compra')) : null),
          el('td', null, k.tipo || '—'), el('td', null, k.fornecedor || '—', k.ni_fornecedor ? el('div', { class: 'ajuda mono' }, cnpjF(k.ni_fornecedor)) : null),
          el('td', { class: 'texto-longo' }, k.objeto || '—'), el('td', null, dataBR(k.vigencia_inicio) + ' a ' + dataBR(k.vigencia_fim)), el('td', { class: 'num' }, rs(k.valor_global)))))
          : el('p', { class: 'vazio' }, 'Nenhum contrato publicado no PNCP pelos CNPJs marcados (ou ainda não lidos).'));
    }
    desenharCompras();
  };

  async function exportarCompras(f, o, btn) {
    ocupado(btn, 'Preparando…');
    try {
      const linhas = [];
      for (let off = 0; off < 5000; off += 200) {
        const r = await D.etpCompras({ cnpjs: f.cnpjs, ano: f.ano || null, modalidade: f.modalidade || null, texto: f.texto, offset: off, limite: 200 });
        linhas.push(...r.linhas); if (linhas.length >= r.total || !r.linhas.length) break;
      }
      const X = window.XLSX;
      const ws = X.utils.json_to_sheet(linhas.map((x) => ({ 'CNPJ': cnpjF(x.cnpj), 'Data': dataBR(x.data_abertura || x.data_publicacao), 'Compra': x.numero_compra, 'Processo': x.processo,
        'Modalidade': x.modalidade, 'Registro de preços': x.srp ? 'Sim' : 'Não', 'Objeto': x.objeto, 'Situação': x.situacao, 'Itens': x.itens_qtd,
        'Valor estimado': x.valor_estimado == null ? null : Number(x.valor_estimado), 'Valor homologado': x.valor_homologado == null ? null : Number(x.valor_homologado),
        'Link PNCP': `https://pncp.gov.br/app/editais/${x.cnpj}/${x.ano}/${x.sequencial}` })));
      ws['!cols'] = [{ wch: 20 }, { wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 10 }, { wch: 70 }, { wch: 18 }, { wch: 7 }, { wch: 15 }, { wch: 15 }, { wch: 50 }];
      const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Compras');
      await baixar('Histórico PNCP - ' + o.nome.replace(/[\\/:*?"<>|]/g, '-') + '.xlsx', new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    } catch (e) { toast(e.message, true); } finally { ocupado(btn); }
  }

  // ---------------------------------------------------------------- 3. Uma compra
  TELAS.etpcompra = async (c, id) => {
    const controle = decodeURIComponent(id || '');
    carregando(c);
    let x;
    try { x = await D.etpCompra(controle); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    if (!x) { rc(c, voltar('javascript:history.back()', 'Voltar'), el('p', { class: 'msg msg-erro' }, 'Compra não encontrada.')); return; }
    rc(c, el('p', { class: 'mb-1' }, el('a', { class: 'link', href: '#', onclick: (ev) => { ev.preventDefault(); history.back(); } }, '← Voltar')),
      cabecalho((x.modalidade || 'Compra') + ' ' + (x.numero_compra || x.sequencial + '/' + x.ano), x.orgao || cnpjF(x.cnpj),
        el('a', { class: 'btn btn-claro', href: x.link, target: '_blank', rel: 'noopener' }, 'Abrir no PNCP ↗')),
      el('dl', { class: 'dados' },
        el('dt', null, 'Objeto'), el('dd', null, x.objeto || '—'),
        el('dt', null, 'Processo'), el('dd', null, x.processo || '—'),
        el('dt', null, 'Data'), el('dd', null, dataBR(x.data_abertura || x.data_publicacao)),
        el('dt', null, 'Situação'), el('dd', null, x.situacao || '—', x.srp ? ' · Registro de preços' : ''),
        el('dt', null, 'Amparo legal'), el('dd', null, x.amparo || '—'),
        el('dt', null, 'Valor estimado / homologado'), el('dd', null, rs(x.valor_estimado) + ' / ' + rs(x.valor_homologado))),
      el('h2', null, 'Itens'),
      x.itens.length ? tabela(['Item', 'Descrição', 'Unidade', 'Qtd. licitada', 'Preço estimado', 'Resultado'], x.itens.map((i) => el('tr', null,
        el('td', { class: 'num' }, i.numero), el('td', { class: 'texto-longo' }, i.descricao, el('div', null, el('a', { class: 'link ajuda', href: '#etpserie-' + encodeURIComponent(i.chave), onclick: () => { E.serieCnpjs = [x.cnpj]; } }, 'ver série do item'))),
        el('td', null, i.unidade || '—'), el('td', { class: 'num' }, n0(i.quantidade)), el('td', { class: 'num' }, rs(i.valor_unitario_estimado)),
        el('td', null, i.resultados.length ? i.resultados.map((r) => el('div', { class: r.cancelado ? 'riscado' : '' }, el('strong', null, rs(r.valor_unitario)), ' × ', n0(r.quantidade), el('div', { class: 'ajuda' }, r.fornecedor || ''))) : el('span', { class: 'ajuda' }, i.situacao || 'Sem resultado')))))
        : el('p', { class: 'vazio' }, 'O PNCP não devolveu itens desta compra.'),
      x.contratos.length ? el('div', null, el('h2', null, 'Contratos'), tabela(['Assinatura', 'Número', 'Contratado', 'Valor global'], x.contratos.map((k) => el('tr', null,
        el('td', null, dataBR(k.data_assinatura)), el('td', null, k.numero || '—'), el('td', null, k.fornecedor || '—'), el('td', { class: 'num' }, rs(k.valor_global)))))) : null);
  };

  // ---------------------------------------------------------------- 4. Pesquisar itens (séries)
  const cnpjsDosEntes = (ids) => [...new Set(((E.painel && E.painel.entes) || []).filter((o) => !ids || ids.includes(o.id)).flatMap(cnpjsDoEnte))];
  TELAS.etpbusca = async (c) => {
    carregando(c);
    try { await painel(); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    const b = E.busca;
    const comCnpj = E.painel.entes.filter((o) => o.cnpjs.length);
    if (!b.entes) b.entes = comCnpj.map((o) => o.id);
    const fTxt = el('input', { type: 'search', value: b.texto, placeholder: 'Ex.: cadeira escolar, gasolina, pneu 175/70' });
    const anoAtual = new Date().getFullYear();
    const anos = [['', '—'], ...Array.from({ length: anoAtual - 2020 }, (_, k) => [String(anoAtual - k), String(anoAtual - k)])];
    const fIni = sel(anos, b.anoIni), fFim = sel(anos, b.anoFim);
    const lista = el('div', { class: 'lista-entes-busca' }, comCnpj.map((o) => {
      const ck = el('input', { type: 'checkbox', checked: b.entes.includes(o.id) });
      ck.addEventListener('change', () => { b.entes = ck.checked ? [...new Set([...b.entes, o.id])] : b.entes.filter((x) => x !== o.id); resumoEntes(); });
      return el('label', { class: 'check-linha' }, ck, ' ', o.nome);
    }));
    const resumo = el('summary', null);
    const resumoEntes = () => { resumo.textContent = 'Entes na pesquisa: ' + b.entes.length + ' de ' + comCnpj.length; };
    resumoEntes();
    const bBuscar = el('button', { type: 'submit', class: 'btn btn-primario' }, 'Pesquisar');
    const res = el('div');
    const form = el('form', { class: 'cartao form-busca-etp' },
      el('div', { class: 'filtros-linha' }, campo('etp-q', 'Item ou objeto', fTxt, 'Todas as palavras precisam aparecer na descrição.', true), campo('etp-ai', 'De', fIni), campo('etp-af', 'Até', fFim), el('div', { class: 'campo' }, bBuscar)),
      el('details', { class: 'detalhe-entes' }, resumo, el('div', { class: 'botoes-linha mb-1' },
        el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { b.entes = comCnpj.map((o) => o.id); lista.querySelectorAll('input').forEach((i) => { i.checked = true; }); resumoEntes(); } }, 'Marcar todos'),
        el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { b.entes = []; lista.querySelectorAll('input').forEach((i) => { i.checked = false; }); resumoEntes(); } }, 'Desmarcar todos')), lista));
    form.addEventListener('submit', (ev) => { ev.preventDefault(); b.texto = fTxt.value.trim(); b.anoIni = fIni.value; b.anoFim = fFim.value; b.res = null; pesquisar(); });
    // pesquisas ampliadas no PNCP (outros órgãos)
    const boxPesq = el('details', { class: 'detalhe-entes' }, el('summary', null, 'Incluir pesquisas ampliadas no PNCP'), el('p', { class: 'ajuda' }, 'Carregando…'));
    form.appendChild(boxPesq);
    D.etpPesquisas && D.etpPesquisas().then((ps) => {
      ps = ps.filter((p) => p.cnpjs.length);
      b.pesquisas = (b.pesquisas || []).filter((id) => ps.some((p) => p.id === id));
      boxPesq.querySelector('summary').textContent = 'Incluir pesquisas ampliadas no PNCP (' + b.pesquisas.length + ' de ' + ps.length + ')';
      if (b.pesquisas.length) boxPesq.open = true;
      rc(boxPesq, boxPesq.querySelector('summary'), ps.length ? el('div', { class: 'lista-entes-busca' }, ps.map((p) => {
        const ck = el('input', { type: 'checkbox', checked: b.pesquisas.includes(p.id) });
        ck.addEventListener('change', () => { b.pesquisas = ck.checked ? [...new Set([...b.pesquisas, p.id])] : b.pesquisas.filter((x) => x !== p.id); boxPesq.querySelector('summary').textContent = 'Incluir pesquisas ampliadas no PNCP (' + b.pesquisas.length + ' de ' + ps.length + ')'; });
        return el('label', { class: 'check-linha' }, ck, ' ' + p.termo + ' (' + p.abrangencia + ', ' + p.lidas + ' licitações)');
      })) : el('p', { class: 'ajuda' }, 'Nenhuma ainda. ', el('a', { class: 'link', href: '#etpampliada' }, 'Fazer uma pesquisa ampliada')));
    }).catch(() => boxPesq.remove());
    rc(c, voltar('#etp', 'Entes e histórico'), cabecalho('Pesquisar itens', 'Itens parecidos de compras diferentes aparecem juntos numa série, com as quantidades por ano e os preços homologados.'),
      comCnpj.length ? null : el('p', { class: 'msg msg-falta' }, 'Nenhum ente tem CNPJ no histórico ainda. Inclua os CNPJs na tela de entes ou use uma pesquisa ampliada.'), form, res);
    async function pesquisar() {
      if (!b.texto) { rc(res); return; }
      if (!b.entes.length && !(b.pesquisas || []).length) { rc(res, el('p', { class: 'msg msg-falta' }, 'Marque ao menos um ente ou uma pesquisa ampliada.')); return; }
      ocupado(bBuscar, 'Pesquisando…'); carregando(res, 'Pesquisando no histórico…');
      let extra = [];
      if ((b.pesquisas || []).length) { try { extra = (await D.etpPesquisas()).filter((p) => b.pesquisas.includes(p.id)).flatMap((p) => p.cnpjs); } catch (e) { } }
      try { b.res = await D.etpBuscar({ texto: b.texto, cnpjs: [...new Set([...cnpjsDosEntes(b.entes), ...extra])], anoIni: b.anoIni ? Number(b.anoIni) : null, anoFim: b.anoFim ? Number(b.anoFim) : null }); desenharRes(); }
      catch (e) { rc(res, el('p', { class: 'msg msg-erro' }, e.message)); } finally { ocupado(bBuscar); }
    }
    function desenharRes() {
      const series = (b.res && b.res.series) || [];
      if (!series.length) { rc(res, el('p', { class: 'vazio' }, 'Nenhum item encontrado. Tente menos palavras ou outro termo (ex.: "cadeira" em vez de "cadeira escolar empilhável").')); return; }
      const marcadas = new Set();
      const bJuntar = el('button', { type: 'button', class: 'btn btn-claro btn-p', disabled: true }, 'Juntar as marcadas');
      bJuntar.addEventListener('click', () => juntar(series.filter((s) => marcadas.has(s.chave))));
      const bExp = el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => exportarSeries(series) }, 'Exportar Excel');
      const anosTodos = [...new Set(series.flatMap((s) => Object.keys(s.anos || {})))].sort();
      rc(res, el('div', { class: 'barra-lista' }, el('span', null, el('strong', null, series.length), ' série(s)', b.res.total > series.length ? ' (as ' + series.length + ' com mais compras)' : ''), el('div', { class: 'botoes-linha' }, pode() ? bJuntar : null, bExp)),
        el('p', { class: 'ajuda' }, 'Quantidade por ano: a homologada quando há resultado; se não, a licitada. Preços: valores unitários homologados, sem correção (a correção pelo IPCA e o relatório para o ETP vêm na próxima fase).'),
        tabela(['', 'Série', 'Unid.', 'Compras', 'Entes', ...anosTodos.map((a) => 'Qtd. ' + a), 'Preço mediano', 'Menor – maior', ''], series.map((s) => {
          const ck = el('input', { type: 'checkbox', 'aria-label': 'Marcar série' });
          ck.addEventListener('change', () => { ck.checked ? marcadas.add(s.chave) : marcadas.delete(s.chave); bJuntar.disabled = marcadas.size < 2; });
          return el('tr', null, el('td', null, pode() ? ck : null),
            el('td', { class: 'texto-longo' }, el('a', { class: 'link-forte', href: '#etpserie-' + encodeURIComponent(s.chave), onclick: () => { E.serieCnpjs = cnpjsDosEntes(b.entes); } }, s.nome || s.exemplo.slice(0, 140) + (s.exemplo.length > 140 ? '…' : '')),
              el('div', { class: 'ajuda' }, s.itens + ' item(ns)', s.chave.startsWith('cat:') ? ' · catálogo ' + s.chave.slice(4) : '', s.ultima_data ? ' · última em ' + dataBR(s.ultima_data) : '')),
            el('td', null, s.unidade || '—'), el('td', { class: 'num' }, s.compras), el('td', { class: 'num' }, s.orgaos),
            ...anosTodos.map((a) => el('td', { class: 'num' }, s.anos && s.anos[a] != null ? n0(s.anos[a]) : '—')),
            el('td', { class: 'num' }, s.precos ? rs(s.preco_mediana) : s.estimado_mediana ? el('span', { title: 'Só há preço estimado' }, rs(s.estimado_mediana) + '*') : '—', s.precos ? el('div', { class: 'ajuda' }, s.precos + ' preço(s)') : null),
            el('td', { class: 'num' }, s.precos ? rs(s.preco_min) + ' – ' + rs(s.preco_max) : '—'),
            el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#etpserie-' + encodeURIComponent(s.chave), onclick: () => { E.serieCnpjs = cnpjsDosEntes(b.entes); } }, 'Ver itens')));
        })),
        el('p', { class: 'ajuda' }, '* Sem preço homologado: mostra a mediana do preço estimado nas licitações.'));
    }
    async function juntar(lista) {
      const nome = txt(lista[0].nome || lista[0].exemplo.slice(0, 80), { maxlength: 120 });
      const b2 = el('button', { type: 'button', class: 'btn btn-primario' }, 'Juntar');
      const d = abrirDialogo('Juntar ' + lista.length + ' séries', el('div', null, el('p', null, 'Os itens destas séries passam a contar como um item só nas quantidades e nos preços (vale para todo o consórcio).'),
        el('ul', null, lista.map((s) => el('li', null, (s.nome || s.exemplo).slice(0, 120) + ' (' + (s.unidade || '—') + ')'))),
        campo('etp-jn', 'Nome da série', nome)), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b2]);
      b2.addEventListener('click', async () => {
        ocupado(b2, 'Juntando…');
        try { await D.etpJuntar(lista.map((s) => s.chave), lista[0].chave, nome.value); d.close(); toast('Séries juntadas.'); pesquisar(); } catch (e) { toast(e.message, true); ocupado(b2); }
      });
    }
    if (b.res) desenharRes(); else if (b.texto) pesquisar();
  };

  function exportarSeries(series) {
    const X = window.XLSX;
    const anos = [...new Set(series.flatMap((s) => Object.keys(s.anos || {})))].sort();
    const ws = X.utils.json_to_sheet(series.map((s) => {
      const r = { 'Série': s.nome || s.exemplo, 'Unidade': s.unidade, 'Itens': s.itens, 'Compras': s.compras, 'Entes': s.orgaos };
      anos.forEach((a) => { r['Qtd. ' + a] = s.anos && s.anos[a] != null ? Number(s.anos[a]) : null; });
      Object.assign(r, { 'Qtd. homologada (total)': s.qtd_homologada == null ? null : Number(s.qtd_homologada), 'Preços homologados': s.precos,
        'Preço mediano': s.preco_mediana == null ? null : Number(s.preco_mediana), 'Menor preço': s.preco_min == null ? null : Number(s.preco_min),
        'Maior preço': s.preco_max == null ? null : Number(s.preco_max), 'Mediana do estimado': s.estimado_mediana == null ? null : Number(s.estimado_mediana), 'Última compra': dataBR(s.ultima_data) });
      return r;
    }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Séries');
    baixar('Pesquisa - ' + (E.busca.texto || 'itens').slice(0, 40).replace(/[\\/:*?"<>|]/g, '-') + '.xlsx', new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }

  // ---------------------------------------------------------------- 5. Itens de uma série (conferir, separar, nomear)
  TELAS.etpserie = async (c, id) => {
    const chave = decodeURIComponent(id || '');
    carregando(c);
    try { await painel(); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    const cnpjs = E.serieCnpjs && E.serieCnpjs.length ? E.serieCnpjs : cnpjsDosEntes(null);
    let itens;
    try { itens = await D.etpItensSerie(chave, cnpjs); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    const marcados = new Set();
    const bSep = el('button', { type: 'button', class: 'btn btn-claro btn-p', disabled: true }, 'Separar os marcados');
    const bVolta = el('button', { type: 'button', class: 'btn btn-texto btn-p', disabled: true }, 'Voltar para a série automática');
    const atualiza = () => { bSep.disabled = !marcados.size; bVolta.disabled = !marcados.size || !chave.startsWith('man:') && !itens.some((i) => marcados.has(i.id) && i.chave_auto !== chave); };
    bSep.addEventListener('click', async () => {
      const nome = txt('', { maxlength: 120, placeholder: 'Ex.: Cadeira escolar infantil' });
      const b2 = el('button', { type: 'button', class: 'btn btn-primario' }, 'Separar');
      const d = abrirDialogo('Separar ' + marcados.size + ' item(ns)', el('div', null, el('p', null, 'Os itens marcados saem desta série e formam uma série nova.'), campo('etp-sn', 'Nome da série nova', nome)),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b2]);
      b2.addEventListener('click', async () => { ocupado(b2, 'Separando…'); try { await D.etpSeparar([...marcados], nome.value); d.close(); toast('Itens separados.'); E.busca.res = null; TELAS.etpserie(c, id); } catch (e) { toast(e.message, true); ocupado(b2); } });
    });
    bVolta.addEventListener('click', async () => { try { await D.etpSeparar([...marcados], null, true); toast('Itens voltaram para a série automática.'); E.busca.res = null; TELAS.etpserie(c, id); } catch (e) { toast(e.message, true); } });
    const nomeAtual = (E.busca.res && (E.busca.res.series || []).find((s) => s.chave === chave) || {}).nome || '';
    const fNome = txt(nomeAtual, { maxlength: 120, placeholder: 'Nome para a série (opcional)' });
    const bNome = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Salvar nome');
    bNome.addEventListener('click', async () => { try { await D.etpNomear(chave, fNome.value); toast('Nome salvo.'); E.busca.res = null; } catch (e) { toast(e.message, true); } });
    const precos = itens.flatMap((i) => i.resultados.filter((r) => !r.cancelado && r.valor_unitario > 0).map((r) => Number(r.valor_unitario))).sort((a, b) => a - b);
    const med = precos.length ? (precos.length % 2 ? precos[(precos.length - 1) / 2] : (precos[precos.length / 2 - 1] + precos[precos.length / 2]) / 2) : null;
    rc(c, el('p', { class: 'mb-1' }, el('a', { class: 'link', href: '#etpbusca' }, '← Pesquisa')),
      cabecalho(nomeAtual || (itens[0] ? itens[0].descricao.slice(0, 90) : 'Série'), itens.length + ' item(ns) em ' + new Set(itens.map((i) => i.numero_controle)).size + ' compra(s)' + (med != null ? ' · preço mediano ' + rs(med) + ' (' + precos.length + ' preço(s))' : '')),
      pode() ? el('div', { class: 'filtros-linha' }, campo('etp-nome', 'Nome da série', fNome), el('div', { class: 'campo' }, bNome)) : null,
      el('div', { class: 'barra-lista' }, el('span', { class: 'ajuda' }, 'Confira se os itens são mesmo o mesmo produto ou serviço. Marque os que não são e separe.'), pode() ? el('div', { class: 'botoes-linha' }, bSep, bVolta) : null),
      itens.length ? tabela(['', 'Data', 'Órgão', 'Compra', 'Descrição', 'Unid.', 'Qtd.', 'Preço homologado'], itens.map((i) => {
        const ck = el('input', { type: 'checkbox', 'aria-label': 'Marcar item' });
        ck.addEventListener('change', () => { ck.checked ? marcados.add(i.id) : marcados.delete(i.id); atualiza(); });
        const r = i.resultados.filter((x) => !x.cancelado);
        return el('tr', null, el('td', null, pode() ? ck : null), el('td', null, dataBR(i.data)), el('td', null, i.orgao || cnpjF(i.cnpj)),
          el('td', null, el('a', { class: 'link', href: '#etpcompra-' + encodeURIComponent(i.numero_controle) }, (i.modalidade || '') + ' ' + (i.numero_compra || '')), el('div', { class: 'ajuda' }, 'item ' + i.numero)),
          el('td', { class: 'texto-longo' }, i.descricao, i.chave_auto !== chave ? el('div', null, el('span', { class: 'etiqueta etiqueta-editar' }, 'Juntado à mão')) : null),
          el('td', null, i.unidade || '—'), el('td', { class: 'num' }, n0(r.length ? r.reduce((s, x) => s + Number(x.quantidade || 0), 0) : i.quantidade)),
          el('td', { class: 'num' }, r.length ? r.map((x) => el('div', null, rs(x.valor_unitario))) : i.estimado ? el('span', { class: 'ajuda' }, rs(i.estimado) + ' (estimado)') : '—'));
      })) : el('p', { class: 'vazio' }, 'Nenhum item nesta série para os entes escolhidos.'));
  };

  N.PENDENCIAS.etp = () => null;
  window.ETP = { recarregar: () => painel(true) };
})();
