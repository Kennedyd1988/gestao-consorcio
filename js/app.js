// =====================================================================
// SOFT+ GOV · Gestão de Consórcio (CIMOP) — módulo de adesões às Atas de Registro de Preços
// Núcleo do painel no padrão SOFT+ (mesmas peças do painel do Portal PNTP).
// =====================================================================
(function () {
  'use strict';
  const D = window.DADOS, R = window.REGRAS, O = window.OFICIO, PL = window.PLANILHAS;
  const $ = (id) => document.getElementById(id);
  const estado = { base: null, usuario: null };

  // ---------------------------------------------------------------- utilidades (padrão SOFT+)
  function el(tag, attrs, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'value') e.value = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      e.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return e;
  }
  const rc = (no, ...filhos) => no.replaceChildren(...filhos.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  const mostrarTela = (id) => { for (const t of document.querySelectorAll('.tela')) t.hidden = t.id !== id; };
  function toast(texto, erro) {
    const t = $('toast');
    const janela = [...document.querySelectorAll('dialog[open]')].pop();
    if (t.parentElement !== (janela || document.body)) (janela || document.body).append(t);
    t.textContent = texto; t.classList.toggle('erro', !!erro); t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 5000);
  }
  function msg(id, texto, tipo) { const m = $(id); if (!texto) { m.hidden = true; return; } m.textContent = texto; m.className = 'msg msg-' + (tipo || 'erro'); m.hidden = false; }
  function marcarErro(input, texto) {
    input.classList.toggle('invalido', !!texto);
    input.setAttribute('aria-invalid', texto ? 'true' : 'false');
    const span = input.id && document.getElementById(input.id + '-erro');
    if (span) span.textContent = texto || '';
    if (texto) input.focus();
    return !texto;
  }
  function campo(id, rotulo, input, ajuda, obrigatorio) {
    input.id = id;
    return el('div', { class: 'campo' },
      el('label', { for: id }, rotulo, obrigatorio ? el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null),
      input, ajuda ? el('span', { class: 'ajuda', id: id + '-ajuda' }, ajuda) : null, el('span', { class: 'erro-campo', id: id + '-erro' }));
  }
  const txt = (v, extra) => el('input', Object.assign({ type: 'text', value: v ?? '' }, extra || {}));
  const area = (v, extra) => { const t = el('textarea', Object.assign({ rows: 3 }, extra || {})); t.value = v ?? ''; return t; };
  const sel = (opcoes, atual, extra) => el('select', extra || null, opcoes.map(([v, t]) => el('option', { value: v, selected: String(atual ?? '') === String(v) }, t)));
  // Telefone: (84) 99999-9999 ou (84) 3333-3333
  function formatarTelefone(v) {
    let d = String(v || '').replace(/\D/g, '');
    if (d.length > 11 && d.startsWith('0')) d = d.replace(/^0+/, '');
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    const ddd = d.slice(0, 2), r = d.slice(2);
    if (r.length <= 4) return '(' + ddd + ') ' + r;
    const corte = r.length === 9 ? 5 : 4;
    return '(' + ddd + ') ' + r.slice(0, corte) + '-' + r.slice(corte);
  }
  function mascaraTelefone(input) {
    input.value = formatarTelefone(input.value);
    input.addEventListener('input', () => { input.value = formatarTelefone(input.value); });
    return input;
  }
  const telefoneValido = (v) => { const d = String(v || '').replace(/\D/g, ''); return !d || d.length === 10 || d.length === 11; };
  // Dados públicos do CNPJ (Receita Federal) pela BrasilAPI; reserva: publica.cnpj.ws
  const tituloPt = (t) => String(t || '').toLowerCase().replace(/(^|[\s/(-])([a-zà-ú])/g, (m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (m) => m.toLowerCase());
  async function consultarReceita(cnpj) {
    let j = null;
    try { const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj); if (r.ok) j = await r.json(); } catch (e) {}
    if (!j) {
      try {
        const r = await fetch('https://publica.cnpj.ws/cnpj/' + cnpj);
        if (r.ok) { const x = await r.json(), e = x.estabelecimento || {};
          j = { razao_social: x.razao_social, natureza_juridica: x.natureza_juridica && x.natureza_juridica.descricao, municipio: e.cidade && e.cidade.nome, uf: e.estado && e.estado.sigla,
            email: e.email, ddd_telefone_1: (e.ddd1 || '') + (e.telefone1 || ''), descricao_situacao_cadastral: e.situacao_cadastral }; }
      } catch (e) {}
    }
    if (!j || !j.razao_social) return null;
    const nat = String(j.natureza_juridica || '');
    const esfera = /munic/i.test(nat) ? 'Municipal' : /estad|distrito federal/i.test(nat) ? 'Estadual' : /federal|uni[aã]o/i.test(nat) ? 'Federal' : /cons[oó]rcio/i.test(nat) ? 'Consórcio' : 'Outro';
    const mun = tituloPt(j.municipio), uf = String(j.uf || '').toUpperCase();
    const ehMunicipio = /^munic[ií]pio\b/i.test(nat) || /^munic[ií]pio de\b/i.test(j.razao_social);
    return { nome: ehMunicipio && mun ? 'Município de ' + mun + '/' + uf : tituloPt(j.razao_social), municipio: mun, uf, esfera,
      email: String(j.email || '').toLowerCase() || '', telefone: formatarTelefone(String(j.ddd_telefone_1 || '').replace(/\D/g, '').slice(0, 11)),
      situacao: String(j.descricao_situacao_cadastral || '') };
  }
  function ocupado(btn, texto) {
    if (texto) { btn.dataset.orig = btn.textContent; btn.textContent = texto; btn.disabled = true; }
    else { btn.textContent = btn.dataset.orig || btn.textContent; btn.disabled = false; }
  }
  function abrirDialogo(titulo, corpo, acoes, largo) {
    const d = el('dialog', { class: 'dialogo' + (largo ? ' dialogo-largo' : ''), 'aria-label': titulo },
      el('div', { class: 'dialogo-topo' }, el('h2', null, titulo), el('button', { type: 'button', class: 'dialogo-fechar', 'aria-label': 'Fechar', onclick: () => d.close() }, '×')),
      el('div', { class: 'dialogo-corpo' }, corpo), el('div', { class: 'dialogo-acoes' }, acoes || []));
    d.addEventListener('close', () => { const t = $('toast'); if (d.contains(t)) document.body.append(t); d.remove(); });
    document.body.append(d); d.showModal(); return d;
  }
  function confirmar(titulo, texto, rotuloOk, perigo) {
    return new Promise((ok) => {
      let r = false;
      const b = el('button', { type: 'button', class: 'btn ' + (perigo ? 'btn-perigo' : 'btn-primario') }, rotuloOk || 'Confirmar');
      const d = abrirDialogo(titulo, typeof texto === 'string' ? el('p', null, texto) : texto, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b]);
      b.addEventListener('click', () => { r = true; d.close(); });
      d.addEventListener('close', () => ok(r));
    });
  }
  // Abas no estilo guia de navegador (mesmo componente do painel PNTP)
  function abas(lista, inicial) {
    const botoes = [], paineis = [];
    let atual = null;
    const ir = (id, focar) => {
      const k = lista.findIndex((x) => x[0] === id); if (k < 0) return;
      atual = id;
      lista.forEach((x, n) => {
        const s = n === k;
        botoes[n].setAttribute('aria-selected', s ? 'true' : 'false'); botoes[n].tabIndex = s ? 0 : -1; paineis[n].hidden = !s;
        if (s && typeof x[2] === 'function' && !paineis[n]._montado) { paineis[n]._montado = true; paineis[n].replaceChildren(...[].concat(x[2]()).filter(Boolean)); }
      });
      if (focar) botoes[k].focus();
    };
    lista.forEach(([id, rotulo, conteudo]) => {
      botoes.push(el('button', { type: 'button', role: 'tab', class: 'aba', id: 'aba-' + id, 'aria-controls': 'painel-' + id, onclick: () => ir(id) }, rotulo));
      paineis.push(el('div', { role: 'tabpanel', id: 'painel-' + id, 'aria-labelledby': 'aba-' + id, 'data-aba-painel': id, hidden: true }, typeof conteudo === 'function' ? null : conteudo));
    });
    const barra = el('div', { class: 'abas abas-janela', role: 'tablist' }, botoes);
    barra.addEventListener('keydown', (e) => {
      const ids = lista.map((x) => x[0]); const i = ids.indexOf(atual);
      const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? ids.length - 1 : null;
      if (n === null) return; e.preventDefault(); ir(ids[(n + ids.length) % ids.length], true);
    });
    const caixa = el('div', { class: 'janela-abas' }, barra, el('div', { class: 'painel-guia' }, paineis));
    caixa.ir = ir;
    ir(inicial && lista.some((x) => x[0] === inicial) ? inicial : lista[0][0]);
    return caixa;
  }
  // Paginação automática das listagens (25 por página), igual ao painel PNTP
  const POR_PAGINA = 25;
  function paginarTabela(caixa) {
    const corpo = caixa.querySelector('tbody'); if (!corpo || caixa.dataset.semPaginas) return;
    const linhas = [...corpo.children];
    let nav = caixa.nextElementSibling && caixa.nextElementSibling.classList.contains('paginacao') ? caixa.nextElementSibling : null;
    const paginas = Math.ceil(linhas.length / POR_PAGINA);
    if (paginas <= 1) { linhas.forEach((l) => (l.hidden = false)); if (nav) nav.remove(); return; }
    const mostrar = (n, rolar) => {
      caixa.dataset.pagina = n;
      linhas.forEach((l, k) => (l.hidden = Math.floor(k / POR_PAGINA) + 1 !== n));
      const botao = (rot, alvo, extra) => el('button', Object.assign({ type: 'button', class: 'pag-btn', disabled: alvo < 1 || alvo > paginas || (alvo === n && typeof rot !== 'number') ? true : null,
        'aria-current': typeof rot === 'number' && alvo === n ? 'page' : null, onclick: () => mostrar(alvo, true) }, extra || {}), String(rot));
      const nums = [];
      for (let i = 1; i <= paginas; i++) {
        if (i === 1 || i === paginas || Math.abs(i - n) <= 2) nums.push(botao(i, i));
        else if (nums.length && nums[nums.length - 1].textContent !== '…') nums.push(el('span', { class: 'pag-reticencias' }, '…'));
      }
      const novo = el('nav', { class: 'paginacao', 'aria-label': 'Páginas da lista' }, botao('‹', n - 1, { 'aria-label': 'Página anterior' }), nums, botao('›', n + 1, { 'aria-label': 'Próxima página' }),
        el('span', { class: 'ajuda pag-info' }, 'Linhas ' + ((n - 1) * POR_PAGINA + 1) + '–' + Math.min(n * POR_PAGINA, linhas.length) + ' de ' + linhas.length));
      if (nav) nav.replaceWith(novo); else caixa.after(novo);
      nav = novo;
      if (rolar) caixa.scrollIntoView({ block: 'start', behavior: 'smooth' });
    };
    mostrar(Math.min(Number(caixa.dataset.pagina || 1), paginas), false);
  }
  const paginarTudo = (c) => c.querySelectorAll('.tabela-caixa').forEach(paginarTabela);

  // Download: na página publicada usa o navegador; na prévia (claude.ai) usa a capacidade "downloads".
  async function baixar(nome, dados, tipo) {
    const blob = dados instanceof Blob ? dados : new Blob([dados], { type: tipo || 'application/octet-stream' });
    try {
      if (window.claude && window.claude.use) {
        const dl = await window.claude.use('downloads');
        if (dl) { await dl.save({ filename: nome, data: blob }); return true; }
      }
    } catch (e) { if (e && e.code === 'declined') return false; }
    const a = el('a', { href: URL.createObjectURL(blob), download: nome });
    document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    return true;
  }
  const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ');
  const XLSX_T = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const normalizar = D.normalizar;
  const ordOficio = (p) => { const m = String(p.numero_oficio || '').match(/(\d+)\/(\d{4})/); return m ? Number(m[2]) * 10000 + Number(m[1]) : 0; };
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const diasAte = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 86400000);
  // Permissões por módulo (estado.acessos = { adesoes: 'operador', ... }); "sistema" = administrador do sistema
  const M = window.MODULOS;
  const perfilEm = (modulo) => (estado.acessos || {})[modulo] || null;
  const podeEditar = () => ['administrador', 'operador'].includes(perfilEm('adesoes'));
  const eAdmin = () => perfilEm('adesoes') === 'administrador';
  const eAdminSistema = () => !!(estado.usuario && estado.usuario.perfil === 'administrador');
  const NOME_PERFIL = M.NOME_PERFIL;
  const SIT = { autorizado: ['Autorizado', 'etiqueta-autorizado'], parcial: ['Autorizado em parte', 'etiqueta-parcial'], negado: ['Negado', 'etiqueta-negado'], cancelado: ['Cancelado', 'etiqueta-cancelado'] };
  const etiquetaSit = (s) => el('span', { class: 'etiqueta ' + SIT[s][1] }, SIT[s][0]);
  const cabecalho = (titulo, sub, ...botoes) => el('div', { class: 'cabecalho-modulo' }, el('div', null, el('h1', null, titulo), sub ? el('p', { class: 'sub' }, sub) : null), botoes.length ? el('div', { class: 'botoes-cabecalho' }, botoes) : null);
  const tabela = (cab, linhas, extra) => el('div', Object.assign({ class: 'tabela-caixa' }, extra || {}), el('table', { class: 'tabela' + ((extra && extra.classeTabela) ? ' ' + extra.classeTabela : '') },
    el('thead', null, el('tr', null, cab.map((t) => (t instanceof Node ? t : el('th', { scope: 'col', class: /^(Qtd|Registrado|Valor|Saldo|Limite|Aderido|Já|Preço|Itens|Adesões|Total)/.test(t) ? 'num' : null }, t))))),
    el('tbody', null, linhas)));
  function barraUso(pct, rot) {
    const p = Math.max(0, Math.min(100, pct));
    return el('div', { class: 'barra-uso' + (pct >= 100 ? ' critico' : pct >= 80 ? ' alerta' : '') }, el('span', { class: 'barra-pntp', role: 'img', 'aria-label': rot || R.num(pct, 1) + '%' }, el('span', { style: 'width:' + p + '%' })), el('small', null, R.num(pct, 0) + '%'));
  }
  function etiquetaVigencia(a) {
    if (!a.vigencia_fim) return el('span', { class: 'etiqueta etiqueta-pendente' }, 'Vigência não informada');
    const d = diasAte(a.vigencia_fim);
    if (d < 0) return el('span', { class: 'etiqueta etiqueta-desativado' }, 'Vencida em ' + R.dataBR(a.vigencia_fim));
    if (d <= 60) return el('span', { class: 'etiqueta etiqueta-pendente' }, 'Vence em ' + d + ' dia(s) · ' + R.dataBR(a.vigencia_fim));
    const ps = R.periodosDa(estado.base, a.id);
    return el('span', { class: 'etiqueta etiqueta-ativo' }, (ps.length > 1 ? 'Prorrogada até ' : 'Vigente até ') + R.dataBR(a.vigencia_fim));
  }

  // ---------------------------------------------------------------- cálculos sobre a base
  // Ciclo de quantitativos em exibição para cada ata (padrão: o atual)
  estado.ciclos = {};
  const cicloVer = (ataId) => (estado.ciclos[ataId] !== undefined ? estado.ciclos[ataId] : R.cicloAtual(estado.base, ataId));
  const noCiclo = (pi, ataId) => { const c = cicloVer(ataId); return !c || R.cicloDe(estado.base, pi.periodo_id, ataId) === c; };
  function consumo(itemId, ignorar) {
    const b = estado.base; let tot = 0, valor = 0; const porOrg = {}, valorPorOrg = {};
    const ataId = (b.itensPorId[itemId] || {}).ata_id;
    for (const pi of b.pedido_itens) {
      if (pi.item_id !== itemId || pi.decisao !== 'autorizado') continue;
      const p = b.pedidosPorId[pi.pedido_id]; if (!p || p.situacao === 'cancelado' || p.id === ignorar) continue;
      if (!noCiclo(pi, ataId)) continue;
      tot += Number(pi.qtd_autorizada); porOrg[p.orgao_id] = (porOrg[p.orgao_id] || 0) + Number(pi.qtd_autorizada);
      const pr = R.precoPi(b, pi, b.itensPorId[itemId]); if (pr != null) { valor += Number(pi.qtd_autorizada) * pr; valorPorOrg[p.orgao_id] = (valorPorOrg[p.orgao_id] || 0) + Number(pi.qtd_autorizada) * pr; }
    }
    return { tot, porOrg, valor, valorPorOrg };
  }
  function resumoAta(a) {
    const itens = estado.base.itens.filter((i) => i.ata_id === a.id);
    let maior = 0, valor = 0;
    for (const i of itens) { const cc = consumo(i.id), c = cc.tot; maior = Math.max(maior, c / (2 * i.qtd_registrada) * 100); valor += cc.valor; }
    const peds = new Set(estado.base.pedido_itens.filter((pi) => itens.some((i) => i.id === pi.item_id) && pi.decisao === 'autorizado').map((pi) => pi.pedido_id));
    const ativos = [...peds].filter((id) => estado.base.pedidosPorId[id] && estado.base.pedidosPorId[id].situacao !== 'cancelado');
    return { itens, maior, valor, adesoes: ativos.length };
  }
  function linhasDoPedido(p) {
    const b = estado.base;
    return b.pedido_itens.filter((pi) => pi.pedido_id === p.id).map((pi) => {
      const item = b.itensPorId[pi.item_id], ata = b.atasPorId[item.ata_id], reg = Number(item.qtd_registrada);
      const uo = pi.usado_orgao_antes != null ? Number(pi.usado_orgao_antes) : null, ut = pi.usado_total_antes != null ? Number(pi.usado_total_antes) : null;
      return { pi, item, ata, preco: R.precoPi(b, pi, item), decisao: pi.decisao, motivo: pi.motivo || '', q: Number(pi.qtd_solicitada), qAut: Number(pi.qtd_autorizada),
        usadoOrgao: uo ?? 0, dispOrgao: Math.max(0, reg * 0.5 - (uo ?? 0)), dispTotal: Math.max(0, reg * 2 - (ut ?? 0)) };
    }).sort((x, y) => x.ata.numero.localeCompare(y.ata.numero) || x.item.numero - y.item.numero);
  }
  const valorPedido = (p) => linhasDoPedido(p).reduce((s, l) => s + (l.decisao === 'autorizado' && l.preco != null ? l.qAut * l.preco : 0), 0);
  const textoAnexos = (pregoes) => {
    const t = estado.base.config.texto_anexos || '';
    const p = pregoes.length > 1 ? 'dos Pregões Eletrônicos ' + pregoes.map((x) => 'nº ' + x).join(' e ') : 'Pregão Eletrônico nº ' + (pregoes[0] || '___');
    return t.replace('{pregao}', p).replace('processo integral do dos', 'processo integral dos');
  };
  function ultimoOficio() {
    const ano = hoje().slice(0, 4);
    const nums = estado.base.pedidos.map((p) => String(p.numero_oficio || '').match(/^(\d+)\/(\d{4})/)).filter((m) => m && m[2] === ano).map((m) => Number(m[1]));
    return nums.length ? Math.max(...nums) : null;
  }
  async function baixarOficio(p) {
    const b = estado.base;
    const dados = { pedido: p, orgao: b.orgaosPorId[p.orgao_id], linhas: linhasDoPedido(p), config: b.config };
    const blob = await O.gerarDocx(dados);
    return baixar(O.nomeArquivo(dados), blob);
  }
  async function recarregar() { estado.base = await D.carregar(); atualizarContadores(); }

  // ---------------------------------------------------------------- login
  for (const b of document.querySelectorAll('.btn-ver-senha')) b.addEventListener('click', () => {
    const i = $(b.dataset.alvo); const m = i.type === 'password'; i.type = m ? 'text' : 'password'; b.textContent = m ? 'Ocultar' : 'Mostrar';
  });
  $('form-login').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const email = $('login-email'), senha = $('login-senha');
    if (!marcarErro(email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) ? '' : 'Informe um e-mail válido.')) return;
    if (!marcarErro(senha, senha.value ? '' : 'Informe a senha.')) return;
    const btn = $('btn-entrar'); ocupado(btn, 'Entrando…'); msg('login-msg');
    try { estado.usuario = await D.entrar(email.value.trim(), senha.value); await entrarNoSistema(true); }
    catch (e) { msg('login-msg', e.message); } finally { ocupado(btn); }
  });
  $('link-esqueci').addEventListener('click', async () => {
    const email = $('login-email').value.trim();
    if (!marcarErro($('login-email'), /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Digite seu e-mail acima e clique de novo em "Esqueci minha senha".')) return;
    try { await D.esqueci(email); msg('login-msg', 'Enviamos um link para ' + email + ' criar uma nova senha.', 'ok'); } catch (e) { msg('login-msg', e.message); }
  });
  $('form-nova-senha').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const s1 = $('nova-senha'), s2 = $('nova-senha2');
    if (!marcarErro(s1, s1.value.length >= 8 && /\d/.test(s1.value) && /\D/.test(s1.value) ? '' : 'Use pelo menos 8 caracteres, com letras e números.')) return;
    if (!marcarErro(s2, s1.value === s2.value ? '' : 'As senhas não conferem.')) return;
    const btn = $('btn-salvar-senha'); ocupado(btn, 'Salvando…');
    try { await D.trocarSenha(s1.value); estado.usuario = await D.sessao(); toast('Senha salva.'); await entrarNoSistema(true); }
    catch (e) { msg('nova-msg', e.message); } finally { ocupado(btn); }
  });
  async function sair() {
    await D.sair(); Object.assign(estado, { usuario: null, acessos: null, base: null, modulo: null, logado: false });
    history.replaceState(null, '', location.pathname + location.search);
    mostrarTela('tela-login'); $('form-login').hidden = false; $('form-nova-senha').hidden = true;
  }
  $('btn-sair').addEventListener('click', sair);
  $('btn-sair-modulos').addEventListener('click', sair);
  $('topo-usuario-modulos').addEventListener('click', () => minhaConta());
  $('btn-topo-novo').addEventListener('click', () => { location.hash = '#novo'; });
  $('btn-menu').addEventListener('click', () => { const a = $('lateral').classList.toggle('aberta'); $('btn-menu').setAttribute('aria-expanded', a ? 'true' : 'false'); });
  $('topo-usuario').addEventListener('click', minhaConta);

  function minhaConta() {
    const u = estado.usuario;
    const mods = M.lista.filter((m) => perfilEm(m.id) && m.id !== 'sistema');
    const d = abrirDialogo('Minha conta', el('div', null, el('dl', { class: 'dados' }, el('dt', null, 'Nome'), el('dd', null, u.nome), el('dt', null, 'E-mail'), el('dd', null, u.email),
      el('dt', null, 'Acesso'), el('dd', null, eAdminSistema() ? 'Administrador do sistema (todos os módulos)' : mods.length ? mods.map((m) => m.nome + ': ' + NOME_PERFIL[perfilEm(m.id)]).join(' · ') : 'Nenhum módulo liberado'))),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => { d.close(); mostrarTela('tela-login'); $('form-login').hidden = true; $('form-nova-senha').hidden = false; } }, 'Trocar senha'),
        el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d.close() }, 'Fechar')]);
  }

  // ---------------------------------------------------------------- menu e rotas
  // Menu lateral de cada módulo. O item "Início" do módulo vem de MODULOS (campo inicio).
  const MENUS = {
    adesoes: [
      ['Adesões', [['solicitacoes', 'Solicitações recebidas'], ['novo', 'Novo pedido de adesão', () => podeEditar()], ['pedidos', 'Pedidos e ofícios'], ['relatorio', 'Relatório em PDF']]],
      ['Cadastros', [['atas', 'Atas de registro de preços'], ['orgaos', 'Órgãos aderentes'], ['pncp', 'Atualizações do PNCP', () => podeEditar()]]],
      ['Módulo', [['importar', 'Importar planilha', () => podeEditar()], ['configuracoes', 'Configurações do ofício', () => eAdmin()]]],
    ],
    sistema: [
      ['Sistema', [['usuarios', 'Usuários e acessos']]],
    ],
  };
  function montarMenu(mod) {
    const menu = $('menu');
    menu.replaceChildren(
      el('a', { href: '#modulos', class: 'menu-voltar', 'data-rota': 'modulos', 'data-busca': normalizar('todos os modulos tela principal') }, el('span', { 'aria-hidden': 'true' }, '←'), ' Todos os módulos'),
      el('div', { class: 'menu-modulo', style: '--g:' + mod.cor }, el('span', { class: 'menu-modulo-icone' }, M.icone(mod.id, 18)), el('span', null, mod.nome)));
    if (mod.id === 'adesoes') menu.append(el('a', { href: '#inicio', 'data-rota': 'inicio', class: 'menu-inicio', 'data-busca': normalizar('inicio painel') }, 'Início'));
    for (const [grupo, itens] of MENUS[mod.id] || []) {
      const vis = itens.filter((i) => !i[2] || i[2]()); if (!vis.length) continue;
      menu.append(el('div', { class: 'menu-bloco', role: 'group', 'aria-label': grupo }, el('span', { class: 'menu-grupo', 'aria-hidden': 'true' }, grupo.toUpperCase()),
        vis.map(([r, n]) => el('a', { href: '#' + r, 'data-rota': r, 'data-busca': normalizar(n + ' ' + grupo) }, n, el('span', { class: 'aba-qtd', 'data-cont': r, hidden: true })))));
    }
    menu.append(el('p', { class: 'menu-nada', hidden: true }, 'Nenhum item com esse nome.'));
  }
  function atualizarContadores() {
    const c = document.querySelector('[data-cont="pedidos"]');
    if (c && estado.base) { const n = estado.base.pedidos.filter((p) => p.origem !== 'migracao' && p.situacao !== 'cancelado').length; c.textContent = n; c.hidden = !n; }
    const s = document.querySelector('[data-cont="solicitacoes"]');
    if (s && estado.base) { const n = estado.base.solicitacoes.filter((x) => x.situacao === 'recebida' || x.situacao === 'em_analise').length; s.textContent = n; s.hidden = !n; s.classList.toggle('aba-qtd-alerta', n > 0); }
    const u = document.querySelector('[data-cont="pncp"]');
    if (u && estado.base) { const n = (estado.base.pncp || []).filter((x) => x.situacao === 'pendente').length; u.textContent = n; u.hidden = !n; u.classList.toggle('aba-qtd-alerta', n > 0); }
  }
  $('menu-busca').addEventListener('input', () => {
    const t = normalizar($('menu-busca').value.trim()); let algum = false;
    for (const b of $('menu').querySelectorAll('.menu-bloco')) {
      let n = 0; for (const a of b.querySelectorAll('a')) { const ok = !t || a.dataset.busca.includes(t); a.hidden = !ok; if (ok) n++; }
      b.hidden = !n; if (n) algum = true;
    }
    $('menu').querySelector('.menu-nada').hidden = algum || !t;
  });
  $('menu').addEventListener('click', (ev) => { if (ev.target.closest('a')) { $('lateral').classList.remove('aberta'); $('btn-menu').setAttribute('aria-expanded', 'false'); } });

  const TELAS = {};
  // Telas de um módulo (o painel com menu lateral)
  function rotear() {
    const h = (location.hash || '#inicio').slice(1);
    const [rota, ...resto] = h.split('-'); const id = resto.join('-');
    const destaque = { pedido: 'pedidos', ata: 'atas', item: 'atas', solicitacao: 'solicitacoes' }[rota] || rota;
    for (const a of $('menu').querySelectorAll('a')) a.dataset.rota === destaque ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    const c = $('conteudo');
    const tela = TELAS[rota] || TELAS.inicio;
    try { tela(c, id); } catch (e) { console.error(e); rc(c, el('h1', null, 'Algo deu errado'), el('p', { class: 'msg msg-erro' }, e.message)); }
    paginarTudo(c);
    c.focus({ preventScroll: true }); window.scrollTo(0, 0);
    if (estado.irPrecos) { estado.irPrecos = false; const alvo = document.getElementById('precos-item'); if (alvo) alvo.scrollIntoView(); }
  }
  const temAcesso = (mod) => !!mod && !!perfilEm(mod.id) && (!mod.soAdminSistema || eAdminSistema());
  const modulosLiberados = () => M.lista.filter(temAcesso);

  // Decide entre a tela principal (#modulos) e o módulo dono da rota.
  async function navegar() {
    if (!estado.logado) return;
    const rota = (location.hash || '').slice(1).split('-')[0];
    if (!rota || rota === 'modulos') { telaModulos(); return; }
    const mod = M.daRota(rota);
    if (!temAcesso(mod)) {
      history.replaceState(null, '', '#modulos'); telaModulos();
      toast(mod ? 'Seu usuário não tem acesso ao módulo ' + mod.nome + '. Fale com o administrador.' : 'Página não encontrada.', true);
      return;
    }
    if (mod.id === 'adesoes' && !estado.base) {
      mostrarTela('tela-carregando'); $('carregando-texto').textContent = 'Carregando atas e pedidos…';
      try { await recarregar(); } catch (e) { mostrarTela('tela-modulos'); toast(e.message, true); return; }
    }
    if (estado.modulo !== mod.id) {
      estado.modulo = mod.id;
      montarMenu(mod); atualizarContadores();
      const sigla = (estado.base && estado.base.config.sigla) || 'CIMOP';
      $('topo-orgao-nome').textContent = sigla + ' · ' + mod.nome;
      $('topo-orgao-perfil').textContent = mod.id === 'sistema' ? 'Administrador do sistema' : 'Seu perfil neste módulo: ' + NOME_PERFIL[perfilEm(mod.id)];
      $('btn-topo-novo').hidden = !(mod.id === 'adesoes' && podeEditar());
      $('menu-busca').value = '';
    }
    mostrarTela('tela-painel');
    rotear();
  }

  // Formulário público (#solicitar) e consulta (#consultar) abrem sem login
  const ehPublica = () => /^#(solicitar|consultar)/.test(location.hash);
  window.addEventListener('hashchange', () => {
    if (ehPublica()) { mostrarTela('tela-publica'); telaPublica(); return; }
    if (estado.logado) navegar();
    else if (!$('tela-login').hidden || !$('tela-publica').hidden) { mostrarTela('tela-login'); }
  });

  // Depois do login (ou com a sessão já aberta): carrega os acessos e abre a tela principal.
  async function entrarNoSistema(paraModulos) {
    mostrarTela('tela-carregando'); $('carregando-texto').textContent = 'Abrindo o sistema…';
    if (estado.usuario.troca_senha && D.modo !== 'demo') { mostrarTela('tela-login'); $('form-login').hidden = true; $('form-nova-senha').hidden = false; return; }
    estado.acessos = await D.acessos(estado.usuario);
    estado.modulo = null; estado.logado = true;
    $('topo-usuario').textContent = estado.usuario.nome;
    $('topo-usuario-modulos').textContent = estado.usuario.nome;
    if (D.modo === 'demo') {
      const f = $('faixa-demo'); f.hidden = false;
      f.replaceChildren(el('strong', null, 'Prévia de demonstração.'), ' Os dados ficam só neste navegador (atas e histórico da planilha de importação). Nada é gravado no banco.',
        el('a', { class: 'link', href: '#solicitar' }, 'Ver o formulário do município ↗'),
        el('button', { type: 'button', class: 'link', onclick: async () => { if (await confirmar('Recomeçar a demonstração', 'Apaga o que você lançou nesta prévia e volta ao histórico migrado da planilha.', 'Recomeçar', true)) { estado.base = await D.reiniciarDemo(); rotear(); toast('Demonstração reiniciada.'); } } }, 'Recomeçar a demonstração'));
    }
    if (paraModulos && location.hash !== '#modulos') history.replaceState(null, '', '#modulos');
    await navegar();
  }

  async function iniciar() {
    for (const s of document.querySelectorAll('.versao-app')) s.textContent = window.VERSAO_APP || '—';
    if (ehPublica()) { mostrarTela('tela-publica'); telaPublica(); }
    try {
      estado.usuario = await D.sessao();
      if (ehPublica()) {
        if (estado.usuario) { estado.acessos = await D.acessos(estado.usuario); estado.logado = true; if (perfilEm('adesoes')) await recarregar(); }
      } else if (estado.usuario) await entrarNoSistema(false); else mostrarTela('tela-login');
    } catch (e) { mostrarTela('tela-login'); msg('login-msg', e.message); }
    if (D.sb) D.sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') { mostrarTela('tela-login'); $('form-login').hidden = true; $('form-nova-senha').hidden = false; } });
    if ('serviceWorker' in navigator && D.modo !== 'demo') navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
  }

  // ================================================================= TELA PRINCIPAL (módulos)
  // Um ícone por módulo liberado. Os números de pendências vêm dos próprios módulos (integração).
  const PENDENCIAS = {
    adesoes: () => {
      const b = estado.base; if (!b) return null;
      const sol = b.solicitacoes.filter((x) => x.situacao === 'recebida' || x.situacao === 'em_analise').length;
      const pn = podeEditar() ? (b.pncp || []).filter((x) => x.situacao === 'pendente').length : 0;
      const vigentes = b.atas.filter((a) => a.ativo !== false && (!a.vigencia_fim || diasAte(a.vigencia_fim) >= 0)).length;
      const itens = [];
      if (sol) itens.push([sol, sol === 1 ? 'solicitação recebida' : 'solicitações recebidas', '#solicitacoes']);
      if (pn) itens.push([pn, pn === 1 ? 'atualização do PNCP' : 'atualizações do PNCP', '#pncp']);
      return { resumo: vigentes + (vigentes === 1 ? ' ata vigente' : ' atas vigentes'), itens };
    },
  };
  function telaModulos() {
    estado.modulo = null;
    mostrarTela('tela-modulos');
    document.title = 'SOFT+ Consórcios · Gestão de Consórcio';
    const nome = (estado.usuario.nome || '').split(' ')[0];
    const cfg = (estado.base && estado.base.config) || {};
    $('modulos-ola').textContent = nome ? 'Olá, ' + nome + '!' : 'Bem-vindo!';
    $('modulos-consorcio').textContent = cfg.orgao_nome || 'Consórcio Intermunicipal Multifinalitário dos Municípios do Oeste Potiguar';
    const lib = modulosLiberados();
    const grade = $('grade-modulos');
    if (!lib.length) {
      rc(grade, el('div', { class: 'modulos-vazio' }, el('h2', null, 'Nenhum módulo liberado'),
        el('p', null, 'Seu login está ativo, mas ainda não tem acesso a nenhum módulo. Peça ao administrador do sistema para liberar em "Usuários e acessos".')));
      return;
    }
    rc(grade, lib.map((m) => {
      const pend = PENDENCIAS[m.id] ? PENDENCIAS[m.id]() : null;
      const total = pend ? pend.itens.reduce((t, x) => t + x[0], 0) : 0;
      return el('article', { class: 'cartao-modulo', style: '--g:' + m.cor, 'data-modulo': m.id },
        el('a', { class: 'cartao-modulo-link', href: m.inicio, 'aria-describedby': 'desc-mod-' + m.id },
          el('span', { class: 'icone-modulo' }, M.icone(m.id, 34), total ? el('span', { class: 'icone-modulo-qtd', 'aria-label': total + ' pendência(s)' }, total > 99 ? '99+' : total) : null),
          el('span', { class: 'cartao-modulo-nome' }, m.nome)),
        el('p', { class: 'cartao-modulo-desc', id: 'desc-mod-' + m.id }, m.descricao),
        pend && pend.itens.length ? el('ul', { class: 'cartao-modulo-pend' }, pend.itens.map(([n, t, h]) => el('li', null, el('a', { href: h }, el('strong', null, n), ' ' + t)))) : null,
        el('div', { class: 'cartao-modulo-rodape' },
          el('span', { class: 'etiqueta' }, m.id === 'sistema' ? 'Administrador do sistema' : 'Perfil: ' + NOME_PERFIL[perfilEm(m.id)]),
          pend ? el('span', { class: 'cartao-modulo-resumo' }, pend.resumo) : null));
    }));
    // Carrega os dados do módulo de adesões em segundo plano para mostrar as pendências (e abrir o módulo sem espera).
    if (perfilEm('adesoes') && !estado.base && !estado.carregandoBase) {
      estado.carregandoBase = true;
      recarregar().then(() => { if (!$('tela-modulos').hidden) telaModulos(); }).catch(() => {}).finally(() => { estado.carregandoBase = false; });
    }
  }

  // ================================================================= INÍCIO
  TELAS.inicio = (c) => {
    const b = estado.base, ano = hoje().slice(0, 4);
    const vigentes = b.atas.filter((a) => a.ativo !== false && (!a.vigencia_fim || diasAte(a.vigencia_fim) >= 0));
    const pedAno = b.pedidos.filter((p) => (p.data_oficio || '').startsWith(ano) && p.situacao !== 'cancelado');
    const valorAno = pedAno.reduce((s, p) => s + valorPedido(p), 0);
    const pertoLimite = b.itens.filter((i) => consumo(i.id).tot >= 1.6 * i.qtd_registrada);
    const alertas = [];
    for (const a of b.atas) {
      if (!a.vigencia_fim) alertas.push(['falta', 'ARP ' + a.numero + ': vigência não informada.', a]);
      else { const d = diasAte(a.vigencia_fim); if (d >= 0 && d <= 60) alertas.push(['falta', 'ARP ' + a.numero + ' (' + a.detentora + ') vence em ' + d + ' dia(s), em ' + R.dataBR(a.vigencia_fim) + '.', a]); }
      const semPreco = b.itens.filter((i) => i.ata_id === a.id && (i.preco_unitario == null || i.preco_unitario === '')).length;
      if (semPreco) alertas.push(['info', 'ARP ' + a.numero + ': ' + semPreco + ' item(ns) sem preço unitário (o valor do ofício fica em branco).', a]);
    }
    for (const o of R.conferirHistorico(b)) {
      const a = b.atasPorId[o.item.ata_id];
      alertas.unshift(['erro', o.tipo === '50%'
        ? `${o.orgao.nome} tem ${R.num(o.valor, 2)} autorizados no item ${o.item.numero} da ARP ${a.numero} — acima do limite de 50% (${R.num(o.limite, 2)}). Se o órgão era participante da ata, registre como participante; se era adesão, avalie retificar.`
        : `Item ${o.item.numero} da ARP ${a.numero}: total aderido ${R.num(o.valor, 2)} acima do dobro (${R.num(o.limite, 2)}).`, a]);
    }
    if (b.pncpPartes && b.pncpPartes.length) for (const x of conferenciaPncp()) if (x.lido && x.faltam.length)
      alertas.push(['falta', 'ARP ' + x.ata.numero + ': ' + x.faltam.length + ' adesão(ões) autorizada(s) ainda não aparece(m) no PNCP como não participante (' + x.faltam.map((g) => nomeCurto(g.orgao.nome)).join(', ') + '). Veja em Atualizações do PNCP.', x.ata]);
    const ultimos = [...b.pedidos].filter((p) => p.origem !== 'migracao').sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || '')).slice(0, 8);
    const nome = (estado.usuario.nome || '').split(' ')[0];
    rc(c,
      cabecalho(nome ? 'Olá, ' + nome : 'Início', 'Gestão de Consórcio · adesões às Atas de Registro de Preços', podeEditar() ? el('a', { class: 'btn btn-primario', href: '#novo' }, '+ Novo pedido de adesão') : null),
      el('div', { class: 'resumo-pntp' },
        el('div', null, el('span', { class: 'rotulo' }, 'Atas vigentes'), el('strong', { class: 'num-grande' }, vigentes.length), el('small', null, b.atas.length + ' cadastrada(s)')),
        el('div', null, el('span', { class: 'rotulo' }, 'Pedidos em ' + ano), el('strong', { class: 'num-grande' }, pedAno.length),
          el('small', null, pedAno.filter((p) => p.situacao !== 'negado').length + ' com autorização · ' + pedAno.filter((p) => p.situacao === 'negado').length + ' negado(s)')),
        el('div', null, el('span', { class: 'rotulo' }, 'Itens acima de 80% do dobro'), el('strong', { class: 'num-grande' }, pertoLimite.length), el('small', null, 'de ' + b.itens.length + ' itens')),
        el('div', null, el('span', { class: 'rotulo' }, 'Valor autorizado em ' + ano), el('strong', { class: 'num-grande' }, 'R$ ' + R.moeda(valorAno)), el('small', null, 'itens com preço informado'))),
      alertas.length ? el('section', { class: 'cartao' }, el('h2', null, 'Pontos de atenção'),
        el('ul', { class: 'lista-alertas' }, alertas.slice(0, 12).map(([t, texto, a]) => el('li', null, el('div', { class: 'msg msg-' + t }, el('span', null, texto), el('a', { class: 'link', href: '#ata-' + a.id }, 'Abrir ata'))))),
        alertas.length > 12 ? el('p', { class: 'ajuda' }, '+ ' + (alertas.length - 12) + ' outro(s). Veja em Atas de registro de preços.') : null) : null,
      el('section', { class: 'cartao' }, el('h2', null, 'Consumo das atas'),
        el('p', { class: 'ajuda' }, 'A barra mostra o item mais consumido de cada ata em relação ao dobro do registrado (limite total das adesões).'),
        tabela(['ARP', 'Contratado', 'Vigência', 'Itens', 'Adesões', 'Item mais consumido'], b.atas.map((a) => {
          const r = resumoAta(a);
          return el('tr', { class: 'clicavel', onclick: () => (location.hash = '#ata-' + a.id) },
            el('td', null, el('a', { href: '#ata-' + a.id }, el('strong', null, a.numero)), el('span', { class: 'sub-linha' }, 'Pregão ' + a.pregao)),
            el('td', null, a.detentora), el('td', null, etiquetaVigencia(a)), el('td', { class: 'num' }, r.itens.length), el('td', { class: 'num' }, r.adesoes), el('td', null, barraUso(r.maior)));
        }))),
      el('section', { class: 'cartao' }, el('h2', null, 'Últimos pedidos lançados'),
        ultimos.length ? tabelaPedidos(ultimos) : el('p', { class: 'vazio' }, 'Nenhum pedido lançado no sistema ainda. O histórico migrado está em Pedidos e ofícios.')));
  };

  // ================================================================= NOVO PEDIDO
  let rascunho = null;
  const novoRascunho = () => ({ orgao_id: '', numero_oficio: '', data_oficio: hoje(), oficio_solicitante: '', data_solicitante: '', finalidade: '', anexos: true, anexos_texto: null, atas: [], qtd: {} });

  TELAS.novo = (c) => {
    if (!podeEditar()) { rc(c, cabecalho('Acesso não permitido', 'Seu perfil só consulta.')); return; }
    const b = estado.base;
    rascunho = rascunho || novoRascunho();
    const r = rascunho;
    const ult = ultimoOficio();

    // --- Solicitante
    const selOrg = sel([['', 'Escolha o órgão ou entidade…'], ...b.orgaos.filter((o) => o.ativo !== false).map((o) => [o.id, o.nome + (o.cnpj ? ' · ' + O.formatarCnpj(o.cnpj) : '')])], r.orgao_id);
    const ficha = el('div');
    const desenharFicha = () => {
      const o = b.orgaosPorId[r.orgao_id];
      if (!o) { rc(ficha, ); return; }
      const falta = [!o.cnpj && 'CNPJ', !o.responsavel && 'responsável', !o.cargo && 'cargo'].filter(Boolean);
      rc(ficha, el('div', { class: 'ficha-orgao' },
        el('dl', { class: 'dados' }, el('dt', null, 'CNPJ'), el('dd', null, o.cnpj ? O.formatarCnpj(o.cnpj) : '—'), el('dt', null, 'Destinatário'), el('dd', null, [o.tratamento, o.responsavel].filter(Boolean).join(' ') || '—'),
          el('dt', null, 'Cargo'), el('dd', null, o.cargo || '—'), el('dt', null, 'E-mail'), el('dd', null, o.email || '—'), el('dt', null, 'Esfera'), el('dd', null, o.esfera)),
        falta.length ? el('p', { class: 'msg msg-falta mt-05' }, 'Falta ' + falta.join(', ') + ' deste órgão para o ofício sair completo. ') : null,
        el('button', { type: 'button', class: 'link', onclick: () => formOrgao(o, () => { desenharFicha(); atualizar(); }) }, 'Editar dados do órgão')));
    };
    selOrg.addEventListener('change', () => { r.orgao_id = selOrg.value; desenharFicha(); atualizar(); });

    // --- Ofício
    const fNum = txt(r.numero_oficio, { placeholder: ult ? String(ult + 1).padStart(3, '0') + '/' + hoje().slice(0, 4) : '000/' + hoje().slice(0, 4), maxlength: 20, inputmode: 'numeric' });
    const fData = el('input', { type: 'date', value: r.data_oficio });
    const fSol = txt(r.oficio_solicitante, { placeholder: 'Ex.: 172/2026', maxlength: 40 });
    const fDataSol = el('input', { type: 'date', value: r.data_solicitante });
    const fFin = area(r.finalidade, { rows: 2, placeholder: 'à aquisição de insumos para a produção de massa asfáltica a frio…' });
    const fAnexos = el('input', { type: 'checkbox', checked: r.anexos });
    const fAnexosTxt = area('', { rows: 2 });
    const avisoNum = el('span', { class: 'ajuda' });
    const conferirNumero = () => {
      const v = fNum.value.trim();
      const dup = v && b.pedidos.find((p) => p.numero_oficio === v);
      avisoNum.className = 'ajuda' + (dup ? ' ajuda-erro' : '');
      avisoNum.textContent = dup ? 'Já existe o Ofício nº ' + v + ' (' + (b.orgaosPorId[dup.orgao_id] || {}).nome + ').' : ult ? 'Último número usado em ' + hoje().slice(0, 4) + ': ' + String(ult).padStart(3, '0') + '/' + hoje().slice(0, 4) + '.' : 'Número definido por vocês.';
    };
    fNum.addEventListener('input', () => { r.numero_oficio = fNum.value.trim(); conferirNumero(); });
    fNum.addEventListener('blur', () => { const m = fNum.value.trim().match(/^(\d{1,4})$/); if (m) { fNum.value = m[1].padStart(3, '0') + '/' + (fData.value || hoje()).slice(0, 4); r.numero_oficio = fNum.value; conferirNumero(); } });
    fData.addEventListener('change', () => { r.data_oficio = fData.value; atualizar(); });
    fSol.addEventListener('input', () => (r.oficio_solicitante = fSol.value.trim()));
    fDataSol.addEventListener('change', () => (r.data_solicitante = fDataSol.value));
    fFin.addEventListener('input', () => (r.finalidade = fFin.value));
    fAnexos.addEventListener('change', () => { r.anexos = fAnexos.checked; fAnexosTxt.hidden = !r.anexos; });
    fAnexosTxt.addEventListener('input', () => (r.anexos_texto = fAnexosTxt.value));
    fAnexosTxt.hidden = !r.anexos;

    // --- Atas
    const selAta = sel([['', 'Adicionar ata ao pedido…'], ...b.atas.filter((a) => a.ativo !== false).map((a) => [a.id, 'ARP ' + a.numero + ' · ' + a.detentora + (a.vigencia_fim && diasAte(a.vigencia_fim) < 0 ? ' (vencida)' : '')])], '');
    const chips = el('div', { class: 'chips-atas' });
    const grupos = el('div');
    selAta.addEventListener('change', () => {
      const id = selAta.value; selAta.value = '';
      if (!id || r.atas.includes(id)) return;
      const ata = b.atasPorId[id];
      // Outras atas do mesmo pregão costumam vir juntas: adiciona de uma vez
      const irmas = b.atas.filter((a) => a.pregao === ata.pregao && a.id !== id && !r.atas.includes(a.id));
      r.atas.push(id);
      if (irmas.length) toast('Dica: o Pregão ' + ata.pregao + ' tem também ' + irmas.map((a) => 'ARP ' + a.numero).join(', ') + '. Adicione se o pedido incluir.');
      desenharAtas(); atualizar();
    });

    const barra = el('div', { class: 'barra-pedido' });
    const btnPrevia = el('button', { type: 'button', class: 'btn btn-claro', onclick: () => salvar(true) }, 'Baixar prévia do ofício');
    const btnSalvar = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => salvar(false) }, 'Registrar pedido e gerar ofício');

    function linhas() {
      const out = [];
      for (const ataId of r.atas) for (const i of b.itens.filter((x) => x.ata_id === ataId)) { const q = r.qtd[i.id]; if (q != null && q !== '' && Number(q) > 0) out.push({ item_id: i.id, qtd: Number(q) }); }
      return out;
    }
    function desenharAtas() {
      rc(chips, ...r.atas.map((id) => { const a = b.atasPorId[id]; return el('span', { class: 'chip-ata' }, 'ARP ' + a.numero, el('button', { type: 'button', 'aria-label': 'Tirar a ARP ' + a.numero + ' do pedido', onclick: () => { r.atas = r.atas.filter((x) => x !== id); b.itens.filter((i) => i.ata_id === id).forEach((i) => delete r.qtd[i.id]); desenharAtas(); atualizar(); } }, '×')); }));
      rc(grupos, ...r.atas.map((id) => {
        const a = b.atasPorId[id];
        const itens = b.itens.filter((i) => i.ata_id === id);
        const busca = el('input', { type: 'search', class: 'busca', placeholder: 'Filtrar itens desta ata', style: 'max-width:320px;height:38px', hidden: itens.length < 8 });
        const corpo = itens.map((i) => {
          const inp = el('input', { type: 'number', class: 'qtd', min: '0', step: 'any', inputmode: 'decimal', value: r.qtd[i.id] ?? '', 'aria-label': 'Quantidade do item ' + i.numero, 'data-item': i.id });
          inp.addEventListener('input', () => { r.qtd[i.id] = inp.value; atualizar(); });
          return el('tr', { 'data-linha': i.id, 'data-busca': normalizar(i.numero + ' ' + i.descricao) },
            el('td', { class: 'num' }, i.numero), el('td', { class: 'desc' }, i.descricao), el('td', null, i.unidade || ''),
            el('td', { class: 'num' }, R.num(i.qtd_registrada, 2)), el('td', { class: 'num', 'data-col': 'so' }), el('td', { class: 'num', 'data-col': 'st' }),
            el('td', null, inp), el('td', { class: 'resultado', 'data-col': 'res' }));
        });
        busca.addEventListener('input', () => { const t = normalizar(busca.value); corpo.forEach((tr) => (tr.hidden = t && !tr.dataset.busca.includes(t) && !(r.qtd[tr.dataset.linha] > 0))); });
        return el('div', { class: 'grupo-ata' },
          el('h3', null, 'ARP ' + a.numero, el('span', { class: 'sub-linha' }, a.detentora + ' · Pregão ' + a.pregao), etiquetaVigencia(a)), busca,
          el('div', { class: 'tabela-caixa', 'data-sem-paginas': '1' }, el('table', { class: 'tabela' },
            el('thead', null, el('tr', null, ['Item', 'Descrição', 'Und.', 'Registrado', 'Disponível para o órgão', 'Saldo da ata (dobro)', 'Qtd solicitada', 'Resultado'].map((t, k) => el('th', { scope: 'col', class: k === 0 || (k >= 3 && k <= 5) ? 'num' : null }, t)))),
            el('tbody', null, corpo))));
      }));
      if (!r.atas.length) rc(grupos, el('p', { class: 'vazio' }, 'Adicione a(s) ata(s) do pedido para digitar as quantidades.'));
    }
    function atualizar() {
      const org = b.orgaosPorId[r.orgao_id];
      // Saldos por item (sem as quantidades deste pedido)
      for (const tr of grupos.querySelectorAll('tr[data-linha]')) {
        const i = b.itensPorId[tr.dataset.linha], cons = consumo(i.id, r.substitui);
        const uo = org ? cons.porOrg[org.id] || 0 : null;
        const so = org ? Math.max(0, i.qtd_registrada * 0.5 - uo) : null, st = Math.max(0, i.qtd_registrada * 2 - cons.tot);
        const cso = tr.querySelector('[data-col=so]');
        rc(cso, org ? R.num(Math.min(so, st), 2) : '—', org ? el('span', { class: 'sub-linha' }, 'já aderiu ' + R.num(uo, 2) + ' de ' + R.num(i.qtd_registrada * 0.5, 2)) : el('span', { class: 'sub-linha' }, 'escolha o órgão'));
        cso.classList.toggle('saldo-zero', !!org && Math.min(so, st) <= 0);
        const cst = tr.querySelector('[data-col=st]'); cst.textContent = R.num(st, 2); cst.classList.toggle('saldo-zero', st <= 0);
        tr.querySelector('[data-col=res]').replaceChildren(); tr.className = '';
      }
      const ls = linhas();
      const res = org ? R.analisar(b, org, r.data_oficio, ls, r.substitui) : [];
      let aut = 0, neg = 0, valor = 0;
      res.forEach((x) => {
        const tr = grupos.querySelector('tr[data-linha="' + x.item.id + '"]'); if (!tr) return;
        const cel = tr.querySelector('[data-col=res]');
        if (x.decisao === 'autorizado') {
          aut++; if (x.preco != null) valor += x.q * x.preco;
          tr.className = 'lin-autorizado';
          cel.className = 'resultado ok';
          rc(cel, el('strong', null, '✓ Autorizado'), x.preco != null ? 'R$ ' + R.moeda(x.q * x.preco) : null, x.alertas.map((t) => el('span', { class: 'alerta' }, t)));
        } else if (x.decisao === 'negado') {
          neg++; tr.className = 'lin-negado'; cel.className = 'resultado nao';
          rc(cel, el('strong', null, '✕ Negado'), x.motivo, el('span', { class: 'alerta' }, 'Disponível para este órgão: ' + R.num(x.disponivel, 2)));
        }
      });
      if (!org && ls.length) rc(barra, el('span', { class: 'msg msg-falta m-0' }, 'Escolha o órgão solicitante para conferir os limites.'), el('div', { class: 'botoes' }, btnPrevia, btnSalvar));
      else rc(barra, 
        el('div', { class: 'contagem' }, el('span', { class: 'etiqueta etiqueta-autorizado' }, aut + ' autorizado(s)'), el('span', { class: 'etiqueta etiqueta-negado' }, neg + ' negado(s)'),
          el('span', { class: 'total' }, 'Valor autorizado: R$ ' + R.moeda(valor)),
          res.length ? el('span', { class: 'etiqueta ' + SIT[R.situacao(res)][1] }, 'Ofício: ' + SIT[R.situacao(res)][0].toLowerCase()) : null),
        el('div', { class: 'botoes' }, btnPrevia, btnSalvar));
      btnSalvar.disabled = btnPrevia.disabled = !org || !ls.length;
      // Texto padrão dos anexos acompanha os pregões escolhidos
      if (r.anexos_texto == null || fAnexosTxt._auto) { fAnexosTxt.value = textoAnexos([...new Set(r.atas.map((id) => b.atasPorId[id].pregao))]); fAnexosTxt._auto = true; }
      return res;
    }
    fAnexosTxt.addEventListener('input', () => (fAnexosTxt._auto = false));
    if (r.anexos_texto != null) fAnexosTxt.value = r.anexos_texto;

    async function salvar(previa) {
      const org = b.orgaosPorId[r.orgao_id];
      if (!marcarErro(selOrg, org ? '' : 'Escolha o órgão.')) return;
      const ls = linhas(); if (!ls.length) { toast('Digite a quantidade de pelo menos um item.', true); return; }
      const num = fNum.value.trim();
      const pedido = { numero_oficio: num || null, data_oficio: r.data_oficio || hoje(), orgao_id: org.id, oficio_solicitante: r.oficio_solicitante || null, data_solicitante: r.data_solicitante || null,
        finalidade: r.finalidade.trim() || null, anexos_texto: r.anexos ? fAnexosTxt.value.trim() : null };
      if (previa) {
        const res = R.analisar(b, org, pedido.data_oficio, ls, r.substitui).filter((x) => x.decisao !== 'invalido');
        const dados = { pedido, orgao: org, linhas: res, config: b.config };
        await baixar('PRÉVIA - ' + O.nomeArquivo(dados), await O.gerarDocx(dados)); return;
      }
      if (!marcarErro(fNum, num ? (b.pedidos.some((p) => p.numero_oficio === num && p.id !== r.substitui) ? 'Esse número já foi usado.' : '') : 'Informe o número do ofício do CIMOP.')) return;
      const res = R.analisar(b, org, pedido.data_oficio, ls, r.substitui);
      const neg = res.filter((x) => x.decisao === 'negado').length;
      const ok = await confirmar(r.substitui ? 'Gravar a correção' : 'Registrar o pedido', el('div', null,
        el('p', null, 'Ofício nº ', el('strong', null, num), ' para ', el('strong', null, org.nome), '.'),
        r.substitui ? el('p', { class: 'msg msg-info' }, 'O pedido original fica no histórico como "substituído" e sai do saldo; este passa a valer com o mesmo número.') : null,
        el('p', null, res.length - neg + ' item(ns) autorizado(s) e ' + neg + ' negado(s). O saldo das atas é atualizado e o ofício em Word é baixado em seguida.'),
        neg ? el('p', { class: 'msg msg-falta' }, 'Itens negados entram no ofício com o motivo e o saldo disponível.') : null), 'Registrar e gerar ofício');
      if (!ok) return;
      ocupado(btnSalvar, 'Registrando…');
      try {
        const id = r.substitui ? await D.substituirPedido(r.substitui, { ...pedido, origem: r.origem || undefined, itens: ls.map((l) => ({ ...l, periodo: r.periodos && r.periodos[l.item_id] })) })
          : await D.registrarPedido({ ...pedido, itens: ls });
        if (r.solicitacao_id) await D.atualizarSolicitacao(r.solicitacao_id, { situacao: 'atendida', pedido_id: id, orgao_id: org.id });
        await recarregar();
        const p = estado.base.pedidosPorId[id];
        rascunho = null;
        toast((p.substitui_id ? 'Correção gravada: ' : 'Pedido registrado: ') + SIT[p.situacao][0].toLowerCase() + '. Gerando o ofício…');
        location.hash = '#pedido-' + id;
        await baixarOficio(p);
      } catch (e) { toast(e.message, true); ocupado(btnSalvar); }
    }

    const solOrigem = r.solicitacao_id && b.solicitacoes.find((x) => x.id === r.solicitacao_id);
    rc(c,
      cabecalho(r.substitui ? 'Corrigir pedido de adesão' : 'Novo pedido de adesão', 'Digite as quantidades pedidas: o sistema confere os limites na hora e gera o ofício ao registrar.',
        el('button', { type: 'button', class: 'btn btn-claro', onclick: async () => { if (await confirmar('Limpar o formulário', 'Apaga o que foi digitado neste pedido.', 'Limpar', true)) { rascunho = null; rotear(); } } }, 'Limpar')),
      r.substitui && b.pedidosPorId[r.substitui] ? el('div', { class: 'msg msg-falta' }, el('strong', null, 'Corrigindo o Ofício nº ' + (b.pedidosPorId[r.substitui].numero_oficio || 's/n') + '. '),
        'Ajuste itens e quantidades. Os limites são conferidos sem contar o pedido original. Ao gravar, o original fica no histórico como "substituído" e este passa a valer com o mesmo número. ',
        el('a', { class: 'link', href: '#pedido-' + r.substitui, onclick: () => { rascunho = null; } }, 'Desistir da correção')) : null,
      solOrigem ? el('p', { class: 'msg msg-info' }, 'Lançando a solicitação ', el('strong', null, solOrigem.protocolo), ' recebida pelo formulário online. Confira as quantidades, informe o nº do ofício e registre: a solicitação fica como atendida.') : null,
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' }, el('h2', null, 'Solicitante'),
          campo('np-orgao', 'Órgão ou entidade', selOrg, 'O limite de 50% é por CNPJ. Fundo, autarquia ou Câmara com CNPJ próprio é outro órgão.', true), ficha,
          el('button', { type: 'button', class: 'btn btn-claro', onclick: () => formOrgao({}, (o) => { r.orgao_id = o.id; rotear(); }) }, '+ Cadastrar órgão novo')),
        el('section', { class: 'cartao' }, el('h2', null, 'Ofício'),
          el('div', { class: 'grade-campos' }, el('div', { class: 'campo' }, el('label', { for: 'np-num' }, 'Nº do ofício do CIMOP', el('span', { class: 'obrigatorio' }, ' *')), (fNum.id = 'np-num', fNum), avisoNum, el('span', { class: 'erro-campo', id: 'np-num-erro' })),
            campo('np-data', 'Data do ofício', fData, null, true)),
          el('div', { class: 'grade-campos' }, campo('np-sol', 'Ofício do solicitante', fSol), campo('np-datasol', 'Data do pedido', fDataSol)),
          campo('np-fin', 'A adesão destina-se…', fFin, 'Completa a frase "A adesão destina-se …" do ofício. Opcional.'),
          el('label', { class: 'checkbox' }, fAnexos, ' Encaminhar anexos (processo e resoluções)'), el('div', { class: 'campo campo-anexos' }, (fAnexosTxt.setAttribute('aria-label', 'Texto dos anexos'), fAnexosTxt)))),
      el('section', { class: 'cartao' }, el('h2', null, 'Atas e quantidades'),
        el('div', { class: 'grade-campos' }, campo('np-ata', 'Ata', selAta, 'Pode juntar várias atas no mesmo ofício.')), chips, grupos, barra));
    conferirNumero(); desenharFicha(); desenharAtas(); atualizar();
  };

  // ================================================================= PEDIDOS
  function tabelaPedidos(lista) {
    const b = estado.base;
    return tabela(['Ofício', 'Data', 'Órgão', 'Atas', 'Itens', 'Valor autorizado (R$)', 'Situação', ''], lista.map((p) => {
      const ls = linhasDoPedido(p), o = b.orgaosPorId[p.orgao_id];
      const atas = [...new Set(ls.map((l) => l.ata.numero))];
      return el('tr', null,
        el('td', null, el('a', { href: '#pedido-' + p.id }, el('strong', null, p.numero_oficio || 'sem nº'))),
        el('td', { class: 'num' }, R.dataBR(p.data_oficio) || '—'),
        el('td', null, o ? o.nome : '?', p.oficio_solicitante ? el('span', { class: 'sub-linha' }, 'Ofício solicitante nº ' + p.oficio_solicitante) : null),
        el('td', null, atas.join(', ')),
        el('td', { class: 'num' }, ls.filter((l) => l.decisao === 'autorizado').length + ' ✓' + (ls.some((l) => l.decisao === 'negado') ? ' · ' + ls.filter((l) => l.decisao === 'negado').length + ' ✕' : '')),
        el('td', { class: 'num' }, R.moeda(valorPedido(p))),
        el('td', null, etiquetaSit(p.situacao), p.origem === 'migracao' ? el('span', { class: 'etiqueta etiqueta-migracao ml-1' }, 'migrado') : null),
        el('td', { class: 'acoes' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: async (e) => { const bt = e.currentTarget; ocupado(bt, 'Gerando…'); try { await baixarOficio(p); } finally { ocupado(bt); } } }, 'Ofício (Word)')));
    }));
  }

  const filtrosPedidos = { texto: '', situacao: '', ata: '', ano: '', origem: '' };
  TELAS.pedidos = (c) => {
    const b = estado.base, f = filtrosPedidos;
    const anos = [...new Set(b.pedidos.map((p) => (p.data_oficio || '').slice(0, 4)).filter(Boolean))].sort().reverse();
    const iTexto = el('input', { type: 'search', placeholder: 'Buscar por nº do ofício ou órgão', value: f.texto, 'aria-label': 'Buscar' });
    const iSit = sel([['', 'Todas as situações'], ...Object.entries(SIT).map(([k, v]) => [k, v[0]])], f.situacao, { 'aria-label': 'Situação' });
    const iAta = sel([['', 'Todas as atas'], ...b.atas.map((a) => [a.id, 'ARP ' + a.numero])], f.ata, { 'aria-label': 'Ata' });
    const iAno = sel([['', 'Todos os anos'], ...anos.map((a) => [a, a])], f.ano, { 'aria-label': 'Ano' });
    const lista = el('div');
    const filtrar = () => {
      Object.assign(f, { texto: iTexto.value, situacao: iSit.value, ata: iAta.value, ano: iAno.value });
      const t = normalizar(f.texto);
      const res = b.pedidos.filter((p) => {
        const o = b.orgaosPorId[p.orgao_id];
        if (t && !normalizar((p.numero_oficio || '') + ' ' + (o ? o.nome + ' ' + (o.cnpj || '') : '') + ' ' + (p.oficio_solicitante || '')).includes(t)) return false;
        if (f.situacao && p.situacao !== f.situacao) return false;
        if (f.ano && !(p.data_oficio || '').startsWith(f.ano)) return false;
        if (f.ata && !b.pedido_itens.some((pi) => pi.pedido_id === p.id && b.itensPorId[pi.item_id].ata_id === f.ata)) return false;
        return true;
      }).sort((x, y) => ordOficio(y) - ordOficio(x) || (y.data_oficio || '').localeCompare(x.data_oficio || ''));
      rc(lista, el('div', { class: 'rodape-lista' }, el('span', { class: 'ajuda' }, res.length + ' pedido(s)'),
        el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => baixar('Pedidos de adesão.xlsx', PL.listaPedidos(b, res), XLSX_T) }, 'Exportar para Excel')),
        res.length ? tabelaPedidos(res) : el('p', { class: 'vazio' }, 'Nenhum pedido com esses filtros.'));
      paginarTudo(lista);
    };
    [iTexto, iSit, iAta, iAno].forEach((i) => i.addEventListener(i.tagName === 'INPUT' ? 'input' : 'change', filtrar));
    rc(c, cabecalho('Pedidos e ofícios', 'Cada pedido gera um ofício. O Word é refeito a qualquer momento a partir do que foi registrado.', podeEditar() ? el('a', { class: 'btn btn-primario', href: '#novo' }, '+ Novo pedido') : null),
      el('div', { class: 'filtros' }, iTexto, iSit, iAta, iAno), lista);
    filtrar();
  };


  // ---------------------------------------------------------------- e-mail de resposta (só sai depois de revisado e confirmado)
  function linkPncpDaAta(a) {
    const m = String(a.numero_controle_pncp || '').match(/^(\d{14})-\d-(\d+)\/(\d{4})-\d+$/);
    return m ? 'https://pncp.gov.br/app/editais/' + m[1] + '/' + m[3] + '/' + Number(m[2]) : '';
  }
  const linkProcesso = (a) => (a.link_processo || '').trim() || linkPncpDaAta(a);
  function blocoDocumentos(p) {
    const b = estado.base, cf = b.config;
    const atas = [...new Map(linhasDoPedido(p).map((l) => [l.ata.id, l.ata])).values()];
    const linhas = [], faltam = [];
    for (const a of atas) {
      const url = linkProcesso(a);
      if (url) linhas.push('• Processo completo do Pregão Eletrônico nº ' + a.pregao + ' (ARP ' + a.numero + '): ' + url);
      else faltam.push(a);
    }
    for (const d of cf.documentos || []) if (d && d.titulo && d.url) linhas.push('• ' + d.titulo + ': ' + d.url);
    return { texto: linhas.length ? 'Documentos (acesso pelos links):\n' + linhas.join('\n') : '', faltam };
  }
  function preencherModelo(t, p) {
    const b = estado.base, cf = b.config, o = b.orgaosPorId[p.orgao_id];
    const sol = b.solicitacoes.find((x) => x.pedido_id === p.id);
    const assunto = { autorizado: 'Autorização de adesão', parcial: 'Autorização parcial de adesão', negado: 'Pedido de adesão' }[p.situacao] || 'Pedido de adesão';
    const solTxt = (p.oficio_solicitante ? 'feita pelo Ofício nº ' + p.oficio_solicitante + (p.data_solicitante ? ', de ' + R.dataBR(p.data_solicitante) : '') : 'encaminhada a este Consórcio') + (sol ? ' (protocolo ' + sol.protocolo + ')' : '');
    const mapa = { oficio: p.numero_oficio || 's/n', sigla: cf.sigla, assunto, vocativo: String(O.vocativo(o) || 'Senhor(a)').replace(/,\s*$/, ''), solicitacao: solTxt, orgao_destino: o.nome,
      documentos: blocoDocumentos(p).texto, presidente: cf.presidente_nome, presidente_cargo: cf.presidente_cargo, orgao: cf.orgao_nome };
    return String(t || '').replace(/\{(\w+)\}/g, (m, k) => (k in mapa ? mapa[k] : m)).replace(/\n{3,}/g, '\n\n');
  }
  const paraBase64 = (blob) => new Promise((ok, erro) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = erro; r.readAsDataURL(blob); });
  async function revisarEmail(p, depois) {
    const b = estado.base, cf = b.config, o = b.orgaosPorId[p.orgao_id];
    const sol = b.solicitacoes.find((x) => x.pedido_id === p.id);
    const docs = blocoDocumentos(p);
    const f = { para: txt(o.email || (sol && sol.email) || '', { type: 'text', placeholder: 'email@municipio.rn.gov.br' }), copia: txt(cf.email_copia || ''),
      assunto: txt(preencherModelo(cf.email_assunto, p)), corpo: area(preencherModelo(cf.email_corpo, p), { rows: 16 }), anexo: el('input', { type: 'checkbox', checked: true }) };
    const dadosOf = { pedido: p, orgao: o, linhas: linhasDoPedido(p), config: cf };
    const nomeOf = O.nomeArquivo(dadosOf);
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar e-mail');
    const d = abrirDialogo('E-mail ao órgão · Ofício nº ' + (p.numero_oficio || 's/n'), el('div', null,
      el('p', { class: 'msg msg-info' }, 'Confira e ajuste o texto. O e-mail só sai quando você clicar em "Enviar e-mail". As respostas do órgão vão para ' + (cf.email_resposta || 'o e-mail configurado em Configurações') + '.'),
      docs.faltam.length ? el('p', { class: 'msg msg-falta' }, 'Sem link do processo: ARP ' + docs.faltam.map((a) => a.numero).join(', ') + '. Cadastre em "Editar ata" (pode ser o link do PNCP, do portal da transparência ou de outra plataforma).') : null,
      !(cf.documentos || []).length ? el('p', { class: 'msg msg-falta' }, 'Nenhum link de resolução cadastrado. Cadastre uma vez em Configurações › E-mail e documentos.') : null,
      el('div', { class: 'grade-campos' }, campo('em-para', 'Para', f.para, 'Separe vários e-mails com vírgula.', true), campo('em-cc', 'Cópia', f.copia)),
      campo('em-assunto', 'Assunto', f.assunto, null, true), campo('em-corpo', 'Texto', f.corpo),
      el('label', { class: 'checkbox' }, f.anexo, ' Anexar o ofício em Word (' + nomeOf + ')')), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      const lista = f.para.value.split(/[,;\s]+/).filter(Boolean);
      if (!marcarErro(f.para, !lista.length ? 'Informe o e-mail do órgão.' : lista.some((e) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.assunto, f.assunto.value.trim() ? '' : 'Informe o assunto.')) return;
      ocupado(btn, 'Enviando…');
      try {
        const anexos = f.anexo.checked ? [{ nome: nomeOf, tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', base64: await paraBase64(await O.gerarDocx(dadosOf)) }] : [];
        await D.enviarEmail({ pedido_id: p.id, para: f.para.value, copia: f.copia.value, assunto: f.assunto.value.trim(), corpo: f.corpo.value, anexos });
        if (!o.email && lista.length) { try { await D.salvar('orgaos', { id: o.id, email: lista[0] }); await recarregar(); } catch (e) {} }
        d.close(); toast('E-mail enviado para ' + lista.join(', ') + '.'); depois && depois();
      } catch (e) { ocupado(btn); toast(e.message, true); }
    });
  }
  function cartaoEmails(p) {
    const caixa = el('section', { class: 'cartao' }, el('h2', null, 'E-mail ao órgão'), el('p', { class: 'ajuda' }, 'Carregando…'));
    Promise.resolve(D.emailsDoPedido ? D.emailsDoPedido(p.id) : []).catch(() => []).then((lista) => {
      const btn = podeEditar() && p.situacao !== 'cancelado' ? el('button', { type: 'button', class: 'btn ' + (lista.some((x) => x.situacao === 'enviado') ? 'btn-claro' : 'btn-primario'), onclick: () => revisarEmail(p, () => rotear()) },
        lista.some((x) => x.situacao === 'enviado') ? 'Enviar de novo' : 'Revisar e enviar e-mail') : null;
      rc(caixa, el('h2', null, 'E-mail ao órgão'),
        lista.length ? tabela(['Enviado em', 'Para', 'Anexos', 'Situação', 'Por'], lista.map((x) => el('tr', null,
          el('td', { class: 'num' }, new Date(x.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })),
          el('td', null, x.para, x.copia ? el('span', { class: 'sub-linha' }, 'cópia: ' + x.copia) : null), el('td', null, (x.anexos || []).join(', ') || '—'),
          el('td', null, el('span', { class: 'etiqueta ' + (x.situacao === 'enviado' ? 'etiqueta-ativo' : 'etiqueta-negado'), title: x.erro || '' }, x.situacao === 'enviado' ? 'Enviado' : 'Falhou')),
          el('td', null, x.enviado_por_nome || '—'))))
          : el('p', { class: 'ajuda' }, 'Ainda não foi enviado. O e-mail leva o ofício anexo e os links do processo completo e das resoluções; você revisa o texto antes de enviar.'),
        btn ? el('div', { class: 'mt-05' }, btn) : null);
    });
    return caixa;
  }

  TELAS.pedido = (c, id) => {
    const b = estado.base, p = b.pedidosPorId[id];
    if (!p) { rc(c, cabecalho('Pedido não encontrado', null, el('a', { class: 'btn btn-claro', href: '#pedidos' }, 'Voltar'))); return; }
    const o = b.orgaosPorId[p.orgao_id], ls = linhasDoPedido(p);
    const btnWord = el('button', { type: 'button', class: 'btn btn-primario', onclick: async () => { ocupado(btnWord, 'Gerando…'); try { await baixarOficio(p); } finally { ocupado(btnWord); } } }, 'Baixar ofício (Word)');
    const acoes = [el('a', { class: 'btn btn-claro', href: '#pedidos' }, '‹ Pedidos'), btnWord];
    if (podeEditar() && p.situacao !== 'cancelado') {
      acoes.splice(1, 0, el('button', { type: 'button', class: 'btn btn-claro', onclick: () => editarPedido(p) }, 'Editar dados do ofício'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => corrigirPedido(p) }, 'Corrigir itens e quantidades'),
        el('button', { type: 'button', class: 'btn btn-claro btn-texto-perigo', onclick: () => cancelarPedido(p) }, 'Cancelar pedido'));
    }
    rc(c,
      cabecalho('Ofício nº ' + (p.numero_oficio || 's/n'), o.nome, ...acoes),
      p.situacao === 'cancelado' ? el('p', { class: 'msg msg-erro' }, 'Pedido cancelado: ' + (p.motivo_cancelamento || '') + ' O saldo voltou para as atas.',
        p.substituido_por && b.pedidosPorId[p.substituido_por] ? [' ', el('a', { class: 'link', href: '#pedido-' + p.substituido_por }, 'Ver o pedido corrigido')] : null) : null,
      p.substitui_id && b.pedidosPorId[p.substitui_id] ? el('p', { class: 'msg msg-info' }, 'Este pedido corrige itens e quantidades de um lançamento anterior. ', el('a', { class: 'link', href: '#pedido-' + p.substitui_id }, 'Ver o original')) : null,
      p.origem === 'migracao' ? el('p', { class: 'msg msg-info' }, 'Pedido migrado da planilha antiga: as quantidades foram gravadas como autorizadas na época, sem nova conferência.') : null,
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' }, el('h2', null, 'Dados do pedido'),
          el('dl', { class: 'dados' },
            el('dt', null, 'Situação'), el('dd', null, etiquetaSit(p.situacao)),
            el('dt', null, 'Data do ofício'), el('dd', null, R.dataBR(p.data_oficio) || '—'),
            el('dt', null, 'Ofício do solicitante'), el('dd', null, p.oficio_solicitante ? p.oficio_solicitante + (p.data_solicitante ? ', de ' + R.dataBR(p.data_solicitante) : '') : '—'),
            el('dt', null, 'Finalidade'), el('dd', null, p.finalidade || '—'),
            el('dt', null, 'Lançado por'), el('dd', null, (p.criado_por_nome || '—') + (p.criado_em ? ' em ' + new Date(p.criado_em).toLocaleString('pt-BR') : '')))),
        el('section', { class: 'cartao' }, el('h2', null, 'Destinatário'),
          el('dl', { class: 'dados' }, el('dt', null, 'Órgão'), el('dd', null, o.nome), el('dt', null, 'CNPJ'), el('dd', null, o.cnpj ? O.formatarCnpj(o.cnpj) : '—'),
            el('dt', null, 'Responsável'), el('dd', null, o.responsavel || '—'), el('dt', null, 'Cargo'), el('dd', null, o.cargo || '—'), el('dt', null, 'E-mail'), el('dd', null, o.email || '—')),
          podeEditar() ? el('button', { type: 'button', class: 'link', onclick: () => formOrgao(o, () => rotear()) }, 'Editar órgão') : null)),
      el('section', { class: 'cartao' }, el('h2', null, 'Itens'),
        tabela(['ARP', 'Item', 'Descrição', 'Und.', 'Qtd solicitada', 'Qtd autorizada', 'Preço unit. (R$)', 'Valor (R$)', 'Decisão'], ls.map((l) => el('tr', { class: 'lin-' + l.decisao },
          el('td', null, l.ata.numero), el('td', { class: 'num' }, l.item.numero), el('td', { class: 'desc' }, l.item.descricao), el('td', null, l.item.unidade || ''),
          el('td', { class: 'num' }, R.num(l.q, 2)), el('td', { class: 'num' }, R.num(l.qAut, 2)),
          el('td', { class: 'num' }, l.preco != null ? R.moeda(l.preco) : '—', l.pi.preco_conferir ? el('span', { class: 'sub-linha ajuda-erro', title: 'Ofício sem data: confira o preço da época na tela do item (Preços e reequilíbrios).' }, 'conferir preço') : null),
          el('td', { class: 'num' }, l.preco != null ? R.moeda(l.qAut * l.preco) : '—'),
          el('td', { class: 'resultado ' + (l.decisao === 'autorizado' ? 'ok' : 'nao') }, el('strong', null, l.decisao === 'autorizado' ? '✓ Autorizado' : '✕ Negado'), l.motivo)))),
        el('p', { class: 'ajuda mt-05' }, 'Valor autorizado: R$ ' + R.moeda(valorPedido(p)))),
      p.origem !== 'migracao' ? cartaoEmails(p) : null);
  };

  function corrigirPedido(p) {
    const b = estado.base, qtd = {}, periodos = {}, atas = new Set();
    for (const pi of b.pedido_itens.filter((x) => x.pedido_id === p.id)) {
      const it = b.itensPorId[pi.item_id]; if (!it) continue;
      qtd[pi.item_id] = String(Number(pi.qtd_solicitada)); atas.add(it.ata_id);
      const per = pi.periodo_id && (b.periodos || []).find((x) => x.id === pi.periodo_id); if (per) periodos[pi.item_id] = per.numero;
    }
    rascunho = { ...novoRascunho(), orgao_id: p.orgao_id, numero_oficio: p.numero_oficio || '', data_oficio: p.data_oficio || hoje(), oficio_solicitante: p.oficio_solicitante || '',
      data_solicitante: p.data_solicitante || '', finalidade: p.finalidade || '', anexos: p.anexos_texto != null, anexos_texto: p.anexos_texto, atas: [...atas], qtd,
      substitui: p.id, origem: p.origem === 'migracao' ? 'migracao' : null, periodos };
    location.hash = '#novo';
  }

  function editarPedido(p) {
    const f = { num: txt(p.numero_oficio, { maxlength: 20 }), data: el('input', { type: 'date', value: p.data_oficio || '' }), sol: txt(p.oficio_solicitante, { maxlength: 40 }),
      datasol: el('input', { type: 'date', value: p.data_solicitante || '' }), fin: area(p.finalidade, { rows: 2 }), anexos: area(p.anexos_texto, { rows: 3 }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo('Editar dados do ofício', el('div', null,
      el('p', { class: 'msg msg-info' }, 'Itens e quantidades não mudam aqui (eles definem os saldos). Para mudar quantidades, cancele o pedido e lance outro.'),
      el('div', { class: 'grade-campos' }, campo('ep-num', 'Nº do ofício do CIMOP', f.num, null, true), campo('ep-data', 'Data do ofício', f.data)),
      el('div', { class: 'grade-campos' }, campo('ep-sol', 'Ofício do solicitante', f.sol), campo('ep-datasol', 'Data do pedido', f.datasol)),
      campo('ep-fin', 'A adesão destina-se…', f.fin), campo('ep-anexos', 'Texto dos anexos (em branco = sem anexos)', f.anexos)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      const num = f.num.value.trim();
      if (!marcarErro(f.num, !num ? 'Informe o número.' : estado.base.pedidos.some((x) => x.id !== p.id && x.numero_oficio === num) ? 'Esse número já foi usado.' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('pedidos', { id: p.id, numero_oficio: num, data_oficio: f.data.value || null, oficio_solicitante: f.sol.value.trim() || null, data_solicitante: f.datasol.value || null, finalidade: f.fin.value.trim() || null, anexos_texto: f.anexos.value.trim() || null });
        await recarregar(); d.close(); toast('Dados do ofício salvos.'); rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }
  function cancelarPedido(p) {
    const m = area('', { rows: 3, placeholder: 'Ex.: o município desistiu da adesão; ofício emitido com erro…' });
    const btn = el('button', { type: 'button', class: 'btn btn-perigo' }, 'Cancelar pedido');
    const d = abrirDialogo('Cancelar o Ofício nº ' + (p.numero_oficio || 's/n'), el('div', null,
      el('p', null, 'O pedido não é apagado: fica marcado como cancelado, com o motivo, e as quantidades voltam para o saldo das atas.'), campo('cp-motivo', 'Motivo', m, null, true)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Voltar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(m, m.value.trim() ? '' : 'Informe o motivo.')) return;
      ocupado(btn, 'Cancelando…');
      try { await D.cancelarPedido(p.id, m.value.trim()); await recarregar(); d.close(); toast('Pedido cancelado. Saldo devolvido.'); rotear(); } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ================================================================= ATAS
  TELAS.atas = (c) => {
    const b = estado.base;
    rc(c, cabecalho('Atas de registro de preços', b.atas.length + ' ata(s) · ' + b.itens.length + ' itens',
      podeEditar() ? el('a', { class: 'btn btn-claro', href: '#importar' }, 'Importar ata por planilha') : null,
      podeEditar() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formAta({}) }, '+ Nova ata') : null,
      el('button', { type: 'button', class: 'btn btn-claro', onclick: () => baixar('Mapa de adesões - todas as atas.xlsx', PL.mapa(b, b.atas), XLSX_T) }, 'Mapa de todas (Excel)')),
      b.atas.length ? tabela(['ARP', 'Pregão', 'Contratado', 'Vigência', 'Itens', 'Adesões', 'Valor aderido (R$)', 'Item mais consumido'], b.atas.map((a) => {
        const r = resumoAta(a);
        return el('tr', null, el('td', null, el('a', { href: '#ata-' + a.id }, el('strong', null, a.numero))), el('td', null, a.pregao),
          el('td', null, a.detentora, a.cnpj_detentora ? el('span', { class: 'sub-linha' }, O.formatarCnpj(a.cnpj_detentora)) : null), el('td', null, etiquetaVigencia(a)),
          el('td', { class: 'num' }, r.itens.length), el('td', { class: 'num' }, r.adesoes), el('td', { class: 'num' }, R.moeda(r.valor)), el('td', null, barraUso(r.maior)));
      })) : el('p', { class: 'vazio' }, 'Nenhuma ata cadastrada. Use "Importar ata por planilha".'));
  };

  TELAS.ata = (c, id) => {
    const b = estado.base, a = b.atasPorId[id];
    if (!a) { rc(c, cabecalho('Ata não encontrada', null, el('a', { class: 'btn btn-claro', href: '#atas' }, 'Voltar'))); return; }
    const itens = b.itens.filter((i) => i.ata_id === id);
    const abaItens = () => tabela(['Item', 'Descrição', 'Und.', 'Registrado', 'Preço unit. (R$)', 'Limite por órgão (50%)', 'Limite total (dobro)', 'Total aderido', 'Saldo (dobro)', 'Uso do dobro', ''], itens.map((i) => {
      const cons = consumo(i.id), saldo = 2 * i.qtd_registrada - cons.tot;
      return el('tr', null, el('td', { class: 'num' }, i.numero), el('td', { class: 'desc' }, i.descricao), el('td', null, i.unidade || ''), el('td', { class: 'num' }, R.num(i.qtd_registrada, 2)),
        el('td', { class: 'num' }, i.preco_unitario != null ? R.moeda(i.preco_unitario) : el('span', { class: 'falta-leve' }, 'falta')), el('td', { class: 'num' }, R.num(i.qtd_registrada * 0.5, 2)),
        el('td', { class: 'num' }, R.num(i.qtd_registrada * 2, 2)), el('td', { class: 'num' }, R.num(cons.tot, 2)), el('td', { class: 'num' + (saldo <= 0 ? ' saldo-zero' : '') }, R.num(saldo, 2)),
        el('td', null, barraUso(cons.tot / (2 * i.qtd_registrada) * 100)),
        el('td', { class: 'acoes' }, el('a', { class: 'link', href: '#item-' + i.id }, 'Aderentes'), el('a', { class: 'link ml-1', href: '#item-' + i.id, onclick: () => { estado.irPrecos = true; } }, 'Preços'), podeEditar() ? el('button', { type: 'button', class: 'link ml-1', onclick: () => formItem(a, i) }, 'Editar') : null));
    }), { 'data-sem-paginas': '1' });
    const abaMapa = () => mapaAdesoes(a, itens);
    const abaDados = () => el('dl', { class: 'dados' },
      el('dt', null, 'Pregão'), el('dd', null, a.pregao), el('dt', null, 'Processo'), el('dd', null, a.processo || '—'), el('dt', null, 'Objeto'), el('dd', null, a.objeto || '—'),
      el('dt', null, 'Contratado'), el('dd', null, a.detentora), el('dt', null, 'CNPJ'), el('dd', null, a.cnpj_detentora ? O.formatarCnpj(a.cnpj_detentora) : '—'),
      el('dt', null, 'Assinatura'), el('dd', null, R.dataBR(a.data_assinatura) || '—'), el('dt', null, 'Vigência'), el('dd', null, etiquetaVigencia(a), a.prorrogada ? ' (prorrogada)' : ''),
      el('dt', null, 'Cláusulas de adesão'), el('dd', null, a.clausulas_adesao || '—'), el('dt', null, 'Observações'), el('dd', null, a.observacoes || '—'));
    const ciclos = R.ciclosDa(b, a.id);
    const atual = R.cicloAtual(b, a.id);
    const selCiclo = ciclos.length > 1 ? sel(ciclos.map((cc, k) => [cc.id, 'Ciclo ' + (k + 1) + ': ' + R.dataBR(cc.inicio) + ' a ' + R.dataBR(cc.fim) + (cc.id === atual ? ' (atual)' : '')]), cicloVer(a.id), { 'aria-label': 'Ciclo de quantitativos' }) : null;
    if (selCiclo) selCiclo.addEventListener('change', () => { estado.ciclos[a.id] = selCiclo.value; rotear(); });
    const abaVig = () => {
      const ps = R.periodosDa(b, a.id);
      return [
        el('p', { class: 'ajuda' }, 'Cada prorrogação é um período. Se o termo aditivo renovar os quantitativos, começa um novo ciclo: os limites de 50% e do dobro passam a contar só as adesões do novo ciclo e o saldo anterior não se soma. Prorrogação sem renovação continua o mesmo ciclo.'),
        ps.length ? tabela(['Período', 'Início', 'Fim', 'Quantitativos', 'Instrumento', ''], ps.map((p) => el('tr', null,
          el('td', null, p.numero === 1 ? 'Vigência original' : p.numero - 1 + 'ª prorrogação'), el('td', { class: 'num' }, R.dataBR(p.inicio)), el('td', { class: 'num' }, R.dataBR(p.fim)),
          el('td', null, p.numero === 1 ? 'Originais' : p.renova_quantitativos ? el('span', { class: 'etiqueta etiqueta-ativo' }, 'Renovados (novo ciclo)') : el('span', { class: 'etiqueta' }, 'Mantidos (mesmo saldo)')),
          el('td', null, p.instrumento || '—', p.observacoes ? el('span', { class: 'sub-linha' }, p.observacoes) : null),
          el('td', { class: 'acoes' }, podeEditar() ? el('button', { type: 'button', class: 'link', onclick: () => formPeriodo(a, p) }, 'Editar') : null))), { 'data-sem-paginas': '1' })
          : el('p', { class: 'vazio' }, 'Nenhum período cadastrado. Cadastre a vigência original da ata.'),
        podeEditar() ? el('div', { class: 'linha-botoes mt-05' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formPeriodo(a, {}) }, ps.length ? '+ Registrar prorrogação' : '+ Vigência original')) : null];
    };
    rc(c,
      cabecalho('ARP ' + a.numero, a.detentora + ' · Pregão ' + a.pregao, el('a', { class: 'btn btn-claro', href: '#atas' }, '‹ Atas'),
        el('button', { type: 'button', class: 'btn btn-claro', onclick: () => baixar('Mapa de adesões - ARP ' + a.numero.replace('/', '-') + '.xlsx', PL.mapa(b, [a]), XLSX_T) }, 'Mapa (Excel)'),
        podeEditar() ? el('button', { type: 'button', class: 'btn btn-claro', onclick: () => formItem(a, {}) }, '+ Item') : null,
        podeEditar() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formAta(a) }, 'Editar ata') : null),
      selCiclo ? el('div', { class: 'faixa-ciclo' }, el('strong', null, 'Quantitativos renovados.'), ' Saldos e mapa do ciclo:', selCiclo,
        cicloVer(a.id) !== atual ? el('span', { class: 'etiqueta etiqueta-pendente' }, 'vendo ciclo anterior') : null) : null,
      abas([['itens', 'Itens e saldos (' + itens.length + ')', abaItens], ['mapa', 'Mapa de adesões', abaMapa], ['vigencias', 'Vigências e prorrogações (' + R.periodosDa(b, a.id).length + ')', abaVig], ['dados', 'Dados da ata', abaDados]]));
  };

  function formPeriodo(a, p) {
    const ps = R.periodosDa(estado.base, a.id);
    const ult = ps[ps.length - 1];
    const somaDias = (d, n) => { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); };
    const umAno = (d) => { const x = new Date(d + 'T12:00:00'); x.setFullYear(x.getFullYear() + 1); return x.toISOString().slice(0, 10); };
    const novo = !p.id;
    const numero = p.numero || (ult ? ult.numero + 1 : 1);
    const ini0 = p.inicio || (ult ? somaDias(ult.fim, 1) : a.data_assinatura || '');
    const f = { inicio: el('input', { type: 'date', value: ini0 }), fim: el('input', { type: 'date', value: p.fim || (ini0 ? (ult ? somaDias(umAno(ini0), -1) : umAno(ini0)) : '') }),
      renova: el('input', { type: 'checkbox', checked: !!p.renova_quantitativos }), instrumento: txt(p.instrumento || (numero === 1 ? 'Vigência original' : numero - 1 + 'º Termo Aditivo'), { maxlength: 160 }),
      obs: area(p.observacoes, { rows: 2 }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo((numero === 1 ? 'Vigência original' : numero - 1 + 'ª prorrogação') + ' · ARP ' + a.numero, el('div', null,
      el('div', { class: 'grade-campos' }, campo('fp-ini', 'Início', f.inicio, null, true), campo('fp-fim', 'Fim', f.fim, null, true)),
      numero > 1 ? el('label', { class: 'checkbox declaracao' }, f.renova, ' O termo aditivo renova os quantitativos originalmente registrados (começa novo ciclo: saldo e limites de 50% e do dobro recomeçam; o saldo não usado do período anterior não se soma).') : null,
      campo('fp-inst', 'Instrumento', f.instrumento, 'Ex.: 1º Termo Aditivo, de 13/11/2026'), campo('fp-obs', 'Observações', f.obs)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.inicio, f.inicio.value ? '' : 'Informe o início.')) return;
      if (!marcarErro(f.fim, !f.fim.value ? 'Informe o fim.' : f.fim.value < f.inicio.value ? 'O fim é antes do início.' : '')) return;
      const anterior = ps.find((x) => x.numero === numero - 1);
      if (anterior && !marcarErro(f.inicio, f.inicio.value <= anterior.fim ? 'Começa antes do fim do período anterior (' + R.dataBR(anterior.fim) + ').' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('periodos', { ...(novo ? {} : { id: p.id }), ata_id: a.id, numero, inicio: f.inicio.value, fim: f.fim.value, renova_quantitativos: numero > 1 && f.renova.checked,
          instrumento: f.instrumento.value.trim() || null, observacoes: f.obs.value.trim() || null });
        await recarregar(); delete estado.ciclos[a.id]; d.close(); toast(numero === 1 ? 'Vigência salva.' : 'Prorrogação registrada.'); rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  function detalheItem(i) {
    const b = estado.base, cons = consumo(i.id);
    const linhas = Object.entries(cons.porOrg).sort((x, y) => y[1] - x[1]).map(([oid, v]) => el('tr', null, el('td', null, b.orgaosPorId[oid].nome), el('td', { class: 'num' }, R.num(v, 2)),
      el('td', null, barraUso(v / (0.5 * i.qtd_registrada) * 100)), el('td', { class: 'num' }, R.num(Math.max(0, 0.5 * i.qtd_registrada - v), 2))));
    const d = abrirDialogo('Item ' + i.numero + ' · ' + i.descricao, el('div', null,
      el('p', { class: 'ajuda' }, 'Limite por órgão: ' + R.num(i.qtd_registrada * 0.5, 2) + ' · Limite total: ' + R.num(i.qtd_registrada * 2, 2) + ' · Aderido: ' + R.num(cons.tot, 2)),
      linhas.length ? tabela(['Órgão', 'Aderido', 'Uso dos 50%', 'Saldo do órgão'], linhas) : el('p', { class: 'vazio' }, 'Ninguém aderiu a este item.')),
      [el('button', { type: 'button', class: 'btn btn-primario', onclick: () => d.close() }, 'Fechar')], true);
  }

  function formAta(a) {
    const f = { pregao: txt(a.pregao, { placeholder: '008/2025' }), numero: txt(a.numero, { placeholder: '001/2026' }), processo: txt(a.processo), objeto: area(a.objeto, { rows: 2 }),
      detentora: txt(a.detentora), cnpj: txt(a.cnpj_detentora ? O.formatarCnpj(a.cnpj_detentora) : '', { inputmode: 'numeric', maxlength: 18 }),
      assin: el('input', { type: 'date', value: a.data_assinatura || '' }), vig: el('input', { type: 'date', value: a.vigencia_fim || '' }),
      prorr: el('input', { type: 'checkbox', checked: !!a.prorrogada }), clausulas: txt(a.clausulas_adesao, { placeholder: '4.1 a 4.3' }), obs: area(a.observacoes, { rows: 2 }),
      link: txt(a.link_processo || '', { type: 'url', placeholder: linkPncpDaAta(a) || 'https://…' }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(a.id ? 'Editar ARP ' + a.numero : 'Nova ata', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fa-pregao', 'Pregão', f.pregao, null, true), campo('fa-numero', 'Nº da ARP', f.numero, null, true), campo('fa-processo', 'Processo administrativo', f.processo)),
      campo('fa-objeto', 'Objeto', f.objeto),
      el('div', { class: 'grade-campos' }, campo('fa-det', 'Contratado (detentora do registro)', f.detentora, null, true), campo('fa-cnpj', 'CNPJ', f.cnpj)),
      el('div', { class: 'grade-campos' }, campo('fa-assin', 'Data de assinatura', f.assin), campo('fa-vig', 'Vigência até', f.vig, 'Pedidos com data depois disto são negados.'), campo('fa-cl', 'Cláusulas de adesão', f.clausulas, 'Entra no ofício: "nos termos das cláusulas … da Ata".')),
      el('label', { class: 'checkbox' }, f.prorr, ' Ata prorrogada'),
      campo('fa-link', 'Link do processo completo', f.link, linkPncpDaAta(a) ? 'Em branco = página da licitação no PNCP. Pode colar o link do portal da transparência, Google Drive ou outra plataforma.' : 'Link do PNCP, do portal da transparência, Google Drive ou outra plataforma. Vai no e-mail de resposta.'),
      campo('fa-obs', 'Observações', f.obs),
      a.id ? null : el('p', { class: 'msg msg-info' }, 'Depois de salvar, inclua os itens com "+ Item" ou importe pela planilha-modelo.')),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      const norm = (v) => { const m = v.trim().match(/(\d+)\s*[\/-]\s*(\d{4})/); return m ? m[1].padStart(3, '0') + '/' + m[2] : v.trim(); };
      if (!marcarErro(f.pregao, f.pregao.value.trim() ? '' : 'Informe o pregão.')) return;
      const numero = norm(f.numero.value);
      if (!marcarErro(f.numero, !/^\d{3,}\/\d{4}$/.test(numero) ? 'Use o formato 001/2026.' : estado.base.atas.some((x) => x.numero === numero && x.id !== a.id) ? 'Já existe essa ARP.' : '')) return;
      if (!marcarErro(f.detentora, f.detentora.value.trim() ? '' : 'Informe o contratado.')) return;
      const cnpj = f.cnpj.value.replace(/\D/g, '');
      if (!marcarErro(f.cnpj, cnpj && cnpj.length !== 14 ? 'CNPJ com 14 números.' : '')) return;
      if (!marcarErro(f.link, f.link.value.trim() && !/^https?:\/\/\S+$/.test(f.link.value.trim()) ? 'Cole o endereço completo, começando com https://' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        const s = await D.salvar('atas', { ...(a.id ? { id: a.id } : {}), pregao: norm(f.pregao.value), numero, processo: f.processo.value.trim() || null, objeto: f.objeto.value.trim() || null,
          detentora: f.detentora.value.trim(), cnpj_detentora: cnpj || null, data_assinatura: f.assin.value || null, vigencia_fim: f.vig.value || null, prorrogada: f.prorr.checked,
          clausulas_adesao: f.clausulas.value.trim() || null, observacoes: f.obs.value.trim() || null, ...(f.link.value.trim() || a.link_processo ? { link_processo: f.link.value.trim() || null } : {}) });
        await recarregar(); d.close(); toast('Ata salva.'); location.hash = '#ata-' + s.id; rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  function formItem(a, i) {
    const usado = i.id ? consumo(i.id).tot : 0;
    const f = { numero: el('input', { type: 'number', min: '1', value: i.numero ?? (Math.max(0, ...estado.base.itens.filter((x) => x.ata_id === a.id).map((x) => x.numero)) + 1) }),
      descricao: area(i.descricao, { rows: 2 }), unidade: txt(i.unidade, { maxlength: 20 }), qtd: el('input', { type: 'number', min: '0', step: 'any', value: i.qtd_registrada ?? '' }),
      preco: el('input', { type: 'number', min: '0', step: 'any', value: i.preco_unitario ?? '', disabled: i.id && (estado.base.precos || []).some((p) => p.item_id === i.id) ? true : null }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo((i.id ? 'Editar item ' + i.numero : 'Novo item') + ' · ARP ' + a.numero, el('div', null,
      el('div', { class: 'grade-campos' }, campo('fi-num', 'Nº do item', f.numero, null, true), campo('fi-und', 'Unidade', f.unidade)),
      campo('fi-desc', 'Descrição', f.descricao, null, true),
      el('div', { class: 'grade-campos' }, campo('fi-qtd', 'Quantidade registrada', f.qtd, 'Gerenciador + participantes. Os limites saem daqui.', true), campo('fi-preco', 'Preço unitário (R$)', f.preco, f.preco.disabled ? 'Este item tem reequilíbrios: o preço muda em Preços e reequilíbrios, na tela do item.' : 'Para reequilíbrio, use "Preços" na lista de itens: assim o preço antigo fica guardado.')),
      usado ? el('p', { class: 'msg msg-falta' }, 'Este item já tem ' + R.num(usado, 2) + ' aderidos. Mudar a quantidade registrada muda os limites de todos os órgãos.') : null),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      const n = Number(f.numero.value), q = Number(f.qtd.value);
      if (!marcarErro(f.numero, n > 0 ? (estado.base.itens.some((x) => x.ata_id === a.id && x.numero === n && x.id !== i.id) ? 'Já existe esse item nesta ata.' : '') : 'Informe o número.')) return;
      if (!marcarErro(f.descricao, f.descricao.value.trim() ? '' : 'Informe a descrição.')) return;
      if (!marcarErro(f.qtd, q > 0 ? (q * 2 < usado ? 'O total aderido (' + R.num(usado, 2) + ') passaria do dobro.' : '') : 'Informe a quantidade.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('itens', { ...(i.id ? { id: i.id } : {}), ata_id: a.id, numero: n, descricao: f.descricao.value.trim(), unidade: f.unidade.value.trim() || null, qtd_registrada: q, preco_unitario: f.preco.value === '' ? null : Number(f.preco.value) });
        await recarregar(); d.close(); toast('Item salvo.'); rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }


  // ---------------------------------------------------------------- mapa de adesões (item × órgão)
  const nomeCurto = (n) => String(n || '').replace(/^Munic[ií]pio de\s+/i, '').replace(/^Prefeitura Municipal de\s+/i, '');
  function corUso(pct) { return pct > 100 ? 'uso-excedido' : pct >= 80 ? 'uso-alto' : pct >= 50 ? 'uso-medio' : 'uso-baixo'; }
  function mapaAdesoes(a, itens) {
    const b = estado.base;
    const est = mapaAdesoes.estado || (mapaAdesoes.estado = { modo: 'orgao', soComAdesao: true, busca: '', abertos: new Set() });
    const caixa = el('div', { class: 'mapa' });
    // Pedidos válidos da ata e o que cada um autorizou por item
    const peds = b.pedidos.filter((p) => p.situacao !== 'cancelado' && b.pedido_itens.some((pi) => pi.pedido_id === p.id && pi.decisao === 'autorizado' && noCiclo(pi, a.id) && itens.some((i) => i.id === pi.item_id)))
      .sort((x, y) => ordOficio(x) - ordOficio(y));
    const qtd = {}; // qtd[pedidoId][itemId]
    const val = {}; // val[pedidoId][itemId] = quantidade × preço da época
    for (const pi of b.pedido_itens) if (pi.decisao === 'autorizado' && noCiclo(pi, a.id) && peds.some((p) => p.id === pi.pedido_id)) {
      (qtd[pi.pedido_id] = qtd[pi.pedido_id] || {})[pi.item_id] = (qtd[pi.pedido_id][pi.item_id] || 0) + Number(pi.qtd_autorizada);
      const pr = R.precoPi(b, pi, b.itensPorId[pi.item_id]); if (pr != null) (val[pi.pedido_id] = val[pi.pedido_id] || {})[pi.item_id] = (val[pi.pedido_id][pi.item_id] || 0) + Number(pi.qtd_autorizada) * pr;
    }
    function desenhar() {
      // Colunas: um órgão (somando seus ofícios) ou um ofício
      let colunas;
      if (est.modo === 'orgao') {
        const porOrg = new Map();
        for (const p of peds) { if (!porOrg.has(p.orgao_id)) porOrg.set(p.orgao_id, []); porOrg.get(p.orgao_id).push(p); }
        colunas = [...porOrg.entries()].map(([oid, ps]) => ({ orgao: b.orgaosPorId[oid], peds: ps, titulo: nomeCurto(b.orgaosPorId[oid].nome), sub: ps.map((p) => 'Of. ' + (p.numero_oficio || 's/n')).join(' · ') }))
          .sort((x, y) => x.titulo.localeCompare(y.titulo, 'pt-BR'));
      } else {
        colunas = peds.map((p) => ({ orgao: b.orgaosPorId[p.orgao_id], peds: [p], titulo: 'Ofício ' + (p.numero_oficio || 's/n'), sub: nomeCurto(b.orgaosPorId[p.orgao_id].nome) }));
      }
      const t = normalizar(est.busca);
      const linhas = itens.filter((i) => (!est.soComAdesao || consumo(i.id).tot > 0) && (!t || normalizar(i.numero + ' ' + i.descricao).includes(t)));
      // Valor autorizado por coluna (órgão ou ofício)
      const valCol = colunas.map((col) => itens.reduce((s, i) => s + col.peds.reduce((t, p) => t + ((val[p.id] || {})[i.id] || 0), 0), 0));
      const cartoes = linhas.map((i) => {
        const cons = consumo(i.id), lim = i.qtd_registrada * 0.5, dobro = 2 * i.qtd_registrada, uso = cons.tot / dobro * 100;
        const un = i.unidade || '';
        const pills = colunas.map((col) => {
          const v = col.peds.reduce((s, p) => s + ((qtd[p.id] || {})[i.id] || 0), 0);
          if (!v) return null;
          const somaOrg = cons.porOrg[col.orgao.id] || 0, pct = somaOrg / lim * 100;
          return el('a', { class: 'mapa-pill ' + corUso(pct), href: col.peds.length === 1 ? '#pedido-' + col.peds[0].id : '#item-' + i.id,
            title: col.orgao.nome + '\n' + col.sub + '\nNeste item: ' + R.num(v, 2) + ' ' + un + '\nSoma do órgão no item: ' + R.num(somaOrg, 2) + ' = ' + R.num(pct, 0) + '% do limite de 50% (' + R.num(lim, 2) + ')' },
            el('span', { class: 'mapa-pill-nome' }, col.titulo),
            el('span', { class: 'mapa-pill-sub' }, est.modo === 'orgao' ? col.peds.map((p) => 'Of. ' + (p.numero_oficio || 's/n')).join(' · ') : col.sub),
            el('span', { class: 'mapa-pill-v' }, R.num(v, 2), el('small', null, ' ' + un)),
            el('span', { class: 'mapa-pill-uso' }, el('span', { class: 'mapa-trilho' }, el('i', { style: 'width:' + Math.min(100, pct) + '%' })), el('small', null, R.num(pct, 0) + '% dos 50%')));
        }).filter(Boolean);
        const aberto = est.abertos.has(i.id) || linhas.length === 1;
        const art = el('article', { class: 'mapa-linha' + (aberto ? ' aberta' : '') });
        const alternar = (ev) => { if (ev.target.closest('a')) return; if (est.abertos.has(i.id)) est.abertos.delete(i.id); else est.abertos.add(i.id); const ab = !art.classList.contains('aberta'); art.classList.toggle('aberta', ab); seta.setAttribute('aria-expanded', ab ? 'true' : 'false'); };
        const seta = el('button', { type: 'button', class: 'mapa-seta', 'aria-expanded': aberto ? 'true' : 'false', 'aria-label': 'Mostrar ou esconder os órgãos do item ' + i.numero, title: 'Mostrar ou esconder os órgãos' });
        art.append(
          el('div', { class: 'mapa-linha-topo', onclick: alternar },
            seta,
            el('span', { class: 'mapa-num' }, i.numero),
            el('div', { class: 'mapa-linha-desc' }, el('strong', null, i.descricao), el('span', { class: 'sub-linha' }, 'Registrado: ' + R.num(i.qtd_registrada, 2) + ' ' + un + ' · limite por órgão (50%): ' + R.num(lim, 2) + ' · limite total (dobro): ' + R.num(dobro, 2))),
            el('div', { class: 'mapa-linha-uso' },
              el('span', { class: 'rotulo' }, 'Aderido'), el('strong', null, R.num(cons.tot, 2), el('small', null, ' de ' + R.num(dobro, 2))), barraUso(uso)),
            el('a', { class: 'btn-aderentes', href: '#item-' + i.id, title: 'Ver os órgãos que aderiram ao item ' + i.numero }, Object.keys(cons.porOrg).length + ' órgão(s) ›')),
          pills.length ? el('div', { class: 'mapa-pills' }, pills) : el('p', { class: 'ajuda m-0 mapa-pills' }, 'Nenhuma adesão neste item.'));
        return art;
      });
      const ordem = colunas.map((col, k) => ({ col, v: valCol[k] })).sort((x, y) => y.v - x.v);
      const totalValor = valCol.reduce((x, y) => x + y, 0);
      const resumoValor = colunas.length ? el('section', { class: 'mapa-valores' }, el('h3', null, 'Valor autorizado ' + (est.modo === 'orgao' ? 'por órgão' : 'por ofício')),
        tabela([est.modo === 'orgao' ? 'Órgão' : 'Ofício', est.modo === 'orgao' ? 'Ofícios' : 'Órgão', 'Valor autorizado', 'Participação'], ordem.map(({ col, v }) => el('tr', null,
          el('td', null, el('strong', null, col.titulo)), el('td', null, est.modo === 'orgao' ? col.peds.map((p) => el('a', { href: '#pedido-' + p.id, class: 'mapa-chip' }, p.numero_oficio || 's/n')) : col.sub),
          el('td', { class: 'num' }, v ? 'R$ ' + R.moeda(v) : '—'), el('td', null, barraUso(totalValor ? v / totalValor * 100 : 0)))).concat(
          el('tr', { class: 'linha-total' }, el('td', null, el('strong', null, 'Total')), el('td', null), el('td', { class: 'num' }, el('strong', null, 'R$ ' + R.moeda(totalValor))), el('td', null))))) : null;
      const tabelaMapa = el('div', { class: 'mapa-lista' }, cartoes.length ? cartoes : el('p', { class: 'vazio' }, 'Nenhum item com esses filtros.'), resumoValor);
      const botao = (modo, rot) => el('button', { type: 'button', class: 'aba-p', role: 'tab', 'aria-selected': est.modo === modo ? 'true' : 'false', onclick: () => { est.modo = modo; desenhar(); } }, rot);
      const busca = el('input', { type: 'search', class: 'busca', placeholder: 'Filtrar itens', value: est.busca, 'aria-label': 'Filtrar itens' });
      busca.addEventListener('input', () => { est.busca = busca.value; clearTimeout(busca._t); busca._t = setTimeout(() => { desenhar(); const n = caixa.querySelector('input.busca'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }, 250); });
      const so = el('input', { type: 'checkbox', checked: est.soComAdesao });
      so.addEventListener('change', () => { est.soComAdesao = so.checked; desenhar(); });
      rc(caixa,
        el('div', { class: 'mapa-barra' },
          el('div', { class: 'abas-internas', role: 'tablist', 'aria-label': 'Colunas do mapa' }, botao('orgao', 'Por órgão (' + new Set(peds.map((p) => p.orgao_id)).size + ')'), botao('oficio', 'Por ofício (' + peds.length + ')')),
          busca, el('label', { class: 'checkbox' }, so, ' Só itens com adesão'),
          el('button', { type: 'button', class: 'link mapa-todos', onclick: () => { const todos = itens.every((i) => est.abertos.has(i.id)); est.abertos = todos ? new Set() : new Set(itens.map((i) => i.id)); desenhar(); } },
            itens.length && itens.every((i) => est.abertos.has(i.id)) ? 'Recolher todos' : 'Expandir todos'),
          el('div', { class: 'mapa-legenda', 'aria-label': 'Legenda: uso do limite de 50% do órgão no item' }, el('span', null, 'Uso do limite de 50% do órgão:'),
            el('i', { class: 'uso-baixo' }, 'até 50%'), el('i', { class: 'uso-medio' }, '50–80%'), el('i', { class: 'uso-alto' }, '80–100%'), el('i', { class: 'uso-excedido' }, 'acima'))),
        peds.length ? tabelaMapa : el('p', { class: 'vazio' }, 'Nenhuma adesão autorizada nesta ata.'),
        peds.length ? el('p', { class: 'ajuda mt-05' }, 'Cada cartão mostra a quantidade autorizada e quanto o órgão já usou do seu limite de 50% no item. ' + (est.modo === 'orgao' ? 'Os ofícios do mesmo órgão aparecem somados.' : 'Cada cartão é um ofício.') + ' Clique para abrir o ofício.') : null);
    }
    desenhar();
    return caixa;
  }




  // ---------------------------------------------------------------- preços e reequilíbrios do item
  function secaoPrecosItem(i, a) {
    const b = estado.base;
    if (b.precosAtivo === false) return el('section', { class: 'cartao', id: 'precos-item' }, el('h2', null, 'Preços e reequilíbrios'), el('p', { class: 'msg msg-falta' }, 'Rode o script 08_precos_reequilibrio.sql na Supabase para liberar a linha do tempo de preços.'));
    const ps = (b.precos || []).filter((p) => p.item_id === i.id).sort((x, y) => x.vigente_desde.localeCompare(y.vigente_desde));
    const linhaTempo = ps.length ? ps : (i.preco_unitario != null ? [{ id: null, preco: i.preco_unitario, vigente_desde: a.data_assinatura || '', instrumento: 'Preço registrado na ata' }] : []);
    const adesoes = b.pedido_itens.filter((pi) => pi.item_id === i.id && pi.decisao === 'autorizado' && b.pedidosPorId[pi.pedido_id] && b.pedidosPorId[pi.pedido_id].situacao !== 'cancelado')
      .map((pi) => ({ pi, p: b.pedidosPorId[pi.pedido_id] })).sort((x, y) => (x.p.data_oficio || '9').localeCompare(y.p.data_oficio || '9') || ordOficio(x.p) - ordOficio(y.p));
    const conferir = adesoes.filter((x) => x.pi.preco_conferir).length;
    const precosDistintos = [...new Set(linhaTempo.map((p) => Number(p.preco)))];
    const f = { preco: el('input', { type: 'number', min: '0', step: '0.01', placeholder: '0,00' }), desde: el('input', { type: 'date', value: hoje() }), ins: txt('', { placeholder: '1º Termo Aditivo' }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Registrar reequilíbrio');
    btn.addEventListener('click', async () => {
      const v = Number(f.preco.value);
      if (!marcarErro(f.preco, v > 0 ? '' : 'Informe o novo preço.')) return;
      if (!marcarErro(f.desde, f.desde.value ? '' : 'Informe a data.')) return;
      ocupado(btn, 'Gravando…');
      try {
        await D.registrarReequilibrio(i.id, v, f.desde.value, f.ins.value.trim() || 'Termo aditivo');
        await recarregar(); rotear(); toast('Reequilíbrio registrado. Os ofícios já emitidos continuam com o preço da época.');
      } catch (e) { ocupado(btn); toast(e.message, true); }
    });
    const recalcular = podeEditar() && ps.length > 1 ? el('button', { type: 'button', class: 'btn btn-claro', onclick: async (ev) => {
      if (!await confirmar('Recalcular o preço das adesões', 'Cada adesão deste item recebe o preço vigente na data do seu ofício, conforme a linha do tempo. As adesões sem data (histórico da planilha) ficam marcadas para você escolher o preço.', 'Recalcular')) return;
      const bt = ev.target; ocupado(bt, 'Recalculando…');
      try { await D.recalcularPrecosItem(i.id); await recarregar(); rotear(); toast('Preços das adesões recalculados.'); } catch (e) { ocupado(bt); toast(e.message, true); }
    } }, 'Recalcular o preço das adesões pela data do ofício') : null;
    return el('section', { class: 'cartao', id: 'precos-item' }, el('h2', null, 'Preços e reequilíbrios'),
      el('p', { class: 'ajuda' }, 'Cada adesão guarda o preço vigente na data do ofício. Um reequilíbrio vale a partir da data informada: as adesões anteriores mantêm o preço da época e as novas já saem com o preço novo.'),
      tabela(['Vale a partir de', 'Preço unitário (R$)', 'Variação', 'Instrumento', ''], linhaTempo.map((p, k) => {
        const ant = k ? Number(linhaTempo[k - 1].preco) : null;
        return el('tr', null, el('td', null, R.dataBR(p.vigente_desde) || '—'), el('td', { class: 'num' }, el('strong', null, R.moeda(p.preco))),
          el('td', { class: 'num' }, ant ? (Number(p.preco) >= ant ? '+' : '') + R.num((Number(p.preco) / ant - 1) * 100, 2) + '%' : '—'), el('td', null, p.instrumento || '—'),
          el('td', { class: 'acoes' }, podeEditar() && p.id && k > 0 ? el('button', { type: 'button', class: 'link btn-texto-perigo', onclick: async () => {
            if (!await confirmar('Excluir reequilíbrio', 'Exclui o preço de ' + R.moeda(p.preco) + ' a partir de ' + R.dataBR(p.vigente_desde) + '. As adesões já lançadas não mudam.', 'Excluir', true)) return;
            try { await D.excluirPreco(p.id); await recarregar(); rotear(); toast('Reequilíbrio excluído.'); } catch (e) { toast(e.message, true); }
          } }, 'Excluir') : null));
      })),
      podeEditar() ? el('div', { class: 'secao-form' }, el('h3', null, 'Registrar reequilíbrio'),
        el('div', { class: 'grade-campos' }, campo('pr-preco', 'Novo preço unitário (R$)', f.preco, null, true), campo('pr-desde', 'Vale a partir de', f.desde, 'Data de assinatura ou de efeito do termo aditivo.', true), campo('pr-ins', 'Instrumento', f.ins)),
        el('div', { class: 'botoes-form' }, btn, recalcular)) : null,
      adesoes.length ? el('div', { class: 'mt-1' }, el('h3', null, 'Preço de cada adesão'),
        conferir ? el('p', { class: 'msg msg-falta' }, conferir + ' adesão(ões) sem data de ofício: escolha o preço que valia quando foram autorizadas.') : null,
        tabela(['Ofício', 'Data', 'Órgão', 'Quantidade', 'Preço da adesão (R$)', 'Valor (R$)'], adesoes.map(({ pi, p }) => {
          const o = b.orgaosPorId[p.orgao_id], pr = R.precoPi(b, pi, i);
          const escolha = podeEditar() && precosDistintos.length > 1 ? sel(precosDistintos.map((v) => [v, R.moeda(v)]).concat(precosDistintos.includes(Number(pr)) ? [] : [[pr, R.moeda(pr)]]), pr) : null;
          if (escolha) escolha.addEventListener('change', async () => { try { await D.definirPrecoAdesao(pi.id, Number(escolha.value)); await recarregar(); rotear(); toast('Preço da adesão atualizado.'); } catch (e) { toast(e.message, true); } });
          return el('tr', { class: pi.preco_conferir ? 'lin-negado' : null }, el('td', null, el('a', { href: '#pedido-' + p.id }, p.numero_oficio || 's/n')), el('td', null, R.dataBR(p.data_oficio) || (p.origem === 'migracao' ? 'sem data (planilha)' : '—')),
            el('td', null, o ? o.nome : '—'), el('td', { class: 'num' }, R.num(pi.qtd_autorizada, 2)),
            el('td', { class: 'num' }, escolha || (pr != null ? R.moeda(pr) : '—'), pi.preco_conferir ? el('span', { class: 'sub-linha ajuda-erro' }, 'conferir') : null),
            el('td', { class: 'num' }, pr != null ? R.moeda(Number(pi.qtd_autorizada) * pr) : '—'));
        }), { 'data-sem-paginas': '1' })) : null);
  }

  // ================================================================= ITEM: órgãos que aderiram
  TELAS.item = (c, id) => {
    const b = estado.base, i = b.itensPorId[id];
    if (!i) { rc(c, cabecalho('Item não encontrado', null, el('a', { class: 'btn btn-claro', href: '#atas' }, 'Voltar'))); return; }
    const a = b.atasPorId[i.ata_id], reg = Number(i.qtd_registrada), lim = reg * 0.5, cons = consumo(i.id);
    // Linhas autorizadas e negadas deste item
    const aut = [], neg = [];
    for (const pi of b.pedido_itens) {
      if (pi.item_id !== id) continue;
      const p = b.pedidosPorId[pi.pedido_id]; if (!p || p.situacao === 'cancelado') continue;
      if (!noCiclo(pi, i.ata_id)) continue;
      (pi.decisao === 'autorizado' ? aut : neg).push({ pi, p, o: b.orgaosPorId[p.orgao_id] });
    }
    const porOrg = new Map();
    for (const l of aut) { if (!porOrg.has(l.o.id)) porOrg.set(l.o.id, { o: l.o, qtd: 0, peds: [] }); const g = porOrg.get(l.o.id); g.qtd += Number(l.pi.qtd_autorizada); g.peds.push(l); }
    const grupos = [...porOrg.values()].sort((x, y) => y.qtd - x.qtd);
    const vu = i.preco_unitario != null ? Number(i.preco_unitario) : null;
    const exportar = () => {
      const linhas = [['ARP ' + a.numero + ' · Item ' + i.numero + ' – ' + i.descricao], ['Registrado', reg, 'Limite por órgão (50%)', lim, 'Limite total (dobro)', reg * 2, 'Aderido', cons.tot], [],
        ['Órgão', 'CNPJ', 'UF', 'Ofícios do CIMOP', 'Quantidade', '% do limite de 50%', 'Saldo do órgão', 'Valor (R$)']];
      grupos.forEach((g) => linhas.push([g.o.nome, O.formatarCnpj(g.o.cnpj || ''), g.o.uf || '', g.peds.map((l) => (l.p.numero_oficio || 's/n') + (l.p.data_oficio ? ' (' + R.dataBR(l.p.data_oficio) + ')' : '')).join('; '),
        g.qtd, Math.round(g.qtd / lim * 1000) / 10, Math.max(0, lim - g.qtd), cons.valorPorOrg[g.o.id] != null ? Math.round(cons.valorPorOrg[g.o.id] * 100) / 100 : null]));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Aderentes');
      baixar('Aderentes - ARP ' + a.numero.replace('/', '-') + ' item ' + i.numero + '.xlsx', XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), XLSX_T);
    };
    rc(c,
      cabecalho('Item ' + i.numero + ' · ' + i.descricao, 'ARP ' + a.numero + ' · ' + a.detentora + ' · Pregão ' + a.pregao,
        el('a', { class: 'btn btn-claro', href: '#ata-' + a.id }, '‹ ARP ' + a.numero), el('button', { type: 'button', class: 'btn btn-claro', onclick: exportar }, 'Exportar (Excel)'),
        podeEditar() ? el('a', { class: 'btn btn-primario', href: '#novo', onclick: () => { rascunho = rascunho || novoRascunho(); if (!rascunho.atas.includes(a.id)) rascunho.atas.push(a.id); } }, '+ Novo pedido nesta ata') : null),
      el('div', { class: 'resumo-pntp' },
        el('div', null, el('span', { class: 'rotulo' }, 'Registrado'), el('strong', { class: 'num-grande' }, R.num(reg, 2)), el('small', null, (i.unidade || '') + (vu != null ? ' · R$ ' + R.moeda(vu) + ' por unidade' : ''))),
        el('div', null, el('span', { class: 'rotulo' }, 'Limite por órgão (50%)'), el('strong', { class: 'num-grande' }, R.num(lim, 2)), el('small', null, 'art. 86, § 4º')),
        el('div', null, el('span', { class: 'rotulo' }, 'Total aderido'), el('strong', { class: 'num-grande' }, R.num(cons.tot, 2)), el('small', null, R.num(cons.tot / (2 * reg) * 100, 1) + '% do dobro · ' + grupos.length + ' órgão(s)')),
        el('div', null, el('span', { class: 'rotulo' }, 'Saldo para novas adesões'), el('strong', { class: 'num-grande' }, R.num(Math.max(0, reg * 2 - cons.tot), 2)), el('small', null, 'limite total: ' + R.num(reg * 2, 2) + ' (§ 5º)'))),
      el('section', { class: 'cartao' }, el('h2', null, 'Órgãos que aderiram'),
        grupos.length ? el('div', { class: 'tabela-caixa', 'data-sem-paginas': '1' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Órgão', 'Ofícios do CIMOP', 'Quantidade', 'Uso dos 50%', 'Saldo do órgão', 'Valor (R$)'].map((t, k) => el('th', { scope: 'col', class: k === 2 || k === 4 || k === 5 ? 'num' : null }, t)))),
          el('tbody', null, grupos.map((g) => el('tr', { class: g.qtd > lim + 1e-9 ? 'lin-negado' : null },
            el('td', null, el('strong', null, g.o.nome), el('span', { class: 'sub-linha' }, (g.o.cnpj ? O.formatarCnpj(g.o.cnpj) : 'sem CNPJ') + ' · ' + g.o.esfera)),
            el('td', null, el('ul', { class: 'm-0 lista-oficios' }, g.peds.map((l) => el('li', null, el('a', { href: '#pedido-' + l.p.id }, 'Of. ' + (l.p.numero_oficio || 's/n')),
              (l.p.data_oficio ? ' · ' + R.dataBR(l.p.data_oficio) : '') + ' · ' + R.num(l.pi.qtd_autorizada, 2) + (l.p.origem === 'migracao' ? ' (migrado)' : ''))))),
            el('td', { class: 'num' }, R.num(g.qtd, 2)),
            el('td', null, barraUso(g.qtd / lim * 100), g.qtd > lim + 1e-9 ? el('span', { class: 'sub-linha ajuda-erro' }, 'acima do limite de 50%') : null),
            el('td', { class: 'num' + (lim - g.qtd <= 0 ? ' saldo-zero' : '') }, R.num(Math.max(0, lim - g.qtd), 2)),
            el('td', { class: 'num' }, cons.valorPorOrg[g.o.id] != null ? R.moeda(cons.valorPorOrg[g.o.id]) : '—')))),
          el('tfoot', null, el('tr', null, el('th', { scope: 'row' }, 'Total'), el('td', null), el('td', { class: 'num' }, R.num(cons.tot, 2)), el('td', null), el('td', null),
            el('td', { class: 'num' }, R.moeda(cons.valor)))))) : el('p', { class: 'vazio' }, 'Nenhum órgão aderiu a este item ainda.')),
      secaoPrecosItem(i, a),
      neg.length ? el('section', { class: 'cartao' }, el('h2', null, 'Pedidos negados neste item'),
        tabela(['Órgão', 'Ofício', 'Qtd pedida', 'Motivo'], neg.map((l) => el('tr', null, el('td', null, l.o.nome), el('td', null, el('a', { href: '#pedido-' + l.p.id }, l.p.numero_oficio || 's/n')),
          el('td', { class: 'num' }, R.num(l.pi.qtd_solicitada, 2)), el('td', null, l.pi.motivo || ''))))) : null);
  };



  // ================================================================= RELATÓRIO INSTITUCIONAL (PDF)
  function dadosRelatorio(opc) {
    const b = estado.base, cf = b.config;
    const salvo = estado.ciclos; estado.ciclos = {};   // sempre o ciclo vigente de cada ata
    try {
      const vigente = (a) => a.ativo !== false && (!a.vigencia_fim || diasAte(a.vigencia_fim) >= 0);
      const atas = b.atas.filter((a) => opc.escopo === 'todas' ? true : opc.escopo === 'vigentes' ? vigente(a) : a.id === opc.escopo)
        .sort((x, y) => x.numero.slice(-4).localeCompare(y.numero.slice(-4)) || x.numero.localeCompare(y.numero));
      const idsAtas = new Set(atas.map((a) => a.id));
      const orgaos = new Map(); let valorTotal = 0; const pedidosSet = new Set();
      const linhasAtas = atas.map((a) => {
        const itens = b.itens.filter((i) => i.ata_id === a.id).sort((x, y) => x.numero - y.numero);
        const cic = R.cicloAtual(b, a.id); const ps = R.periodosDa(b, a.id);
        const nCic = cic ? R.ciclosDa(b, a.id).findIndex((c) => c.id === cic) + 1 : 0;
        let maior = 0, valor = 0; const porOrg = new Map();
        const linhas = itens.map((i) => {
          const c = consumo(i.id), reg = Number(i.qtd_registrada), dobro = 2 * reg, uso = reg ? c.tot / dobro * 100 : 0;
          maior = Math.max(maior, uso);
          valor += c.valor;
          return { numero: i.numero, descricao: i.descricao, unidade: i.unidade || '', registrado: reg, dobro, aderido: c.tot, saldo: Math.max(0, dobro - c.tot), uso };
        }).filter((l) => opc.todosItens || l.aderido > 0);
        for (const pi of b.pedido_itens) {
          const it = b.itensPorId[pi.item_id]; if (!it || it.ata_id !== a.id || pi.decisao !== 'autorizado' || !noCiclo(pi, a.id)) continue;
          const p = b.pedidosPorId[pi.pedido_id]; if (!p || p.situacao === 'cancelado') continue;
          const pr = R.precoPi(b, pi, it), v = pr != null ? Number(pi.qtd_autorizada) * pr : 0;
          const o = porOrg.get(p.orgao_id) || { nome: b.orgaosPorId[p.orgao_id].nome, oficios: new Set(), valor: 0 }; o.oficios.add(p.numero_oficio || 's/n'); o.valor += v; porOrg.set(p.orgao_id, o);
          const g = orgaos.get(p.orgao_id) || { org: b.orgaosPorId[p.orgao_id], pedidos: new Set(), atas: new Set(), valor: 0 };
          g.pedidos.add(p.id); g.atas.add(a.numero); g.valor += v; orgaos.set(p.orgao_id, g); pedidosSet.add(p.id);
        }
        valorTotal += valor;
        const fim = ps.length ? ps[ps.length - 1].fim : a.vigencia_fim;
        return { numero: a.numero, pregao: a.pregao || '—', detentora: a.detentora || '—', objeto: a.objeto || '', vigencia: fim ? 'até ' + R.dataBR(fim) : 'não informada',
          ciclo: nCic ? nCic + 'º' : '—', itens: itens.length, orgaos: porOrg.size, valor, maior, linhas,
          orgaosLista: [...porOrg.values()].sort((x, y) => y.valor - x.valor).map((o) => ({ nome: o.nome, oficios: [...o.oficios].join(', '), valor: o.valor })) };
      });
      const negados = [];
      for (const p of b.pedidos) {
        if (p.situacao === 'cancelado' || p.origem === 'migracao') continue;
        for (const l of linhasDoPedido(p)) if (l.decisao !== 'autorizado' && idsAtas.has(l.ata.id) && noCiclo(l.pi, l.ata.id))
          negados.push({ oficio: p.numero_oficio || 's/n', data: R.dataBR(p.data_oficio), orgao: b.orgaosPorId[p.orgao_id].nome, item: l.ata.numero + ' / ' + l.item.numero, qtd: l.q, motivo: l.motivo || '—', ord: ordOficio(p) });
      }
      negados.sort((x, y) => y.ord - x.ord);
      const alertas = [];
      for (const a of atas) {
        if (a.vigencia_fim) { const dd = diasAte(a.vigencia_fim); if (dd >= 0 && dd <= 60) alertas.push({ tipo: 'falta', texto: 'ARP ' + a.numero + ' (' + a.detentora + ') vence em ' + dd + ' dia(s), em ' + R.dataBR(a.vigencia_fim) + '.' }); }
        for (const i of b.itens.filter((x) => x.ata_id === a.id)) { const c = consumo(i.id).tot, u = c / (2 * i.qtd_registrada) * 100; if (u >= 80) alertas.push({ tipo: u > 100 ? 'erro' : 'falta', texto: 'ARP ' + a.numero + ', item ' + i.numero + ' (' + i.descricao + '): ' + R.num(u, 0) + '% do limite total (dobro) já aderido.' }); }
      }
      for (const o of R.conferirHistorico(b)) {
        const a = b.atasPorId[o.item.ata_id]; if (!idsAtas.has(a.id)) continue;
        alertas.unshift({ tipo: 'erro', texto: o.tipo === '50%' ? o.orgao.nome + ' tem ' + R.num(o.valor, 2) + ' autorizados no item ' + o.item.numero + ' da ARP ' + a.numero + ', acima do limite de 50% (' + R.num(o.limite, 2) + ').'
          : 'Item ' + o.item.numero + ' da ARP ' + a.numero + ': total aderido ' + R.num(o.valor, 2) + ' acima do dobro (' + R.num(o.limite, 2) + ').' });
      }
      const listaOrg = [...orgaos.values()].sort((x, y) => y.valor - x.valor).map((g) => ({ nome: g.org.nome, local: [g.org.municipio, g.org.uf].filter(Boolean).join('/') || '—', pedidos: g.pedidos.size, atas: [...g.atas].join(', '), valor: g.valor }));
      const pedidosArr = [...pedidosSet].map((id) => b.pedidosPorId[id]);
      const agora = new Date();
      const nomeAta = typeof opc.escopo === 'string' && b.atasPorId[opc.escopo] ? 'ARP ' + b.atasPorId[opc.escopo].numero : null;
      return {
        sigla: cf.sigla, orgao: cf.orgao_nome, regulamento: cf.resolucao_srp + (cf.resolucao_alteracao ? ', alterado pela ' + cf.resolucao_alteracao : ''),
        presidente: cf.presidente_nome, presidenteCargo: cf.presidente_cargo, usuario: estado.usuario.nome,
        dataBR: R.dataBR(hoje()), geradoEm: agora.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        escopo: nomeAta || (opc.escopo === 'todas' ? 'Todas as atas cadastradas' : 'Atas vigentes'),
        detalhe: opc.detalhe, incluirNegados: opc.negados, atas: linhasAtas, orgaos: listaOrg, negados, alertas,
        indicadores: [
          { rotulo: 'Atas', valor: String(linhasAtas.length), sub: atas.filter(vigente).length + ' vigente(s)' },
          { rotulo: 'Órgãos aderentes', valor: String(listaOrg.length), sub: pedidosArr.length + ' ofício(s) com autorização', cor: [29, 95, 209] },
          { rotulo: 'Itens negados', valor: String(negados.length), sub: 'pedidos lançados no sistema', cor: [178, 109, 6] },
          { rotulo: 'Valor autorizado', valor: 'R$ ' + R.moeda(valorTotal), sub: 'ciclo vigente, itens com preço', cor: [16, 42, 72] }],
        num: R.num, moeda: R.moeda,
      };
    } finally { estado.ciclos = salvo; }
  }

  function dadosResumido(opc) {
    const b = estado.base, cf = b.config;
    const vigente = (a) => a.ativo !== false && (!a.vigencia_fim || diasAte(a.vigencia_fim) >= 0);
    const atas = new Set(b.atas.filter((a) => opc.escopo === 'todas' ? true : opc.escopo === 'vigentes' ? vigente(a) : a.id === opc.escopo).map((a) => a.id));
    const grupos = new Map();
    for (const p of b.pedidos) {
      if (p.situacao === 'cancelado') continue;
      for (const l of linhasDoPedido(p)) {
        if (l.decisao !== 'autorizado' || !atas.has(l.ata.id)) continue;
        const k = p.id + '|' + l.ata.id;
        const g = grupos.get(k) || { p, ata: l.ata, valor: 0 };
        if (l.preco != null) g.valor += l.qAut * l.preco;
        grupos.set(k, g);
      }
    }
    const linhas = [...grupos.values()].sort((x, y) => (x.p.data_oficio || '').localeCompare(y.p.data_oficio || '') || ordOficio(x.p) - ordOficio(y.p) || x.ata.numero.localeCompare(y.ata.numero)).map((g) => {
      const o = b.orgaosPorId[g.p.orgao_id];
      return { data: R.dataBR(g.p.data_oficio) || 'não informada', oficio: g.p.numero_oficio || 's/n', orgao: o.nome, local: [o.municipio, o.uf].filter(Boolean).join('/') || '—',
        arp: g.ata.numero, pregao: g.ata.pregao || '—', contratado: g.ata.detentora || '—', valor: g.valor, orgaoId: o.id, ataId: g.ata.id };
    });
    const porAta = [...new Set(linhas.map((l) => l.ataId))].map((id) => { const ls = linhas.filter((l) => l.ataId === id), a = b.atasPorId[id];
      return { arp: a.numero, contratado: a.detentora || '—', adesoes: ls.length, orgaos: new Set(ls.map((l) => l.orgaoId)).size, valor: ls.reduce((s, l) => s + l.valor, 0) }; })
      .sort((x, y) => x.arp.slice(-4).localeCompare(y.arp.slice(-4)) || x.arp.localeCompare(y.arp));
    const nomeAta = b.atasPorId[opc.escopo] ? 'ARP ' + b.atasPorId[opc.escopo].numero : null;
    return { sigla: cf.sigla, usuario: estado.usuario.nome, dataBR: R.dataBR(hoje()), escopo: nomeAta || (opc.escopo === 'todas' ? 'Todas as atas' : 'Atas vigentes'),
      geradoEm: new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
      linhas, porAta, semData: linhas.filter((l) => l.data === 'não informada').length, total: linhas.reduce((s, l) => s + l.valor, 0), qtdOrgaos: new Set(linhas.map((l) => l.orgaoId)).size, moeda: R.moeda };
  }

  TELAS.relatorio = (c) => {
    const b = estado.base;
    const f = {
      escopo: sel([['vigentes', 'Atas vigentes'], ['todas', 'Todas as atas cadastradas'], ...b.atas.map((a) => [a.id, 'Só a ARP ' + a.numero + ' – ' + (a.detentora || '')])], 'vigentes'),
      detalhe: el('input', { type: 'checkbox', checked: true }), todos: el('input', { type: 'checkbox' }), negados: el('input', { type: 'checkbox', checked: true }),
      tipo: sel([['resumido', 'Resumido: relação de todas as adesões'], ['completo', 'Completo: situação das atas, saldos e órgãos']], 'resumido') };
    const opcCompleto = el('div', null,
      el('label', { class: 'checkbox' }, f.detalhe, ' Incluir itens e saldos de cada ata'),
      el('label', { class: 'checkbox' }, f.todos, ' Mostrar também os itens sem adesão'),
      el('label', { class: 'checkbox' }, f.negados, ' Incluir pedidos negados ou autorizados em parte'));
    const ajustar = () => { opcCompleto.hidden = f.tipo.value !== 'completo'; };
    f.tipo.addEventListener('change', ajustar);
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Gerar relatório em PDF');
    btn.addEventListener('click', async () => {
      ocupado(btn, 'Gerando o PDF…');
      try {
        if (f.tipo.value === 'resumido') {
          const r = dadosResumido({ escopo: f.escopo.value });
          if (!r.linhas.length) { toast('Nenhuma adesão nesse filtro.', true); return; }
          await baixar('Relação de Adesões - ' + (b.config.sigla || 'CIMOP') + ' - ' + hoje().split('-').reverse().join('-') + '.pdf', await window.RELATORIO.gerarResumido(r), 'application/pdf');
          toast('Relatório gerado.'); return;
        }
        const d = dadosRelatorio({ escopo: f.escopo.value, detalhe: f.detalhe.checked, todosItens: f.todos.checked, negados: f.negados.checked });
        if (!d.atas.length) { toast('Nenhuma ata nesse filtro.', true); return; }
        const blob = await window.RELATORIO.gerar(d);
        const nome = 'Relatório de Adesões - ' + (b.config.sigla || 'CIMOP') + ' - ' + hoje().split('-').reverse().join('-') + '.pdf';
        await baixar(nome, blob, 'application/pdf');
        toast('Relatório gerado.');
      } catch (e) { console.error(e); toast(e.message, true); } finally { ocupado(btn); }
    });
    rc(c, cabecalho('Relatório em PDF', 'Situação completa das adesões, pronta para imprimir, anexar a processos ou apresentar à assembleia.', btn),
      el('section', { class: 'cartao' }, el('h2', null, 'O que vai no relatório completo'),
        el('ul', { class: 'lista-relatorio' },
          el('li', null, el('strong', null, 'Resumo: '), 'atas, órgãos aderentes, itens negados e valor autorizado.'),
          el('li', null, el('strong', null, 'Situação das atas: '), 'contratado, vigência, ciclo de quantitativos, órgãos, valor e o item mais consumido.'),
          el('li', null, el('strong', null, 'Itens e saldos por ata: '), 'registrado, limite total (dobro), aderido, saldo e uso, com os órgãos de cada ata.'),
          el('li', null, el('strong', null, 'Órgãos aderentes, pedidos negados e pontos de atenção'), ' (vencimentos, itens perto do dobro e excessos).'),
          el('li', null, 'Fundamentação legal (art. 86 da Lei nº 14.133/2021) e assinatura do Presidente.')),
        el('p', { class: 'ajuda' }, 'O resumido é uma tabela única com todas as adesões autorizadas: data da autorização, ofício, órgão, município, ata, contratado e valor total, com o total geral e um resumo por ata.'),
        el('div', { class: 'grade-campos mt-1' }, campo('rl-tipo', 'Tipo de relatório', f.tipo), campo('rl-escopo', 'Atas', f.escopo)),
        opcCompleto,
        el('p', { class: 'ajuda mt-05' }, 'Os números consideram o ciclo vigente de cada ata (depois de uma prorrogação com renovação dos quantitativos, só as adesões do novo período).'),
        el('div', { class: 'mt-1' }, el('button', { type: 'button', class: 'btn btn-primario', onclick: () => btn.click() }, 'Gerar relatório em PDF'))));
    ajustar();
  };

  // ================================================================= ATUALIZAÇÕES DO PNCP
  const TIPO_PNCP = { nova_ata: ['Nova ata', 'etiqueta-azul'], prorrogacao: ['Prorrogação', 'etiqueta-vig'], reequilibrio: ['Novo preço', 'etiqueta-pendente'], cancelamento: ['Cancelamento', 'etiqueta-negado'] };
  const SIT_PNCP = { pendente: ['Aguardando', 'etiqueta-pendente'], confirmada: ['Confirmada', 'etiqueta-ativo'], ignorada: ['Ignorada', 'etiqueta-desativado'] };
  const etq = (m, k) => el('span', { class: 'etiqueta ' + m[k][1] }, m[k][0]);
  const dataHora = (v) => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const dBR = (v) => v ? v.split('-').reverse().join('/') : '—';


  // ---------------------------------------------------------------- órgãos do PNCP × adesões autorizadas
  function chaveOrgao(nome, uf) {
    // sem espaços: "Arco Verde" e "Arcoverde" batem
    let n = normalizar(nome).replace(/\/[a-z]{2}$/, '').replace(/^(municipio|prefeitura municipal|prefeitura) d[eao]s? /, '').replace(/[^a-z0-9]/g, '');
    return n + '|' + String(uf || '').toLowerCase();
  }
  function conferenciaPncp() {
    const b = estado.base;
    return b.atas.filter((a) => a.numero_controle_pncp).map((a) => {
      const partes = (b.pncpPartes || []).filter((p) => p.ata_id === a.id);
      const np = partes.filter((p) => p.tipo === 'Não Participante');
      const chavePncp = (p) => chaveOrgao(/^munic/i.test(p.nome || '') && p.municipio ? p.municipio : p.nome, p.uf);
      // órgãos com adesão autorizada nesta ata (todos os ciclos, sem os cancelados)
      const sis = new Map();
      for (const pi of b.pedido_itens) {
        if (pi.decisao !== 'autorizado') continue;
        const it = b.itensPorId[pi.item_id]; if (!it || it.ata_id !== a.id) continue;
        const p = b.pedidosPorId[pi.pedido_id]; if (!p || p.situacao === 'cancelado') continue;
        const o = b.orgaosPorId[p.orgao_id]; if (!o) continue;
        const g = sis.get(o.id) || { orgao: o, oficios: new Set() }; g.oficios.add(p.numero_oficio || 's/n'); sis.set(o.id, g);
      }
      const usados = new Set(), faltam = [], ok = [], semCnpj = [];
      for (const g of sis.values()) {
        const o = g.orgao;
        let m = o.cnpj ? np.find((p) => p.cnpj === o.cnpj) : null;
        if (!m) m = np.find((p) => !usados.has(p.cnpj) && chavePncp(p) === chaveOrgao(o.nome, o.uf));
        if (m) { usados.add(m.cnpj); ok.push({ ...g, pncp: m }); if (!o.cnpj) semCnpj.push({ orgao: o, cnpj: m.cnpj, pncp: m }); }
        else faltam.push(g);
      }
      const sobra = np.filter((p) => !usados.has(p.cnpj));
      return { ata: a, lido: partes.length > 0, np, sis: [...sis.values()], ok, faltam, sobra, semCnpj };
    });
  }
  function secaoConferenciaPncp() {
    const b = estado.base;
    if (b.partesAtivo === false) return el('section', { class: 'cartao' }, el('h2', null, 'Órgãos no PNCP × adesões autorizadas'), el('p', { class: 'msg msg-falta' }, 'Rode o script 06_pncp_orgaos.sql na Supabase para liberar esta conferência.'));
    const lista = conferenciaPncp();
    const totFaltam = lista.reduce((s, x) => s + x.faltam.length, 0), totSobra = lista.reduce((s, x) => s + x.sobra.length, 0), totCnpj = lista.reduce((s, x) => s + x.semCnpj.length, 0);
    const btnCnpj = totCnpj && podeEditar() ? el('button', { type: 'button', class: 'btn btn-claro', onclick: async (ev) => {
      const bt = ev.currentTarget; ocupado(bt, 'Gravando…'); let n = 0, pulados = 0;
      const vistos = new Set();
      for (const x of lista) for (const c of x.semCnpj) {
        if (vistos.has(c.orgao.id)) continue; vistos.add(c.orgao.id);
        if (b.orgaos.some((o) => o.cnpj === c.cnpj && o.id !== c.orgao.id)) { pulados++; continue; }
        try { await D.salvar('orgaos', { id: c.orgao.id, cnpj: c.cnpj }); n++; } catch (e) { pulados++; }
      }
      await recarregar(); rotear(); toast(n + ' CNPJ(s) gravado(s)' + (pulados ? '; ' + pulados + ' não gravado(s) porque o CNPJ já está em outro órgão.' : '.'));
    } }, 'Gravar os ' + totCnpj + ' CNPJ(s) que faltam no cadastro') : null;
    const lin = (t, cor) => el('li', { class: cor || null }, t);
    return el('section', { class: 'cartao' }, el('h2', null, 'Órgãos no PNCP × adesões autorizadas'),
      el('p', { class: 'ajuda' }, 'Compara os órgãos não participantes que aparecem na aba "Órgãos/Entidades" de cada ata no PNCP com os órgãos que têm adesão autorizada aqui. A lista do PNCP é lida na busca da madrugada.'),
      el('div', { class: 'resumo-pntp' },
        el('div', null, el('span', { class: 'rotulo' }, 'Falta incluir no PNCP'), el('strong', { class: 'num-grande' }, totFaltam), el('small', null, 'adesões autorizadas que o PNCP não mostra')),
        el('div', null, el('span', { class: 'rotulo' }, 'Só no PNCP'), el('strong', { class: 'num-grande' }, totSobra), el('small', null, 'órgãos sem adesão lançada aqui')),
        el('div', null, el('span', { class: 'rotulo' }, 'CNPJ a completar'), el('strong', { class: 'num-grande' }, totCnpj), el('small', null, 'achados pelo nome no PNCP'))),
      btnCnpj ? el('div', { class: 'mt-05' }, btnCnpj) : null,
      el('div', { class: 'lista-conf mt-1' }, lista.map((x) => {
        const okTudo = x.lido && !x.faltam.length && !x.sobra.length;
        return el('details', { class: 'conf-ata' + (okTudo ? ' ok' : ''), open: !okTudo && x.lido && (x.faltam.length || x.sobra.length) ? true : null },
          el('summary', null, el('strong', null, 'ARP ' + x.ata.numero), ' · ' + (x.ata.detentora || ''),
            el('span', { class: 'conf-chips' },
              !x.lido ? el('span', { class: 'etiqueta etiqueta-pendente' }, 'ainda não lida') :
              okTudo ? el('span', { class: 'etiqueta etiqueta-ativo' }, 'confere: ' + x.ok.length + ' órgão(s)') :
              [x.faltam.length ? el('span', { class: 'etiqueta etiqueta-negado' }, x.faltam.length + ' falta(m) no PNCP') : null,
                x.sobra.length ? el('span', { class: 'etiqueta etiqueta-pendente' }, x.sobra.length + ' só no PNCP') : null,
                el('span', { class: 'etiqueta etiqueta-azul' }, x.ok.length + ' confere(m)')])),
          !x.lido ? el('p', { class: 'ajuda' }, 'A lista de órgãos desta ata ainda não foi lida no PNCP. Ela vem na próxima busca (ou clique em "Buscar agora").') : el('div', { class: 'conf-corpo' },
            x.faltam.length ? el('div', null, el('h3', null, 'Adesões autorizadas que não aparecem no PNCP'),
              el('ul', null, x.faltam.map((g) => lin([el('strong', null, g.orgao.nome), g.orgao.cnpj ? ' · ' + O.formatarCnpj(g.orgao.cnpj) : ' · CNPJ não cadastrado', ' · ofício(s) ' + [...g.oficios].join(', ')], 'conf-falta')))) : null,
            x.sobra.length ? el('div', null, el('h3', null, 'No PNCP, mas sem adesão lançada no sistema'),
              el('ul', null, x.sobra.map((p) => lin([el('strong', null, tituloPt(p.nome)), ' · ' + O.formatarCnpj(p.cnpj), ' · ' + [p.municipio, p.uf].filter(Boolean).join('/'), p.incluido_em ? ' · incluído no PNCP em ' + R.dataBR(p.incluido_em.slice(0, 10)) : ''], 'conf-sobra')))) : null,
            x.ok.length ? el('div', null, el('h3', null, 'Conferem (' + x.ok.length + ')'), el('p', { class: 'ajuda' }, x.ok.map((g) => nomeCurto(g.orgao.nome)).join(' · '))) : null));
      })));
  }

  TELAS.pncp = (c) => {
    const b = estado.base;
    if (b.pncpAtivo === false) { rc(c, cabecalho('Atualizações do PNCP'), el('p', { class: 'msg msg-falta' }, 'A busca no PNCP ainda não foi instalada no banco (script 04_pncp.sql).')); return; }
    const pend = b.pncp.filter((x) => x.situacao === 'pendente'), feitas = b.pncp.filter((x) => x.situacao !== 'pendente');
    const ultima = el('p', { class: 'sub' }, pend.length + ' aguardando conferência · última busca: carregando…');
    const btn = el('button', { type: 'button', class: 'btn btn-primario', onclick: async () => {
      ocupado(btn, 'Buscando no PNCP…');
      try { const r = await D.buscarPncp(); await recarregar(); rotear(); toast(resumoBusca(r)); }
      catch (e) { ocupado(btn); toast('Não foi possível buscar: ' + e.message); }
    } }, 'Buscar agora');
    const topo = cabecalho('Atualizações do PNCP', null, btn); topo.querySelector('h1').after(ultima);
    rc(c, topo,
      el('p', { class: 'msg msg-info' }, 'Toda madrugada o sistema consulta as atas do CIMOP no PNCP, lê os termos aditivos novos e mostra aqui o que mudou: ata nova, prorrogação (com ou sem renovação dos quantitativos), novo preço por reequilíbrio e cancelamento. Nada muda nos saldos até você conferir e clicar em Confirmar.'),
      pend.length ? pend.map(cartaoPncp) : el('p', { class: 'vazio' }, 'Nenhuma atualização aguardando conferência.'),
      secaoConferenciaPncp(),
      feitas.length ? el('section', { class: 'cartao' }, el('h2', null, 'Histórico'),
        tabela(['Encontrada em', 'Tipo', 'ARP', 'O que mudou', 'Situação', 'Decidido por'], feitas.map((x) => el('tr', null,
          el('td', { class: 'num' }, dataHora(x.criado_em)), el('td', null, etq(TIPO_PNCP, x.tipo)), el('td', null, x.ata_id ? el('a', { href: '#ata-' + x.ata_id }, x.ata_numero) : x.ata_numero),
          el('td', null, x.resumo, x.documento_url ? el('a', { class: 'sub-linha link', href: x.documento_url, target: '_blank', rel: 'noopener' }, (x.documento_titulo || 'Documento') + ' ↗') : null),
          el('td', null, etq(SIT_PNCP, x.situacao)), el('td', null, x.decidido_por_nome || '—', el('span', { class: 'sub-linha' }, dataHora(x.decidido_em))))))) : null);
    D.pncpConfig().then((cfg) => {
      const r = cfg && cfg.ultimo_resultado;
      ultima.textContent = pend.length + ' aguardando conferência · última busca: ' + (cfg && cfg.ultima_execucao ? dataHora(cfg.ultima_execucao) + (r && r.origem ? (r.origem === 'agenda' ? ' (automática)' : ' (' + r.origem.replace('manual: ', 'por ') + ')') : '') : 'ainda não rodou');
      if (r && r.erro) ultima.after(el('p', { class: 'msg msg-erro' }, 'A última busca falhou: ' + r.erro));
      else if (r && r.erros && r.erros.length) ultima.after(el('details', { class: 'msg msg-falta' }, el('summary', null, r.erros.length + ' aviso(s) na última busca'), el('ul', null, r.erros.slice(0, 20).map((t) => el('li', null, t)))));
    }).catch(() => { ultima.textContent = pend.length + ' aguardando conferência'; });
  };
  function resumoBusca(r) {
    if (!r) return 'Busca concluída.';
    const n = (r.novas || 0) + (r.prorrogacoes || 0) + (r.reequilibrios || 0) + (r.cancelamentos || 0);
    return 'Busca concluída: ' + (r.atas_pncp || 0) + ' ata(s) no PNCP, ' + (r.documentos_lidos || 0) + ' documento(s) lido(s), ' + (r.orgaos_pncp != null ? r.orgaos_pncp + ' órgão(s) não participante(s) lido(s), ' : '') + (n ? n + ' atualização(ões) nova(s).' : 'nada novo.');
  }

  function cartaoPncp(x) {
    const d = JSON.parse(JSON.stringify(x.dados || {}));
    const b = estado.base, ata = x.ata_id && b.atasPorId[x.ata_id];
    const corpo = el('div');
    const add = (...k) => k.flat(9).filter((v) => v != null && v !== false).forEach((v) => corpo.append(v));
    let coletar = () => null;
    const uid = (k) => 'pn-' + x.id.slice(0, 8) + '-' + k;
    if (x.tipo === 'prorrogacao') {
      const ps = R.periodosDa(b, x.ata_id); const ult = ps[ps.length - 1];
      const f = { inicio: el('input', { type: 'date', value: d.inicio || '' }), fim: el('input', { type: 'date', value: d.fim || '' }),
        renova: el('input', { type: 'checkbox', checked: !!d.renova }), instrumento: txt(d.instrumento || '') };
      const lido = d.renova_lido === true ? 'O documento fala em renovação dos quantitativos.' : d.renova_lido === false ? 'O documento diz que os quantitativos NÃO são renovados.' : 'Não foi possível identificar no documento: confira e marque se houver renovação.';
      add(
        el('p', { class: 'ajuda' }, 'Vigência atual no sistema: ' + (ult ? ult.numero + 'º período, ' + dBR(ult.inicio) + ' a ' + dBR(ult.fim) : 'sem períodos cadastrados') + '.'),
        el('div', { class: 'grade-campos' }, campo(uid('ini'), 'Início do novo período', f.inicio, null, true), campo(uid('fim'), 'Fim do novo período', f.fim, null, true), campo(uid('ins'), 'Instrumento', f.instrumento)),
        el('label', { class: 'checkbox mt-05' }, f.renova, ' Renova os quantitativos (novo ciclo: os limites de 50% e do dobro recomeçam; o saldo não usado não se soma)'),
        el('p', { class: 'ajuda' }, lido),
        d.trecho ? el('details', { class: 'mt-05' }, el('summary', null, 'Ver o trecho lido do termo aditivo'), el('p', { class: 'trecho' }, d.trecho)) : null);
      coletar = () => {
        if (!f.inicio.value || !f.fim.value) throw new Error('Informe o início e o fim do novo período.');
        if (f.fim.value <= f.inicio.value) throw new Error('O fim deve ser depois do início.');
        if (ult && f.inicio.value <= ult.fim) throw new Error('O novo período deve começar depois de ' + dBR(ult.fim) + '.');
        return { inicio: f.inicio.value, fim: f.fim.value, renova: f.renova.checked, instrumento: f.instrumento.value.trim() || 'Termo aditivo' };
      };
    } else if (x.tipo === 'reequilibrio') {
      const ins = {};
      add(tabela(['Item', 'Descrição', 'Preço atual', 'Preço no aditivo', 'Novo preço'], (d.itens || []).map((l) => {
        const it = b.itens.find((i) => i.ata_id === x.ata_id && i.numero === Number(l.numero));
        ins[l.numero] = el('input', { type: 'number', step: '0.01', min: '0', class: 'qtd', value: l.preco_novo });
        return el('tr', null, el('td', { class: 'num' }, l.numero), el('td', null, it ? it.descricao : el('span', { class: 'falta-leve' }, 'item não encontrado na ata')),
          el('td', { class: 'num' }, it && it.preco_unitario != null ? R.moeda(it.preco_unitario) : '—'), el('td', { class: 'num' }, l.preco_anterior != null ? R.moeda(l.preco_anterior) + ' → ' + R.moeda(l.preco_novo) : R.moeda(l.preco_novo)),
          el('td', { class: 'num' }, ins[l.numero]));
      })));
      const fDesde = el('input', { type: 'date', value: d.desde || hoje() });
      add(el('div', { class: 'grade-campos mt-05' }, campo(uid('desde'), 'Novo preço vale a partir de', fDesde, 'Data de assinatura ou de efeito do termo aditivo.', true)),
        el('p', { class: 'ajuda' }, 'Os ofícios anteriores a essa data mantêm o preço da época; os novos saem com o preço novo. O preço anterior fica na linha do tempo do item.'));
      coletar = () => ({ instrumento: d.instrumento, desde: fDesde.value || hoje(), itens: (d.itens || []).map((l) => { const v = Number(ins[l.numero].value); if (!(v > 0)) throw new Error('Informe o novo preço do item ' + l.numero + '.'); return { numero: Number(l.numero), preco_novo: v }; }) });
    } else if (x.tipo === 'nova_ata') {
      const f = { numero: txt(d.numero), pregao: txt(d.pregao || ''), processo: txt(d.processo || ''), detentora: txt(d.detentora || ''), cnpj: txt(O.formatarCnpj ? O.formatarCnpj(d.cnpj_detentora || '') : d.cnpj_detentora || ''),
        objeto: area(d.objeto || ''), clausulas: txt(d.clausulas_adesao || '4.1 a 4.3'), assinatura: el('input', { type: 'date', value: d.data_assinatura || '' }),
        inicio: el('input', { type: 'date', value: d.inicio || '' }), fim: el('input', { type: 'date', value: d.fim || '' }) };
      let itens = d.itens || [];
      const caixaItens = el('div');
      const desenharItens = () => rc(caixaItens, itens.length ? tabela(['Item', 'Descrição', 'Unidade', 'Quantidade', 'Preço unitário'], itens.map((i) => el('tr', null,
        el('td', { class: 'num' }, i.numero), el('td', null, i.descricao), el('td', null, i.unidade || ''), el('td', { class: 'num' }, R.num(i.qtd, 2)), el('td', { class: 'num' }, i.preco != null ? R.moeda(i.preco) : '—'))))
        : el('p', { class: 'msg msg-falta' }, 'O PNCP ainda não tem o resultado dos itens desta ata. Você pode confirmar e cadastrar os itens depois na tela da ata, ou ignorar e aguardar a próxima busca.'));
      desenharItens();
      let escolha = null;
      if (d.grupos && d.grupos.length > 1) {
        escolha = sel(d.grupos.map((g, i) => [i, g.nome + ' (' + g.itens.length + ' itens)']), Math.max(0, d.grupos.findIndex((g) => g.cnpj === d.cnpj_detentora)));
        escolha.addEventListener('change', () => { const g = d.grupos[Number(escolha.value)]; f.detentora.value = g.nome; f.cnpj.value = g.cnpj; itens = g.itens; desenharItens(); });
      }
      add(
        d.aviso ? el('p', { class: 'msg msg-falta' }, d.aviso) : null,
        escolha ? campo(uid('grp'), 'Contratado desta ata', escolha) : null,
        el('div', { class: 'grade-campos' }, campo(uid('num'), 'Número da ARP', f.numero, null, true), campo(uid('pre'), 'Pregão', f.pregao), campo(uid('pro'), 'Processo', f.processo),
          campo(uid('det'), 'Contratado (detentora)', f.detentora, null, true), campo(uid('cnpj'), 'CNPJ do contratado', f.cnpj), campo(uid('cla'), 'Cláusulas de adesão', f.clausulas),
          campo(uid('ass'), 'Assinatura', f.assinatura), campo(uid('ini'), 'Início da vigência', f.inicio, null, true), campo(uid('fim'), 'Fim da vigência', f.fim, null, true)),
        campo(uid('obj'), 'Objeto', f.objeto),
        el('h3', { class: 'mt-1' }, 'Itens'), caixaItens,
        el('p', { class: 'ajuda mt-05' }, 'Confira se a numeração dos itens é a mesma da ata assinada: no PNCP a numeração segue a da licitação e pode ser diferente.'));
      coletar = () => {
        if (!f.numero.value.trim() || !f.detentora.value.trim() || !f.inicio.value || !f.fim.value) throw new Error('Preencha número, contratado e vigência.');
        return { numero: f.numero.value.trim(), pregao: f.pregao.value.trim() || null, processo: f.processo.value.trim() || null, objeto: f.objeto.value.trim() || null,
          detentora: f.detentora.value.trim(), cnpj_detentora: f.cnpj.value.replace(/\D/g, '') || null, clausulas_adesao: f.clausulas.value.trim() || null,
          data_assinatura: f.assinatura.value || null, inicio: f.inicio.value, fim: f.fim.value, itens };
      };
    } else {
      add(el('p', null, 'Ao confirmar, a ARP fica inativa: some do formulário dos municípios e novos pedidos não podem usá-la. Os ofícios já emitidos continuam no histórico.'));
    }
    const bOk = el('button', { type: 'button', class: 'btn btn-primario' }, 'Confirmar');
    const bNao = el('button', { type: 'button', class: 'btn btn-claro' }, 'Ignorar');
    bOk.addEventListener('click', async () => {
      let dados; try { dados = coletar(); } catch (e) { toast(e.message); return; }
      ocupado(bOk, 'Gravando…');
      try { await D.confirmarAtualizacao(x.id, dados); await recarregar(); rotear(); toast('Atualização confirmada' + (x.tipo === 'prorrogacao' && dados.renova ? ': novo ciclo de quantitativos aberto.' : '.')); }
      catch (e) { ocupado(bOk); toast(e.message); }
    });
    bNao.addEventListener('click', async () => {
      if (!await confirmar('Ignorar atualização', 'A atualização sai da lista e nada muda no sistema. Ela não volta nas próximas buscas.', 'Ignorar')) return;
      try { await D.ignorarAtualizacao(x.id); await recarregar(); rotear(); toast('Atualização ignorada.'); } catch (e) { toast(e.message); }
    });
    return el('section', { class: 'cartao cartao-pncp' },
      el('div', { class: 'pncp-topo' }, etq(TIPO_PNCP, x.tipo), el('h2', null, x.resumo)),
      el('p', { class: 'ajuda' }, 'Encontrada em ' + dataHora(x.criado_em),
        ata ? [' · ', el('a', { class: 'link', href: '#ata-' + ata.id }, 'Abrir a ARP ' + ata.numero)] : null,
        x.documento_url ? [' · ', el('a', { class: 'link', href: x.documento_url, target: '_blank', rel: 'noopener' }, (x.documento_titulo || 'Documento') + ' ↗')] : null),
      corpo, el('div', { class: 'botoes-form mt-1' }, bNao, bOk));
  }

  // ================================================================= SOLICITAÇÕES (formulário online)
  const SIT_SOL = { recebida: ['Recebida', 'etiqueta-pendente'], em_analise: ['Em análise', 'etiqueta-azul'], atendida: ['Atendida', 'etiqueta-ativo'], recusada: ['Recusada', 'etiqueta-desativado'] };
  const etiquetaSol = (x) => el('span', { class: 'etiqueta ' + SIT_SOL[x][1] }, SIT_SOL[x][0]);
  const linkFormulario = () => location.href.split('#')[0] + '#solicitar';

  TELAS.solicitacoes = (c) => {
    const b = estado.base;
    const pend = b.solicitacoes.filter((x) => x.situacao === 'recebida' || x.situacao === 'em_analise');
    const copiar = el('button', { type: 'button', class: 'btn btn-claro', onclick: async () => { try { await navigator.clipboard.writeText(linkFormulario()); toast('Link do formulário copiado.'); } catch (e) { toast('Link: ' + linkFormulario()); } } }, 'Copiar link do formulário');
    rc(c, cabecalho('Solicitações recebidas', pend.length + ' aguardando análise · ' + b.solicitacoes.length + ' no total', copiar, el('a', { class: 'btn btn-claro', href: '#solicitar' }, 'Abrir o formulário ↗')),
      el('p', { class: 'msg msg-info' }, 'O órgão interessado preenche o formulário online (sem login), anexa o ofício e já vê o saldo disponível. A solicitação cai aqui; você confere e lança como pedido com um clique, e o ofício sai normalmente.'),
      b.solicitacoes.length ? tabela(['Protocolo', 'Recebida em', 'Órgão', 'Ofício do órgão', 'Itens', 'Situação', ''], b.solicitacoes.map((x) => el('tr', null,
        el('td', null, el('a', { href: '#solicitacao-' + x.id }, el('strong', null, x.protocolo))),
        el('td', { class: 'num' }, x.criado_em ? new Date(x.criado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''),
        el('td', null, x.orgao_nome, el('span', { class: 'sub-linha' }, O.formatarCnpj(x.cnpj))),
        el('td', null, x.oficio_numero || '—'), el('td', { class: 'num' }, (x.itens || []).length), el('td', null, etiquetaSol(x.situacao)),
        el('td', { class: 'acoes' }, el('a', { class: 'btn ' + (x.situacao === 'recebida' || x.situacao === 'em_analise' ? 'btn-primario' : 'btn-claro') + ' btn-p', href: '#solicitacao-' + x.id }, x.situacao === 'recebida' || x.situacao === 'em_analise' ? 'Analisar' : 'Ver')))))
        : el('p', { class: 'vazio' }, 'Nenhuma solicitação recebida ainda. Envie o link do formulário aos órgãos interessados.'));
  };

  TELAS.solicitacao = (c, id) => {
    const b = estado.base, x = b.solicitacoes.find((y) => y.id === id);
    if (!x) { rc(c, cabecalho('Solicitação não encontrada', null, el('a', { class: 'btn btn-claro', href: '#solicitacoes' }, 'Voltar'))); return; }
    const org = b.orgaos.find((o) => o.cnpj === x.cnpj);
    const orgSim = org || { id: '__novo__', esfera: x.esfera || 'Municipal' };
    const res = R.analisar(b, orgSim, hoje(), x.itens.filter((l) => b.itensPorId[l.item_id]));
    const aberta = x.situacao === 'recebida' || x.situacao === 'em_analise';
    const acoes = [el('a', { class: 'btn btn-claro', href: '#solicitacoes' }, '‹ Solicitações')];
    if (aberta && podeEditar()) acoes.push(el('button', { type: 'button', class: 'btn btn-claro btn-texto-perigo', onclick: () => recusarSolicitacao(x) }, 'Recusar'),
      el('button', { type: 'button', class: 'btn btn-primario', onclick: () => lancarSolicitacao(x) }, 'Lançar como pedido'));
    rc(c, cabecalho('Solicitação ' + x.protocolo, x.orgao_nome, ...acoes),
      x.situacao === 'atendida' && x.pedido_id && b.pedidosPorId[x.pedido_id] ? el('p', { class: 'msg msg-ok' }, 'Atendida pelo ', el('a', { href: '#pedido-' + x.pedido_id }, 'Ofício nº ' + b.pedidosPorId[x.pedido_id].numero_oficio), '.') : null,
      x.situacao === 'recusada' ? el('p', { class: 'msg msg-erro' }, 'Recusada: ' + (x.motivo_recusa || '')) : null,
      !org && aberta ? el('p', { class: 'msg msg-falta' }, 'Órgão ainda não cadastrado. Ao lançar, ele é cadastrado com os dados abaixo.') : null,
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' }, el('h2', null, 'Órgão solicitante'),
          el('dl', { class: 'dados' }, el('dt', null, 'Órgão'), el('dd', null, x.orgao_nome), el('dt', null, 'CNPJ'), el('dd', null, O.formatarCnpj(x.cnpj)), el('dt', null, 'Esfera'), el('dd', null, x.esfera || '—'),
            el('dt', null, 'Responsável'), el('dd', null, [x.responsavel, x.cargo].filter(Boolean).join(' · ') || '—'), el('dt', null, 'Contato'), el('dd', null, [x.email, x.telefone && formatarTelefone(x.telefone)].filter(Boolean).join(' · ')))),
        el('section', { class: 'cartao' }, el('h2', null, 'Pedido'),
          el('dl', { class: 'dados' }, el('dt', null, 'Situação'), el('dd', null, etiquetaSol(x.situacao)), el('dt', null, 'Ofício do órgão'), el('dd', null, (x.oficio_numero || '—') + (x.oficio_data ? ', de ' + R.dataBR(x.oficio_data) : '')),
            el('dt', null, 'Finalidade'), el('dd', null, x.finalidade || '—'), el('dt', null, 'Recebida em'), el('dd', null, new Date(x.criado_em).toLocaleString('pt-BR')),
            el('dt', null, 'Anexos'), el('dd', null, (x.arquivos || []).length ? el('ul', { class: 'm-0 lista-anexos' }, x.arquivos.map((f) => el('li', null, f.tipo + ': ',
              f.caminho ? el('button', { type: 'button', class: 'link', onclick: async () => { const u = await D.urlArquivo(f.caminho); if (u) window.open(u, '_blank', 'noopener'); else toast('Arquivo indisponível.', true); } }, f.nome) : el('span', null, f.nome, ' (na prévia o arquivo não é guardado)')))) : 'nenhum')))),
      el('section', { class: 'cartao' }, el('h2', null, 'Itens pedidos e conferência com o saldo de hoje'),
        tabela(['ARP', 'Item', 'Descrição', 'Und.', 'Qtd pedida', 'Disponível para o órgão', 'Resultado previsto'], res.map((r) => el('tr', { class: 'lin-' + r.decisao },
          el('td', null, r.ata.numero), el('td', { class: 'num' }, r.item.numero), el('td', { class: 'desc' }, r.item.descricao), el('td', null, r.item.unidade || ''),
          el('td', { class: 'num' }, R.num(r.q, 2)), el('td', { class: 'num' }, R.num(r.disponivel, 2)),
          el('td', { class: 'resultado ' + (r.decisao === 'autorizado' ? 'ok' : 'nao') }, el('strong', null, r.decisao === 'autorizado' ? '✓ Pode ser autorizado' : '✕ Seria negado'), r.motivo)))),
        el('p', { class: 'ajuda mt-05' }, 'A conferência final é feita de novo ao registrar o pedido.')));
  };

  async function lancarSolicitacao(x) {
    const b = estado.base;
    try {
      let org = b.orgaos.find((o) => o.cnpj === x.cnpj);
      const temTelefone = D.modo === 'demo' || b.orgaos.some((o) => 'telefone' in o);   // coluna criada pelo script 05
      if (!org) {
        org = await D.salvar('orgaos', { nome: x.orgao_nome, cnpj: x.cnpj, municipio: x.municipio || null, uf: x.uf || null, esfera: x.esfera || 'Municipal',
          tratamento: 'Ao Senhor', responsavel: x.responsavel || null, cargo: x.cargo || null, email: x.email || null, ...(temTelefone && x.telefone ? { telefone: x.telefone } : {}), ativo: true });
      } else {
        const falta = {};
        for (const k of ['responsavel', 'cargo', 'email'].concat(temTelefone ? ['telefone'] : [])) if (!org[k] && x[k]) falta[k] = x[k];
        if (Object.keys(falta).length) await D.salvar('orgaos', { id: org.id, ...falta });
      }
      if (x.situacao === 'recebida') await D.atualizarSolicitacao(x.id, { situacao: 'em_analise', orgao_id: org.id });
      await recarregar();
      const qtd = {}; x.itens.forEach((l) => { if (b.itensPorId[l.item_id]) qtd[l.item_id] = String(l.qtd); });
      rascunho = { ...novoRascunho(), orgao_id: org.id, oficio_solicitante: x.oficio_numero || '', data_solicitante: x.oficio_data || '', finalidade: x.finalidade || '',
        atas: [...new Set(x.itens.map((l) => b.itensPorId[l.item_id] && b.itensPorId[l.item_id].ata_id).filter(Boolean))], qtd, solicitacao_id: x.id };
      location.hash = '#novo';
    } catch (e) { toast(e.message, true); }
  }
  function recusarSolicitacao(x) {
    const m = area('', { rows: 3, placeholder: 'Ex.: ata com vigência encerrada; documento ilegível; pedido duplicado…' });
    const btn = el('button', { type: 'button', class: 'btn btn-perigo' }, 'Recusar');
    const d = abrirDialogo('Recusar a solicitação ' + x.protocolo, el('div', null, el('p', null, 'O órgão vê a recusa e o motivo ao consultar o protocolo.'), campo('rs-motivo', 'Motivo', m, null, true)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Voltar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(m, m.value.trim() ? '' : 'Informe o motivo.')) return;
      ocupado(btn, 'Salvando…');
      try { await D.atualizarSolicitacao(x.id, { situacao: 'recusada', motivo_recusa: m.value.trim() }); await recarregar(); d.close(); toast('Solicitação recusada.'); rotear(); } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ---------------------------------------------------------------- formulário público
  const sol = { cnpj: '', orgao: {}, conhecido: null, aderido: {}, ataSel: '', qtd: {}, oficio_numero: '', oficio_data: '', finalidade: '', arquivos: {}, declaracao: false, atas: null };
  async function telaPublica() {
    const c = $('conteudo-publico');
    if (/^#consultar/.test(location.hash)) return telaConsulta(c);
    rc(c, el('p', { class: 'ajuda' }, 'Carregando atas…'));
    try { sol.atas = sol.atas || await D.publicoAtas(); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, 'Não foi possível carregar as atas: ' + e.message)); return; }
    const atas = sol.atas;
    const itensPorId = {}; atas.forEach((a) => a.itens.forEach((i) => (itensPorId[i.id] = { ...i, ata: a })));
    const disp = (i) => Math.max(0, Math.min(i.qtd_registrada * 0.5 - (sol.aderido[i.id] || 0), i.qtd_registrada * 2 - (i.aderido || 0)));

    // 1. Órgão
    const fCnpj = txt(sol.cnpj ? O.formatarCnpj(sol.cnpj) : '', { inputmode: 'numeric', maxlength: 18, placeholder: '00.000.000/0000-00', autocomplete: 'off' });
    const fichaOrg = el('div');
    const f = {
      nome: txt(sol.orgao.nome, { placeholder: 'Município de …/UF', maxlength: 160 }), municipio: txt(sol.orgao.municipio, { maxlength: 80 }),
      uf: sel([['', 'UF'], ...UFS.map((u) => [u, u])], sol.orgao.uf || ''), esfera: sel(['Municipal', 'Estadual', 'Consórcio', 'Outro'].map((e) => [e, e]), sol.orgao.esfera || 'Municipal'),
      responsavel: txt(sol.orgao.responsavel, { maxlength: 120 }), cargo: txt(sol.orgao.cargo, { maxlength: 120, placeholder: 'Prefeito Municipal' }),
      email: txt(sol.orgao.email, { type: 'email', maxlength: 120 }), telefone: mascaraTelefone(txt(sol.orgao.telefone, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999', autocomplete: 'tel' })) };
    Object.entries(f).forEach(([k, i]) => i.addEventListener('input', () => (sol.orgao[k] = i.value)));
    Object.entries(f).forEach(([k, i]) => i.addEventListener('change', () => (sol.orgao[k] = i.value)));
    const blocoDados = el('div', null,
      campo('sp-nome', 'Nome do órgão ou entidade', f.nome, 'Como deve sair no ofício de resposta.', true),
      el('div', { class: 'grade-campos' }, campo('sp-mun', 'Município', f.municipio, null, true), campo('sp-uf', 'UF', f.uf, null, true), campo('sp-esfera', 'Esfera', f.esfera)),
      el('div', { class: 'grade-campos' }, campo('sp-resp', 'Responsável (quem assina o pedido)', f.responsavel, null, true), campo('sp-cargo', 'Cargo', f.cargo, null, true)),
      el('div', { class: 'grade-campos' }, campo('sp-email', 'E-mail para resposta', f.email, null, true), campo('sp-tel', 'Telefone', f.telefone)));
    async function buscarCnpj() {
      const n = fCnpj.value.replace(/\D/g, '');
      fCnpj.value = n.length === 14 ? O.formatarCnpj(n) : n;
      if (n.length !== 14) { sol.conhecido = null; rc(fichaOrg); desenharItens(); return; }
      if (n === sol.cnpj && sol.conhecido !== null) return;
      sol.cnpj = n; rc(fichaOrg, el('p', { class: 'ajuda' }, 'Consultando…'));
      try {
        const r = await D.publicoOrgao(n);
        sol.aderido = r.aderido || {};
        sol.conhecido = !!r.orgao;
        if (r.orgao) {
          for (const k of ['nome', 'municipio', 'uf', 'esfera', 'responsavel', 'cargo', 'email']) if (r.orgao[k] && !f[k].value) { f[k].value = r.orgao[k]; sol.orgao[k] = r.orgao[k]; }
          rc(fichaOrg, el('p', { class: 'msg msg-ok' }, 'Órgão já cadastrado: ', el('strong', null, r.orgao.nome), '. Confira os dados abaixo. O saldo de cada item já considera as adesões anteriores deste CNPJ.'));
        } else {
          rc(fichaOrg, el('p', { class: 'msg msg-info' }, 'Primeiro pedido deste CNPJ. Buscando os dados na Receita Federal…'));
          const rf = await consultarReceita(n);
          if (rf) {
            for (const k of ['nome', 'municipio', 'uf', 'esfera', 'email', 'telefone']) if (rf[k] && f[k] && !f[k].value.trim()) { f[k].value = rf[k]; sol.orgao[k] = rf[k]; }
            rc(fichaOrg, el('p', { class: 'msg msg-ok' }, 'Dados preenchidos pela Receita Federal: ', el('strong', null, rf.nome), '. Confira, corrija se precisar e informe o responsável.'),
              rf.situacao && !/ativa/i.test(rf.situacao) ? el('p', { class: 'msg msg-falta' }, 'Atenção: a situação cadastral deste CNPJ na Receita é "' + rf.situacao + '".') : null);
          } else rc(fichaOrg, el('p', { class: 'msg msg-info' }, 'Primeiro pedido deste CNPJ. Preencha os dados do órgão.'));
        }
      } catch (e) { rc(fichaOrg, el('p', { class: 'msg msg-erro' }, e.message)); }
      desenharItens();
    }
    fCnpj.addEventListener('input', () => { const n = fCnpj.value.replace(/\D/g, ''); if (n.length === 14) buscarCnpj(); });
    fCnpj.addEventListener('blur', buscarCnpj);

    // 2. Itens
    const selAta = sel([['', 'Escolha a ata…'], ...atas.map((a) => [a.id, 'ARP ' + a.numero + ' · ' + a.detentora + ' · ' + (a.objeto || 'Pregão ' + a.pregao)])], sol.ataSel);
    const areaItens = el('div'), resumo = el('div', { class: 'resumo-solicitacao' });
    selAta.addEventListener('change', () => { sol.ataSel = selAta.value; desenharItens(); });
    function desenharItens() {
      const a = atas.find((x) => x.id === sol.ataSel);
      if (!a) { rc(areaItens, el('p', { class: 'vazio' }, 'Escolha a ata para ver os itens e o saldo disponível.')); atualizarResumo(); return; }
      const semCnpj = sol.cnpj.length !== 14;
      rc(areaItens,
        el('p', { class: 'ajuda' }, 'Contratado: ', el('strong', null, a.detentora), a.vigencia_fim ? ' · Ata vigente até ' + R.dataBR(a.vigencia_fim) : '', semCnpj ? ' · Informe o CNPJ acima para ver o saldo do seu órgão.' : ''),
        el('div', { class: 'tabela-caixa', 'data-sem-paginas': '1' }, el('table', { class: 'tabela' },
          el('thead', null, el('tr', null, ['Item', 'Descrição', 'Und.', 'Preço unit. (R$)', 'Disponível para o seu órgão', 'Quantidade'].map((t, k) => el('th', { scope: 'col', class: k === 0 || k === 3 || k === 4 ? 'num' : null }, t)))),
          el('tbody', null, a.itens.map((i) => {
            const d = disp(i);
            const inp = el('input', { type: 'number', class: 'qtd', min: '0', step: 'any', inputmode: 'decimal', value: sol.qtd[i.id] ?? '', 'aria-label': 'Quantidade do item ' + i.numero, disabled: semCnpj || d <= 0 ? true : null });
            const aviso = el('span', { class: 'sub-linha' });
            const conferir = () => { const q = Number(inp.value); const ex = q > d + 1e-9; inp.classList.toggle('invalido', ex); aviso.textContent = ex ? 'Acima do disponível (máx. ' + R.num(d, 2) + ')' : ''; aviso.className = 'sub-linha' + (ex ? ' ajuda-erro' : ''); };
            inp.addEventListener('input', () => { if (inp.value === '' || Number(inp.value) <= 0) delete sol.qtd[i.id]; else sol.qtd[i.id] = inp.value; conferir(); atualizarResumo(); });
            conferir();
            return el('tr', null, el('td', { class: 'num' }, i.numero), el('td', { class: 'desc' }, i.descricao), el('td', null, i.unidade || ''),
              el('td', { class: 'num' }, i.preco_unitario != null ? R.moeda(i.preco_unitario) : '—'),
              el('td', { class: 'num' + (d <= 0 ? ' saldo-zero' : '') }, semCnpj ? '—' : d > 0 ? R.num(d, 2) : 'esgotado'), el('td', null, inp, aviso));
          })))));
      atualizarResumo();
    }
    function itensEscolhidos() { return Object.entries(sol.qtd).filter(([id, q]) => itensPorId[id] && Number(q) > 0).map(([id, q]) => ({ item_id: id, qtd: Number(q) })); }
    function atualizarResumo() {
      const ls = itensEscolhidos();
      if (!ls.length) { rc(resumo); return; }
      let valor = 0;
      rc(resumo, el('h3', null, 'Itens no seu pedido (' + ls.length + ')'),
        el('ul', { class: 'lista-resumo' }, ls.map((l) => { const i = itensPorId[l.item_id]; if (i.preco_unitario != null) valor += l.qtd * i.preco_unitario;
          return el('li', null, el('span', null, 'ARP ' + i.ata.numero + ' · item ' + i.numero + ' – ' + i.descricao), el('strong', null, R.num(l.qtd, 2) + ' ' + (i.unidade || ''))); })),
        valor ? el('p', { class: 'ajuda' }, 'Valor estimado: R$ ' + R.moeda(valor)) : null);
    }

    // 3. Ofício e documentos
    const fOf = txt(sol.oficio_numero, { maxlength: 40, placeholder: 'Ex.: 088/2026' }), fOfData = el('input', { type: 'date', value: sol.oficio_data });
    const fFin = area(sol.finalidade, { rows: 2, placeholder: 'Ex.: à recuperação de estradas vicinais da zona rural do Município' });
    fOf.addEventListener('input', () => (sol.oficio_numero = fOf.value)); fOfData.addEventListener('change', () => (sol.oficio_data = fOfData.value)); fFin.addEventListener('input', () => (sol.finalidade = fFin.value));
    const arq = (tipo, chave) => { const i = el('input', { type: 'file', accept: 'application/pdf,.pdf' }); i.addEventListener('change', () => { sol.arquivos[chave] = i.files[0] ? { tipo, arquivo: i.files[0] } : undefined; }); return i; };
    const fArqOf = arq('Ofício de solicitação', 'oficio'), fArqJust = arq('Justificativa da vantagem e pesquisa de preços', 'justificativa');
    const fDecl = el('input', { type: 'checkbox', checked: sol.declaracao });
    fDecl.addEventListener('change', () => (sol.declaracao = fDecl.checked));
    const msgEnvio = el('div');
    const btnEnviar = el('button', { type: 'button', class: 'btn btn-primario btn-largo' }, 'Enviar solicitação');
    btnEnviar.addEventListener('click', async () => {
      rc(msgEnvio);
      if (!marcarErro(fCnpj, sol.cnpj.length === 14 ? '' : 'Informe o CNPJ (14 números).')) return;
      for (const [k, i] of Object.entries({ nome: f.nome, municipio: f.municipio, uf: f.uf, responsavel: f.responsavel, cargo: f.cargo })) if (!marcarErro(i, i.value.trim() ? '' : 'Obrigatório.')) return;
      if (!marcarErro(f.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? '' : 'E-mail inválido.')) return;
      if (!marcarErro(f.telefone, telefoneValido(f.telefone.value) ? '' : 'Telefone incompleto: informe o DDD e o número, como (84) 99999-9999.')) return;
      const ls = itensEscolhidos();
      if (!ls.length) { rc(msgEnvio, el('p', { class: 'msg msg-erro' }, 'Escolha a ata e informe a quantidade de pelo menos um item.')); selAta.focus(); return; }
      const acima = ls.filter((l) => l.qtd > disp(itensPorId[l.item_id]) + 1e-9);
      if (acima.length) { rc(msgEnvio, el('p', { class: 'msg msg-erro' }, acima.length + ' item(ns) acima do disponível para o seu órgão. Ajuste as quantidades.')); return; }
      if (!marcarErro(fOf, fOf.value.trim() ? '' : 'Informe o número do ofício.')) return;
      if (!marcarErro(fArqOf, sol.arquivos.oficio ? (/\.pdf$/i.test(sol.arquivos.oficio.arquivo.name) && sol.arquivos.oficio.arquivo.size <= 20 * 1024 * 1024 ? '' : 'Envie um PDF de até 20 MB.') : 'Anexe o ofício assinado (PDF).')) return;
      if (sol.arquivos.justificativa && !marcarErro(fArqJust, /\.pdf$/i.test(sol.arquivos.justificativa.arquivo.name) && sol.arquivos.justificativa.arquivo.size <= 20 * 1024 * 1024 ? '' : 'Envie um PDF de até 20 MB.')) return;
      if (!sol.declaracao) { rc(msgEnvio, el('p', { class: 'msg msg-erro' }, 'Marque a declaração para enviar.')); fDecl.focus(); return; }
      ocupado(btnEnviar, 'Enviando…');
      try {
        const protocolo = await D.enviarSolicitacao({ cnpj: sol.cnpj, orgao_nome: f.nome.value.trim(), municipio: f.municipio.value.trim(), uf: f.uf.value, esfera: f.esfera.value,
          responsavel: f.responsavel.value.trim(), cargo: f.cargo.value.trim(), email: f.email.value.trim(), telefone: f.telefone.value.trim() || null,
          oficio_numero: fOf.value.trim(), oficio_data: fOfData.value || null, finalidade: fFin.value.trim() || null, itens: ls, declaracao: true }, Object.values(sol.arquivos).filter(Boolean));
        if (estado.base) await recarregar();
        const cnpjEnviado = sol.cnpj;
        Object.assign(sol, { qtd: {}, arquivos: {}, declaracao: false, oficio_numero: '', oficio_data: '', finalidade: '', atas: null });
        rc(c, el('section', { class: 'cartao cartao-sucesso' },
          el('div', { class: 'sucesso-icone', 'aria-hidden': 'true' }, '✓'), el('h1', null, 'Solicitação enviada'),
          el('p', null, 'Guarde o número do protocolo:'), el('p', { class: 'protocolo' }, protocolo),
          el('p', { class: 'sub' }, 'O CIMOP vai analisar o pedido e responder por ofício no e-mail informado. Acompanhe pelo protocolo e pelo CNPJ ' + O.formatarCnpj(cnpjEnviado) + '.'),
          el('div', { class: 'linha-botoes' }, el('a', { class: 'btn btn-claro', href: '#consultar' }, 'Consultar andamento'), el('button', { type: 'button', class: 'btn btn-primario', onclick: () => telaPublica() }, 'Fazer outra solicitação'))));
        window.scrollTo(0, 0);
      } catch (e) { rc(msgEnvio, el('p', { class: 'msg msg-erro' }, e.message)); ocupado(btnEnviar); }
    });

    const passo = (n, titulo, ...filhos) => el('section', { class: 'cartao passo-publico' }, el('h2', null, el('span', { class: 'passo-num' }, n), titulo), filhos);
    rc(c,
      el('div', { class: 'intro-publica' }, el('h1', null, 'Solicitar adesão a Ata de Registro de Preços'),
        el('p', { class: 'sub' }, 'Para órgãos e entidades que desejam aderir, como não participantes, às Atas de Registro de Preços do CIMOP (art. 86, § 2º, da Lei nº 14.133/2021 e art. 28 da Resolução CIMOP nº 018/2023).'),
        el('p', null, el('a', { class: 'link', href: '#consultar' }, 'Já enviou? Consulte o andamento pelo protocolo'),
          estado.usuario ? [' · ', el('a', { class: 'link', href: '#solicitacoes' }, 'Voltar ao painel do CIMOP')] : null)),
      passo(1, 'Órgão solicitante', campo('sp-cnpj', 'CNPJ do órgão ou entidade', fCnpj, 'Cada CNPJ tem limite próprio de 50% do registrado por item.', true), fichaOrg, blocoDados),
      passo(2, 'Ata e quantidades', atas.length
        ? [campo('sp-ata', 'Ata de registro de preços', selAta, 'Só aparecem atas vigentes. Pode juntar itens de mais de uma ata: escolha outra e continue.'), areaItens, resumo]
        : el('p', { class: 'msg msg-info' }, 'No momento não há ata de registro de preços vigente disponível para adesão. Em caso de dúvida, fale com o CIMOP pelo e-mail cimop.rn@gmail.com.')),
      passo(3, 'Ofício e documentos',
        el('div', { class: 'grade-campos' }, campo('sp-of', 'Nº do ofício de solicitação', fOf, null, true), campo('sp-ofdata', 'Data do ofício', fOfData)),
        campo('sp-fin', 'Finalidade da adesão', fFin, 'Para que serão usados os itens. Entra no ofício de resposta.'),
        el('div', { class: 'grade-campos' }, campo('sp-arqof', 'Ofício assinado (PDF)', fArqOf, null, true), campo('sp-arqjust', 'Justificativa da vantagem e pesquisa de preços (PDF)', fArqJust, 'Recomendado (art. 28, I e II, da Resolução 018/2023).')),
        el('label', { class: 'checkbox declaracao' }, fDecl, ' Declaro que este órgão demonstrará a vantagem da adesão e a compatibilidade dos preços registrados com os de mercado (art. 23 da Lei nº 14.133/2021), e que a contratação dependerá da aceitação do contratado e será formalizada dentro da vigência da ata.'),
        msgEnvio, btnEnviar));
    desenharItens();
    if (sol.cnpj.length === 14 && sol.conhecido === null) buscarCnpj();
    c.focus({ preventScroll: true }); window.scrollTo(0, 0);
  }

  function telaConsulta(c) {
    const fProt = txt('', { placeholder: 'SOL-2026-0001', maxlength: 20 }), fCnpj = txt(sol.cnpj ? O.formatarCnpj(sol.cnpj) : '', { inputmode: 'numeric', maxlength: 18 });
    const saida = el('div');
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Consultar');
    btn.addEventListener('click', async () => {
      const cnpj = fCnpj.value.replace(/\D/g, '');
      if (!marcarErro(fProt, fProt.value.trim() ? '' : 'Informe o protocolo.')) return;
      if (!marcarErro(fCnpj, cnpj.length === 14 ? '' : 'CNPJ com 14 números.')) return;
      ocupado(btn, 'Consultando…');
      try {
        const r = await D.consultarSolicitacao(fProt.value, cnpj);
        rc(saida, !r ? el('p', { class: 'msg msg-erro' }, 'Não encontramos esse protocolo para este CNPJ.') : el('div', { class: 'msg msg-' + (r.situacao === 'recusada' ? 'erro' : r.situacao === 'atendida' ? 'ok' : 'info') },
          el('p', null, el('strong', null, r.protocolo), ' · ', SIT_SOL[r.situacao][0]),
          r.situacao === 'atendida' ? el('p', null, 'Respondido pelo Ofício nº ' + (r.oficio || '—') + ' do CIMOP, enviado ao e-mail informado.') : null,
          r.situacao === 'recusada' ? el('p', null, 'Motivo: ' + (r.motivo_recusa || '—')) : null,
          r.situacao === 'recebida' || r.situacao === 'em_analise' ? el('p', null, 'Seu pedido está na fila de análise do CIMOP.') : null));
      } catch (e) { rc(saida, el('p', { class: 'msg msg-erro' }, e.message)); } finally { ocupado(btn); }
    });
    rc(c, el('div', { class: 'intro-publica' }, el('h1', null, 'Consultar solicitação'), el('p', null, el('a', { class: 'link', href: '#solicitar' }, '‹ Voltar ao formulário'))),
      el('section', { class: 'cartao passo-publico' }, el('div', { class: 'grade-campos' }, campo('cs-prot', 'Protocolo', fProt, null, true), campo('cs-cnpj', 'CNPJ do órgão', fCnpj, null, true)), btn, saida));
  }

  // ================================================================= ÓRGÃOS
  TELAS.orgaos = (c) => {
    const b = estado.base;
    const busca = el('input', { type: 'search', placeholder: 'Buscar por nome, CNPJ ou município', 'aria-label': 'Buscar órgão' });
    const lista = el('div');
    const qtdAdesoes = (o) => b.pedidos.filter((p) => p.orgao_id === o.id && p.situacao !== 'cancelado').length;
    const filtrar = () => {
      const t = normalizar(busca.value);
      const res = b.orgaos.filter((o) => !t || normalizar(o.nome + ' ' + (o.cnpj || '') + ' ' + (o.municipio || '') + ' ' + (o.uf || '')).includes(t));
      rc(lista, res.length ? tabela(['Órgão', 'CNPJ', 'UF', 'Esfera', 'Destinatário do ofício', 'Pedidos', ''], res.map((o) => {
        const falta = !o.cnpj || !o.responsavel;
        return el('tr', null, el('td', null, el('strong', null, o.nome), o.ativo === false ? el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Inativo') : null),
          el('td', { class: 'num' }, o.cnpj ? O.formatarCnpj(o.cnpj) : el('span', { class: 'falta-leve' }, 'falta')), el('td', null, o.uf || ''), el('td', null, o.esfera),
          el('td', null, o.responsavel || el('span', { class: 'falta-leve' }, 'falta'), o.cargo ? el('span', { class: 'sub-linha' }, o.cargo) : null),
          el('td', { class: 'num' }, qtdAdesoes(o)),
          el('td', { class: 'acoes' }, podeEditar() ? el('button', { type: 'button', class: 'btn ' + (falta ? 'btn-primario' : 'btn-claro') + ' btn-p', onclick: () => formOrgao(o, () => rotear()) }, falta ? 'Completar' : 'Editar') : null));
      })) : el('p', { class: 'vazio' }, 'Nenhum órgão encontrado.'));
      paginarTudo(lista);
    };
    busca.addEventListener('input', filtrar);
    const incompletos = b.orgaos.filter((o) => !o.cnpj || !o.responsavel).length;
    rc(c, cabecalho('Órgãos aderentes', b.orgaos.length + ' órgão(s). O limite de 50% é controlado por CNPJ.', podeEditar() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formOrgao({}, () => rotear()) }, '+ Novo órgão') : null),
      incompletos ? el('p', { class: 'msg msg-falta' }, incompletos + ' órgão(s) sem CNPJ ou destinatário. Complete para o ofício sair com esses dados.') : null,
      el('div', { class: 'filtros' }, busca), lista);
    filtrar();
  };

  function formOrgao(o, depois) {
    const f = { nome: txt(o.nome, { placeholder: 'Município de …/RN', maxlength: 160 }), cnpj: txt(o.cnpj ? O.formatarCnpj(o.cnpj) : '', { inputmode: 'numeric', maxlength: 18, placeholder: '00.000.000/0000-00' }),
      municipio: txt(o.municipio, { maxlength: 80 }), uf: sel(UFS.map((u) => [u, u]), o.uf || 'RN'),
      esfera: sel(['Municipal', 'Estadual', 'Federal', 'Consórcio', 'Outro'].map((e) => [e, e]), o.esfera || 'Municipal'),
      tratamento: sel([['Ao Senhor', 'Ao Senhor'], ['À Senhora', 'À Senhora']], o.tratamento || 'Ao Senhor'),
      responsavel: txt(o.responsavel, { maxlength: 120 }), cargo: txt(o.cargo, { maxlength: 120, placeholder: 'Prefeito Municipal' }),
      vocativo: txt(o.vocativo, { maxlength: 80, placeholder: 'Automático: "Senhor Prefeito,"' }), email: txt(o.email, { type: 'email', maxlength: 120 }),
      telefone: mascaraTelefone(txt(o.telefone, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999' })),
      ativo: el('input', { type: 'checkbox', checked: o.ativo !== false }) };
    f.cnpj.addEventListener('input', () => { const n = f.cnpj.value.replace(/\D/g, '').slice(0, 14); f.cnpj.value = n.length === 14 ? O.formatarCnpj(n) : n; });
    const avisoRf = el('div');
    const buscarRf = async () => {
      const n = f.cnpj.value.replace(/\D/g, ''); if (n.length !== 14) { toast('Digite os 14 números do CNPJ.', true); return; }
      rc(avisoRf, el('p', { class: 'ajuda' }, 'Consultando a Receita Federal…'));
      const rf = await consultarReceita(n);
      if (!rf) { rc(avisoRf, el('p', { class: 'msg msg-falta' }, 'Não foi possível consultar agora. Preencha manualmente.')); return; }
      for (const k of ['nome', 'municipio', 'uf', 'esfera', 'email', 'telefone']) if (rf[k] && f[k] && (!f[k].value.trim() || (k === 'esfera' && !o.id))) f[k].value = rf[k];
      rc(avisoRf, el('p', { class: 'msg msg-ok' }, 'Preenchido pela Receita Federal (só os campos vazios). Confira.'),
        rf.esfera === 'Federal' ? el('p', { class: 'msg msg-erro' }, 'Órgão federal: adesão vedada (art. 86, § 8º, da Lei nº 14.133/2021).') : null,
        rf.situacao && !/ativa/i.test(rf.situacao) ? el('p', { class: 'msg msg-falta' }, 'Situação cadastral na Receita: ' + rf.situacao + '.') : null);
    };
    if (!o.id) f.cnpj.addEventListener('input', () => { if (f.cnpj.value.replace(/\D/g, '').length === 14 && !f.nome.value.trim()) buscarRf(); });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(o.id ? 'Editar órgão' : 'Novo órgão', el('div', null,
      campo('fo-nome', 'Nome (como sai no ofício)', f.nome, 'Ex.: Município de Riacho da Cruz/RN · Fundo Municipal de Saúde de …', true),
      el('div', { class: 'grade-campos' }, campo('fo-cnpj', 'CNPJ', f.cnpj, null, true), campo('fo-esfera', 'Esfera', f.esfera, 'Federal: adesão vedada (art. 86, § 8º).')),
      el('div', null, el('button', { type: 'button', class: 'link', onclick: buscarRf }, 'Buscar dados na Receita Federal'), avisoRf),
      el('div', { class: 'grade-campos' }, campo('fo-mun', 'Município', f.municipio), campo('fo-uf', 'UF', f.uf)),
      el('div', { class: 'secao-form' }, el('h3', null, 'Destinatário do ofício'),
        el('div', { class: 'grade-campos' }, campo('fo-trat', 'Tratamento', f.tratamento), campo('fo-resp', 'Nome do responsável', f.responsavel)),
        el('div', { class: 'grade-campos' }, campo('fo-cargo', 'Cargo', f.cargo), campo('fo-voc', 'Vocativo', f.vocativo)),
        el('div', { class: 'grade-campos' }, campo('fo-email', 'E-mail (recebe a resposta)', f.email), campo('fo-tel', 'Telefone', f.telefone))),
      o.id ? el('label', { class: 'checkbox' }, f.ativo, ' Órgão ativo') : null),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      const cnpj = f.cnpj.value.replace(/\D/g, '');
      const dup = cnpj && estado.base.orgaos.find((x) => x.cnpj === cnpj && x.id !== o.id);
      if (!marcarErro(f.cnpj, cnpj.length !== 14 ? 'CNPJ com 14 números.' : dup ? 'Esse CNPJ já é de ' + dup.nome + '.' : '')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.telefone, telefoneValido(f.telefone.value) ? '' : 'Telefone incompleto: DDD e número.')) return;
      ocupado(btn, 'Salvando…');
      try {
        const s = await D.salvar('orgaos', { ...(o.id ? { id: o.id } : {}), nome: f.nome.value.trim(), cnpj, municipio: f.municipio.value.trim() || null, uf: f.uf.value, esfera: f.esfera.value,
          tratamento: f.tratamento.value, responsavel: f.responsavel.value.trim() || null, cargo: f.cargo.value.trim() || null, vocativo: f.vocativo.value.trim() || null,
          email: f.email.value.trim() || null, ...(f.telefone.value || o.telefone ? { telefone: f.telefone.value || null } : {}), ativo: f.ativo.checked });
        await recarregar(); d.close(); toast('Órgão salvo.'); depois && depois(estado.base.orgaosPorId[s.id] || s);
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ================================================================= IMPORTAR
  TELAS.importar = (c) => {
    if (!podeEditar()) { rc(c, cabecalho('Acesso não permitido')); return; }
    const arq = el('input', { type: 'file', accept: '.xlsx,.xls' });
    const resultado = el('div');
    arq.addEventListener('change', async () => {
      const file = arq.files[0]; if (!file) return;
      rc(resultado, el('p', { class: 'ajuda' }, 'Lendo a planilha…'));
      try {
        const d = await PL.ler(file);
        const b = estado.base;
        const hash = await PL.hashDados(d);
        const ja = await D.importacaoExistente(hash).catch(() => null);
        const novasAtas = d.atas.filter((a) => !b.atas.some((x) => x.numero === a.numero)).length;
        const grupos = D.agruparAdesoes(d.adesoes);
        // Adesões que já estão no sistema (mesmo ofício do CIMOP e mesmo órgão) são ignoradas
        const existe = (g) => D.grupoJaExiste(b, g);
        const repetidas = grupos.filter(existe).length;
        const bloqueado = !!ja || d.erros.length > 0;
        const btn = el('button', { type: 'button', class: 'btn btn-primario', disabled: bloqueado ? true : null }, 'Importar agora');
        const prog = el('p', { class: 'ajuda' });
        rc(resultado, el('section', { class: 'cartao' }, el('h2', null, 'Conferência: ' + file.name),
          el('div', { class: 'importar-resumo' },
            el('div', null, el('span', { class: 'rotulo' }, 'Atas'), el('strong', null, d.atas.length), el('small', null, novasAtas + ' nova(s) · ' + (d.atas.length - novasAtas) + ' atualizada(s)')),
            el('div', null, el('span', { class: 'rotulo' }, 'Itens'), el('strong', null, d.itens.length), el('small', null, d.itens.filter((i) => i.preco_unitario == null).length + ' sem preço')),
            el('div', null, el('span', { class: 'rotulo' }, 'Órgãos'), el('strong', null, d.orgaos.length), el('small', null, d.orgaos.filter((o) => !o.cnpj).length + ' sem CNPJ')),
            el('div', null, el('span', { class: 'rotulo' }, 'Vigências'), el('strong', null, d.periodos.length), el('small', null, d.periodos.filter((p) => p.renova_quantitativos).length + ' com renovação')),
            el('div', null, el('span', { class: 'rotulo' }, 'Adesões (histórico)'), el('strong', null, grupos.length - repetidas), el('small', null, repetidas ? repetidas + ' já existem e serão ignoradas' : d.adesoes.length + ' linha(s) de item'))),
          ja ? el('div', { class: 'msg msg-erro' }, el('strong', null, 'Esta planilha já foi importada'), ' em ' + new Date(ja.criado_em).toLocaleString('pt-BR') + (ja.criado_por_nome ? ' por ' + ja.criado_por_nome : '') + '. Os mesmos dados não podem ser importados duas vezes. Para corrigir algo, altere a planilha (ou edite direto no sistema) e envie de novo.')
          : d.erros.length ? el('div', { class: 'msg msg-erro' }, el('strong', null, 'Corrija na planilha e envie de novo:'), el('ul', null, d.erros.slice(0, 30).map((e) => el('li', null, e))), d.erros.length > 30 ? el('p', null, '+ ' + (d.erros.length - 30) + ' erro(s)') : null)
            : el('p', { class: 'msg msg-ok' }, 'Planilha no formato certo. Atas, itens e órgãos que já existem são atualizados; adesões que já estão no sistema (mesmo ofício e órgão) não são duplicadas.'),
          el('div', { class: 'linha-botoes' }, btn), prog));
        btn.addEventListener('click', async () => {
          ocupado(btn, 'Importando…');
          try {
            const de2 = await D.importacaoExistente(hash).catch(() => null);
            if (de2) throw new Error('Esta planilha acabou de ser importada por outra pessoa.');
            const r = await D.importar(d, (n, t) => (prog.textContent = 'Gravando adesões: ' + n + ' de ' + t + '…'));
            await D.registrarImportacao({ hash, arquivo: file.name, resumo: r }).catch(() => {});
            await recarregar();
            prog.textContent = '';
            resultado.prepend(el('p', { class: 'msg msg-ok' }, `Importado: ${r.atas} ata(s), ${r.itens} item(ns), ${r.periodos || 0} período(s) de vigência, ${r.orgaos} órgão(s) e ${r.pedidos} adesão(ões)` + (r.ignorados ? ` (${r.ignorados} já existiam e foram ignoradas).` : '.')));
            btn.remove(); toast('Importação concluída.');
          } catch (e) { toast(e.message, true); ocupado(btn); }
        });
      } catch (e) { rc(resultado, el('p', { class: 'msg msg-erro' }, e.message)); }
      arq.value = '';   // permite escolher o mesmo arquivo de novo (e ver o bloqueio)
    });
    rc(c, cabecalho('Importar planilha', 'Atas, itens, órgãos e histórico de adesões a partir da planilha-modelo.'),
      el('div', { class: 'grade grade-2' },
        el('section', { class: 'cartao' }, el('h2', null, '1. Baixe o modelo'),
          el('ol', { class: 'passos' }, el('li', null, 'Para uma ata nova: preencha só as abas ', el('strong', null, 'Atas'), ' e ', el('strong', null, 'Itens'), '.'),
            el('li', null, 'Órgãos e Adesões são opcionais (servem para trazer histórico).'), el('li', null, 'Não mude os nomes das abas nem os títulos das colunas.')),
          el('button', { type: 'button', class: 'btn btn-claro mt-05', onclick: () => baixar('Modelo de importação - Adesões ARP.xlsx', PL.modeloVazio(), XLSX_T) }, 'Baixar modelo vazio')),
        el('section', { class: 'cartao' }, el('h2', null, '2. Envie a planilha preenchida'), campo('imp-arq', 'Arquivo (.xlsx)', arq, 'O sistema confere tudo antes de gravar.'))),
      resultado);
  };

  // ================================================================= CONFIGURAÇÕES
  TELAS.configuracoes = (c) => {
    if (!eAdmin()) { rc(c, cabecalho('Acesso não permitido')); return; }
    const cf = estado.base.config;
    const f = { orgao_nome: txt(cf.orgao_nome), sigla: txt(cf.sigla, { maxlength: 20 }), cidade_uf: txt(cf.cidade_uf), presidente_nome: txt(cf.presidente_nome), presidente_cargo: txt(cf.presidente_cargo),
      resolucao_srp: txt(cf.resolucao_srp), resolucao_alteracao: txt(cf.resolucao_alteracao), texto_anexos: area(cf.texto_anexos, { rows: 3 }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    btn.addEventListener('click', async () => {
      for (const k of ['sigla', 'cidade_uf', 'presidente_nome', 'presidente_cargo', 'resolucao_srp']) if (!marcarErro(f[k], f[k].value.trim() ? '' : 'Obrigatório.')) return;
      ocupado(btn, 'Salvando…');
      try { await D.salvarConfig(Object.fromEntries(Object.entries(f).map(([k, i]) => [k, i.value.trim()]))); await recarregar(); toast('Configurações salvas.'); } catch (e) { toast(e.message, true); } finally { ocupado(btn); }
    });
    rc(c, cabecalho('Configurações do ofício', 'Dados fixos que entram em todos os ofícios. O timbre e o rodapé são os do Ofício nº 105/2026.'),
      el('section', { class: 'cartao' }, el('h2', null, 'Assinatura e local'),
        el('div', { class: 'grade-campos' }, campo('cf-pres', 'Presidente', f.presidente_nome, null, true), campo('cf-cargo', 'Cargo na assinatura', f.presidente_cargo, null, true)),
        el('div', { class: 'grade-campos' }, campo('cf-cidade', 'Local da data', f.cidade_uf, null, true), campo('cf-sigla', 'Sigla no número do ofício', f.sigla, 'OFÍCIO Nº 105/2026 – CIMOP', true)),
        campo('cf-nome', 'Nome do consórcio', f.orgao_nome)),
      el('section', { class: 'cartao' }, el('h2', null, 'Fundamentação'),
        el('div', { class: 'grade-campos' }, campo('cf-res', 'Regulamento do SRP', f.resolucao_srp, 'Citado nos arts. 28 e 29.', true), campo('cf-res2', 'Resolução que altera', f.resolucao_alteracao)),
        campo('cf-anexos', 'Texto padrão dos anexos', f.texto_anexos, '{pregao} vira "Pregão Eletrônico nº 008/2025". Pode ser ajustado em cada pedido.')),
      el('div', { class: 'barra-salvar' }, btn),
      secaoEmailDocumentos());
  };

  // Configurações › E-mail e documentos (links das resoluções e modelo do e-mail de resposta)
  function secaoEmailDocumentos() {
    const cf = estado.base.config;
    let docs = (cf.documentos || []).map((d) => ({ ...d }));
    if (!docs.length) docs = [{ titulo: cf.resolucao_srp || 'Resolução CIMOP nº 018/2023', url: '' }, { titulo: cf.resolucao_alteracao || 'Resolução CIMOP nº 001/2026', url: '' }];
    const caixaDocs = el('div', { class: 'lista-docs' });
    const desenharDocs = () => rc(caixaDocs, docs.map((d, k) => {
      const t = txt(d.titulo, { placeholder: 'Resolução CIMOP nº 018/2023', 'aria-label': 'Título do documento ' + (k + 1) });
      const u = txt(d.url, { type: 'url', placeholder: 'https://… (portal da transparência, Google Drive, PNCP…)', 'aria-label': 'Link do documento ' + (k + 1) });
      t.addEventListener('input', () => (d.titulo = t.value)); u.addEventListener('input', () => (d.url = u.value));
      return el('div', { class: 'linha-doc' }, t, u, el('button', { type: 'button', class: 'btn btn-claro btn-p', 'aria-label': 'Remover documento', onclick: () => { docs.splice(k, 1); desenharDocs(); } }, 'Remover'));
    }), el('button', { type: 'button', class: 'link', onclick: () => { docs.push({ titulo: '', url: '' }); desenharDocs(); } }, '+ Documento'));
    desenharDocs();
    const f = { resposta: txt(cf.email_resposta || '', { type: 'email', placeholder: 'licitacao@cimop.rn.gov.br' }), copia: txt(cf.email_copia || ''),
      assunto: txt(cf.email_assunto || ''), corpo: area(cf.email_corpo || '', { rows: 12 }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar e-mail e documentos');
    btn.addEventListener('click', async () => {
      const lista = docs.map((d) => ({ titulo: (d.titulo || '').trim(), url: (d.url || '').trim() })).filter((d) => d.titulo || d.url);
      const ruim = lista.find((d) => !d.titulo || !/^https?:\/\/\S+$/.test(d.url));
      if (ruim) { toast('Cada documento precisa de título e de um link completo (https://…).', true); return; }
      if (!marcarErro(f.resposta, f.resposta.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.resposta.value.trim()) ? 'E-mail inválido.' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvarConfig({ documentos: lista, email_resposta: f.resposta.value.trim() || null, email_copia: f.copia.value.trim() || null,
          email_assunto: f.assunto.value.trim(), email_corpo: f.corpo.value });
        await recarregar(); toast('E-mail e documentos salvos.');
      } catch (e) { toast(/column|coluna|schema cache/i.test(e.message) ? 'Rode o script 05 na Supabase para liberar esta parte.' : e.message, true); } finally { ocupado(btn); }
    });
    return el('section', { class: 'cartao mt-1' }, el('h2', null, 'E-mail de resposta e documentos'),
      el('p', { class: 'ajuda' }, 'O e-mail ao órgão só sai depois que você revisa e clica em "Enviar", na tela do pedido. Ele leva o ofício em Word anexo e os links abaixo, além do link do processo completo de cada ata (cadastrado em "Editar ata"; em branco, usa a página da licitação no PNCP).'),
      el('h3', null, 'Documentos que acompanham todo ofício'), caixaDocs,
      el('div', { class: 'grade-campos mt-1' }, campo('cf-resp', 'Respostas do órgão vão para', f.resposta, 'Endereço que recebe quando o município clicar em "Responder".'), campo('cf-cc', 'Cópia em todos os e-mails', f.copia, 'Opcional. Separe com vírgula.')),
      campo('cf-assunto', 'Assunto', f.assunto),
      campo('cf-corpo', 'Texto do e-mail', f.corpo, 'Campos: {vocativo} {oficio} {sigla} {assunto} {solicitacao} {documentos} {presidente} {presidente_cargo} {orgao} {orgao_destino}. Você ainda pode ajustar o texto em cada envio.'),
      el('div', { class: 'barra-salvar' }, btn));
  }

  // ================================================================= USUÁRIOS E ACESSOS (módulo "sistema")
  const MODULOS_COM_PERFIL = () => M.lista.filter((m) => !m.soAdminSistema);
  function chipsAcesso(u, acessos) {
    if (u.perfil === 'administrador') return el('span', { class: 'etiqueta etiqueta-admin' }, 'Administrador do sistema · todos os módulos');
    if (!acessos) return el('span', { class: 'etiqueta' }, 'Controle de Adesões: ' + (NOME_PERFIL[u.perfil] || u.perfil));
    const meus = acessos.filter((a) => a.usuario_id === u.id && M.porId(a.modulo_id));
    if (!meus.length) return el('span', { class: 'etiqueta etiqueta-cancelado' }, 'Nenhum módulo');
    return el('span', { class: 'chips-modulos' }, meus.map((a) => { const m = M.porId(a.modulo_id);
      return el('span', { class: 'chip-modulo', style: '--g:' + m.cor }, el('span', { class: 'chip-modulo-icone' }, M.icone(m.id, 14)), m.nome + ': ' + NOME_PERFIL[a.perfil]); }));
  }
  TELAS.usuarios = async (c) => {
    if (!eAdminSistema()) { rc(c, cabecalho('Acesso não permitido', 'Só o administrador do sistema cuida dos usuários.')); return; }
    const btnNovo = el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formUsuario(null, acessos) }, '+ Novo usuário');
    rc(c, cabecalho('Usuários e acessos', 'Quem pode entrar no sistema e quais módulos cada pessoa vê.', btnNovo), el('p', { class: 'ajuda' }, 'Carregando…'));
    const lista = await D.usuarios();
    let acessos = null, semScript = false;
    try { acessos = await D.acessosDeTodos(); } catch (e) { semScript = true; }
    rc(c, cabecalho('Usuários e acessos', lista.length + ' usuário(s). Cada pessoa só vê, na tela principal, os módulos liberados para ela.', btnNovo),
      semScript ? el('p', { class: 'msg msg-falta' }, 'Rode o script 10 (supabase/10_modulos_permissoes.sql) na Supabase para liberar o acesso por módulo. Até lá vale o perfil antigo, só no Controle de Adesões.') : null,
      el('div', { class: 'legenda-perfis' },
        el('strong', null, 'Perfis em cada módulo: '),
        Object.keys(NOME_PERFIL).map((k) => el('span', null, el('b', null, NOME_PERFIL[k]), ' — ' + M.AJUDA_PERFIL[k] + '. ')),
        el('span', null, el('b', null, 'Administrador do sistema'), ' — todos os módulos e os usuários.')),
      tabela(['Nome', 'E-mail', 'Módulos liberados', 'Situação', ''], lista.map((u) => el('tr', null, el('td', null, el('strong', null, u.nome)), el('td', null, u.email),
        el('td', null, chipsAcesso(u, acessos)),
        el('td', null, el('span', { class: 'etiqueta ' + (u.ativo ? 'etiqueta-ativo' : 'etiqueta-desativado') }, u.ativo ? 'Ativo' : 'Desativado')),
        el('td', { class: 'acoes' }, u.id === estado.usuario.id ? el('span', { class: 'ajuda' }, 'você') : el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formUsuario(u, acessos) }, 'Editar'))))));
    paginarTudo(c);
  };
  function formUsuario(u, acessos) {
    u = u || {};
    const novo = !u.id;
    const f = { nome: txt(u.nome, { maxlength: 120 }), email: txt(u.email, { type: 'email', maxlength: 120, disabled: u.id ? true : null }), senha: txt('', { maxlength: 60 }),
      admin: el('input', { type: 'checkbox', checked: u.perfil === 'administrador' }),
      perfil: sel(Object.entries(NOME_PERFIL), u.perfil || 'operador'), ativo: el('input', { type: 'checkbox', checked: u.ativo !== false }) };
    // Um seletor por módulo: Sem acesso / Consulta / Operador / Administrador do módulo
    const atuais = {};
    if (acessos) for (const a of acessos) if (a.usuario_id === u.id) atuais[a.modulo_id] = a.perfil;
    const OPCOES = [['', 'Sem acesso'], ['consulta', 'Consulta'], ['operador', 'Operador'], ['administrador', 'Administrador do módulo']];
    const seletores = MODULOS_COM_PERFIL().map((m) => {
      const s = sel(OPCOES, novo ? '' : (atuais[m.id] || ''), { id: 'fu-mod-' + m.id, 'aria-describedby': 'fu-mod-' + m.id + '-desc' });
      return { m, s, linha: el('div', { class: 'linha-acesso', style: '--g:' + m.cor },
        el('span', { class: 'icone-modulo icone-modulo-p' }, M.icone(m.id, 20)),
        el('div', { class: 'linha-acesso-texto' }, el('label', { for: 'fu-mod-' + m.id }, m.nome), el('span', { class: 'ajuda', id: 'fu-mod-' + m.id + '-desc' }, m.descricao)), s) };
    });
    const caixaModulos = el('fieldset', { class: 'caixa-acessos' }, el('legend', null, 'Módulos que a pessoa vê'), seletores.map((x) => x.linha),
      el('p', { class: 'ajuda aviso-admin', hidden: true }, 'Administrador do sistema vê todos os módulos como administrador. Os acessos abaixo ficam guardados caso ele deixe de ser administrador.'));
    const sincronizar = () => { caixaModulos.classList.toggle('desligada', f.admin.checked); caixaModulos.querySelector('.aviso-admin').hidden = !f.admin.checked; };
    f.admin.addEventListener('change', sincronizar); sincronizar();
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(novo ? 'Novo usuário' : 'Editar usuário', el('div', null,
      campo('fu-nome', 'Nome', f.nome, null, true), campo('fu-email', 'E-mail', f.email, u.id ? 'O e-mail não muda por aqui.' : null, true),
      novo ? campo('fu-senha', 'Senha inicial', f.senha, 'A pessoa troca no primeiro acesso.', true) : null,
      acessos
        ? [el('label', { class: 'checkbox caixa-admin' }, f.admin, el('span', null, el('strong', null, 'Administrador do sistema'), el('br'), el('span', { class: 'ajuda' }, 'Vê todos os módulos e cria usuários e acessos.'))), caixaModulos]
        : [campo('fu-perfil', 'Perfil (Controle de Adesões)', f.perfil, 'Rode o script 10 na Supabase para liberar o acesso por módulo.')],
      u.id ? el('label', { class: 'checkbox' }, f.ativo, ' Acesso ativo (quem já entrou é desativado, nunca apagado)') : null),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (novo && !marcarErro(f.email, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? '' : 'E-mail inválido.')) return;
      if (novo && !marcarErro(f.senha, f.senha.value.length >= 8 ? '' : 'Pelo menos 8 caracteres.')) return;
      const lista = seletores.filter((x) => x.s.value).map((x) => ({ modulo: x.m.id, perfil: x.s.value }));
      if (acessos && !f.admin.checked && !lista.length && !(await confirmar('Nenhum módulo liberado', 'A pessoa vai entrar, mas não vai ver nenhum módulo. Salvar assim mesmo?', 'Salvar assim mesmo'))) return;
      // Perfil geral: administrador do sistema ou usuário comum. Sem o script 10, vale o perfil antigo.
      const perfil = acessos ? (f.admin.checked ? 'administrador' : (u.perfil && u.perfil !== 'administrador' ? u.perfil : 'operador')) : f.perfil.value;
      ocupado(btn, 'Salvando…');
      try {
        let id = u.id;
        if (!novo) await D.salvarUsuario({ id, nome: f.nome.value.trim(), perfil, ativo: f.ativo.checked });
        else { const r = await D.criarUsuario({ nome: f.nome.value.trim(), email: f.email.value.trim().toLowerCase(), senha: f.senha.value, perfil }); id = r && r.id; }
        if (acessos && id) await D.salvarAcessos(id, lista);
        d.close(); toast('Usuário salvo.'); rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  window.ADESOES = { iniciar };
})();
