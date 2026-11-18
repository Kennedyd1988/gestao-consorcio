// Edge Function "convidar-usuario": cria o login já confirmado e o registro em public.usuarios.
// Só um administrador ativo pode chamar. Publicar com "Verify JWT" DESLIGADO (a conferência é feita aqui).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: 'Sessão expirada. Entre de novo.' }, 401);
    const { data: perfil } = await admin.from('usuarios').select('perfil, ativo').eq('id', quem.user.id).maybeSingle();
    if (!perfil || !perfil.ativo || perfil.perfil !== 'administrador') return resposta({ erro: 'Só o administrador cria usuários.' }, 403);

    const { nome, email, senha, perfil: novoPerfil } = await req.json();
    if (!nome || !email || !senha || String(senha).length < 8) return resposta({ erro: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.' }, 400);
    if (!['administrador', 'operador', 'consulta'].includes(novoPerfil)) return resposta({ erro: 'Perfil inválido.' }, 400);

    const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    if (error) return resposta({ erro: /already|registered/i.test(error.message) ? 'Esse e-mail já tem login.' : error.message }, 400);
    const { error: e2 } = await admin.from('usuarios').insert({ id: criado.user.id, nome, email, perfil: novoPerfil, troca_senha: true });
    if (e2) { await admin.auth.admin.deleteUser(criado.user.id); return resposta({ erro: e2.message }, 400); }
    return resposta({ ok: true, id: criado.user.id });
  } catch (e) {
    return resposta({ erro: (e as Error).message }, 500);
  }
});
