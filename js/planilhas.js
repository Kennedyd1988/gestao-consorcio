/* Leitura da planilha-modelo de importação e exportação do mapa de adesões (SheetJS). */
(function () {
  const R = window.REGRAS;
  const txt = (v) => (v == null ? '' : String(v).trim());
  const num = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return v;
    const s = String(v).replace(/[R$\s]/g, '');
    const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
    return isNaN(n) ? null : n;
  };
  const data = (v) => {
    if (!v) return null;
    if (v instanceof Date) { const d = new Date(v.getTime() - v.getTimezoneOffset() * 60000); return d.toISOString().slice(0, 10); }
    const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return String(v).slice(0, 10);
    return null;
  };
  const numeroAta = (v) => {
    const s = txt(v).replace(/^ARP\s*/i, '').replace('-', '/');
    const m = s.match(/(\d+)\s*\/\s*(\d{4})/);
    return m ? m[1].padStart(3, '0') + '/' + m[2] : s;
  };
  const cnpj = (v) => { const n = txt(v).replace(/\D/g, ''); return n.length ? n : null; };
  const col = (linha, ...nomes) => {
    for (const n of nomes) { const k = Object.keys(linha).find((k) => R_n(k).startsWith(R_n(n))); if (k) return linha[k]; }
    return undefined;
  };
  const R_n = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const aba = (wb, nome) => { const k = wb.SheetNames.find((s) => R_n(s) === R_n(nome)); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { defval: null, raw: true }) : []; };

  async function ler(arquivo) {
    const wb = XLSX.read(await arquivo.arrayBuffer(), { cellDates: true });
    if (!wb.SheetNames.some((s) => R_n(s) === 'itens')) throw new Error('A planilha não segue o modelo: falta a aba "Itens". Baixe o modelo no botão ao lado.');
    const erros = [];
    const atas = aba(wb, 'Atas').filter((l) => txt(col(l, 'ARP'))).map((l, i) => {
      const a = {
        pregao: numeroAta(col(l, 'Pregão')), numero: numeroAta(col(l, 'ARP')), processo: txt(col(l, 'Processo')) || null, objeto: txt(col(l, 'Objeto')) || null,
        detentora: txt(col(l, 'Detentora')), cnpj_detentora: cnpj(col(l, 'CNPJ')), data_assinatura: data(col(l, 'Data de assinatura')),
        vigencia_fim: data(col(l, 'Vigência')), prorrogada: /^s/i.test(txt(col(l, 'Prorrogada'))), clausulas_adesao: txt(col(l, 'Cláusulas')) || null, observacoes: txt(col(l, 'Observações')) || null,
      };
      if (!a.detentora) erros.push(`Atas, linha ${i + 2}: falta a detentora.`);
      return a;
    });
    const itens = aba(wb, 'Itens').filter((l) => txt(col(l, 'ARP'))).map((l, i) => {
      const it = { ata_numero: numeroAta(col(l, 'ARP')), numero: Number(num(col(l, 'Item'))), descricao: txt(col(l, 'Descrição')), unidade: txt(col(l, 'Unidade')) || null,
        qtd_registrada: num(col(l, 'Qtd registrada', 'Quantidade')), preco_unitario: num(col(l, 'Preço unitário', 'Preço')) };
      if (!(it.qtd_registrada > 0)) erros.push(`Itens, linha ${i + 2}: quantidade registrada inválida.`);
      if (!atas.some((a) => a.numero === it.ata_numero)) erros.push(`Itens, linha ${i + 2}: a ARP ${it.ata_numero} não está na aba Atas.`);
      return it;
    });
    const periodos = aba(wb, 'Vigências').filter((l) => txt(col(l, 'ARP'))).map((l, i) => {
      const pr = { ata_numero: numeroAta(col(l, 'ARP')), numero: Number(num(col(l, 'Período')) || 1), inicio: data(col(l, 'Início')), fim: data(col(l, 'Fim')),
        renova_quantitativos: /^s/i.test(txt(col(l, 'Renova'))), instrumento: txt(col(l, 'Instrumento')) || null, observacoes: txt(col(l, 'Observações')) || null };
      if (!pr.inicio || !pr.fim) erros.push(`Vigências, linha ${i + 2}: informe início e fim.`);
      else if (pr.fim < pr.inicio) erros.push(`Vigências, linha ${i + 2}: o fim é antes do início.`);
      if (!atas.some((a) => a.numero === pr.ata_numero)) erros.push(`Vigências, linha ${i + 2}: a ARP ${pr.ata_numero} não está na aba Atas.`);
      return pr;
    });
    const orgaos = aba(wb, 'Órgãos').filter((l) => txt(col(l, 'Nome'))).map((l) => {
      const esf = txt(col(l, 'Esfera'));
      return { nome: txt(col(l, 'Nome')), cnpj: cnpj(col(l, 'CNPJ')), municipio: txt(col(l, 'Município')) || null, uf: txt(col(l, 'UF')).toUpperCase() || null,
        esfera: ['Municipal', 'Estadual', 'Federal', 'Consórcio', 'Outro'].includes(esf) ? esf : 'Municipal',
        responsavel: txt(col(l, 'Responsável')) || null, cargo: txt(col(l, 'Cargo')) || null, email: txt(col(l, 'E-mail')) || null };
    });
    const adesoes = aba(wb, 'Adesões').filter((l) => txt(col(l, 'ARP'))).map((l, i) => {
      const a = { numero_oficio: txt(col(l, 'Ofício do consórcio', 'Ofício CIMOP')) || null, data_oficio: data(col(l, 'Data do ofício')), orgao_nome: txt(col(l, 'Órgão')),
        oficio_solicitante: txt(col(l, 'Ofício do solicitante')) || null, ata_numero: numeroAta(col(l, 'ARP')), item: Number(num(col(l, 'Item'))), qtd: num(col(l, 'Qtd')), periodo: Number(num(col(l, 'Período')) || 1) };
      if (!orgaos.some((o) => R_n(o.nome) === R_n(a.orgao_nome))) erros.push(`Adesões, linha ${i + 2}: o órgão "${a.orgao_nome}" não está na aba Órgãos.`);
      return a;
    }).filter((a) => a.qtd > 0);
    const dupCnpj = orgaos.map((o) => o.cnpj).filter((c, i, arr) => c && arr.indexOf(c) !== i);
    dupCnpj.forEach((c) => erros.push(`Órgãos: o CNPJ ${OFICIO.formatarCnpj(c)} aparece mais de uma vez.`));
    // Linhas repetidas dentro da própria planilha
    const vistos = new Set();
    adesoes.forEach((a, i) => { const k = [a.numero_oficio, R_n(a.orgao_nome), a.ata_numero, a.item, a.periodo].join('|'); if (vistos.has(k)) erros.push(`Adesões, linha ${i + 2}: repetida (mesmo ofício, órgão, ARP, item e período).`); vistos.add(k); });
    const vi = new Set();
    itens.forEach((it, i) => { const k = it.ata_numero + '|' + it.numero; if (vi.has(k)) erros.push(`Itens, linha ${i + 2}: o item ${it.numero} da ARP ${it.ata_numero} aparece duas vezes.`); vi.add(k); });
    return { atas, itens, periodos, orgaos, adesoes, erros };
  }

  function modeloVazio() {
    const wb = XLSX.utils.book_new();
    const add = (nome, cab, ex) => { const ws = XLSX.utils.aoa_to_sheet([cab, ex]); ws['!cols'] = cab.map((c) => ({ wch: Math.max(12, c.length + 4) })); XLSX.utils.book_append_sheet(wb, ws, nome); };
    add('Atas', ['Pregão', 'ARP', 'Processo administrativo', 'Objeto', 'Detentora (contratado)', 'CNPJ da detentora', 'Data de assinatura', 'Vigência até', 'Prorrogada? (Sim/Não)', 'Cláusulas de adesão da ata', 'Observações'],
      ['008/2025', '001/2026', '000/2025', 'Aquisição de insumos para massa asfáltica a frio', 'EMPRESA EXEMPLO LTDA', '00.000.000/0001-00', '10/02/2026', '09/02/2027', 'Não', '4.1 a 4.3', '']);
    add('Itens', ['ARP', 'Item', 'Descrição', 'Unidade', 'Qtd registrada', 'Preço unitário (R$)'], ['001/2026', 1, 'Brita 5/8', 't', 17760, 114.7]);
    add('Vigências', ['ARP', 'Período', 'Início', 'Fim', 'Renova quantitativos? (Sim/Não)', 'Instrumento', 'Observações'], ['001/2026', 1, '05/01/2026', '05/01/2027', 'Não', 'Vigência original', '']);
    add('Órgãos', ['Nome do órgão/entidade', 'CNPJ', 'Município', 'UF', 'Esfera', 'Responsável (destinatário do ofício)', 'Cargo', 'E-mail'],
      ['Município de Exemplo/RN', '00.000.000/0001-00', 'Exemplo', 'RN', 'Municipal', 'NOME DO RESPONSÁVEL', 'Prefeito Municipal', 'contato@exemplo.rn.gov.br']);
    add('Adesões', ['Ofício do consórcio', 'Data do ofício', 'Órgão/entidade', 'Ofício do solicitante', 'ARP', 'Item', 'Qtd autorizada', 'Período'], ['105/2026', '27/10/2026', 'Município de Exemplo/RN', '172/2026', '001/2026', 1, 200, 1]);
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  // Mapa no mesmo formato da planilha antiga: itens nas linhas, órgãos nas colunas
  function mapa(base, atasSel) {
    const wb = XLSX.utils.book_new();
    for (const ata of atasSel) {
      const itens = base.itens.filter((i) => i.ata_id === ata.id);
      const ciclo = R.cicloAtual(base, ata.id);
      const noCiclo = (pi) => !ciclo || R.cicloDe(base, pi.periodo_id, ata.id) === ciclo;
      const peds = base.pedidos.filter((p) => p.situacao !== 'cancelado').filter((p) => base.pedido_itens.some((pi) => pi.pedido_id === p.id && pi.decisao === 'autorizado' && noCiclo(pi) && itens.some((i) => i.id === pi.item_id)));
      const ord = (p) => { const m = String(p.numero_oficio || '').match(/(\d+)\/(\d{4})/); return m ? Number(m[2]) * 10000 + Number(m[1]) : 0; };
      peds.sort((a, b) => ord(a) - ord(b));
      const linhas = [
        [`ARP ${ata.numero}`, '', '', '', 'CONTRATADO:', ata.detentora],
        [`Pregão ${ata.pregao}`, '', '', '', 'Vigência:', R.dataBR(ata.vigencia_fim), ciclo ? 'Ciclo de quantitativos desde ' + R.dataBR((base.periodos.find((p) => p.id === ciclo) || {}).inicio) : ''],
        ['Nº', 'DESCRIÇÃO', 'UND', 'REGISTRADO', 'VL. UNIT.', 'LIMITE 50%', 'LIMITE DOBRO', 'TOTAL ADERIDO', 'SALDO', ...peds.map((p) => base.orgaosPorId[p.orgao_id].nome)],
        ['', '', '', '', '', '', '', '', '', ...peds.map((p) => 'Ofício ' + (p.numero_oficio || '—'))],
      ];
      for (const it of itens) {
        const vals = peds.map((p) => base.pedido_itens.filter((pi) => pi.pedido_id === p.id && pi.item_id === it.id && pi.decisao === 'autorizado' && noCiclo(pi)).reduce((s, pi) => s + Number(pi.qtd_autorizada), 0) || null);
        const tot = vals.reduce((s, v) => s + (v || 0), 0);
        linhas.push([it.numero, it.descricao, it.unidade, Number(it.qtd_registrada), it.preco_unitario != null ? Number(it.preco_unitario) : null, it.qtd_registrada * 0.5, it.qtd_registrada * 2, tot, it.qtd_registrada * 2 - tot, ...vals]);
      }
      const ws = XLSX.utils.aoa_to_sheet(linhas);
      ws['!cols'] = [{ wch: 5 }, { wch: 50 }, { wch: 8 }, ...Array(6).fill({ wch: 13 }), ...peds.map(() => ({ wch: 18 }))];
      XLSX.utils.book_append_sheet(wb, ws, ('ARP ' + ata.numero).replace('/', '-').slice(0, 31));
    }
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  function listaPedidos(base, peds) {
    const linhas = [['Ofício do consórcio', 'Data', 'Órgão', 'CNPJ', 'Ofício solicitante', 'Situação', 'ARP', 'Item', 'Descrição', 'Und', 'Qtd solicitada', 'Qtd autorizada', 'Decisão', 'Motivo']];
    for (const p of peds) {
      const o = base.orgaosPorId[p.orgao_id];
      for (const pi of base.pedido_itens.filter((x) => x.pedido_id === p.id)) {
        const it = base.itensPorId[pi.item_id], a = base.atasPorId[it.ata_id];
        linhas.push([p.numero_oficio, R.dataBR(p.data_oficio), o.nome, OFICIO.formatarCnpj(o.cnpj || ''), p.oficio_solicitante, p.situacao, a.numero, it.numero, it.descricao, it.unidade, Number(pi.qtd_solicitada), Number(pi.qtd_autorizada), pi.decisao, pi.motivo]);
      }
    }
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Pedidos');
    return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  }

  async function hashArquivo(arquivo) {
    const buf = await arquivo.arrayBuffer();
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Impressão digital dos DADOS da planilha (a mesma planilha salva de novo no Excel dá o mesmo resultado)
  async function hashDados(d) {
    const txt = JSON.stringify({ atas: d.atas, itens: d.itens, periodos: d.periodos, orgaos: d.orgaos, adesoes: d.adesoes });
    if (window.crypto && crypto.subtle) {
      const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
      return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;   // reserva (cyrb53 duplo) para navegador sem crypto.subtle
    for (let i = 0; i < txt.length; i++) { const c = txt.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 'c53-' + (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0') + txt.length.toString(16);
  }

  window.PLANILHAS = { hashArquivo, hashDados, ler, modeloVazio, mapa, listaPedidos };
})();
