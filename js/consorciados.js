/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio
   Módulo CADASTRO DE CONSORCIADOS — cadastro único dos entes (base de todos os módulos)
   e das pessoas do próprio CIMOP. Usa o núcleo do painel (window.NUCLEO, em js/app.js).
   Tabelas: orgaos, orgao_leis, orgao_gestores, orgao_contatos, pessoas (script 11).
   ===================================================================== */
(function () {
  'use strict';
  const N = window.NUCLEO;
  const { el, rc, estado, D, O, toast, marcarErro, campo, txt, area, sel, abrirDialogo, confirmar, abas, cabecalho, paginarTudo,
    baixar, ocupado, consultarReceita, formatarTelefone, mascaraTelefone, telefoneValido, normalizar, UFS, XLSX_T, TELAS } = N;
  const pode = () => N.podeEditarCadastro();
  // Tabela que vira cartões no celular (padrão SOFT+): cada célula ganha o rótulo da coluna.
  function tabela(cab, linhas, extra) {
    const t = N.tabela(cab, linhas, Object.assign({ classeTabela: 'tabela-cartoes' }, extra || {}));
    const rotulos = cab.map((x) => (x instanceof Node ? x.textContent : String(x || '')).trim());
    t.querySelectorAll('tbody tr').forEach((tr) => [...tr.children].forEach((td, i) => { if (rotulos[i]) td.setAttribute('data-rotulo', rotulos[i]); else td.classList.add('celula-acoes'); }));
    return t;
  }

  // ---------------------------------------------------------------- rótulos
  const VINCULO = { consorciado: 'Consorciado', nao_consorciado: 'Não consorciado', cooperado: 'Cooperado' };
  const SITUACAO = { ativo: 'Ativo', suspenso: 'Suspenso', retirado: 'Retirado', excluido: 'Excluído' };
  const TIPO_LEI = { ratificacao: 'Ratificação do protocolo de intenções', alteracao: 'Alteração', retirada: 'Retirada do consórcio', outra: 'Outra' };
  const CARGOS_CIMOP = ['Presidente', 'Vice-Presidente', 'Diretor Executivo', 'Secretário Executivo', 'Agente de Contratação', 'Pregoeiro', 'Membro da Comissão de Contratação',
    'Fiscal de Contrato', 'Gestor de Contrato', 'Assessor Jurídico', 'Controlador Interno', 'Contador'];
  const AREAS = ['Gabinete', 'Licitação e contratos', 'Administração', 'Finanças', 'Educação', 'Saúde', 'Assistência Social', 'Obras e Infraestrutura', 'Meio Ambiente', 'Agricultura', 'Controle Interno', 'Jurídico'];
  const etqVinculo = (v) => v ? el('span', { class: 'etiqueta ' + (v === 'consorciado' ? 'etiqueta-ativo' : v === 'cooperado' ? 'etiqueta-azul' : 'etiqueta-inativo') }, VINCULO[v])
    : el('span', { class: 'etiqueta etiqueta-pendente' }, 'A definir');
  const etqSituacao = (s) => el('span', { class: 'etiqueta ' + (s === 'ativo' ? 'etiqueta-ativo' : s === 'suspenso' ? 'etiqueta-pendente' : 'etiqueta-desativado') }, SITUACAO[s] || 'Ativo');
  const dataBR = (d) => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';

  // ---------------------------------------------------------------- CPF, CEP, WhatsApp
  const soNum = (v) => String(v || '').replace(/\D/g, '');
  function cpfValido(v) {
    const c = soNum(v); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
    for (let t = 9; t < 11; t++) { let s = 0; for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i); if (((s * 10) % 11) % 10 !== Number(c[t])) return false; }
    return true;
  }
  const cpfMascarado = (v) => { const c = soNum(v); return c.length === 11 ? '***.' + c.slice(3, 6) + '.' + c.slice(6, 9) + '-**' : ''; };
  const formatarCpf = (v) => { const c = soNum(v).slice(0, 11); return c.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1-$2'); };
  function campoCpf(v) { const i = txt(v ? formatarCpf(v) : '', { inputmode: 'numeric', maxlength: 14, placeholder: '000.000.000-00', autocomplete: 'off' }); i.addEventListener('input', () => { i.value = formatarCpf(i.value); }); return i; }
  const formatarCep = (v) => soNum(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');
  function linkWhats(numero, texto) {
    let d = soNum(numero); if (!d) return null;
    if (!d.startsWith('55')) d = '55' + d;
    return 'https://wa.me/' + d + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }
  const contatoWhats = (n) => n ? el('a', { class: 'link', href: linkWhats(n), target: '_blank', rel: 'noopener', 'aria-label': 'WhatsApp ' + formatarTelefone(n) + ' (abre em nova aba)' }, formatarTelefone(n), ' ↗') : '—';

  // ---------------------------------------------------------------- dados
  const cad = () => estado.cad;
  const ente = (id) => cad().orgaos.find((o) => o.id === id);
  const gestoresDe = (id) => cad().gestores.filter((g) => g.orgao_id === id).sort((a, b) => (b.atual - a.atual) || String(b.mandato_inicio || b.criado_em || '').localeCompare(String(a.mandato_inicio || a.criado_em || '')));
  const gestorAtual = (id, funcao) => cad().gestores.find((g) => g.orgao_id === id && g.funcao === (funcao || 'titular') && g.atual);
  const leisDe = (id) => cad().leis.filter((l) => l.orgao_id === id).sort((a, b) => String(a.data || '').localeCompare(String(b.data || '')));
  const contatosDe = (id) => cad().contatos.filter((x) => x.orgao_id === id).sort((a, b) => (b.ativo - a.ativo) || a.area.localeCompare(b.area, 'pt-BR'));
  const url = (c) => D.urlCadastro(c);
  const integrado = (item) => !!((cad() && cad().integracao) || []).find((i) => i.item === item && i.ativo);
  const erroSite = (item, id) => ((cad() && cad().errosSite) || []).find((e) => e.item === item && e.registro === id);
  const podeCimop = () => N.perfilEm('consorciados') === 'administrador' || N.eAdminSistema();

  // O que falta no cadastro do ente (vale para todos os módulos)
  function pendencias(o) {
    const f = [];
    if (o.pendente) f.push('Confirmar o ente (veio de: ' + (o.pendente_origem || 'outro módulo') + ')');
    if (!o.cnpj) f.push('CNPJ');
    if (!o.vinculo) f.push('Situação no consórcio (consorciado, não consorciado ou cooperado)');
    if (o.vinculo === 'consorciado' && !leisDe(o.id).some((l) => l.tipo === 'ratificacao')) f.push('Lei ratificadora do protocolo de intenções');
    if (!gestorAtual(o.id)) f.push('Gestor atual');
    if (!o.email) f.push('E-mail do ente');
    if (!contatosDe(o.id).some((x) => x.ativo && x.recebe_avisos && (x.email || x.whatsapp)) && !o.whatsapp) f.push('Contato que recebe os avisos (e-mail ou WhatsApp)');
    if (!o.timbre_rodape_url && !o.endereco) f.push('Endereço (sai no rodapé padrão dos documentos)');
    return f;
  }

  async function depoisDeSalvar(textoOk) {
    await N.recarregarCadastro(); estado.base = null;
    if (textoOk) toast(textoOk);
    N.rotear();
  }
  // Envia um arquivo do cadastro (PDF ou imagem), conferindo tipo e tamanho
  async function enviar(arquivo, pasta, tipo) {
    const ehPdf = tipo === 'pdf';
    const okTipo = ehPdf ? arquivo.type === 'application/pdf' : /^image\/(png|jpeg|webp)$/.test(arquivo.type);
    if (!okTipo) throw new Error(ehPdf ? 'Envie o arquivo em PDF.' : 'Envie uma imagem PNG, JPG ou WEBP.');
    const max = ehPdf ? 20 : 5;
    if (arquivo.size > max * 1048576) throw new Error('Arquivo maior que ' + max + ' MB.');
    return D.enviarArquivoCadastro(arquivo, pasta);
  }
  const campoArquivo = (aceita) => el('input', { type: 'file', accept: aceita === 'pdf' ? 'application/pdf' : 'image/png,image/jpeg,image/webp' });
  const linkArquivo = (c, rot) => c ? el('a', { class: 'link', href: url(c), target: '_blank', rel: 'noopener' }, rot || 'Abrir PDF', ' ↗') : el('span', { class: 'falta-leve' }, 'sem arquivo');

  function semScript(c, e) {
    rc(c, cabecalho('Cadastro de Consorciados'), el('p', { class: 'msg msg-falta' }, e && e.message ? e.message : 'Rode o script 11 na Supabase para ativar este módulo.'));
  }

  // ================================================================= LISTA DE ENTES
  TELAS.entes = (c, filtroInicial) => {
    if (!cad()) { semScript(c); return; }
    const lista = cad().orgaos;
    const busca = el('input', { type: 'search', placeholder: 'Nome, sigla, CNPJ ou município', 'aria-label': 'Buscar ente' });
    const fVin = sel([['', 'Todos'], ['consorciado', 'Consorciados'], ['nao_consorciado', 'Não consorciados'], ['cooperado', 'Cooperados'], ['_', 'A definir']], '', { 'aria-label': 'Situação no consórcio' });
    const fSit = sel([['', 'Todas'], ...Object.entries(SITUACAO)], '', { 'aria-label': 'Situação' });
    const fPend = sel([['', 'Todos'], ['pendentes', 'Pendentes de confirmação'], ['falta', 'Com dados faltando'], ['completos', 'Completos']], filtroInicial === 'pendentes' ? 'pendentes' : '', { 'aria-label': 'Pendências' });
    const caixa = el('div');
    let res = [];
    const filtrar = () => {
      const t = normalizar(busca.value);
      res = lista.filter((o) => (!t || normalizar([o.nome, o.sigla, o.cnpj, o.municipio, o.uf].filter(Boolean).join(' ')).includes(t))
        && (!fVin.value || (fVin.value === '_' ? !o.vinculo : o.vinculo === fVin.value))
        && (!fSit.value || (o.situacao_consorcio || 'ativo') === fSit.value)
        && (!fPend.value || (fPend.value === 'pendentes' ? o.pendente : fPend.value === 'falta' ? pendencias(o).length > 0 : pendencias(o).length === 0)));
      rc(caixa, el('div', { class: 'barra-lista' }, el('span', null, el('strong', null, res.length), ' de ' + lista.length + ' ente(s)'),
        el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: exportar }, 'Exportar Excel')),
      res.length ? tabela(['Ente', 'CNPJ', 'Município/UF', 'Consórcio', 'Gestor atual', 'Pendências', ''], res.map((o) => {
        const p = pendencias(o), g = gestorAtual(o.id);
        return el('tr', null,
          el('td', null, el('a', { class: 'link-forte', href: '#ente-' + o.id }, o.nome), o.sigla ? el('span', { class: 'sub-linha' }, o.sigla) : null,
            o.pendente ? el('span', { class: 'etiqueta etiqueta-pendente ml-1' }, 'Pendente de confirmação') : null, o.ativo === false ? el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Inativo no sistema') : null),
          el('td', { class: 'num' }, o.cnpj ? O.formatarCnpj(o.cnpj) : el('span', { class: 'falta-leve' }, 'falta')),
          el('td', null, [o.municipio, o.uf].filter(Boolean).join('/') || '—'),
          el('td', null, etqVinculo(o.vinculo), ' ', o.vinculo ? etqSituacao(o.situacao_consorcio) : null),
          el('td', null, g ? [g.nome, g.cargo ? el('span', { class: 'sub-linha' }, g.cargo) : null] : el('span', { class: 'falta-leve' }, 'falta')),
          el('td', null, p.length ? el('span', { class: 'etiqueta etiqueta-pendente', title: p.join(' · ') }, p.length + (p.length === 1 ? ' pendência' : ' pendências')) : el('span', { class: 'etiqueta etiqueta-ativo' }, 'Completo')),
          el('td', { class: 'acoes' }, el('a', { class: 'btn btn-claro btn-p', href: '#ente-' + o.id }, 'Abrir')));
      })) : el('p', { class: 'vazio' }, 'Nenhum ente com esses filtros.'));
      paginarTudo(caixa);
    };
    function exportar() {
      const linhas = res.map((o) => { const g = gestorAtual(o.id), v = gestorAtual(o.id, 'vice'), lr = leisDe(o.id).filter((l) => l.tipo === 'ratificacao').pop();
        return { 'Ente': o.nome, 'Sigla': o.sigla || '', 'CNPJ': o.cnpj ? O.formatarCnpj(o.cnpj) : '', 'Esfera': o.esfera || '', 'Município': o.municipio || '', 'UF': o.uf || '',
          'Endereço': [o.endereco, o.bairro].filter(Boolean).join(' – '), 'CEP': o.cep || '', 'Telefone': o.telefone || '', 'WhatsApp': o.whatsapp || '', 'E-mail': o.email || '', 'Site': o.site || '',
          'Situação no consórcio': VINCULO[o.vinculo] || 'A definir', 'Situação': SITUACAO[o.situacao_consorcio] || '', 'Data de ingresso': dataBR(o.data_ingresso),
          'Lei ratificadora': lr ? lr.numero + (lr.data ? ' de ' + dataBR(lr.data) : '') : '', 'Gestor': g ? g.nome : '', 'Cargo': g ? g.cargo || '' : '',
          'Mandato': g ? [dataBR(g.mandato_inicio), dataBR(g.mandato_fim)].filter(Boolean).join(' a ') : '', 'Vice': v ? v.nome : '',
          'Pendências': pendencias(o).join('; ') }; });
      const wb = window.XLSX.utils.book_new(); const ws = window.XLSX.utils.json_to_sheet(linhas);
      ws['!cols'] = Object.keys(linhas[0] || { a: 1 }).map((k) => ({ wch: Math.min(48, Math.max(10, k.length + 2)) }));
      window.XLSX.utils.book_append_sheet(wb, ws, 'Entes');
      baixar('Cadastro de entes - CIMOP.xlsx', window.XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), XLSX_T);
    }
    [busca, fVin, fSit, fPend].forEach((x) => x.addEventListener(x === busca ? 'input' : 'change', filtrar));

    const conta = (f) => lista.filter(f).length;
    const ind = (n, rot, cor, alvo) => el('button', { type: 'button', class: 'indicador', style: '--k:' + cor, onclick: alvo }, el('strong', null, n), el('span', null, rot));
    const nPend = conta((o) => o.pendente);
    rc(c, cabecalho('Entes e consorciados', 'Cadastro único dos entes. Todos os módulos (Adesões, IRP e os próximos) usam estes dados.',
      pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => N.formOrgao({}, (o) => { if (o && o.id) location.hash = '#ente-' + o.id; }) }, '+ Novo ente') : null),
    nPend ? el('p', { class: 'msg msg-falta' }, nPend + (nPend === 1 ? ' ente chegou' : ' entes chegaram') + ' de outro módulo e ' + (nPend === 1 ? 'está pendente' : 'estão pendentes') + ' de confirmação. Confira os dados e clique em "Confirmar ente" na ficha.') : null,
    el('div', { class: 'indicadores' },
      ind(conta((o) => o.vinculo === 'consorciado' && o.situacao_consorcio === 'ativo'), 'consorciados ativos', '#0a8a62', () => { fVin.value = 'consorciado'; fSit.value = 'ativo'; fPend.value = ''; filtrar(); }),
      ind(conta((o) => o.vinculo === 'nao_consorciado'), 'não consorciados', '#4f6378', () => { fVin.value = 'nao_consorciado'; fSit.value = ''; fPend.value = ''; filtrar(); }),
      ind(conta((o) => o.vinculo === 'cooperado'), 'cooperados', '#1d5fd1', () => { fVin.value = 'cooperado'; fSit.value = ''; fPend.value = ''; filtrar(); }),
      ind(conta((o) => !o.vinculo), 'a definir', '#b26d06', () => { fVin.value = '_'; fSit.value = ''; fPend.value = ''; filtrar(); }),
      ind(conta((o) => pendencias(o).length), 'com dados faltando', '#c2416b', () => { fVin.value = ''; fSit.value = ''; fPend.value = 'falta'; filtrar(); })),
    el('div', { class: 'filtros' }, campo('fe-busca', 'Buscar', busca), campo('fe-vin', 'Situação no consórcio', fVin), campo('fe-sit', 'Situação', fSit), campo('fe-pend', 'Pendências', fPend)),
    caixa);
    filtrar();
  };
  TELAS.orgaos = (c) => { history.replaceState(null, '', '#entes'); TELAS.entes(c); };

  // ================================================================= FICHA DO ENTE
  TELAS.ente = (c, id) => {
    if (!cad()) { semScript(c); return; }
    const o = ente(id);
    if (!o) { rc(c, cabecalho('Ente não encontrado'), el('p', null, el('a', { class: 'link', href: '#entes' }, '← Voltar para a lista'))); return; }
    const p = pendencias(o).filter((x) => !x.startsWith('Confirmar'));
    const confirmarEnte = async (btn) => {
      ocupado(btn, 'Confirmando…');
      try { await D.salvar('orgaos', { id: o.id, pendente: false }); await depoisDeSalvar('Ente confirmado no Cadastro.'); } catch (e) { toast(e.message, true); ocupado(btn); }
    };
    const btnConf = el('button', { type: 'button', class: 'btn btn-primario btn-p' }, 'Confirmar ente'); btnConf.addEventListener('click', () => confirmarEnte(btnConf));
    const caixaAbas = abas([
      ['dados', 'Dados do ente', () => abaDados(o)],
      ['situacao', 'Situação e leis', () => abaSituacao(o)],
      ['gestores', 'Gestores', () => abaGestores(o)],
      ['contatos', 'Contatos', () => abaContatos(o)],
      ['timbre', 'Brasão e timbre', () => abaTimbre(o)],
    ], estado.abaEnte);
    caixaAbas.addEventListener('click', (ev) => { const b = ev.target.closest('[role="tab"]'); if (b) estado.abaEnte = b.id.replace('aba-', ''); });
    rc(c, el('p', { class: 'mb-1' }, el('a', { class: 'link', href: '#entes' }, '← Entes e consorciados')),
      cabecalho(o.nome, [o.cnpj ? 'CNPJ ' + O.formatarCnpj(o.cnpj) : 'CNPJ não informado', [o.municipio, o.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')),
      el('p', { class: 'etiquetas-linha' }, etqVinculo(o.vinculo), o.vinculo ? etqSituacao(o.situacao_consorcio) : null, o.sigla ? el('span', { class: 'etiqueta' }, o.sigla) : null,
        integrado('entes') ? (o.vinculo === 'consorciado' ? el('span', { class: 'etiqueta etiqueta-azul' }, 'No site do CIMOP') : el('span', { class: 'etiqueta' }, 'Não vai para o site (não é consorciado)')) : null),
      erroSite('entes', o.id) ? el('p', { class: 'msg msg-erro' }, el('strong', null, 'Não foi para o site: '), erroSite('entes', o.id).mensagem) : null,
      o.pendente ? el('div', { class: 'msg msg-falta faixa-acao' }, el('span', null, el('strong', null, 'Pendente de confirmação. '), 'Este ente foi incluído por ' + (o.pendente_origem || 'outro módulo') + '. Confira os dados e confirme.'), pode() ? btnConf : null) : null,
      p.length ? el('div', { class: 'msg msg-falta' }, el('strong', null, 'Falta no cadastro: '), p.join(' · ') + '.') : el('p', { class: 'msg msg-ok' }, 'Cadastro completo.'),
      caixaAbas);
  };

  // ---------- Aba: dados do ente
  function abaDados(o) {
    const f = { nome: txt(o.nome, { maxlength: 160 }), sigla: txt(o.sigla, { maxlength: 30, placeholder: 'Ex.: PMRC' }),
      cnpj: txt(o.cnpj ? O.formatarCnpj(o.cnpj) : '', { inputmode: 'numeric', maxlength: 18, placeholder: '00.000.000/0000-00' }),
      esfera: sel(['Municipal', 'Estadual', 'Federal', 'Consórcio', 'Outro'].map((e) => [e, e]), o.esfera || 'Municipal'),
      municipio: txt(o.municipio, { maxlength: 80 }), uf: sel(UFS.map((u) => [u, u]), o.uf || 'RN'),
      endereco: txt(o.endereco, { maxlength: 160, placeholder: 'Rua, número, complemento' }), bairro: txt(o.bairro, { maxlength: 80 }),
      cep: txt(o.cep, { inputmode: 'numeric', maxlength: 9, placeholder: '00000-000' }),
      telefone: mascaraTelefone(txt(o.telefone, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 3333-3333' })),
      whatsapp: mascaraTelefone(txt(o.whatsapp, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999' })),
      email: txt(o.email, { type: 'email', maxlength: 120 }), site: txt(o.site, { maxlength: 160, placeholder: 'https://' }),
      observacoes: area(o.observacoes, { rows: 3, maxlength: 2000 }), ativo: el('input', { type: 'checkbox', checked: o.ativo !== false }) };
    f.cnpj.addEventListener('input', () => { const n = soNum(f.cnpj.value).slice(0, 14); f.cnpj.value = n.length === 14 ? O.formatarCnpj(n) : n; });
    f.cep.addEventListener('input', () => { f.cep.value = formatarCep(f.cep.value); });
    if (!pode()) Object.values(f).forEach((i) => { i.disabled = true; });
    const avisoRf = el('div');
    const buscarRf = async () => {
      const n = soNum(f.cnpj.value); if (n.length !== 14) { toast('Digite os 14 números do CNPJ.', true); return; }
      rc(avisoRf, el('p', { class: 'ajuda' }, 'Consultando a Receita Federal…'));
      const rf = await consultarReceita(n);
      if (!rf) { rc(avisoRf, el('p', { class: 'msg msg-falta' }, 'Não foi possível consultar agora. Preencha manualmente.')); return; }
      const preenchidos = [];
      for (const k of ['nome', 'municipio', 'uf', 'esfera', 'email', 'telefone', 'endereco', 'bairro', 'cep']) if (rf[k] && f[k] && !f[k].value.trim()) { f[k].value = rf[k]; preenchidos.push(k); }
      rc(avisoRf, el('p', { class: 'msg ' + (preenchidos.length ? 'msg-ok' : 'msg-info') }, preenchidos.length ? 'Preenchido pela Receita Federal (só os campos vazios). Confira e salve.' : 'Os campos já estavam preenchidos; nada foi trocado.'),
        rf.situacao && !/ativa/i.test(rf.situacao) ? el('p', { class: 'msg msg-falta' }, 'Situação cadastral na Receita: ' + rf.situacao + '.') : null);
    };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar dados');
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      const cnpj = soNum(f.cnpj.value);
      const dup = cnpj && cad().orgaos.find((x) => x.cnpj === cnpj && x.id !== o.id);
      if (!marcarErro(f.cnpj, cnpj && cnpj.length !== 14 ? 'CNPJ com 14 números.' : dup ? 'Esse CNPJ já é de ' + dup.nome + '.' : '')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.telefone, telefoneValido(f.telefone.value) ? '' : 'Telefone incompleto: DDD e número.')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto: DDD e número.')) return;
      if (!marcarErro(f.cep, !f.cep.value || soNum(f.cep.value).length === 8 ? '' : 'CEP com 8 números.')) return;
      const site = f.site.value.trim();
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('orgaos', { id: o.id, nome: f.nome.value.trim(), sigla: f.sigla.value.trim() || null, cnpj: cnpj || null, esfera: f.esfera.value, municipio: f.municipio.value.trim() || null, uf: f.uf.value,
          endereco: f.endereco.value.trim() || null, bairro: f.bairro.value.trim() || null, cep: f.cep.value || null, telefone: f.telefone.value || null, whatsapp: f.whatsapp.value || null,
          email: f.email.value.trim().toLowerCase() || null, site: site ? (/^https?:\/\//i.test(site) ? site : 'https://' + site) : null, observacoes: f.observacoes.value.trim() || null, ativo: f.ativo.checked });
        await depoisDeSalvar('Dados do ente salvos.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
    return el('div', null,
      campo('ed-nome', 'Nome (como sai nos documentos)', f.nome, 'Ex.: Município de Riacho da Cruz/RN · Fundo Municipal de Saúde de …', true),
      el('div', { class: 'grade-campos' }, campo('ed-cnpj', 'CNPJ', f.cnpj, 'O limite de 50% das adesões é por CNPJ.'), campo('ed-sigla', 'Sigla', f.sigla), campo('ed-esfera', 'Esfera', f.esfera)),
      pode() ? el('div', null, el('button', { type: 'button', class: 'link', onclick: buscarRf }, 'Buscar dados na Receita Federal'), avisoRf) : null,
      el('div', { class: 'secao-form' }, el('h3', null, 'Endereço'),
        campo('ed-end', 'Endereço', f.endereco),
        el('div', { class: 'grade-campos' }, campo('ed-bairro', 'Bairro', f.bairro), campo('ed-cep', 'CEP', f.cep)),
        el('div', { class: 'grade-campos' }, campo('ed-mun', 'Município', f.municipio), campo('ed-uf', 'UF', f.uf))),
      el('div', { class: 'secao-form' }, el('h3', null, 'Contato institucional'),
        el('div', { class: 'grade-campos' }, campo('ed-email', 'E-mail institucional', f.email, 'Recebe as respostas das adesões e a divulgação da IRP.'), campo('ed-site', 'Site', f.site)),
        el('div', { class: 'grade-campos' }, campo('ed-tel', 'Telefone', f.telefone), campo('ed-whats', 'WhatsApp institucional', f.whatsapp))),
      campo('ed-obs', 'Observações', f.observacoes),
      el('label', { class: 'checkbox' }, f.ativo, ' Ente ativo no sistema (desmarcado, não aparece para novos lançamentos)'),
      pode() ? el('div', { class: 'barra-salvar' }, btn) : null);
  }

  // ---------- Aba: situação no consórcio e leis
  function abaSituacao(o) {
    const f = { vinculo: sel([['', 'A definir'], ...Object.entries(VINCULO)], o.vinculo || ''), situacao: sel(Object.entries(SITUACAO), o.situacao_consorcio || 'ativo'),
      ingresso: el('input', { type: 'date', value: o.data_ingresso || '' }), saida: el('input', { type: 'date', value: o.data_saida || '' }) };
    const caixaSaida = campo('es-saida', 'Data de saída', f.saida, 'Obrigatória para retirado ou excluído. Ex-membros continuam no site com esta data.');
    const verSaida = () => { caixaSaida.hidden = !['retirado', 'excluido'].includes(f.situacao.value); };
    f.situacao.addEventListener('change', verSaida); verSaida();
    if (!pode()) Object.values(f).forEach((i) => { i.disabled = true; });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar situação');
    btn.addEventListener('click', async () => {
      ocupado(btn, 'Salvando…');
      const saiu = ['retirado', 'excluido'].includes(f.situacao.value);
      if (!marcarErro(f.saida, saiu && !f.saida.value ? 'Informe a data de saída.' : saiu && f.ingresso.value && f.saida.value < f.ingresso.value ? 'A saída não pode ser antes do ingresso.' : '')) { ocupado(btn); return; }
      try { await D.salvar('orgaos', { id: o.id, vinculo: f.vinculo.value || null, situacao_consorcio: f.situacao.value, data_ingresso: f.ingresso.value || null, data_saida: saiu ? f.saida.value : null }); await depoisDeSalvar('Situação salva.'); }
      catch (e) { toast(e.message, true); ocupado(btn); }
    });
    const leis = leisDe(o.id);
    return el('div', null,
      el('div', { class: 'grade-campos' }, campo('es-vin', 'Situação no consórcio', f.vinculo, 'Consorciado: ratificou o protocolo de intenções. Cooperado: participa por instrumento de cooperação.'),
        campo('es-sit', 'Situação', f.situacao, 'Suspenso, retirado ou excluído: os módulos avisam ao usar o ente.'), campo('es-ing', 'Data de ingresso', f.ingresso), caixaSaida),
      pode() ? el('div', { class: 'barra-salvar' }, btn) : null,
      el('div', { class: 'secao-form' }, el('div', { class: 'cabecalho-secao' }, el('h3', null, 'Leis'),
        pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formLei(o, {}) }, '+ Nova lei') : null),
      el('p', { class: 'ajuda' }, 'Lei municipal que ratifica o protocolo de intenções do CIMOP e as que alteram ou tratam da retirada.'),
      leis.length ? tabela(['Tipo', 'Número', 'Data', 'Ementa', 'PDF', ''], leis.map((l) => el('tr', null,
        el('td', null, TIPO_LEI[l.tipo]), el('td', null, el('strong', null, 'Lei nº ' + l.numero)), el('td', null, dataBR(l.data) || '—'), el('td', null, l.ementa || '—'),
        el('td', null, linkArquivo(l.arquivo_url)),
        el('td', { class: 'acoes' }, pode() ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formLei(o, l) }, 'Editar'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluirPeca('orgao_leis', l, 'a Lei nº ' + l.numero, l.arquivo_url) }, 'Excluir')] : null))))
        : el('p', { class: 'vazio' }, o.vinculo === 'consorciado' ? 'Nenhuma lei cadastrada. Inclua a lei que ratificou o protocolo de intenções.' : 'Nenhuma lei cadastrada.')));
  }
  function formLei(o, l) {
    const f = { tipo: sel(Object.entries(TIPO_LEI), l.tipo || (leisDe(o.id).some((x) => x.tipo === 'ratificacao') ? 'alteracao' : 'ratificacao')),
      numero: txt(l.numero, { maxlength: 30, placeholder: '1.234/2021' }), data: el('input', { type: 'date', value: l.data || '' }),
      ementa: area(l.ementa, { rows: 2, maxlength: 600, placeholder: 'Ratifica o Protocolo de Intenções do Consórcio…' }), arquivo: campoArquivo('pdf') };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(l.id ? 'Editar lei' : 'Nova lei', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fl-tipo', 'Tipo', f.tipo, null, true), campo('fl-num', 'Número da lei', f.numero, null, true), campo('fl-data', 'Data', f.data)),
      campo('fl-ementa', 'Ementa', f.ementa),
      campo('fl-arq', l.arquivo_url ? 'Trocar o PDF da lei' : 'PDF da lei', f.arquivo, l.arquivo_url ? 'Já tem PDF. Envie outro só para trocar.' : 'Até 20 MB.')),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.numero, f.numero.value.trim() ? '' : 'Informe o número.')) return;
      ocupado(btn, 'Salvando…');
      try {
        let arquivo_url = l.arquivo_url || null;
        if (f.arquivo.files[0]) { arquivo_url = await enviar(f.arquivo.files[0], 'entes/' + o.id + '/leis', 'pdf'); if (l.arquivo_url) D.apagarArquivoCadastro(l.arquivo_url).catch(() => {}); }
        await D.salvar('orgao_leis', { ...(l.id ? { id: l.id } : { orgao_id: o.id }), tipo: f.tipo.value, numero: f.numero.value.trim().replace(/^lei\s*(n[º°o.]*)?\s*/i, ''), data: f.data.value || null,
          ementa: f.ementa.value.trim() || null, arquivo_url });
        d.close(); await depoisDeSalvar('Lei salva.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }
  async function excluirPeca(tabelaNome, reg, rotulo, arquivo) {
    if (!(await confirmar('Excluir', 'Excluir ' + rotulo + '? Isso não pode ser desfeito.', 'Excluir', true))) return;
    try { await D.excluir(tabelaNome, reg.id); if (arquivo) D.apagarArquivoCadastro(arquivo).catch(() => {}); await depoisDeSalvar('Excluído.'); } catch (e) { toast(e.message, true); }
  }

  // ---------- Aba: gestores (titular e vice, com histórico)
  function abaGestores(o) {
    const todos = gestoresDe(o.id), tit = gestorAtual(o.id), vice = gestorAtual(o.id, 'vice');
    const cartao = (g, rot) => el('section', { class: 'cartao cartao-gestor' }, el('h3', null, rot),
      g ? el('dl', { class: 'dados' }, el('dt', null, 'Nome'), el('dd', null, el('strong', null, g.nome)), el('dt', null, 'Cargo'), el('dd', null, g.cargo || '—'),
        el('dt', null, 'Mandato'), el('dd', null, [dataBR(g.mandato_inicio), dataBR(g.mandato_fim)].filter(Boolean).join(' a ') || '—'),
        el('dt', null, 'CPF'), el('dd', null, g.cpf ? cpfMascarado(g.cpf) : '—'), el('dt', null, 'E-mail'), el('dd', null, g.email || '—'), el('dt', null, 'WhatsApp'), el('dd', null, contatoWhats(g.whatsapp)),
        el('dt', null, 'No ofício'), el('dd', null, [g.tratamento, g.nome].filter(Boolean).join(' ') + (g.vocativo ? ' · "' + g.vocativo + '"' : '')))
        : el('p', { class: 'vazio' }, 'Não informado.'),
      pode() && g ? el('button', { type: 'button', class: 'link', onclick: () => formGestor(o, g) }, 'Corrigir') : null);
    const historico = todos.filter((g) => !g.atual);
    return el('div', null,
      el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, 'O gestor titular atual é o destinatário dos ofícios das adesões. Ao trocar o mandato, inclua o novo gestor: o anterior vai para o histórico.'),
        pode() ? el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => formGestor(o, {}) }, '+ Novo gestor') : null),
      el('div', { class: 'grade grade-2' }, cartao(tit, 'Gestor titular atual'), cartao(vice, 'Vice atual')),
      el('div', { class: 'secao-form' }, el('h3', null, 'Histórico de gestores'),
        historico.length ? tabela(['Função', 'Nome', 'Cargo', 'Mandato', ''], historico.map((g) => el('tr', null,
          el('td', null, g.funcao === 'vice' ? 'Vice' : 'Titular'), el('td', null, g.nome), el('td', null, g.cargo || '—'),
          el('td', null, [dataBR(g.mandato_inicio), dataBR(g.mandato_fim)].filter(Boolean).join(' a ') || '—'),
          el('td', { class: 'acoes' }, pode() ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formGestor(o, g) }, 'Corrigir'),
            el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluirPeca('orgao_gestores', g, 'o registro de ' + g.nome) }, 'Excluir')] : null))))
          : el('p', { class: 'vazio' }, 'Sem gestores anteriores cadastrados.')));
  }
  function formGestor(o, g) {
    const novo = !g.id;
    const f = { funcao: sel([['titular', 'Titular (prefeito, presidente, dirigente)'], ['vice', 'Vice']], g.funcao || 'titular'),
      nome: txt(g.nome, { maxlength: 120 }), cpf: campoCpf(g.cpf), cargo: txt(g.cargo || (o.esfera === 'Municipal' && !g.id ? 'Prefeito Municipal' : ''), { maxlength: 120 }),
      tratamento: sel([['Ao Senhor', 'Ao Senhor'], ['À Senhora', 'À Senhora'], ['A Sua Excelência o Senhor', 'A Sua Excelência o Senhor'], ['A Sua Excelência a Senhora', 'A Sua Excelência a Senhora']], g.tratamento || 'Ao Senhor'),
      vocativo: txt(g.vocativo, { maxlength: 80, placeholder: 'Automático: "Senhor Prefeito,"' }),
      inicio: el('input', { type: 'date', value: g.mandato_inicio || '' }), fim: el('input', { type: 'date', value: g.mandato_fim || '' }),
      email: txt(g.email, { type: 'email', maxlength: 120 }), whatsapp: mascaraTelefone(txt(g.whatsapp, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999' })),
      atual: el('input', { type: 'checkbox', checked: novo ? true : !!g.atual }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(novo ? 'Novo gestor' : 'Corrigir gestor', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fg-funcao', 'Função', f.funcao, null, true), campo('fg-nome', 'Nome completo', f.nome, null, true)),
      el('div', { class: 'grade-campos' }, campo('fg-cargo', 'Cargo', f.cargo), campo('fg-cpf', 'CPF', f.cpf, 'Fica guardado e aparece mascarado.')),
      el('div', { class: 'grade-campos' }, campo('fg-ini', 'Início do mandato', f.inicio), campo('fg-fim', 'Fim do mandato', f.fim)),
      el('div', { class: 'secao-form' }, el('h3', null, 'Nos ofícios'),
        el('div', { class: 'grade-campos' }, campo('fg-trat', 'Tratamento', f.tratamento), campo('fg-voc', 'Vocativo', f.vocativo))),
      el('div', { class: 'grade-campos' }, campo('fg-email', 'E-mail', f.email), campo('fg-whats', 'WhatsApp', f.whatsapp)),
      el('label', { class: 'checkbox' }, f.atual, ' É o gestor atual desta função (o anterior vai para o histórico)')),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (!marcarErro(f.cpf, !f.cpf.value || cpfValido(f.cpf.value) ? '' : 'CPF inválido.')) return;
      if (!marcarErro(f.fim, f.inicio.value && f.fim.value && f.fim.value < f.inicio.value ? 'O fim é antes do início.' : '')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('orgao_gestores', { ...(g.id ? { id: g.id } : { orgao_id: o.id }), funcao: f.funcao.value, nome: f.nome.value.trim().toUpperCase(), cpf: soNum(f.cpf.value) || null,
          cargo: f.cargo.value.trim() || null, tratamento: f.tratamento.value, vocativo: f.vocativo.value.trim() || null, mandato_inicio: f.inicio.value || null, mandato_fim: f.fim.value || null,
          email: f.email.value.trim().toLowerCase() || null, whatsapp: f.whatsapp.value || null, atual: f.atual.checked });
        d.close(); await depoisDeSalvar('Gestor salvo.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ---------- Aba: contatos por área
  function abaContatos(o) {
    const lista = contatosDe(o.id);
    return el('div', null,
      el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, 'Quem recebe os avisos de cada área. Os marcados em "Recebe avisos" entram na divulgação da IRP por e-mail e WhatsApp.'),
        pode() ? el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => formContato(o, {}) }, '+ Novo contato') : null),
      lista.length ? tabela(['Área', 'Nome', 'E-mail', 'WhatsApp', 'Telefone', 'Avisos', ''], lista.map((x) => el('tr', { class: x.ativo ? null : 'lin-inativa' },
        el('td', null, el('strong', null, x.area), x.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Inativo')),
        el('td', null, x.nome || '—', x.cargo ? el('span', { class: 'sub-linha' }, x.cargo) : null),
        el('td', null, x.email ? el('a', { class: 'link', href: 'mailto:' + x.email }, x.email) : '—'), el('td', null, contatoWhats(x.whatsapp)), el('td', null, x.telefone || '—'),
        el('td', null, x.recebe_avisos ? el('span', { class: 'etiqueta etiqueta-ativo' }, 'Recebe') : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Não')),
        el('td', { class: 'acoes' }, pode() ? [el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formContato(o, x) }, 'Editar'),
          el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluirPeca('orgao_contatos', x, 'o contato de ' + x.area) }, 'Excluir')] : null))))
        : el('p', { class: 'vazio' }, 'Nenhum contato cadastrado.'));
  }
  function formContato(o, x) {
    const lista = el('datalist', { id: 'areas-contato' }, AREAS.map((a) => el('option', { value: a })));
    const f = { area: txt(x.area, { maxlength: 60, list: 'areas-contato', placeholder: 'Licitação e contratos' }), nome: txt(x.nome, { maxlength: 120 }), cargo: txt(x.cargo, { maxlength: 120 }),
      email: txt(x.email, { type: 'email', maxlength: 120 }), whatsapp: mascaraTelefone(txt(x.whatsapp, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999' })),
      telefone: mascaraTelefone(txt(x.telefone, { maxlength: 15, inputmode: 'tel' })),
      avisos: el('input', { type: 'checkbox', checked: x.id ? !!x.recebe_avisos : true }), ativo: el('input', { type: 'checkbox', checked: x.id ? x.ativo !== false : true }) };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(x.id ? 'Editar contato' : 'Novo contato', el('div', null, lista,
      el('div', { class: 'grade-campos' }, campo('fc-area', 'Área', f.area, null, true), campo('fc-nome', 'Nome', f.nome)),
      campo('fc-cargo', 'Cargo ou função', f.cargo),
      el('div', { class: 'grade-campos' }, campo('fc-email', 'E-mail', f.email), campo('fc-whats', 'WhatsApp', f.whatsapp), campo('fc-tel', 'Telefone', f.telefone)),
      el('label', { class: 'checkbox' }, f.avisos, ' Recebe os avisos (divulgação e lembretes)'), el('label', { class: 'checkbox' }, f.ativo, ' Contato ativo')),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.area, f.area.value.trim() ? '' : 'Informe a área.')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto.')) return;
      if (!marcarErro(f.email, f.email.value.trim() || f.whatsapp.value || f.telefone.value ? '' : 'Informe ao menos um meio de contato.')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvar('orgao_contatos', { ...(x.id ? { id: x.id } : { orgao_id: o.id }), area: f.area.value.trim(), nome: f.nome.value.trim() || null, cargo: f.cargo.value.trim() || null,
          email: f.email.value.trim().toLowerCase() || null, whatsapp: f.whatsapp.value || null, telefone: f.telefone.value || null, recebe_avisos: f.avisos.checked, ativo: f.ativo.checked });
        d.close(); await depoisDeSalvar('Contato salvo.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // ---------- Aba: brasão e timbre
  // O timbre do ente sai nos documentos gerados em nome dele (ex.: Formulário Padrão da IRP).
  function abaTimbre(o) {
    const peca = (chave, titulo, ajuda) => {
      const atual = o[chave];
      const entrada = campoArquivo('imagem'); entrada.id = 'tb-' + chave;
      entrada.addEventListener('change', async () => {
        const a = entrada.files[0]; if (!a) return;
        try {
          toast('Enviando…');
          const caminho = await enviar(a, 'entes/' + o.id + '/timbre', 'imagem');
          await D.salvar('orgaos', { id: o.id, [chave]: caminho });
          if (atual) D.apagarArquivoCadastro(atual).catch(() => {});
          await depoisDeSalvar(titulo + ' salvo.');
        } catch (e) { toast(e.message, true); entrada.value = ''; }
      });
      const tirar = async () => {
        if (!(await confirmar('Tirar ' + titulo.toLowerCase(), 'Tirar a imagem atual? Os próximos documentos saem sem ela.', 'Tirar', true))) return;
        try { await D.salvar('orgaos', { id: o.id, [chave]: null }); D.apagarArquivoCadastro(atual).catch(() => {}); await depoisDeSalvar(titulo + ' retirado.'); } catch (e) { toast(e.message, true); }
      };
      return el('section', { class: 'cartao cartao-timbre' }, el('h3', null, titulo), el('p', { class: 'ajuda' }, ajuda),
        atual ? el('img', { class: 'timbre-imagem' + (chave === 'brasao_url' ? ' timbre-brasao' : ''), src: url(atual), alt: titulo + ' de ' + o.nome }) : el('p', { class: 'vazio' }, 'Sem imagem.'),
        pode() ? el('div', { class: 'botoes-linha' }, el('label', { class: 'btn btn-claro btn-p botao-arquivo' }, atual ? 'Trocar imagem' : 'Enviar imagem', entrada),
          atual ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: tirar }, 'Tirar') : null) : null);
    };
    return el('div', null,
      el('p', { class: 'ajuda' }, 'O Formulário Padrão da IRP (e outros documentos gerados em nome do ente) sai com este timbre. Com imagem enviada, ela é usada inteira. Sem imagem, o sistema gera um padrão só com os textos do cadastro: no cabeçalho, o nome e o CNPJ (com o brasão, se houver); no rodapé, o endereço e os contatos. O documento nunca sai sem cabeçalho nem rodapé.'),
      el('div', { class: 'grade grade-3' },
        peca('brasao_url', 'Brasão', 'PNG com fundo transparente, de preferência quadrado.'),
        peca('timbre_cabecalho_url', 'Cabeçalho do timbre', 'A faixa de cima do papel timbrado (largura da folha). Sem ela, sai o cabeçalho padrão com o nome e o CNPJ.'),
        peca('timbre_rodape_url', 'Rodapé do timbre', 'A faixa de baixo do papel timbrado. Sem ela, sai o rodapé padrão com endereço e contatos.')),
      el('section', { class: 'cartao' }, el('h3', null, 'Como o cabeçalho sai nos documentos'), previaTimbre(o)));
  }
  // Timbre do ente para os documentos. Sem imagem anexada, o sistema gera um padrão só com os textos do cadastro
  // (o documento nunca sai sem cabeçalho nem rodapé). Usado na prévia e no PDF do Formulário Padrão da IRP.
  function timbreDoEnte(o) {
    const cidade = [o.municipio, o.uf].filter(Boolean).join('/');
    const cabecalho = o.timbre_cabecalho_url ? { imagem: url(o.timbre_cabecalho_url) }
      : { brasao: o.brasao_url ? url(o.brasao_url) : null, titulo: String(o.nome || '').toUpperCase(),
          linhas: [o.cnpj ? 'CNPJ ' + O.formatarCnpj(o.cnpj) : null, o.vinculo === 'consorciado' ? 'Ente consorciado ao CIMOP' : null].filter(Boolean) };
    const rodape = o.timbre_rodape_url ? { imagem: url(o.timbre_rodape_url) }
      : { linhas: [[o.endereco, o.bairro, o.cep ? 'CEP ' + o.cep : null, cidade].filter(Boolean).join(' · '),
          [o.telefone ? 'Tel. ' + o.telefone : null, o.whatsapp && o.whatsapp !== o.telefone ? 'WhatsApp ' + o.whatsapp : null, o.email, o.site ? o.site.replace(/^https?:\/\//i, '') : null].filter(Boolean).join(' · ')]
          .filter(Boolean) };
    if (!rodape.imagem && !rodape.linhas.length) rodape.linhas = [String(o.nome || '') + (cidade ? ' · ' + cidade : '')];
    return { cabecalho, rodape, gerado: { cabecalho: !cabecalho.imagem, rodape: !rodape.imagem } };
  }
  function previaTimbre(o) {
    const t = timbreDoEnte(o);
    const cab = t.cabecalho.imagem ? el('img', { class: 'previa-cabecalho', src: t.cabecalho.imagem, alt: 'Cabeçalho do timbre' })
      : el('div', { class: 'previa-montado' + (t.cabecalho.brasao ? '' : ' previa-sem-imagem') }, t.cabecalho.brasao ? el('img', { src: t.cabecalho.brasao, alt: 'Brasão' }) : null,
        el('div', null, el('strong', null, t.cabecalho.titulo), t.cabecalho.linhas.map((l) => el('span', null, l))));
    const rod = t.rodape.imagem ? el('img', { class: 'previa-rodape', src: t.rodape.imagem, alt: 'Rodapé do timbre' })
      : el('div', { class: 'previa-rodape-texto' }, t.rodape.linhas.map((l) => el('span', null, l)));
    return el('div', null,
      el('div', { class: 'previa-folha' }, cab, el('div', { class: 'previa-linhas', 'aria-hidden': 'true' }, el('span'), el('span'), el('span')), rod),
      el('p', { class: 'ajuda mt-1' }, 'Cabeçalho: ' + (t.gerado.cabecalho ? 'padrão gerado com os textos do cadastro' + (t.cabecalho.brasao ? ' e o brasão' : '') : 'imagem enviada') + '. Rodapé: ' + (t.gerado.rodape ? 'padrão gerado com o endereço e os contatos do cadastro' : 'imagem enviada') + '.'));
  }

  // ================================================================= PESSOAS DO CIMOP
  TELAS.pessoas = (c) => {
    if (!cad()) { semScript(c); return; }
    const lista = cad().pessoas.slice().sort((a, b) => (b.ativo - a.ativo) || (CARGOS_CIMOP.indexOf(a.cargo) + 1 || 99) - (CARGOS_CIMOP.indexOf(b.cargo) + 1 || 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
    rc(c, cabecalho('Pessoas do CIMOP', 'Quem é do próprio consórcio. Qualquer módulo pode ligar estas pessoas aos seus registros: quem assina o edital da IRP, o Presidente dos ofícios das adesões, fiscais e responsáveis.',
      pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formPessoa({}) }, '+ Nova pessoa') : null),
    integrado('pessoas') ? el('p', { class: 'msg msg-info' }, 'Integração com o site ligada: as pessoas marcadas com "Mostrar no site" aparecem na página de gestores do site do CIMOP, e lá elas só são alteradas por aqui.') : null,
    lista.length ? tabela(['Nome', 'Cargo', 'Ato de nomeação', 'Período', 'Contato', 'Assina', 'No site', ''], lista.map((p) => el('tr', { class: p.ativo ? null : 'lin-inativa' },
      el('td', null, el('strong', null, p.nome), p.cpf ? el('span', { class: 'sub-linha' }, 'CPF ' + cpfMascarado(p.cpf)) : null, p.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Inativo')),
      el('td', null, p.cargo),
      el('td', null, p.ato_numero ? [p.ato_numero + (p.ato_data ? ' de ' + dataBR(p.ato_data) : ''), p.ato_url ? el('span', { class: 'sub-linha' }, linkArquivo(p.ato_url)) : null] : '—'),
      el('td', null, [dataBR(p.inicio), dataBR(p.fim)].filter(Boolean).join(' a ') || '—'),
      el('td', null, p.email || '—', p.whatsapp ? el('span', { class: 'sub-linha' }, contatoWhats(p.whatsapp)) : null),
      el('td', null, p.assina_documentos ? el('span', { class: 'etiqueta etiqueta-ativo' }, 'Sim') : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Não')),
      el('td', null, p.mostrar_site ? el('span', { class: 'etiqueta etiqueta-azul' }, integrado('pessoas') ? 'Sim' : 'Marcado') : '—',
        erroSite('pessoas', p.id) ? el('span', { class: 'sub-linha erro-texto' }, 'Erro: ' + erroSite('pessoas', p.id).mensagem) : null),
      el('td', { class: 'acoes' }, pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formPessoa(p) }, 'Editar') : null))))
      : el('p', { class: 'vazio' }, 'Nenhuma pessoa cadastrada.'));
  };
  function formPessoa(p) {
    const ehOutro = p.cargo && !CARGOS_CIMOP.includes(p.cargo);
    const f = { nome: txt(p.nome, { maxlength: 120 }), cpf: campoCpf(p.cpf),
      cargo: sel([['', 'Escolha…'], ...CARGOS_CIMOP.map((x) => [x, x]), ['_outro', 'Outro…']], ehOutro ? '_outro' : p.cargo || ''),
      outro: txt(ehOutro ? p.cargo : '', { maxlength: 80, placeholder: 'Nome do cargo' }),
      atoNum: txt(p.ato_numero, { maxlength: 80, placeholder: 'Portaria nº 001/2026 · Ata da Assembleia de …' }), atoData: el('input', { type: 'date', value: p.ato_data || '' }), atoArq: campoArquivo('pdf'),
      inicio: el('input', { type: 'date', value: p.inicio || '' }), fim: el('input', { type: 'date', value: p.fim || '' }),
      email: txt(p.email, { type: 'email', maxlength: 120 }), whatsapp: mascaraTelefone(txt(p.whatsapp, { maxlength: 15, inputmode: 'tel', placeholder: '(84) 99999-9999' })),
      assina: el('input', { type: 'checkbox', checked: p.id ? !!p.assina_documentos : true }), ativo: el('input', { type: 'checkbox', checked: p.id ? p.ativo !== false : true }),
      site: el('input', { type: 'checkbox', checked: !!p.mostrar_site }), capa: el('input', { type: 'checkbox', checked: !!p.destaque_capa }),
      ordem: el('input', { type: 'number', min: 0, max: 999, value: p.ordem_site || 0 }), unidade: sel([['', 'Sem unidade']], p.unidade_site_id || ''),
      foto: campoArquivo('imagem'), curriculo: campoArquivo('pdf') };
    D.siteUnidades().then((us) => { us.forEach((u) => f.unidade.append(el('option', { value: u.id, selected: u.id === p.unidade_site_id }, u.nome))); }).catch(() => {});
    const blocoSite = el('div', null,
      el('div', { class: 'grade-campos' }, campo('fp-unid', 'Unidade no site', f.unidade, 'Unidades cadastradas no Portal (Unidades e gestores).'), campo('fp-ordem', 'Ordem no destaque', f.ordem)),
      el('div', { class: 'grade-campos' }, campo('fp-foto', p.foto_url ? 'Trocar a foto' : 'Foto', f.foto, p.foto_url ? 'Já tem foto.' : 'JPG, PNG ou WEBP, até 5 MB.'),
        campo('fp-curr', p.curriculo_url ? 'Trocar o currículo' : 'Currículo (PDF)', f.curriculo, p.curriculo_url ? 'Já tem currículo.' : 'Opcional.')),
      el('label', { class: 'checkbox' }, f.capa, ' Destacar no bloco "Gestão" da página inicial do site'));
    const verSite = () => { blocoSite.hidden = !f.site.checked; }; f.site.addEventListener('change', verSite); verSite();
    const caixaOutro = campo('fp-outro', 'Qual cargo?', f.outro); caixaOutro.hidden = f.cargo.value !== '_outro';
    f.cargo.addEventListener('change', () => { caixaOutro.hidden = f.cargo.value !== '_outro'; });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(p.id ? 'Editar pessoa' : 'Nova pessoa do CIMOP', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fp-nome', 'Nome completo', f.nome, null, true), campo('fp-cpf', 'CPF', f.cpf, 'Aparece mascarado.')),
      el('div', { class: 'grade-campos' }, campo('fp-cargo', 'Cargo ou função', f.cargo, null, true), caixaOutro),
      el('div', { class: 'secao-form' }, el('h3', null, 'Ato de nomeação ou eleição'),
        el('div', { class: 'grade-campos' }, campo('fp-ato', 'Ato', f.atoNum), campo('fp-atodata', 'Data do ato', f.atoData)),
        campo('fp-atoarq', p.ato_url ? 'Trocar o PDF do ato' : 'PDF do ato', f.atoArq, 'Opcional. Até 20 MB.'),
        el('div', { class: 'grade-campos' }, campo('fp-ini', 'Início no cargo', f.inicio), campo('fp-fim', 'Fim no cargo', f.fim))),
      el('div', { class: 'grade-campos' }, campo('fp-email', 'E-mail', f.email), campo('fp-whats', 'WhatsApp', f.whatsapp)),
      el('label', { class: 'checkbox' }, f.assina, ' Pode assinar documentos do sistema (edital da IRP, ofícios)'),
      el('label', { class: 'checkbox' }, f.ativo, ' Ativo (desmarque quando sair do cargo; o registro fica no histórico)'),
      el('div', { class: 'secao-form' }, el('h3', null, 'No site do CIMOP'),
        el('label', { class: 'checkbox' }, f.site, ' Mostrar no site (página de gestores e "Quem é quem")'),
        integrado('pessoas') ? null : el('p', { class: 'ajuda' }, 'A integração de Pessoas com o site está desligada: a marcação fica guardada e vale quando ela for ligada em Sistema › Integração com o site.'),
        blocoSite)),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (!marcarErro(f.cpf, !f.cpf.value || cpfValido(f.cpf.value) ? '' : 'CPF inválido.')) return;
      const cargo = f.cargo.value === '_outro' ? f.outro.value.trim() : f.cargo.value;
      if (!marcarErro(f.cargo.value === '_outro' ? f.outro : f.cargo, cargo ? '' : 'Informe o cargo.')) return;
      if (!marcarErro(f.fim, f.inicio.value && f.fim.value && f.fim.value < f.inicio.value ? 'O fim é antes do início.' : '')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto.')) return;
      // Só um Presidente ativo por vez: ele assina os ofícios das adesões.
      const outroPres = cargo === 'Presidente' && f.ativo.checked && cad().pessoas.find((x) => x.cargo === 'Presidente' && x.ativo && x.id !== p.id);
      if (outroPres && !(await confirmar('Novo Presidente', outroPres.nome + ' está como Presidente ativo. Desativar o registro dele e passar os ofícios a sair com ' + f.nome.value.trim().toUpperCase() + '?', 'Sim, trocar'))) return;
      ocupado(btn, 'Salvando…');
      try {
        let ato_url = p.ato_url || null;
        if (f.atoArq.files[0]) { ato_url = await enviar(f.atoArq.files[0], 'pessoas', 'pdf'); if (p.ato_url) D.apagarArquivoCadastro(p.ato_url).catch(() => {}); }
        let foto_url = p.foto_url || null, curriculo_url = p.curriculo_url || null;
        if (f.site.checked && f.foto.files[0]) { foto_url = await enviar(f.foto.files[0], 'pessoas/fotos', 'imagem'); if (p.foto_url) D.apagarArquivoCadastro(p.foto_url).catch(() => {}); }
        if (f.site.checked && f.curriculo.files[0]) { curriculo_url = await enviar(f.curriculo.files[0], 'pessoas/curriculos', 'pdf'); if (p.curriculo_url) D.apagarArquivoCadastro(p.curriculo_url).catch(() => {}); }
        if (outroPres) await D.salvar('pessoas', { id: outroPres.id, ativo: false, fim: outroPres.fim || f.inicio.value || N.hoje() });
        await D.salvar('pessoas', { ...(p.id ? { id: p.id } : {}), nome: f.nome.value.trim().toUpperCase(), cpf: soNum(f.cpf.value) || null, cargo, ato_numero: f.atoNum.value.trim() || null,
          ato_data: f.atoData.value || null, ato_url, inicio: f.inicio.value || null, fim: f.fim.value || null, email: f.email.value.trim().toLowerCase() || null,
          whatsapp: f.whatsapp.value || null, assina_documentos: f.assina.checked, ativo: f.ativo.checked,
          mostrar_site: f.site.checked, destaque_capa: f.site.checked && f.capa.checked, ordem_site: Number(f.ordem.value) || 0, unidade_site_id: f.unidade.value || null, foto_url, curriculo_url });
        d.close(); await depoisDeSalvar('Pessoa salva.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }


  // ================================================================= DADOS DO CIMOP
  // Identidade do próprio consórcio. Com a integração "Dados do CIMOP" ligada, vai para a Aparência do site.
  TELAS.cimop = (c) => {
    if (!cad()) { semScript(c); return; }
    const cf = cad().config || {};
    const f = { nome: txt(cf.orgao_nome, { maxlength: 200 }), sigla: txt(cf.sigla, { maxlength: 20 }),
      cnpj: txt(cf.cnpj ? O.formatarCnpj(cf.cnpj) : '', { inputmode: 'numeric', maxlength: 18 }), cidade: txt(cf.cidade_uf, { maxlength: 80, placeholder: 'Portalegre/RN' }),
      endereco: txt(cf.endereco, { maxlength: 200 }), cep: txt(cf.cep, { inputmode: 'numeric', maxlength: 9 }),
      telefone: mascaraTelefone(txt(cf.telefone, { maxlength: 15, inputmode: 'tel' })), whatsapp: mascaraTelefone(txt(cf.whatsapp, { maxlength: 15, inputmode: 'tel' })),
      email: txt(cf.email_institucional, { type: 'email', maxlength: 120 }), horario: txt(cf.horario, { maxlength: 160, placeholder: 'Segunda a sexta, das 8h às 14h' }),
      logo: campoArquivo('imagem') };
    f.cnpj.addEventListener('input', () => { const n = soNum(f.cnpj.value).slice(0, 14); f.cnpj.value = n.length === 14 ? O.formatarCnpj(n) : n; });
    f.cep.addEventListener('input', () => { f.cep.value = formatarCep(f.cep.value); });
    if (!podeCimop()) Object.values(f).forEach((i) => { i.disabled = true; });
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (!marcarErro(f.sigla, f.sigla.value.trim() ? '' : 'Informe a sigla.')) return;
      if (!marcarErro(f.cnpj, !f.cnpj.value || soNum(f.cnpj.value).length === 14 ? '' : 'CNPJ com 14 números.')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.telefone, telefoneValido(f.telefone.value) ? '' : 'Telefone incompleto.')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto.')) return;
      ocupado(btn, 'Salvando…');
      try {
        let logo_url = cf.logo_url || null;
        if (f.logo.files[0]) { logo_url = await enviar(f.logo.files[0], 'cimop', 'imagem'); }
        await D.salvarConfig({ orgao_nome: f.nome.value.trim(), sigla: f.sigla.value.trim(), cnpj: soNum(f.cnpj.value) || null, cidade_uf: f.cidade.value.trim() || cf.cidade_uf,
          endereco: f.endereco.value.trim() || null, cep: f.cep.value || null, telefone: f.telefone.value || null, whatsapp: f.whatsapp.value || null,
          email_institucional: f.email.value.trim().toLowerCase() || null, horario: f.horario.value.trim() || null, logo_url });
        await depoisDeSalvar(integrado('identidade') ? 'Dados do CIMOP salvos e enviados ao site.' : 'Dados do CIMOP salvos.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
    rc(c, cabecalho('Dados do CIMOP', 'Identidade do próprio consórcio, usada nos documentos do sistema' + (integrado('identidade') ? ' e no site do CIMOP.' : '.')),
      integrado('identidade') ? el('p', { class: 'msg msg-info' }, 'Integração com o site ligada: nome exibido, endereço, CEP, telefone, WhatsApp, e-mail, horário e logotipo do site do CIMOP vêm daqui. As cores, banners e redes sociais continuam na Aparência do Portal.') : null,
      erroSite('identidade', '00000000-0000-0000-0000-000000000001') ? el('p', { class: 'msg msg-erro' }, 'Não foi para o site: ' + erroSite('identidade', '00000000-0000-0000-0000-000000000001').mensagem) : null,
      el('section', { class: 'cartao' }, el('h2', null, 'Identificação'),
        campo('dc-nome', 'Nome do consórcio', f.nome, 'Sai nos documentos e é o nome exibido no site.', true),
        el('div', { class: 'grade-campos' }, campo('dc-sigla', 'Sigla', f.sigla, null, true), campo('dc-cnpj', 'CNPJ', f.cnpj), campo('dc-cidade', 'Sede (local da data nos documentos)', f.cidade))),
      el('section', { class: 'cartao' }, el('h2', null, 'Endereço e atendimento'),
        el('div', { class: 'grade-campos' }, campo('dc-end', 'Endereço da sede', f.endereco), campo('dc-cep', 'CEP', f.cep)),
        el('div', { class: 'grade-campos' }, campo('dc-tel', 'Telefone', f.telefone), campo('dc-whats', 'WhatsApp', f.whatsapp), campo('dc-email', 'E-mail institucional', f.email)),
        campo('dc-hor', 'Horário de atendimento', f.horario)),
      el('section', { class: 'cartao' }, el('h2', null, 'Logotipo'),
        cf.logo_url ? el('img', { class: 'timbre-imagem timbre-brasao', src: url(cf.logo_url), alt: 'Logotipo do CIMOP' }) : el('p', { class: 'vazio' }, 'Sem logotipo.'),
        campo('dc-logo', cf.logo_url ? 'Trocar o logotipo' : 'Enviar logotipo', f.logo, 'PNG com fundo transparente, até 5 MB.')),
      podeCimop() ? el('div', { class: 'barra-salvar' }, btn) : el('p', { class: 'ajuda' }, 'Só o administrador do módulo altera os Dados do CIMOP.'));
  };

  // ================================================================= INTEGRAÇÃO COM O SITE (administrador do sistema)
  const ITENS_SITE = {
    entes: { nome: 'Entes consorciados', vai: 'Os entes marcados como consorciados (com a lei de ratificação, ingresso e saída) vão para a página "Entes consorciados" do site. Ex-membros continuam lá, com a data de saída.', onde: '#entes', tela: 'Cadastro de Consorciados › Entes' },
    pessoas: { nome: 'Pessoas do CIMOP (gestores)', vai: 'As pessoas marcadas com "Mostrar no site" vão para os gestores do site (nome, cargo, contato, unidade, foto, currículo e destaque na capa).', onde: '#pessoas', tela: 'Cadastro de Consorciados › Pessoas do CIMOP' },
    identidade: { nome: 'Dados do CIMOP', vai: 'Nome exibido, endereço, CEP, telefone, WhatsApp, e-mail, horário e logotipo vão para a Aparência do site. Cores, banners e redes sociais continuam no Portal.', onde: '#cimop', tela: 'Cadastro de Consorciados › Dados do CIMOP' },
  };
  TELAS.integracao = async (c) => {
    if (!N.eAdminSistema()) { rc(c, cabecalho('Acesso não permitido'), el('p', null, 'Só o administrador do sistema cuida da integração com o site.')); return; }
    rc(c, cabecalho('Integração com o site', 'Carregando…'));
    let dados;
    try { dados = await D.integracao(); } catch (e) { rc(c, cabecalho('Integração com o site'), el('p', { class: 'msg msg-falta' }, e.message)); return; }
    const quando = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';
    const cartao = (it) => {
      const def = ITENS_SITE[it.item]; if (!def) return null;
      const erros = dados.erros.filter((e) => e.item === it.item);
      const r = it.ultimo_resultado || {};
      const enviar = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Enviar tudo agora');
      enviar.addEventListener('click', async () => { ocupado(enviar, 'Enviando…'); try { const x = await D.integracaoEnviarTudo(it.item); toast(x.enviados + ' registro(s) enviados' + (x.erros ? ', ' + x.erros + ' com erro.' : '.'), !!x.erros); estado.cad = null; N.rotear(); } catch (e) { toast(e.message, true); ocupado(enviar); } });
      const desligar = el('button', { type: 'button', class: 'btn btn-texto btn-p' }, 'Desligar');
      desligar.addEventListener('click', async () => {
        if (!(await confirmar('Desligar a integração', 'Desligar "' + def.nome + '"? Nada é apagado: o que já está no site continua lá e volta a ser editável no Portal. Daqui para frente, cada sistema cadastra o seu.', 'Desligar', true))) return;
        try { await D.integracaoDesligar(it.item); estado.cad = null; toast('Integração desligada.'); N.rotear(); } catch (e) { toast(e.message, true); }
      });
      return el('section', { class: 'cartao cartao-integracao' + (it.ativo ? ' ligada' : '') },
        el('div', { class: 'cabecalho-secao' }, el('h2', null, def.nome), it.ativo ? el('span', { class: 'etiqueta etiqueta-ativo' }, 'Integrado') : el('span', { class: 'etiqueta etiqueta-inativo' }, 'Não integrado')),
        el('p', null, def.vai),
        it.ativo ? el('p', { class: 'ajuda' }, 'No Portal, este item fica só para consulta. Altere em ' + def.tela + '.') : el('p', { class: 'ajuda' }, 'Desligado: o Portal e a Gestão cadastram cada um o seu, sem ligação.'),
        it.ativo ? el('dl', { class: 'dados' }, el('dt', null, 'Ligado em'), el('dd', null, quando(it.ativado_em) + (it.ativado_por_nome ? ' por ' + it.ativado_por_nome : '')),
          el('dt', null, 'Último envio completo'), el('dd', null, quando(it.ultimo_envio) + (it.ultimo_envio ? ' · ' + (r.enviados || 0) + ' registro(s)' : ''))) : null,
        erros.length ? el('div', { class: 'msg msg-erro' }, el('strong', null, erros.length + (erros.length === 1 ? ' registro não foi' : ' registros não foram') + ' para o site:'),
          el('ul', null, erros.map((e) => el('li', null, el('strong', null, e.nome || '—'), ': ', e.mensagem)))) : null,
        el('div', { class: 'botoes-linha' }, it.ativo ? [enviar, el('a', { class: 'btn btn-claro btn-p', href: def.onde }, 'Abrir o cadastro'), desligar]
          : el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => conferirELigar(it.item) }, 'Ligar integração…')));
    };
    rc(c, cabecalho('Integração com o site', 'Escolha o que a Gestão de Consórcio controla no site do CIMOP (Portal SOFT+ GOV).'),
      el('p', { class: 'msg msg-info' }, 'O que estiver integrado é cadastrado só aqui e vai para o site na hora, já publicado; no Portal, fica só para consulta. A autoavaliação do PNTP continua avaliando normalmente, porque os dados chegam às mesmas páginas do site.'),
      dados.itens.map(cartao));
  };

  async function conferirELigar(item) {
    const def = ITENS_SITE[item];
    let r;
    try { r = await D.integracaoConferir(item); } catch (e) { toast(e.message, true); return; }
    const semPar = el('select', null, el('option', { value: 'trazer' }, 'Trazer para a Gestão (nada se perde)'), el('option', { value: 'apagar' }, 'Apagar do site'));
    let corpo;
    if (item === 'identidade') {
      const rot = { nome_exibicao: 'Nome exibido', endereco: 'Endereço', cep: 'CEP', telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', horario: 'Horário', brasao_url: 'Logotipo' };
      corpo = el('div', null, el('p', null, 'Os campos vazios na Gestão são preenchidos com o que já está no site. Depois, o que está na Gestão vai para o site.'),
        tabela(['Campo', 'No site hoje', 'Na Gestão'], Object.entries(rot).map(([k, t]) => el('tr', null, el('td', null, t),
          el('td', null, k === 'brasao_url' ? (r.site[k] ? 'tem' : '—') : r.site[k] || '—'), el('td', null, k === 'brasao_url' ? (r.gestao[k] ? 'tem' : '—') : r.gestao[k] || el('span', { class: 'falta-leve' }, 'vem do site'))))));
    } else {
      const site = r.site || [], comPar = site.filter((x) => x.par), sem = site.filter((x) => !x.par);
      corpo = el('div', null,
        el('p', null, def.vai),
        el('p', null, el('strong', null, site.length), ' registro(s) já no site · ', el('strong', null, comPar.length), ' com par na Gestão · ', el('strong', null, r.gestao), item === 'entes' ? ' consorciado(s) na Gestão' : ' pessoa(s) marcada(s) para o site'),
        item === 'entes' && r.a_definir ? el('p', { class: 'msg msg-falta' }, r.a_definir + ' ente(s) estão com a situação no consórcio "a definir" e não vão para o site. Marque os consorciados na ficha de cada ente (aba Situação e leis).') : null,
        site.length ? tabela(['No site', 'Par na Gestão'], site.map((x) => el('tr', null, el('td', null, x.nome + (x.uf ? '/' + x.uf : '') + (x.cargo ? ' · ' + x.cargo : '')),
          el('td', null, x.par ? x.par.nome : el('span', { class: 'falta-leve' }, 'sem par'))))) : el('p', { class: 'vazio' }, 'O site ainda não tem registros deste item.'),
        sem.length ? campo('int-sempar', 'O que fazer com os ' + sem.length + ' sem par', semPar, 'Trazer: cria o registro na Gestão, igual ao do site. Apagar: tira do site (o que tiver contrato ligado fica).') : null);
    }
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Ligar e enviar');
    const d = abrirDialogo('Ligar: ' + def.nome, corpo, [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      ocupado(btn, 'Ligando…');
      try {
        const x = await D.integracaoLigar(item, semPar.value);
        d.close(); estado.cad = null; estado.base = null;
        toast('Integração ligada: ' + (x.enviados || 0) + ' enviado(s)' + (x.trazidos ? ', ' + x.trazidos + ' trazido(s) do site' : '') + (x.erros ? ', ' + x.erros + ' com erro.' : '.'), !!x.erros);
        N.rotear();
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }

  // Para os outros módulos: escolher quem assina, achar o ente, montar o timbre.
  window.CADASTRO = { pendencias, gestorAtual: (id, f) => (cad() ? gestorAtual(id, f) : null), contatosDe: (id) => (cad() ? contatosDe(id) : []),
    signatarios: () => (cad() ? cad().pessoas.filter((p) => p.ativo && p.assina_documentos) : []), timbreDoEnte, linkWhats, cpfMascarado, url, VINCULO, SITUACAO };
})();
