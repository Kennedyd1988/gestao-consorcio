// Edge Function "consorcio-pncp" (Gestão de Consórcio, schema consorcio)
// Compara as atas do CIMOP no PNCP com o sistema e grava PROPOSTAS de atualização:
//   nova_ata · prorrogacao (lendo o termo aditivo: renova ou não os quantitativos) · reequilibrio (novos preços) · cancelamento
// Nada muda nos saldos sem confirmação no painel.
// Chamada: pela agenda diária (cabeçalho x-chave-sinc) ou pelo botão "Buscar agora" (usuário editor logado).
// Publicar com "Verify JWT" DESLIGADO (a conferência é feita aqui).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'https://esm.sh/unpdf@0.12.1';

// ===================== leitura de termos aditivos =====================
// Leitura do texto de termos aditivos de ARP (prorrogação, renovação dos quantitativos e reequilíbrio).
// Só PROPÕE: tudo é conferido e confirmado pelo usuário no painel.
const MESES: Record<string, string> = { janeiro: '01', fevereiro: '02', 'março': '03', marco: '03', abril: '04', maio: '05', junho: '06',
  julho: '07', agosto: '08', setembro: '09', outubro: '10', novembro: '11', dezembro: '12' };

function datas(t: string): string[] {
  const out: string[] = [];
  const re = /(\d{1,2})\s*(?:\/|\.|-)\s*(\d{1,2})\s*(?:\/|\.|-)\s*(\d{4})|(\d{1,2})º?\s+de\s+([a-zç]+)\s+de\s+(\d{4})/gi;
  let m;
  while ((m = re.exec(t))) {
    if (m[1]) out.push(`${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`);
    else { const mes = MESES[m[5].toLowerCase()]; if (mes) out.push(`${m[6]}-${mes}-${m[4].padStart(2, '0')}`); }
  }
  return out;
}
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

function analisarAditivo(bruto: string) {
  const t = bruto.replace(/\s+/g, ' ');
  const baixo = t.toLowerCase();
  const r: { prorrogacao: boolean; renova: boolean | null; inicio: string | null; fim: string | null; instrumento: string | null; trecho: string | null;
    precos: { numero: number; preco_anterior: number | null; preco_novo: number }[] } =
    { prorrogacao: false, renova: null, inicio: null, fim: null, instrumento: null, trecho: null, precos: [] };

  const ins = t.match(/(\d+º?\s*)?termo\s+aditivo(\s+n[º°o.]*\s*[\d/.-]+)?/i);
  if (ins) r.instrumento = ins[0].replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase());

  // ---- prorrogação
  const iP = baixo.search(/prorroga(ção|cao|r|da|do)/);
  if (iP >= 0) {
    r.prorrogacao = true;
    const janela = t.slice(Math.max(0, iP - 200), iP + 900);
    r.trecho = janela.slice(0, 700);
    // "de 21/10/2026 a 20/10/2027", "até 20/10/2027", "por mais 12 meses"
    const D = '(\\d{1,2}\\/\\d{1,2}\\/\\d{4}|\\d{1,2}º?\\s+de\\s+[a-zç]+\\s+de\\s+\\d{4})';
    const reInt = new RegExp('(?:per[ií]odo\\s+de|vigorar\\s+de|de|a\\s+partir\\s+de)\\s+' + D + '\\s+(?:a|até|ate)\\s+' + D, 'gi');
    let melhor: [string, string] | null = null; let mi;
    while ((mi = reInt.exec(t))) { const a = datas(mi[1])[0]; const b = datas(mi[2])[0]; if (a && b && b > a && (!melhor || b > melhor[1])) melhor = [a, b]; }
    if (melhor) { r.inicio = melhor[0]; r.fim = melhor[1]; }
    else {
      const ate = janela.match(new RegExp('(?:até|ate|término|termino|final)\\s+(?:o\\s+dia\\s+|em\\s+)?' + D, 'i'));
      if (ate) r.fim = datas(ate[1])[0] || null;
      else { const ds = datas(janela).sort(); if (ds.length) r.fim = ds[ds.length - 1]; }
    }
    if (r.inicio && r.fim && r.inicio > r.fim) [r.inicio, r.fim] = [r.fim, r.inicio];
  }

  // ---- renovação dos quantitativos (art. 84 da Lei 14.133/2021)
  const nega = /(sem\s+(a\s+)?renova[çc][ãa]o\s+(dos|de)\s+quantitativ|n[ãa]o\s+(haver[áa]|ocorrer[áa]|ser[ãa]o?)\s+(a\s+)?renova|n[ãa]o\s+(ser[ãa]o\s+)?renovad[oa]s?\s+(os\s+)?quantitativ|mantid[oa]s\s+os\s+(saldos|quantitativos)|saldo\s+remanescente)/i;
  const afirma = /(renova[çc][ãa]o\s+(integral\s+)?(dos|de\s+seus|de)\s+quantitativ|renovad[oa]s\s+(os\s+)?quantitativ|quantitativ[oa]s\s+(inicialmente\s+)?(registrad[oa]s\s+)?(ser[ãa]o\s+|ficam\s+)?renovad|restabelec\w+\s+(os\s+)?quantitativ|quantitativos\s+originais)/i;
  if (nega.test(t)) r.renova = false;
  else if (afirma.test(t)) r.renova = true;

  // ---- reequilíbrio: linhas "item … R$ 3.520,00 … 10,17% … R$ 3.877,98"
  if (/reequil|revis[ãa]o\s+(de|do)\s+pre|realinhamento|repactua/i.test(t)) {
    const re = /(?:item\s*|^|\s)(\d{1,3})\s+[^R]{0,400}?R\$\s*([\d.]+,\d{2,4})\s+(?:[^R]{0,80}?)R\$\s*([\d.]+,\d{2,4})/gi;
    let m; const vistos = new Set<number>();
    while ((m = re.exec(t))) {
      const n = Number(m[1]); const a = num(m[2]); const b = num(m[3]);
      if (!n || vistos.has(n) || !(b > 0) || a === b) continue;
      if (Math.abs(b - a) / a > 0.6) continue; // diferença grande demais: provavelmente não é preço velho/novo
      vistos.add(n); r.precos.push({ numero: n, preco_anterior: a, preco_novo: b });
    }
  }
  return r;
}

