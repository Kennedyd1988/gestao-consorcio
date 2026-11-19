/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio — documentos da IRP
   - Edital em Word (estilos do edital IRP nº 002/2026: js/modelo-irp.js; timbre do consórcio: js/timbre-word.js;
     texto editável em Consórcio › Normas e modelos)
   - Formulário Padrão em PDF, com o timbre do PRÓPRIO ente (imagem enviada ou padrão em texto)
   - Relatório de consolidação em PDF e mapa consolidado em Excel
   Textos padrão aprovados em 19/11/2026.
   ===================================================================== */
(function () {
  'use strict';
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const extenso = (d) => (d ? `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}` : '');
  const dataBR = (d) => (d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '');
  const hojeISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const num = (v) => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  const cnpjF = (c) => { const n = String(c || '').replace(/\D/g, ''); return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c || ''; };
  const numeroIrp = (i) => String(i.numero).padStart(3, '0') + '/' + i.ano;
  const VINCULO = { consorciado: 'Consorciado', nao_consorciado: 'Não consorciado', cooperado: 'Cooperado', referendado: 'Referendado' };

  // ================================================================ EDITAL (Word)
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const FONTE = '<w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>';
  const run = (t, o = {}) => `<w:r><w:rPr>${FONTE}${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/>' : ''}<w:sz w:val="${o.sz || 24}"/><w:szCs w:val="${o.sz || 24}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const par = (partes, o = {}) => {
    const conteudo = (Array.isArray(partes) ? partes : [partes]).map((p) => (typeof p === 'string' ? run(p, o) : run(p.t, Object.assign({}, o, p)))).join('');
    const ind = o.recuo ? `<w:ind w:left="${o.recuo}"/>` : '';
    return `<w:p><w:pPr><w:spacing w:before="${o.antes || 0}" w:after="${o.depois == null ? 120 : o.depois}" w:line="276" w:lineRule="auto"/>${ind}<w:jc w:val="${o.jc || 'both'}"/></w:pPr>${conteudo}</w:p>`;
  };
  const titulo = (t) => par({ t, b: true }, { antes: 240, depois: 120, jc: 'left' });
  function tabelaWord(cab, linhas, larg) {
    const borda = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('');
    const cel = (t, w, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:jc w:val="${o.jc || 'center'}"/></w:pPr>${run(t, { b: o.b, sz: 20 })}</w:p></w:tc>`;
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${larg.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${borda}</w:tblBorders>` +
      `<w:tblCellMar><w:left w:w="70" w:type="dxa"/><w:right w:w="70" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${larg.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    x += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cab.map((c, i) => cel(c, larg[i], { b: true, fundo: 'E7EEF6' })).join('')}</w:tr>`;
    for (const l of linhas) x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((c, i) => cel(c, larg[i], { jc: i === 1 ? 'both' : 'center' })).join('')}</w:tr>`;
    return x + '</w:tbl>';
  }

  // ---------------------------------------------------------------- MODELO DO EDITAL (editável em Consórcio › Normas e modelos)
  // Uma linha em branco separa os parágrafos. "# " = título de seção; "- " = alínea com recuo; {ITENS} = tabela dos itens.
  // Campos: {CONSORCIO} {SIGLA} {CNPJ} {SEDE} {NORMA} {NORMA_ALTERACAO} {OBJETO} {CONTRATACAO} {DOCUMENTO} {PRAZO_FIM} {DIAS_UTEIS} {LINK} {CONTATO}
  // O título (IRP nº, processo), o local e a data e a assinatura entram sozinhos.
  const MODELO_EDITAL = `O {CONSORCIO}, inscrito no CNPJ sob o nº {CNPJ}, com sede {SEDE}, na condição de Órgão Gerenciador, torna público aos órgãos e entidades da Administração Pública que realizará Procedimento Público de Intenção de Registro de Preços (IRP), com fundamento no art. 86 da Lei nº 14.133, de 1º de abril de 2021, e nos arts. 4º, 5º e 8º da {NORMA}{NORMA_ALTERACAO}, para levantar e consolidar as demandas da futura {CONTRATACAO} pelo Sistema de Registro de Preços, nas condições a seguir.

# 1. DO OBJETO

1.1. Constitui objeto desta IRP o levantamento das demandas e dos quantitativos estimados dos órgãos e entidades interessados em integrar, como órgãos participantes, a futura Ata de Registro de Preços para {OBJETO}, conforme especificações a serem detalhadas no Termo de Referência, em conformidade com o Estudo Técnico Preliminar (ETP).

1.2. A IRP tem natureza preparatória e não gera obrigação de contratar. Destina-se a definir a estimativa total de quantidades da contratação e a subsidiar a elaboração do Termo de Referência e do {DOCUMENTO}.

1.3. Este procedimento é dirigido exclusivamente aos órgãos e entidades da Administração Pública. As empresas interessadas em participar da futura licitação deverão aguardar a publicação do respectivo edital.

# 2. DOS PARTICIPANTES

2.1. Podem manifestar interesse, sem limite de número, os órgãos e entidades dos entes da Federação consorciados, não consorciados, cooperados e referendados, nos termos do art. 2º, inciso X, da {NORMA}.

2.2. Os entes consorciados cujas demandas e quantitativos estimados já estejam contemplados no ETP elaborado pelo {SIGLA} participam da Ata de Registro de Preços independentemente de manifestação nesta IRP (art. 8º, § 3º, da {NORMA}). Recomenda-se, ainda assim, que confirmem ou ajustem seus quantitativos pelo formulário.

# 3. DO PRAZO

3.1. As manifestações poderão ser apresentadas até as 23h59 do dia {PRAZO_FIM}, prazo não inferior a {DIAS_UTEIS} dias úteis, contados a partir do primeiro dia útil subsequente à divulgação desta IRP no sítio oficial do {SIGLA} (art. 8º, caput e § 1º, da {NORMA}).

3.2. O prazo poderá ser prorrogado pelo {SIGLA}, mediante justificativa, com divulgação pelos mesmos meios.

3.3. Encerrado o prazo, o formulário eletrônico deixa de receber manifestações, ressalvado o disposto no item 5.4.

# 4. DA MANIFESTAÇÃO DE INTERESSE

4.1. A manifestação será feita pelo Formulário Padrão de IRP, preenchido no endereço {LINK}, com a indicação:

- a) dos itens de interesse, dentre os relacionados no item 6;

- b) da estimativa de consumo de cada item, na unidade de medida indicada; e

- c) do(s) local(is) de entrega ou de execução.

4.2. Concluído o preenchimento, o sistema gera o Formulário Padrão em PDF, já preenchido, que deverá ser assinado pela autoridade competente do órgão ou entidade e anexado no mesmo endereço, dentro do prazo. A manifestação somente será considerada recebida com o anexo do formulário assinado, e o recebimento será confirmado por número de protocolo.

4.3. O formulário assinado integrará o processo administrativo como manifestação formal do órgão ou entidade.

4.4. Compete ao órgão ou entidade garantir que sua demanda esteja formalizada e aprovada pela autoridade competente (art. 5º, II, da {NORMA}), preferencialmente em Documento de Formalização da Demanda (DFD).

4.5. O órgão ou entidade poderá solicitar, de forma justificada, a inclusão de novos itens, informando a especificação, a estimativa de consumo e o local de entrega (art. 5º, III).

# 5. DA ANÁLISE E DA CONSOLIDAÇÃO

5.1. O {SIGLA}, na condição de Órgão Gerenciador, poderá, de forma motivada, aceitar ou recusar (art. 4º, II, da {NORMA}):

- a) quantitativos considerados ínfimos;

- b) a inclusão de novos itens; e

- c) itens de mesma natureza com modificações em suas especificações.

5.2. O {SIGLA} poderá ajustar, de forma motivada, os quantitativos informados, para atender aos requisitos de padronização e racionalização da contratação (art. 4º, IV), comunicando a cada órgão ou entidade os quantitativos aceitos.

5.3. Encerrada a IRP, o {SIGLA} consolidará as estimativas individuais e a estimativa total de consumo, em relatório juntado ao processo administrativo.

5.4. O órgão ou entidade que não se manifestar no prazo poderá solicitar, de forma motivada, sua inclusão como órgão participante, por expediente formal dirigido ao {SIGLA}, contendo os itens pretendidos, os quantitativos estimados, os locais de entrega ou execução e a declaração de concordância com as especificações e condições do procedimento. A inclusão posterior somente será admitida até o encerramento da fase preparatória, sendo vedada após a publicação do edital da licitação ou do aviso de contratação direta (art. 8º, §§ 4º a 7º).

# 6. DOS ITENS

6.1. Os órgãos e entidades interessados poderão manifestar interesse nos seguintes itens:

{ITENS}

# 7. DISPOSIÇÕES FINAIS

7.1. Os quantitativos informados são estimativos e poderão ser consolidados, ajustados ou redefinidos após a conclusão da IRP.

7.2. Os órgãos participantes integrarão a Ata de Registro de Preços e celebrarão diretamente seus contratos, nos termos do edital da licitação, podendo o {SIGLA} emitir atas individualizadas por órgão participante, mantida a unicidade do processo administrativo (art. 4º, § 5º, e art. 9º-A).

7.3. Antes de iniciar licitação própria para objeto semelhante, os órgãos e entidades devem consultar as IRPs em andamento e deliberar sobre a conveniência de sua participação (art. 9º).

7.4. Dúvidas e pedidos de esclarecimento poderão ser encaminhados ao {SIGLA} {CONTATO}.`;

  // Declarações do Formulário Padrão (uma por linha). Campos: {SIGLA} {NORMA} {DFD}
  const MODELO_DECLARACOES = [
    '5.1. conhece e adere ao Estudo Técnico Preliminar (ETP) elaborado pelo {SIGLA} para este objeto, que atende às suas necessidades e serve de base técnica para a futura contratação;',
    '5.2. os quantitativos informados foram estimados com base em seu planejamento e estão formalizados em Documento de Formalização da Demanda {DFD}aprovado pela autoridade competente (art. 5º, II, da {NORMA});',
    '5.3. autoriza o {SIGLA}, na condição de Órgão Gerenciador, a incluir esta manifestação na consolidação da IRP e a aceitar, ajustar ou recusar, de forma motivada, os quantitativos e itens informados (art. 4º, II e IV);',
    '5.4. tem ciência de que esta manifestação não gera obrigação de contratar e de que, formada a Ata de Registro de Preços, celebrará diretamente seus contratos, nos termos do edital (art. 9º-A);',
    '5.5. assume as obrigações de órgão participante previstas no art. 5º da {NORMA}, inclusive a de prestar informações sobre suas contratações, e reconhece a competência do Órgão Gerenciador para aplicar, garantidos o contraditório e a ampla defesa, as penalidades decorrentes do descumprimento do pactuado na Ata em relação à sua demanda registrada (art. 4º, XV); e',
    '5.6. as informações prestadas neste formulário são verdadeiras.',
  ].join('\n');
  const CAMPOS_EDITAL = {
    CONSORCIO: 'nome e sigla do consórcio, em maiúsculas', SIGLA: 'sigla do consórcio', CNPJ: 'CNPJ do consórcio', SEDE: 'endereço da sede, com "na" ou "em" na frente',
    NORMA: 'regulamento do SRP (Normas)', NORMA_ALTERACAO: '", com as alterações da …" quando houver norma que altera', OBJETO: 'objeto da IRP',
    CONTRATACAO: '"licitação" ou "contratação direta"', DOCUMENTO: '"edital da licitação" ou "aviso de contratação direta"', PRAZO_FIM: 'data final das manifestações',
    DIAS_UTEIS: '"8 (oito)" ou "3 (três)"', LINK: 'endereço do formulário', CONTATO: 'e-mail e sede para dúvidas', ITENS: 'tabela dos itens (sozinho na linha)',
  };
  const preencher = (t, v) => String(t || '').replace(/\{([A-Z_]+)\}/g, (m, k) => (v[k] != null ? v[k] : m));
  function camposDoEdital(d) {
    const { irp } = d; const c = d.cimop || {};
    const sigla = c.sigla || 'Consórcio';
    const end = c.endereco ? c.endereco + (c.cidade_uf && !c.endereco.includes(c.cidade_uf) ? ', ' + c.cidade_uf : '') + (c.cep && !c.endereco.includes(c.cep) ? ', CEP ' + c.cep : '') : '';
    const sede = end || c.cidade_uf || '';
    const prep = end && /^(rua|pra[çc]a|avenida|av\.|travessa|rodovia|estrada|alameda|vila)(\s|$)/i.test(end) ? 'na ' : 'em ';
    return {
      CONSORCIO: [(c.orgao_nome || '').toUpperCase(), sigla.toUpperCase()].filter(Boolean).join(' – '), SIGLA: sigla, CNPJ: cnpjF(c.cnpj) || '___', SEDE: sede ? prep + sede : '___',
      NORMA: c.resolucao_srp || 'regulamento do Sistema de Registro de Preços do consórcio', NORMA_ALTERACAO: c.resolucao_alteracao ? ', com as alterações da ' + c.resolucao_alteracao : '',
      OBJETO: String(irp.objeto || '').replace(/[.\s]+$/, ''), CONTRATACAO: irp.contratacao_direta ? 'contratação direta' : 'licitação',
      DOCUMENTO: irp.contratacao_direta ? 'aviso de contratação direta' : 'edital da licitação', PRAZO_FIM: dataBR(irp.prazo_fim) || '___/___/______',
      DIAS_UTEIS: irp.contratacao_direta ? '3 (três)' : '8 (oito)', LINK: d.link || '___',
      CONTATO: [c.email_institucional ? 'pelo e-mail ' + c.email_institucional : null, end ? 'na sede, ' + end + (c.horario ? ', ' + c.horario : '') : null].filter(Boolean).join(' ou ') || 'pelos canais oficiais do consórcio',
    };
  }
  // Tabela de itens do edital: Lote e Código só entram se algum item tiver
  function tabelaItensWord(itens) {
    const temLote = itens.some((t) => t.lote), temCod = itens.some((t) => t.codigo), temQtd = itens.some((t) => t.qtd_estimada != null && t.qtd_estimada !== '');
    const cab = ['ITEM'], larg = [700];
    if (temLote) { cab.push('LOTE'); larg.push(800); }
    if (temCod) { cab.push('CÓDIGO'); larg.push(1100); }
    cab.push('DESCRIÇÃO TÉCNICA', 'UNIDADE'); larg.push(0, 1200);
    if (temQtd) { cab.push('QTD. ESTIMADA'); larg.push(1200); }
    larg[cab.indexOf('DESCRIÇÃO TÉCNICA')] = 8504 - larg.reduce((s, w) => s + w, 0);
    const linhas = itens.map((t) => {
      const l = [String(t.numero)];
      if (temLote) l.push(t.lote || '');
      if (temCod) l.push(t.codigo || '');
      l.push(t.descricao, t.unidade);
      if (temQtd) l.push(t.qtd_estimada != null && t.qtd_estimada !== '' ? num(t.qtd_estimada) : '');
      return l;
    });
    return tabelaWord(cab, linhas, larg);
  }

  // d = { irp, itens, signatario:{nome,cargo}, cimop: configurações do consórcio, link }
  function corpoEdital(d) {
    const { irp } = d; const c = d.cimop || {};
    const v = camposDoEdital(d);
    let x = '';
    x += par({ t: 'PROCEDIMENTO PÚBLICO DE INTENÇÃO DE REGISTRO DE PREÇOS', b: true }, { jc: 'center', antes: 120, depois: 60 });
    x += par({ t: 'IRP Nº ' + numeroIrp(irp), b: true }, { jc: 'center', depois: 60 });
    x += par('Processo Administrativo nº ' + irp.processo, { jc: 'center', depois: 280 });
    const blocos = String(c.modelo_irp_edital || MODELO_EDITAL).replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
    for (const b of blocos) {
      if (b === '{ITENS}') { x += tabelaItensWord(d.itens); continue; }
      const t = preencher(b.replace(/\n/g, ' '), v);
      if (/^#\s+/.test(t)) x += titulo(t.replace(/^#\s+/, ''));
      else if (/^-\s+/.test(t)) x += par(t.replace(/^-\s+/, ''), { recuo: 567 });
      else x += par(t);
    }
    x += par(`${c.cidade_uf || '________'}, ${extenso(irp.data_documento || irp.data_divulgacao || hojeISO())}.`, { jc: 'right', antes: 360, depois: 720 });
    x += par({ t: (d.signatario.nome || '').toUpperCase(), b: true }, { jc: 'center', depois: 0 });
    const cargo = d.signatario.cargo || '';
    x += par(cargo + (c.sigla && !cargo.toUpperCase().includes(c.sigla.toUpperCase()) ? ' do ' + c.sigla : ''), { jc: 'center' });
    return x;
  }
  async function gerarEdital(d) {
    const M = window.MODELO_IRP;
    if (!M) throw new Error('O modelo do edital não carregou. Atualize a página.');
    if (!window.JSZip) throw new Error('A biblioteca de Word não carregou. Verifique a internet e atualize a página.');
    const zip = new JSZip();
    for (const [p, c] of Object.entries(M.partes)) zip.file(p, c);
    for (const [p, c] of Object.entries(M.binarios)) zip.file(p, c, { base64: true });
    zip.file('word/document.xml', M.docInicio + corpoEdital(d) + M.docFim);
    if (window.TIMBRE_WORD) await window.TIMBRE_WORD.aplicar(zip, d.cimop || {});
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }
  const nomeEdital = (irp) => `IRP ${numeroIrp(irp).replace('/', '-')} - Edital.docx`;

  // ================================================================ PDF: apoio
  async function libsPdf() {
    if (window.RELATORIO && window.RELATORIO.carregarLibs) return window.RELATORIO.carregarLibs();
    throw new Error('A biblioteca de PDF não carregou.');
  }
  // Imagem -> PNG (dataURL) com as medidas, via canvas (aceita PNG, JPG e WEBP)
  async function imagemPng(url) {
    if (!url) return null;
    try {
      const b = await (await fetch(url, { mode: 'cors' })).blob();
      const src = URL.createObjectURL(b);
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(src);
      return { data: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight };
    } catch (e) { return null; }
  }
  const NAVY = [16, 42, 72], TEXTO = [26, 36, 51], SUAVE = [83, 97, 115], LINHA = [205, 214, 224], TOM = [238, 244, 251];

  // ================================================================ FORMULÁRIO PADRÃO (PDF com o timbre do ente)
  // d = { irp, ente:{nome,cnpj,municipio,uf,endereco,bairro,cep,telefone,whatsapp,email,vinculo,brasao,cabecalho,rodape}, f:{responsavel_*, autoridade_*, dfd_numero, local_entrega},
  //       itens:[{numero,descricao,unidade,qtd}], novos:[{descricao,unidade,qtd,justificativa}], protocolo }
  async function gerarFormulario(d) {
    await libsPdf();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 18;
    const e = d.ente;
    const cons = d.cimop || {}; const sig = cons.sigla || '';
    const vDecl = { SIGLA: sig || 'Órgão Gerenciador', NORMA: cons.norma || cons.resolucao_srp || 'regulamento do Sistema de Registro de Preços do consórcio', DFD: d.f.dfd_numero ? 'nº ' + d.f.dfd_numero + ', ' : '' };
    const [cab, rod, bras] = await Promise.all([imagemPng(e.cabecalho), imagemPng(e.rodape), e.cabecalho ? null : imagemPng(e.brasao)]);
    const cidade = [e.municipio, e.uf].filter(Boolean).join('/');
    // Cabeçalho: imagem do timbre ou padrão em texto (nunca sai sem)
    let topo = 12;
    const desenharCabecalho = () => {
      if (cab) {
        const w = W - 2 * M, h = Math.min(32, w * cab.h / cab.w), ww = h * cab.w / cab.h;
        doc.addImage(cab.data, 'PNG', (W - ww) / 2, 8, ww, h); topo = 8 + h + 4; return;
      }
      let x = M;
      if (bras) { const h = 18, w = Math.min(22, h * bras.w / bras.h); doc.addImage(bras.data, 'PNG', M, 8, w, h); x = M + w + 4; }
      const centro = !bras;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...TEXTO);
      const nome = doc.splitTextToSize(String(e.nome || '').toUpperCase(), W - x - M);
      doc.text(nome, centro ? W / 2 : x, 13, centro ? { align: 'center' } : undefined);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SUAVE);
      const linhas = [e.cnpj ? 'CNPJ ' + cnpjF(e.cnpj) : null, cidade || null].filter(Boolean).join(' · ');
      doc.text(linhas, centro ? W / 2 : x, 13 + nome.length * 4.6, centro ? { align: 'center' } : undefined);
      const yLinha = Math.max(bras ? 28 : 0, 13 + nome.length * 4.6 + 4);
      doc.setDrawColor(...TEXTO); doc.setLineWidth(0.5); doc.line(M, yLinha, W - M, yLinha);
      topo = yLinha + 6;
    };
    const desenharRodape = (pag, total) => {
      let y0 = H - 10;
      if (rod) { const w = W - 2 * M, h = Math.min(18, w * rod.h / rod.w), ww = h * rod.w / rod.h; doc.addImage(rod.data, 'PNG', (W - ww) / 2, H - 8 - h - 5, ww, h); y0 = H - 8 - h - 7; }
      else {
        const l1 = [e.endereco, e.bairro, e.cep ? 'CEP ' + e.cep : null, cidade].filter(Boolean).join(' · ');
        const l2 = [e.telefone ? 'Tel. ' + e.telefone : null, e.whatsapp && e.whatsapp !== e.telefone ? 'WhatsApp ' + e.whatsapp : null, e.email].filter(Boolean).join(' · ');
        doc.setDrawColor(...LINHA); doc.setLineWidth(0.3); doc.line(M, H - 22, W - M, H - 22);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...SUAVE);
        doc.text(l1 || String(e.nome || '') + (cidade ? ' · ' + cidade : ''), W / 2, H - 18, { align: 'center' });
        if (l2) doc.text(l2, W / 2, H - 14.5, { align: 'center' });
      }
      doc.setFontSize(6.5); doc.setTextColor(140, 150, 162);
      doc.text(`Formulário gerado pelo sistema Gestão de Consórcio${sig ? ' (' + sig + ')' : ''} em ${new Date().toLocaleString('pt-BR')} · Protocolo ${d.protocolo || '—'} · Assinar e anexar no mesmo endereço até ${dataBR(d.irp.prazo_fim)}.`, W / 2, H - 6, { align: 'center', maxWidth: W - 2 * M });
      doc.text(`${pag}/${total}`, W - M, H - 6, { align: 'right' });
    };
    const limiteY = () => H - (rod ? 34 : 28);
    let y;
    const decoradas = new Set();   // páginas que já têm o cabeçalho
    const cabecalhoUmaVez = () => { const p = doc.internal.getCurrentPageInfo().pageNumber; if (!decoradas.has(p)) { decoradas.add(p); desenharCabecalho(); } };
    const novaPagina = () => { doc.addPage(); cabecalhoUmaVez(); y = topo; };
    const espaco = (h) => { if (y + h > limiteY()) novaPagina(); };
    const texto = (t, o = {}) => {
      doc.setFont('helvetica', o.b ? 'bold' : 'normal'); doc.setFontSize(o.sz || 10); doc.setTextColor(...(o.cor || TEXTO));
      const l = doc.splitTextToSize(t, W - 2 * M - (o.recuo || 0)); const lh = (o.sz || 10) * 0.45;
      espaco(l.length * lh + 1); doc.text(l, M + (o.recuo || 0), y, o.centro ? { align: 'center' } : { align: 'justify', maxWidth: W - 2 * M - (o.recuo || 0) });
      y += l.length * lh + (o.depois == null ? 2 : o.depois);
    };
    const secao = (t) => { espaco(12); y += 2; doc.setFillColor(...TOM); doc.rect(M, y - 4.2, W - 2 * M, 6.2, 'F'); texto(t, { b: true, sz: 10, cor: NAVY, depois: 3 }); };
    const campoLinha = (rot, val) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); const w = doc.getTextWidth(rot + ' ');
      espaco(5); doc.setTextColor(...TEXTO); doc.text(rot, M, y); doc.setFont('helvetica', 'normal');
      const l = doc.splitTextToSize(val || '—', W - 2 * M - w); doc.text(l, M + w, y); y += l.length * 4.3 + 0.8; };

    cabecalhoUmaVez(); y = topo;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...TEXTO);
    doc.text('FORMULÁRIO PADRÃO DE INTENÇÃO DE REGISTRO DE PREÇOS', W / 2, y + 2, { align: 'center' }); y += 7;
    doc.setFontSize(10); doc.text(`IRP Nº ${numeroIrp(d.irp)} – Processo Administrativo nº ${d.irp.processo}`, W / 2, y, { align: 'center' }); y += 6;
    texto('Objeto: ' + d.irp.objeto, { sz: 9.5, depois: 3 });

    secao('1. IDENTIFICAÇÃO DO ÓRGÃO OU ENTIDADE');
    campoLinha('Órgão/Entidade:', e.nome); campoLinha('CNPJ:', cnpjF(e.cnpj));
    campoLinha('Situação em relação ao ' + (sig || 'consórcio') + ':', VINCULO[e.vinculo] || 'A confirmar pelo ' + (sig || 'consórcio'));
    campoLinha('Endereço:', [e.endereco, e.bairro, cidade, e.cep ? 'CEP ' + e.cep : null].filter(Boolean).join(', '));
    campoLinha('Telefone/WhatsApp:', [e.telefone, e.whatsapp && e.whatsapp !== e.telefone ? e.whatsapp : null].filter(Boolean).join(' / '));
    campoLinha('E-mail:', e.email);
    campoLinha('Responsável pelas informações:', [d.f.responsavel_nome, d.f.responsavel_cargo, d.f.responsavel_telefone, d.f.responsavel_email].filter(Boolean).join(' – '));

    secao('2. ITENS E QUANTITATIVOS ESTIMADOS');
    texto('2.1. O órgão ou entidade acima identificado manifesta interesse em participar da IRP em epígrafe, como órgão participante da futura Ata de Registro de Preços, nos itens e quantitativos abaixo, de caráter estimativo:', { sz: 9.5 });
    espaco(20);
    doc.autoTable({ startY: y, margin: { left: M, right: M, top: topo, bottom: H - limiteY() }, theme: 'grid',
      head: [['ITEM', 'DESCRIÇÃO', 'UNIDADE', 'QUANTIDADE ESTIMADA']],
      body: d.itens.map((t) => [t.numero, t.resumo || t.descricao, t.unidade, num(t.qtd)]),
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2, valign: 'middle' },
      headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', halign: 'center' },
      columnStyles: { 0: { halign: 'center', cellWidth: 14 }, 2: { halign: 'center', cellWidth: 24 }, 3: { halign: 'right', cellWidth: 32 } },
      didDrawPage: cabecalhoUmaVez });
    y = doc.lastAutoTable.finalY + 3;
    texto('Total de itens com interesse: ' + d.itens.length + '.', { sz: 9, depois: 3 });

    secao('3. LOCAL DE ENTREGA OU DE EXECUÇÃO');
    texto(d.f.local_entrega, { sz: 9.5 });

    secao('4. INCLUSÃO DE NOVOS ITENS');
    if (d.novos && d.novos.length) {
      espaco(18);
      doc.autoTable({ startY: y, margin: { left: M, right: M, top: topo, bottom: H - limiteY() }, theme: 'grid',
        head: [['DESCRIÇÃO', 'UNIDADE', 'QUANTIDADE', 'JUSTIFICATIVA']], body: d.novos.map((n) => [n.descricao, n.unidade, num(n.qtd), n.justificativa]),
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.8, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2 }, headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold' },
        columnStyles: { 1: { cellWidth: 22 }, 2: { halign: 'right', cellWidth: 26 } }, didDrawPage: cabecalhoUmaVez });
      y = doc.lastAutoTable.finalY + 4;
    } else texto('Não há solicitação de inclusão de novos itens.', { sz: 9.5 });

    secao('5. DECLARAÇÕES');
    texto('O órgão ou entidade declara que:', { sz: 9.5 });
    String(cons.declaracoes || MODELO_DECLARACOES).replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
      .forEach((t) => texto(preencher(t, vDecl), { sz: 9.5, recuo: 4 }));

    espaco(42); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
    doc.text(`${cidade || '______________'}, ____ de ______________ de ${d.irp.ano}.`, W - M, y, { align: 'right' }); y += 22;
    doc.setDrawColor(...TEXTO); doc.setLineWidth(0.3); doc.line(W / 2 - 45, y, W / 2 + 45, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text(String(d.f.autoridade_nome || '').toUpperCase(), W / 2, y, { align: 'center' }); y += 4.6;
    doc.setFont('helvetica', 'normal'); doc.text(d.f.autoridade_cargo || '', W / 2, y, { align: 'center' }); y += 4.6;
    doc.setFontSize(9); doc.setTextColor(...SUAVE); doc.text(e.nome || '', W / 2, y, { align: 'center' });

    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); desenharRodape(i, total); }
    return doc.output('blob');
  }
  const nomeFormulario = (irp, ente) => `IRP ${numeroIrp(irp).replace('/', '-')} - Formulário - ${String(ente.nome || '').replace(/[\\/:*?"<>|]/g, '')}.pdf`;

  // ================================================================ CONSOLIDAÇÃO (PDF, logotipo do consórcio)
  // d = { irp, itens, respostas:[{orgao, origem, protocolo, resultado, situacao, itens:[{item, qtd_informada, qtd_aceita, decisao, motivo, novo_descricao, novo_unidade, justificativa}]}],
  //       semResposta:[orgao], prorrogacoes, signatario, cimop }
  async function gerarConsolidacao(d) {
    await libsPdf();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 15;
    const logo = d.logo ? await imagemPng(d.logo) : null;
    const cabecalho = () => {
      let x = M;
      if (logo) { const h = 12, w = Math.min(20, h * logo.w / logo.h); doc.addImage(logo.data, 'PNG', M, 7, w, h * Math.min(1, 20 / (h * logo.w / logo.h))); x = M + w + 3; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
      doc.text((d.cimop.sigla || 'Consórcio') + ' · Relatório de consolidação da IRP nº ' + numeroIrp(d.irp), x, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUAVE); doc.text('Processo Administrativo nº ' + d.irp.processo, x, 16.5);
      doc.setDrawColor(10, 150, 104); doc.setLineWidth(0.6); doc.line(M, 21, W - M, 21);
    };
    let y = 30;
    const decoradas = new Set();
    const cabecalhoUmaVez = () => { const p = doc.internal.getCurrentPageInfo().pageNumber; if (!decoradas.has(p)) { decoradas.add(p); cabecalho(); } };
    const espaco = (h) => { if (y + h > H - 16) { doc.addPage(); cabecalhoUmaVez(); y = 29; } };
    const titulo = (t) => { espaco(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...NAVY); doc.text(t, M, y); y += 6; };
    const texto = (t, sz) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(sz || 9); doc.setTextColor(...TEXTO); const l = doc.splitTextToSize(t, W - 2 * M); espaco(l.length * 4.1); doc.text(l, M, y); y += l.length * 4.1 + 2; };
    const tabela = (cab, corpo, opc) => {
      espaco(16);
      doc.autoTable(Object.assign({ startY: y, head: [cab], body: corpo, margin: { left: M, right: M, top: 28, bottom: 16 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.6, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2, valign: 'middle' },
        headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold' }, didDrawPage: cabecalhoUmaVez }, opc || {}));
      y = doc.lastAutoTable.finalY + 6;
    };
    cabecalhoUmaVez();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY);
    doc.text('Relatório de Consolidação', M, y + 2); y += 8;
    doc.setFontSize(11); doc.text('Intenção de Registro de Preços nº ' + numeroIrp(d.irp), M, y); y += 7;
    texto('Objeto: ' + d.irp.objeto);
    texto(`Divulgação: ${dataBR(d.irp.data_divulgacao) || '—'} · Prazo para manifestações: até ${dataBR(d.irp.prazo_fim) || '—'}${d.prorrogacoes.length ? ' (prorrogado ' + d.prorrogacoes.length + ' vez' + (d.prorrogacoes.length > 1 ? 'es' : '') + ')' : ''} · Fundamento: art. 86 da Lei nº 14.133/2021 e Resolução nº 018/2023 – CIMOP, alterada pela Resolução nº 001/2026.`);
    if (d.prorrogacoes.length) d.prorrogacoes.forEach((p) => texto(`Prorrogação de ${dataBR(p.prazo_anterior)} para ${dataBR(p.prazo_novo)}: ${p.motivo}`, 8.5));

    const validas = d.respostas.filter((r) => r.situacao === 'analisada' && r.resultado !== 'recusada');
    const conta = (f) => d.respostas.filter(f).length;
    titulo('1. Resumo');
    tabela(['Manifestações', 'Quantidade'], [
      ['Pelo formulário (assinado e anexado)', conta((r) => r.origem === 'formulario')],
      ['Demandas do ETP de entes consorciados (art. 8º, § 3º)', conta((r) => r.origem === 'etp')],
      ['Inclusões posteriores (art. 8º, §§ 4º a 7º)', conta((r) => r.origem === 'inclusao_posterior')],
      ['Aceitas integralmente', conta((r) => r.resultado === 'aceita')], ['Aceitas com ajuste', conta((r) => r.resultado === 'ajustada')], ['Recusadas', conta((r) => r.resultado === 'recusada')],
      ['Órgãos participantes (com quantidade aceita)', new Set(validas.map((r) => r.orgao.id)).size],
    ], { columnStyles: { 1: { halign: 'right', cellWidth: 30 } } });

    titulo('2. Estimativa total consolidada por item');
    tabela(['Item', 'Descrição', 'Unid.', 'Informado', 'Aceito', 'Participantes'], d.itens.map((t) => {
      const ls = d.respostas.flatMap((r) => r.itens.filter((x) => x.item && x.item.id === t.id).map((x) => ({ r, x })));
      const ac = ls.filter(({ r }) => r.situacao === 'analisada');
      return [t.numero, t.descricao, t.unidade, num(ls.reduce((s, { x }) => s + Number(x.qtd_informada || 0), 0)), num(ac.reduce((s, { x }) => s + Number(x.qtd_aceita || 0), 0)),
        new Set(ac.filter(({ x }) => Number(x.qtd_aceita) > 0).map(({ r }) => r.orgao.id)).size];
    }), { columnStyles: { 0: { halign: 'center', cellWidth: 11 }, 2: { cellWidth: 16 }, 3: { halign: 'right', cellWidth: 22 }, 4: { halign: 'right', cellWidth: 22, fontStyle: 'bold' }, 5: { halign: 'center', cellWidth: 22 } } });

    titulo('3. Estimativa individual por órgão participante');
    const linhas = [];
    validas.sort((a, b) => a.orgao.nome.localeCompare(b.orgao.nome, 'pt-BR')).forEach((r) => r.itens.filter((x) => x.item && Number(x.qtd_aceita) > 0).sort((a, b) => a.item.numero - b.item.numero)
      .forEach((x, i) => linhas.push([i === 0 ? r.orgao.nome : '', i === 0 ? (VINCULO[r.orgao.vinculo] || '—') + '\n' + ({ formulario: 'Formulário', etp: 'ETP', inclusao_posterior: 'Inclusão posterior' }[r.origem]) : '', x.item.numero, num(x.qtd_aceita)])));
    tabela(['Órgão ou entidade', 'Vínculo / origem', 'Item', 'Quantidade aceita'], linhas, { columnStyles: { 2: { halign: 'center', cellWidth: 14 }, 3: { halign: 'right', cellWidth: 32 } } });

    const decisoes = d.respostas.flatMap((r) => r.itens.filter((x) => x.decisao === 'ajustado' || x.decisao === 'recusado').map((x) => [r.orgao.nome, x.item ? x.item.numero : 'Novo: ' + x.novo_descricao,
      num(x.qtd_informada), num(x.qtd_aceita), x.decisao === 'ajustado' ? 'Ajustado' : 'Recusado', x.motivo || '']));
    titulo('4. Ajustes e recusas (art. 4º, II e IV)');
    if (decisoes.length) tabela(['Órgão', 'Item', 'Informado', 'Aceito', 'Decisão', 'Motivo'], decisoes, { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } } });
    else texto('Não houve ajuste nem recusa de quantitativos.');

    const novos = d.respostas.flatMap((r) => r.itens.filter((x) => !x.item).map((x) => [r.orgao.nome, x.novo_descricao, x.novo_unidade, num(x.qtd_informada), x.justificativa || '', x.decisao === 'aceito' || x.decisao === 'ajustado' ? 'Aceito' : x.decisao === 'recusado' ? 'Recusado' : 'Pendente']));
    titulo('5. Pedidos de inclusão de novos itens (art. 5º, III)');
    if (novos.length) tabela(['Órgão', 'Item pedido', 'Unid.', 'Qtd.', 'Justificativa', 'Decisão'], novos);
    else texto('Não houve pedido de inclusão de novos itens.');

    titulo('6. Entes consorciados sem manifestação');
    texto(d.semResposta.length ? d.semResposta.map((o) => o.nome).join('; ') + '.' : 'Todos os entes consorciados ativos se manifestaram ou tiveram a demanda do ETP lançada.');

    espaco(40); y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...TEXTO);
    doc.text(`${d.cimop.cidade_uf || '________'}, ${extenso(hojeISO())}.`, W - M, y, { align: 'right' }); y += 22;
    doc.line(W / 2 - 45, y, W / 2 + 45, y); y += 5;
    doc.setFont('helvetica', 'bold'); doc.text(String(d.signatario.nome || '').toUpperCase(), W / 2, y, { align: 'center' }); y += 4.6;
    doc.setFont('helvetica', 'normal'); const cg = d.signatario.cargo || ''; doc.text(cg + (d.cimop.sigla && !cg.toUpperCase().includes(d.cimop.sigla.toUpperCase()) ? ' do ' + d.cimop.sigla : ''), W / 2, y, { align: 'center' });
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); doc.setFontSize(7); doc.setTextColor(...SUAVE); doc.text(`Gerado pelo sistema Gestão de Consórcio em ${new Date().toLocaleString('pt-BR')} · ${i}/${total}`, W / 2, H - 7, { align: 'center' }); }
    return doc.output('blob');
  }

  // ================================================================ PLANILHA DE ITENS (modelo e importação)
  const COLS_ITENS = [
    ['numero', 'Item nº', 8, ['item', 'itemn', 'itemno', 'n', 'no', 'numero', 'itemnumero', 'nitem', 'nodoitem']],
    ['lote', 'Lote/Grupo', 11, ['lote', 'grupo', 'lotegrupo']],
    ['codigo', 'Código CATMAT/CATSER', 18, ['codigo', 'catmat', 'catser', 'codigocatmatcatser', 'catmatcatser', 'codigocatmat', 'codigocatser']],
    ['descricao', 'Descrição técnica', 60, ['descricao', 'descricaotecnica', 'especificacao', 'especificacaotecnica', 'descricaocompleta']],
    ['resumo', 'Especificação resumida', 40, ['especificacaoresumida', 'resumo', 'descricaoresumida', 'resumida']],
    ['unidade', 'Unidade', 12, ['unidade', 'und', 'un', 'unid', 'unidadedemedida', 'unidademedida']],
    ['qtd_estimada', 'Qtd. estimada pelo consórcio', 16, ['qtdestimadapeloconsorcio', 'qtdestimada', 'quantidadeestimada', 'quantidade', 'qtd', 'estimativa']],
  ];
  const UNIDADES_ITENS = ['Unidade', 'Caixa', 'Pacote', 'Kit', 'Litro', 'Quilo', 'Metro', 'Metro quadrado', 'Metro cúbico', 'Tonelada', 'Serviço', 'Hora', 'Diária', 'Mês'];
  const chaveCab = (v) => String(v == null ? '' : v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const numPlan = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const t = String(v).trim().replace(/\s/g, '');
    const n = Number(/,\d+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : NaN;
  };
  // Linha no formato do modelo (também usada no mapa consolidado)
  const linhaModelo = (t) => [t.numero, t.lote || '', t.codigo || '', t.descricao || '', t.resumo || '', t.unidade || '', t.qtd_estimada == null || t.qtd_estimada === '' ? '' : Number(t.qtd_estimada)];

  function modeloItens(itens, sigla) {
    const X = window.XLSX;
    const cab = COLS_ITENS.map((c) => c[1]);
    const corpo = itens && itens.length ? itens.map(linhaModelo) : [
      [1, '1', '', 'Exemplo: cadeira escolar empilhável, estrutura em tubo de aço, assento e encosto em polipropileno, cor azul, conforme norma ABNT NBR 14006.', 'Cadeira escolar empilhável', 'Unidade', 500],
      [2, '1', '', 'Exemplo: mesa escolar individual, tampo em MDF 18 mm com revestimento melamínico, estrutura em aço, conforme norma ABNT NBR 14006.', 'Mesa escolar individual', 'Unidade', ''],
    ];
    const wb = X.utils.book_new();
    const ws = X.utils.aoa_to_sheet([cab, ...corpo]);
    ws['!cols'] = COLS_ITENS.map((c) => ({ wch: c[2] }));
    ws['!autofilter'] = { ref: X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, corpo.length), c: cab.length - 1 } }) };
    X.utils.book_append_sheet(wb, ws, 'Itens');
    const sg = sigla || 'consórcio';
    const inst = [
      ['Como preencher a planilha de itens da IRP'],
      [''],
      ['Preencha a aba "Itens", uma linha por item. Não mude os títulos da primeira linha. Apague as linhas de exemplo.'],
      [''],
      ['Coluna', 'Obrigatória?', 'Como preencher'],
      ['Item nº', 'Sim', 'Número inteiro, sem repetir. Em branco, o sistema numera em sequência.'],
      ['Lote/Grupo', 'Não', 'Lote ou grupo do item na futura licitação (ex.: 1, 2, A).'],
      ['Código CATMAT/CATSER', 'Não', 'Código do item no catálogo do Governo Federal (CATMAT para materiais, CATSER para serviços).'],
      ['Descrição técnica', 'Sim', 'Descrição completa, como deve sair no edital da IRP.'],
      ['Especificação resumida', 'Não', 'Texto curto mostrado aos entes no formulário. Em branco, o formulário mostra a descrição técnica.'],
      ['Unidade', 'Sim', 'Unidade de medida. Em branco, entra "Unidade". Sugestões abaixo.'],
      ['Qtd. estimada pelo consórcio', 'Não', 'Quantidade que o ' + sg + ' já estima, só como referência para os entes. Não conta como manifestação.'],
      [''],
      ['Unidades sugeridas'],
      ...UNIDADES_ITENS.map((u) => [u]),
    ];
    const wi = X.utils.aoa_to_sheet(inst); wi['!cols'] = [{ wch: 30 }, { wch: 14 }, { wch: 100 }];
    X.utils.book_append_sheet(wb, wi, 'Instruções');
    return new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  // Lê a planilha: devolve { linhas:[{numero,lote,codigo,descricao,resumo,unidade,qtd_estimada,_linha}], colunas:[...], aviso }
  async function lerPlanilhaItens(arquivo) {
    const X = window.XLSX;
    const wb = X.read(await arquivo.arrayBuffer());
    const nome = wb.SheetNames.find((n) => chaveCab(n) === 'itens') || wb.SheetNames.find((n) => chaveCab(n) !== 'instrucoes') || wb.SheetNames[0];
    const m = X.utils.sheet_to_json(wb.Sheets[nome], { header: 1, defval: '', raw: true, blankrows: false });
    const iCab = m.findIndex((l) => l.some((v) => chaveCab(v).startsWith('descri') || chaveCab(v).startsWith('especificacaotecnica')));
    if (iCab < 0) throw new Error('Não encontrei a coluna "Descrição técnica". Use a planilha modelo.');
    const mapa = {};
    m[iCab].forEach((v, k) => {
      const ch = chaveCab(v); if (!ch) return;
      const col = COLS_ITENS.find((c) => c[3].includes(ch)) || (ch.startsWith('descri') && !ch.includes('resum') ? COLS_ITENS[3] : null) || (ch.includes('resum') ? COLS_ITENS[4] : null);
      if (col && mapa[col[0]] == null) mapa[col[0]] = k;
    });
    const linhas = [];
    for (let r = iCab + 1; r < m.length; r++) {
      const l = m[r]; const v = (c) => (mapa[c] == null ? '' : l[mapa[c]]);
      if (COLS_ITENS.every((c) => String(v(c[0])).trim() === '')) continue;
      const n = numPlan(v('numero'));
      linhas.push({ _linha: r + 1, numero: n, lote: String(v('lote')).trim(), codigo: String(v('codigo')).trim(), descricao: String(v('descricao')).trim(),
        resumo: String(v('resumo')).trim(), unidade: String(v('unidade')).trim(), qtd_estimada: numPlan(v('qtd_estimada')) });
    }
    return { linhas, colunas: COLS_ITENS.filter((c) => mapa[c[0]] != null).map((c) => c[1]), aba: nome };
  }

  // Confere as linhas: numera as vazias e devolve problemas por linha
  function conferirItens(linhas, existentes) {
    const usados = new Set((existentes || []).map((t) => t.numero));
    let prox = Math.max(0, ...linhas.map((x) => (Number.isInteger(x.numero) && x.numero > 0 ? x.numero : 0)), ...(existentes || []).map((t) => t.numero)) + 1;
    const vistos = new Set();
    return linhas.map((x) => {
      const o = Object.assign({}, x, { problemas: [], avisos: [] });
      if (o.numero == null) { o.numero = prox++; o.avisos.push('Número dado pelo sistema'); }
      if (!Number.isInteger(o.numero) || o.numero <= 0) o.problemas.push('Número inválido');
      else if (vistos.has(o.numero)) o.problemas.push('Número repetido na planilha');
      else if (usados.has(o.numero)) o.problemas.push('Número já cadastrado nesta IRP');
      vistos.add(o.numero);
      if (!o.descricao) o.problemas.push('Sem descrição técnica');
      else if (o.descricao.length > 4000) o.problemas.push('Descrição com mais de 4.000 caracteres');
      if (!o.unidade) { o.unidade = 'Unidade'; o.avisos.push('Unidade vazia: entra "Unidade"'); }
      if (o.qtd_estimada != null && !(o.qtd_estimada >= 0)) o.problemas.push('Quantidade estimada inválida');
      if (o.resumo && o.resumo.length > 500) o.problemas.push('Especificação resumida com mais de 500 caracteres');
      return o;
    });
  }

  // ================================================================ MAPA CONSOLIDADO (Excel)
  function mapaExcel(d) {
    const X = window.XLSX;
    const orgs = [...new Map(d.respostas.map((r) => [r.orgao.id, r.orgao])).values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const valor = (o, t, campo) => d.respostas.filter((r) => r.orgao.id === o.id).flatMap((r) => r.itens.filter((x) => x.item && x.item.id === t.id)).reduce((s, x) => s + Number(x[campo] || 0), 0);
    const linhas = orgs.map((o) => {
      const r = { 'Órgão ou entidade': o.nome, 'CNPJ': cnpjF(o.cnpj), 'Vínculo': VINCULO[o.vinculo] || '' };
      d.itens.forEach((t) => { r['Item ' + t.numero + ' (aceito)'] = valor(o, t, 'qtd_aceita') || null; });
      return r;
    });
    const total = { 'Órgão ou entidade': 'TOTAL', 'CNPJ': '', 'Vínculo': '' };
    d.itens.forEach((t) => { total['Item ' + t.numero + ' (aceito)'] = linhas.reduce((s, l) => s + Number(l['Item ' + t.numero + ' (aceito)'] || 0), 0); });
    linhas.push(total);
    const wb = X.utils.book_new();
    // Itens consolidados: mesma ordem de colunas da planilha modelo, mais os totais
    const somaItem = (t, campo) => d.respostas.flatMap((r) => r.itens.filter((x) => x.item && x.item.id === t.id)).reduce((s, x) => s + Number(x[campo] || 0), 0);
    const entesItem = (t) => new Set(d.respostas.filter((r) => r.itens.some((x) => x.item && x.item.id === t.id && Number(x.qtd_aceita || 0) > 0)).map((r) => r.orgao.id)).size;
    const wsI = X.utils.aoa_to_sheet([[...COLS_ITENS.map((c) => c[1]), 'Qtd. informada', 'Qtd. aceita', 'Entes com quantidade aceita'],
      ...d.itens.map((t) => [...linhaModelo(t), somaItem(t, 'qtd_informada'), somaItem(t, 'qtd_aceita'), entesItem(t)])]);
    wsI['!cols'] = [...COLS_ITENS.map((c) => ({ wch: c[2] })), { wch: 14 }, { wch: 12 }, { wch: 14 }];
    X.utils.book_append_sheet(wb, wsI, 'Itens consolidados');
    const ws = X.utils.json_to_sheet(linhas); ws['!cols'] = [{ wch: 48 }, { wch: 20 }, { wch: 16 }, ...d.itens.map(() => ({ wch: 14 }))];
    X.utils.book_append_sheet(wb, ws, 'Mapa consolidado');
    const man = d.respostas.flatMap((r) => r.itens.map((x) => ({ 'Protocolo': r.protocolo, 'Órgão ou entidade': r.orgao.nome, 'Origem': { formulario: 'Formulário', etp: 'ETP', inclusao_posterior: 'Inclusão posterior' }[r.origem],
      'Situação': r.situacao, 'Item': x.item ? x.item.numero : 'Novo', 'Descrição': x.item ? x.item.descricao : x.novo_descricao, 'Unidade': x.item ? x.item.unidade : x.novo_unidade,
      'Informado': Number(x.qtd_informada), 'Aceito': x.qtd_aceita == null ? null : Number(x.qtd_aceita), 'Decisão': x.decisao, 'Motivo': x.motivo || '', 'Local de entrega': r.local_entrega || '' })));
    const ws2 = X.utils.json_to_sheet(man); ws2['!cols'] = [{ wch: 18 }, { wch: 44 }, { wch: 16 }, { wch: 12 }, { wch: 6 }, { wch: 50 }, { wch: 10 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 40 }, { wch: 40 }];
    X.utils.book_append_sheet(wb, ws2, 'Manifestações');
    return new Blob([X.write(wb, { type: 'array', bookType: 'xlsx' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  window.IRP_DOCS = { modeloItens, lerPlanilhaItens, conferirItens, UNIDADES_ITENS, gerarEdital, nomeEdital, gerarFormulario, nomeFormulario, gerarConsolidacao, mapaExcel, numeroIrp, dataBR, extenso, VINCULO, cnpjF, num,
    MODELO_EDITAL, MODELO_DECLARACOES, CAMPOS_EDITAL, preencher };
})();
