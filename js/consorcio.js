/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio
   Módulo CONSÓRCIO — o próprio consórcio: dados, brasão e timbre, pessoas,
   normas e modelos de documentos, documentos (constitutivos, contratos, atas, orçamento)
   e a integração com o site (Portal SOFT+ GOV).
   Usa o núcleo (window.NUCLEO) e as peças do Cadastro (window.CADASTRO._h).
   Tabelas: configuracoes, pessoas, normas, documentos, integracao (scripts 11, 12 e 14).
   ===================================================================== */
(function () {
  'use strict';
  const N = window.NUCLEO;
  const { el, rc, estado, D, O, toast, marcarErro, campo, txt, area, sel, abrirDialogo, confirmar, abas, cabecalho,
    ocupado, formatarTelefone, mascaraTelefone, telefoneValido, normalizar, TELAS } = N;
  const H = window.CADASTRO._h;
  const { tabela, campoArquivo, enviar, linkArquivo, cpfValido, campoCpf, formatarCep, soNum, contatoWhats, integrado, erroSite, dataBR, previaTimbre } = H;

  const cad = () => estado.cad;
  const cf = () => (cad() && cad().config) || {};
  const url = (c) => D.urlCadastro(c);
  const SG = () => N.sigla();
  const pode = () => ['administrador', 'operador'].includes(N.perfilEm('consorcio')) || N.eAdminSistema();
  const eAdm = () => N.perfilEm('consorcio') === 'administrador' || N.eAdminSistema();
  const moeda = (v) => (v == null || v === '' ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
  async function depoisDeSalvar(textoOk) {
    await N.recarregarCadastro(); estado.base = null; estado.irp = null; estado.ident = null;
    N.aplicarIdentidade();
    if (textoOk) toast(textoOk);
    N.rotear();
  }
  function semScript(c, titulo) {
    rc(c, cabecalho(titulo || 'Consórcio'), el('p', { class: 'msg msg-falta' }, 'Rode o script 14 na Supabase para ativar o módulo Consórcio.'));
  }
  const falta14 = () => !cad() || cad().semScript14;

  const CARGOS = ['Presidente', 'Vice-Presidente', 'Diretor Executivo', 'Secretário Executivo', 'Agente de Contratação', 'Pregoeiro', 'Membro da Comissão de Contratação',
    'Fiscal de Contrato', 'Gestor de Contrato', 'Assessor Jurídico', 'Controlador Interno', 'Contador'];

  // ================================================================= DADOS DO CONSÓRCIO
  // Identidade do próprio consórcio: vale para todos os módulos e documentos. Com "Dados do consórcio" integrado, vai para o site.
  TELAS.cimop = () => { location.replace('#consorcio'); };
  TELAS.consorcio = (c) => {
    if (!cad()) { semScript(c, 'Dados do consórcio'); return; }
    const k = cf();
    const f = { nome: txt(k.orgao_nome, { maxlength: 200 }), sigla: txt(k.sigla, { maxlength: 20 }),
      cnpj: txt(k.cnpj ? O.formatarCnpj(k.cnpj) : '', { inputmode: 'numeric', maxlength: 18 }), cidade: txt(k.cidade_uf, { maxlength: 80, placeholder: 'Cidade/UF' }),
      endereco: txt(k.endereco, { maxlength: 200 }), cep: txt(k.cep, { inputmode: 'numeric', maxlength: 9 }),
      telefone: mascaraTelefone(txt(k.telefone, { maxlength: 15, inputmode: 'tel' })), whatsapp: mascaraTelefone(txt(k.whatsapp, { maxlength: 15, inputmode: 'tel' })),
      email: txt(k.email_institucional, { type: 'email', maxlength: 120 }), horario: txt(k.horario, { maxlength: 160, placeholder: 'Segunda a sexta, das 8h às 14h' }),
      site: txt(k.site_url, { type: 'url', maxlength: 200, placeholder: 'https://…' }),
      instagram: txt(k.instagram, { type: 'url', maxlength: 200, placeholder: 'https://instagram.com/…' }), facebook: txt(k.facebook, { type: 'url', maxlength: 200, placeholder: 'https://facebook.com/…' }),
      youtube: txt(k.youtube, { type: 'url', maxlength: 200, placeholder: 'https://youtube.com/…' }) };
    f.cnpj.addEventListener('input', () => { const n = soNum(f.cnpj.value).slice(0, 14); f.cnpj.value = n.length === 14 ? O.formatarCnpj(n) : n; });
    f.cep.addEventListener('input', () => { f.cep.value = formatarCep(f.cep.value); });
    if (!pode()) Object.values(f).forEach((i) => { i.disabled = true; });
    const urlOk = (i) => !i.value.trim() || /^https?:\/\/\S+\.\S+/.test(i.value.trim());
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.nome, f.nome.value.trim() ? '' : 'Informe o nome.')) return;
      if (!marcarErro(f.sigla, f.sigla.value.trim() ? '' : 'Informe a sigla.')) return;
      if (!marcarErro(f.cnpj, !f.cnpj.value || soNum(f.cnpj.value).length === 14 ? '' : 'CNPJ com 14 números.')) return;
      if (!marcarErro(f.cidade, f.cidade.value.trim() ? '' : 'Informe a cidade da sede (sai no local da data dos documentos).')) return;
      if (!marcarErro(f.email, f.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim()) ? 'E-mail inválido.' : '')) return;
      if (!marcarErro(f.telefone, telefoneValido(f.telefone.value) ? '' : 'Telefone incompleto.')) return;
      if (!marcarErro(f.whatsapp, telefoneValido(f.whatsapp.value) ? '' : 'WhatsApp incompleto.')) return;
      for (const r of ['site', 'instagram', 'facebook', 'youtube']) if (!marcarErro(f[r], urlOk(f[r]) ? '' : 'Use o endereço completo, começando por https://')) return;
      ocupado(btn, 'Salvando…');
      try {
        await D.salvarConfig({ orgao_nome: f.nome.value.trim(), sigla: f.sigla.value.trim().toUpperCase(), cnpj: soNum(f.cnpj.value) || null, cidade_uf: f.cidade.value.trim(),
          endereco: f.endereco.value.trim() || null, cep: f.cep.value || null, telefone: f.telefone.value || null, whatsapp: f.whatsapp.value || null,
          email_institucional: f.email.value.trim().toLowerCase() || null, horario: f.horario.value.trim() || null, site_url: f.site.value.trim() || null,
          instagram: f.instagram.value.trim() || null, facebook: f.facebook.value.trim() || null, youtube: f.youtube.value.trim() || null });
        await depoisDeSalvar(integrado('identidade') ? 'Dados do consórcio salvos e enviados ao site.' : 'Dados do consórcio salvos.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
    const ERRO_ID = '00000000-0000-0000-0000-000000000001';
    rc(c, cabecalho('Dados do consórcio', 'Identidade do próprio consórcio. Vale para todos os módulos: ofícios, edital e formulário da IRP, relatórios, e-mails e telas públicas' + (integrado('identidade') ? ', e também para o site.' : '.')),
      integrado('identidade') ? el('p', { class: 'msg msg-info' }, 'Integração com o site ligada: nome exibido, sigla, endereço, CEP, telefone, WhatsApp, e-mail, horário, redes sociais e logotipo do site vêm daqui. Cores e banners continuam na Aparência do Portal.') : null,
      erroSite('identidade', ERRO_ID) ? el('p', { class: 'msg msg-erro' }, 'Não foi para o site: ' + erroSite('identidade', ERRO_ID).mensagem) : null,
      el('section', { class: 'cartao' }, el('h2', null, 'Identificação'),
        campo('dc-nome', 'Nome do consórcio', f.nome, 'Sai nos documentos e é o nome exibido no site.', true),
        el('div', { class: 'grade-campos' }, campo('dc-sigla', 'Sigla', f.sigla, 'Ex.: no número do ofício (OFÍCIO Nº 105/2026 – ' + (k.sigla || 'SIGLA') + ').', true), campo('dc-cnpj', 'CNPJ', f.cnpj),
          campo('dc-cidade', 'Sede (cidade/UF)', f.cidade, 'Local da data nos documentos.', true))),
      el('section', { class: 'cartao' }, el('h2', null, 'Endereço e atendimento'),
        el('div', { class: 'grade-campos' }, campo('dc-end', 'Endereço da sede', f.endereco), campo('dc-cep', 'CEP', f.cep)),
        el('div', { class: 'grade-campos' }, campo('dc-tel', 'Telefone', f.telefone), campo('dc-whats', 'WhatsApp', f.whatsapp), campo('dc-email', 'E-mail institucional', f.email)),
        el('div', { class: 'grade-campos' }, campo('dc-hor', 'Horário de atendimento', f.horario), campo('dc-site', 'Site oficial', f.site))),
      el('section', { class: 'cartao' }, el('h2', null, 'Redes sociais'),
        el('div', { class: 'grade-campos' }, campo('dc-insta', 'Instagram', f.instagram), campo('dc-face', 'Facebook', f.facebook), campo('dc-yt', 'YouTube', f.youtube))),
      el('p', { class: 'ajuda' }, 'O logotipo e o papel timbrado ficam em ', el('a', { class: 'link', href: '#timbre' }, 'Brasão e timbre'), '.'),
      pode() ? el('div', { class: 'barra-salvar' }, btn) : el('p', { class: 'ajuda' }, 'Só quem é administrador ou operador do módulo Consórcio altera estes dados.'));
  };

  // ================================================================= BRASÃO E TIMBRE
  // Como o consórcio sai nos documentos. Mesma regra do timbre dos entes: sem imagem, o sistema monta um padrão com os textos.
  const enteDoConsorcio = (k) => {
    const [mun, uf] = String(k.cidade_uf || '').split('/');
    return { nome: [k.orgao_nome, k.sigla ? '– ' + k.sigla : ''].filter(Boolean).join(' '), cnpj: k.cnpj, brasao_url: k.logo_url, timbre_cabecalho_url: k.timbre_cabecalho_url,
      timbre_rodape_url: k.timbre_rodape_url, endereco: k.endereco, cep: k.cep, municipio: mun, uf, telefone: k.telefone, whatsapp: k.whatsapp, email: k.email_institucional, site: k.site_url };
  };
  TELAS.timbre = (c) => {
    if (!cad()) { semScript(c, 'Brasão e timbre'); return; }
    const k = cf();
    const peca = (chave, titulo, ajuda) => {
      const entrada = campoArquivo('imagem'); entrada.id = 'tc-' + chave; entrada.disabled = !pode();
      const bTirar = el('button', { type: 'button', class: 'btn btn-texto btn-p' }, 'Remover');
      entrada.addEventListener('change', async () => {
        const a = entrada.files[0]; if (!a) return;
        try { const caminho = await enviar(a, 'consorcio', 'imagem'); const antigo = k[chave]; await D.salvarConfig({ [chave]: caminho }); if (antigo) D.apagarArquivoCadastro(antigo).catch(() => {}); await depoisDeSalvar('Imagem salva.'); }
        catch (e) { toast(e.message, true); }
      });
      bTirar.addEventListener('click', async () => {
        if (!(await confirmar('Remover imagem', 'Remover "' + titulo + '"? ' + (chave === 'logo_url' ? 'Os documentos e telas saem sem logotipo.' : 'Os documentos passam a sair com o padrão montado com os textos.'), 'Remover', true))) return;
        try { const antigo = k[chave]; await D.salvarConfig({ [chave]: null }); if (antigo) D.apagarArquivoCadastro(antigo).catch(() => {}); await depoisDeSalvar('Imagem removida.'); } catch (e) { toast(e.message, true); }
      });
      return el('div', { class: 'cartao-timbre' }, el('h3', null, titulo), el('p', { class: 'ajuda' }, ajuda),
        k[chave] ? el('img', { class: 'timbre-imagem' + (chave === 'logo_url' ? ' timbre-brasao' : ''), src: url(k[chave]), alt: titulo }) : el('p', { class: 'vazio' }, 'Sem imagem.'),
        pode() ? el('div', { class: 'botoes-linha' }, el('label', { class: 'btn btn-claro btn-p botao-arquivo' }, k[chave] ? 'Trocar imagem' : 'Enviar imagem', entrada), k[chave] ? bTirar : null) : null);
    };
    const modelo = el('input', { type: 'checkbox', checked: !!k.usar_timbre_modelo, disabled: !pode() });
    modelo.addEventListener('change', async () => {
      try { await D.salvarConfig({ usar_timbre_modelo: modelo.checked }); await depoisDeSalvar(modelo.checked ? 'Os documentos em Word usam o timbre do modelo.' : 'Os documentos em Word usam o timbre do consórcio (imagens ou padrão).'); }
      catch (e) { toast(e.message, true); modelo.checked = !modelo.checked; }
    });
    rc(c, cabecalho('Brasão e timbre', 'Logotipo e papel timbrado do consórcio, usados nos ofícios, no edital da IRP, nos relatórios e nas telas públicas.'),
      el('section', { class: 'cartao' }, peca('logo_url', 'Logotipo (brasão)', 'PNG com fundo transparente, até 5 MB. Vai para a tela principal, os relatórios em PDF, as telas públicas' + (integrado('identidade') ? ' e o site' : '') + '.')),
      el('section', { class: 'cartao' }, el('h2', null, 'Papel timbrado'),
        el('div', { class: 'grade grade-2' },
          peca('timbre_cabecalho_url', 'Cabeçalho do timbre', 'A faixa de cima do papel timbrado (largura da folha). Sem ela, sai o cabeçalho padrão com o logotipo, o nome e o CNPJ.'),
          peca('timbre_rodape_url', 'Rodapé do timbre', 'A faixa de baixo. Sem ela, sai o rodapé padrão com endereço e contatos.')),
        el('label', { class: 'checkbox mt-1' }, modelo, ' Nos documentos em Word, usar o timbre que já está nos modelos (ofício e edital da IRP)'),
        el('p', { class: 'ajuda' }, 'Marque só se os modelos em Word deste sistema já forem os do seu consórcio. Desmarcado, entram as imagens acima ou o padrão.')),
      el('section', { class: 'cartao' }, el('h2', null, 'Como sai nos documentos'),
        k.usar_timbre_modelo ? el('p', { class: 'msg msg-info' }, 'Word: timbre do modelo. PDF e telas: o logotipo acima.') : null, previaTimbre(enteDoConsorcio(k))));
  };

  // ================================================================= PESSOAS DO CONSÓRCIO
  TELAS.pessoas = (c) => {
    if (!cad()) { semScript(c, 'Pessoas do consórcio'); return; }
    const lista = cad().pessoas.slice().sort((a, b) => (b.ativo - a.ativo) || (CARGOS.indexOf(a.cargo) + 1 || 99) - (CARGOS.indexOf(b.cargo) + 1 || 99) || a.nome.localeCompare(b.nome, 'pt-BR'));
    rc(c, cabecalho('Pessoas do consórcio', 'Quem é do próprio consórcio. Qualquer módulo pode ligar estas pessoas aos seus registros: quem assina o edital da IRP, o Presidente dos ofícios das adesões, fiscais e responsáveis.',
      pode() ? el('button', { type: 'button', class: 'btn btn-primario', onclick: () => formPessoa({}) }, '+ Nova pessoa') : null),
    integrado('pessoas') ? el('p', { class: 'msg msg-info' }, 'Integração com o site ligada: as pessoas marcadas com "Mostrar no site" aparecem na página de gestores do site do ' + SG() + ', e lá elas só são alteradas por aqui.') : null,
    lista.length ? tabela(['Nome', 'Cargo', 'Ato de nomeação', 'Período', 'Contato', 'Assina', 'No site', ''], lista.map((p) => el('tr', { class: p.ativo ? null : 'lin-inativa' },
      el('td', null, el('strong', null, p.nome), p.cpf ? el('span', { class: 'sub-linha' }, 'CPF ' + window.CADASTRO.cpfMascarado(p.cpf)) : null, p.ativo ? null : el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Inativo')),
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
    const ehOutro = p.cargo && !CARGOS.includes(p.cargo);
    const f = { nome: txt(p.nome, { maxlength: 120 }), cpf: campoCpf(p.cpf),
      cargo: sel([['', 'Escolha…'], ...CARGOS.map((x) => [x, x]), ['_outro', 'Outro…']], ehOutro ? '_outro' : p.cargo || ''),
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
    const d = abrirDialogo(p.id ? 'Editar pessoa' : 'Nova pessoa do consórcio', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fp-nome', 'Nome completo', f.nome, null, true), campo('fp-cpf', 'CPF', f.cpf, 'Aparece mascarado.')),
      el('div', { class: 'grade-campos' }, campo('fp-cargo', 'Cargo ou função', f.cargo, null, true), caixaOutro),
      el('div', { class: 'secao-form' }, el('h3', null, 'Ato de nomeação ou eleição'),
        el('div', { class: 'grade-campos' }, campo('fp-ato', 'Ato', f.atoNum), campo('fp-atodata', 'Data do ato', f.atoData)),
        campo('fp-atoarq', p.ato_url ? 'Trocar o PDF do ato' : 'PDF do ato', f.atoArq, 'Opcional. Até 20 MB.'),
        el('div', { class: 'grade-campos' }, campo('fp-ini', 'Início no cargo', f.inicio), campo('fp-fim', 'Fim no cargo', f.fim))),
      el('div', { class: 'grade-campos' }, campo('fp-email', 'E-mail', f.email), campo('fp-whats', 'WhatsApp', f.whatsapp)),
      el('label', { class: 'checkbox' }, f.assina, ' Pode assinar documentos do sistema (edital da IRP, ofícios)'),
      el('label', { class: 'checkbox' }, f.ativo, ' Ativo (desmarque quando sair do cargo; o registro fica no histórico)'),
      el('div', { class: 'secao-form' }, el('h3', null, 'No site do ' + SG()),
        el('label', { class: 'checkbox' }, f.site, ' Mostrar no site (página de gestores e "Quem é quem")'),
        integrado('pessoas') ? null : el('p', { class: 'ajuda' }, 'A integração de Pessoas com o site está desligada: a marcação fica guardada e vale quando ela for ligada em Consórcio › Integração com o site.'),
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

  // ================================================================= NORMAS E MODELOS
  const TIPO_NORMA = { resolucao: 'Resolução', portaria: 'Portaria', decreto: 'Decreto', lei: 'Lei', estatuto: 'Estatuto', regimento: 'Regimento interno', outro: 'Outra' };
  const PAPEL = { srp: 'Regulamento do SRP', srp_alteracao: 'Altera o regulamento do SRP' };
  TELAS.normas = (c) => {
    if (falta14()) { semScript(c, 'Normas e modelos'); return; }
    const lista = cad().normas.slice().sort((a, b) => (b.vigente - a.vigente) || String(b.data || '').localeCompare(String(a.data || '')) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
    const caixa = abas([
      ['normas', 'Normas do consórcio', () => [
        el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, 'Resoluções, portarias e demais normas do consórcio. A que estiver marcada como "Regulamento do SRP" é citada nos ofícios, no edital e no formulário da IRP.'),
          pode() ? el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => formNorma({}) }, '+ Nova norma') : null),
        lista.length ? tabela(['Norma', 'Tipo', 'Data', 'Uso nos documentos', 'PDF', ''], lista.map((n) => el('tr', { class: n.vigente ? null : 'lin-inativa' },
          el('td', null, el('strong', null, n.titulo), n.ementa ? el('span', { class: 'sub-linha' }, n.ementa) : null, n.vigente ? null : el('span', { class: 'etiqueta etiqueta-inativo ml-1' }, 'Revogada')),
          el('td', null, TIPO_NORMA[n.tipo] || n.tipo), el('td', null, dataBR(n.data) || '—'),
          el('td', null, n.papel ? el('span', { class: 'etiqueta etiqueta-azul' }, PAPEL[n.papel]) : '—'),
          el('td', null, linkArquivo(n.arquivo_url)),
          el('td', { class: 'acoes' }, pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formNorma(n) }, 'Editar') : null,
            eAdm() && !n.papel ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluir('normas', n, n.titulo) }, 'Excluir') : null))))
          : el('p', { class: 'vazio' }, 'Nenhuma norma cadastrada.')]],
      ['edital', 'Modelo do edital da IRP', () => editorModelo('edital')],
      ['declaracoes', 'Declarações do formulário da IRP', () => editorModelo('declaracoes')],
    ]);
    rc(c, cabecalho('Normas e modelos', 'As normas do consórcio e os textos-modelo dos documentos gerados pelo sistema.'), caixa);
  };
  function formNorma(n) {
    const f = { tipo: sel(Object.entries(TIPO_NORMA), n.tipo || 'resolucao'), titulo: txt(n.titulo, { maxlength: 200, placeholder: 'Resolução ' + (cf().sigla || '') + ' nº 001/2026' }),
      numero: txt(n.numero, { maxlength: 30, placeholder: '001/2026' }), data: el('input', { type: 'date', value: n.data || '' }), ementa: area(n.ementa, { rows: 2, maxlength: 800 }),
      papel: sel([['', 'Nenhum'], ['srp', PAPEL.srp], ['srp_alteracao', PAPEL.srp_alteracao]], n.papel || ''), vigente: el('input', { type: 'checkbox', checked: n.id ? n.vigente !== false : true }),
      arquivo: campoArquivo('pdf') };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(n.id ? 'Editar norma' : 'Nova norma', el('div', null,
      el('div', { class: 'grade-campos' }, campo('fn-tipo', 'Tipo', f.tipo, null, true), campo('fn-num', 'Número', f.numero), campo('fn-data', 'Data', f.data)),
      campo('fn-tit', 'Como é citada nos documentos', f.titulo, 'Ex.: "Resolução ' + (cf().sigla || 'XXX') + ' nº 018/2023". Sai assim nos ofícios e no edital.', true),
      campo('fn-ementa', 'Ementa', f.ementa),
      campo('fn-papel', 'Uso nos documentos do sistema', f.papel, 'Só uma norma pode ser o regulamento do SRP e só uma a que o altera.'),
      campo('fn-arq', n.arquivo_url ? 'Trocar o PDF' : 'PDF da norma', f.arquivo, n.arquivo_url ? 'Já tem PDF.' : 'Opcional. Até 20 MB.'),
      el('label', { class: 'checkbox' }, f.vigente, ' Vigente (desmarque se foi revogada)')),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn]);
    btn.addEventListener('click', async () => {
      if (!marcarErro(f.titulo, f.titulo.value.trim().length >= 3 ? '' : 'Informe como a norma é citada.')) return;
      if (!marcarErro(f.papel, f.papel.value && !f.vigente.checked ? 'Uma norma revogada não pode ser usada nos documentos.' : '')) return;
      ocupado(btn, 'Salvando…');
      try {
        // o papel passa para esta norma: tira da que tinha
        const antiga = f.papel.value && cad().normas.find((x) => x.papel === f.papel.value && x.id !== n.id);
        if (antiga) await D.salvar('normas', { id: antiga.id, papel: null });
        let arquivo_url = n.arquivo_url || null;
        if (f.arquivo.files[0]) { arquivo_url = await enviar(f.arquivo.files[0], 'normas', 'pdf'); if (n.arquivo_url) D.apagarArquivoCadastro(n.arquivo_url).catch(() => {}); }
        await D.salvar('normas', { ...(n.id ? { id: n.id } : {}), tipo: f.tipo.value, titulo: f.titulo.value.trim(), numero: f.numero.value.trim() || null, data: f.data.value || null,
          ementa: f.ementa.value.trim() || null, papel: f.papel.value || null, vigente: f.vigente.checked, arquivo_url });
        d.close(); await depoisDeSalvar('Norma salva.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }
  // Textos-modelo da IRP (vazio = texto padrão do sistema)
  function editorModelo(qual) {
    const DOC = window.IRP_DOCS;
    if (!DOC) return el('p', { class: 'msg msg-falta' }, 'Atualize a página para carregar os modelos.');
    const chave = qual === 'edital' ? 'modelo_irp_edital' : 'modelo_irp_declaracoes';
    const padrao = qual === 'edital' ? DOC.MODELO_EDITAL : DOC.MODELO_DECLARACOES;
    const atual = cf()[chave];
    const t = area(atual || padrao, { rows: qual === 'edital' ? 26 : 10, class: 'texto-modelo', spellcheck: 'true', disabled: !pode() });
    const campos = qual === 'edital' ? DOC.CAMPOS_EDITAL : { SIGLA: 'sigla do consórcio', NORMA: 'regulamento do SRP (Normas)', DFD: '"nº 12/2026, " quando o órgão informa o DFD' };
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar o modelo');
    btn.addEventListener('click', async () => {
      const v = t.value.trim();
      if (qual === 'edital' && !/\{ITENS\}/.test(v)) { marcarErro(t, 'Deixe {ITENS} sozinho numa linha, onde entra a tabela dos itens.'); return; }
      marcarErro(t, '');
      ocupado(btn, 'Salvando…');
      try { await D.salvarConfig({ [chave]: v === padrao.trim() ? null : v }); await depoisDeSalvar('Modelo salvo. Vale para os próximos documentos.'); } catch (e) { toast(e.message, true); ocupado(btn); }
    });
    const bPadrao = el('button', { type: 'button', class: 'btn btn-claro' }, 'Voltar ao texto padrão');
    bPadrao.addEventListener('click', async () => {
      if (!(await confirmar('Texto padrão', 'Trocar o texto pelo modelo padrão do sistema? O que foi alterado aqui se perde.', 'Trocar'))) return;
      try { await D.salvarConfig({ [chave]: null }); await depoisDeSalvar('Modelo padrão restaurado.'); } catch (e) { toast(e.message, true); }
    });
    return [
      el('p', { class: 'ajuda' }, qual === 'edital'
        ? 'Texto do edital da IRP em Word. O título (IRP nº e processo), o local e a data e a assinatura entram sozinhos. Separe os parágrafos com uma linha em branco; comece com "# " os títulos das seções e com "- " as alíneas com recuo.'
        : 'Itens da seção "5. Declarações" do Formulário Padrão em PDF, um por linha.'),
      atual ? el('p', { class: 'msg msg-info' }, 'Este consórcio usa um texto próprio.') : el('p', { class: 'msg msg-ok' }, 'Usando o texto padrão do sistema (aprovado em 19/11/2026).'),
      campo('mod-' + qual, 'Texto', t),
      el('details', { class: 'campos-modelo' }, el('summary', null, 'Campos que o sistema preenche'),
        el('dl', { class: 'dados' }, Object.entries(campos).flatMap(([k, v]) => [el('dt', null, '{' + k + '}'), el('dd', null, v)]))),
      pode() ? el('div', { class: 'barra-salvar' }, bPadrao, btn) : null];
  }

  // ================================================================= DOCUMENTOS DO CONSÓRCIO
  const TIPO_DOC = { protocolo_intencoes: 'Protocolo de intenções', contrato_consorcio: 'Contrato de consórcio público', estatuto: 'Estatuto', alteracao_estatutaria: 'Alteração estatutária',
    contrato_rateio: 'Contrato de rateio', contrato_programa: 'Contrato de programa', ata_eleicao: 'Ata de eleição dos dirigentes', ata_assembleia: 'Ata da assembleia geral',
    orcamento: 'Orçamento do consórcio', outros: 'Outro documento' };
  const GRUPOS = [
    ['constitutivos', 'Constitutivos', ['protocolo_intencoes', 'contrato_consorcio', 'estatuto', 'alteracao_estatutaria', 'outros']],
    ['rateio', 'Contratos de rateio', ['contrato_rateio']],
    ['programa', 'Contratos de programa', ['contrato_programa']],
    ['atas', 'Dirigentes e atas', ['ata_eleicao', 'ata_assembleia']],
    ['orcamento', 'Orçamento', ['orcamento']],
  ];
  const precisaEnte = (t) => t === 'contrato_rateio' || t === 'contrato_programa';
  const precisaExercicio = (t) => t === 'contrato_rateio' || t === 'orcamento';
  const temValor = (t) => ['contrato_rateio', 'contrato_programa', 'orcamento'].includes(t);
  const temVigencia = (t) => t === 'contrato_rateio' || t === 'contrato_programa';
  TELAS.documentos = (c, grupo) => {
    if (falta14()) { semScript(c, 'Documentos do consórcio'); return; }
    const docs = cad().documentos;
    const nome = (id) => (cad().orgaos.find((o) => o.id === id) || {}).nome || '—';
    const aba = (g) => () => {
      const [, , tipos] = GRUPOS.find((x) => x[0] === g);
      const ls = docs.filter((d) => tipos.includes(d.tipo)).sort((a, b) => String(b.data).localeCompare(String(a.data)) || (b.exercicio || 0) - (a.exercicio || 0));
      return [
        el('div', { class: 'cabecalho-secao' }, el('p', { class: 'ajuda' }, {
          constitutivos: 'Protocolo de intenções, contrato de consórcio público, estatuto (versão vigente) e as alterações aprovadas pela assembleia geral.',
          rateio: 'Um contrato de rateio por ente e exercício, com o valor e a vigência.', programa: 'Contratos de programa firmados com os entes.',
          atas: 'A ata da eleição dos atuais dirigentes e as atas da assembleia geral (a mais recente com até 1 ano, mais os 3 anos anteriores).',
          orcamento: 'O orçamento de cada exercício (estimativa da receita e fixação da despesa). Publique o do ano atual e mantenha os 3 anteriores.' }[g]),
          pode() ? el('button', { type: 'button', class: 'btn btn-primario btn-p', onclick: () => formDocumento({ tipo: tipos[0] }, tipos) }, '+ Incluir') : null),
        ls.length ? tabela(['Documento', 'Data', precisaEnte(tipos[0]) ? 'Ente' : 'Exercício', temValor(tipos[0]) ? 'Valor' : 'Número', 'PDF', 'No site', ''], ls.map((d) => el('tr', null,
          el('td', null, el('strong', null, d.titulo), el('span', { class: 'sub-linha' }, [d.titulo !== TIPO_DOC[d.tipo] ? TIPO_DOC[d.tipo] : null, d.numero ? 'nº ' + d.numero : null, d.descricao].filter(Boolean).join(' · ') || null)),
          el('td', null, dataBR(d.data)), el('td', null, precisaEnte(tipos[0]) ? nome(d.orgao_id) + (d.exercicio ? ' · ' + d.exercicio : '') : d.exercicio || '—'),
          el('td', null, temValor(tipos[0]) ? moeda(d.valor) : d.numero || '—'), el('td', null, linkArquivo(d.arquivo_url)),
          el('td', null, d.mostrar_site ? el('span', { class: 'etiqueta etiqueta-azul' }, integrado('documentos') ? 'Sim' : 'Marcado') : '—',
            erroSite('documentos', d.id) ? el('span', { class: 'sub-linha erro-texto' }, 'Erro: ' + erroSite('documentos', d.id).mensagem) : null),
          el('td', { class: 'acoes' }, pode() ? el('button', { type: 'button', class: 'btn btn-claro btn-p', onclick: () => formDocumento(d, tipos) }, 'Editar') : null,
            eAdm() ? el('button', { type: 'button', class: 'btn btn-texto btn-p', onclick: () => excluir('documentos', d, d.titulo) }, 'Excluir') : null))))
          : el('p', { class: 'vazio' }, 'Nenhum documento.')];
    };
    rc(c, cabecalho('Documentos do consórcio', 'Os documentos que o consórcio público precisa manter e publicar (PNTP 2026, matriz dos Consórcios Públicos).'),
      integrado('documentos') ? el('p', { class: 'msg msg-info' }, 'Integração com o site ligada: os documentos marcados com "Mostrar no site" vão para a página "Consórcio público" do site, já publicados, e lá só são alterados por aqui.')
        : el('p', { class: 'ajuda' }, 'A integração dos documentos com o site está desligada. Ligue em ', el('a', { class: 'link', href: '#site' }, 'Integração com o site'), ' quando quiser que vão para lá.'),
      abas(GRUPOS.map(([id, rot]) => [id, rot + ' (' + docs.filter((d) => GRUPOS.find((x) => x[0] === id)[2].includes(d.tipo)).length + ')', aba(id)]), grupo));
  };
  function formDocumento(r, tipos) {
    const entes = cad().orgaos.filter((o) => o.vinculo === 'consorciado' || o.id === r.orgao_id).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const f = { tipo: sel(tipos.map((t) => [t, TIPO_DOC[t]]), r.tipo || tipos[0]), titulo: txt(r.titulo, { maxlength: 300 }), numero: txt(r.numero, { maxlength: 40, placeholder: '01/2026' }),
      data: el('input', { type: 'date', value: r.data || N.hoje() }), exercicio: el('input', { type: 'number', min: 1990, max: 2100, value: r.exercicio || '' }),
      ente: sel([['', 'Nenhum (vale para o consórcio)'], ...entes.map((o) => [o.id, o.nome + (o.uf ? '/' + o.uf : '')])], r.orgao_id || ''),
      valor: el('input', { type: 'number', min: 0, step: '0.01', value: r.valor ?? '' }), vIni: el('input', { type: 'date', value: r.vigencia_inicio || '' }), vFim: el('input', { type: 'date', value: r.vigencia_fim || '' }),
      descricao: area(r.descricao, { rows: 2, maxlength: 4000, placeholder: 'Ex.: aprovado na assembleia geral de 20/03/2026' }), arquivo: campoArquivo('pdf'),
      site: el('input', { type: 'checkbox', checked: r.id ? !!r.mostrar_site : true }) };
    const cEx = campo('fd-ex', 'Exercício', f.exercicio), cEnte = campo('fd-ente', 'Ente consorciado', f.ente), cValor = campo('fd-valor', 'Valor (R$)', f.valor);
    const cVig = el('div', { class: 'grade-campos' }, campo('fd-vi', 'Vigência: início', f.vIni), campo('fd-vf', 'Vigência: fim', f.vFim));
    const ajustar = () => { const t = f.tipo.value; cEx.hidden = !(precisaExercicio(t) || t === 'outros'); cEnte.hidden = !(precisaEnte(t) || tipos.includes('estatuto')); cValor.hidden = !temValor(t); cVig.hidden = !temVigencia(t); };
    f.tipo.addEventListener('change', ajustar); ajustar();
    const btn = el('button', { type: 'button', class: 'btn btn-primario' }, 'Salvar');
    const d = abrirDialogo(r.id ? 'Editar documento' : 'Incluir documento', el('div', null,
      el('div', { class: 'grade-campos' }, tipos.length > 1 ? campo('fd-tipo', 'Tipo', f.tipo, null, true) : null, campo('fd-num', 'Número (opcional)', f.numero), campo('fd-data', 'Data (assinatura ou aprovação)', f.data, null, true)),
      el('div', { class: 'grade-campos' }, cEx, cEnte), el('div', { class: 'grade-campos' }, cValor), cVig,
      campo('fd-tit', 'Título', f.titulo, 'Em branco: o sistema monta (tipo, exercício e ente).'),
      campo('fd-desc', 'Observação (opcional)', f.descricao),
      campo('fd-arq', r.arquivo_url ? 'Trocar o PDF' : 'PDF', f.arquivo, r.arquivo_url ? 'Já tem PDF.' : 'Obrigatório. Até 20 MB.', !r.arquivo_url),
      el('label', { class: 'checkbox' }, f.site, ' Mostrar no site do ' + SG() + (integrado('documentos') ? '' : ' (vale quando a integração for ligada)'))),
    [el('button', { type: 'button', class: 'btn btn-claro', onclick: () => d.close() }, 'Cancelar'), btn], true);
    btn.addEventListener('click', async () => {
      const t = f.tipo.value;
      if (!marcarErro(f.data, f.data.value ? '' : 'Informe a data.')) return;
      if (!marcarErro(f.exercicio, precisaExercicio(t) && !f.exercicio.value ? 'Informe o exercício.' : '')) return;
      if (!marcarErro(f.ente, precisaEnte(t) && !f.ente.value ? 'Escolha o ente.' : '')) return;
      if (!marcarErro(f.vFim, f.vIni.value && f.vFim.value && f.vFim.value < f.vIni.value ? 'O fim é antes do início.' : '')) return;
      if (!marcarErro(f.arquivo, !r.arquivo_url && !f.arquivo.files[0] ? 'Anexe o PDF.' : '')) return;
      const ente = f.ente.value && !cEnte.hidden ? f.ente.value : null;
      const exercicio = f.exercicio.value && !cEx.hidden ? Number(f.exercicio.value) : null;
      const titulo = f.titulo.value.trim() || TIPO_DOC[t] + (exercicio ? ' ' + exercicio : '') + (ente ? ' — ' + (cad().orgaos.find((o) => o.id === ente) || {}).nome : '');
      ocupado(btn, 'Salvando…');
      try {
        let arquivo_url = r.arquivo_url || null;
        if (f.arquivo.files[0]) { arquivo_url = await enviar(f.arquivo.files[0], 'documentos', 'pdf'); if (r.arquivo_url) D.apagarArquivoCadastro(r.arquivo_url).catch(() => {}); }
        await D.salvar('documentos', { ...(r.id ? { id: r.id } : {}), tipo: t, titulo, numero: f.numero.value.trim() || null, data: f.data.value, exercicio, orgao_id: ente,
          valor: !cValor.hidden && f.valor.value !== '' ? Number(f.valor.value) : null, vigencia_inicio: !cVig.hidden ? f.vIni.value || null : null, vigencia_fim: !cVig.hidden ? f.vFim.value || null : null,
          descricao: f.descricao.value.trim() || null, arquivo_url, mostrar_site: f.site.checked });
        d.close(); await depoisDeSalvar(integrado('documentos') && f.site.checked ? 'Documento salvo e enviado ao site.' : 'Documento salvo.');
      } catch (e) { toast(e.message, true); ocupado(btn); }
    });
  }
  async function excluir(tabelaNome, r, nome) {
    if (!(await confirmar('Excluir', 'Excluir "' + nome + '"?' + (tabelaNome === 'documentos' && r.portal_documento_id ? ' Ele também sai do site.' : '') + ' Esta ação não pode ser desfeita.', 'Excluir', true))) return;
    try { await D.excluir(tabelaNome, r.id); if (r.arquivo_url) D.apagarArquivoCadastro(r.arquivo_url).catch(() => {}); await depoisDeSalvar('Excluído.'); } catch (e) { toast(e.message, true); }
  }

  // ================================================================= INTEGRAÇÃO COM O SITE
  const ITENS_SITE = {
    identidade: { nome: 'Dados do consórcio', vai: 'Nome exibido, sigla, endereço, CEP, telefone, WhatsApp, e-mail, horário, redes sociais e logotipo vão para a Aparência do site. Cores e banners continuam no Portal.', onde: '#consorcio', tela: 'Consórcio › Dados do consórcio' },
    pessoas: { nome: 'Pessoas do consórcio (gestores)', vai: 'As pessoas marcadas com "Mostrar no site" vão para os gestores do site (nome, cargo, contato, unidade, foto, currículo e destaque na capa).', onde: '#pessoas', tela: 'Consórcio › Pessoas do consórcio' },
    documentos: { nome: 'Documentos do consórcio', vai: 'Protocolo de intenções, contrato de consórcio, estatuto e alterações, contratos de rateio e de programa, atas e orçamento marcados com "Mostrar no site" vão para a página "Consórcio público" do site.', onde: '#documentos', tela: 'Consórcio › Documentos do consórcio' },
    entes: { nome: 'Entes consorciados', vai: 'Os entes marcados como consorciados (com a lei de ratificação, ingresso e saída) vão para a página "Entes consorciados" do site. Ex-membros continuam lá, com a data de saída.', onde: '#entes', tela: 'Cadastro de Consorciados › Entes' },
  };
  TELAS.integracao = () => { location.replace('#site'); };
  TELAS.site = async (c) => {
    if (!eAdm()) { rc(c, cabecalho('Integração com o site'), el('p', { class: 'msg msg-falta' }, 'Só o administrador do módulo Consórcio cuida da integração com o site.')); return; }
    rc(c, cabecalho('Integração com o site', 'Carregando…'));
    let dados, orgaos = [];
    try { [dados, orgaos] = await Promise.all([D.integracao(), D.siteOrgaos().catch(() => [])]); }
    catch (e) { rc(c, cabecalho('Integração com o site'), el('p', { class: 'msg msg-falta' }, e.message)); return; }
    const atual = orgaos.find((o) => o.atual);
    const algumaLigada = dados.itens.some((i) => i.ativo);
    const quando = (d) => (d ? new Date(d).toLocaleString('pt-BR') : '—');
    // Qual órgão do Portal é este consórcio
    const escolha = sel([['', 'Nenhum (sem site)'], ...orgaos.map((o) => [o.id, o.nome + (o.sigla ? ' (' + o.sigla + ')' : '') + (o.cnpj ? ' · CNPJ ' + O.formatarCnpj(o.cnpj) : '')])], atual ? atual.id : '');
    escolha.disabled = algumaLigada;
    const bEscolha = el('button', { type: 'button', class: 'btn btn-claro btn-p', disabled: algumaLigada }, 'Salvar');
    bEscolha.addEventListener('click', async () => {
      if (!(await confirmar('Órgão do Portal', escolha.value ? 'Ligar este consórcio a "' + escolha.selectedOptions[0].textContent + '" no Portal?' : 'Tirar a ligação com o Portal?', 'Confirmar'))) return;
      ocupado(bEscolha, 'Salvando…');
      try { await D.siteDefinirPortal(escolha.value || null); toast('Órgão do Portal salvo.'); estado.cad = null; N.rotear(); } catch (e) { toast(e.message, true); ocupado(bEscolha); }
    });
    const cartaoPortal = el('section', { class: 'cartao' }, el('h2', null, 'Site do consórcio no Portal SOFT+ GOV'),
      orgaos.length ? el('div', { class: 'linha-escolha' }, campo('st-org', 'Órgão do Portal', escolha, algumaLigada ? 'Para trocar, desligue antes todas as integrações.' : 'Só aparecem os órgãos do tipo consórcio cadastrados no Portal.'), bEscolha)
        : el('p', { class: 'msg msg-falta' }, 'Nenhum órgão do tipo consórcio encontrado no Portal. Peça ao Suporte SOFT+ para cadastrar o site do consórcio.'));
    const cartao = (it) => {
      const def = ITENS_SITE[it.item]; if (!def) return null;
      const erros = dados.erros.filter((e) => e.item === it.item);
      const r = it.ultimo_resultado || {};
      const enviarTudo = el('button', { type: 'button', class: 'btn btn-claro btn-p' }, 'Enviar tudo agora');
      enviarTudo.addEventListener('click', async () => { ocupado(enviarTudo, 'Enviando…'); try { const x = await D.integracaoEnviarTudo(it.item); toast(x.enviados + ' registro(s) enviados' + (x.erros ? ', ' + x.erros + ' com erro.' : '.'), !!x.erros); estado.cad = null; N.rotear(); } catch (e) { toast(e.message, true); ocupado(enviarTudo); } });
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
        el('div', { class: 'botoes-linha' }, it.ativo ? [enviarTudo, el('a', { class: 'btn btn-claro btn-p', href: def.onde }, 'Abrir o cadastro'), desligar]
          : el('button', { type: 'button', class: 'btn btn-primario btn-p', disabled: !atual, onclick: () => conferirELigar(it.item) }, 'Ligar integração…')));
    };
    const ordem = Object.keys(ITENS_SITE);
    rc(c, cabecalho('Integração com o site', 'Escolha o que a Gestão de Consórcio controla no site do ' + SG() + ' (Portal SOFT+ GOV).'),
      el('p', { class: 'msg msg-info' }, 'O que estiver integrado é cadastrado só aqui e vai para o site na hora, já publicado; no Portal, fica só para consulta. A autoavaliação do PNTP continua avaliando normalmente, porque os dados chegam às mesmas páginas do site.'),
      cartaoPortal,
      atual ? null : el('p', { class: 'msg msg-falta' }, 'Escolha o órgão do Portal acima para poder ligar as integrações.'),
      dados.itens.slice().sort((a, b) => ordem.indexOf(a.item) - ordem.indexOf(b.item)).map(cartao));
  };

  async function conferirELigar(item) {
    const def = ITENS_SITE[item];
    let r;
    try { r = await D.integracaoConferir(item); } catch (e) { toast(e.message, true); return; }
    const semPar = el('select', null, el('option', { value: 'trazer' }, 'Trazer para a Gestão (nada se perde)'), el('option', { value: 'apagar' }, 'Apagar do site'));
    let corpo;
    if (item === 'identidade') {
      const rot = { nome_exibicao: 'Nome exibido', endereco: 'Endereço', cep: 'CEP', telefone: 'Telefone', whatsapp: 'WhatsApp', email: 'E-mail', horario: 'Horário',
        instagram: 'Instagram', facebook: 'Facebook', youtube: 'YouTube', brasao_url: 'Logotipo' };
      corpo = el('div', null, el('p', null, 'Os campos vazios na Gestão são preenchidos com o que já está no site. Depois, o que está na Gestão vai para o site.'),
        tabela(['Campo', 'No site hoje', 'Na Gestão'], Object.entries(rot).map(([k, t]) => el('tr', null, el('td', null, t),
          el('td', null, k === 'brasao_url' ? (r.site[k] ? 'tem' : '—') : r.site[k] || '—'), el('td', null, k === 'brasao_url' ? (r.gestao[k] ? 'tem' : '—') : r.gestao[k] || el('span', { class: 'falta-leve' }, 'vem do site'))))));
    } else {
      const site = r.site || [], comPar = site.filter((x) => x.par), sem = site.filter((x) => !x.par);
      const rotGestao = { entes: ' consorciado(s) na Gestão', pessoas: ' pessoa(s) marcada(s) para o site', documentos: ' documento(s) marcado(s) para o site' }[item];
      corpo = el('div', null,
        el('p', null, def.vai),
        el('p', null, el('strong', null, site.length), ' registro(s) já no site · ', el('strong', null, comPar.length), ' com par na Gestão · ', el('strong', null, r.gestao), rotGestao),
        item === 'entes' && r.a_definir ? el('p', { class: 'msg msg-falta' }, r.a_definir + ' ente(s) estão com a situação no consórcio "a definir" e não vão para o site. Marque os consorciados na ficha de cada ente (aba Situação e leis).') : null,
        item === 'documentos' ? el('p', { class: 'ajuda' }, 'Contratos de rateio e de programa só são trazidos se o ente já estiver ligado (integração dos entes).') : null,
        site.length ? tabela(['No site', 'Par na Gestão'], site.map((x) => el('tr', null, el('td', null, x.nome + (x.uf ? '/' + x.uf : '') + (x.cargo ? ' · ' + x.cargo : '') + (x.tipo ? ' · ' + (TIPO_DOC[x.tipo] || x.tipo) : '')),
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

  // Pendências do módulo na tela principal
  N.PENDENCIAS.consorcio = () => {
    const k = cad(); if (!k) return null;
    const itens = [];
    const pres = k.pessoas.some((p) => p.ativo && p.cargo === 'Presidente');
    if (!pres) itens.push([1, 'Presidente ativo não cadastrado', '#pessoas']);
    if (!k.semScript14 && !k.normas.some((n) => n.papel === 'srp')) itens.push([1, 'regulamento do SRP não indicado', '#normas']);
    const erros = (k.errosSite || []).length;
    if (erros) itens.push([erros, erros === 1 ? 'registro não foi para o site' : 'registros não foram para o site', '#site']);
    const ligadas = (k.integracao || []).filter((i) => i.ativo).length;
    return { resumo: (k.documentos || []).length + ' documento(s) · ' + ligadas + ' integração(ões) com o site', itens };
  };

  window.CONSORCIO = { enteDoConsorcio, TIPO_DOC };
})();
