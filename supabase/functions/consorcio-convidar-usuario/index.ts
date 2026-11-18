// Edge Function "consorcio-convidar-usuario" (Gestão de Consórcio, schema consorcio): cria o login já confirmado e o registro em public.usuarios.
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
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'consorcio' } });
    const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const { data: quem } = await admin.auth.getUser(token);
    if (!quem?.user) return resposta({ erro: 'Sessão expirada. Entre de novo.' }, 401);
    const { data: perfil } = await admin.from('usuarios').select('perfil, ativo').eq('id', quem.user.id).maybeSingle();
    if (!perfil || !perfil.ativo || perfil.perfil !== 'administrador') return resposta({ erro: 'Só o administrador cria usuários.' }, 403);

    const { nome, email, senha, perfil: novoPerfil } = await req.json();
    if (!nome || !email || !senha || String(senha).length < 8) return resposta({ erro: 'Informe nome, e-mail e senha com pelo menos 8 caracteres.' }, 400);
    if (!['administrador', 'operador', 'consulta'].includes(novoPerfil)) return resposta({ erro: 'Perfil inválido.' }, 400);

    const { data: criado, error } = await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } });
    let novoId = criado?.user?.id;
    if (error) {
      // O login pode já existir (mesmo projeto do Portal PNTP): reaproveita e só dá acesso a este sistema.
      if (!/already|registered|exists/i.test(error.message)) return resposta({ erro: error.message }, 400);
      const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existente = lista?.users?.find((u) => (u.email || '').toLowerCase() === String(email).toLowerCase());
      if (!existente) return resposta({ erro: 'Esse e-mail já tem login, mas não foi possível localizá-lo.' }, 400);
      novoId = existente.id;
    }
    const { error: e2 } = await admin.from('usuarios').upsert({ id: novoId, nome, email, perfil: novoPerfil, ativo: true, troca_senha: !error });
    if (e2) { if (!error) await admin.auth.admin.deleteUser(novoId); return resposta({ erro: e2.message }, 400); }
    return resposta({ ok: true, id: novoId, ja_tinha_login: !!error });
  } catch (e) {
    return resposta({ erro: (e as Error).message }, 500);
  }
});
