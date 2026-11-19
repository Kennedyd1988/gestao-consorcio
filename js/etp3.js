/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio
   Módulo Pesquisa de preços e quantitativos (ETP) – fase 3
   Telas: #etpconsumo (empenhos do TCE-RN por categoria), #etpampliada (pesquisa ampliada no PNCP),
          #etpestimativas e #etpestimativa-<id> (estimativa de quantitativos, pesquisa de preços,
          quadro consolidado, texto do item 8 do ETP e envio à IRP).
   Fontes: PNCP, TCE-RN (SIAI, Anexo 14), IBGE (população, IPCA e Censo Escolar do INEP).
   ===================================================================== */
(function () {
  'use strict';
  const N = window.NUCLEO;
  const { el, rc, estado, D, toast, campo, txt, area, sel, abrirDialogo, confirmar, tabela, cabecalho, ocupado, baixar, TELAS } = N;
  const E = (estado.etp = estado.etp || { busca: {}, ente: {} });
  const pode = () => ['administrador', 'operador'].includes(N.perfilEm('etp'));
  const n0 = (v, d = 2) => (v == null || v === '' || isNaN(v) ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
  const rs = (v) => (v == null || v === '' || isNaN(v) ? '—' : 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const dataBR = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
  const mesBR = (m) => (m ? m.slice(4, 6) + '/' + m.slice(0, 4) : '—');
  const normal = (s) => N.normalizar(String(s || ''));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const anoAtual = new Date().getFullYear();
  const carregando = (c, t) => rc(c, el('p', { class: 'vazio' }, t || 'Carregando…'));
  const voltar = (href, t) => el('p', { class: 'mb-1' }, el('a', { class: 'link', href }, '← ' + t));
  const xlsx = (nome, abas) => {
    const X = window.XLSX; const wb = X.utils.book_new();
    abas.forEach(([n, linhas, cols]) => { const ws = Array.isArray(linhas[0]) ? X.utils.aoa_to_sheet(linhas) : X.utils.json_to_sheet(linhas); if (cols) ws['!cols'] = cols.map((w) => ({ wch: w })); X.utils.book_append_sheet(wb, ws, n.slice(0, 31)); });
    return baixar(nome.replace(/[\\/:*?"<>|]/g, '-'), new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  };
  const copiar = async (t) => { try { await navigator.clipboard.writeText(t); toast('Texto copiado.'); } catch (e) { toast('Não foi possível copiar: selecione o texto e use Ctrl+C.', true); } };
  const linhas = (t) => String(t || '').split(/\r?\n|;/).map((x) => x.trim()).filter(Boolean);
  const cache = (E.cache3 = E.cache3 || {});
  async function entesDados(forcar) { if (!cache.entes || forcar) cache.entes = await D.etpEntesDados(); return cache.entes; }
  async function categorias(forcar) { if (!cache.cats || forcar) cache.cats = await D.etpCategorias(); return cache.cats; }

  // Escolha de entes (um ou vários) para a estimativa
  function escolherEntes(entes, marcados, titulo) {
    return new Promise((resolve) => {
      const sel0 = new Set(marcados || []);
      const busca = el('input', { type: 'search', placeholder: 'Buscar ente', 'aria-label': 'Buscar ente' });
      const soCons = el('input', { type: 'checkbox' });
      const caixa = el('div', { class: 'lista-escolha' }), cont = el('span', { class: 'ajuda' });
      const visiveis = () => { const t = normal(busca.value); return entes.filter((o) => (!t || normal(o.nome).includes(t)) && (!soCons.checked || o.vinculo === 'consorciado')); };
      const desenhar = () => {
        cont.textContent = sel0.size + ' ente(s) escolhido(s)';
        rc(caixa, ...visiveis().map((o) => {
          const ck = el('input', { type: 'checkbox', checked: sel0.has(o.id) });
          ck.addEventListener('change', () => { ck.checked ? sel0.add(o.id) : sel0.delete(o.id); cont.textContent = sel0.size + ' ente(s) escolhido(s)'; });
          return el('label', { class: 'check-linha' }, ck, ' ', o.nome, o.vinculo ? el('span', { class: 'ajuda' }, ' · ' + o.vinculo.replace('_', ' ')) : null, o.ativo === false ? el('span', { class: 'ajuda' }, ' · inativo') : null);
        }));
      };
      busca.addEventListener('input', desenhar); soCons.addEventListener('change', desenhar);
      let ok = false;
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Usar estes entes');
      const d = abrirDialogo(titulo || 'Escolher entes', el('div', null,
        el('p', { class: 'ajuda' }, 'Marque um ou mais entes. A estimativa, o quadro consolidado, o Excel e o texto do ETP passam a considerar só eles.'),
        el('div', { class: 'filtros-linha' }, busca, el('label', { class: 'check-linha' }, soCons, ' Só consorciados')),
        el('div', { class: 'botoes-linha' },
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { visiveis().forEach((o) => sel0.add(o.id)); desenhar(); } }, 'Marcar os da lista'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { sel0.clear(); desenhar(); } }, 'Desmarcar todos'), cont),
        caixa),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', () => { if (!sel0.size) { toast('Escolha pelo menos um ente.', true); return; } ok = true; d.close(); });
      d.addEventListener('close', () => resolve(ok ? [...sel0] : null));
      desenhar(); setTimeout(() => busca.focus(), 50);
    });
  }

  // ================================================================ 1. CONSUMO (EMPENHOS DO TCE-RN)
  function dialogoCategoria(cat, depois) {
    const f = { nome: txt(cat.nome || '', { maxlength: 160 }), termos: area((cat.termos || []).join('\n'), { rows: 8 }), excluir: area((cat.excluir || []).join('\n'), { rows: 4 }) };
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(cat.id ? 'Editar categoria' : 'Nova categoria de despesa', el('div', null,
      el('p', null, 'Os empenhos entram na categoria quando o histórico (justificativa) tem pelo menos um dos termos e nenhum termo de exclusão. Acentos e maiúsculas não importam. Depois, na lista de empenhos, dá para tirar ou incluir um empenho à mão.'),
      campo('ec-nome', 'Nome', f.nome, null, true),
      campo('ec-termos', 'Termos (um por linha)', f.termos, 'Ex.: locação de palco, sonorização, banheiro químico'),
      campo('ec-excl', 'Excluir quando aparecer (um por linha)', f.excluir, 'Ex.: cachê, aquisição, obra')),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
    b.addEventListener('click', async () => {
      if (!N.marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (!N.marcarErro(f.termos, linhas(f.termos.value).length ? '' : 'Informe ao menos um termo.')) return;
      ocupado(b, 'Salvando…');
      try { const r = await D.etpSalvarCategoria({ id: cat.id, nome: f.nome.value.trim(), termos: linhas(f.termos.value), excluir: linhas(f.excluir.value) }); await categorias(true); d.close(); toast('Categoria salva.'); depois && depois(r); }
      catch (e) { toast(e.message, true); ocupado(b); }
    });
  }
  function dialogoUnidades(o, depois) {
    const corpo = el('div');
    const desenhar = () => rc(corpo,
      el('p', null, 'Unidades do ' + o.nome + ' que mandam empenhos ao TCE-RN. Marque as que contam como consumo do ente (normalmente a prefeitura e os fundos; a câmara e a previdência ficam de fora).'),
      o.unidades.length ? tabela(['', 'Unidade', 'Empenhos lidos por ano'], o.unidades.map((u) => {
        const ck = el('input', { type: 'checkbox', checked: u.incluir, disabled: !pode() });
        ck.addEventListener('change', async () => { try { await D.etpUnidadeIncluir(o.id, u.identificador, ck.checked); u.incluir = ck.checked; toast(ck.checked ? 'Unidade incluída. Os empenhos chegam em alguns minutos.' : 'Unidade retirada.'); } catch (e) { toast(e.message, true); ck.checked = !ck.checked; } });
        return el('tr', null, el('td', null, ck), el('td', null, u.nome, u.cnpj ? el('div', { class: 'ajuda mono' }, u.cnpj) : null),
          el('td', null, (u.anos || []).map((a) => el('span', { class: 'etiqueta ' + (a.lido_em ? 'etiqueta-ativo' : 'etiqueta-pendente'), title: a.erro || '' }, a.ano + ': ' + (a.lido_em ? n0(a.empenhos, 0) : 'na fila')))));
      })) : el('p', { class: 'msg msg-falta' }, o.uf === 'RN' ? 'Nenhuma unidade do TCE-RN foi ligada a este ente ainda. Se o nome do município no Cadastro estiver diferente do IBGE, corrija o campo Município.' : 'Os empenhos vêm do TCE-RN: só há dados para entes do Rio Grande do Norte.'));
    desenhar();
    const d = abrirDialogo('Unidades no TCE-RN – ' + o.nome, corpo, [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => { d.close(); depois && depois(); } }, 'Fechar')], true);
  }
  function dialogoEmpenhos(cat, o, anoIni, anoFim) {
    const f = { ano: '', texto: '', soDentro: true, limite: 100 };
    const corpo = el('div');
    const fAno = sel([['', 'Todos os anos'], ...Array.from({ length: anoAtual - 2022 }, (_, k) => [String(anoAtual - k), String(anoAtual - k)])], '');
    const fTxt = el('input', { type: 'search', placeholder: 'Procurar no histórico (Enter)' });
    const fSo = sel([['1', 'Só os que entram na categoria'], ['0', 'Todos os empenhos do ente']], '1');
    const lista = el('div');
    fAno.addEventListener('change', () => { f.ano = fAno.value; carregar(); });
    fSo.addEventListener('change', () => { f.soDentro = fSo.value === '1'; carregar(); });
    fTxt.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { f.texto = fTxt.value; carregar(); } });
    rc(corpo, el('p', { class: 'ajuda' }, 'Categoria: ', el('strong', null, cat.nome), '. Tire o que não é consumo do objeto (ou inclua o que ficou de fora). A marcação vale para todo o consórcio.'),
      el('div', { class: 'filtros-linha' }, campo('ee-ano', 'Ano', fAno), campo('ee-so', 'Mostrar', fSo), campo('ee-txt', 'Procurar', fTxt)), lista);
    const d = abrirDialogo('Empenhos – ' + o.nome, corpo, [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d.close() }, 'Fechar')], true);
    d.classList.add('dialogo-importar');
    async function carregar() {
      carregando(lista);
      let r;
      try { r = await D.etpEmpenhos({ categoria: cat.id, orgao: o.id, ano: f.ano ? Number(f.ano) : null, soDentro: f.soDentro, texto: f.texto, limite: f.limite }); }
      catch (e) { rc(lista, el('p', { class: 'msg msg-erro' }, e.message)); return; }
      const marcar = async (e, v) => { try { await D.etpEmpenhoMarcar(cat.id, e, v); carregar(); } catch (x) { toast(x.message, true); } };
      rc(lista, el('div', { class: 'barra-lista' }, el('span', null, el('strong', null, n0(r.total, 0)), ' empenho(s) · ', rs(r.valor))),
        r.linhas.length ? tabela(['Data', 'Unidade', 'Nº', 'Valor', 'Histórico', 'Situação'], r.linhas.map((e) => el('tr', { class: e.dentro ? '' : 'linha-fora' },
          el('td', null, dataBR(e.data)), el('td', null, e.unidade), el('td', { class: 'mono' }, e.numero), el('td', { class: 'num' }, rs(e.valor)),
          el('td', { class: 'texto-longo' }, e.justificativa || '—', e.credor ? el('div', { class: 'ajuda mono' }, 'Credor ' + e.credor) : null),
          el('td', null, el('span', { class: 'etiqueta ' + (e.dentro ? 'etiqueta-ativo' : 'etiqueta-rascunho') }, e.dentro ? 'Entra' : 'Fora'), e.ajuste != null ? el('div', { class: 'ajuda' }, 'marcado à mão') : null,
            pode() ? el('div', null, el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => marcar(e, !e.dentro) }, e.dentro ? 'Tirar' : 'Incluir'),
              e.ajuste != null ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => marcar(e, null) }, 'Automático') : null) : null))))
          : el('p', { class: 'vazio' }, 'Nenhum empenho com esses filtros.'),
        r.total > r.linhas.length ? el('p', { class: 'centro' }, el('button', { type: 'button', class: 'btn btn-claro', onclick: () => { f.limite += 200; carregar(); } }, 'Mostrar mais')) : null);
    }
    carregar();
  }

  TELAS.etpconsumo = async (c) => {
    carregando(c);
    let entes, cats, st;
    try { [entes, cats, st] = await Promise.all([entesDados(true), categorias(true), D.etpStatus()]); }
    catch (e) { rc(c, cabecalho('Consumo efetivo (TCE-RN)'), el('p', { class: 'msg msg-falta' }, /etp_entes_dados|schema cache|does not exist/i.test(e.message) ? 'Rode o script 19 na Supabase para ativar esta tela.' : e.message)); return; }
    const f = (E.consumo = E.consumo || { cat: cats[0] && cats[0].id, anoIni: anoAtual - 2, anoFim: anoAtual });
    if (!cats.some((k) => k.id === f.cat)) f.cat = cats[0] && cats[0].id;
    const fCat = sel([['', 'Escolha a categoria…'], ...cats.map((k) => [k.id, k.nome])], f.cat || '');
    const anos = Array.from({ length: anoAtual - 2022 }, (_, k) => [String(anoAtual - k), String(anoAtual - k)]);
    const fIni = sel(anos, String(f.anoIni)), fFim = sel(anos, String(f.anoFim));
    const caixa = el('div');
    const desenhar = async () => {
      const cat = cats.find((k) => k.id === f.cat);
      if (!cat) { rc(caixa, el('p', { class: 'vazio' }, 'Crie uma categoria de despesa para ver o consumo.')); return; }
      carregando(caixa, 'Somando os empenhos…');
      let r;
      try { r = await D.etpConsumo(cat.id, f.anoIni, f.anoFim); } catch (e) { rc(caixa, el('p', { class: 'msg msg-erro' }, e.message)); return; }
      const anosV = []; for (let a = f.anoIni; a <= f.anoFim; a++) anosV.push(a);
      const lista = entes.filter((o) => o.unidades.length || o.uf === 'RN');
      const val = (o, a) => (r.linhas.find((l) => l.orgao_id === o.id && l.ano === a) || {});
      const media = (o) => { const fechados = anosV.filter((a) => a < anoAtual); const base = fechados.length ? fechados : anosV; return base.reduce((s, a) => s + Number(val(o, a).valor || 0), 0) / base.length; };
      const exportar = () => xlsx('Consumo TCE-RN - ' + cat.nome.slice(0, 40) + '.xlsx', [['Consumo', [['Ente', 'Unidades incluídas', ...anosV.map((a) => 'Empenhado ' + a + ' (R$)'), 'Média anual (anos fechados)'],
        ...lista.map((o) => [o.nome, o.unidades.filter((u) => u.incluir).map((u) => u.nome).join('; '), ...anosV.map((a) => Number(val(o, a).valor || 0)), media(o)])], [40, 50, ...anosV.map(() => 16), 18]]]);
      rc(caixa, el('div', { class: 'barra-lista' }, el('span', { class: 'ajuda' }, 'Média anual: só dos anos já fechados (o ano em curso aparece, mas não entra na média).'),
          el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: exportar }, 'Exportar Excel')),
        lista.length ? tabela(['Ente', 'Unidades', ...anosV.map(String), 'Média anual', ''], lista.map((o) => {
          const lidos = (r.lidos && r.lidos[o.id]) || [];
          const falta = lidos.filter((x) => !x.lido && x.ano >= f.anoIni && x.ano <= f.anoFim).length;
          return el('tr', null, el('td', null, o.nome, falta ? el('div', { class: 'ajuda' }, falta + ' unidade/ano ainda na fila') : null),
            el('td', null, o.unidades.filter((u) => u.incluir).length + ' de ' + o.unidades.length),
            ...anosV.map((a) => el('td', { class: 'num' }, val(o, a).valor ? rs(val(o, a).valor) : '—', val(o, a).empenhos ? el('div', { class: 'ajuda' }, val(o, a).empenhos + ' emp.') : null)),
            el('td', { class: 'num' }, el('strong', null, rs(media(o)))),
            el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoEmpenhos(cat, o, f.anoIni, f.anoFim) }, 'Empenhos'),
              N.perfilEm('consorciados') ? el('a', { class: 'btn btn-texto btn-p', href: '#ente-' + o.id, onclick: () => { estado.abaEnte = 'fontes'; } }, 'Unidades no Cadastro') : el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => dialogoUnidades(o) }, 'Unidades')));
        })) : el('p', { class: 'vazio' }, 'Nenhum ente do RN no Cadastro.'));
    };
    fCat.addEventListener('change', () => { f.cat = fCat.value; desenhar(); });
    fIni.addEventListener('change', () => { f.anoIni = Number(fIni.value); if (f.anoFim < f.anoIni) { f.anoFim = f.anoIni; fFim.value = String(f.anoIni); } desenhar(); });
    fFim.addEventListener('change', () => { f.anoFim = Number(fFim.value); desenhar(); });
    const cat = () => cats.find((k) => k.id === f.cat);
    rc(c, voltar('#etp', 'Entes e histórico'), cabecalho('Consumo efetivo (TCE-RN)', 'Empenhos das prefeituras e fundos no SIAI (Anexo 14), separados por categoria de despesa: mostra quanto cada ente gastou de fato.',
        pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dialogoCategoria({}, (r) => { f.cat = r.id; TELAS.etpconsumo(c); }) }, '+ Categoria') : null),
      el('p', { class: 'msg msg-info' }, 'Leitura automática do TCE-RN: ', st && st.tce ? st.tce.unidades + ' unidade/ano lidas, ' + st.tce.pendentes + ' na fila · ' + n0(st.empenhos, 0) + ' empenhos guardados.' : 'aguardando a primeira rodada.',
        ' O TCE-RN recebe os dados das prefeituras por remessa: o ano em curso pode estar incompleto.'),
      el('div', { class: 'filtros-linha' }, campo('co-cat', 'Categoria', fCat), campo('co-ini', 'De', fIni), campo('co-fim', 'Até', fFim),
        pode() ? el('div', { class: 'campo' }, el('div', { class: 'botoes-linha' },
          el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => cat() && dialogoCategoria(cat(), () => TELAS.etpconsumo(c)) }, 'Editar termos'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: async () => { if (!cat() || !(await confirmar('Excluir categoria', 'Excluir a categoria "' + cat().nome + '" e as marcações feitas à mão?', 'Excluir', true))) return; try { await D.etpExcluirCategoria(cat().id); f.cat = null; TELAS.etpconsumo(c); } catch (e) { toast(e.message, true); } } }, 'Excluir'))) : null),
      caixa);
    desenhar();
  };

  // ================================================================ 2. PESQUISA AMPLIADA NO PNCP
  const ABR = [['RN', 'Rio Grande do Norte'], ['NE', 'Nordeste'], ['BR', 'Brasil']];
  const SITP = { buscando: ['Buscando no PNCP', 'etiqueta-pendente'], lendo: ['Lendo itens e preços', 'etiqueta-editar'], pronta: ['Pronta', 'etiqueta-ativo'], erro: ['Erro', 'etiqueta-inativo'] };
  TELAS.etpampliada = async (c) => {
    carregando(c);
    let ps;
    try { ps = await D.etpPesquisas(); } catch (e) { rc(c, cabecalho('Pesquisa ampliada'), el('p', { class: 'msg msg-falta' }, /etp_pesquisas|schema cache/i.test(e.message) ? 'Rode o script 19 na Supabase.' : e.message)); return; }
    const fT = el('input', { type: 'search', placeholder: 'Ex.: locação de palco, banheiro químico, cadeira escolar' });
    const fA = sel(ABR, 'RN');
    const b = el('button', { type: 'submit', class: 'btn btn-primario' }, 'Pesquisar no PNCP');
    const form = el('form', { class: 'cartao form-busca-etp' }, el('div', { class: 'filtros-linha' }, campo('pa-t', 'O que procurar', fT, 'Procura nos editais publicados no PNCP nos últimos 30 meses.', true), campo('pa-a', 'Abrangência', fA), el('div', { class: 'campo' }, b)));
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!N.marcarErro(fT, fT.value.trim().length >= 3 ? '' : 'Digite pelo menos 3 letras.')) return;
      ocupado(b, 'Enviando…');
      try { await D.etpPesquisar(fT.value.trim(), fA.value); toast('Pesquisa enviada. Os itens e preços chegam nos próximos minutos.'); TELAS.etpampliada(c); } catch (e) { toast(e.message, true); ocupado(b); }
    });
    rc(c, voltar('#etp', 'Entes e histórico'), cabecalho('Pesquisa ampliada no PNCP', 'Busca licitações de outros órgãos (RN, Nordeste ou Brasil) pelo objeto. Os itens e preços entram no histórico e podem ser usados em "Pesquisar itens" e na pesquisa de preços da estimativa.'),
      pode() ? form : null,
      el('p', { class: 'ajuda' }, 'Cada pesquisa traz até 300 licitações (as mais recentes). A leitura dos itens e preços é feita pelo banco, a cada minuto.'),
      ps.length ? tabela(['Termo', 'Abrangência', 'Situação', 'Licitações', 'Órgãos', 'Data', ''], ps.map((p) => el('tr', null,
        el('td', null, el('strong', null, p.termo)), el('td', null, (ABR.find((a) => a[0] === p.abrangencia) || [0, p.abrangencia])[1]),
        el('td', null, el('span', { class: 'etiqueta ' + (SITP[p.situacao] || SITP.lendo)[1] }, (SITP[p.situacao] || SITP.lendo)[0]), p.erro ? el('div', { class: 'ajuda' }, p.erro) : null),
        el('td', { class: 'num' }, p.lidas + ' lida(s) de ' + p.achadas), el('td', { class: 'num' }, p.cnpjs.length), el('td', null, dataBR(p.criado_em)),
        el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#etpbusca', onclick: () => { E.busca = E.busca || {}; E.busca.pesquisas = [p.id]; E.busca.texto = p.termo; E.busca.res = null; } }, 'Ver séries'),
          pode() ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: async () => { if (!(await confirmar('Excluir pesquisa', 'Excluir a pesquisa "' + p.termo + '"? Os itens lidos continuam no histórico.', 'Excluir'))) return; try { await D.etpExcluirPesquisa(p.id); TELAS.etpampliada(c); } catch (e) { toast(e.message, true); } } }, 'Excluir') : null))))
        : el('p', { class: 'vazio' }, 'Nenhuma pesquisa ampliada ainda.'));
    if (ps.some((p) => ['buscando', 'lendo'].includes(p.situacao))) setTimeout(() => { if (location.hash === '#etpampliada') TELAS.etpampliada(c); }, 30000);
  };
  // CNPJs das pesquisas ampliadas marcadas (usado pela tela "Pesquisar itens")
  window.ETP_PESQUISAS = { lista: () => D.etpPesquisas() };

  // ================================================================ METODOLOGIAS DE PESQUISA DE PREÇOS
  const TEXTO_PADRAO_MET = 'A pesquisa de preços observou o art. 23 da Lei nº 14.133/2021. Foram utilizados preços homologados em contratações similares publicadas no Portal Nacional de Contratações Públicas (PNCP) {FONTES}, {JANELA}. {IPCA} {CRITERIO} O valor de referência de cada item corresponde {REFERENCIA} dos preços válidos, exigindo-se no mínimo {MIN} preços por item; quando não atingido esse número, a pesquisa foi complementada por outros parâmetros do art. 23, § 1º, com a devida justificativa.';
  function dialogoMetodologia(x, depois) {
    const c = criterios(x.params);
    const f = {
      nome: txt(x.nome || '', { maxlength: 160 }),
      janela: el('input', { type: 'number', min: 0, max: 120, value: c.janela_meses, class: 'campo-num' }),
      ipca: el('input', { type: 'checkbox', checked: c.ipca }),
      entes: el('input', { type: 'checkbox', checked: c.fontes.entes }), ampl: el('input', { type: 'checkbox', checked: c.fontes.ampliadas }),
      crit: sel([['percentual', 'Percentual da mediana'], ['desvio', 'Desvio-padrão em torno da média'], ['nenhum', 'Não excluir']], c.criterio),
      abaixo: el('input', { type: 'number', min: 0, max: 100, value: c.abaixo, class: 'campo-num' }), acima: el('input', { type: 'number', min: 100, value: c.acima, class: 'campo-num' }),
      desvios: el('input', { type: 'number', min: 0.5, step: 0.5, value: c.desvios, class: 'campo-num' }),
      ref: sel([['mediana', 'Mediana'], ['media', 'Média'], ['menor', 'Menor preço'], ['cv', 'Automática: média se o coeficiente de variação for baixo, senão mediana']], c.referencia),
      cv: el('input', { type: 'number', min: 1, max: 100, value: c.cv_limite, class: 'campo-num' }),
      min: el('input', { type: 'number', min: 1, max: 20, value: c.min_precos, class: 'campo-num' }),
      texto: area(x.texto || TEXTO_PADRAO_MET, { rows: 7 }),
    };
    const prev = el('p', { class: 'texto-modelo previa-met' });
    const params = () => ({ janela_meses: Number(f.janela.value) || 0, ipca: f.ipca.checked, fontes: { entes: f.entes.checked, ampliadas: f.ampl.checked }, criterio: f.crit.value,
      abaixo: Number(f.abaixo.value) || 70, acima: Number(f.acima.value) || 130, desvios: Number(f.desvios.value) || 1, referencia: f.ref.value, cv_limite: Number(f.cv.value) || 25, min_precos: Number(f.min.value) || 3 });
    const boxPerc = el('div', { class: 'filtros-linha' }, el('label', { class: 'check-linha' }, 'Inexequível abaixo de ', f.abaixo, '% da mediana'), el('label', { class: 'check-linha' }, 'Excessivo acima de ', f.acima, '% da mediana'));
    const boxDp = el('div', { class: 'filtros-linha' }, el('label', { class: 'check-linha' }, 'Excluir fora de ±', f.desvios, ' desvio(s)-padrão'));
    const boxCv = el('div', { class: 'filtros-linha' }, el('label', { class: 'check-linha' }, 'Usar a média quando o coeficiente de variação for de até ', f.cv, '%'));
    const atualizar = () => { boxPerc.hidden = f.crit.value !== 'percentual'; boxDp.hidden = f.crit.value !== 'desvio'; boxCv.hidden = f.ref.value !== 'cv'; prev.textContent = textoMetodologia(f.texto.value, params()); };
    Object.values(f).forEach((e) => e.addEventListener && e.addEventListener('input', atualizar)); [f.crit, f.ref, f.ipca, f.entes, f.ampl].forEach((e) => e.addEventListener('change', atualizar));
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(x.id ? 'Editar metodologia' : 'Nova metodologia de pesquisa de preços', el('div', null,
      campo('mt-n', 'Nome', f.nome, 'Ex.: Padrão do consórcio; Serviços contínuos (24 meses)', true),
      el('h3', null, 'Fontes e período'),
      el('div', { class: 'filtros-linha' }, el('label', { class: 'check-linha' }, f.entes, ' Preços dos próprios entes'), el('label', { class: 'check-linha' }, f.ampl, ' Preços de outros órgãos (pesquisas ampliadas)'),
        el('label', { class: 'check-linha' }, 'Período: últimos ', f.janela, ' meses (0 = sem limite)'), el('label', { class: 'check-linha' }, f.ipca, ' Corrigir pelo IPCA')),
      el('h3', null, 'Valores fora da curva'), campo('mt-c', 'Critério de exclusão', f.crit), boxPerc, boxDp,
      el('h3', null, 'Valor de referência'), campo('mt-r', 'Referência', f.ref), boxCv, el('label', { class: 'check-linha' }, 'Mínimo de ', f.min, ' preços válidos por item'),
      el('h3', null, 'Texto para o ETP e o Termo de Referência'),
      el('p', { class: 'ajuda' }, 'Marcadores: {FONTES}, {JANELA}, {IPCA}, {CRITERIO}, {REFERENCIA}, {MIN}. Eles são trocados pelos critérios acima.'),
      campo('mt-t', 'Texto', f.texto), el('p', { class: 'ajuda' }, 'Como fica:'), prev),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
    atualizar();
    b.addEventListener('click', async () => {
      if (!N.marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      ocupado(b, 'Salvando…');
      try { await D.etpSalvarMetodologia({ id: x.id, nome: f.nome.value.trim(), params: params(), texto: f.texto.value.trim() }); d.close(); toast('Metodologia salva.'); depois && depois(); }
      catch (e) { toast(e.message, true); ocupado(b); }
    });
  }
  TELAS.etpmetodologias = async (c) => {
    carregando(c);
    let l;
    try { l = await D.etpMetodologias(); } catch (e) { rc(c, cabecalho('Metodologias de pesquisa de preços'), el('p', { class: 'msg msg-falta' }, /etp_metodologias|schema cache/i.test(e.message) ? 'Rode o script 21 na Supabase.' : e.message)); return; }
    const re = () => TELAS.etpmetodologias(c);
    rc(c, voltar('#etpestimativas', 'Estimativas'), cabecalho('Metodologias de pesquisa de preços', 'Critérios padronizados (período, correção, exclusão de valores fora da curva, valor de referência e mínimo de preços) e o texto que vai para o ETP e o TR. Cada estimativa escolhe uma; a padrão entra sozinha nas novas.',
        pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => dialogoMetodologia({}, re) }, '+ Metodologia') : null),
      l.length ? tabela(['Metodologia', 'Critérios', ''], l.map((x) => {
        const k = criterios(x.params);
        return el('tr', null, el('td', null, el('strong', null, x.nome), x.padrao ? el('div', null, el('span', { class: 'etiqueta etiqueta-ativo' }, 'Padrão')) : null),
          el('td', { class: 'texto-longo' }, [Number(k.janela_meses) > 0 ? 'Últimos ' + k.janela_meses + ' meses' : 'Sem limite de período', k.ipca ? 'IPCA' : 'Sem correção',
            k.criterio === 'percentual' ? 'Exclui abaixo de ' + k.abaixo + '% e acima de ' + k.acima + '% da mediana' : k.criterio === 'desvio' ? 'Exclui fora de ±' + k.desvios + ' DP' : 'Sem exclusão',
            'Referência: ' + ({ mediana: 'mediana', media: 'média', menor: 'menor preço', cv: 'média se CV ≤ ' + k.cv_limite + '%, senão mediana' })[k.referencia], 'Mínimo ' + k.min_precos + ' preços',
            [k.fontes.entes ? 'entes' : null, k.fontes.ampliadas ? 'outros órgãos' : null].filter(Boolean).join(' e ')].join(' · ')),
          el('td', { class: 'acoes' }, pode() ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoMetodologia(x, re) }, 'Editar'),
            el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => dialogoMetodologia({ nome: x.nome + ' (cópia)', params: x.params, texto: x.texto }, re) }, 'Duplicar'),
            !x.padrao ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: async () => { try { await D.etpMetodologiaPadrao(x.id); toast('Agora é a padrão.'); re(); } catch (e) { toast(e.message, true); } } }, 'Tornar padrão') : null,
            !x.padrao ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: async () => { if (!(await confirmar('Excluir metodologia', 'Excluir "' + x.nome + '"? As estimativas que a usam guardam uma cópia dos critérios.', 'Excluir', true))) return; try { await D.etpExcluirMetodologia(x.id); re(); } catch (e) { toast(e.message, true); } } }, 'Excluir') : null] : null));
      })) : el('p', { class: 'vazio' }, 'Nenhuma metodologia.'));
  };

  // ================================================================ 3. ESTIMATIVAS DE QUANTITATIVOS
  const METODOS = { eventos: 'Modelo por eventos', historico: 'Histórico no PNCP', indicador: 'Indicador (Censo Escolar / população)', manual: 'Manual por ente' };
  const PORTES = () => [{ id: 'I', ate: 5000 }, { id: 'II', ate: 10000 }, { id: 'III', ate: 20000 }, { id: 'IV', ate: null }];
  function novoModelo() {
    return {
      portes: PORTES(),
      tipos: [{ cod: 'A', nome: 'Festa principal (emancipação ou padroeiro)', dias: 2, freq: { I: 1, II: 1, III: 1, IV: 1 } }],
      itens: [], entes: {}, ajustes: {},
      fator: { usar: false, categoria: null, anos: [anoAtual - 2, anoAtual - 1], min: 1, max: 4 },
      precos: {},
      resultado: {},
    };
  }
  TELAS.etpestimativas = async (c) => {
    carregando(c);
    let l;
    try { l = await D.etpEstimativas(); } catch (e) { rc(c, cabecalho('Estimativas de quantitativos'), el('p', { class: 'msg msg-falta' }, /etp_estimativas|schema cache/i.test(e.message) ? 'Rode o script 19 na Supabase.' : e.message)); return; }
    const nova = () => {
      const f = { t: txt('', { maxlength: 200, placeholder: 'Ex.: Estruturas para eventos 2027' }), p: txt('', { maxlength: 60 }), o: area('', { rows: 3 }) };
      let escolhidos = [];
      const rTodos = el('input', { type: 'radio', name: 'ne-ab', value: 'consorciados', checked: true }), rAlguns = el('input', { type: 'radio', name: 'ne-ab', value: 'escolhidos' });
      const resumo = el('span', { class: 'ajuda' });
      const bEsc = el('button', { type: 'button', class: 'btn btn-claro btn-p', hidden: true }, 'Escolher entes…');
      const escolher = async () => {
        let ents; try { ents = await entesDados(); } catch (e) { toast(e.message, true); return; }
        const r = await escolherEntes(ents.filter((o) => o.ativo !== false), escolhidos, 'Entes da estimativa');
        if (r) { escolhidos = r; resumo.textContent = ' ' + r.length + ' ente(s): ' + ents.filter((o) => r.includes(o.id)).map((o) => o.nome).slice(0, 4).join('; ') + (r.length > 4 ? '…' : ''); }
        if (!escolhidos.length) { rTodos.checked = true; bEsc.hidden = true; resumo.textContent = ''; }
      };
      bEsc.addEventListener('click', escolher);
      rTodos.addEventListener('change', () => { bEsc.hidden = true; resumo.textContent = ''; });
      rAlguns.addEventListener('change', () => { bEsc.hidden = false; escolher(); });
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Criar');
      const d = abrirDialogo('Nova estimativa', el('div', null, campo('ne-t', 'Título', f.t, null, true), campo('ne-p', 'Processo administrativo', f.p), campo('ne-o', 'Objeto', f.o),
          el('fieldset', { class: 'campo' }, el('legend', null, 'Para quais entes'),
            el('label', { class: 'check-linha' }, rTodos, ' Todos os consorciados ativos'),
            el('label', { class: 'check-linha' }, rAlguns, ' Só um ou alguns entes'),
            el('div', null, bEsc, resumo))),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b]);
      b.addEventListener('click', async () => {
        if (!N.marcarErro(f.t, f.t.value.trim() ? '' : 'Informe o título.')) return;
        if (rAlguns.checked && !escolhidos.length) { toast('Escolha os entes.', true); return; }
        const dados = novoModelo();
        if (rAlguns.checked) { dados.abrangencia = 'escolhidos'; escolhidos.forEach((id) => { dados.entes[id] = { incluir: true }; }); }
        ocupado(b, 'Criando…');
        try { const r = await D.etpSalvarEstimativa({ titulo: f.t.value.trim(), processo: f.p.value.trim(), objeto: f.o.value.trim(), dados }); d.close(); location.hash = '#etpestimativa-' + r.id; }
        catch (e) { toast(e.message, true); ocupado(b); }
      });
    };
    rc(c, voltar('#etp', 'Entes e histórico'), cabecalho('Estimativas de quantitativos', 'Quantidades por ente para o ETP (art. 18, § 1º, IV, e art. 40, III, da Lei nº 14.133/2021), com memória de cálculo, pesquisa de preços e envio à IRP.',
        pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: nova }, '+ Nova estimativa') : null),
      l.length ? tabela(['Estimativa', 'Processo', 'Atualizada', 'IRP', ''], l.map((x) => el('tr', null,
        el('td', null, el('a', { class: 'link-forte', href: '#etpestimativa-' + x.id }, x.titulo), x.objeto ? el('div', { class: 'ajuda' }, x.objeto.slice(0, 140)) : null),
        el('td', null, x.processo || '—'), el('td', null, dataBR(x.atualizado_em), x.criado_por_nome ? el('div', { class: 'ajuda' }, x.criado_por_nome) : null),
        el('td', null, x.irp_id ? el('a', { class: 'link', href: '#irp-' + x.irp_id }, 'Ver IRP') : '—'),
        el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#etpestimativa-' + x.id }, 'Abrir')))))
        : el('p', { class: 'vazio' }, 'Nenhuma estimativa ainda.'));
  };

  // ---------------------------------------------------------------- cálculo
  function porteDe(m, pop) { if (pop == null) return null; const p = m.portes.find((x) => x.ate == null || pop <= x.ate); return p ? p.id : m.portes[m.portes.length - 1].id; }
  // Contexto: dados dos entes, consumo, histórico das séries e indicadores
  async function contexto(est, forcar) {
    const m = est.dados;
    const ctx = { entes: await entesDados(forcar), consumo: {}, series: {}, indic: {} };
    if (m.fator.usar && m.fator.categoria) {
      try { const r = await D.etpConsumo(m.fator.categoria, Math.min(...m.fator.anos), Math.max(...m.fator.anos)); r.linhas.forEach((l) => { (ctx.consumo[l.orgao_id] = ctx.consumo[l.orgao_id] || {})[l.ano] = Number(l.valor); }); } catch (e) { toast(e.message, true); }
    }
    const todos = [...new Set(ctx.entes.flatMap((o) => o.cnpjs))];
    const chaves = [...new Set(m.itens.filter((i) => i.metodo === 'historico').flatMap((i) => i.series || []))];
    if (todos.length) await Promise.all(chaves.map(async (k) => { try { ctx.series[k] = await D.etpItensSerie(k, todos); } catch (e) { ctx.series[k] = []; } }));
    const inds = [...new Set(m.itens.filter((i) => i.metodo === 'indicador' && i.indicador && i.indicador !== 'populacao').map((i) => i.indicador))];
    await Promise.all(inds.map(async (id) => { try { ctx.indic[id] = await D.etpIndicadorEntes(Number(id)); } catch (e) { ctx.indic[id] = {}; } }));
    return ctx;
  }
  function calcular(est, ctx) {
    const m = est.dados;
    const entes = ctx.entes.filter((o) => (m.entes[o.id] || {}).incluir);
    const info = {};
    entes.forEach((o) => {
      const cfg = m.entes[o.id] || {};
      const pop = cfg.populacao != null && cfg.populacao !== '' ? Number(cfg.populacao) : o.populacao ? o.populacao.populacao : null;
      info[o.id] = { o, pop, porte: cfg.porte || porteDe(m, pop) || m.portes[0].id };
    });
    // quantidade do modelo por porte
    const qtdEventos = (it, porte) => Math.ceil(m.tipos.reduce((s, t) => s + Number((t.freq || {})[porte] || 0) * Number((it.kit || {})[t.cod] || 0) * (it.porDia ? Number(t.dias || 1) : 1), 0));
    // valor-base de cada porte (itens do modelo por eventos com preço)
    const valorBase = {};
    m.portes.forEach((p) => { valorBase[p.id] = m.itens.filter((i) => i.metodo === 'eventos' && i.preco && i.preco.valor).reduce((s, i) => s + qtdEventos(i, p.id) * Number(i.preco.valor), 0); });
    // fator de consumo
    const anosF = (m.fator.anos || []).filter((a) => a < anoAtual);
    Object.values(info).forEach((x) => {
      const cons = ctx.consumo[x.o.id] || {};
      x.consumo = anosF.length ? anosF.reduce((s, a) => s + Number(cons[a] || 0), 0) / anosF.length : null;
      const cfg = m.entes[x.o.id] || {};
      if (cfg.fator != null && cfg.fator !== '') { x.fator = Number(cfg.fator); x.fatorManual = true; }
      else if (m.fator.usar && x.consumo && valorBase[x.porte]) x.fator = Math.min(Math.max(x.consumo / valorBase[x.porte], Number(m.fator.min || 1)), Number(m.fator.max || 4));
      else x.fator = 1;
    });
    // histórico por série: soma por CNPJ e ano (homologada quando há, senão licitada)
    const histEnte = (it, o) => {
      const anos = it.anos && it.anos.length ? it.anos : [anoAtual - 3, anoAtual - 2, anoAtual - 1];
      const porAno = {}; anos.forEach((a) => { porAno[a] = 0; });
      (it.series || []).forEach((k) => (ctx.series[k] || []).filter((i) => o.cnpjs.includes(i.cnpj) && anos.includes(i.ano)).forEach((i) => {
        const r = (i.resultados || []).filter((x) => !x.cancelado);
        porAno[i.ano] += it.base === 'licitada' || !r.length ? Number(i.quantidade || 0) : r.reduce((s, x) => s + Number(x.quantidade || 0), 0);
      }));
      const vals = anos.map((a) => porAno[a]);
      const v = it.estat === 'maximo' ? Math.max(...vals) : vals.reduce((s, x) => s + x, 0) / vals.length;
      return { v: Math.ceil(v * Number(it.coef || 1)), porAno };
    };
    const qtd = {}, memo = {};
    m.itens.forEach((it) => {
      qtd[it.id] = {}; memo[it.id] = {};
      Object.values(info).forEach((x) => {
        let v = 0, mem = '';
        if (it.metodo === 'eventos') {
          const b = qtdEventos(it, x.porte); v = Math.ceil(b * x.fator);
          mem = 'Porte ' + x.porte + ': ' + m.tipos.filter((t) => Number((it.kit || {})[t.cod] || 0) && Number((t.freq || {})[x.porte] || 0)).map((t) => t.freq[x.porte] + ' × ' + it.kit[t.cod] + (it.porDia ? ' × ' + t.dias + ' dia(s)' : '') + ' (' + t.cod + ')').join(' + ') + ' = ' + b + (x.fator !== 1 ? '; × fator ' + n0(x.fator) + ' = ' + v : '');
        } else if (it.metodo === 'historico') {
          const h = histEnte(it, x.o); v = h.v;
          mem = 'Histórico PNCP (' + (it.estat === 'maximo' ? 'maior ano' : 'média anual') + '): ' + Object.entries(h.porAno).map(([a, q]) => a + ': ' + n0(q)).join('; ') + (Number(it.coef || 1) !== 1 ? ' × ' + it.coef : '') + ' = ' + v;
        } else if (it.metodo === 'indicador') {
          const base = it.indicador === 'populacao' ? { valor: x.pop, ano: x.o.populacao && x.o.populacao.ano } : ((ctx.indic[it.indicador] || {})[x.o.id] || {});
          v = base.valor != null ? Math.ceil(Number(base.valor) * Number(it.coef || 1)) : 0;
          mem = (it.indicadorNome || 'Indicador') + (base.ano ? ' (' + base.ano + ')' : '') + ': ' + n0(base.valor) + ' × ' + n0(it.coef || 1, 4) + ' = ' + v;
        } else {
          v = Number(((it.manual || {})[x.o.id]) || 0); mem = 'Informado à mão';
        }
        const aj = ((m.ajustes || {})[it.id] || {})[x.o.id];
        if (aj != null && aj !== '') { mem += ' · ajustado à mão para ' + aj; v = Number(aj); }
        qtd[it.id][x.o.id] = v; memo[it.id][x.o.id] = mem;
      });
    });
    const total = {}; m.itens.forEach((it) => { total[it.id] = Object.values(qtd[it.id]).reduce((s, v) => s + v, 0) + Number(it.extra || 0); });
    return { info, entes, valorBase, qtd, memo, total };
  }

  // ---------------------------------------------------------------- pesquisa de preços de um item
  function ipcaFator(ipca, data, refMes) {
    if (!ipca.length || !data) return 1;
    const mes = String(data).slice(0, 7).replace('-', '');
    const achar = (m) => { let v = null; for (const x of ipca) { if (x.mes <= m) v = Number(x.indice); else break; } return v; };
    const a = achar(mes), b = achar(refMes);
    return a && b ? b / a : 1;
  }
  // Critérios da metodologia (com valores padrão e compatibilidade com estimativas antigas)
  const PADRAO_MET = { janela_meses: 12, ipca: true, fontes: { entes: true, ampliadas: true }, criterio: 'percentual', abaixo: 70, acima: 130, desvios: 1, referencia: 'mediana', cv_limite: 25, min_precos: 3 };
  function criterios(c) {
    const x = Object.assign({}, PADRAO_MET, c || {});
    if (c && c.ultimoAno != null && c.janela_meses == null) x.janela_meses = c.ultimoAno ? 12 : 0;
    x.fontes = Object.assign({}, PADRAO_MET.fontes, (c && c.fontes) || {});
    return x;
  }
  function analisarPrecos(obs, cfg0, ipca) {
    const cfg = criterios(cfg0);
    const refMes = ipca.length ? ipca[ipca.length - 1].mes : null;
    const limite = new Date(); limite.setMonth(limite.getMonth() - Number(cfg.janela_meses || 0));
    const lista = obs.map((o) => ({ ...o, corrigido: Number(o.valor) * (cfg.ipca ? ipcaFator(ipca, o.data, refMes) : 1), antigo: Number(cfg.janela_meses) > 0 && o.data && new Date(o.data) < limite }));
    const exc = cfg0 && cfg0.excluidos || [];
    const base = lista.filter((o) => !exc.includes(o.item_id + '|' + o.fornecedor) && !o.antigo);
    const med = (v) => { const s2 = [...v].sort((p, q) => p - q); return s2.length ? (s2.length % 2 ? s2[(s2.length - 1) / 2] : (s2[s2.length / 2 - 1] + s2[s2.length / 2]) / 2) : null; };
    const media = (v) => (v.length ? v.reduce((t, x) => t + x, 0) / v.length : null);
    const dp = (v) => { const m0 = media(v); return v.length > 1 ? Math.sqrt(v.reduce((t, x) => t + (x - m0) ** 2, 0) / (v.length - 1)) : 0; };
    const vals = base.map((o) => o.corrigido);
    if (cfg.criterio === 'percentual') { const m0 = med(vals); base.forEach((o) => { o.fora = m0 != null && (o.corrigido < m0 * cfg.abaixo / 100 ? 'inexequível' : o.corrigido > m0 * cfg.acima / 100 ? 'excessivo' : null); }); }
    else if (cfg.criterio === 'desvio') { const m0 = media(vals), d0 = dp(vals); base.forEach((o) => { o.fora = d0 > 0 && (o.corrigido < m0 - cfg.desvios * d0 ? 'inexequível' : o.corrigido > m0 + cfg.desvios * d0 ? 'excessivo' : null); }); }
    else base.forEach((o) => { o.fora = null; });
    const validos = base.filter((o) => !o.fora).map((o) => o.corrigido);
    const res = { n: validos.length, mediana: med(validos), media: media(validos), menor: validos.length ? Math.min(...validos) : null, refMes };
    res.cv = res.media ? (dp(validos) / res.media) * 100 : null;
    res.regra = cfg.referencia === 'cv' ? (res.cv != null && res.cv <= cfg.cv_limite ? 'media' : 'mediana') : cfg.referencia;
    res.valor = res.regra === 'media' ? res.media : res.regra === 'menor' ? res.menor : res.mediana;
    res.suficiente = res.n >= Number(cfg.min_precos || 0);
    lista.forEach((o) => { const b2 = base.find((x) => x.item_id === o.item_id && x.fornecedor === o.fornecedor); o.situacao = exc.includes(o.item_id + '|' + o.fornecedor) ? 'excluído à mão' : o.antigo ? 'fora do período' : b2 && b2.fora ? b2.fora : 'válido'; });
    return { lista, res };
  }
  // Texto da metodologia com os marcadores preenchidos
  const ROT_REF = { mediana: 'à mediana', media: 'à média', menor: 'ao menor valor', cv: 'à média, quando o coeficiente de variação for de até {CV}%, ou à mediana, quando maior' };
  function textoMetodologia(texto, c0) {
    const c = criterios(c0);
    const fontes = [c.fontes.entes ? 'pelos próprios entes' : null, c.fontes.ampliadas ? 'por outros órgãos e entidades da Administração Pública' : null].filter(Boolean).join(' e ');
    const crit = c.criterio === 'percentual' ? 'Foram desconsiderados, como inexequíveis ou excessivamente elevados, os valores inferiores a ' + c.abaixo + '% ou superiores a ' + c.acima + '% da mediana do conjunto.'
      : c.criterio === 'desvio' ? 'Foram desconsiderados, como inexequíveis ou excessivamente elevados, os valores fora do intervalo de ' + String(c.desvios).replace('.', ',') + ' desvio(s)-padrão em torno da média.'
      : 'Não houve exclusão de valores por critério estatístico.';
    return String(texto || '').replace(/\{FONTES\}/g, fontes ? fontes : '').replace(/\{JANELA\}/g, Number(c.janela_meses) > 0 ? 'em execução ou concluídas no período de ' + c.janela_meses + ' meses anteriores (art. 23, § 1º, II)' : 'sem limite de período')
      .replace(/\{IPCA\}/g, c.ipca ? 'Os valores foram atualizados pelo IPCA até o mês mais recente disponível.' : '').replace(/\{CRITERIO\}/g, crit)
      .replace(/\{REFERENCIA\}/g, ROT_REF[c.referencia] || 'à mediana').replace(/\{CV\}/g, c.cv_limite).replace(/\{MIN\}/g, c.min_precos).replace(/\s+\./g, '.').replace(/ {2,}/g, ' ');
  }

  // Escolher séries do histórico para um item (busca nos entes e nas pesquisas ampliadas)
  async function escolherSeries(it, cnpjsBase, depois) {
    const fT = el('input', { type: 'search', value: it.descricao ? it.descricao.split(/\s+/).slice(0, 3).join(' ') : '', placeholder: 'Procurar séries (Enter)' });
    let pesq = [];
    try { pesq = (await D.etpPesquisas()).filter((p) => p.cnpjs.length); } catch (e) { }
    const cks = pesq.map((p) => ({ p, ck: el('input', { type: 'checkbox', checked: (it.pesquisas || []).includes(p.id) }) }));
    const marcadas = new Set(it.series || []);
    const lista = el('div');
    const cnpjs = () => [...new Set([...cnpjsBase, ...cks.filter((x) => x.ck.checked).flatMap((x) => x.p.cnpjs)])];
    const buscar = async () => {
      if (fT.value.trim().length < 2) return;
      carregando(lista, 'Procurando…');
      try {
        const r = await D.etpBuscar({ texto: fT.value.trim(), cnpjs: cnpjs(), limite: 80 });
        rc(lista, r.series.length ? tabela(['', 'Série', 'Unid.', 'Compras', 'Órgãos', 'Preço mediano'], r.series.map((s) => {
          const ck = el('input', { type: 'checkbox', checked: marcadas.has(s.chave) });
          ck.addEventListener('change', () => { ck.checked ? marcadas.add(s.chave) : marcadas.delete(s.chave); });
          return el('tr', null, el('td', null, ck), el('td', { class: 'texto-longo' }, s.nome || s.exemplo.slice(0, 160)), el('td', null, s.unidade || '—'), el('td', { class: 'num' }, s.compras), el('td', { class: 'num' }, s.orgaos), el('td', { class: 'num' }, s.precos ? rs(s.preco_mediana) : '—'));
        })) : el('p', { class: 'vazio' }, 'Nada encontrado. Tente outra palavra ou faça uma pesquisa ampliada no PNCP.'));
      } catch (e) { rc(lista, el('p', { class: 'msg msg-erro' }, e.message)); }
    };
    fT.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscar(); } });
    cks.forEach((x) => x.ck.addEventListener('change', buscar));
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Usar as marcadas');
    const d = abrirDialogo('Séries do histórico – ' + (it.descricao || 'item'), el('div', null,
      el('p', { class: 'ajuda' }, 'Marque as séries que correspondem a este item. Elas servem para o histórico de quantidades e para a pesquisa de preços.'),
      cks.length ? el('details', { class: 'detalhe-entes' }, el('summary', null, 'Incluir pesquisas ampliadas (' + cks.length + ')'), el('div', { class: 'lista-entes-busca' }, cks.map((x) => el('label', { class: 'check-linha' }, x.ck, ' ' + x.p.termo + ' (' + x.p.abrangencia + ')')))) : null,
      campo('es-t', 'Procurar', fT), lista), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
    d.classList.add('dialogo-importar');
    b.addEventListener('click', () => { it.series = [...marcadas]; it.pesquisas = cks.filter((x) => x.ck.checked).map((x) => x.p.id); d.close(); depois && depois(); });
    buscar();
  }

  // ---------------------------------------------------------------- tela da estimativa
  TELAS.etpestimativa = async (c, id) => {
    carregando(c);
    let est;
    try { est = await D.etpEstimativa(id); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    if (!est) { rc(c, voltar('#etpestimativas', 'Estimativas'), el('p', { class: 'msg msg-erro' }, 'Estimativa não encontrada.')); return; }
    est.dados = Object.assign(novoModelo(), est.dados || {});
    const m = est.dados;
    m.precos = m.precos || {};
    m.fator = Object.assign(novoModelo().fator, m.fator || {});
    let ctx, R, cats = [], ipca = [], indicadores = [], metodologias = [];
    try { [ctx, cats, ipca, indicadores, metodologias] = await Promise.all([contexto(est), categorias(), D.etpIpca(), D.etpIndicadores().catch(() => []), D.etpMetodologias ? D.etpMetodologias().catch(() => []) : []]); }
    catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, e.message)); return; }
    // metodologia: na primeira vez, a padrão do consórcio
    if (!m.precos.metodologia_id && m.precos.janela_meses == null && m.precos.ultimoAno == null) {
      const pad = metodologias.find((x) => x.padrao);
      if (pad) m.precos = Object.assign(criterios(pad.params), { metodologia_id: pad.id, metodologia_nome: pad.nome, texto: pad.texto });
    }
    // entes: na primeira vez, todos os consorciados ativos (ou todos os ativos, se nenhum tiver vínculo)
    if (!Object.keys(m.entes).length) {
      const cons = ctx.entes.filter((o) => o.ativo !== false && o.vinculo === 'consorciado');
      (cons.length ? cons : ctx.entes.filter((o) => o.ativo !== false && (!o.vinculo || o.vinculo === 'consorciado'))).forEach((o) => { m.entes[o.id] = { incluir: true }; });
    }
    let sujo = false, timer = null;
    const estado2 = el('span', { class: 'ajuda' });
    const salvar = async (silencioso) => {
      clearTimeout(timer);
      R = calcular(est, ctx);
      m.resultado = {}; m.itens.forEach((it) => { m.resultado[it.id] = R.qtd[it.id]; });
      try { await D.etpSalvarEstimativa(est); sujo = false; estado2.textContent = 'Salvo às ' + new Date().toLocaleTimeString('pt-BR').slice(0, 5); if (!silencioso) toast('Estimativa salva.'); }
      catch (e) { estado2.textContent = 'Não salvo'; toast(e.message, true); }
    };
    const mudou = () => { sujo = true; estado2.textContent = 'Alterações não salvas…'; clearTimeout(timer); if (pode()) timer = setTimeout(() => salvar(true), 2500); };
    const recalc = () => { R = calcular(est, ctx); };
    recalc();
    const paineis = {};
    const montar = (k, fn) => () => { const box = el('div'); paineis[k] = () => rc(box, ...[].concat(fn()).filter(Boolean)); paineis[k](); return box; };
    const redesenhar = (...ks) => ks.forEach((k) => paineis[k] && paineis[k]());

    // ----- aba Dados e parâmetros
    const abaDados = () => {
      const f = { t: txt(est.titulo, { maxlength: 200 }), p: txt(est.processo || '', { maxlength: 60 }), o: area(est.objeto || '', { rows: 3 }) };
      [['t', 'titulo'], ['p', 'processo'], ['o', 'objeto']].forEach(([k, c2]) => f[k].addEventListener('input', () => { est[c2] = f[k].value; mudou(); }));
      const portes = el('div', { class: 'linha-portes' }, m.portes.map((p, k) => {
        if (p.ate == null) return el('span', { class: 'etiqueta' }, 'Porte ' + p.id + ': acima de ' + n0(m.portes[k - 1] ? m.portes[k - 1].ate : 0, 0));
        const inp = el('input', { type: 'number', min: 1, value: p.ate, class: 'campo-num', 'aria-label': 'Limite do porte ' + p.id });
        inp.addEventListener('change', () => { p.ate = Number(inp.value) || p.ate; recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); });
        return el('label', { class: 'check-linha' }, 'Porte ' + p.id + ' até ', inp, ' hab.');
      }));
      const usar = el('input', { type: 'checkbox', checked: !!m.fator.usar });
      const cat = sel([['', 'Escolha a categoria de despesa…'], ...cats.map((k) => [k.id, k.nome])], m.fator.categoria || '');
      const fmin = el('input', { type: 'number', min: 0, step: '0.1', value: m.fator.min, class: 'campo-num' }), fmax = el('input', { type: 'number', min: 1, step: '0.1', value: m.fator.max, class: 'campo-num' });
      const anosBox = el('div', { class: 'botoes-linha' }, Array.from({ length: anoAtual - 2022 }, (_, k) => anoAtual - 1 - k).filter((a) => a >= 2023).map((a) => {
        const ck = el('input', { type: 'checkbox', checked: m.fator.anos.includes(a) });
        ck.addEventListener('change', () => { m.fator.anos = ck.checked ? [...new Set([...m.fator.anos, a])] : m.fator.anos.filter((x) => x !== a); });
        return el('label', { class: 'check-linha' }, ck, ' ' + a);
      }));
      const aplicar = async () => { m.fator.usar = usar.checked; m.fator.categoria = cat.value || null; m.fator.min = Number(fmin.value) || 1; m.fator.max = Number(fmax.value) || 4; ctx = await contexto(est); recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); toast('Fator recalculado.'); };
      return [
        el('div', { class: 'grade-campos' }, campo('ed-t', 'Título', f.t, null, true), campo('ed-p', 'Processo administrativo', f.p)), campo('ed-o', 'Objeto', f.o),
        el('h3', null, 'Porte populacional'), el('p', { class: 'ajuda' }, 'População: estimativa do IBGE (' + ((ctx.entes.find((o) => o.populacao) || {}).populacao || {}).ano + '). Dá para corrigir a população de um ente na aba Entes.'), portes,
        el('h3', null, 'Ajuste pelo consumo efetivo (TCE-RN)'),
        el('p', { class: 'ajuda' }, 'Fator do ente = consumo médio anual empenhado na categoria ÷ valor-base do porte (quantidades do modelo por eventos × preço de referência), limitado entre o mínimo e o máximo. Vale só para os itens do "Modelo por eventos".'),
        el('label', { class: 'check-linha' }, usar, ' Usar o fator de consumo'), campo('ed-cat', 'Categoria de despesa', cat, el('a', { class: 'link', href: '#etpconsumo' }, 'Ver e ajustar as categorias e os empenhos')),
        el('div', { class: 'filtros-linha' }, el('div', { class: 'campo' }, el('label', null, 'Anos da média (fechados)'), anosBox), campo('ed-min', 'Fator mínimo', fmin), campo('ed-max', 'Fator máximo', fmax),
          el('div', { class: 'campo' }, el('button', { type: 'button', class: 'btn btn-claro', onclick: aplicar }, 'Aplicar'))),
        el('p', null, 'Valor-base por porte: ', m.portes.map((p) => 'Porte ' + p.id + ' ' + rs(R.valorBase[p.id])).join(' · '), !Object.values(R.valorBase).some(Boolean) ? el('span', { class: 'ajuda' }, ' (dê preço aos itens do modelo por eventos na aba Preços)') : null),
      ];
    };

    // ----- aba Entes
    const abaEntes = () => {
      const lista = ctx.entes.filter((o) => o.ativo !== false || (m.entes[o.id] || {}).incluir);
      const exportar = () => xlsx('Entes - ' + est.titulo + '.xlsx', [['Entes', [['Ente', 'UF', 'Vínculo', 'Incluído', 'População', 'Porte', 'Consumo médio (R$)', 'Valor-base do porte (R$)', 'Fator'],
        ...lista.map((o) => { const x = R.info[o.id]; return [o.nome, o.uf, o.vinculo || '', x ? 'Sim' : 'Não', x ? x.pop : (o.populacao || {}).populacao, x ? x.porte : '', x ? x.consumo : '', x ? R.valorBase[x.porte] : '', x ? x.fator : '']; })], [40, 5, 14, 9, 11, 7, 16, 18, 8]]]);
      return [el('div', { class: 'barra-lista' }, el('span', { class: 'ajuda' }, Object.keys(R.info).length + ' ente(s) na estimativa. Só os consorciados entram pela demanda do ETP na IRP (art. 8º, § 3º).'),
          el('div', { class: 'botoes-linha' },
            pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: async () => {
              const r = await escolherEntes(ctx.entes.filter((o) => o.ativo !== false || (m.entes[o.id] || {}).incluir), ctx.entes.filter((o) => (m.entes[o.id] || {}).incluir).map((o) => o.id));
              if (!r) return;
              ctx.entes.forEach((o) => { m.entes[o.id] = Object.assign(m.entes[o.id] || {}, { incluir: r.includes(o.id) }); });
              m.abrangencia = 'escolhidos'; recalc(); mudou(); redesenhar('entes', 'qtd', 'res');
            } }, 'Escolher entes…') : null,
            pode() ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { lista.forEach((o) => { m.entes[o.id] = Object.assign(m.entes[o.id] || {}, { incluir: o.vinculo === 'consorciado' }); }); m.abrangencia = 'consorciados'; recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); } }, 'Só os consorciados') : null,
            pode() ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { lista.forEach((o) => { m.entes[o.id] = Object.assign(m.entes[o.id] || {}, { incluir: o.ativo !== false }); }); m.abrangencia = 'todos'; recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); } }, 'Todos os ativos') : null,
            el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: exportar }, 'Exportar Excel'))),
        tabela(['', 'Ente', 'Vínculo', 'População', 'Porte', 'Consumo médio', 'Fator'], lista.map((o) => {
          const cfg = m.entes[o.id] = m.entes[o.id] || {};
          const x = R.info[o.id];
          const ck = el('input', { type: 'checkbox', checked: !!cfg.incluir, disabled: !pode() });
          ck.addEventListener('change', () => { cfg.incluir = ck.checked; recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); });
          const pop = el('input', { type: 'number', min: 0, value: cfg.populacao != null ? cfg.populacao : '', placeholder: o.populacao ? String(o.populacao.populacao) : 'sem dado', class: 'campo-num', disabled: !pode() });
          pop.addEventListener('change', () => { cfg.populacao = pop.value === '' ? null : Number(pop.value); recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); });
          const porte = sel([['', 'Auto'], ...m.portes.map((p) => [p.id, p.id])], cfg.porte || ''); porte.disabled = !pode();
          porte.addEventListener('change', () => { cfg.porte = porte.value || null; recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); });
          const fat = el('input', { type: 'number', min: 0, step: '0.01', value: cfg.fator != null ? cfg.fator : '', placeholder: x ? n0(x.fator) : '', class: 'campo-num', disabled: !pode() });
          fat.addEventListener('change', () => { cfg.fator = fat.value === '' ? null : Number(fat.value); recalc(); mudou(); redesenhar('entes', 'qtd', 'res'); });
          return el('tr', { class: x ? '' : 'linha-fora' }, el('td', null, ck), el('td', null, o.nome, el('div', { class: 'ajuda' }, o.uf || '')),
            el('td', null, o.vinculo ? el('span', { class: 'etiqueta' + (o.vinculo === 'consorciado' ? ' etiqueta-ativo' : '') }, o.vinculo.replace('_', ' ')) : el('span', { class: 'etiqueta etiqueta-pendente' }, 'a definir')),
            el('td', null, pop), el('td', null, porte, x ? el('div', { class: 'ajuda' }, 'usa ' + x.porte) : null),
            el('td', { class: 'num' }, x && x.consumo != null ? rs(x.consumo) : '—'),
            el('td', null, fat, x && x.fator !== 1 ? el('div', { class: 'ajuda' }, (x.fatorManual ? 'à mão' : 'calculado') + ': ' + n0(x.fator)) : null));
        }))];
    };

    // ----- aba Itens
    const dialogoItem = (it, nova) => {
      const f = { lote: txt(it.lote || '', { maxlength: 60 }), desc: area(it.descricao || '', { rows: 3 }), un: txt(it.unidade || 'Unidade', { maxlength: 40 }), met: sel(Object.entries(METODOS), it.metodo || 'eventos'), extra: el('input', { type: 'number', min: 0, step: 'any', value: it.extra || '', class: 'campo-num' }) };
      const cfgBox = el('div');
      const tmp = JSON.parse(JSON.stringify(it));
      const desenharCfg = () => {
        const mt = f.met.value;
        if (mt === 'eventos') {
          const pd = el('input', { type: 'checkbox', checked: !!tmp.porDia }); pd.addEventListener('change', () => { tmp.porDia = pd.checked; });
          rc(cfgBox, el('p', { class: 'ajuda' }, 'Quantidade do item em cada evento-tipo (o calendário e as frequências por porte ficam na aba Modelo).'),
            el('label', { class: 'check-linha' }, pd, ' Multiplicar pelos dias de cada evento (itens em diárias)'),
            tabela(['Evento-tipo', 'Quantidade por evento'], m.tipos.map((t) => { const inp = el('input', { type: 'number', min: 0, step: 'any', value: (tmp.kit || {})[t.cod] || '', class: 'campo-num' }); inp.addEventListener('input', () => { tmp.kit = tmp.kit || {}; tmp.kit[t.cod] = Number(inp.value) || 0; }); return el('tr', null, el('td', null, t.cod + ' – ' + t.nome), el('td', null, inp)); })));
        } else if (mt === 'historico') {
          const anos = el('div', { class: 'botoes-linha' }, Array.from({ length: anoAtual - 2022 }, (_, k) => anoAtual - k).map((a) => { const ck = el('input', { type: 'checkbox', checked: (tmp.anos || [anoAtual - 3, anoAtual - 2, anoAtual - 1]).includes(a) }); ck.addEventListener('change', () => { const atual = tmp.anos || [anoAtual - 3, anoAtual - 2, anoAtual - 1]; tmp.anos = ck.checked ? [...new Set([...atual, a])] : atual.filter((x) => x !== a); }); return el('label', { class: 'check-linha' }, ck, ' ' + a); }));
          const base = sel([['homologada', 'Homologada (quando houver)'], ['licitada', 'Licitada']], tmp.base || 'homologada'); base.addEventListener('change', () => { tmp.base = base.value; });
          const est2 = sel([['media', 'Média anual'], ['maximo', 'Maior ano']], tmp.estat || 'media'); est2.addEventListener('change', () => { tmp.estat = est2.value; });
          const coef = el('input', { type: 'number', min: 0, step: 'any', value: tmp.coef || 1, class: 'campo-num' }); coef.addEventListener('input', () => { tmp.coef = Number(coef.value) || 1; });
          const resumo = el('p', { class: 'ajuda' }, (tmp.series || []).length + ' série(s) escolhida(s).');
          rc(cfgBox, el('p', { class: 'msg msg-falta' }, 'Atenção: quantidades de ata costumam superestimar o consumo. Use com o ajuste (coeficiente) ou compare com o consumo empenhado.'),
            el('div', null, resumo, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => escolherSeries(tmp, [...new Set(ctx.entes.flatMap((o) => o.cnpjs))], () => { resumo.textContent = (tmp.series || []).length + ' série(s) escolhida(s).'; }) }, 'Escolher séries')),
            el('div', { class: 'campo' }, el('label', null, 'Anos'), anos), el('div', { class: 'grade-campos' }, campo('di-b', 'Quantidade', base), campo('di-e', 'Estatística', est2), campo('di-c', 'Coeficiente (ajuste)', coef)));
        } else if (mt === 'indicador') {
          const ops = [['populacao', 'População (IBGE)'], ...indicadores.map((i) => [String(i.id), i.nome])];
          const ind = sel(ops, String(tmp.indicador || 'populacao'));
          const coef = el('input', { type: 'number', min: 0, step: 'any', value: tmp.coef || 1, class: 'campo-num' });
          const filtro = el('input', { type: 'search', placeholder: 'Filtrar indicadores (ex.: fundamental municipal)' });
          filtro.addEventListener('input', () => { const t = normal(filtro.value); [...ind.options].forEach((o) => { o.hidden = t && !normal(o.textContent).includes(t); }); });
          const upd = () => { tmp.indicador = ind.value; tmp.indicadorNome = ind.options[ind.selectedIndex].textContent; tmp.coef = Number(coef.value) || 1; };
          ind.addEventListener('change', upd); coef.addEventListener('input', upd); upd();
          rc(cfgBox, el('p', { class: 'ajuda' }, 'Quantidade do ente = indicador × coeficiente, arredondada para cima. Censo Escolar (INEP) por município, via IBGE: matrículas por etapa e rede, docentes e escolas.' + (indicadores.length ? '' : ' Os indicadores do Censo ainda estão sendo lidos.')),
            campo('di-f', 'Filtrar', filtro), campo('di-i', 'Indicador', ind), campo('di-k', 'Coeficiente (ex.: 1 kit por aluno = 1; 2 refeições por aluno por dia × 200 dias = 400)', coef));
        } else rc(cfgBox, el('p', { class: 'ajuda' }, 'Digite as quantidades de cada ente na aba Quantidades.'));
      };
      f.met.addEventListener('change', desenharCfg); desenharCfg();
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar item');
      const d = abrirDialogo(nova ? 'Novo item' : 'Item ' + (m.itens.indexOf(it) + 1), el('div', null,
        el('div', { class: 'grade-campos' }, campo('di-l', 'Lote', f.lote), campo('di-u', 'Unidade', f.un, null, true)), campo('di-d', 'Descrição', f.desc, null, true),
        campo('di-m', 'Método de estimativa', f.met), cfgBox, campo('di-x', 'Quantidade extra (outros participantes, ex.: o próprio consórcio)', f.extra)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', async () => {
        if (!N.marcarErro(f.desc, f.desc.value.trim() ? '' : 'Informe a descrição.')) return;
        Object.assign(it, tmp, { lote: f.lote.value.trim(), descricao: f.desc.value.trim(), unidade: f.un.value.trim() || 'Unidade', metodo: f.met.value, extra: Number(f.extra.value) || 0 });
        if (nova) { it.id = it.id || uid(); m.itens.push(it); }
        d.close(); ctx = await contexto(est); recalc(); mudou(); redesenhar('itens', 'qtd', 'precos', 'res', 'dados');
      });
    };
    const colarItens = () => {
      const t = area('', { rows: 10, placeholder: 'Lote<TAB>Descrição<TAB>Unidade (uma linha por item, copiada do Excel)' });
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir');
      const d = abrirDialogo('Colar itens', el('div', null, el('p', null, 'Cole as colunas Lote, Descrição e Unidade (ou só Descrição e Unidade). Depois escolha o método de cada item.'), campo('ci-t', 'Itens', t)),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', () => {
        const novos = linhas(t.value.replace(/;/g, ',')).map((l) => { const cs = l.split('\t').map((x) => x.trim()); return cs.length >= 3 ? { lote: cs[0], descricao: cs[1], unidade: cs[2] } : { lote: '', descricao: cs[0], unidade: cs[1] || 'Unidade' }; }).filter((x) => x.descricao);
        novos.forEach((x) => m.itens.push({ id: uid(), metodo: 'eventos', kit: {}, ...x }));
        d.close(); recalc(); mudou(); redesenhar('itens', 'qtd', 'precos', 'res'); toast(novos.length + ' item(ns) incluído(s).');
      });
    };
    const abaItens = () => [
      el('div', { class: 'barra-lista' }, el('span', { class: 'ajuda' }, m.itens.length + ' item(ns).'),
        pode() ? el('div', { class: 'botoes-linha' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: colarItens }, 'Colar itens'), el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => dialogoItem({ metodo: 'eventos', kit: {} }, true) }, '+ Item')) : null),
      m.itens.length ? tabela(['Nº', 'Lote', 'Descrição', 'Unid.', 'Método', 'Total', 'Preço ref.', ''], m.itens.map((it, k) => el('tr', null,
        el('td', { class: 'num' }, k + 1), el('td', null, it.lote || '—'), el('td', { class: 'texto-longo' }, it.descricao), el('td', null, it.unidade),
        el('td', null, METODOS[it.metodo] || it.metodo, it.metodo === 'historico' ? el('div', { class: 'ajuda' }, (it.series || []).length + ' série(s)') : it.metodo === 'indicador' ? el('div', { class: 'ajuda' }, (it.indicadorNome || '').slice(-60)) : null),
        el('td', { class: 'num' }, n0(R.total[it.id], 0)), el('td', { class: 'num' }, it.preco && it.preco.valor ? rs(it.preco.valor) : '—'),
        el('td', { class: 'acoes' }, pode() ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoItem(it, false) }, 'Editar'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { if (k > 0) { m.itens.splice(k - 1, 0, m.itens.splice(k, 1)[0]); mudou(); redesenhar('itens', 'qtd', 'res'); } } }, '↑'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: async () => { if (!(await confirmar('Excluir item', 'Excluir "' + it.descricao.slice(0, 60) + '"?', 'Excluir', true))) return; m.itens.splice(k, 1); recalc(); mudou(); redesenhar('itens', 'qtd', 'precos', 'res'); } }, 'Excluir')] : null))))
        : el('p', { class: 'vazio' }, 'Nenhum item. Use "+ Item" ou "Colar itens".')];

    // ----- aba Modelo (eventos-tipo)
    const abaModelo = () => {
      const linha = (t, k) => {
        const cod = txt(t.cod, { maxlength: 4, class: 'campo-curto' }), nome = txt(t.nome, { maxlength: 120 }), dias = el('input', { type: 'number', min: 1, value: t.dias || 1, class: 'campo-num' });
        const fq = m.portes.map((p) => { const inp = el('input', { type: 'number', min: 0, step: 'any', value: (t.freq || {})[p.id] || 0, class: 'campo-num' }); inp.addEventListener('change', () => { t.freq = t.freq || {}; t.freq[p.id] = Number(inp.value) || 0; recalc(); mudou(); redesenhar('qtd', 'res'); }); return inp; });
        cod.addEventListener('change', () => { const velho = t.cod; t.cod = cod.value.trim() || velho; m.itens.forEach((i) => { if (i.kit && velho in i.kit && velho !== t.cod) { i.kit[t.cod] = i.kit[velho]; delete i.kit[velho]; } }); mudou(); });
        nome.addEventListener('change', () => { t.nome = nome.value; mudou(); });
        dias.addEventListener('change', () => { t.dias = Number(dias.value) || 1; recalc(); mudou(); redesenhar('qtd', 'res'); });
        return el('tr', null, el('td', null, cod), el('td', null, nome), el('td', null, dias), ...fq.map((x) => el('td', null, x)),
          el('td', null, pode() ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { m.tipos.splice(k, 1); recalc(); mudou(); redesenhar('modelo', 'qtd', 'res'); } }, 'Excluir') : null));
      };
      return [el('p', { class: 'ajuda' }, 'Calendário anual de eventos-tipo: quantas vezes por ano cada porte de município realiza o evento. Quantidade do item = Σ frequência × quantidade por evento (× dias, quando o item é em diárias), arredondada para cima, × fator de consumo.'),
        tabela(['Código', 'Evento-tipo', 'Dias', ...m.portes.map((p) => 'Vezes/ano porte ' + p.id), ''], m.tipos.map(linha)),
        pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => { const cods = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'; const cod = [...cods].find((x) => !m.tipos.some((t) => t.cod === x)) || 'X' + m.tipos.length; m.tipos.push({ cod, nome: '', dias: 1, freq: {} }); mudou(); redesenhar('modelo'); } }, '+ Evento-tipo') : null];
    };

    // ----- aba Quantidades (por ente)
    const abaQtd = () => {
      const entes = R.entes;
      if (!m.itens.length || !entes.length) return el('p', { class: 'vazio' }, 'Inclua itens e entes para ver as quantidades.');
      return [el('p', { class: 'ajuda' }, 'Passe o mouse sobre uma quantidade para ver a memória de cálculo. Digite um número para ajustar à mão (fica em destaque); apague para voltar ao calculado.'),
        el('div', { class: 'tabela-rolagem' }, el('table', { class: 'tabela tabela-edicao tabela-qtd' },
          el('thead', null, el('tr', null, el('th', null, 'Item'), ...entes.map((o) => el('th', { title: o.nome }, o.nome.replace(/^Munic[ií]pio de\s+/i, '').replace(/\/[A-Z]{2}$/, ''))), el('th', null, 'Extra'), el('th', null, 'Total'))),
          el('tbody', null, m.itens.map((it, k) => el('tr', null, el('th', { class: 'texto-longo', title: it.descricao }, (k + 1) + '. ' + it.descricao.slice(0, 50) + (it.descricao.length > 50 ? '…' : '') + ' (' + it.unidade + ')'),
            ...entes.map((o) => {
              const aj = ((m.ajustes || {})[it.id] || {})[o.id];
              const manual = it.metodo === 'manual';
              const inp = el('input', { type: 'number', min: 0, step: 'any', value: manual ? ((it.manual || {})[o.id] || '') : aj != null ? aj : '', placeholder: String(R.qtd[it.id][o.id]), title: R.memo[it.id][o.id], class: 'campo-num' + (aj != null && !manual ? ' ajustado' : ''), disabled: !pode() });
              inp.addEventListener('change', () => {
                if (manual) { it.manual = it.manual || {}; it.manual[o.id] = inp.value === '' ? 0 : Number(inp.value); }
                else { m.ajustes[it.id] = m.ajustes[it.id] || {}; if (inp.value === '') delete m.ajustes[it.id][o.id]; else m.ajustes[it.id][o.id] = Number(inp.value); inp.classList.toggle('ajustado', inp.value !== ''); }
                recalc(); mudou(); tot[k].textContent = n0(R.total[it.id], 0); redesenhar('res');
              });
              return el('td', null, inp);
            }), el('td', { class: 'num' }, n0(it.extra || 0, 0)), (tot[k] = el('td', { class: 'num' }, el('strong', null, n0(R.total[it.id], 0))))))))) ];
    };
    const tot = [];

    // ----- aba Preços (pesquisa de preços por item, art. 23)
    const abaPrecos = () => {
      const c0 = criterios(m.precos);
      const fMet = sel([['', 'Critérios próprios desta estimativa'], ...metodologias.map((x) => [x.id, x.nome + (x.padrao ? ' (padrão)' : '')])], m.precos.metodologia_id || '');
      fMet.disabled = !pode();
      fMet.addEventListener('change', () => {
        const x = metodologias.find((y) => y.id === fMet.value);
        if (x) m.precos = Object.assign(criterios(x.params), { metodologia_id: x.id, metodologia_nome: x.nome, texto: x.texto });
        else m.precos = Object.assign(criterios(m.precos), { metodologia_id: null, metodologia_nome: null });
        mudou(); redesenhar('precos', 'res');
      });
      const resumo = [Number(c0.janela_meses) > 0 ? 'últimos ' + c0.janela_meses + ' meses' : 'sem limite de período', c0.ipca ? 'IPCA' : 'sem correção',
        c0.criterio === 'percentual' ? 'exclui fora de ' + c0.abaixo + '%–' + c0.acima + '% da mediana' : c0.criterio === 'desvio' ? 'exclui fora de ±' + c0.desvios + ' desvio(s)-padrão' : 'sem exclusão',
        'referência: ' + ({ mediana: 'mediana', media: 'média', menor: 'menor preço', cv: 'média se CV ≤ ' + c0.cv_limite + '%, senão mediana' })[c0.referencia], 'mínimo ' + c0.min_precos + ' preços'].join(' · ');
      return [el('p', { class: 'ajuda' }, 'Fonte: preços homologados no PNCP (art. 23, § 1º, II, da Lei nº 14.133/2021) das séries escolhidas para cada item. IPCA disponível até ' + mesBR(ipca.length ? ipca[ipca.length - 1].mes : null) + '.'),
        el('div', { class: 'filtros-linha' }, campo('pr-met', 'Metodologia de pesquisa de preços', fMet), el('div', { class: 'campo' }, el('a', { class: 'link', href: '#etpmetodologias' }, 'Ver e editar as metodologias'))),
        el('p', { class: 'msg msg-info' }, resumo),
        m.itens.length ? tabela(['Nº', 'Item', 'Séries', 'Preços válidos', 'Referência', 'Fonte', ''], m.itens.map((it, k) => el('tr', null,
          el('td', { class: 'num' }, k + 1), el('td', { class: 'texto-longo' }, it.descricao, el('div', { class: 'ajuda' }, it.unidade)),
          el('td', { class: 'num' }, (it.series || []).length), el('td', { class: 'num' }, it.preco && it.preco.n != null ? it.preco.n : '—', it.preco && it.preco.n != null && it.preco.n < c0.min_precos ? el('div', { class: 'aviso-etp' }, 'abaixo do mínimo') : null),
          el('td', { class: 'num' }, it.preco && it.preco.valor ? el('strong', null, rs(it.preco.valor)) : '—'),
          el('td', null, it.preco ? (it.preco.fonte === 'manual' ? 'Informado à mão' : 'Pesquisa PNCP' + (it.preco.refMes && c0.ipca ? ' (IPCA até ' + mesBR(it.preco.refMes) + ')' : '')) : '—'),
          el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoPrecos(it) }, 'Pesquisar'))))) : el('p', { class: 'vazio' }, 'Inclua itens primeiro.')];
    };
    const dialogoPrecos = async (it) => {
      const corpo = el('div');
      const d = abrirDialogo('Pesquisa de preços – ' + it.descricao.slice(0, 80), corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Fechar')], true);
      d.classList.add('dialogo-importar');
      const desenhar = async () => {
        if (!(it.series || []).length) {
          rc(corpo, el('p', { class: 'msg msg-falta' }, 'Escolha as séries do histórico que correspondem a este item.'), pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => escolherSeries(it, [...new Set(ctx.entes.flatMap((o) => o.cnpjs))], () => { mudou(); desenhar(); }) }, 'Escolher séries') : null, manualBox());
          return;
        }
        carregando(corpo, 'Buscando os preços…');
        let pesq = []; try { pesq = await D.etpPesquisas(); } catch (e) { }
        const cm = criterios(m.precos);
        const cnpjs = [...new Set([...(cm.fontes.entes ? ctx.entes.flatMap((o) => o.cnpjs) : []), ...(cm.fontes.ampliadas ? pesq.filter((p) => (it.pesquisas || []).includes(p.id)).flatMap((p) => p.cnpjs) : [])])];
        let obs = [];
        try { obs = await D.etpPrecos(it.series, cnpjs); } catch (e) { rc(corpo, el('p', { class: 'msg msg-erro' }, e.message)); return; }
        const cfg = Object.assign({}, m.precos, { excluidos: it.excluidos || [] });
        const { lista, res } = analisarPrecos(obs, cfg, ipca);
        const usar = el('button', { type: 'button', class: 'btn btn-primario', disabled: !res.valor || !pode() }, 'Usar ' + (res.valor ? rs(res.valor) : '—') + ' como referência');
        usar.addEventListener('click', () => { it.preco = { valor: Math.round(res.valor * 100) / 100, n: res.n, mediana: res.mediana, media: res.media, menor: res.menor, cv: res.cv, regra: res.regra, refMes: res.refMes, fonte: 'pesquisa', criterio: criterios(m.precos), data: new Date().toISOString().slice(0, 10) }; it.cotacoes = lista.map((o) => ({ orgao: o.orgao, uf: o.uf, data: o.data, compra: o.compra, link: o.link, descricao: o.descricao.slice(0, 200), unidade: o.unidade, valor: o.valor, corrigido: o.corrigido, fornecedor: o.fornecedor, situacao: o.situacao })); recalc(); mudou(); redesenhar('precos', 'res', 'dados', 'itens'); toast('Preço de referência definido.'); d.close(); });
        rc(corpo,
          el('div', { class: 'resumo-precos' }, el('span', null, el('strong', null, res.n), ' preço(s) válido(s) de ', lista.length), el('span', null, 'Mediana ', el('strong', null, rs(res.mediana))), el('span', null, 'Média ', el('strong', null, rs(res.media))), el('span', null, 'Menor ', el('strong', null, rs(res.menor))), res.cv != null ? el('span', null, 'CV ', el('strong', null, n0(res.cv, 1) + '%')) : null, el('span', null, 'Referência: ', el('strong', null, ({ mediana: 'mediana', media: 'média', menor: 'menor preço' })[res.regra]))),
          !res.suficiente ? el('p', { class: 'msg msg-falta' }, 'Menos de ' + criterios(m.precos).min_precos + ' preços válidos. Amplie a pesquisa (pesquisa ampliada no PNCP ou metodologia com período maior) ou complemente com outras fontes do art. 23 (cotações, painel de preços).') : null,
          el('div', { class: 'botoes-linha mb-1' }, pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => escolherSeries(it, [...new Set(ctx.entes.flatMap((o) => o.cnpjs))], () => { mudou(); desenhar(); }) }, 'Trocar séries') : null, usar),
          lista.length ? el('div', { class: 'tabela-rolagem' }, tabela(['', 'Data', 'Órgão', 'Compra', 'Descrição', 'Unid.', 'Preço', 'Corrigido', 'Situação'], lista.map((o) => {
            const chave = o.item_id + '|' + o.fornecedor;
            const ck = el('input', { type: 'checkbox', checked: !(it.excluidos || []).includes(chave), disabled: !pode(), title: 'Desmarque para excluir este preço' });
            ck.addEventListener('change', () => { it.excluidos = ck.checked ? (it.excluidos || []).filter((x) => x !== chave) : [...new Set([...(it.excluidos || []), chave])]; mudou(); desenhar(); });
            return el('tr', { class: o.situacao === 'válido' ? '' : 'linha-fora' }, el('td', null, ck), el('td', null, dataBR(o.data)), el('td', null, o.orgao || '—', el('div', { class: 'ajuda' }, [o.municipio, o.uf].filter(Boolean).join('/'))),
              el('td', null, o.link ? el('a', { class: 'link', href: o.link, target: '_blank', rel: 'noopener' }, o.compra || 'PNCP') : o.compra), el('td', { class: 'texto-longo' }, o.descricao.slice(0, 180), o.fornecedor ? el('div', { class: 'ajuda' }, o.fornecedor) : null),
              el('td', null, o.unidade || '—'), el('td', { class: 'num' }, rs(o.valor)), el('td', { class: 'num' }, rs(o.corrigido)), el('td', null, el('span', { class: 'etiqueta ' + (o.situacao === 'válido' ? 'etiqueta-ativo' : 'etiqueta-rascunho') }, o.situacao)));
          }))) : el('p', { class: 'vazio' }, 'Nenhum preço homologado nas séries escolhidas.'),
          manualBox());
      };
      const manualBox = () => {
        if (!pode()) return null;
        const v = el('input', { type: 'number', min: 0, step: '0.01', value: it.preco && it.preco.fonte === 'manual' ? it.preco.valor : '', class: 'campo-num' });
        const o = txt(it.preco && it.preco.fonte === 'manual' ? it.preco.origem || '' : '', { maxlength: 200, placeholder: 'Fonte (ex.: cotação com 3 empresas, painel de preços)' });
        return el('details', { class: 'detalhe-entes mt-2' }, el('summary', null, 'Informar o preço à mão'), el('div', { class: 'filtros-linha' }, campo('pm-v', 'Preço (R$)', v), campo('pm-o', 'Fonte', o),
          el('div', { class: 'campo' }, el('button', { type: 'button', class: 'btn btn-claro', onclick: () => { if (!(Number(v.value) > 0)) { toast('Informe o preço.', true); return; } it.preco = { valor: Number(v.value), fonte: 'manual', origem: o.value.trim(), data: new Date().toISOString().slice(0, 10) }; recalc(); mudou(); redesenhar('precos', 'res', 'dados', 'itens'); d.close(); } }, 'Usar este preço'))));
      };
      desenhar();
    };

    // ----- aba Resultado
    const textoItem8 = () => {
      const ents = R.entes, cons = ents.filter((o) => o.vinculo === 'consorciado').length;
      const usa = (mt) => m.itens.some((i) => i.metodo === mt);
      const pop = ents.find((o) => o.populacao); const anoPop = pop && pop.populacao.ano;
      const cat = cats.find((k) => k.id === m.fator.categoria);
      const anosF = (m.fator.anos || []).filter((a) => a < anoAtual).sort();
      const p = [];
      p.push('8. Estimativa das quantidades a serem contratadas');
      p.push('Nos termos do art. 18, § 1º, IV, e do art. 40, III, da Lei nº 14.133/2021' + (N.normaTexto ? '' : '') + ', as quantidades foram estimadas para ' + (ents.length === 1 ? 'o ente ' + ents[0].nome : ents.length <= 5 ? 'os entes ' + ents.map((o) => o.nome).join(', ').replace(/, ([^,]*)$/, ' e $1') : ents.length + ' entes') + (!cons ? '' : ents.length === 1 ? ', consorciado, que participa do Sistema de Registro de Preços na condição de órgão participante com a demanda prevista neste ETP' : cons === ents.length ? ', todos consorciados, que participam do Sistema de Registro de Preços na condição de órgãos participantes com a demanda prevista neste ETP' : ', dos quais ' + cons + ' consorciado(s), que participam do Sistema de Registro de Preços na condição de órgãos participantes com a demanda prevista neste ETP') + ', conforme a técnica descrita a seguir.');
      const etapas = [];
      if (usa('eventos')) {
        etapas.push('classificação dos municípios em ' + m.portes.length + ' portes populacionais, segundo a estimativa populacional do IBGE' + (anoPop ? ' (' + anoPop + ')' : '') + ': ' + m.portes.map((x, k) => 'Porte ' + x.id + (x.ate == null ? ', acima de ' + n0(m.portes[k - 1].ate, 0) : ', até ' + n0(x.ate, 0)) + ' habitantes').join('; '));
        etapas.push('definição de um calendário anual de eventos-tipo (' + m.tipos.map((t) => t.nome.toLowerCase()).join('; ') + '), com a frequência de cada evento conforme o porte do município');
        etapas.push('definição da composição padrão de estruturas, equipamentos e serviços de cada evento-tipo e apuração da quantidade anual de cada item, por ente, pelo produto entre a frequência e a composição, arredondado para cima');
        if (m.fator.usar && cat) etapas.push('ajuste pelo consumo efetivo: com base nos empenhos de ' + anosF.join(' e ') + ' de cada município registrados no SIAI/TCE-RN (Anexo 14) na categoria "' + cat.nome + '", a estimativa de cada porte foi convertida em valor pelos preços de referência e comparada à média anual empenhada; nos municípios cujo consumo supera o padrão do porte, as quantidades foram multiplicadas pela razão entre o consumo e o padrão, limitada a ' + n0(m.fator.max) + '; nos demais, manteve-se o padrão do porte (fator mínimo ' + n0(m.fator.min) + ')');
      }
      if (usa('historico')) etapas.push('consideração do histórico de contratações dos entes publicadas no Portal Nacional de Contratações Públicas (PNCP), pela ' + (m.itens.some((i) => i.metodo === 'historico' && i.estat === 'maximo') ? 'maior quantidade anual' : 'média anual das quantidades') + ' contratadas nos anos analisados');
      if (usa('indicador')) etapas.push('dimensionamento pelos indicadores ' + [...new Set(m.itens.filter((i) => i.metodo === 'indicador').map((i) => (i.indicador === 'populacao' ? 'população estimada (IBGE)' : 'do Censo Escolar (INEP) – ' + (i.indicadorNome || '').split(' › ').slice(-3).join(' › '))))].join('; ') + ', multiplicados pelo coeficiente de consumo de cada item');
      if (usa('manual')) etapas.push('quantidades informadas pelos entes para os itens sem parâmetro objetivo');
      etapas.forEach((e, k) => p.push(String.fromCharCode(97 + k) + ') ' + e + (k < etapas.length - 1 ? ';' : '.')));
      if (Object.values(m.ajustes || {}).some((x) => Object.keys(x).length)) p.push('Algumas quantidades foram ajustadas pontualmente, conforme indicado na memória de cálculo.');
      if (m.itens.some((i) => i.extra)) p.push('Foram incluídas, ainda, quantidades de outros participantes, indicadas na coluna "Extra" do quadro consolidado.');
      const comPreco = m.itens.filter((i) => i.preco && i.preco.fonte === 'pesquisa');
      if (comPreco.length) p.push(textoMetodologia(m.precos.texto || (metodologias.find((x) => x.padrao) || {}).texto || 'A pesquisa de preços observou o art. 23 da Lei nº 14.133/2021, com preços homologados no PNCP {JANELA}. {IPCA} {CRITERIO} O valor de referência corresponde {REFERENCIA} dos preços válidos.', m.precos));
      const manuais = m.itens.filter((i) => i.preco && i.preco.fonte === 'manual');
      if (manuais.length) p.push('Para ' + manuais.length + ' item(ns), o preço de referência foi obtido por outras fontes do art. 23, § 1º, conforme indicado no Anexo (' + [...new Set(manuais.map((i) => i.preco.origem).filter(Boolean))].join('; ') + ').');
      p.push('A memória de cálculo, os parâmetros adotados e a distribuição dos quantitativos por órgão participante constam do Anexo (Planilha de Estimativa de Quantitativos), que integra este ETP.');
      p.push('Por se tratar de registro de preços, os quantitativos ora estimados representam as quantidades máximas a serem registradas (art. 82, I, da Lei nº 14.133/2021) e não geram obrigação de contratação, podendo ser ajustados no Termo de Referência após a validação junto aos entes.');
      return p.join('\n\n');
    };
    const exportarTudo = () => {
      const ents = R.entes;
      const nm = (o) => o.nome.replace(/^Munic[ií]pio de\s+/i, '');
      xlsx('Estimativa - ' + est.titulo + '.xlsx', [
        ['Consolidado', [['Item', 'Lote', 'Descrição', 'Unidade', 'Método', 'Entes', 'Extra', 'Total', 'Preço de referência (R$)', 'Valor estimado (R$)'],
          ...m.itens.map((it, k) => { const s = Object.values(R.qtd[it.id]).reduce((a, b) => a + b, 0); return [k + 1, it.lote || '', it.descricao, it.unidade, METODOS[it.metodo], s, Number(it.extra || 0), R.total[it.id], it.preco ? it.preco.valor : null, it.preco ? R.total[it.id] * it.preco.valor : null]; })], [6, 18, 60, 10, 22, 10, 8, 10, 14, 16]],
        ['Por ente', [['Item', 'Descrição', 'Unidade', ...ents.map(nm), 'Extra', 'Total'], ['', 'População', '', ...ents.map((o) => R.info[o.id].pop), '', ''], ['', 'Porte', '', ...ents.map((o) => R.info[o.id].porte), '', ''], ['', 'Fator', '', ...ents.map((o) => Math.round(R.info[o.id].fator * 100) / 100), '', ''],
          ...m.itens.map((it, k) => [k + 1, it.descricao, it.unidade, ...ents.map((o) => R.qtd[it.id][o.id]), Number(it.extra || 0), R.total[it.id]])], [6, 50, 10, ...ents.map(() => 12), 8, 10]],
        ['Parâmetros', [['Portes'], ...m.portes.map((p, k) => ['Porte ' + p.id, p.ate == null ? 'acima de ' + m.portes[k - 1].ate : 'até ' + p.ate + ' hab.', 'Valor-base (R$)', R.valorBase[p.id]]), [],
          ['Evento-tipo', 'Nome', 'Dias', ...m.portes.map((p) => 'Vezes/ano ' + p.id)], ...m.tipos.map((t) => [t.cod, t.nome, t.dias, ...m.portes.map((p) => Number((t.freq || {})[p.id] || 0))]), [],
          ['Item', 'Descrição', 'Por dia?', ...m.tipos.map((t) => 'Qtd/evento ' + t.cod)], ...m.itens.filter((i) => i.metodo === 'eventos').map((it) => [m.itens.indexOf(it) + 1, it.descricao, it.porDia ? 'Sim' : 'Não', ...m.tipos.map((t) => Number((it.kit || {})[t.cod] || 0))]), [],
          ['Fator de consumo', m.fator.usar ? 'Sim' : 'Não', 'Categoria', (cats.find((k) => k.id === m.fator.categoria) || {}).nome || '', 'Anos', (m.fator.anos || []).join(', '), 'Mín.', m.fator.min, 'Máx.', m.fator.max]], [12, 50, 14, 14, 14, 14, 14, 14]],
        ['Entes', [['Ente', 'UF', 'Vínculo', 'População', 'Porte', 'Consumo médio (R$)', 'Valor-base (R$)', 'Fator'], ...ents.map((o) => { const x = R.info[o.id]; return [o.nome, o.uf, o.vinculo || '', x.pop, x.porte, x.consumo, R.valorBase[x.porte], x.fator]; })], [40, 5, 14, 11, 7, 16, 16, 8]],
        ['Memória', [['Item', 'Descrição', 'Ente', 'Quantidade', 'Memória de cálculo'], ...m.itens.flatMap((it, k) => ents.map((o) => [k + 1, it.descricao, o.nome, R.qtd[it.id][o.id], R.memo[it.id][o.id]]))], [6, 40, 36, 10, 90]],
        ['Metodologia de preços', [['Metodologia', m.precos.metodologia_nome || 'Critérios próprios'], ['Texto', textoMetodologia(m.precos.texto || TEXTO_PADRAO_MET, m.precos)]], [24, 140]],
        ['Pesquisa de preços', [['Item', 'Descrição', 'Data', 'Órgão', 'UF', 'Compra', 'Descrição no PNCP', 'Unidade', 'Preço (R$)', 'Corrigido IPCA (R$)', 'Situação', 'Contratado', 'Link'],
          ...m.itens.flatMap((it, k) => (it.cotacoes || []).map((o) => [k + 1, it.descricao, dataBR(o.data), o.orgao, o.uf, o.compra, o.descricao, o.unidade, Number(o.valor), Math.round(o.corrigido * 100) / 100, o.situacao, o.fornecedor, o.link]))], [6, 30, 11, 30, 5, 18, 50, 10, 12, 14, 14, 30, 40]],
      ]);
    };
    const lancarIrp = async () => {
      if (!m.itens.length) { toast('Inclua itens primeiro.', true); return; }
      await salvar(true);
      let B;
      try { B = await D.carregarIrp(); } catch (e) { toast(e.message, true); return; }
      const irps = (B.irps || []).filter((i) => ['rascunho', 'aberta'].includes(i.situacao)).sort((a, b) => b.ano - a.ano || b.numero - a.numero);
      const fI = sel([['', 'Criar uma IRP nova'], ...irps.map((i) => [i.id, 'IRP ' + String(i.numero).padStart(3, '0') + '/' + i.ano + ' · ' + (i.situacao === 'rascunho' ? 'rascunho' : 'aberta') + ' · ' + (i.objeto || '').slice(0, 60)])], est.irp_id && irps.some((i) => i.id === est.irp_id) ? est.irp_id : '');
      const fP = txt(est.processo || '', { maxlength: 60 }), fO = area(est.objeto || est.titulo, { rows: 2 });
      const novaBox = el('div', null, campo('li-p', 'Processo administrativo', fP, null, true), campo('li-o', 'Objeto', fO, null, true));
      const ckEtp = el('input', { type: 'checkbox', checked: true });
      fI.addEventListener('change', () => { novaBox.hidden = !!fI.value; });
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Lançar');
      const cons = R.entes.filter((o) => o.vinculo === 'consorciado');
      const d = abrirDialogo('Lançar na IRP', el('div', null,
        el('p', null, 'Os ' + m.itens.length + ' item(ns) entram na IRP com a quantidade total na coluna "Qtd. estimada pelo consórcio". Se a IRP já estiver aberta, os itens não podem ser incluídos: escolha uma em rascunho ou crie uma nova.'),
        campo('li-i', 'IRP', fI), novaBox,
        el('label', { class: 'check-linha' }, ckEtp, ' Lançar também a demanda do ETP de cada ente consorciado (' + cons.length + ' ente(s); art. 8º, § 3º)'),
        cons.length < R.entes.length ? el('p', { class: 'ajuda' }, (R.entes.length - cons.length) + ' ente(s) da estimativa não estão marcados como consorciados no Cadastro e não entram pela demanda do ETP.') : null),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', async () => {
        ocupado(b, 'Lançando…');
        try {
          let irpId = fI.value, irp = irps.find((i) => i.id === irpId);
          if (!irpId) {
            if (!fP.value.trim() || !fO.value.trim()) { toast('Informe processo e objeto.', true); ocupado(b); return; }
            irpId = await D.criarIrp({ processo: fP.value.trim(), objeto: fO.value.trim() }); irp = { id: irpId, situacao: 'rascunho' };
          }
          const existentes = (B.itens || []).filter((t) => t.irp_id === irpId);
          const idDe = {};
          if (irp.situacao === 'rascunho') {
            let n = Math.max(0, ...existentes.map((t) => t.numero));
            for (const it of m.itens) {
              const ja = existentes.find((t) => t.estimativa_id === est.id && t.estimativa_item === it.id);
              const reg = { ...(ja ? { id: ja.id } : { irp_id: irpId, numero: ++n }), lote: it.lote || null, descricao: it.descricao, unidade: it.unidade || 'Unidade', qtd_estimada: R.total[it.id], estimativa_id: est.id, estimativa_item: it.id };
              const r = await D.salvar('irp_itens', reg); idDe[it.id] = r.id;
            }
          } else {
            existentes.filter((t) => t.estimativa_id === est.id).forEach((t) => { idDe[t.estimativa_item] = t.id; });
            if (!Object.keys(idDe).length) { toast('A IRP já está aberta e não tem os itens desta estimativa. Escolha uma IRP em rascunho ou crie uma nova.', true); ocupado(b); return; }
          }
          let ok = 0; const falhas = [];
          if (ckEtp.checked) for (const o of cons) {
            const itens = m.itens.filter((it) => idDe[it.id] && R.qtd[it.id][o.id] > 0).map((it) => ({ item_id: idDe[it.id], qtd: R.qtd[it.id][o.id] }));
            if (!itens.length) continue;
            try { await D.lancarEtpIrp(irpId, o.id, itens); ok++; } catch (e) { falhas.push(o.nome + ': ' + e.message); }
          }
          est.irp_id = irpId; await salvar(true);
          d.close(); toast('Itens lançados na IRP' + (ok ? ' e demanda do ETP de ' + ok + ' ente(s)' : '') + '.' + (falhas.length ? ' ' + falhas.length + ' ente(s) não entraram: ' + falhas[0] : ''), !!falhas.length);
          if (estado.irp) estado.irp = null;
          location.hash = '#irp-' + irpId;
        } catch (e) { toast(e.message, true); ocupado(b); }
      });
    };
    const abaRes = () => {
      const t8 = textoItem8();
      const ta = el('textarea', { rows: 16, class: 'texto-modelo', readonly: true }, t8);
      const valorTot = m.itens.reduce((s, it) => s + (it.preco ? R.total[it.id] * it.preco.valor : 0), 0);
      return [el('div', { class: 'botoes-linha mb-1' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: exportarTudo }, 'Baixar planilha completa (Excel)'),
          pode() ? el('button', { type: 'button', class: 'btn btn-claro', onclick: lancarIrp }, est.irp_id ? 'Atualizar na IRP' : 'Lançar na IRP') : null,
          est.irp_id ? el('a', { class: 'btn btn-texto', href: '#irp-' + est.irp_id }, 'Ver IRP') : null),
        el('h3', null, 'Quadro consolidado'),
        m.itens.length ? tabela(['Nº', 'Lote', 'Descrição', 'Unid.', 'Entes', 'Extra', 'Total', 'Preço ref.', 'Valor estimado'], [...m.itens.map((it, k) => el('tr', null,
          el('td', { class: 'num' }, k + 1), el('td', null, it.lote || '—'), el('td', { class: 'texto-longo' }, it.descricao), el('td', null, it.unidade),
          el('td', { class: 'num' }, n0(Object.values(R.qtd[it.id]).reduce((a, b) => a + b, 0), 0)), el('td', { class: 'num' }, n0(it.extra || 0, 0)), el('td', { class: 'num' }, el('strong', null, n0(R.total[it.id], 0))),
          el('td', { class: 'num' }, it.preco ? rs(it.preco.valor) : '—'), el('td', { class: 'num' }, it.preco ? rs(R.total[it.id] * it.preco.valor) : '—'))),
          el('tr', { class: 'linha-total' }, el('td', { colspan: 8 }, 'Valor total estimado'), el('td', { class: 'num' }, el('strong', null, rs(valorTot))))]) : el('p', { class: 'vazio' }, 'Sem itens.'),
        el('h3', null, 'Texto para o item 8 do ETP'), el('p', { class: 'ajuda' }, 'Gerado a partir dos métodos usados. Revise e adapte antes de colar no ETP.'),
        ta, el('div', { class: 'botoes-linha' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => copiar(t8) }, 'Copiar texto'))];
    };

    const abas = N.abas([
      ['dados', 'Dados e parâmetros', montar('dados', abaDados)],
      ['entes', 'Entes', montar('entes', abaEntes)],
      ['itens', 'Itens', montar('itens', abaItens)],
      ['modelo', 'Modelo por eventos', montar('modelo', abaModelo)],
      ['qtd', 'Quantidades por ente', montar('qtd', abaQtd)],
      ['precos', 'Pesquisa de preços', montar('precos', abaPrecos)],
      ['res', 'Resultado', montar('res', abaRes)],
    ], E.abaEst || 'itens');
    abas.addEventListener('click', (ev) => { const t = ev.target.closest('[role="tab"]'); if (t) { E.abaEst = t.id.replace('aba-', ''); const k = E.abaEst; if (paineis[k]) paineis[k](); } });
    const bSalvar = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => salvar(false) }, 'Salvar');
    rc(c, voltar('#etpestimativas', 'Estimativas'), cabecalho(est.titulo, [est.processo ? 'Processo ' + est.processo : null, m.itens.length + ' item(ns)', Object.keys(R.info).length + ' ente(s)'].filter(Boolean).join(' · '),
        estado2, pode() ? bSalvar : null,
        pode() ? el('button', { type: 'button', class: 'btn btn-texto', onclick: async () => { if (!(await confirmar('Excluir estimativa', 'Excluir a estimativa "' + est.titulo + '"?', 'Excluir', true))) return; try { await D.etpExcluirEstimativa(est.id); location.hash = '#etpestimativas'; } catch (e) { toast(e.message, true); } } }, 'Excluir') : null),
      abas);
    window.addEventListener('hashchange', function sair() { window.removeEventListener('hashchange', sair); if (sujo && pode()) salvar(true); });
  };

  N.PENDENCIAS.etp = N.PENDENCIAS.etp || (() => null);
  window.ETP3 = { calcular, analisarPrecos, porteDe, novoModelo, ipcaFator, textoMetodologia, criterios };
})();