// ======================================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chave-sinc',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const API = 'https://pncp.gov.br/api';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function pegar(url: string, tentativas = 4): Promise<any> {
  let ultimo = 0;
  for (let i = 0; i < tentativas; i++) {
    try {
      const r = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'SOFT+ Consorcios (gestao-consorcio)' } });
      ultimo = r.status;
      if (r.status === 204 || r.status === 404) return null;
      if (r.ok) { const t = await r.text(); return t ? JSON.parse(t) : null; }
    } catch (_) { ultimo = -1; }
    await espera(1500 * 2 ** i);
  }
  throw new Error('PNCP não respondeu (' + (ultimo === -1 ? 'sem conexão' : 'HTTP ' + ultimo) + '): ' + url);
}
// Como pegar, mas devolve null em vez de erro (dados complementares)
async function talvez(url: string) { try { return await pegar(url, 3); } catch (_) { return null; } }
const iso = (d: Date) => d.toISOString().slice(0, 10);
const compacta = (d: string) => d.replace(/-/g, '');
const somaDias = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return iso(x); };
// "005/2026/2026" → "005/2026"; "7" + 2025 → "007/2025"
function numeroAta(n: string, ano: number) {
  const m = String(n || '').match(/^(\d{1,4})(?:\/(\d{4}))?/);
  if (!m) return String(n);
  return (m[1].length <= 3 ? m[1].padStart(3, '0') : m[1]) + '/' + (m[2] || ano);
}
// "15185079000140-1-000025/2025-000001" → { ano: 2025, seq: 25, ata: 1 }
function partes(controleAta: string) {
  const m = controleAta.match(/^(\d{14})-\d-(\d+)\/(\d{4})-(\d+)$/);
  return m ? { cnpj: m[1], seq: Number(m[2]), ano: Number(m[3]), ata: Number(m[4]) } : null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'consorcio' } });
  try {
    // ---- quem chamou
    const { data: cfg } = await sb.from('pncp_config').select('*').eq('id', 1).single();
    const chave = req.headers.get('x-chave-sinc');
    let origem = 'agenda';
    if (!chave || chave !== cfg.chave_sinc) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      const { data: quem } = await sb.auth.getUser(token);
      if (!quem?.user) return resposta({ erro: 'Não autorizado.' }, 401);
      const { data: u } = await sb.from('usuarios').select('perfil, ativo, nome').eq('id', quem.user.id).maybeSingle();
      if (!u || !u.ativo || !['administrador', 'operador'].includes(u.perfil)) return resposta({ erro: 'Sem permissão.' }, 403);
      origem = 'manual: ' + u.nome;
    }
    const cnpj = cfg.cnpj;
    const res = { atas_pncp: 0, novas: 0, prorrogacoes: 0, reequilibrios: 0, cancelamentos: 0, documentos_lidos: 0, erros: [] as string[] };

    // ---- 1. atas do órgão no PNCP (janelas de até 365 dias)
    const vistas = new Map<string, any>();
    let ini = new Date(cfg.desde + 'T00:00:00Z');
    const hoje = new Date();
    while (ini <= hoje) {
      const fim = new Date(Math.min(ini.getTime() + 364 * 86400000, hoje.getTime() + 400 * 86400000));
      for (let pag = 1; pag < 20; pag++) {
        const j = await pegar(`${API}/consulta/v1/atas?dataInicial=${compacta(iso(ini))}&dataFinal=${compacta(iso(fim))}&cnpj=${cnpj}&pagina=${pag}`);
        for (const a of (j && j.data) || []) vistas.set(a.numeroControlePNCPAta, a);
        if (!j || !j.paginasRestantes) break;
      }
      ini = new Date(fim.getTime() + 86400000);
    }
    res.atas_pncp = vistas.size;

    const { data: atas } = await sb.from('atas').select('*');
    const { data: periodos } = await sb.from('periodos').select('*');
    const { data: itens } = await sb.from('itens').select('id, ata_id, numero, preco_unitario');
    const { data: docsVistos } = await sb.from('pncp_documentos').select('url');
    const lidos = new Set((docsVistos || []).map((d: any) => d.url));
    const propor = async (p: any) => {
      const { error } = await sb.from('pncp_atualizacoes').upsert(p, { onConflict: 'chave', ignoreDuplicates: true });
      if (error) res.erros.push(error.message);
    };

    for (const [controle, a] of vistas) {
      try {
        const pt = partes(controle); if (!pt) continue;
        const numero = numeroAta(a.numeroAtaRegistroPreco, a.anoAta);
        let ata = (atas || []).find((x: any) => x.numero_controle_pncp === controle) || (atas || []).find((x: any) => x.numero === numero);
        if (ata && !ata.numero_controle_pncp) await sb.from('atas').update({ numero_controle_pncp: controle }).eq('id', ata.id);
        const base = `${API}/pncp/v1/orgaos/${pt.cnpj}/compras/${pt.ano}/${pt.seq}`;

        // ---- 2. ata nova
        if (!ata) {
          if (a.cancelado) continue;
          if (a.vigenciaFim && a.vigenciaFim.slice(0, 10) < iso(hoje)) continue;   // ata vencida: não interessa
          const det = await talvez(`${base}/atas/${pt.ata}`);
          if (det && det.possibilidadeAdesao === false) continue;
          const compra = await talvez(base);
          const lista = (await talvez(`${base}/itens?pagina=1&tamanhoPagina=500`)) || [];
          const grupos: Record<string, any> = {};
          for (const it of lista) {
            if (!it.temResultado) continue;
            const rs = (await talvez(`${base}/itens/${it.numeroItem}/resultados`)) || [];
            for (const r of rs) {
              const g = (grupos[r.niFornecedor] ||= { cnpj: r.niFornecedor, nome: r.nomeRazaoSocialFornecedor, itens: [] });
              g.itens.push({ numero: it.numeroItem, descricao: String(it.descricao || '').split('. Especificação')[0].slice(0, 300), unidade: it.unidadeMedida,
                qtd: Number(r.quantidadeHomologada || it.quantidade), preco: Number(r.valorUnitarioHomologado) });
            }
          }
          const lg = Object.values(grupos).sort((x: any, y: any) => x.itens[0].numero - y.itens[0].numero);
          const doAta = lg.length === 1 ? lg[0] : (lg[pt.ata - 1] || lg[0]);
          await propor({
            chave: 'nova:' + controle, tipo: 'nova_ata', ata_numero: numero, numero_controle: controle,
            resumo: `ARP ${numero} publicada no PNCP${doAta ? ' – ' + doAta.nome : ''} (${(doAta?.itens || []).length} item(ns)).`,
            dados: { numero, pregao: compra?.numeroCompra ? numeroAta(compra.numeroCompra, compra.anoCompra) : null, processo: compra?.processo || null,
              objeto: a.objetoContratacao || compra?.objetoCompra || null, detentora: doAta?.nome || null, cnpj_detentora: doAta?.cnpj || null,
              data_assinatura: a.dataAssinatura, inicio: a.vigenciaInicio, fim: a.vigenciaFim, itens: doAta?.itens || [],
              grupos: lg.length > 1 ? lg : undefined,
              aviso: lg.length > 1 ? 'A licitação tem mais de um contratado: confira se o contratado escolhido é o desta ata.' : !lg.length ? 'O PNCP não devolveu os itens e o resultado desta licitação. Confira os dados e cadastre os itens na tela da ata depois de confirmar.' : undefined },
          });
          res.novas++;
          continue;
        }

        // ---- 3. cancelamento
        if (a.cancelado && ata.ativo !== false) {
          await propor({ chave: 'cancel:' + controle, tipo: 'cancelamento', ata_id: ata.id, ata_numero: ata.numero, numero_controle: controle,
            resumo: `ARP ${ata.numero} consta como cancelada no PNCP.`, dados: { data: a.dataCancelamento } });
          res.cancelamentos++;
        }

        // ---- 4. termos aditivos (prorrogação e reequilíbrio)
        const arquivos = (await talvez(`${base}/atas/${pt.ata}/arquivos`)) || [];
        const ps = (periodos || []).filter((p: any) => p.ata_id === ata.id).sort((x: any, y: any) => x.numero - y.numero);
        const fimSistema = ps.length ? ps[ps.length - 1].fim : ata.vigencia_fim;
        let prorrogacaoPelaVigencia = a.vigenciaFim && fimSistema && a.vigenciaFim > fimSistema;
        for (const arq of arquivos) {
          const url = arq.url; const titulo = arq.titulo || '';
          if (lidos.has(url)) continue;
          if (!/aditiv|apostil|reequil|prorrog|renova/i.test(titulo)) { await sb.from('pncp_documentos').upsert({ url, titulo, ata_id: ata.id, resultado: 'sem interesse' }); continue; }
          let texto = '';
          try {
            const bin = new Uint8Array(await (await fetch(url)).arrayBuffer());
            const pdf = await getDocumentProxy(bin);
            texto = (await extractText(pdf, { mergePages: true })).text as string;
          } catch (e) { res.erros.push('PDF ' + titulo + ': ' + (e as Error).message); continue; }
          res.documentos_lidos++;
          const an = analisarAditivo(texto);
          const achados: string[] = [];
          if (an.prorrogacao) {
            const inicio = an.inicio || (fimSistema ? somaDias(fimSistema, 1) : null);
            const fim = an.fim || a.vigenciaFim;
            const jaTem = ps.some((p: any) => p.fim === fim);
            if (!jaTem && fim && (!fimSistema || fim > fimSistema)) {
              await propor({ chave: 'prorr:' + url, tipo: 'prorrogacao', ata_id: ata.id, ata_numero: ata.numero, numero_controle: controle,
                resumo: `ARP ${ata.numero} prorrogada até ${fim.split('-').reverse().join('/')}` + (an.renova ? ', com renovação dos quantitativos' : an.renova === false ? ', sem renovação dos quantitativos' : ' (renovação dos quantitativos não identificada: confira)') + '.',
                dados: { inicio, fim, renova: !!an.renova, renova_lido: an.renova, instrumento: an.instrumento || titulo, trecho: an.trecho },
                documento_titulo: titulo, documento_url: url });
              res.prorrogacoes++; prorrogacaoPelaVigencia = false; achados.push('prorrogação');
            } else if (jaTem) { prorrogacaoPelaVigencia = false; achados.push('prorrogação já cadastrada'); }
          }
          if (an.precos.length) {
            const mudam = an.precos.filter((p) => { const it = (itens || []).find((i: any) => i.ata_id === ata.id && i.numero === p.numero); return !it || Math.abs(Number(it.preco_unitario) - p.preco_novo) > 0.004; });
            if (mudam.length) {
              await propor({ chave: 'reeq:' + url, tipo: 'reequilibrio', ata_id: ata.id, ata_numero: ata.numero, numero_controle: controle,
                resumo: `ARP ${ata.numero}: novo preço em ${mudam.length} item(ns) (${an.instrumento || 'termo aditivo'}).`,
                dados: { itens: mudam, instrumento: an.instrumento || titulo }, documento_titulo: titulo, documento_url: url });
              res.reequilibrios++; achados.push('reequilíbrio');
            } else achados.push('preços já atualizados');
          }
          await sb.from('pncp_documentos').upsert({ url, titulo, ata_id: ata.id, resultado: achados.join(', ') || 'nada identificado' });
        }
        // Vigência estendida no PNCP sem aditivo legível: propõe a prorrogação para conferir
        if (prorrogacaoPelaVigencia) {
          await propor({ chave: 'vig:' + controle + ':' + a.vigenciaFim, tipo: 'prorrogacao', ata_id: ata.id, ata_numero: ata.numero, numero_controle: controle,
            resumo: `ARP ${ata.numero}: o PNCP mostra vigência até ${a.vigenciaFim.split('-').reverse().join('/')}, mas o termo aditivo não foi lido. Confira se renovou os quantitativos.`,
            dados: { inicio: fimSistema ? somaDias(fimSistema, 1) : a.vigenciaInicio, fim: a.vigenciaFim, renova: false, renova_lido: null } });
          res.prorrogacoes++;
        }
      } catch (e) { res.erros.push(controle + ': ' + (e as Error).message); }
    }

    await sb.from('pncp_config').update({ ultima_execucao: new Date().toISOString(), ultimo_resultado: { ...res, origem } }).eq('id', 1);
    return resposta({ ok: true, ...res });
  } catch (e) {
    await sb.from('pncp_config').update({ ultima_execucao: new Date().toISOString(), ultimo_resultado: { erro: (e as Error).message } }).eq('id', 1);
    return resposta({ erro: (e as Error).message }, 500);
  }
});
