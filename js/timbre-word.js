/* =====================================================================
   SOFT+ Consórcios · Gestão de Consórcio — timbre do consórcio nos documentos em Word
   Os modelos (ofício e edital da IRP) trazem cabeçalho e rodapé próprios. Se o consórcio
   marcou "usar o timbre do modelo", eles ficam como estão. Senão, o cabeçalho e o rodapé
   são trocados por:
     1. as imagens enviadas em Consórcio › Brasão e timbre; ou
     2. um padrão montado com os textos do consórcio (logotipo, nome, CNPJ, endereço e contatos),
        para o documento nunca sair sem timbre.
   ===================================================================== */
(function () {
  'use strict';
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const LARGURA = 5400000;          // largura útil da folha A4 com margens de 3 cm (EMU)
  const CM = 360000;

  // Imagem -> PNG em base64, com as medidas (aceita PNG, JPG e WEBP)
  async function png(url) {
    if (!url) return null;
    try {
      const b = await (await fetch(url, { mode: 'cors' })).blob();
      const src = URL.createObjectURL(b);
      const img = await new Promise((ok, erro) => { const i = new Image(); i.onload = () => ok(i); i.onerror = erro; i.src = src; });
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0); URL.revokeObjectURL(src);
      return { base64: c.toDataURL('image/png').split(',')[1], w: img.naturalWidth, h: img.naturalHeight };
    } catch (e) { return null; }
  }
  const figura = (rid, cx, cy, id) => `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Timbre ${id}"/>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="timbre${id}.png"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const texto = (t, o = {}) => `<w:r><w:rPr><w:rFonts w:ascii="Cambria" w:hAnsi="Cambria"/>${o.b ? '<w:b/>' : ''}<w:color w:val="${o.cor || '1A2433'}"/><w:sz w:val="${o.sz || 20}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  const par = (conteudo, o = {}) => `<w:p><w:pPr><w:spacing w:before="0" w:after="${o.depois || 0}"/>${o.borda || ''}<w:jc w:val="center"/></w:pPr>${conteudo}</w:p>`;
  const medida = (img, maxCx, maxCy) => { let cx = maxCx, cy = Math.round(maxCx * img.h / img.w); if (cy > maxCy) { cy = maxCy; cx = Math.round(maxCy * img.w / img.h); } return [cx, cy]; };

  // Texto do timbre padrão a partir das configurações do consórcio
  function linhas(c) {
    const cnpj = String(c.cnpj || '').replace(/\D/g, '');
    const cnpjF = cnpj.length === 14 ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
    return {
      titulo: [String(c.orgao_nome || '').toUpperCase(), c.sigla ? '– ' + c.sigla.toUpperCase() : ''].filter(Boolean).join(' '),
      sub: [cnpjF ? 'CNPJ ' + cnpjF : null, c.cidade_uf || null].filter(Boolean).join(' · '),
      rodape1: [c.endereco, c.cep ? 'CEP ' + c.cep : null, c.cidade_uf].filter(Boolean).join(' · '),
      rodape2: [c.telefone ? 'Tel. ' + c.telefone : null, c.whatsapp && c.whatsapp !== c.telefone ? 'WhatsApp ' + c.whatsapp : null, c.email_institucional,
        c.site_url ? String(c.site_url).replace(/^https?:\/\//i, '') : null].filter(Boolean).join(' · '),
    };
  }

  async function aplicar(zip, c) {
    if (!c || c.usar_timbre_modelo) return;
    const url = (x) => (window.NUCLEO && window.NUCLEO.D ? window.NUCLEO.D.urlCadastro(x) : x);
    const [cab, rod, logo] = await Promise.all([png(url(c.timbre_cabecalho_url)), png(url(c.timbre_rodape_url)), c.timbre_cabecalho_url ? null : png(url(c.logo_url))]);
    const l = linhas(c);
    const midia = [];
    const relsCab = [], relsRod = [];
    // Cabeçalho
    let xCab;
    if (cab) {
      midia.push(['word/media/timbre-cabecalho.png', cab.base64]); relsCab.push(['rIdT1', 'media/timbre-cabecalho.png']);
      const [cx, cy] = medida(cab, LARGURA, Math.round(3.2 * CM));
      xCab = par(figura('rIdT1', cx, cy, 901));
    } else {
      xCab = '';
      if (logo) { midia.push(['word/media/timbre-logo.png', logo.base64]); relsCab.push(['rIdT1', 'media/timbre-logo.png']);
        const [cx, cy] = medida(logo, Math.round(4 * CM), Math.round(1.6 * CM)); xCab += par(figura('rIdT1', cx, cy, 902), { depois: 60 }); }
      xCab += par(texto(l.titulo || 'CONSÓRCIO PÚBLICO', { b: true, sz: 21, cor: '102A48' }));
      xCab += par(l.sub ? texto(l.sub, { sz: 17, cor: '536173' }) : '', { depois: 120, borda: '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="102A48"/></w:pBdr>' });
    }
    // Rodapé
    let xRod;
    if (rod) {
      midia.push(['word/media/timbre-rodape.png', rod.base64]); relsRod.push(['rIdT1', 'media/timbre-rodape.png']);
      const [cx, cy] = medida(rod, LARGURA, Math.round(2.2 * CM));
      xRod = par(figura('rIdT1', cx, cy, 903));
    } else {
      const borda = '<w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="A7B4C2"/></w:pBdr>';
      const ls = [l.rodape1, l.rodape2].filter(Boolean);
      if (!ls.length) ls.push(l.titulo);
      xRod = ls.map((t, i) => par(texto(t, { sz: 15, cor: '536173' }), { borda: i === 0 ? borda : '' })).join('');
    }
    const rels = (lista) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      lista.map(([id, alvo]) => `<Relationship Id="${id}" Type="${REL}/image" Target="${alvo}"/>`).join('') + '</Relationships>';
    zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${NS}>${xCab}</w:hdr>`);
    zip.file('word/_rels/header1.xml.rels', rels(relsCab));
    zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr ${NS}>${xRod}</w:ftr>`);
    zip.file('word/_rels/footer1.xml.rels', rels(relsRod));
    for (const [p, b] of midia) zip.file(p, b, { base64: true });
    // Tipo PNG declarado no pacote
    const ct = await zip.file('[Content_Types].xml').async('string');
    if (!/Extension="png"/i.test(ct)) zip.file('[Content_Types].xml', ct.replace('<Default ', '<Default Extension="png" ContentType="image/png"/><Default '));
  }

  window.TIMBRE_WORD = { aplicar, linhas };
})();
