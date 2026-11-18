/* Geração do ofício em Word (.docx) no padrão do Ofício nº 105/2026 – CIMOP.
   Usa o timbre, rodapé e estilos originais (modelo-oficio.js) e monta o corpo do texto. */
(function () {
  const R = window.REGRAS;
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const extenso = (d) => (d ? `${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}` : '');
  const lista = (arr) => (arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' e ' + arr[arr.length - 1]);
  const feminino = (nome) => /^(a |c[aâ]mara|secretaria|prefeitura|funda[cç][aã]o|autarquia|empresa|companhia|universidade|ag[eê]ncia|superintend)/i.test(nome || '');

  function vocativo(org) {
    if (org.vocativo) return org.vocativo;
    const fem = /^à/i.test(org.tratamento || '');
    const cargo = (org.cargo || '').split(/\s+/)[0] || (fem ? 'Senhora' : 'Senhor');
    return (fem ? 'Senhora ' : 'Senhor ') + cargo + ',';
  }

  // ---- XML helpers
  const run = (t, o = {}) => {
    const rpr = (o.b ? '<w:b/><w:bCs/>' : '') + (o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : '');
    return `<w:r>${rpr ? '<w:rPr>' + rpr + '</w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  };
  const par = (runs, o = {}) => {
    const jc = o.jc || 'both';
    const ind = o.recuo ? '<w:ind w:firstLine="708"/>' : '';
    const sp = o.antes ? `<w:spacing w:before="${o.antes}"/>` : '';
    const conteudo = (Array.isArray(runs) ? runs : [runs]).map((r) => (typeof r === 'string' ? run(r) : run(r.t, r))).join('');
    return `<w:p><w:pPr>${sp}${ind}<w:jc w:val="${jc}"/></w:pPr>${conteudo}</w:p>`;
  };
  const vazio = () => '<w:p><w:pPr><w:jc w:val="both"/></w:pPr></w:p>';

  function tabela(colunas, linhas, larguras, total) {
    const borda = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map((b) => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join('');
    const cel = (t, o = {}) => `<w:tc><w:tcPr><w:tcW w:w="${o.w}" w:type="dxa"/>${o.span ? `<w:gridSpan w:val="${o.span}"/>` : ''}${o.fundo ? `<w:shd w:val="clear" w:color="auto" w:fill="${o.fundo}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="${o.jc || 'center'}"/></w:pPr>${run(t, { b: o.b, sz: 20 })}</w:p></w:tc>`;
    let x = `<w:tbl><w:tblPr><w:tblW w:w="${larguras.reduce((a, b) => a + b, 0)}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders>${borda}</w:tblBorders>` +
      `<w:tblCellMar><w:top w:w="30" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="30" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${larguras.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    x += `<w:tr><w:trPr><w:tblHeader/></w:trPr>${colunas.map((c, i) => cel(c, { w: larguras[i], b: true, fundo: 'E7EEF6' })).join('')}</w:tr>`;
    for (const l of linhas) x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${l.map((c, i) => cel(c, { w: larguras[i], jc: i >= 4 ? 'right' : i === 1 ? 'left' : 'center' })).join('')}</w:tr>`;
    if (total) {
      const w0 = larguras.slice(0, -1).reduce((a, b) => a + b, 0);
      x += `<w:tr>${cel(total[0], { w: w0, span: larguras.length - 1, b: true, jc: 'right' })}${cel(total[1], { w: larguras[larguras.length - 1], b: true, jc: 'right' })}</w:tr>`;
    }
    return x + '</w:tbl>';
  }

  // ---- Texto do ofício
  // dados = {pedido, orgao, linhas:[{item, ata, decisao, motivo, q, usadoOrgao, dispOrgao, dispTotal}], config}
  function corpo(d) {
    const { pedido, orgao, config } = d;
    const linhas = d.linhas.filter((l) => l.decisao === 'autorizado' || l.decisao === 'negado');
    const aut = linhas.filter((l) => l.decisao === 'autorizado');
    const neg = linhas.filter((l) => l.decisao === 'negado');
    const atas = [...new Map(linhas.map((l) => [l.ata.id, l.ata])).values()].sort((a, b) => a.numero.localeCompare(b.numero));
    const pregoes = [...new Set(atas.map((a) => a.pregao))];
    const varias = atas.length > 1;
    const nAtas = lista(atas.map((a) => 'nº ' + a.numero));
    const fem = feminino(orgao.nome);
    const sol = pedido.oficio_solicitante ? `Ofício nº ${pedido.oficio_solicitante}` : 'expediente';
    const tipo = neg.length === 0 ? 'Autorização para Adesão' : aut.length === 0 ? 'Pedido de Adesão' : 'Autorização Parcial para Adesão';
    const oriunda = pregoes.length > 1
      ? `oriundas dos Pregões Eletrônicos para Registro de Preços ${lista(pregoes.map((p) => 'nº ' + p))}`
      : `${varias ? 'oriundas' : 'oriunda'} do Pregão Eletrônico para Registro de Preços nº ${pregoes[0]}`;
    const resol = config.resolucao_srp;

    let x = '';
    x += par({ t: `OFÍCIO Nº ${pedido.numero_oficio || '___/____'} – ${config.sigla}`, b: true });
    x += par(`${config.cidade_uf}, ${extenso(pedido.data_oficio)}.`, { jc: 'right' });
    x += vazio();
    x += par(orgao.tratamento || 'Ao Senhor');
    if (orgao.responsavel) x += par({ t: orgao.responsavel.toUpperCase(), b: true });
    if (orgao.cargo) x += par(orgao.cargo);
    x += par(orgao.nome);
    if (orgao.email) x += par('E-mail: ' + orgao.email);
    x += vazio();
    x += par([{ t: 'Assunto: ', b: true }, `${tipo} ${varias ? 'às Atas' : 'à Ata'} de Registro de Preços ${nAtas}${pedido.oficio_solicitante ? ' – Resposta ao Ofício nº ' + pedido.oficio_solicitante : ''}.`], { recuo: true });
    x += vazio();
    x += par(vocativo(orgao), { recuo: true });
    x += vazio();
    let p1 = `Acusamos o recebimento do ${sol}, por meio do qual ${fem ? 'a' : 'o'} ${orgao.nome}` +
      (orgao.cnpj ? `, ${fem ? 'inscrita' : 'inscrito'} no CNPJ sob o nº ${formatarCnpj(orgao.cnpj)},` : '') +
      ` consulta este Consórcio acerca da possibilidade de adesão, na condição de órgão não participante, ${varias ? 'às Atas' : 'à Ata'} de Registro de Preços ${nAtas}, ${oriunda}.`;
    if (pedido.finalidade) p1 += ' A adesão destina-se ' + pedido.finalidade.trim().replace(/^(à|a)\s+/i, 'à ').replace(/\.?$/, '.');
    x += par(p1, { recuo: true });
    x += vazio();

    if (aut.length) {
      x += par([`Após análise do pedido, e verificados os limites estabelecidos no art. 86, §§ 4º e 5º, da Lei nº 14.133/2021, no art. 29 da ${resol} e nas cláusulas ${varias ? 'das respectivas Atas' : 'da respectiva Ata'}, `,
        { t: 'AUTORIZAMOS', b: true }, ` a adesão aos itens, quantitativos e preços registrados abaixo discriminados, observadas as condições estabelecidas ${varias ? 'nas Atas' : 'na Ata'}:`], { recuo: true });
      x += vazio();
      let global = 0, semPreco = false;
      const ls = aut.map((l) => {
        const vu = l.item.preco_unitario;
        const tot = vu != null && vu !== '' ? R.r4(l.q * vu) : null;
        if (tot == null) semPreco = true; else global += tot;
        return [l.ata.numero, nomeItem(l), l.ata.detentora, l.item.unidade || '', R.num(l.q, 2), vu != null && vu !== '' ? R.moeda(vu) : '—', tot == null ? '—' : R.moeda(tot)];
      });
      x += tabela(['ARP', 'Item', 'Detentora do registro', 'Und.', 'Qtd. autorizada', 'Preço unit. (R$)', 'Valor total (R$)'], ls,
        [900, 2050, 1900, 600, 1150, 1150, 1250], ['VALOR GLOBAL', semPreco ? R.moeda(global) + '*' : R.moeda(global)]);
      if (semPreco) x += par({ t: '* Há item sem preço unitário informado; o valor global não o inclui.', sz: 18 });
      x += vazio();
      x += par(`Destacamos que os quantitativos autorizados não ultrapassam o limite individual de 50% dos quantitativos registrados, previsto no art. 86, § 4º, da Lei nº 14.133/2021, nem o limite global correspondente ao dobro dos quantitativos registrados, previsto no § 5º do mesmo artigo. Essas condições foram formalmente verificadas e declaradas por este Consórcio, o que garante a conformidade da contratação com os limites quantitativos permitidos.`, { recuo: true });
      x += vazio();
    }

    if (neg.length) {
      x += par([aut.length ? 'Por outro lado, ' : `Após análise do pedido, e verificados os limites estabelecidos no art. 86, §§ 4º e 5º, da Lei nº 14.133/2021 e no art. 29 da ${resol}, `,
        { t: 'NÃO AUTORIZAMOS', b: true }, ` a adesão ${neg.length > 1 ? 'aos itens abaixo relacionados' : 'ao item abaixo relacionado'}, pelos motivos indicados:`], { recuo: true });
      x += vazio();
      const ls = neg.map((l) => [l.ata.numero, nomeItem(l), R.num(l.q, 2), R.num(l.usadoOrgao, 2), R.num(Math.min(l.dispOrgao, l.dispTotal), 2), motivoCurto(l.motivo)]);
      x += tabela(['ARP', 'Item', 'Qtd. solicitada', 'Já aderido pelo órgão', 'Saldo disponível', 'Motivo'], ls, [900, 2300, 1150, 1250, 1150, 2250]);
      x += vazio();
      const temLimite = neg.some((l) => /§ [45]º/.test(l.motivo));
      if (temLimite)
        x += par(`Ressaltamos que, nos termos do art. 86, § 4º, da Lei nº 14.133/2021 e do art. 29, I, da ${resol}, as aquisições ou contratações decorrentes de adesão não poderão exceder, por órgão ou entidade, a 50% (cinquenta por cento) dos quantitativos dos itens registrados na ata, considerada a soma de todas as adesões já autorizadas ao mesmo órgão ou entidade; e, nos termos do § 5º do mesmo artigo e do art. 29, II, da referida Resolução, o quantitativo total decorrente das adesões não poderá exceder ao dobro do quantitativo de cada item registrado, independentemente do número de órgãos não participantes que aderirem. Eventual novo pedido poderá ser formulado dentro do saldo disponível indicado no quadro acima.`, { recuo: true });
      for (const m of [...new Set(neg.filter((l) => !/§ [45]º/.test(l.motivo)).map((l) => l.motivo))]) x += par(m, { recuo: true });
      x += vazio();
    }

    if (aut.length) {
      const cls = [...new Set(atas.filter((a) => aut.some((l) => l.ata.id === a.id)).map((a) => (a.clausulas_adesao || '').trim()))];
      const clausula = cls.length === 1 && cls[0] ? `nos termos das cláusulas ${cls[0]} ${varias ? 'das Atas' : 'da Ata'} e do art. 28 da ${resol}` : `nos termos das cláusulas de adesão ${varias ? 'das respectivas Atas' : 'da respectiva Ata'} e do art. 28 da ${resol}`;
      x += par(`A presente autorização fica condicionada à aceitação da adesão ${atas.length > 1 ? 'pelas empresas detentoras dos registros' : 'pela empresa detentora do registro'}, ${clausula}. Cabe ainda a esse ${/^munic[ií]pio/i.test(orgao.nome) ? 'Município' : 'órgão'} demonstrar a vantagem da adesão e a compatibilidade dos preços registrados com os praticados no mercado, na forma do art. 23 da Lei nº 14.133/2021. As contratações deverão ser formalizadas dentro do prazo de vigência ${varias ? 'das Atas' : 'da Ata'}.`
        , { recuo: true });
      x += vazio();
    }
    if (pedido.anexos_texto && pedido.anexos_texto.trim()) { x += par(pedido.anexos_texto.trim(), { recuo: true }); x += vazio(); }
    x += par('Permanecemos à disposição para quaisquer esclarecimentos adicionais.', { recuo: true });
    x += vazio();
    x += par('Atenciosamente,', { recuo: true });
    x += vazio() + vazio() + vazio();
    x += par({ t: config.presidente_nome, b: true }, { jc: 'center' });
    x += par(config.presidente_cargo, { jc: 'center' });
    return x;
  }

  const nomeItem = (l) => (l.ata._qtdItens > 1 ? l.item.numero + ' – ' : '') + l.item.descricao;
  const motivoCurto = (m) => (/§ 4º/.test(m) ? 'Excede o limite de 50% por órgão (art. 86, § 4º)' : /§ 5º/.test(m) ? 'Excede o limite do dobro (art. 86, § 5º)' : /§ 8º/.test(m) ? 'Vedação a órgão federal (art. 86, § 8º)' : m);
  function formatarCnpj(c) {
    const n = String(c || '').replace(/\D/g, '');
    return n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : c;
  }

  async function gerarDocx(dados) {
    const M = window.MODELO_OFICIO;
    const zip = new JSZip();
    for (const [p, c] of Object.entries(M.partes)) zip.file(p, p === 'word/_rels/document.xml.rels' ? c.replace(/<Relationship Id="rId6"[^>]*\/>/, '') : c);
    zip.file('word/media/image1.jpeg', M.imagem, { base64: true });
    zip.file('word/document.xml', M.docInicio + corpo(dados) + M.docFim);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  function nomeArquivo(d) {
    const atas = [...new Set(d.linhas.map((l) => l.ata.pregao))].join('-').replace(/\//g, '-');
    const n = (d.pedido.numero_oficio || 'sem-numero').split('/')[0];
    const sit = d.linhas.some((l) => l.decisao === 'autorizado') ? 'Autoriza Adesão' : 'Nega Adesão';
    return `${n}. ${sit} - Pregão ${atas} - ${(d.orgao.municipio || d.orgao.nome).replace(/[\\/:*?"<>|]/g, '')}${d.orgao.uf ? '-' + d.orgao.uf : ''}.docx`;
  }

  window.OFICIO = { gerarDocx, nomeArquivo, formatarCnpj, corpo, vocativo };
})();
