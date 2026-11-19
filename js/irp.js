/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio
   Módulo IRP — Procedimento Público de Intenção de Registro de Preços
   (art. 86 da Lei nº 14.133/2021; Resolução CIMOP nº 018/2023, alterada pela nº 001/2026)
   Painel: lista, ficha em abas (dados, itens, divulgação, manifestações e análise, ETP, inclusão posterior,
   mapa e consolidação, envio à Ata). Público: formulário #manifestar-<id>, sem login.
   Usa o núcleo (window.NUCLEO), o Cadastro (window.CADASTRO) e os documentos (window.IRP_DOCS).
   ===================================================================== */
(function () {
  'use strict';
  const N = window.NUCLEO;
  const { el, rc, $, estado, D, O, toast, marcarErro, campo, txt, area, sel, abrirDialogo, confirmar, abas, cabecalho, paginarTudo,
    baixar, ocupado, consultarReceita, formatarTelefone, mascaraTelefone, telefoneValido, normalizar, UFS, TELAS } = N;
  const DOC = window.IRP_DOCS;
  const pode = () => ['administrador', 'operador'].includes(N.perfilEm('irp'));
  const admin = () => N.perfilEm('irp') === 'administrador';
  const soNum = (v) => String(v || '').replace(/\D/g, '');
  function cnpjValido(v) {
    const c = soNum(v); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
    const dv = (n) => { const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = pesos.reduce((a, p, k) => a + Number(c[k]) * p, 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
    return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
  }
  const dataBR = DOC.dataBR, num = DOC.num;
  const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const ORIGEM = { formulario: 'Formulário', etp: 'Demanda do ETP', inclusao_posterior: 'Inclusão posterior' };
  const RESULTADO = { aceita: 'Aceita', ajustada: 'Aceita com ajuste', recusada: 'Recusada' };
  const VINCULO = DOC.VINCULO;
  const linkFormulario = (irp) => location.href.split('#')[0] + '#manifestar-' + irp.id;

  // Tabela que vira cartões no celular (mesmo padrão do Cadastro)
  function tabela(cab, linhas, extra) {
    const t = N.tabela(cab, linhas, Object.assign({ classeTabela: 'tabela-cartoes' }, extra || {}));
    const rot = cab.map((x) => (x instanceof Node ? x.textContent : String(x || '')).trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (rot[i]) td.setAttribute('data-rotulo', rot[i]); else td.classList.add('celula-acoes'); }));
    return t;
  }

  // ---------------------------------------------------------------- dados
  const B = () => estado.irp;
  const C = () => estado.cad;
  const irpPorId = (id) => B().irps.find((x) => x.id === id);
  const itensDe = (id) => B().itens.filter((t) => t.irp_id === id).sort((a, b) => a.numero - b.numero);
  const orgao = (id) => (C().orgaos.find((o) => o.id === id) || { id, nome: '(ente não encontrado)' });
  const respostasDe = (id, todas) => B().respostas.filter((r) => r.irp_id === id && (todas || !['substituida', 'cancelada'].includes(r.situacao)));
  const itensResp = (rid) => B().respItens.filter((x) => x.resposta_id === rid);
  const pessoa = (id) => C().pessoas.find((p) => p.id === id);
  const situacaoEfetiva = (i) => (i.situacao === 'aberta' && i.prazo_fim && hoje() > i.prazo_fim ? 'encerrada' : i.situacao);
  const aberta = (i) => situacaoEfetiva(i) === 'aberta';
  const ETQ_SIT = { rascunho: ['Rascunho', 'etiqueta-inativo'], aberta: ['Aberta', 'etiqueta-ativo'], encerrada: ['Prazo encerrado', 'etiqueta-pendente'], consolidada: ['Consolidada', 'etiqueta-azul'], cancelada: ['Cancelada', 'etiqueta-desativado'] };
  const etqSit = (i) => { const [t, c] = ETQ_SIT[situacaoEfetiva(i)] || ['—', '']; return el('span', { class: 'etiqueta ' + c }, t); };
  const nIrp = (i) => DOC.numeroIrp(i);
  async function recarregarIrp() { estado.irp = await D.carregarIrp(); }
  async function depois(msg) { await recarregarIrp(); if (msg) toast(msg); N.rotear(); }

  // Para cada resposta: o ente e os itens resolvidos (usado no mapa, relatório e Excel)
  function respostasCompletas(irpId, incluirPendentes) {
    const its = Object.fromEntries(itensDe(irpId).map((t) => [t.id, t]));
    return respostasDe(irpId).filter((r) => incluirPendentes || ['recebida', 'analisada'].includes(r.situacao)).map((r) => Object.assign({}, r, {
      orgao: orgao(r.orgao_id), itens: itensResp(r.id).map((x) => Object.assign({}, x, { item: x.item_id ? its[x.item_id] : null })) }));
  }
  // Entes que deveriam aparecer no acompanhamento: consorciados ativos + quem já respondeu
  function entesAcompanhados(irpId) {
    const ids = new Set(respostasDe(irpId, true).map((r) => r.orgao_id));
    return C().orgaos.filter((o) => ids.has(o.id) || (o.vinculo === 'consorciado' && (o.situacao_consorcio || 'ativo') === 'ativo' && o.ativo !== false))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  // Destinatários de avisos de um ente: e-mail institucional, gestor e contatos marcados
  function destinos(o) {
    const g = window.CADASTRO.gestorAtual(o.id);
    const cs = window.CADASTRO.contatosDe(o.id).filter((x) => x.ativo && x.recebe_avisos);
    const emails = [...new Set([o.email, g && g.email, ...cs.map((x) => x.email)].filter(Boolean).map((e) => e.toLowerCase()))];
    const whats = [];
    const add = (n, quem) => { const d = soNum(n); if (d.length >= 10 && !whats.some((w) => soNum(w.numero) === d)) whats.push({ numero: n, quem }); };
    add(o.whatsapp, 'Institucional'); if (g) add(g.whatsapp, g.nome + ' (gestor)'); cs.forEach((x) => add(x.whatsapp, (x.nome || x.area) + ' · ' + x.area));
    return { emails, whats };
  }

  // ================================================================ LISTA
  TELAS.irps = (c) => {
    if (!B()) { rc(c, cabecalho('Intenção de Registro de Preços'), el('p', { class: 'msg msg-falta' }, 'Rode o script 13 na Supabase para ativar o módulo IRP.')); return; }
    const lista = B().irps.slice().sort((a, b) => b.ano - a.ano || b.numero - a.numero);
    const busca = el('input', { type: 'search', placeholder: 'Número, processo ou objeto', 'aria-label': 'Buscar IRP' });
    const fSit = sel([['', 'Todas'], ['aberta', 'Abertas'], ['encerrada', 'Prazo encerrado'], ['consolidada', 'Consolidadas'], ['rascunho', 'Rascunhos'], ['cancelada', 'Canceladas']], '', { 'aria-label': 'Situação' });
    const caixa = el('div');
    const filtrar = () => {
      const t = normalizar(busca.value);
      const res = lista.filter((i) => (!t || normalizar([nIrp(i), i.processo, i.objeto].join(' ')).includes(t)) && (!fSit.value || situacaoEfetiva(i) === fSit.value));
      rc(caixa, res.length ? tabela(['IRP', 'Processo', 'Objeto', 'Prazo', 'Situação', 'Manifestações', ''], res.map((i) => {
        const rs = respostasDe(i.id), pend = rs.filter((r) => r.situacao === 'recebida').length;
        return el('tr', null,
          el('td', null, el('a', { class: 'link-forte', href: '#irp-' + i.id }, 'IRP ' + nIrp(i))),
          el('td', null, i.processo), el('td', null, i.objeto.length > 110 ? i.objeto.slice(0, 110) + '…' : i.objeto),
          el('td', null, i.prazo_fim ? 'até ' + dataBR(i.prazo_fim) : '—'), el('td', null, etqSit(i)),
          el('td', null, rs.filter((r) => ['recebida', 'analisada'].includes(r.situacao)).length + ' recebida(s)', pend ? el('span', { class: 'etiqueta etiqueta-pendente ml-1' }, pend + ' a analisar') : null),
          el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#irp-' + i.id }, 'Abrir')));
      })) : el('p', { class: 'vazio' }, lista.length ? 'Nenhuma IRP com esses filtros.' : 'Nenhuma IRP cadastrada ainda.'));
      paginarTudo(caixa);
    };
    busca.addEventListener('input', filtrar); fSit.addEventListener('change', filtrar);
    rc(c, cabecalho('Intenção de Registro de Preços', 'Procedimento público de IRP (art. 86 da Lei nº 14.133/2021 e Resolução nº 018/2023 – CIMOP, alterada pela nº 001/2026).',
      admin() ? el('button', { type: 'button', class: 'btn btn-claro', onclick: formNumeracao }, 'Numeração') : null,
      pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: formNova }, '+ Nova IRP') : null),
    el('div', { class: 'filtros' }, campo('fi-busca', 'Buscar', busca), campo('fi-sit', 'Situação', fSit)), caixa);
    filtrar();
  };

  function formNumeracao() {
    const ano = new Date().getFullYear();
    const atual = (B().numeracao.find((x) => x.ano === ano) || {}).proximo || (Math.max(0, ...B().irps.filter((i) => i.ano === ano).map((i) => i.numero)) + 1);
    const f = { ano: el('input', { type: 'number', value: ano, min: 2020, max: 2100 }), prox: el('input', { type: 'number', value: atual, min: 1 }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo('Numeração das IRPs', el('div', null,
      el('p', null, 'O sistema numera as IRPs sozinho, em sequência dentro de cada ano. Informe o número da próxima IRP (por exemplo, se a última feita fora do sistema foi a 002/' + ano + ', informe 3).'),
      el('div', { class: 'grade-campos' }, campo('fn-ano', 'Ano', f.ano), campo('fn-prox', 'Próximo número', f.prox))), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      ocupado(btn, 'Salvando…');
      try { await D.definirNumeracaoIrp(Number(f.ano.value), Number(f.prox.value)); d.close(); await depois('Numeração salva: a próxima IRP de ' + f.ano.value + ' será a ' + String(f.prox.value).padStart(3, '0') + '/' + f.ano.value + '.'); }
      catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  const opcoesSignatario = (atual) => [['', 'Escolha quem assina…'], ...window.CADASTRO.signatarios().map((p) => [p.id, p.nome + ' · ' + p.cargo])].concat(atual && !window.CADASTRO.signatarios().some((p) => p.id === atual) && pessoa(atual) ? [[atual, pessoa(atual).nome + ' · ' + pessoa(atual).cargo + ' (inativo)']] : []);
  function formNova() {
    const dir = window.CADASTRO.signatarios().find((p) => /diretor/i.test(p.cargo));
    const f = { processo: txt('', { maxlength: 60, placeholder: 'Ex.: 045/2026' }), objeto: area('', { rows: 4, maxlength: 2000, placeholder: 'fornecimento de … conforme especificações do Termo de Referência' }),
      direta: el('input', { type: 'checkbox' }), sig: sel(opcoesSignatario(), dir ? dir.id : '') };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Criar IRP');
    const d = abrirDialogo('Nova IRP', el('div', null,
      campo('fv-proc', 'Número do processo administrativo', f.processo, 'É a chave que liga a IRP à Ata e aos próximos módulos. Não pode repetir.', true),
      campo('fv-obj', 'Objeto', f.objeto, 'Complete a frase: "…futura Ata de Registro de Preços para [objeto]".', true),
      campo('fv-sig', 'Quem assina o edital', f.sig, 'Vem das Pessoas do CIMOP (Cadastro).', true),
      el('label', { class: 'checkbox' }, f.direta, ' Contratação direta (prazo mínimo de 3 dias úteis, em vez de 8)'),
      el('p', { class: 'ajuda' }, 'O número da IRP é dado pelo sistema ao criar.')), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.processo, f.processo.value.trim() ? '' : 'Informe o processo.')) return;
      const chave = soNum(f.processo.value);
      const dup = chave && B().irps.find((i) => i.situacao !== 'cancelada' && soNum(i.processo) === chave);
      if (!marcarErro(f.processo, dup ? 'Já existe a IRP ' + nIrp(dup) + ' com este processo.' : '')) return;
      if (!marcarErro(f.objeto, f.objeto.value.trim() ? '' : 'Informe o objeto.')) return;
      if (!marcarErro(f.sig, f.sig.value ? '' : 'Escolha quem assina.')) return;
      ocupado(btn, 'Criando…');
      try { const id = await D.criarIrp({ processo: f.processo.value.trim(), objeto: f.objeto.value.trim().replace(/\.$/, ''), contratacao_direta: f.direta.checked, signatario_id: f.sig.value });
        d.close(); estado.abaIrp = 'itens'; await recarregarIrp(); location.hash = '#irp-' + id; toast('IRP criada. Agora cadastre os itens.'); }
      catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ================================================================ FICHA
  TELAS.irp = (c, id) => {
    if (!B()) { TELAS.irps(c); return; }
    const i = irpPorId(id);
    if (!i) { rc(c, cabecalho('IRP não encontrada'), el('a', { class: 'link', href: '#irps' }, '← Voltar')); return; }
    const sit = situacaoEfetiva(i);
    const rs = respostasDe(i.id);
    const pend = rs.filter((r) => r.situacao === 'recebida').length;
    const caixaAbas = abas([
      ['dados', 'Dados', () => abaDados(i)],
      ['itens', 'Itens (' + itensDe(i.id).length + ')', () => abaItens(i)],
      ['divulgacao', 'Divulgação', () => abaDivulgacao(i)],
      ['manifestacoes', 'Manifestações' + (pend ? ' (' + pend + ' a analisar)' : ''), () => abaManifestacoes(i)],
      ['etp', 'Demandas do ETP', () => abaEtp(i)],
      ['inclusao', 'Inclusão posterior', () => abaInclusao(i)],
      ['consolidacao', 'Mapa e consolidação', () => abaConsolidacao(i)],
    ], estado.abaIrp);
    caixaAbas.addEventListener('click', (ev) => { const b = ev.target.closest('[role="tab"]'); if (b) estado.abaIrp = b.id.replace('aba-', ''); });
    const prazoTxt = i.prazo_fim ? (sit === 'aberta' ? 'Recebe manifestações até ' + dataBR(i.prazo_fim) : 'Prazo até ' + dataBR(i.prazo_fim)) : 'Prazo ainda não definido';
    rc(c, el('p', { class: 'mb-1' }, el('a', { class: 'link', href: '#irps' }, '← Todas as IRPs')),
      cabecalho('IRP nº ' + nIrp(i), 'Processo ' + i.processo + ' · ' + prazoTxt),
      el('p', { class: 'etiquetas-linha' }, etqSit(i), i.contratacao_direta ? el('span', { class: 'etiqueta' }, 'Contratação direta') : null, i.ata_id ? el('span', { class: 'etiqueta etiqueta-azul' }, 'Participantes enviados à Ata') : null),
      el('p', { class: 'objeto-irp' }, i.objeto),
      i.situacao === 'cancelada' ? el('p', { class: 'msg msg-erro' }, 'IRP cancelada: ' + (i.motivo_cancelamento || '')) : null,
      caixaAbas);
  };

  // ---------- Dados
  function abaDados(i) {
    const rasc = i.situacao === 'rascunho';
    const editavel = pode() && !['consolidada', 'cancelada'].includes(i.situacao);
    const f = { processo: txt(i.processo, { maxlength: 60 }), objeto: area(i.objeto, { rows: 4, maxlength: 2000 }), direta: el('input', { type: 'checkbox', checked: !!i.contratacao_direta }),
      sig: sel(opcoesSignatario(i.signatario_id), i.signatario_id || ''), docData: el('input', { type: 'date', value: i.data_documento || '' }),
      div: el('input', { type: 'date', value: i.data_divulgacao || '' }), prazo: el('input', { type: 'date', value: i.prazo_fim || '' }),
      edital: el('input', { type: 'date', value: i.edital_licitacao_em || '' }), obs: area(i.observacoes, { rows: 2, maxlength: 2000 }) };
    if (!editavel) Object.values(f).forEach((x) => { x.disabled = true; });
    if (!rasc) { f.div.disabled = true; f.direta.disabled = true; f.processo.disabled = true; }
    if (i.situacao !== 'rascunho' && i.situacao !== 'aberta') f.prazo.disabled = true;
    if (i.situacao === 'aberta') f.prazo.disabled = true;   // depois de aberta, o prazo só muda por prorrogação registrada
    const avisoPrazo = el('p', { class: 'ajuda' });
    const calcular = async () => {
      if (!f.div.value) { avisoPrazo.textContent = 'Informe a data de divulgação no site do CIMOP para o sistema calcular o prazo mínimo.'; return; }
      try { const m = await D.prazoMinimoIrp(f.div.value, f.direta.checked); f.prazo.min = m;
        avisoPrazo.textContent = `Prazo mínimo: até ${dataBR(m)} (${f.direta.checked ? '3' : '8'} dias úteis contados do 1º dia útil após a divulgação, sem sábados, domingos e feriados).`;
        if (rasc && (!f.prazo.value || f.prazo.value < m)) f.prazo.value = m; } catch (e) { avisoPrazo.textContent = e.message; }
    };
    f.div.addEventListener('change', calcular); f.direta.addEventListener('change', calcular); calcular();
    const dadosSalvar = () => ({ id: i.id, processo: f.processo.value.trim(), objeto: f.objeto.value.trim().replace(/\.$/, ''), contratacao_direta: f.direta.checked, signatario_id: f.sig.value || null,
      data_documento: f.docData.value || null, data_divulgacao: f.div.value || null, prazo_fim: f.prazo.value || null, edital_licitacao_em: f.edital.value || null, observacoes: f.obs.value.trim() || null });
    const btn = el('button', { type: 'button', class: 'btn btn-claro' }, 'Salvar');
    btn.addEventListener('click', async () => { ocupado(btn, 'Salvando…'); try { await D.salvar('irps', dadosSalvar()); await depois('IRP salva.'); } catch (e) { toast(e.message, true); ocupado(btn); } });
    const abrir = el('button', { type: 'button', class: 'btn btn-primario' }, 'Abrir a IRP');
    abrir.addEventListener('click', async () => {
      if (!itensDe(i.id).length) { toast('Cadastre os itens antes de abrir.', true); return; }
      if (!marcarErro(f.div, f.div.value ? '' : 'Informe a data de divulgação.')) return;
      if (!marcarErro(f.prazo, f.prazo.value ? '' : 'Informe o prazo final.')) return;
      if (!marcarErro(f.sig, f.sig.value ? '' : 'Escolha quem assina.')) return;
      if (!(await confirmar('Abrir a IRP', `A IRP ${nIrp(i)} passa a receber manifestações pelo formulário até ${dataBR(f.prazo.value)}. Depois de aberta, os itens não mudam e o prazo só muda por prorrogação registrada. Abrir?`, 'Abrir'))) return;
      ocupado(abrir, 'Abrindo…');
      try { await D.salvar('irps', Object.assign(dadosSalvar(), { situacao: 'aberta' })); estado.abaIrp = 'divulgacao'; await depois('IRP aberta. Baixe o edital e divulgue o formulário.'); } catch (e) { toast(e.message, true); ocupado(abrir); }
    });
    const cancelar = async () => {
      const m = area('', { rows: 3 }); const b2 = el('button', { type: 'button', class: 'btn btn-perigo' }, 'Cancelar a IRP');
      const d = abrirDialogo('Cancelar a IRP', el('div', null, el('p', null, 'A IRP fica registrada como cancelada, com o motivo. O formulário deixa de receber manifestações.'), campo('fc-mot', 'Motivo', m, null, true)),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Voltar'), b2]);
      b2.addEventListener('click', async () => { if (!marcarErro(m, m.value.trim() ? '' : 'Informe o motivo.')) return; ocupado(b2, 'Cancelando…');
        try { await D.salvar('irps', { id: i.id, situacao: 'cancelada', motivo_cancelamento: m.value.trim() }); d.close(); await depois('IRP cancelada.'); } catch (e) { toast(e.message, true); ocupado(b2); } });
    };
    const ps = B().prorrogacoes.filter((p) => p.irp_id === i.id);
    return el('div', null,
      el('div', { class: 'grade-campos' }, campo('fd-proc', 'Processo administrativo', f.processo, rasc ? 'Chave de ligação com a Ata e os próximos módulos.' : null, true), campo('fd-sig', 'Quem assina o edital', f.sig, null, true)),
      campo('fd-obj', 'Objeto', f.objeto, null, true),
      el('label', { class: 'checkbox' }, f.direta, ' Contratação direta (prazo mínimo de 3 dias úteis)'),
      el('div', { class: 'secao-form' }, el('h3', null, 'Prazo (art. 8º da Resolução nº 018/2023)'),
        el('div', { class: 'grade-campos' }, campo('fd-div', 'Divulgação no site do CIMOP', f.div), campo('fd-prazo', 'Prazo final das manifestações', f.prazo, i.situacao === 'aberta' ? 'Para mudar, use "Prorrogar" na aba Mapa e consolidação.' : null),
          campo('fd-docdata', 'Data do edital (documento)', f.docData, 'Vazio: usa a data de divulgação.')), avisoPrazo,
        ps.length ? el('ul', { class: 'lista-simples' }, ps.map((p) => el('li', null, `Prorrogada de ${dataBR(p.prazo_anterior)} para ${dataBR(p.prazo_novo)} em ${quando(p.criado_em)}: ${p.motivo}`))) : null),
      el('div', { class: 'secao-form' }, el('h3', null, 'Fase seguinte'),
        campo('fd-edital', 'Publicação do edital da licitação (ou aviso de contratação direta)', f.edital, 'A partir desta data não se admite inclusão posterior de participantes (art. 8º, § 7º).')),
      campo('fd-obs', 'Observações internas', f.obs),
      editavel ? el('div', { class: 'barra-salvar' }, i.situacao === 'rascunho' || i.situacao === 'aberta' ? el('button', { type: 'button', class: 'btn btn-texto', onclick: cancelar }, 'Cancelar a IRP') : null, btn, rasc ? abrir : null) : null);
  }

  // ---------- Itens
  function abaItens(i) {
    const its = itensDe(i.id), rasc = i.situacao === 'rascunho' && pode();
    const formItem = (t) => {
      const f = { numero: el('input', { type: 'number', min: 1, value: t.numero || (Math.max(0, ...its.map((x) => x.numero)) + 1) }), desc: area(t.descricao, { rows: 4, maxlength: 4000 }),
        unid: txt(t.unidade || 'Unidade', { maxlength: 40, list: 'unidades-irp' }) };
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
      const d = abrirDialogo(t.id ? 'Editar item' : 'Novo item', el('div', null, el('datalist', { id: 'unidades-irp' }, ['Unidade', 'Caixa', 'Pacote', 'Kit', 'Litro', 'Quilo', 'Metro', 'Serviço', 'Mês', 'Diária'].map((u) => el('option', { value: u }))),
        el('div', { class: 'grade-campos' }, campo('ft-num', 'Item nº', f.numero, null, true), campo('ft-un', 'Unidade', f.unid, null, true)), campo('ft-desc', 'Descrição técnica', f.desc, null, true)),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', async () => {
        const n = Number(f.numero.value);
        if (!marcarErro(f.numero, n > 0 && !its.some((x) => x.numero === n && x.id !== t.id) ? '' : 'Número inválido ou repetido.')) return;
        if (!marcarErro(f.desc, f.desc.value.trim() ? '' : 'Informe a descrição.')) return;
        ocupado(b, 'Salvando…');
        try { await D.salvar('irp_itens', { ...(t.id ? { id: t.id } : { irp_id: i.id }), numero: n, descricao: f.desc.value.trim(), unidade: f.unid.value.trim() || 'Unidade' }); d.close(); await depois('Item salvo.'); }
        catch (e) { toast(e.message, true); ocupado(b); }
      });
    };
    const colar = () => {
      const t = area('', { rows: 10, placeholder: 'Descrição<TAB>Unidade (uma linha por item, copiada do Excel ou do Word)' });
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Incluir itens');
      const d = abrirDialogo('Colar itens da planilha', el('div', null, el('p', null, 'Copie as colunas Descrição e Unidade da planilha (ou só a descrição) e cole abaixo. Se a primeira coluna for o número do item, ele é usado.'), campo('fc-col', 'Itens', t)),
        [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b], true);
      b.addEventListener('click', async () => {
        let prox = Math.max(0, ...its.map((x) => x.numero)) + 1; const novos = [];
        for (const linha of t.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
          let cols = linha.split('\t').map((x) => x.trim());
          let n = null; if (cols.length > 1 && /^\d+$/.test(cols[0])) n = Number(cols.shift());
          if (!cols[0]) continue;
          novos.push({ irp_id: i.id, numero: n && !its.some((x) => x.numero === n) && !novos.some((x) => x.numero === n) ? n : prox, descricao: cols[0], unidade: cols[1] || 'Unidade' });
          prox = Math.max(prox, novos[novos.length - 1].numero) + 1;
        }
        if (!novos.length) { toast('Nenhuma linha com descrição.', true); return; }
        ocupado(b, 'Incluindo…');
        try { for (const x of novos) await D.salvar('irp_itens', x); d.close(); await depois(novos.length + ' item(ns) incluído(s).'); } catch (e) { toast(e.message, true); ocupado(b); }
      });
    };
    const excluir = async (t) => { if (!(await confirmar('Excluir item', 'Excluir o item ' + t.numero + '?', 'Excluir', true))) return; try { await D.excluir('irp_itens', t.id); await depois('Item excluído.'); } catch (e) { toast(e.message, true); } };
    return el('div', null,
      el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, rasc ? 'Os itens só podem ser alterados enquanto a IRP é rascunho.' : 'A IRP já foi aberta: os itens estão travados.'),
        rasc ? el('div', { class: 'botoes-linha' }, el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: colar }, 'Colar da planilha'), el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => formItem({}) }, '+ Novo item')) : null),
      its.length ? tabela(['Item', 'Descrição técnica', 'Unidade', ''], its.map((t) => el('tr', null, el('td', { class: 'num' }, t.numero), el('td', { class: 'texto-longo' }, t.descricao), el('td', null, t.unidade),
        el('td', { class: 'acoes' }, rasc ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formItem(t) }, 'Editar'), el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluir(t) }, 'Excluir')] : null))))
        : el('p', { class: 'vazio' }, 'Nenhum item cadastrado.'));
  }

  // ---------- Divulgação: edital, link, e-mail e WhatsApp
  async function baixarEdital(i, btn) {
    const p = pessoa(i.signatario_id);
    if (!p) { toast('Escolha quem assina o edital (aba Dados).', true); return; }
    if (!itensDe(i.id).length) { toast('Cadastre os itens.', true); return; }
    ocupado(btn, 'Gerando…');
    try { const blob = await DOC.gerarEdital({ irp: i, itens: itensDe(i.id), signatario: { nome: p.nome, cargo: p.cargo }, cimop: C().config || {}, link: linkFormulario(i) }); await baixar(DOC.nomeEdital(i), blob); }
    catch (e) { toast(e.message, true); } finally { ocupado(btn); }
  }
  function textoAviso(i, tipo, o) {
    const cf = C().config || {};
    if (tipo === 'lembrete') return `Lembrete do ${cf.sigla || 'CIMOP'}: o prazo da IRP nº ${nIrp(i)} (${i.objeto}) termina em ${dataBR(i.prazo_fim)}. Para participar da futura Ata de Registro de Preços, preencha o formulário, assine e anexe: ${linkFormulario(i)}`;
    return `O ${cf.sigla || 'CIMOP'} abriu a Intenção de Registro de Preços nº ${nIrp(i)}, para ${i.objeto}. Os órgãos interessados em participar da futura Ata de Registro de Preços podem se manifestar até ${dataBR(i.prazo_fim)} pelo formulário: ${linkFormulario(i)}`;
  }
  function abaDivulgacao(i) {
    const btnEd = el('button', { type: 'button', class: 'btn btn-primario' }, 'Baixar o edital (Word)');
    btnEd.addEventListener('click', () => baixarEdital(i, btnEd));
    const link = linkFormulario(i);
    const copiar = async () => { try { await navigator.clipboard.writeText(link); toast('Link copiado.'); } catch (e) { toast('Copie o link: ' + link); } };
    const envios = B().envios.filter((x) => x.irp_id === i.id).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const pronta = i.situacao === 'aberta' || i.situacao === 'encerrada';
    return el('div', null,
      el('section', { class: 'cartao' }, el('h3', null, '1. Edital'),
        el('p', { class: 'ajuda' }, 'Word com o timbre do CIMOP, o texto aprovado e os itens. Junte ao processo e publique no site oficial (a divulgação conta o prazo).'), btnEd),
      el('section', { class: 'cartao' }, el('h3', null, '2. Formulário para os entes'),
        el('p', { class: 'ajuda' }, 'Cada ente informa itens, quantidades e local de entrega, baixa o PDF já preenchido com o próprio timbre, assina e anexa no mesmo endereço.'),
        el('div', { class: 'link-copiar' }, el('code', null, link), el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: copiar }, 'Copiar link'), el('a', { class: 'btn btn-claro btn-p', href: link, target: '_blank', rel: 'noopener' }, 'Abrir ↗')),
        i.situacao === 'rascunho' ? el('p', { class: 'msg msg-falta' }, 'O formulário só funciona depois que a IRP for aberta (aba Dados).') : null),
      el('section', { class: 'cartao' }, el('h3', null, '3. Avisar os entes'),
        el('p', { class: 'ajuda' }, 'E-mail para todos de uma vez (você revisa antes de sair) e WhatsApp um a um, com a mensagem pronta. Vão para o e-mail do ente, o gestor atual e os contatos marcados com "Recebe avisos" no Cadastro.'),
        pronta && pode() ? el('div', { class: 'botoes-linha' },
          el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => dialogoEmail(i, 'divulgacao') }, 'E-mail de divulgação…'),
          el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoWhats(i, 'divulgacao') }, 'WhatsApp de divulgação…'),
          aberta(i) ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoEmail(i, 'lembrete') }, 'E-mail de lembrete (só quem falta)…') : null,
          aberta(i) ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => dialogoWhats(i, 'lembrete') }, 'WhatsApp de lembrete…') : null)
          : el('p', { class: 'vazio' }, 'Disponível depois que a IRP for aberta.')),
      el('section', { class: 'cartao' }, el('h3', null, 'Avisos enviados'),
        envios.length ? tabela(['Quando', 'Ente', 'Meio', 'Tipo', 'Destino', 'Por'], envios.map((x) => el('tr', null, el('td', null, quando(x.criado_em)), el('td', null, x.orgao_id ? orgao(x.orgao_id).nome : '—'),
          el('td', null, x.canal === 'email' ? 'E-mail' : 'WhatsApp'), el('td', null, { divulgacao: 'Divulgação', lembrete: 'Lembrete', resultado: 'Resultado' }[x.tipo]), el('td', null, x.destino || '—'), el('td', null, x.criado_por_nome || '—'))))
          : el('p', { class: 'vazio' }, 'Nenhum aviso registrado.')));
  }
  // Entes que recebem a divulgação ou o lembrete
  function alvos(i, tipo) {
    const resp = new Set(respostasDe(i.id).filter((r) => ['recebida', 'analisada'].includes(r.situacao)).map((r) => r.orgao_id));
    return C().orgaos.filter((o) => o.ativo !== false && o.vinculo && !['retirado', 'excluido'].includes(o.situacao_consorcio) && (tipo !== 'lembrete' || !resp.has(o.id)))
      .sort((a, b) => (a.vinculo === 'consorciado' ? 0 : 1) - (b.vinculo === 'consorciado' ? 0 : 1) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }
  function dialogoEmail(i, tipo) {
    const cf = C().config || {};
    const lista = alvos(i, tipo).map((o) => ({ o, d: destinos(o) }));
    const assunto = txt(tipo === 'lembrete' ? `Lembrete – IRP nº ${nIrp(i)} – ${cf.sigla || 'CIMOP'} – prazo até ${dataBR(i.prazo_fim)}` : `IRP nº ${nIrp(i)} – ${cf.sigla || 'CIMOP'} – Intenção de Registro de Preços`, { maxlength: 200 });
    const corpo = area(`Prezados(as),

${textoAviso(i, tipo)}

Procedimento: depois de preencher, o sistema gera o Formulário Padrão em PDF, já com os dados do órgão. Basta assinar e anexar no mesmo endereço. A manifestação só vale com o formulário assinado anexado.

Os entes consorciados cuja demanda já esteja prevista no Estudo Técnico Preliminar participam da Ata independentemente de manifestação (art. 8º, § 3º, da Resolução nº 018/2023 – CIMOP), mas podem confirmar ou ajustar seus quantitativos pelo formulário.

Dúvidas: ${cf.email_institucional || 'cimop.rn@gmail.com'}${cf.telefone ? ' · ' + cf.telefone : ''}.

Atenciosamente,
${(pessoa(i.signatario_id) || {}).nome || ''}
${(pessoa(i.signatario_id) || {}).cargo || ''} do ${cf.sigla || 'CIMOP'}`, { rows: 14 });
    const marcas = lista.map(({ o, d }) => ({ o, d, cx: el('input', { type: 'checkbox', checked: d.emails.length > 0, disabled: !d.emails.length }) }));
    const semEmail = marcas.filter((m) => !m.d.emails.length).length;
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar e-mails');
    const progresso = el('p', { class: 'ajuda', 'aria-live': 'polite' });
    const d = abrirDialogo(tipo === 'lembrete' ? 'E-mail de lembrete' : 'E-mail de divulgação', el('div', null,
      el('p', { class: 'msg msg-info' }, 'Sai um e-mail para cada ente, com os endereços dele. Revise o texto antes de enviar.'),
      campo('fe-ass', 'Assunto', assunto), campo('fe-corpo', 'Texto', corpo),
      el('h3', null, 'Destinatários (' + marcas.filter((m) => m.d.emails.length).length + ' com e-mail)'),
      semEmail ? el('p', { class: 'msg msg-falta' }, semEmail + ' ente(s) sem e-mail no Cadastro: use o WhatsApp ou complete o cadastro.') : null,
      el('div', { class: 'lista-marcar' }, marcas.map((m) => el('label', { class: 'checkbox' }, m.cx, ' ', el('strong', null, m.o.nome), el('span', { class: 'sub-linha' }, m.d.emails.join(', ') || 'sem e-mail')))),
      progresso), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Fechar'), btn], true);
    btn.addEventListener('click', async () => {
      const sel_ = marcas.filter((m) => m.cx.checked);
      if (!sel_.length) { toast('Marque ao menos um ente.', true); return; }
      if (!(await confirmar('Enviar', 'Enviar ' + sel_.length + ' e-mail(s) agora?', 'Enviar'))) return;
      ocupado(btn, 'Enviando…'); let okN = 0; const erros = [];
      for (const m of sel_) {
        progresso.textContent = `Enviando ${okN + erros.length + 1} de ${sel_.length}: ${m.o.nome}…`;
        try {
          await D.enviarEmail({ para: m.d.emails[0], copia: m.d.emails.slice(1).join(', '), assunto: assunto.value, corpo: corpo.value, irp_id: i.id, orgao_id: m.o.id });
          await D.registrarEnvioIrp({ irp_id: i.id, orgao_id: m.o.id, canal: 'email', tipo, destino: m.d.emails.join(', ') }); okN++; m.cx.checked = false;
        } catch (e) { erros.push(m.o.nome + ': ' + e.message); }
      }
      progresso.textContent = okN + ' enviado(s)' + (erros.length ? '. Com erro: ' + erros.join(' · ') : '.');
      ocupado(btn); await recarregarIrp(); toast(okN + ' e-mail(s) enviado(s)' + (erros.length ? ', ' + erros.length + ' com erro.' : '.'), !!erros.length);
    });
  }
  function dialogoWhats(i, tipo) {
    const lista = alvos(i, tipo).map((o) => ({ o, d: destinos(o) }));
    const msg = area(textoAviso(i, tipo), { rows: 5 });
    const ja = new Set(B().envios.filter((x) => x.irp_id === i.id && x.canal === 'whatsapp' && x.tipo === tipo).map((x) => x.orgao_id + '|' + soNum(x.destino)));
    const corpo = el('div', { class: 'lista-whats' });
    const desenhar = () => rc(corpo, lista.map(({ o, d }) => el('div', { class: 'linha-whats' }, el('strong', null, o.nome),
      d.whats.length ? el('div', { class: 'botoes-linha' }, d.whats.map((w) => {
        const feito = ja.has(o.id + '|' + soNum(w.numero));
        const a = el('a', { class: 'btn btn-p ' + (feito ? 'btn-claro' : 'btn-whats'), href: window.CADASTRO.linkWhats(w.numero, msg.value), target: '_blank', rel: 'noopener' }, (feito ? '✓ ' : '') + formatarTelefone(w.numero) + ' · ' + w.quem);
        a.addEventListener('click', () => { a.href = window.CADASTRO.linkWhats(w.numero, msg.value); if (!feito) { ja.add(o.id + '|' + soNum(w.numero)); D.registrarEnvioIrp({ irp_id: i.id, orgao_id: o.id, canal: 'whatsapp', tipo, destino: w.numero }).then(recarregarIrp).catch(() => {}); setTimeout(desenhar, 300); } });
        return a;
      })) : el('span', { class: 'sub-linha' }, 'Sem WhatsApp no Cadastro.'))));
    desenhar();
    abrirDialogo(tipo === 'lembrete' ? 'Lembrete por WhatsApp' : 'Divulgação por WhatsApp', el('div', null,
      el('p', { class: 'msg msg-info' }, 'Cada botão abre a conversa no WhatsApp com a mensagem pronta; é só tocar em enviar. O sistema marca quem já recebeu.'),
      campo('fw-msg', 'Mensagem', msg), corpo), [], true);
  }

  // ---------- Manifestações: acompanhamento e análise
  function abaManifestacoes(i) {
    const entes = entesAcompanhados(i.id);
    const todas = respostasDe(i.id, true);
    const ativa = (oid) => respostasDe(i.id).filter((r) => r.orgao_id === oid && ['recebida', 'analisada', 'preenchida'].includes(r.situacao))
      .sort((a, b) => ({ recebida: 0, analisada: 0, preenchida: 1 }[a.situacao] - { recebida: 0, analisada: 0, preenchida: 1 }[b.situacao]) || String(b.criado_em).localeCompare(String(a.criado_em)))[0];
    const linhas = entes.map((o) => ({ o, r: ativa(o.id) }));
    const conta = (f) => linhas.filter(f).length;
    const fFiltro = sel([['', 'Todos'], ['falta', 'Faltam responder'], ['analisar', 'A analisar'], ['analisada', 'Analisadas'], ['preenchida', 'Preencheram sem anexar']], estado.filtroManif || '', { 'aria-label': 'Filtro' });
    fFiltro.addEventListener('change', () => { estado.filtroManif = fFiltro.value; N.rotear(); });
    const passa = ({ r }) => !fFiltro.value || (fFiltro.value === 'falta' ? !r || r.situacao === 'preenchida' : fFiltro.value === 'analisar' ? r && r.situacao === 'recebida' : r && r.situacao === fFiltro.value);
    const situacaoTxt = (r) => !r ? el('span', { class: 'etiqueta etiqueta-inativo' }, 'Falta responder')
      : r.situacao === 'preenchida' ? el('span', { class: 'etiqueta etiqueta-pendente' }, 'Preencheu, falta anexar o assinado')
      : r.situacao === 'recebida' ? el('span', { class: 'etiqueta etiqueta-pendente' }, 'Recebida · a analisar')
      : el('span', { class: 'etiqueta ' + (r.resultado === 'recusada' ? 'etiqueta-desativado' : 'etiqueta-ativo') }, RESULTADO[r.resultado] || 'Analisada');
    const verPdf = async (r) => { try { const u = await D.urlIrp(r.arquivo_assinado || r.documento_url); if (u) window.open(u, '_blank', 'noopener'); else toast('Arquivo indisponível na prévia.', true); } catch (e) { toast(e.message, true); } };
    return el('div', null,
      el('div', { class: 'indicadores' },
        el('div', { class: 'indicador', style: '--k:#0a8a62' }, el('strong', null, conta(({ r }) => r && ['recebida', 'analisada'].includes(r.situacao))), el('span', null, 'manifestações recebidas')),
        el('div', { class: 'indicador', style: '--k:#b26d06' }, el('strong', null, conta(({ r }) => r && r.situacao === 'recebida')), el('span', null, 'a analisar')),
        el('div', { class: 'indicador', style: '--k:#c2416b' }, el('strong', null, conta(({ r }) => !r || r.situacao === 'preenchida')), el('span', null, 'consorciados sem resposta')),
        el('div', { class: 'indicador', style: '--k:#4f6378' }, el('strong', null, conta(({ r }) => r && r.situacao === 'preenchida')), el('span', null, 'preencheram sem anexar'))),
      el('div', { class: 'filtros' }, campo('fm-filtro', 'Mostrar', fFiltro)),
      tabela(['Ente', 'Origem', 'Situação', 'Protocolo', 'Recebida em', ''], linhas.filter(passa).map(({ o, r }) => el('tr', null,
        el('td', null, el('strong', null, o.nome), el('span', { class: 'sub-linha' }, VINCULO[o.vinculo] || 'Vínculo a definir'), o.pendente ? el('span', { class: 'etiqueta etiqueta-pendente ml-1' }, 'Ente novo: confirmar no Cadastro') : null),
        el('td', null, r ? ORIGEM[r.origem] : '—'), el('td', null, situacaoTxt(r)), el('td', { class: 'num' }, r ? r.protocolo : '—'), el('td', null, r ? quando(r.recebida_em || r.criado_em) : '—'),
        el('td', { class: 'acoes' }, r ? [
          r.arquivo_assinado || r.documento_url ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => verPdf(r) }, 'Ver PDF') : null,
          ['recebida', 'analisada'].includes(r.situacao) && r.origem !== 'etp' ? el('button', { type: 'button', class: 'btn btn-' + (r.situacao === 'recebida' ? 'primario' : 'claro') + ' btn-p', onclick: () => dialogoAnalise(i, r) }, r.situacao === 'recebida' ? 'Analisar' : 'Ver análise') : null,
          r.situacao === 'analisada' && r.origem !== 'etp' && pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => comunicarResultado(i, r) }, r.comunicado_em ? '✓ Comunicado' : 'Comunicar resultado') : null] : null)))),
      todas.some((r) => r.situacao === 'substituida') ? el('p', { class: 'ajuda' }, todas.filter((r) => r.situacao === 'substituida').length + ' manifestação(ões) substituída(s) por envio mais novo do mesmo ente ficam no histórico.') : null);
  }
  function dialogoAnalise(i, r) {
    const ls = itensResp(r.id).map((x) => Object.assign({}, x, { item: B().itens.find((t) => t.id === x.item_id) })).sort((a, b) => ((a.item || {}).numero || 999) - ((b.item || {}).numero || 999));
    const editavel = pode() && !['consolidada', 'cancelada'].includes(i.situacao);
    const campos = ls.map((x) => {
      const dec = sel([['aceito', 'Aceitar'], ['ajustado', 'Ajustar'], ['recusado', 'Recusar']], x.decisao === 'pendente' ? (x.item ? 'aceito' : 'recusado') : x.decisao);
      const qtd = el('input', { type: 'number', min: 0, step: 'any', value: x.qtd_aceita != null ? Number(x.qtd_aceita) : Number(x.qtd_informada) });
      const mot = txt(x.motivo || '', { maxlength: 500, placeholder: 'Motivo (obrigatório para ajuste ou recusa)' });
      const ver = () => { qtd.disabled = dec.value !== 'ajustado' || !editavel; mot.disabled = dec.value === 'aceito' || !editavel; };
      dec.addEventListener('change', ver); if (!editavel) dec.disabled = true; ver();
      return { x, dec, qtd, mot };
    });
    const geral = area(r.motivo_geral || '', { rows: 2, maxlength: 1000, placeholder: 'Observação geral (opcional)' }); if (!editavel) geral.disabled = true;
    const o = orgao(r.orgao_id);
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar análise');
    const d = abrirDialogo('Análise · ' + o.nome, el('div', null,
      el('dl', { class: 'dados' }, el('dt', null, 'Protocolo'), el('dd', null, r.protocolo + ' · ' + ORIGEM[r.origem]),
        el('dt', null, 'Assinado por'), el('dd', null, [r.autoridade_nome, r.autoridade_cargo].filter(Boolean).join(' – ') || '—'),
        el('dt', null, 'Responsável'), el('dd', null, [r.responsavel_nome, r.responsavel_email, r.responsavel_telefone].filter(Boolean).join(' · ') || '—'),
        el('dt', null, 'Local de entrega'), el('dd', null, r.local_entrega || '—'), r.dfd_numero ? el('dt', null, 'DFD') : null, r.dfd_numero ? el('dd', null, r.dfd_numero) : null,
        r.justificativa ? el('dt', null, 'Motivação') : null, r.justificativa ? el('dd', null, r.justificativa) : null),
      el('p', { class: 'ajuda' }, 'Art. 4º, II e IV, da Resolução nº 018/2023: o CIMOP pode aceitar ou recusar quantitativos ínfimos, novos itens e itens com especificação modificada, e ajustar quantidades para padronizar e racionalizar. Ajuste e recusa exigem motivo.'),
      tabela(['Item', 'Informado', 'Decisão', 'Aceito', 'Motivo'], campos.map((k) => el('tr', null,
        el('td', null, k.x.item ? el('span', null, el('strong', null, k.x.item.numero + '. '), k.x.item.descricao.slice(0, 90) + (k.x.item.descricao.length > 90 ? '…' : '')) : el('span', null, el('strong', null, 'Novo item: '), k.x.novo_descricao, ' (' + (k.x.novo_unidade || '') + ')', el('span', { class: 'sub-linha' }, 'Justificativa: ' + (k.x.justificativa || '—')))),
        el('td', { class: 'num' }, num(k.x.qtd_informada)), el('td', null, k.dec), el('td', null, k.qtd), el('td', null, k.mot)))),
      campo('fa-geral', 'Observação geral', geral)),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Fechar'), editavel ? btn : null], true);
    btn.addEventListener('click', async () => {
      for (const k of campos) {
        if (k.dec.value === 'ajustado' && !(Number(k.qtd.value) > 0)) { marcarErro(k.qtd, 'Quantidade aceita.'); return; }
        if (k.dec.value !== 'aceito' && !k.mot.value.trim()) { marcarErro(k.mot, 'Informe o motivo.'); return; }
      }
      ocupado(btn, 'Salvando…');
      try { const res = await D.analisarRespostaIrp(r.id, campos.map((k) => ({ id: k.x.id, decisao: k.dec.value, qtd_aceita: Number(k.qtd.value), motivo: k.mot.value.trim() })), geral.value.trim());
        d.close(); await depois('Análise salva: ' + (RESULTADO[res] || res) + '.'); } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }
  function comunicarResultado(i, r) {
    const o = orgao(r.orgao_id), cf = C().config || {};
    const ls = itensResp(r.id).map((x) => Object.assign({}, x, { item: B().itens.find((t) => t.id === x.item_id) }));
    const linhas = ls.map((x) => `- ${x.item ? 'Item ' + x.item.numero : 'Novo item "' + x.novo_descricao + '"'}: informado ${num(x.qtd_informada)}; ${x.decisao === 'aceito' ? 'aceito integralmente' : x.decisao === 'ajustado' ? 'aceito ' + num(x.qtd_aceita) + ' (motivo: ' + x.motivo + ')' : 'recusado (motivo: ' + x.motivo + ')'}`).join('\n');
    const texto = `Prezados(as),

Informamos o resultado da análise da manifestação de ${o.nome} na Intenção de Registro de Preços nº ${nIrp(i)} (protocolo ${r.protocolo}): ${(RESULTADO[r.resultado] || '').toLowerCase()}.

${linhas}
${r.motivo_geral ? '\nObservação: ' + r.motivo_geral + '\n' : ''}
A análise segue o art. 4º, II e IV, da Resolução nº 018/2023 – CIMOP. As quantidades aceitas serão consolidadas para a futura licitação.

Atenciosamente,
${cf.sigla || 'CIMOP'}`;
    const d0 = destinos(o);
    const para = txt([r.responsavel_email, ...d0.emails].filter(Boolean).filter((v, k, a) => a.indexOf(v) === k).join(', '));
    const corpo = area(texto, { rows: 14 });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar e-mail');
    const whats = [r.responsavel_telefone, ...d0.whats.map((w) => w.numero)].filter((n) => soNum(n).length >= 10).filter((v, k, a) => a.findIndex((z) => soNum(z) === soNum(v)) === k);
    const d = abrirDialogo('Comunicar resultado · ' + o.nome, el('div', null, campo('fr-para', 'Para (e-mails separados por vírgula)', para), campo('fr-corpo', 'Texto', corpo),
      whats.length ? el('div', { class: 'botoes-linha' }, el('span', { class: 'ajuda' }, 'Ou pelo WhatsApp:'), whats.map((n) => el('a', { class: 'btn btn-claro btn-p', href: window.CADASTRO.linkWhats(n, corpo.value), target: '_blank', rel: 'noopener',
        onclick: (ev) => { ev.currentTarget.href = window.CADASTRO.linkWhats(n, corpo.value); D.registrarEnvioIrp({ irp_id: i.id, orgao_id: o.id, canal: 'whatsapp', tipo: 'resultado', destino: n }).then(() => D.salvar('irp_respostas', { id: r.id, comunicado_em: new Date().toISOString() })).then(recarregarIrp).catch(() => {}); } }, formatarTelefone(n)))) : null),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Fechar'), btn], true);
    btn.addEventListener('click', async () => {
      const ems = para.value.split(/[,;\s]+/).filter(Boolean);
      if (!ems.length) { marcarErro(para, 'Informe o e-mail.'); return; }
      ocupado(btn, 'Enviando…');
      try { await D.enviarEmail({ para: ems[0], copia: ems.slice(1).join(', '), assunto: `Resultado da análise – IRP nº ${nIrp(i)} – ${o.nome}`, corpo: corpo.value, irp_id: i.id, orgao_id: o.id });
        await D.registrarEnvioIrp({ irp_id: i.id, orgao_id: o.id, canal: 'email', tipo: 'resultado', destino: ems.join(', ') }); await D.salvar('irp_respostas', { id: r.id, comunicado_em: new Date().toISOString() });
        d.close(); await depois('Resultado enviado.'); } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ---------- Demandas do ETP (art. 8º, § 3º)
  function abaEtp(i) {
    const its = itensDe(i.id);
    const etps = respostasDe(i.id).filter((r) => r.origem === 'etp');
    const editavel = pode() && !['consolidada', 'cancelada', 'rascunho'].includes(i.situacao);
    const lancar = (o0) => {
      const cons = C().orgaos.filter((o) => o.vinculo === 'consorciado' && o.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
      const fo = sel([['', 'Escolha o ente consorciado…'], ...cons.map((o) => [o.id, o.nome])], o0 || '');
      if (o0) fo.disabled = true;
      const atual = o0 ? etps.find((r) => r.orgao_id === o0) : null;
      const qs = its.map((t) => ({ t, q: el('input', { type: 'number', min: 0, step: 'any', value: atual ? Number((itensResp(atual.id).find((x) => x.item_id === t.id) || {}).qtd_informada || 0) || '' : '', 'aria-label': 'Quantidade do item ' + t.numero }) }));
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
      const d = abrirDialogo(o0 ? 'Demanda do ETP · ' + orgao(o0).nome : 'Lançar demanda do ETP', el('div', null,
        el('p', { class: 'ajuda' }, 'Quantidades que já estão no Estudo Técnico Preliminar para este consorciado. Entram como aceitas, com a origem "ETP". Se o ente responder pelo formulário, a resposta dele substitui estas quantidades.'),
        cons.length ? campo('fe-org', 'Ente consorciado', fo, null, true) : el('p', { class: 'msg msg-falta' }, 'Nenhum ente marcado como consorciado no Cadastro.'),
        tabela(['Item', 'Descrição', 'Unidade', 'Quantidade no ETP'], qs.map(({ t, q }) => el('tr', null, el('td', { class: 'num' }, t.numero), el('td', null, t.descricao.slice(0, 100)), el('td', null, t.unidade), el('td', null, q))))),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
      btn.addEventListener('click', async () => {
        if (!marcarErro(fo, fo.value ? '' : 'Escolha o ente.')) return;
        ocupado(btn, 'Salvando…');
        try { await D.lancarEtpIrp(i.id, fo.value, qs.map(({ t, q }) => ({ item_id: t.id, qtd: Number(q.value) || 0 }))); d.close(); await depois('Demanda do ETP salva.'); } catch (e) { toast(e.message, true); ocupado(btn); }
      });
    };
    return el('div', null,
      el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, 'Art. 8º, § 3º, da Resolução nº 018/2023 (redação da nº 001/2026): o consorciado cuja demanda está no ETP participa da Ata sem se manifestar na IRP.'),
        editavel ? el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => lancar() }, '+ Lançar demanda do ETP') : null),
      i.situacao === 'rascunho' ? el('p', { class: 'msg msg-info' }, 'Disponível depois que a IRP for aberta.') : null,
      etps.length ? tabela(['Ente', ...its.map((t) => 'Item ' + t.numero), ''], etps.map((r) => el('tr', null, el('td', null, el('strong', null, orgao(r.orgao_id).nome)),
        its.map((t) => el('td', { class: 'num' }, num((itensResp(r.id).find((x) => x.item_id === t.id) || {}).qtd_informada || 0))),
        el('td', { class: 'acoes' }, editavel ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => lancar(r.orgao_id) }, 'Editar') : null))))
        : el('p', { class: 'vazio' }, 'Nenhuma demanda do ETP lançada.'));
  }

  // ---------- Inclusão posterior (art. 8º, §§ 4º a 7º)
  function abaInclusao(i) {
    const its = itensDe(i.id);
    const incl = respostasDe(i.id).filter((r) => r.origem === 'inclusao_posterior');
    const fechadaEdital = i.edital_licitacao_em && i.edital_licitacao_em <= hoje();
    const podeRegistrar = pode() && ['encerrada', 'aberta'].includes(i.situacao) && !aberta(i) && !fechadaEdital;
    const registrar = () => {
      const fo = sel([['', 'Escolha o órgão ou entidade…'], ...C().orgaos.filter((o) => o.ativo !== false).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map((o) => [o.id, o.nome])], '');
      const qs = its.map((t) => ({ t, q: el('input', { type: 'number', min: 0, step: 'any', 'aria-label': 'Quantidade do item ' + t.numero }) }));
      const f = { local: area('', { rows: 2 }), just: area('', { rows: 3 }), aut: txt('', { maxlength: 120 }), cargo: txt('', { maxlength: 120 }), dfd: txt('', { maxlength: 60 }),
        data: el('input', { type: 'date', value: hoje() }), doc: el('input', { type: 'file', accept: 'application/pdf' }), decl: el('input', { type: 'checkbox' }) };
      const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Registrar pedido');
      const d = abrirDialogo('Pedido de inclusão posterior', el('div', null,
        el('p', { class: 'ajuda' }, 'Expediente formal recebido depois do prazo. Deve conter itens, quantidades, locais de entrega e a declaração de concordância (art. 8º, § 5º). Depois de registrado, é analisado como as demais manifestações.'),
        campo('fp-org', 'Órgão ou entidade', fo, 'Se não estiver na lista, inclua antes no Cadastro de Consorciados.', true),
        tabela(['Item', 'Descrição', 'Unidade', 'Quantidade'], qs.map(({ t, q }) => el('tr', null, el('td', { class: 'num' }, t.numero), el('td', null, t.descricao.slice(0, 100)), el('td', null, t.unidade), el('td', null, q)))),
        campo('fp-local', 'Local(is) de entrega ou execução', f.local, null, true), campo('fp-just', 'Motivação do pedido', f.just, null, true),
        el('div', { class: 'grade-campos' }, campo('fp-aut', 'Quem assinou o expediente', f.aut), campo('fp-cargo', 'Cargo', f.cargo), campo('fp-dfd', 'DFD nº', f.dfd)),
        el('div', { class: 'grade-campos' }, campo('fp-data', 'Recebido em', f.data), campo('fp-doc', 'Expediente (PDF)', f.doc, 'Até 20 MB.')),
        el('label', { class: 'checkbox' }, f.decl, ' O expediente declara concordância com as especificações técnicas e as condições do procedimento')),
      [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
      btn.addEventListener('click', async () => {
        if (!marcarErro(fo, fo.value ? '' : 'Escolha o órgão.')) return;
        if (!qs.some(({ q }) => Number(q.value) > 0)) { toast('Informe a quantidade de ao menos um item.', true); return; }
        if (!marcarErro(f.local, f.local.value.trim() ? '' : 'Informe o local.')) return;
        if (!marcarErro(f.just, f.just.value.trim() ? '' : 'Informe a motivação.')) return;
        if (!f.decl.checked) { toast('Sem a declaração de concordância, o pedido não pode ser admitido (art. 8º, § 5º, IV).', true); return; }
        const a = f.doc.files[0]; if (a && (a.type !== 'application/pdf' || a.size > 20971520)) { toast('O expediente deve ser PDF de até 20 MB.', true); return; }
        ocupado(btn, 'Registrando…');
        try { const caminho = a ? await D.enviarExpedienteIrp(a, i.id) : null;
          await D.inclusaoPosteriorIrp(i.id, { orgao_id: fo.value, itens: qs.map(({ t, q }) => ({ item_id: t.id, qtd: Number(q.value) || 0 })), local_entrega: f.local.value.trim(), justificativa: f.just.value.trim(),
            autoridade_nome: f.aut.value.trim(), autoridade_cargo: f.cargo.value.trim(), dfd_numero: f.dfd.value.trim(), recebida_em: f.data.value ? f.data.value + 'T12:00:00-03:00' : null, documento_url: caminho, declaracao: true });
          d.close(); estado.abaIrp = 'manifestacoes'; await depois('Pedido registrado. Analise na aba Manifestações.'); } catch (e) { toast(e.message, true); ocupado(btn); }
      });
    };
    return el('div', null,
      el('p', { class: 'ajuda' }, 'Art. 8º, §§ 4º a 7º: quem não se manifestou no prazo pode pedir inclusão, de forma motivada, até a publicação do edital da licitação. O CIMOP admite só se não prejudicar o planejamento e a consolidação.'),
      fechadaEdital ? el('p', { class: 'msg msg-falta' }, 'O edital da licitação foi publicado em ' + dataBR(i.edital_licitacao_em) + ': não se admite mais inclusão posterior (art. 8º, § 7º).')
        : aberta(i) ? el('p', { class: 'msg msg-info' }, 'A IRP ainda está no prazo: os entes usam o formulário.')
        : i.situacao === 'consolidada' ? el('p', { class: 'msg msg-info' }, 'A IRP já foi consolidada. Para admitir uma inclusão, a consolidação precisaria ser refeita.') : null,
      podeRegistrar ? el('button', { type: 'button', class: 'btn btn-primario', onclick: registrar }, '+ Registrar pedido de inclusão') : null,
      incl.length ? tabela(['Ente', 'Protocolo', 'Recebido em', 'Situação'], incl.map((r) => el('tr', null, el('td', null, orgao(r.orgao_id).nome), el('td', { class: 'num' }, r.protocolo), el('td', null, quando(r.recebida_em)),
        el('td', null, r.situacao === 'analisada' ? RESULTADO[r.resultado] : 'A analisar')))) : el('p', { class: 'vazio' }, 'Nenhum pedido de inclusão posterior.'));
  }

  // ---------- Mapa, consolidação, prorrogação e envio à Ata
  function abaConsolidacao(i) {
    const its = itensDe(i.id);
    const resps = respostasCompletas(i.id);
    const aceitas = resps.filter((r) => r.situacao === 'analisada' && r.resultado !== 'recusada');
    const orgs = [...new Map(resps.map((r) => [r.orgao_id, r.orgao])).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const val = (o, t) => resps.filter((r) => r.orgao_id === o.id).flatMap((r) => r.itens.filter((x) => x.item_id === t.id).map((x) => ({ r, x })));
    const celula = (o, t) => { const ls = val(o, t); if (!ls.length) return el('td', { class: 'num vazio-celula' }, '—');
      const pendente = ls.some(({ r }) => r.situacao === 'recebida');
      const v = ls.reduce((s, { r, x }) => s + Number(r.situacao === 'analisada' ? x.qtd_aceita || 0 : x.qtd_informada || 0), 0);
      return el('td', { class: 'num' + (pendente ? ' celula-pendente' : '') , title: pendente ? 'Informado, ainda sem análise' : 'Aceito' }, num(v)); };
    const totalItem = (t) => aceitas.flatMap((r) => r.itens.filter((x) => x.item_id === t.id)).reduce((s, x) => s + Number(x.qtd_aceita || 0), 0);
    const pend = resps.filter((r) => r.situacao === 'recebida').length;
    const ctx = () => ({ irp: i, itens: its, respostas: resps, prorrogacoes: B().prorrogacoes.filter((p) => p.irp_id === i.id),
      semResposta: entesAcompanhados(i.id).filter((o) => o.vinculo === 'consorciado' && !resps.some((r) => r.orgao_id === o.id)), signatario: pessoa(i.signatario_id) || { nome: '', cargo: '' }, cimop: C().config || {} });
    const bPdf = el('button', { type: 'button', class: 'btn btn-claro' }, 'Relatório de consolidação (PDF)');
    bPdf.addEventListener('click', async () => { ocupado(bPdf, 'Gerando…'); try { await baixar(`IRP ${nIrp(i).replace('/', '-')} - Relatório de consolidação.pdf`, await DOC.gerarConsolidacao(ctx())); } catch (e) { toast(e.message, true); } finally { ocupado(bPdf); } });
    const bXls = el('button', { type: 'button', class: 'btn btn-claro' }, 'Mapa consolidado (Excel)');
    bXls.addEventListener('click', async () => { try { await baixar(`IRP ${nIrp(i).replace('/', '-')} - Mapa consolidado.xlsx`, DOC.mapaExcel(ctx())); } catch (e) { toast(e.message, true); } });
    const prorrogar = () => {
      const f = { prazo: el('input', { type: 'date', min: i.prazo_fim }), mot: area('', { rows: 3 }) };
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Prorrogar');
      const d = abrirDialogo('Prorrogar o prazo', el('div', null, el('p', null, 'Prazo atual: até ' + dataBR(i.prazo_fim) + '. A prorrogação fica registrada com a justificativa e deve ser divulgada pelos mesmos meios (item 3.2 do edital).'),
        campo('fp-prazo', 'Novo prazo', f.prazo, null, true), campo('fp-mot', 'Justificativa', f.mot, null, true)), [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), b]);
      b.addEventListener('click', async () => {
        if (!marcarErro(f.prazo, f.prazo.value && f.prazo.value > i.prazo_fim && f.prazo.value >= hoje() ? '' : 'Informe uma data depois do prazo atual e de hoje.')) return;
        if (!marcarErro(f.mot, f.mot.value.trim() ? '' : 'Informe a justificativa.')) return;
        ocupado(b, 'Prorrogando…'); try { await D.prorrogarIrp(i.id, f.prazo.value, f.mot.value.trim()); d.close(); await depois('Prazo prorrogado para ' + dataBR(f.prazo.value) + '.'); } catch (e) { toast(e.message, true); ocupado(b); }
      });
    };
    const consolidar = async () => {
      if (!(await confirmar('Consolidar a IRP', `Consolidar a IRP ${nIrp(i)}? As quantidades aceitas passam a ser a estimativa da licitação. Depois de consolidada, não se analisam nem se recebem novas manifestações.`, 'Consolidar'))) return;
      try { await D.consolidarIrp(i.id); await depois('IRP consolidada. Gere o relatório para o processo.'); } catch (e) { toast(e.message, true); }
    };
    return el('div', null,
      pend ? el('p', { class: 'msg msg-falta' }, pend + ' manifestação(ões) recebida(s) ainda sem análise (valores em âmbar no mapa).') : null,
      el('div', { class: 'botoes-linha mb-1' }, bXls, bPdf,
        pode() && ['aberta', 'encerrada'].includes(i.situacao) ? el('button', { type: 'button', class: 'btn btn-claro', onclick: prorrogar }, 'Prorrogar o prazo') : null,
        pode() && i.situacao !== 'consolidada' && ['aberta', 'encerrada'].includes(i.situacao) && !aberta(i) ? el('button', { type: 'button', class: 'btn btn-primario', onclick: consolidar }, 'Consolidar a IRP') : null),
      aberta(i) ? el('p', { class: 'ajuda' }, 'A consolidação fica disponível quando o prazo terminar (' + dataBR(i.prazo_fim) + '). O sistema encerra o prazo sozinho.') : null,
      el('h3', null, 'Mapa consolidado (quantidades aceitas)'),
      orgs.length ? el('div', { class: 'tabela-caixa tabela-rolagem' }, el('table', { class: 'tabela tabela-mapa' },
        el('thead', null, el('tr', null, el('th', { scope: 'col' }, 'Órgão ou entidade'), its.map((t) => el('th', { scope: 'col', class: 'num', title: t.descricao }, 'Item ' + t.numero)))),
        el('tbody', null, orgs.map((o) => el('tr', null, el('th', { scope: 'row' }, o.nome), its.map((t) => celula(o, t))))),
        el('tfoot', null, el('tr', null, el('th', { scope: 'row' }, 'TOTAL ACEITO'), its.map((t) => el('td', { class: 'num' }, el('strong', null, num(totalItem(t))))))))) : el('p', { class: 'vazio' }, 'Nenhuma manifestação recebida ainda.'),
      i.situacao === 'consolidada' ? secaoAta(i, its) : null);
  }
  function secaoAta(i, its) {
    const atas = (B().atas || []).filter((a) => a.ativo !== false);
    const chave = soNum(i.processo);
    const sugerida = atas.find((a) => soNum(a.processo) === chave);
    const fa = sel([['', 'Escolha a Ata…'], ...atas.map((a) => [a.id, 'ARP ' + a.numero + ' · ' + (a.detentora || '') + (a.processo ? ' · Proc. ' + a.processo : '') + (soNum(a.processo) === chave ? ' (mesmo processo)' : '')])], i.ata_id || (sugerida ? sugerida.id : ''));
    const mapa = el('div');
    const desenhar = () => {
      const ai = (B().ataItens || []).filter((t) => t.ata_id === fa.value).sort((a, b) => Number(a.numero) - Number(b.numero));
      if (!fa.value) { rc(mapa); return; }
      const sels = its.map((t) => ({ t, s: sel([['', 'Não levar'], ...ai.map((x) => [x.id, 'Item ' + x.numero + ' · ' + String(x.descricao || '').slice(0, 60)])], (ai.find((x) => Number(x.numero) === t.numero) || {}).id || '') }));
      const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Levar participantes para a Ata');
      b.addEventListener('click', async () => {
        const m = {}; sels.forEach(({ t, s }) => { if (s.value) m[t.id] = s.value; });
        if (!Object.keys(m).length) { toast('Ligue ao menos um item.', true); return; }
        if (!(await confirmar('Levar para a Ata', 'Os órgãos e as quantidades aceitas entram na Ata como participantes (não contam como adesão). Se já tinham sido levados, são substituídos. Continuar?', 'Levar'))) return;
        ocupado(b, 'Enviando…'); try { const n = await D.levarIrpParaAta(i.id, fa.value, m); await depois(n + ' participação(ões) registrada(s) na Ata.'); } catch (e) { toast(e.message, true); ocupado(b); }
      });
      rc(mapa, ai.length ? tabela(['Item da IRP', 'Item da Ata'], sels.map(({ t, s }) => el('tr', null, el('td', null, t.numero + '. ' + t.descricao.slice(0, 80)), el('td', null, s)))) : el('p', { class: 'msg msg-falta' }, 'A Ata escolhida não tem itens cadastrados.'),
        ai.length && pode() ? b : null);
    };
    fa.addEventListener('change', desenhar); desenhar();
    const ja = (B().participantes || []).filter((p) => p.irp_id === i.id);
    return el('section', { class: 'cartao mt-2' }, el('h3', null, 'Participantes na Ata (Controle de Adesões)'),
      el('p', { class: 'ajuda' }, 'O número do processo liga a IRP à Ata. Os órgãos com quantidade aceita entram como participantes da Ata, separados das adesões.'),
      ja.length ? el('p', { class: 'msg msg-ok' }, ja.length + ' participação(ões) já registrada(s) na Ata.') : null,
      atas.length ? campo('fa-ata', 'Ata de Registro de Preços', fa, sugerida ? 'Sugerida pelo número do processo.' : 'Nenhuma Ata com o mesmo processo; escolha manualmente quando a Ata for cadastrada.') : el('p', { class: 'vazio' }, 'Nenhuma Ata cadastrada no Controle de Adesões.'),
      mapa);
  }

  // ================================================================ PENDÊNCIAS NA TELA PRINCIPAL
  N.PENDENCIAS.irp = () => {
    if (!estado.irp) return null;
    const ab = estado.irp.irps.filter((i) => situacaoEfetiva(i) === 'aberta');
    const pend = estado.irp.respostas.filter((r) => r.situacao === 'recebida').length;
    const enc = estado.irp.irps.filter((i) => situacaoEfetiva(i) === 'encerrada').length;
    return { resumo: ab.length + (ab.length === 1 ? ' IRP aberta' : ' IRPs abertas'),
      itens: [pend ? [pend, pend === 1 ? 'manifestação a analisar' : 'manifestações a analisar', '#irps'] : null, enc ? [enc, enc === 1 ? 'IRP com prazo encerrado a consolidar' : 'IRPs com prazo encerrado a consolidar', '#irps'] : null].filter(Boolean) };
  };

  // ================================================================ FORMULÁRIO PÚBLICO (#manifestar-<id>)
  const pub = { cnpj: '', ente: null, novo: {}, irp: null };
  async function telaPublica(c) {
    const id = (location.hash.match(/^#manifestar-(.+)$/) || [])[1];
    rc(c, el('p', { class: 'ajuda' }, 'Carregando…'));
    let irp;
    try { irp = await D.publicoIrp(id); } catch (e) { rc(c, el('p', { class: 'msg msg-erro' }, 'Não foi possível carregar: ' + e.message)); return; }
    if (!irp) { rc(c, el('div', { class: 'intro-publica' }, el('h1', null, 'IRP não encontrada'), el('p', null, 'Confira o endereço recebido do CIMOP.'))); return; }
    pub.irp = irp;
    const cab = el('div', { class: 'intro-publica' }, el('h1', null, 'Intenção de Registro de Preços nº ' + irp.numero),
      el('p', null, el('strong', null, (irp.cimop && irp.cimop.sigla) || 'CIMOP'), ' · Processo ' + irp.processo), el('p', { class: 'objeto-irp' }, irp.objeto),
      irp.aberta ? el('p', { class: 'msg msg-info' }, 'Manifestações até as 23h59 de ' + dataBR(irp.prazo_fim) + '. Preencha, baixe o formulário em PDF, assine e anexe aqui. A manifestação só vale com o formulário assinado anexado.')
        : el('p', { class: 'msg msg-falta' }, 'O prazo desta IRP terminou em ' + dataBR(irp.prazo_fim) + '. Para pedir inclusão posterior, envie expediente formal ao CIMOP' + (irp.cimop && irp.cimop.email ? ' (' + irp.cimop.email + ')' : '') + '. Você ainda pode consultar uma manifestação já enviada.'));
    const fCnpj = txt(pub.cnpj ? O.formatarCnpj(pub.cnpj) : '', { inputmode: 'numeric', maxlength: 18, placeholder: '00.000.000/0000-00', autocomplete: 'off' });
    fCnpj.addEventListener('input', () => { const n = soNum(fCnpj.value).slice(0, 14); fCnpj.value = n.length === 14 ? O.formatarCnpj(n) : n; });
    const corpo = el('div');
    const bCnpj = el('button', { type: 'button', class: 'btn btn-primario' }, 'Continuar');
    const buscar = async () => {
      const n = soNum(fCnpj.value);
      if (!marcarErro(fCnpj, cnpjValido(n) ? '' : 'CNPJ inválido.')) return;
      ocupado(bCnpj, 'Buscando…');
      try { const r = await D.publicoIrpEnte(irp.id, n); pub.cnpj = n; pub.ente = r; desenharFormulario(corpo, irp, r); } catch (e) { toast(e.message, true); } finally { ocupado(bCnpj); }
    };
    bCnpj.addEventListener('click', buscar); fCnpj.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); buscar(); } });
    rc(c, cab, el('section', { class: 'cartao' }, el('h2', null, '1. Órgão ou entidade'), el('div', { class: 'linha-cnpj' }, campo('pm-cnpj', 'CNPJ do órgão ou entidade', fCnpj, null, true), bCnpj)), corpo);
    if (pub.cnpj && pub.ente) desenharFormulario(corpo, irp, pub.ente);
  }

  function desenharFormulario(corpo, irp, r) {
    const o = r.orgao, resp = r.resposta;
    const etp = r.etp || {};
    // Dados do ente: do Cadastro (só completa o que falta) ou ente novo
    const nv = pub.novo;
    const fe = o ? { endereco: txt(o.endereco || '', { maxlength: 200 }), cep: txt(o.cep || '', { maxlength: 9, inputmode: 'numeric' }), telefone: mascaraTelefone(txt(o.telefone || '', { maxlength: 15, inputmode: 'tel' })), email: txt(o.email || '', { type: 'email', maxlength: 120 }) }
      : { nome: txt(nv.nome || '', { maxlength: 160, placeholder: 'Município de …/UF' }), municipio: txt(nv.municipio || '', { maxlength: 80 }), uf: sel([['', 'UF'], ...UFS.map((u) => [u, u])], nv.uf || ''),
        esfera: sel(['Municipal', 'Estadual', 'Consórcio', 'Outro'].map((e) => [e, e]), nv.esfera || 'Municipal'), endereco: txt(nv.endereco || '', { maxlength: 200 }), cep: txt(nv.cep || '', { maxlength: 9, inputmode: 'numeric' }),
        telefone: mascaraTelefone(txt(nv.telefone || '', { maxlength: 15, inputmode: 'tel' })), email: txt(nv.email || '', { type: 'email', maxlength: 120 }) };
    if (o) { ['endereco', 'cep', 'telefone', 'email'].forEach((k) => { if (o[k]) fe[k].disabled = true; }); }
    else Object.entries(fe).forEach(([k, x]) => x.addEventListener('input', () => { nv[k] = x.value; }));
    const avisoRf = el('div');
    if (!o) {
      consultarReceita(pub.cnpj).then((rf) => {
        if (!rf) return; for (const k of ['nome', 'municipio', 'uf', 'esfera', 'email', 'telefone', 'endereco', 'cep']) if (rf[k] && fe[k] && !fe[k].value) { fe[k].value = rf[k]; nv[k] = rf[k]; }
        rc(avisoRf, el('p', { class: 'msg msg-ok' }, 'Dados preenchidos pela Receita Federal. Confira.'));
      }).catch(() => {});
    }
    const blocoEnte = o ? el('div', null,
      el('dl', { class: 'dados' }, el('dt', null, 'Órgão/Entidade'), el('dd', null, el('strong', null, o.nome)), el('dt', null, 'CNPJ'), el('dd', null, O.formatarCnpj(o.cnpj)),
        el('dt', null, 'Situação em relação ao CIMOP'), el('dd', null, VINCULO[o.vinculo] || 'A confirmar pelo CIMOP'), el('dt', null, 'Município/UF'), el('dd', null, [o.municipio, o.uf].filter(Boolean).join('/') || '—')),
      el('p', { class: 'ajuda' }, 'Dados do cadastro do CIMOP. Os campos em branco abaixo podem ser completados; para corrigir os demais, fale com o CIMOP.'),
      el('div', { class: 'grade-campos' }, campo('pm-end', 'Endereço', fe.endereco), campo('pm-cep', 'CEP', fe.cep)),
      el('div', { class: 'grade-campos' }, campo('pm-tel', 'Telefone', fe.telefone), campo('pm-email', 'E-mail institucional', fe.email)))
      : el('div', null, el('p', { class: 'msg msg-info' }, 'Este CNPJ ainda não está no cadastro do CIMOP. Preencha os dados: o cadastro será conferido pelo CIMOP.'), avisoRf,
        campo('pm-nome', 'Nome do órgão ou entidade', fe.nome, 'Como deve sair no formulário.', true),
        el('div', { class: 'grade-campos' }, campo('pm-mun', 'Município', fe.municipio), campo('pm-uf', 'UF', fe.uf, null, true), campo('pm-esf', 'Esfera', fe.esfera)),
        el('div', { class: 'grade-campos' }, campo('pm-end', 'Endereço', fe.endereco), campo('pm-cep', 'CEP', fe.cep)),
        el('div', { class: 'grade-campos' }, campo('pm-tel', 'Telefone', fe.telefone), campo('pm-email', 'E-mail institucional', fe.email)));

    const estadoResp = resp ? el('div', { class: 'msg ' + (resp.situacao === 'preenchida' ? 'msg-falta' : 'msg-ok') },
      resp.situacao === 'preenchida' ? el('span', null, el('strong', null, 'Formulário já preenchido (protocolo ' + resp.protocolo + '), mas o assinado ainda não foi anexado. '), 'Confira abaixo, gere o PDF de novo se mudar algo, e anexe o assinado no passo 4.')
        : el('span', null, el('strong', null, 'Manifestação recebida em ' + quando(resp.recebida_em) + ' (protocolo ' + resp.protocolo + '). '), resp.situacao === 'analisada' ? 'Já foi analisada pelo CIMOP. ' : 'Aguardando análise do CIMOP. ',
          irp.aberta ? 'Se enviar outra, ela substitui esta.' : ''),
      resp.situacao === 'analisada' ? el('button', { type: 'button', class: 'link', onclick: () => verResultado(resp.protocolo) }, ' Ver o resultado') : null) : null;

    if (!irp.aberta) { rc(corpo, el('section', { class: 'cartao' }, blocoEnte), estadoResp || el('p', { class: 'vazio' }, 'Nenhuma manifestação deste CNPJ nesta IRP.')); return; }

    // Itens
    const anterior = Object.fromEntries(((resp && resp.itens) || []).filter((x) => x.item_id).map((x) => [x.item_id, x.qtd]));
    const qs = irp.itens.map((t) => ({ t, q: el('input', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', value: anterior[t.id] != null ? Number(anterior[t.id]) : etp[t.id] != null ? Number(etp[t.id]) : '', 'aria-label': 'Quantidade do item ' + t.numero }) }));
    const novos = ((resp && resp.itens) || []).filter((x) => !x.item_id).map((x) => ({ descricao: x.novo_descricao, unidade: x.novo_unidade, qtd: x.qtd, justificativa: x.justificativa }));
    const caixaNovos = el('div');
    const desenharNovos = () => rc(caixaNovos, novos.map((n, k) => {
      const f = { d: txt(n.descricao || '', { maxlength: 500, placeholder: 'Descrição do item' }), u: txt(n.unidade || 'Unidade', { maxlength: 40 }), q: el('input', { type: 'number', min: 0, step: 'any', value: n.qtd || '' }), j: txt(n.justificativa || '', { maxlength: 1000, placeholder: 'Justificativa' }) };
      f.d.addEventListener('input', () => { n.descricao = f.d.value; }); f.u.addEventListener('input', () => { n.unidade = f.u.value; }); f.q.addEventListener('input', () => { n.qtd = f.q.value; }); f.j.addEventListener('input', () => { n.justificativa = f.j.value; });
      return el('div', { class: 'novo-item' }, campo('pn-d' + k, 'Item pedido', f.d), el('div', { class: 'grade-campos' }, campo('pn-u' + k, 'Unidade', f.u), campo('pn-q' + k, 'Quantidade', f.q)), campo('pn-j' + k, 'Justificativa', f.j),
        el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => { novos.splice(k, 1); desenharNovos(); } }, 'Tirar este item'));
    }), el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => { novos.push({ unidade: 'Unidade' }); desenharNovos(); } }, '+ Pedir inclusão de item novo'));
    desenharNovos();

    const f = { local: area((resp && resp.local_entrega) || [o && o.endereco, o && [o.municipio, o.uf].filter(Boolean).join('/')].filter(Boolean).join(', '), { rows: 2, maxlength: 1000 }),
      dfd: txt((resp && resp.dfd_numero) || '', { maxlength: 60, placeholder: 'Ex.: 012/2026' }),
      rnome: txt((resp && resp.responsavel_nome) || '', { maxlength: 120 }), rcargo: txt((resp && resp.responsavel_cargo) || '', { maxlength: 120 }),
      rtel: mascaraTelefone(txt((resp && resp.responsavel_telefone) || '', { maxlength: 15, inputmode: 'tel' })), remail: txt((resp && resp.responsavel_email) || '', { type: 'email', maxlength: 120 }),
      anome: txt((resp && resp.autoridade_nome) || (o && o.gestor_nome) || '', { maxlength: 120 }), acargo: txt((resp && resp.autoridade_cargo) || (o && o.gestor_cargo) || '', { maxlength: 120, placeholder: 'Prefeito Municipal' }) };
    const passo4 = el('div');
    const bGerar = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar e baixar o formulário em PDF');
    bGerar.addEventListener('click', async () => {
      const itens = qs.filter(({ q }) => Number(q.value) > 0).map(({ t, q }) => ({ item_id: t.id, qtd: Number(q.value) }));
      const nvs = novos.filter((n) => String(n.descricao || '').trim() && Number(n.qtd) > 0);
      if (!itens.length && !nvs.length) { toast('Informe a quantidade de ao menos um item.', true); qs[0] && qs[0].q.focus(); return; }
      if (nvs.some((n) => !String(n.justificativa || '').trim())) { toast('Justifique os itens novos pedidos.', true); return; }
      if (!o) {
        if (!marcarErro(fe.nome, fe.nome.value.trim() ? '' : 'Informe o nome.')) return;
        if (!marcarErro(fe.uf, fe.uf.value ? '' : 'Informe a UF.')) return;
      }
      if (!marcarErro(fe.email, !fe.email.value.trim() || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fe.email.value.trim()) ? '' : 'E-mail inválido.')) return;
      if (!marcarErro(f.local, f.local.value.trim() ? '' : 'Informe o local de entrega ou de execução.')) return;
      if (!marcarErro(f.rnome, f.rnome.value.trim() ? '' : 'Informe o responsável.')) return;
      if (!marcarErro(f.remail, /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.remail.value.trim()) ? '' : 'Informe um e-mail válido.')) return;
      if (!marcarErro(f.rtel, telefoneValido(f.rtel.value) ? '' : 'Telefone incompleto.')) return;
      if (!marcarErro(f.anome, f.anome.value.trim() ? '' : 'Informe quem assina.')) return;
      if (!marcarErro(f.acargo, f.acargo.value.trim() ? '' : 'Informe o cargo.')) return;
      ocupado(bGerar, 'Salvando…');
      try {
        const dados = { cnpj: pub.cnpj, nome: o ? null : fe.nome.value.trim(), municipio: o ? null : fe.municipio.value.trim(), uf: o ? null : fe.uf.value, esfera: o ? null : fe.esfera.value,
          endereco: fe.endereco.value.trim(), cep: fe.cep.value, telefone: fe.telefone.value, email: fe.email.value.trim(),
          local_entrega: f.local.value.trim(), dfd_numero: f.dfd.value.trim(), responsavel_nome: f.rnome.value.trim(), responsavel_cargo: f.rcargo.value.trim(), responsavel_telefone: f.rtel.value,
          responsavel_email: f.remail.value.trim(), autoridade_nome: f.anome.value.trim(), autoridade_cargo: f.acargo.value.trim(), itens, novos: nvs };
        const res = await D.publicoIrpSalvar(irp.id, dados);
        ocupado(bGerar, 'Gerando o PDF…');
        const ente = o ? Object.assign({}, o, { endereco: o.endereco || dados.endereco, cep: o.cep || dados.cep, telefone: o.telefone || dados.telefone, email: o.email || dados.email })
          : { nome: dados.nome, cnpj: pub.cnpj, municipio: dados.municipio, uf: dados.uf, endereco: dados.endereco, cep: dados.cep, telefone: dados.telefone, email: dados.email, vinculo: null };
        const its = irp.itens.reduce((m, t) => { m[t.id] = t; return m; }, {});
        const irpDoc = { numero: Number(irp.numero.split('/')[0]), ano: Number(irp.numero.split('/')[1]), processo: irp.processo, objeto: irp.objeto, prazo_fim: irp.prazo_fim };
        const blob = await DOC.gerarFormulario({ irp: irpDoc, ente, protocolo: res.protocolo,
          f: { responsavel_nome: dados.responsavel_nome, responsavel_cargo: dados.responsavel_cargo, responsavel_telefone: dados.responsavel_telefone, responsavel_email: dados.responsavel_email,
            autoridade_nome: dados.autoridade_nome, autoridade_cargo: dados.autoridade_cargo, dfd_numero: dados.dfd_numero, local_entrega: dados.local_entrega },
          itens: itens.map((x) => Object.assign({}, its[x.item_id], { qtd: x.qtd })), novos: nvs });
        await baixar(DOC.nomeFormulario(irpDoc, ente), blob);
        pub.protocolo = res.protocolo;
        desenharPasso4(passo4, irp, res.protocolo);
        passo4.scrollIntoView({ behavior: 'smooth' });
        toast('Formulário salvo (protocolo ' + res.protocolo + '). Assine e anexe no passo 4.');
      } catch (e) { toast(e.message, true); } finally { ocupado(bGerar); }
    });
    rc(corpo,
      el('section', { class: 'cartao' }, blocoEnte, estadoResp),
      el('section', { class: 'cartao' }, el('h2', null, '2. Itens e quantidades estimadas'),
        Object.keys(etp).length ? el('p', { class: 'msg msg-info' }, 'As quantidades já previstas no ETP para este ente vieram preenchidas. Confirme ou ajuste.') : null,
        el('p', { class: 'ajuda' }, 'Informe a quantidade só dos itens de interesse, na unidade indicada. Deixe em branco os demais.'),
        tabela(['Item', 'Descrição técnica', 'Unidade', 'Quantidade'], qs.map(({ t, q }) => el('tr', null, el('td', { class: 'num' }, t.numero), el('td', { class: 'texto-longo' }, t.descricao), el('td', null, t.unidade), el('td', null, q)))),
        el('h3', null, 'Inclusão de itens novos (opcional)'), el('p', { class: 'ajuda' }, 'Art. 5º, III, da Resolução nº 018/2023: o pedido precisa de justificativa e será analisado pelo CIMOP.'), caixaNovos),
      el('section', { class: 'cartao' }, el('h2', null, '3. Entrega, responsável e quem assina'),
        campo('pm-local', 'Local(is) de entrega ou de execução', f.local, 'Exigido pelo art. 5º, I, "c", da Resolução nº 018/2023.', true),
        campo('pm-dfd', 'Documento de Formalização da Demanda (DFD) nº', f.dfd, 'Opcional. Sai na declaração 5.2 do formulário.'),
        el('h3', null, 'Responsável pelas informações'),
        el('div', { class: 'grade-campos' }, campo('pm-rn', 'Nome', f.rnome, null, true), campo('pm-rc', 'Cargo', f.rcargo)),
        el('div', { class: 'grade-campos' }, campo('pm-rt', 'Telefone/WhatsApp', f.rtel), campo('pm-re', 'E-mail', f.remail, 'Recebe o resultado da análise.', true)),
        el('h3', null, 'Autoridade que assina o formulário'),
        el('div', { class: 'grade-campos' }, campo('pm-an', 'Nome', f.anome, null, true), campo('pm-ac', 'Cargo', f.acargo, null, true)),
        el('div', { class: 'acoes-formulario' }, bGerar)),
      passo4);
    if (resp && resp.situacao === 'preenchida') desenharPasso4(passo4, irp, resp.protocolo);
  }

  function desenharPasso4(caixa, irp, protocolo) {
    const arq = el('input', { type: 'file', accept: 'application/pdf' });
    const b = el('button', { type: 'button', class: 'btn btn-primario' }, 'Enviar o formulário assinado');
    b.addEventListener('click', async () => {
      const a = arq.files[0];
      if (!a) { toast('Escolha o PDF assinado.', true); return; }
      if (a.type !== 'application/pdf' || a.size > 20971520) { toast('Envie o PDF de até 20 MB.', true); return; }
      ocupado(b, 'Enviando…');
      try { await D.publicoIrpAnexar(irp.id, protocolo, pub.cnpj, a);
        rc(caixa, el('section', { class: 'cartao' }, el('div', { class: 'msg msg-ok' }, el('h2', null, 'Manifestação recebida'),
          el('p', null, 'Protocolo ', el('strong', null, protocolo), '. O CIMOP vai analisar os quantitativos e comunicar o resultado ao e-mail do responsável.'),
          el('p', null, 'Guarde o protocolo. Para consultar depois, volte a este endereço e informe o CNPJ.'))));
        caixa.scrollIntoView({ behavior: 'smooth' });
      } catch (e) { toast(e.message, true); ocupado(b); }
    });
    rc(caixa, el('section', { class: 'cartao cartao-destaque' }, el('h2', null, '4. Anexe o formulário assinado'),
      el('p', null, 'Protocolo ', el('strong', null, protocolo), '. Imprima ou assine digitalmente o PDF baixado (assinatura da autoridade indicada) e anexe aqui até ' + dataBR(irp.prazo_fim) + '. Sem o anexo, a manifestação não conta.'),
      campo('pm-arq', 'Formulário assinado (PDF)', arq, 'Até 20 MB.'), b));
  }

  async function verResultado(protocolo) {
    try {
      const r = await D.publicoIrpConsultar(protocolo, pub.cnpj);
      if (!r) { toast('Não encontrado.', true); return; }
      abrirDialogo('Resultado · protocolo ' + r.protocolo, el('div', null,
        el('p', null, el('strong', null, r.orgao), ' · IRP nº ' + r.irp + ' · ', RESULTADO[r.resultado] || 'Em análise'),
        tabela(['Item', 'Informado', 'Aceito', 'Decisão', 'Motivo'], r.itens.map((x) => el('tr', null, el('td', null, (x.numero ? x.numero + '. ' : 'Novo: ') + String(x.descricao || '').slice(0, 80)),
          el('td', { class: 'num' }, num(x.qtd_informada)), el('td', { class: 'num' }, x.qtd_aceita == null ? '—' : num(x.qtd_aceita)),
          el('td', null, { aceito: 'Aceito', ajustado: 'Ajustado', recusado: 'Recusado', pendente: 'Em análise' }[x.decisao]), el('td', null, x.motivo || '')))),
        r.motivo_geral ? el('p', null, 'Observação: ' + r.motivo_geral) : null), [], true);
    } catch (e) { toast(e.message, true); }
  }

  window.IRP = { telaPublica, recarregarIrp };
})();
