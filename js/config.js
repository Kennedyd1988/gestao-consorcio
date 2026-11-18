// Configuração de acesso à Supabase.
// A URL e a chave pública (anon/publishable) ficam no navegador de qualquer visitante: quem protege
// os dados são as regras de RLS do banco (scripts em /supabase). NUNCA colocar aqui a chave secret/service_role.
// Em branco = modo de demonstração (dados só neste navegador).
window.CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: ''
};
