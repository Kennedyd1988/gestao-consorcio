// Edge Function "consorcio-etp-pncp" (Gestão de Consórcio, schema consorcio) – módulo Pesquisa de preços e quantitativos (ETP)
// Lê no PNCP o histórico de contratações de cada CNPJ da fila (consorcio.etp_fila): compras (licitações, dispensas,
// inexigibilidades…), itens, resultados (preço homologado e contratado) e contratos. Grava em consorcio.etp_*.
// Os dados do PNCP são públicos e ficam num lugar só para todos os consórcios.
// Chamadas:
//   {acao:'processar'}            – agenda a cada 5 min (cabeçalho x-chave-sinc) ou botão "Buscar agora" (usuário que edita o módulo)
//   {acao:'descobrir', municipio, uf} – usuário: CNPJs que publicam no PNCP no município (prefeitura, fundos, câmara…)
// Publicar com "Verify JWT" DESLIGADO (a conferência é feita aqui).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-chave-sinc',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const API = 'https://pncp.gov.br/api';
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const LIMITE_FALHAS = 25;          // números seguidos sem compra para dar o ano por lido
const PARALELO = 1;                // uma leitura por vez (o PNCP limita consultas seguidas: HTTP 429)
const INTERVALO = 700;             // pausa mínima entre consultas (ms)
let PRAZO = 0;                     // hora-limite desta execução (ms)
let FREIO = false;                 // o PNCP pediu para parar (429 repetido): encerra esta execução
const temTempo = (folga = 0) => !FREIO && Date.now() + folga < PRAZO;
let ultimaConsulta = 0;
async function vez() { const agora = Date.now(); const t = Math.max(0, ultimaConsulta + INTERVALO - agora); ultimaConsulta = agora + t; if (t) await espera(t); }

