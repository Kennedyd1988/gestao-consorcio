/* Camada de dados: Supabase (produção) ou demonstração (prévia, dados só no navegador). */
(function () {
  const R = window.REGRAS;
  const CFG = window.CONFIG || {};
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Math.random().toString(36).slice(2) + Date.now());
  const CONFIG_PADRAO = {
    orgao_nome: 'Consórcio Intermunicipal Multifinalitário dos Municípios do Oeste Potiguar', sigla: 'CIMOP', cidade_uf: 'Portalegre/RN',
    presidente_nome: 'MARCOS AURÉLIO DE PAIVA RÊGO', presidente_cargo: 'Presidente do CIMOP',
    resolucao_srp: 'Resolução CIMOP nº 018/2023', resolucao_alteracao: 'Resolução CIMOP nº 001/2026',
    texto_anexos: 'Conforme solicitado, encaminhamos, em anexo, o processo integral do {pregao}, bem como a Resolução CIMOP nº 018/2023 e a Resolução CIMOP nº 001/2026, que a altera.',
  };

  function indexar(b) {
    b.atasPorId = {}; b.itensPorId = {}; b.orgaosPorId = {}; b.pedidosPorId = {};
    b.solicitacoes = (b.solicitacoes || []).sort((x, y) => (y.criado_em || '').localeCompare(x.criado_em || ''));
    b.atas.forEach((a) => { b.atasPorId[a.id] = a; a._qtdItens = 0; });
    b.itens.forEach((i) => { b.itensPorId[i.id] = i; if (b.atasPorId[i.ata_id]) b.atasPorId[i.ata_id]._qtdItens++; });
    b.orgaos.forEach((o) => (b.orgaosPorId[o.id] = o));
    b.pedidos.forEach((p) => (b.pedidosPorId[p.id] = p));
    b.itens.sort((x, y) => x.numero - y.numero);
    b.atas.sort((x, y) => y.numero.slice(-4).localeCompare(x.numero.slice(-4)) || y.numero.localeCompare(x.numero));
    b.orgaos.sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
    return b;
  }

  // ===================== DEMONSTRAÇÃO =====================
  function criarDemo() {
    const CHAVE = 'softplus-adesoes-demo-v1';
    let base;
    const salvarLocal = () => { try { localStorage.setItem(CHAVE, JSON.stringify(limpo())); } catch (e) {} };
    const limpo = () => ({ config: base.config, atas: base.atas, itens: base.itens, orgaos: base.orgaos, pedidos: base.pedidos, pedido_itens: base.pedido_itens, solicitacoes: base.solicitacoes });
    function semente() {
      const b = { config: { ...CONFIG_PADRAO }, atas: [], itens: [], orgaos: [], pedidos: [], pedido_itens: [], solicitacoes: [] };
      if (window.DEMO_SEMENTE) importarLocal(b, window.DEMO_SEMENTE);
      // Uma solicitação de exemplo, como se tivesse chegado pelo formulário online
      const it = (arp, n) => { const a = b.atas.find((x) => x.numero === arp); const i = a && b.itens.find((x) => x.ata_id === a.id && x.numero === n); return i && i.id; };
      const i1 = it('001/2026', 1), i3 = it('003/2026', 3);
      if (i1 && i3) b.solicitacoes.push({ id: uid(), protocolo: 'SOL-2026-0001', situacao: 'recebida', cnpj: '08358013000106', orgao_nome: 'Município de Severiano Melo/RN',
        municipio: 'Severiano Melo', uf: 'RN', esfera: 'Municipal', responsavel: 'NOME DO PREFEITO (EXEMPLO)', cargo: 'Prefeito Municipal', email: 'gabinete@severianomelo.rn.gov.br', telefone: '(84) 0000-0000',
        oficio_numero: '088/2026', oficio_data: '2026-11-14', finalidade: 'à recuperação de estradas vicinais da zona rural do Município',
        itens: [{ item_id: i1, qtd: 200 }, { item_id: i3, qtd: 60 }], arquivos: [{ tipo: 'Ofício de solicitação', nome: 'Oficio_088_2026_Severiano_Melo.pdf', tamanho: 182000 }],
        declaracao: true, criado_em: '2026-11-17T09:12:00-03:00' });
      return b;
    }
    async function carregar() {
      if (!base) {
        let s = null;
        try { s = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch (e) {}
        base = s || semente();
        base.solicitacoes = base.solicitacoes || [];
      }
      return indexar(base);
    }
    const api = {
      modo: 'demo',
      async sessao() { return { id: '1', nome: 'Kennedy Dantas Francelino', email: 'kennedyfrancelino@gmail.com', perfil: 'administrador' }; },
      async entrar() { return api.sessao(); }, async sair() {}, async trocarSenha() {}, async esqueci() {},
      carregar,
      async reiniciarDemo() { try { localStorage.removeItem(CHAVE); } catch (e) {} base = semente(); return indexar(base); },
      async salvar(tabela, reg) {
        const lista = base[tabela];
        if (!reg.id) { reg.id = uid(); lista.push(reg); } else { const i = lista.findIndex((x) => x.id === reg.id); i >= 0 ? (lista[i] = { ...lista[i], ...reg }) : lista.push(reg); }
        if (tabela === 'pedidos' && reg.numero_oficio && lista.some((p) => p.id !== reg.id && p.numero_oficio === reg.numero_oficio)) throw new Error('Já existe um ofício com o número ' + reg.numero_oficio + '.');
        salvarLocal(); indexar(base); return reg;
      },
      async salvarConfig(c) { base.config = { ...base.config, ...c }; salvarLocal(); },
      async registrarPedido(p) {
        indexar(base);
        if (p.numero_oficio && base.pedidos.some((x) => x.numero_oficio === p.numero_oficio)) throw new Error('Já existe um ofício com o número ' + p.numero_oficio + '.');
        const org = base.orgaosPorId[p.orgao_id];
        const res = p.origem === 'migracao' ? p.itens.map((l) => ({ item: base.itensPorId[l.item_id], q: Number(l.qtd), decisao: 'autorizado', ...R.usado(base, l.item_id, org.id) }))
          : R.analisar(base, org, p.data_oficio, p.itens);
        const ped = { id: uid(), numero_oficio: p.numero_oficio || null, data_oficio: p.data_oficio, orgao_id: org.id, oficio_solicitante: p.oficio_solicitante, data_solicitante: p.data_solicitante,
          finalidade: p.finalidade, anexos_texto: p.anexos_texto, origem: p.origem || 'sistema', situacao: R.situacao(res), criado_em: new Date().toISOString(), criado_por_nome: 'Kennedy Dantas Francelino' };
        base.pedidos.push(ped);
        res.forEach((r) => base.pedido_itens.push({ id: uid(), pedido_id: ped.id, item_id: r.item.id, qtd_solicitada: r.q, qtd_autorizada: r.decisao === 'autorizado' ? r.q : 0,
          decisao: r.decisao, motivo: r.motivo || null, usado_orgao_antes: r.usadoOrgao ?? r.org, usado_total_antes: r.usadoTotal ?? r.tot }));
        salvarLocal(); indexar(base); return ped.id;
      },
      async cancelarPedido(id, motivo) { const p = base.pedidos.find((x) => x.id === id); p.situacao = 'cancelado'; p.motivo_cancelamento = motivo; salvarLocal(); },
      async importar(dados, aoProgredir) { const r = importarLocal(base, dados, aoProgredir, api); salvarLocal(); indexar(base); return r; },
      async publicoAtas() {
        await carregar();
        const hojeISO = new Date().toISOString().slice(0, 10);
        return base.atas.filter((a) => a.ativo !== false && (!a.vigencia_fim || a.vigencia_fim >= hojeISO)).map((a) => ({ ...a,
          itens: base.itens.filter((i) => i.ata_id === a.id).map((i) => ({ ...i, aderido: R.usado(base, i.id, null).tot })) }));
      },
      async publicoOrgao(cnpj) {
        await carregar();
        const o = base.orgaos.find((x) => x.cnpj === cnpj && x.ativo !== false);
        const aderido = {};
        if (o) base.itens.forEach((i) => { const u = R.usado(base, i.id, o.id).org; if (u) aderido[i.id] = u; });
        return { orgao: o ? { nome: o.nome, municipio: o.municipio, uf: o.uf, esfera: o.esfera, responsavel: o.responsavel, cargo: o.cargo, email: o.email } : null, aderido };
      },
      async enviarSolicitacao(p, arquivos) {
        await carregar();
        const ano = new Date().getFullYear();
        const n = base.solicitacoes.filter((x) => x.protocolo.includes('-' + ano + '-')).length + 1;
        const protocolo = 'SOL-' + ano + '-' + String(n).padStart(4, '0');
        base.solicitacoes.push({ ...p, id: uid(), protocolo, situacao: 'recebida', criado_em: new Date().toISOString(),
          arquivos: arquivos.map((a) => ({ tipo: a.tipo, nome: a.arquivo.name, tamanho: a.arquivo.size })) });
        salvarLocal(); return protocolo;
      },
      async consultarSolicitacao(protocolo, cnpj) {
        await carregar();
        const s = base.solicitacoes.find((x) => x.protocolo === protocolo.trim().toUpperCase() && x.cnpj === cnpj);
        return s ? { protocolo: s.protocolo, situacao: s.situacao, criado_em: s.criado_em, motivo_recusa: s.motivo_recusa, oficio: s.pedido_id && base.pedidosPorId[s.pedido_id] ? base.pedidosPorId[s.pedido_id].numero_oficio : null } : null;
      },
      async atualizarSolicitacao(id, campos) { const x = base.solicitacoes.find((y) => y.id === id); Object.assign(x, campos, { atualizado_em: new Date().toISOString() }); salvarLocal(); },
      async urlArquivo() { return null; },
      async usuarios() { return [{ id: '1', nome: 'Kennedy Dantas Francelino', email: 'kennedyfrancelino@gmail.com', perfil: 'administrador', ativo: true }]; },
      async criarUsuario() { throw new Error('Na prévia não é possível criar usuários. Isso funciona na versão publicada.'); },
      async salvarUsuario() {},
    };
    return api;
  }

  // Importação em memória (demo) – mesma lógica da versão Supabase
  function importarLocal(b, d) {
    const resumo = { atas: 0, itens: 0, orgaos: 0, pedidos: 0, ignorados: 0 };
    indexar(b);
    for (const a of d.atas) {
      let x = b.atas.find((y) => y.numero === a.numero);
      if (!x) { x = { id: uid() }; b.atas.push(x); }
      Object.assign(x, a); resumo.atas++;
    }
    indexar(b);
    for (const i of d.itens) {
      const ata = b.atas.find((y) => y.numero === i.ata_numero); if (!ata) continue;
      let x = b.itens.find((y) => y.ata_id === ata.id && y.numero === i.numero);
      if (!x) { x = { id: uid(), ata_id: ata.id }; b.itens.push(x); }
      const { ata_numero, ...resto } = i; Object.assign(x, resto); resumo.itens++;
    }
    for (const o of d.orgaos) {
      let x = (o.cnpj && b.orgaos.find((y) => y.cnpj === o.cnpj)) || b.orgaos.find((y) => R_norm(y.nome) === R_norm(o.nome));
      if (!x) { x = { id: uid() }; b.orgaos.push(x); }
      Object.assign(x, Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))); resumo.orgaos++;
    }
    indexar(b);
    for (const g of agruparAdesoes(d.adesoes)) {
      if (g.numero_oficio && b.pedidos.some((p) => p.numero_oficio === g.numero_oficio && b.orgaosPorId[p.orgao_id] && R_norm(b.orgaosPorId[p.orgao_id].nome) === R_norm(g.orgao_nome))) { resumo.ignorados++; continue; }
      const org = b.orgaos.find((y) => R_norm(y.nome) === R_norm(g.orgao_nome)); if (!org) continue;
      const ped = { id: uid(), numero_oficio: g.numero_oficio, data_oficio: g.data_oficio, orgao_id: org.id, oficio_solicitante: g.oficio_solicitante, origem: 'migracao', situacao: 'autorizado', criado_em: new Date().toISOString(), criado_por_nome: 'Migração da planilha' };
      if (ped.numero_oficio && b.pedidos.some((p) => p.numero_oficio === ped.numero_oficio)) ped.numero_oficio = ped.numero_oficio + ' (' + (org.municipio || org.nome) + ')';
      b.pedidos.push(ped);
      for (const l of g.linhas) {
        const ata = b.atas.find((y) => y.numero === l.ata_numero); const it = ata && b.itens.find((y) => y.ata_id === ata.id && y.numero === l.item);
        if (!it) continue;
        b.pedido_itens.push({ id: uid(), pedido_id: ped.id, item_id: it.id, qtd_solicitada: l.qtd, qtd_autorizada: l.qtd, decisao: 'autorizado' });
      }
      resumo.pedidos++;
    }
    return resumo;
  }
  const R_norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Um pedido = mesmo ofício do CIMOP + mesmo órgão (sem ofício: órgão + ARP)
  function agruparAdesoes(ads) {
    const m = new Map();
    for (const a of ads) {
      const k = (a.numero_oficio || 'SEM:' + a.ata_numero) + '|' + R_norm(a.orgao_nome);
      if (!m.has(k)) m.set(k, { numero_oficio: a.numero_oficio || null, data_oficio: a.data_oficio || null, orgao_nome: a.orgao_nome, oficio_solicitante: a.oficio_solicitante || null, linhas: [] });
      const g = m.get(k);
      g.data_oficio = g.data_oficio || a.data_oficio; g.oficio_solicitante = g.oficio_solicitante || a.oficio_solicitante;
      g.linhas.push({ ata_numero: a.ata_numero, item: a.item, qtd: a.qtd });
    }
    return [...m.values()];
  }

  // ===================== SUPABASE =====================
  function criarSupabase() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    const ok = ({ data, error }) => { if (error) throw new Error(traduzir(error)); return data; };
    const traduzir = (e) => {
      const m = e.message || String(e);
      if (/duplicate key.*numero_oficio/i.test(m)) return 'Já existe um ofício com esse número.';
      if (/duplicate key.*cnpj/i.test(m)) return 'Já existe um órgão com esse CNPJ.';
      if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
      if (/row-level security|permission denied/i.test(m)) return 'Você não tem permissão para esta ação.';
      return m;
    };
    async function tudo(tabela, ordem) {
      let out = [], de = 0;
      for (;;) { const d = ok(await sb.from(tabela).select('*').order(ordem || 'id').range(de, de + 999)); out = out.concat(d); if (d.length < 1000) break; de += 1000; }
      return out;
    }
    const api = {
      modo: 'supabase', sb,
      async sessao() {
        const { data } = await sb.auth.getSession(); if (!data.session) return null;
        const u = ok(await sb.from('usuarios').select('*').eq('id', data.session.user.id).maybeSingle());
        if (!u || !u.ativo) { await sb.auth.signOut(); throw new Error('Seu acesso não está ativo. Fale com o administrador.'); }
        return u;
      },
      async entrar(email, senha) { ok(await sb.auth.signInWithPassword({ email, password: senha })); return api.sessao(); },
      async sair() { await sb.auth.signOut(); },
      async esqueci(email) { ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async trocarSenha(nova) { ok(await sb.auth.updateUser({ password: nova })); const { data } = await sb.auth.getUser(); await sb.from('usuarios').update({ troca_senha: false }).eq('id', data.user.id); },
      async carregar() {
        const [config, atas, itens, orgaos, pedidos, pedido_itens, solicitacoes] = await Promise.all([
          sb.from('configuracoes').select('*').eq('id', 1).single().then(ok), tudo('atas'), tudo('itens'), tudo('orgaos'), tudo('pedidos'), tudo('pedido_itens'),
          tudo('solicitacoes', 'criado_em').catch(() => [])]);   // sem o script 02: lista vazia
        return indexar({ config, atas, itens, orgaos, pedidos, pedido_itens, solicitacoes });
      },
      async salvar(tabela, reg) {
        const { id, ...resto } = Object.fromEntries(Object.entries(reg).filter(([k]) => !k.startsWith('_')));
        if (id) return ok(await sb.from(tabela).update(resto).eq('id', id).select().single());
        return ok(await sb.from(tabela).insert(resto).select().single());
      },
      async salvarConfig(c) { const { id, atualizado_em, ...r } = c; ok(await sb.from('configuracoes').update({ ...r, atualizado_em: new Date().toISOString() }).eq('id', 1)); },
      async registrarPedido(p) { return ok(await sb.rpc('registrar_pedido', { p })); },
      async cancelarPedido(id, motivo) { ok(await sb.rpc('cancelar_pedido', { p_id: id, p_motivo: motivo })); },
      async importar(d, aoProgredir) {
        const resumo = { atas: 0, itens: 0, orgaos: 0, pedidos: 0, ignorados: 0 };
        const atas = ok(await sb.from('atas').upsert(d.atas, { onConflict: 'numero' }).select());
        resumo.atas = atas.length;
        const idAta = Object.fromEntries(atas.map((a) => [a.numero, a.id]));
        const todasAtas = await tudo('atas'); todasAtas.forEach((a) => (idAta[a.numero] = a.id));
        const itens = d.itens.filter((i) => idAta[i.ata_numero]).map(({ ata_numero, ...i }) => ({ ...i, ata_id: idAta[ata_numero] }));
        for (let k = 0; k < itens.length; k += 500) ok(await sb.from('itens').upsert(itens.slice(k, k + 500), { onConflict: 'ata_id,numero' }));
        resumo.itens = itens.length;
        const existentes = await tudo('orgaos');
        for (const o of d.orgaos) {
          const x = (o.cnpj && existentes.find((y) => y.cnpj === o.cnpj)) || existentes.find((y) => R_norm(y.nome) === R_norm(o.nome));
          const dados = Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''));
          const salvo = ok(await sb.from('orgaos').upsert(x ? { ...dados, id: x.id } : dados).select().single());
          if (!x) existentes.push(salvo); else Object.assign(x, salvo);
          resumo.orgaos++;
        }
        const todosItens = await tudo('itens');
        const pedidos = await tudo('pedidos');
        const grupos = agruparAdesoes(d.adesoes);
        let n = 0;
        for (const g of grupos) {
          aoProgredir && aoProgredir(++n, grupos.length);
          const org = existentes.find((y) => R_norm(y.nome) === R_norm(g.orgao_nome)); if (!org) continue;
          if (g.numero_oficio && pedidos.some((p) => p.numero_oficio === g.numero_oficio && p.orgao_id === org.id)) { resumo.ignorados++; continue; }
          let num = g.numero_oficio;
          if (num && pedidos.some((p) => p.numero_oficio === num)) num = num + ' (' + (org.municipio || org.nome) + ')';
          const linhas = g.linhas.map((l) => ({ item_id: (todosItens.find((i) => i.ata_id === idAta[l.ata_numero] && i.numero === l.item) || {}).id, qtd: l.qtd })).filter((l) => l.item_id);
          if (!linhas.length) continue;
          const id = await api.registrarPedido({ numero_oficio: num, data_oficio: g.data_oficio || null, orgao_id: org.id, oficio_solicitante: g.oficio_solicitante, origem: 'migracao', itens: linhas });
          pedidos.push({ id, numero_oficio: num, orgao_id: org.id });
          resumo.pedidos++;
        }
        return resumo;
      },
      async publicoAtas() { return ok(await sb.rpc('publico_atas')) || []; },
      async publicoOrgao(cnpj) { return ok(await sb.rpc('publico_orgao', { p_cnpj: cnpj })); },
      async enviarSolicitacao(p, arquivos) {
        const pasta = 'envios/' + uid() + '/';
        const lista = [];
        for (const a of arquivos) {
          const nome = a.arquivo.name.normalize('NFD').replace(/[^\w.\-]+/g, '_');
          const { error } = await sb.storage.from('solicitacoes').upload(pasta + nome, a.arquivo, { contentType: 'application/pdf', upsert: false });
          if (error) throw new Error('Não foi possível enviar o arquivo ' + a.arquivo.name + ': ' + error.message);
          lista.push({ tipo: a.tipo, nome: a.arquivo.name, caminho: pasta + nome, tamanho: a.arquivo.size });
        }
        return ok(await sb.rpc('enviar_solicitacao', { p: { ...p, arquivos: lista } }));
      },
      async consultarSolicitacao(protocolo, cnpj) { return ok(await sb.rpc('consultar_solicitacao', { p_protocolo: protocolo, p_cnpj: cnpj })); },
      async atualizarSolicitacao(id, campos) { ok(await sb.from('solicitacoes').update({ ...campos, atualizado_em: new Date().toISOString() }).eq('id', id)); },
      async urlArquivo(caminho) { const { data } = await sb.storage.from('solicitacoes').createSignedUrl(caminho, 600); return data && data.signedUrl; },
      async usuarios() { return ok(await sb.from('usuarios').select('*').order('nome')); },
      async criarUsuario(u) {
        const { data, error } = await sb.functions.invoke('convidar-usuario', { body: u });
        if (error) throw new Error((data && data.erro) || error.message);
        if (data && data.erro) throw new Error(data.erro);
        return data;
      },
      async salvarUsuario(u) { ok(await sb.from('usuarios').update({ nome: u.nome, perfil: u.perfil, ativo: u.ativo }).eq('id', u.id)); },
    };
    return api;
  }

  window.DADOS = CFG.SUPABASE_URL && window.supabase ? criarSupabase() : criarDemo();
  window.DADOS.agruparAdesoes = agruparAdesoes;
  window.DADOS.normalizar = R_norm;
})();
