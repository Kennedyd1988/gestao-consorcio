// Configuração de acesso à Supabase.
// Usa o mesmo projeto do Portal PNTP (SOFT+), com as tabelas no schema "consorcio".
// A URL e a chave "publishable" são públicas por natureza: quem protege os dados são as regras de RLS
// do banco (scripts em /supabase). NUNCA colocar aqui a chave secret/service_role.
// Deixar SUPABASE_URL em branco abre o sistema em modo demonstração.
window.CONFIG = {
  SUPABASE_URL: 'https://gyjfkhyufubtmowgjgrq.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_dVqfw-uGUPeLJD1HoNAe4w_-yxNZbUx',
  SCHEMA: 'consorcio'
};
// Prévia sem banco: ?demo no endereço abre a demonstração (dados só no navegador de quem testa).
if (/[?&]demo\b/.test(location.search)) window.CONFIG.SUPABASE_URL = '';