// Busca com novas tentativas. Devolve null para 204/404.
async function pegar(url: string, tentativas = 3, limiteMs = 25000): Promise<any> {
  let ultimo = '';
  let limitados = 0;
  for (let i = 0; i < tentativas + limitados && i < 6; i++) {
    if (FREIO) break;
    await vez();
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), limiteMs);
    try {
      const r = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json', 'user-agent': 'SOFT+ Consorcios (gestao-consorcio; etp)' } });
      if (r.status === 204 || r.status === 404 || r.status === 410) return null;   // 410: compra excluída no PNCP
      if (r.ok) { const txt = await r.text(); return txt ? JSON.parse(txt) : null; }
      ultimo = 'HTTP ' + r.status;
      if (r.status === 400) return null;
      if (r.status === 429) {
        limitados++;
        if (limitados >= 3) { FREIO = true; break; }
        const ra = Number(r.headers.get('retry-after')) || 0;
        await espera(Math.min(30000, Math.max(ra * 1000, 8000 * limitados)));
        continue;
      }
    } catch (e) { ultimo = (e as Error).name === 'AbortError' ? 'tempo esgotado' : (e as Error).message; }
    finally { clearTimeout(t); }
    if (!temTempo(5000)) break;
    await espera(800 * 2 ** i);
  }
  throw new Error(FREIO ? 'O PNCP limitou as consultas; continua na próxima rodada' : 'PNCP não respondeu (' + ultimo + ')');
}
const data = (v: unknown) => (v ? String(v).slice(0, 10) : null);
const num = (v: unknown) => (v == null || v === '' ? null : Number(v));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'consorcio' }, auth: { persistSession: false } });
  FREIO = false;   // a instância pode ser reaproveitada entre chamadas
  try {
    const corpo = await req.json().catch(() => ({}));
    const acao = corpo.acao || 'processar';
    const { data: cfg } = await sb.from('etp_config').select('*').eq('id', 1).single();
    const chave = req.headers.get('x-chave-sinc');
    let origem = 'agenda';
    if (!chave || chave !== cfg?.chave_sinc) {
      const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      const { data: quem } = await sb.auth.getUser(token);
      if (!quem?.user) return resposta({ erro: 'Entre novamente no sistema.' }, 401);
      const { data: u } = await sb.from('usuarios').select('*').eq('id', quem.user.id).maybeSingle();
      if (!u || !u.ativo) return resposta({ erro: 'Sem permissão.' }, 403);
      const cons = u.consorcio_atual;
      let ok = !!u.suporte;
      if (!ok && cons) {
        const { data: v } = await sb.from('usuario_consorcios').select('perfil, ativo').eq('usuario_id', u.id).eq('consorcio_id', cons).maybeSingle();
        if (v && v.ativo && v.perfil === 'administrador') ok = true;
        else if (v && v.ativo) {
          const { data: m } = await sb.from('usuario_modulos').select('perfil').eq('usuario_id', u.id).eq('consorcio_id', cons).eq('modulo_id', 'etp').maybeSingle();
          ok = !!m && ['administrador', 'operador'].includes(m.perfil);
        }
      }
      if (!ok) return resposta({ erro: 'Sem permissão no módulo de pesquisa de preços.' }, 403);
      origem = 'manual: ' + u.nome;
    }

    // ------------------------------------------------ descobrir CNPJs de um município
    if (acao === 'descobrir') {
      PRAZO = Date.now() + 100000;
      const uf = String(corpo.uf || '').toUpperCase().slice(0, 2);
      const nomeMun = String(corpo.municipio || '').trim();
      if (!uf || !nomeMun) return resposta({ erro: 'Informe município e UF.' }, 400);
      const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      const ibgeLista = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`).then((r) => r.json()).catch(() => null);
      const mun = (ibgeLista || []).find((m: any) => norm(m.nome) === norm(nomeMun.replace(/^munic[ií]pio de\s+/i, '').replace(/\/[A-Z]{2}$/, '')));
      if (!mun) return resposta({ erro: 'Município não encontrado no IBGE: ' + nomeMun + '/' + uf }, 404);
      const fim = new Date(); const ini = new Date(Date.now() - 180 * 86400000);
      const d8 = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
      const achados = new Map<string, any>();
      await Promise.all([8, 6, 9, 4, 5, 7].map(async (mod) => {
        for (let pag = 1; pag <= 4 && temTempo(8000); pag++) {
          let j: any = null;
          try { j = await pegar(`${API}/consulta/v1/contratacoes/publicacao?dataInicial=${d8(ini)}&dataFinal=${d8(fim)}&codigoModalidadeContratacao=${mod}&codigoMunicipioIbge=${mun.id}&pagina=${pag}&tamanhoPagina=50`, 2, 40000); } catch (_) { break; }
          for (const x of (j && j.data) || []) {
            const o = x.orgaoEntidade || {};
            if (o.esferaId && o.esferaId !== 'M') continue;
            const a = achados.get(o.cnpj) || { cnpj: o.cnpj, nome: o.razaoSocial, unidades: new Set<string>(), compras: 0 };
            a.compras++; if (x.unidadeOrgao?.nomeUnidade) a.unidades.add(x.unidadeOrgao.nomeUnidade);
            achados.set(o.cnpj, a);
          }
          if (!j || !j.paginasRestantes) break;
        }
      }));
      const lista = [...achados.values()].map((a) => ({ ...a, unidades: [...a.unidades].slice(0, 5) })).sort((a, b) => b.compras - a.compras);
      return resposta({ ok: true, municipio: mun.nome, codigo_ibge: String(mun.id), cnpjs: lista });
    }

    // ------------------------------------------------ processar a fila
    if (!cfg?.ativo && origem === 'agenda') return resposta({ ok: true, pausado: true });
    if (cfg?.rodando_ate && new Date(cfg.rodando_ate).getTime() > Date.now()) return resposta({ ok: true, ocupado: true, ate: cfg.rodando_ate });
    PRAZO = Date.now() + (origem === 'agenda' ? 115000 : 60000);
    await sb.from('etp_config').update({ rodando_ate: new Date(PRAZO + 20000).toISOString() }).eq('id', 1);
    const res = { compras: 0, itens: 0, resultados: 0, contratos: 0, anos_concluidos: 0, revisitadas: 0, limitado: false, erros: [] as string[] };
    const tocados = new Set<string>();
    try {
      await sb.rpc('etp_sincronizar');
      const anoAtual = new Date().getFullYear();
      // Ano em curso já lido há mais de 1 dia: volta a olhar a partir do último número achado (compras novas)
      await sb.from('etp_fila').update({ concluido: false, falhas_seguidas: 0 })
        .eq('ano', anoAtual).eq('concluido', true).lt('atualizado_em', new Date(Date.now() - 86400000).toISOString());

      // ---- uma compra: detalhe, itens e resultados
      const lerCompra = async (cnpj: string, ano: number, seq: number, existente?: any): Promise<boolean> => {
        const det = await pegar(`${API}/consulta/v1/orgaos/${cnpj}/compras/${ano}/${seq}`);
        if (!det) return false;
        const controle = det.numeroControlePNCP || `${cnpj}-1-${String(seq).padStart(6, '0')}/${ano}`;
        const itens: any[] = [];
        for (let pag = 1; pag <= 20; pag++) {
          const l = await pegar(`${API}/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens?pagina=${pag}&tamanhoPagina=500`);
          if (!l || !l.length) break;
          itens.push(...l);
          if (l.length < 500) break;
        }
        const compra = {
          numero_controle: controle, cnpj, ano, sequencial: seq, numero_compra: det.numeroCompra || null, processo: det.processo || null,
          modalidade_id: det.modalidadeId || null, modalidade: det.modalidadeNome || null, srp: det.srp ?? null, objeto: det.objetoCompra || null,
          situacao: det.situacaoCompraNome || null, valor_estimado: num(det.valorTotalEstimado), valor_homologado: num(det.valorTotalHomologado),
          data_publicacao: data(det.dataPublicacaoPncp || det.dataInclusao), data_abertura: data(det.dataAberturaProposta),
          unidade: det.unidadeOrgao?.nomeUnidade || null, municipio: det.unidadeOrgao?.municipioNome || null, uf: det.unidadeOrgao?.ufSigla || null,
          codigo_ibge: det.unidadeOrgao?.codigoIbge || null, amparo: det.amparoLegal?.nome || null,
          link: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${seq}`, itens_qtd: itens.length, resultados_pendentes: 0, lido_em: new Date().toISOString(),
        };
        let e = (await sb.from('etp_compras').upsert(compra)).error; if (e) throw new Error('Compra ' + controle + ': ' + e.message);
        if (!existente) {
          await sb.from('etp_orgaos').update({ nome: det.orgaoEntidade?.razaoSocial || null, uf: compra.uf, municipio: compra.municipio, codigo_ibge: compra.codigo_ibge, esfera: det.orgaoEntidade?.esferaId || null }).eq('cnpj', cnpj);
        }
        if (itens.length) {
          const linhas = itens.map((it) => ({
            numero_controle: controle, cnpj, ano, data_ref: compra.data_abertura || compra.data_publicacao, numero_item: it.numeroItem,
            descricao: String(it.descricao || '(sem descrição)').slice(0, 6000), material_servico: it.materialOuServico || null, unidade: it.unidadeMedida || null,
            quantidade: num(it.quantidade), valor_unitario_estimado: num(it.valorUnitarioEstimado), valor_total_estimado: num(it.valorTotal),
            catalogo_codigo: it.catalogoCodigoItem ? String(it.catalogoCodigoItem) : null, ncm: it.ncmNbsCodigo || null,
            criterio: it.criterioJulgamentoNome || null, situacao: it.situacaoCompraItemNome || null, tem_resultado: !!it.temResultado,
          }));
          for (let k = 0; k < linhas.length; k += 500) {
            e = (await sb.from('etp_itens').upsert(linhas.slice(k, k + 500), { onConflict: 'numero_controle,numero_item' })).error;
            if (e) throw new Error('Itens ' + controle + ': ' + e.message);
          }
          const { data: ids } = await sb.from('etp_itens').select('id, numero_item').eq('numero_controle', controle);
          const idDo = new Map((ids || []).map((x: any) => [x.numero_item, x.id]));
          let pend = 0;
          const comRes = itens.filter((it) => it.temResultado);
          // situação "em andamento" sem resultado: volta depois para buscar o resultado
          pend = itens.filter((it) => !it.temResultado && /andamento/i.test(it.situacaoCompraItemNome || '')).length;
          for (let k = 0; k < comRes.length; k += PARALELO) {
            if (!temTempo(6000)) { pend += comRes.length - k; break; }
            await Promise.all(comRes.slice(k, k + PARALELO).map(async (it) => {
              const id = idDo.get(it.numeroItem); if (!id) return;
              let rs: any[] | null = null;
              try { rs = await pegar(`${API}/pncp/v1/orgaos/${cnpj}/compras/${ano}/${seq}/itens/${it.numeroItem}/resultados`); } catch (_) { pend++; return; }
              const lr = (rs || []).map((r: any, o: number) => ({ item_id: id, ordem: o + 1, ni_fornecedor: r.niFornecedor || null, fornecedor: r.nomeRazaoSocialFornecedor || null,
                porte: r.porteFornecedorNome || (r.porteFornecedorId ? String(r.porteFornecedorId) : null), quantidade: num(r.quantidadeHomologada),
                valor_unitario: num(r.valorUnitarioHomologado), valor_total: num(r.valorTotalHomologado), data_resultado: data(r.dataResultado || r.dataInclusao),
                cancelado: !!r.dataCancelamento }));
              await sb.from('etp_resultados').delete().eq('item_id', id);
              if (lr.length) { const er = (await sb.from('etp_resultados').insert(lr)).error; if (er) res.erros.push('Resultado ' + controle + '/' + it.numeroItem + ': ' + er.message); }
              res.resultados += lr.length;
            }));
          }
          if (pend) await sb.from('etp_compras').update({ resultados_pendentes: pend }).eq('numero_controle', controle);
          res.itens += itens.length;
        }
        res.compras++;
        return true;
      };

      // ---- contratos do ano (uma consulta por ano; o PNCP é lento aqui)
      const lerContratos = async (cnpj: string, ano: number) => {
        const fimAno = ano === anoAtual ? new Date().toISOString().slice(0, 10).replace(/-/g, '') : `${ano}1231`;
        for (let pag = 1; pag <= 20 && temTempo(30000); pag++) {
          const j = await pegar(`${API}/consulta/v1/contratos?dataInicial=${ano}0101&dataFinal=${fimAno}&cnpjOrgao=${cnpj}&pagina=${pag}&tamanhoPagina=50`, 2, 60000);
          const lista = (j && j.data) || [];
          if (lista.length) {
            const linhas = lista.map((c: any) => ({ numero_controle: c.numeroControlePNCP, cnpj, ano: c.anoContrato || ano, compra_controle: c.numeroControlePncpCompra || null,
              ata_controle: c.numeroControlePncpAta || null, numero: c.numeroContratoEmpenho || null, processo: c.processo || null, tipo: c.tipoContrato?.nome || null,
              categoria: c.categoriaProcesso?.nome || null, objeto: c.objetoContrato || null, ni_fornecedor: c.niFornecedor || null, fornecedor: c.nomeRazaoSocialFornecedor || null,
              valor_inicial: num(c.valorInicial), valor_global: num(c.valorGlobal), data_assinatura: data(c.dataAssinatura), vigencia_inicio: data(c.dataVigenciaInicio),
              vigencia_fim: data(c.dataVigenciaFim) }));
            const er = (await sb.from('etp_contratos').upsert(linhas)).error; if (er) res.erros.push('Contratos ' + cnpj + '/' + ano + ': ' + er.message);
            res.contratos += linhas.length;
          }
          if (!j || !j.paginasRestantes) return true;
        }
        return !temTempo(30000) ? false : true;
      };

      // ---- 1. revisitar compras com resultado pendente (lidas há mais de 3 dias, dos últimos 18 meses)
      const { data: pendentes } = await sb.from('etp_compras').select('numero_controle, cnpj, ano, sequencial')
        .gt('resultados_pendentes', 0).lt('lido_em', new Date(Date.now() - 3 * 86400000).toISOString())
        .gte('data_publicacao', new Date(Date.now() - 548 * 86400000).toISOString().slice(0, 10)).order('lido_em').limit(10);
      for (const p of pendentes || []) {
        if (!temTempo(40000)) break;
        try { await lerCompra(p.cnpj, p.ano, p.sequencial, p); res.revisitadas++; tocados.add(p.cnpj); }
        catch (e) { res.erros.push(p.numero_controle + ': ' + (e as Error).message); await sb.from('etp_compras').update({ lido_em: new Date().toISOString() }).eq('numero_controle', p.numero_controle); }
      }

      // ---- 2. fila: anos não concluídos, dos órgãos prioritários e dos anos mais recentes primeiro
      const { data: orgs } = await sb.from('etp_orgaos').select('cnpj, prioridade').neq('situacao', 'pausado');
      const prio = new Map((orgs || []).map((o: any) => [o.cnpj, o.prioridade]));
      const { data: fila } = await sb.from('etp_fila').select('*').or('concluido.eq.false,contratos_lidos.eq.false').limit(500);
      const trabalhos = (fila || []).filter((f: any) => prio.has(f.cnpj))
        .sort((a: any, b: any) => (prio.get(a.cnpj)! - prio.get(b.cnpj)!) || (b.ano - a.ano) || a.cnpj.localeCompare(b.cnpj));
      let indice = 0;
      const trabalhador = async () => {
        while (temTempo(15000) && indice < trabalhos.length) {
          const f = trabalhos[indice++];
          tocados.add(f.cnpj);
          if (!f.concluido) {
            let seq = f.proximo_seq, falhas = f.falhas_seguidas, ultimo = f.ultimo_achado;
            while (temTempo(15000) && falhas < LIMITE_FALHAS) {
              try {
                const achou = await lerCompra(f.cnpj, f.ano, seq);
                if (achou) { falhas = 0; ultimo = Math.max(ultimo, seq); } else falhas++;
                seq++;
              } catch (e) {
                res.erros.push(`${f.cnpj} ${f.ano}/${seq}: ${(e as Error).message}`);
                break;   // tenta de novo na próxima execução, do mesmo número
              }
              await sb.from('etp_fila').update({ proximo_seq: seq, falhas_seguidas: falhas, ultimo_achado: ultimo, atualizado_em: new Date().toISOString() }).eq('cnpj', f.cnpj).eq('ano', f.ano);
            }
            if (falhas >= LIMITE_FALHAS) {
              // ano lido: no ano em curso, volta para logo depois do último achado (compras novas entram depois)
              await sb.from('etp_fila').update({ concluido: true, proximo_seq: ultimo + 1, falhas_seguidas: 0, atualizado_em: new Date().toISOString() }).eq('cnpj', f.cnpj).eq('ano', f.ano);
              res.anos_concluidos++; f.concluido = true;
            }
          }
          if (f.concluido && !f.contratos_lidos && temTempo(45000)) {
            try { if (await lerContratos(f.cnpj, f.ano)) await sb.from('etp_fila').update({ contratos_lidos: f.ano < anoAtual }).eq('cnpj', f.cnpj).eq('ano', f.ano); }
            catch (e) { res.erros.push(`Contratos ${f.cnpj} ${f.ano}: ${(e as Error).message}`); }
          }
        }
      };
      await Promise.all(Array.from({ length: PARALELO }, trabalhador));
      res.limitado = FREIO;
      for (const c of tocados) await sb.rpc('etp_recontar', { p_cnpj: c });
    } finally {
      await sb.from('etp_config').update({ rodando_ate: null, ultima_execucao: new Date().toISOString(), ultimo_resultado: { ...res, erros: res.erros.slice(0, 20), origem } }).eq('id', 1);
    }
    return resposta({ ok: true, ...res, erros: res.erros.slice(0, 20) });
  } catch (e) {
    return resposta({ erro: (e as Error).message }, 500);
  }
});
