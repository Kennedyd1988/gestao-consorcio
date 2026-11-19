/* SOFT+ Consórcios · Gestão de Consórcio
   Relatório institucional das adesões às ARPs, em PDF (jsPDF + AutoTable, carregados só quando usados).
   Recebe os dados já calculados pela tela (app.js) e só desenha. */
(function () {
  const LIBS = ['https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js', 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'];
  let carregando = null;
  function carregarLibs() {
    if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) return Promise.resolve();
    if (carregando) return carregando;
    carregando = LIBS.reduce((p, src) => p.then(() => new Promise((ok, erro) => {
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar o gerador de PDF. Verifique a internet e tente de novo.'));
      document.head.appendChild(s);
    })), Promise.resolve()).catch((e) => { carregando = null; throw e; });
    return carregando;
  }
  // Logotipo do consórcio -> PNG com as medidas (para não deformar)
  async function imagem(url) {
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
  // Desenha o logotipo numa caixa (altura h, largura máxima wMax) e devolve a largura usada
  const desenharLogo = (doc, logo, x, y, h, wMax) => { if (!logo) return 0; let w = h * logo.w / logo.h, hh = h; if (w > wMax) { w = wMax; hh = w * logo.h / logo.w; } doc.addImage(logo.data, 'PNG', x, y + (h - hh) / 2, w, hh); return w; };

  // Cores SOFT+ (manual de padrões)
  const NAVY = [16, 42, 72], VERDE = [10, 150, 104], TEXTO = [26, 36, 51], SUAVE = [83, 97, 115], LINHA = [221, 229, 238], TOM = [238, 244, 251];
  const AMBAR = [178, 109, 6], VERMELHO = [199, 63, 63];

  async function gerar(d) {
    await carregarLibs();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 14;
    const logo = await imagem(d.logo);
    let y = 0;

    const cabecalhoPagina = () => {
      const xl = M + (logo ? desenharLogo(doc, logo, M, 8, 11, 18) + 3 : 0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...NAVY);
      doc.text(d.sigla + ' · Relatório de adesões às Atas de Registro de Preços', xl, 13);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUAVE);
      doc.text('Situação em ' + d.dataBR, xl, 17.5);
      doc.setDrawColor(...VERDE); doc.setLineWidth(0.6); doc.line(M, 22, W - M, 22);
    };
    const novaPagina = () => { doc.addPage(); cabecalhoPagina(); y = 30; };
    const espaco = (h) => { if (y + h > H - 18) novaPagina(); };
    const titulo = (t, sub) => {
      espaco(sub ? 18 : 14);
      doc.setFillColor(...VERDE); doc.roundedRect(M, y, 9, 1.4, 0.7, 0.7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5); doc.setTextColor(...NAVY); doc.text(t, M, y + 7.5);
      y += 13;
      if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SUAVE); const l = doc.splitTextToSize(sub, W - 2 * M); doc.text(l, M, y); y += l.length * 3.8 + 1.5; }
    };
    const paragrafo = (t, tam) => {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(tam || 9); doc.setTextColor(...TEXTO);
      const l = doc.splitTextToSize(t, W - 2 * M); espaco(l.length * 4.2); doc.text(l, M, y); y += l.length * 4.2 + 2;
    };
    const tabela = (cab, corpo, opc) => {
      espaco(18);
      doc.autoTable(Object.assign({
        startY: y, head: [cab], body: corpo, margin: { left: M, right: M, top: 30, bottom: 18 }, theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.8, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2, valign: 'middle' },
        headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [250, 252, 254] }, rowPageBreak: 'avoid',
        didDrawPage: (data) => { if (data.pageNumber > 1 || doc.internal.getNumberOfPages() > 1) cabecalhoPagina(); },
      }, opc || {}));
      y = doc.lastAutoTable.finalY + 6;
    };
    const corUso = (p) => (p > 100 ? VERMELHO : p >= 80 ? AMBAR : VERDE);
    const barraCelula = (data, idx) => {
      if (data.section !== 'body' || data.column.index !== idx) return;
      const p = data.cell.raw && data.cell.raw.pct; if (p == null) return;
      const c = data.cell, w = Math.min(c.width - 13, 18), x = c.x + 1.8, yy = c.y + c.height / 2 - 0.9;
      doc.setFillColor(230, 237, 245); doc.roundedRect(x, yy, w, 1.8, 0.9, 0.9, 'F');
      doc.setFillColor(...corUso(p)); if (p > 0) doc.roundedRect(x, yy, Math.max(0.8, w * Math.min(100, p) / 100), 1.8, 0.9, 0.9, 'F');
      doc.setFontSize(7.5); doc.setTextColor(...(p > 100 ? VERMELHO : TEXTO)); doc.text(d.num(p, 0) + '%', c.x + c.width - 1.8, c.y + c.height / 2 + 1, { align: 'right' });
    };
    const celulaBarra = (p) => ({ content: '', pct: p });

    // ---------------- capa / resumo
    cabecalhoPagina(); y = 32;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(19); doc.setTextColor(...NAVY);
    doc.text('Relatório de Adesões', M, y); y += 8;
    doc.setFontSize(12); doc.setFont('helvetica', 'normal'); doc.setTextColor(...SUAVE);
    doc.text('Atas de Registro de Preços do ' + d.orgao, M, y, { maxWidth: W - 2 * M }); y += (doc.splitTextToSize('Atas de Registro de Preços do ' + d.orgao, W - 2 * M).length) * 5.5 + 2;
    doc.setFontSize(9); doc.text(d.escopo + ' · Situação em ' + d.dataBR, M, y); y += 8;

    // indicadores
    const cards = d.indicadores; const cw = (W - 2 * M - 3 * 4) / 4;
    cards.forEach((c, k) => {
      const x = M + k * (cw + 4);
      doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINHA); doc.setLineWidth(0.25); doc.roundedRect(x, y, cw, 24, 2.5, 2.5, 'FD');
      doc.setFillColor(...(c.cor || VERDE)); doc.rect(x + 0.2, y + 0.2, cw - 0.4, 1.4, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...SUAVE); doc.text(c.rotulo.toUpperCase(), x + 3.5, y + 7);
      doc.setFontSize(c.valor.length > 12 ? 11.5 : 15); doc.setTextColor(...NAVY); doc.text(c.valor, x + 3.5, y + 15);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(...SUAVE); doc.text(doc.splitTextToSize(c.sub || '', cw - 7), x + 3.5, y + 19.5);
    });
    y += 31;

    titulo('Fundamentação');
    paragrafo('As adesões seguem o art. 86 da Lei nº 14.133/2021: cada órgão ou entidade não participante pode aderir a até 50% do quantitativo registrado de cada item (§ 4º), e o total das adesões não pode passar do dobro do quantitativo registrado (§ 5º), observado o ' + d.regulamento + '. É vedada a adesão por órgãos da Administração Pública federal (§ 8º). Quando o termo aditivo de prorrogação renova os quantitativos, começa um novo ciclo e os limites passam a contar só as adesões do novo período. Os números deste relatório consideram o ciclo vigente de cada ata.');

    // ---------------- 1. situação das atas
    titulo('1. Situação das atas', d.atas.length + ' ata(s) neste relatório.');
    tabela(['ARP', 'Pregão', 'Contratado', 'Vigência', 'Ciclo', 'Itens', 'Órgãos', 'Valor autorizado (R$)', 'Maior uso do dobro'],
      d.atas.map((a) => [a.numero, a.pregao, a.detentora, a.vigencia, a.ciclo, a.itens, a.orgaos, d.moeda(a.valor), celulaBarra(a.maior)]),
      { columnStyles: { 0: { fontStyle: 'bold', cellWidth: 17 }, 1: { cellWidth: 16 }, 3: { cellWidth: 21 }, 4: { cellWidth: 14 }, 5: { halign: 'right', cellWidth: 11 }, 6: { halign: 'right', cellWidth: 13 }, 7: { halign: 'right', cellWidth: 25 }, 8: { cellWidth: 28 } },
        didDrawCell: (data) => barraCelula(data, 8),
        foot: [['Total', '', '', '', '', String(d.atas.reduce((s, a) => s + a.itens, 0)), '', d.moeda(d.atas.reduce((s, a) => s + a.valor, 0)), '']],
        footStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', halign: 'right' } });

    // ---------------- 2. detalhe por ata
    if (d.detalhe) {
      titulo('2. Itens e saldos por ata', 'Limite por órgão = 50% do registrado. Limite total = dobro do registrado. Saldo = limite total menos o aderido.');
      for (const a of d.atas) {
        espaco(34); y += 1;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY); doc.text('ARP ' + a.numero + ' · ' + a.detentora, M, y, { maxWidth: W - 2 * M }); y += 4.5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUAVE);
        const info = doc.splitTextToSize([a.objeto, 'Pregão Eletrônico nº ' + a.pregao, 'Vigência: ' + a.vigencia, a.ciclo !== '—' ? 'Ciclo ' + a.ciclo : null].filter(Boolean).join(' · '), W - 2 * M);
        doc.text(info, M, y + 0.5, { lineHeightFactor: 1.35 });
        y += info.length * 3.8 + 3;
        if (!a.linhas.length) { paragrafo('Nenhuma adesão no ciclo vigente.', 8.5); y += 3; continue; }
        tabela(['Item', 'Descrição', 'Und.', 'Registrado', 'Limite total', 'Aderido', 'Saldo', 'Uso do dobro'],
          a.linhas.map((l) => [l.numero, l.descricao, l.unidade, d.num(l.registrado, 2), d.num(l.dobro, 2), d.num(l.aderido, 2), d.num(l.saldo, 2), celulaBarra(l.uso)]),
          { columnStyles: { 0: { halign: 'center', cellWidth: 10 }, 2: { cellWidth: 13 }, 3: { halign: 'right', cellWidth: 20 }, 4: { halign: 'right', cellWidth: 20 }, 5: { halign: 'right', cellWidth: 20 }, 6: { halign: 'right', cellWidth: 20 }, 7: { cellWidth: 27 } },
            didDrawCell: (data) => barraCelula(data, 7) });
        if (a.orgaosLista.length) {
          tabela(['Órgão aderente', 'Ofícios do ' + d.sigla, 'Valor autorizado (R$)'], a.orgaosLista.map((o) => [o.nome, o.oficios, d.moeda(o.valor)]),
            { columnStyles: { 2: { halign: 'right', cellWidth: 34 } }, headStyles: { fillColor: [247, 250, 253], textColor: SUAVE, fontStyle: 'bold', fontSize: 7.2 } });
        }
      }
    }

    // ---------------- 3. órgãos
    let n = d.detalhe ? 3 : 2;
    if (d.orgaos.length) {
      titulo(n++ + '. Órgãos aderentes', d.orgaos.length + ' órgão(s) com adesão autorizada no ciclo vigente das atas.');
      tabela(['Órgão', 'Município/UF', 'Pedidos', 'Atas', 'Valor autorizado (R$)'], d.orgaos.map((o) => [o.nome, o.local, o.pedidos, o.atas, d.moeda(o.valor)]),
        { columnStyles: { 2: { halign: 'right', cellWidth: 16 }, 3: { cellWidth: 38 }, 4: { halign: 'right', cellWidth: 32 } },
          foot: [['Total', '', String(d.orgaos.reduce((s, o) => s + o.pedidos, 0)), '', d.moeda(d.orgaos.reduce((s, o) => s + o.valor, 0))]],
          footStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', halign: 'right' } });
    }

    // ---------------- 4. negados
    if (d.incluirNegados) {
      titulo(n++ + '. Pedidos negados ou autorizados em parte', d.negados.length ? null : 'Nenhum item negado no período.');
      if (d.negados.length) tabela(['Ofício', 'Data', 'Órgão', 'ARP / item', 'Qtd pedida', 'Motivo'], d.negados.map((x) => [x.oficio, x.data, x.orgao, x.item, d.num(x.qtd, 2), x.motivo]),
        { columnStyles: { 0: { cellWidth: 17 }, 1: { cellWidth: 17 }, 3: { cellWidth: 24 }, 4: { halign: 'right', cellWidth: 18 } } });
    }

    // ---------------- 5. pontos de atenção
    titulo(n++ + '. Pontos de atenção');
    if (!d.alertas.length) paragrafo('Nenhum ponto de atenção.');
    for (const t of d.alertas) {
      const l = doc.splitTextToSize(t.texto, W - 2 * M - 6); espaco(l.length * 4 + 2);
      doc.setFillColor(...(t.tipo === 'erro' ? VERMELHO : t.tipo === 'falta' ? AMBAR : [29, 95, 209])); doc.circle(M + 1.3, y - 1, 1, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...TEXTO); doc.text(l, M + 5, y); y += l.length * 4 + 2;
    }

    // ---------------- assinatura e rodapé
    espaco(28); y += 10;
    doc.setDrawColor(...SUAVE); doc.setLineWidth(0.2); doc.line(W / 2 - 40, y, W / 2 + 40, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...TEXTO); doc.text(d.presidente, W / 2, y + 4.5, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.text(d.presidenteCargo, W / 2, y + 8.5, { align: 'center' });

    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.line(M, H - 12, W - M, H - 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...SUAVE);
      doc.text('Gerado em ' + d.geradoEm + ' por ' + d.usuario + ' · SOFT+ Consórcios', M, H - 7.5);
      doc.text('Página ' + p + ' de ' + total, W - M, H - 7.5, { align: 'right' });
    }
    return doc.output('blob');
  }

  // Relatório resumido: lista consolidada de todas as adesões (uma linha por ofício e ata)
  async function gerarResumido(d) {
    await carregarLibs();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 12;
    const logo = await imagem(d.logo);
    const topo = () => {
      const xl = M + (logo ? desenharLogo(doc, logo, M, 7, 10.4, 17) + 3 : 0);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...NAVY);
      doc.text(d.sigla + ' · Adesões às Atas de Registro de Preços · relação consolidada', xl, 12);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...SUAVE);
      doc.text(d.escopo + ' · Situação em ' + d.dataBR, xl, 16.5);
      doc.setDrawColor(...VERDE); doc.setLineWidth(0.6); doc.line(M, 20, W - M, 20);
    };
    topo();
    let y = 27;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...NAVY); doc.text('Relação de adesões autorizadas', M, y); y += 5.5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...SUAVE);
    doc.text(d.linhas.length + ' adesão(ões) · ' + d.qtdOrgaos + ' órgão(s) · valor total autorizado R$ ' + d.moeda(d.total) + '. Não inclui pedidos cancelados nem itens negados.' + (d.semData ? ' ' + d.semData + ' adesão(ões) migrada(s) da planilha antiga sem data informada.' : ''), M, y); y += 5;
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 26, bottom: 16 }, theme: 'grid',
      head: [['Nº', 'Data da autorização', 'Ofício do ' + d.sigla, 'Órgão aderente', 'Município/UF', 'ARP', 'Pregão', 'Contratado', 'Valor total (R$)']],
      body: d.linhas.map((l, k) => [k + 1, l.data, l.oficio, l.orgao, l.local, l.arp, l.pregao, l.contratado, d.moeda(l.valor)]),
      foot: [[{ content: 'Total autorizado', colSpan: 8, styles: { halign: 'right' } }, d.moeda(d.total)]], showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.6, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2, valign: 'middle' },
      headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', fontSize: 7.4 },
      footStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', halign: 'right' },
      alternateRowStyles: { fillColor: [250, 252, 254] }, rowPageBreak: 'avoid',
      columnStyles: { 0: { halign: 'center', cellWidth: 9 }, 1: { cellWidth: 21 }, 2: { cellWidth: 20 }, 4: { cellWidth: 30 }, 5: { cellWidth: 17, fontStyle: 'bold' }, 6: { cellWidth: 17 }, 8: { halign: 'right', cellWidth: 28 } },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) topo(); },
    });
    y = doc.lastAutoTable.finalY + 8;
    if (y > H - 50) { doc.addPage(); topo(); y = 28; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(...NAVY); doc.text('Resumo por ata', M, y); y += 2;
    doc.autoTable({
      startY: y, margin: { left: M, right: M, top: 26, bottom: 16 }, theme: 'grid', tableWidth: 180,
      head: [['ARP', 'Contratado', 'Adesões', 'Órgãos', 'Valor total (R$)']],
      body: d.porAta.map((a) => [a.arp, a.contratado, a.adesoes, a.orgaos, d.moeda(a.valor)]),
      foot: [['Total', '', String(d.linhas.length), String(d.qtdOrgaos), d.moeda(d.total)]],
      styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.6, textColor: TEXTO, lineColor: LINHA, lineWidth: 0.2 },
      headStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold', fontSize: 7.4 }, footStyles: { fillColor: TOM, textColor: NAVY, fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 18, fontStyle: 'bold' }, 2: { halign: 'right', cellWidth: 18 }, 3: { halign: 'right', cellWidth: 18 }, 4: { halign: 'right', cellWidth: 30 } },
      didDrawPage: () => { if (doc.internal.getNumberOfPages() > 1) topo(); },
    });
    const total = doc.internal.getNumberOfPages();
    for (let p = 1; p <= total; p++) {
      doc.setPage(p);
      doc.setDrawColor(...LINHA); doc.setLineWidth(0.2); doc.line(M, H - 10, W - M, H - 10);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.2); doc.setTextColor(...SUAVE);
      doc.text('Gerado em ' + d.geradoEm + ' por ' + d.usuario + ' · SOFT+ Consórcios', M, H - 6);
      doc.text('Página ' + p + ' de ' + total, W - M, H - 6, { align: 'right' });
    }
    return doc.output('blob');
  }
  window.RELATORIO = { gerar, gerarResumido, carregarLibs };
})();
