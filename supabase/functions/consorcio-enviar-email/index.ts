// Edge Function "consorcio-enviar-email" (Gestão de Consórcio, schema consorcio)
// Envia o e-mail de resposta ao órgão (ofício anexo + links dos documentos) e os avisos da IRP
// (divulgação, lembrete, resultado), SÓ quando o usuário revisa e clica em "Enviar" no painel.
// Registra cada envio em consorcio.emails (com pedido_id ou irp_id/orgao_id).
// Usa o SMTP já configurado no projeto (secrets SMTP_HOST, SMTP_PORT, SMTP_USUARIO, SMTP_SENHA,
// SMTP_REMETENTE). Opcional: CONSORCIO_SMTP_REMETENTE, ex.: "CIMOP <adesoes@cimop.rn.gov.br>".
// Publicar com "Verify JWT" DESLIGADO (a conferência do usuário é feita aqui).
import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const emailOk = (e: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(e);
const lista = (v: unknown) => String(v || '').split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const html = (t: string) => '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a2433">' +
  esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\n/g, '<br>') + '</div>';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'consorcio' }, auth: { persistSession: false } });
  try {
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: quem } = await sb.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: 'Entre novamente no sistema.' }, 401);
    const { data: u } = await sb.from('usuarios').select('perfil, ativo, nome').eq('id', quem.user.id).maybeSingle();
    // Pode enviar quem edita algum módulo (perfil geral ou perfil por módulo: administrador ou operador)
    const { data: mods } = await sb.from('usuario_modulos').select('perfil').eq('usuario_id', quem.user.id);
    const editaModulo = (mods || []).some((m: any) => ['administrador', 'operador'].includes(m.perfil));
    if (!u || !u.ativo || (!['administrador', 'operador'].includes(u.perfil) && !editaModulo)) return resposta({ erro: 'Sem permissão para enviar e-mails.' }, 403);

    const b = await req.json();
    const para = lista(b.para), copia = lista(b.copia);
    if (!para.length) return resposta({ erro: 'Informe o e-mail do destinatário.' }, 400);
    const ruim = [...para, ...copia].find((e) => !emailOk(e));
    if (ruim) return resposta({ erro: 'E-mail inválido: ' + ruim }, 400);
    if (!String(b.assunto || '').trim() || !String(b.corpo || '').trim()) return resposta({ erro: 'Assunto e texto são obrigatórios.' }, 400);
    const anexos = (b.anexos || []).map((a: any) => ({ filename: String(a.nome), content: String(a.base64), encoding: 'base64', contentType: a.tipo || undefined }));
    const tamanho = (b.anexos || []).reduce((s: number, a: any) => s + String(a.base64 || '').length * 0.75, 0);
    if (tamanho > 15 * 1024 * 1024) return resposta({ erro: 'Os anexos passam de 15 MB. Envie os documentos grandes por link.' }, 400);

    const host = Deno.env.get('SMTP_HOST');
    if (!host) return resposta({ erro: 'O envio de e-mail ainda não está configurado no servidor (SMTP).' }, 503);
    const porta = Number(Deno.env.get('SMTP_PORT') ?? '587');
    const envio = nodemailer.createTransport({ host, port: porta, secure: porta === 465, auth: { user: Deno.env.get('SMTP_USUARIO'), pass: Deno.env.get('SMTP_SENHA') } });
    const { data: cfg } = await sb.from('configuracoes').select('email_resposta, sigla').eq('id', 1).single();
    const remetente = Deno.env.get('CONSORCIO_SMTP_REMETENTE') || Deno.env.get('SMTP_REMETENTE');

    const registro = { pedido_id: b.pedido_id || null, irp_id: b.irp_id || null, orgao_id: b.orgao_id || null, para: para.join(', '), copia: copia.join(', ') || null, assunto: b.assunto, corpo: b.corpo,
      anexos: (b.anexos || []).map((a: any) => a.nome), enviado_por: quem.user.id, enviado_por_nome: u.nome };
    try {
      await envio.sendMail({ from: remetente, to: para, cc: copia.length ? copia : undefined, replyTo: cfg?.email_resposta || undefined,
        subject: b.assunto, text: b.corpo, html: html(b.corpo), attachments: anexos });
    } catch (e) {
      const msg = String((e as Error).message || e).slice(0, 500);
      await sb.from('emails').insert({ ...registro, situacao: 'erro', erro: msg });
      return resposta({ erro: 'O servidor de e-mail recusou o envio: ' + msg }, 502);
    }
    const { data: ok } = await sb.from('emails').insert({ ...registro, situacao: 'enviado' }).select().single();
    return resposta({ ok: true, email: ok });
  } catch (e) {
    return resposta({ erro: (e as Error).message }, 500);
  }
});
