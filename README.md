# SOFT+ GOV · Gestão de Consórcio (CIMOP)

No ar: https://gestao-consorcio.pages.dev · formulário público: https://gestao-consorcio.pages.dev/#solicitar

Sistema de gestão do consórcio público. Primeiro módulo: **controle de adesões às Atas de Registro de Preços**; outros módulos entram aos poucos.

## Módulo: adesões às ARPs

Sistema para controlar as adesões de órgãos não participantes às Atas de Registro de Preços do CIMOP:
limites de **50% por órgão (CNPJ)** e do **dobro por item** (art. 86, §§ 4º e 5º, da Lei nº 14.133/2021;
art. 29 da Resolução CIMOP nº 018/2023), **ofício de resposta em Word** gerado automaticamente no padrão do
CIMOP e **formulário online** para os órgãos pedirem a adesão.

Segue o manual de padrões SOFT+ (mesmo visual e componentes do painel do Portal PNTP).

## Estrutura

| Pasta/arquivo | O que é |
| --- | --- |
| `index.html` | Painel (login, menu, telas) e formulário público (`#solicitar`, `#consultar`) |
| `css/estilos.css` | Estilos oficiais do painel SOFT+ (copiados do portal-pntp) |
| `css/adesoes.css` | Complementos deste sistema |
| `js/app.js` | Telas |
| `js/regras.js` | Regras de limite (as mesmas do banco) |
| `js/oficio.js` + `js/modelo-oficio.js` | Ofício em Word (timbre e rodapé do Ofício nº 105/2026) |
| `js/planilhas.js` | Planilha-modelo de importação e mapa em Excel |
| `js/dados.js` | Acesso ao Supabase (ou modo demonstração, se `js/config.js` estiver em branco) |
| `supabase/NN_*.sql` | Scripts do banco, reexecutáveis, rodar em ordem |
| `supabase/functions/consorcio-convidar-usuario` | Edge Function que cria usuários |
| `supabase/functions/consorcio-pncp` | Edge Function que busca as atas e os termos aditivos no PNCP (agenda diária às 04h, horário de Brasília) |
| `supabase/functions/consorcio-enviar-email` | Edge Function que envia o e-mail de resposta (SMTP do projeto: SMTP_HOST, SMTP_PORT, SMTP_USUARIO, SMTP_SENHA, SMTP_REMETENTE; opcional CONSORCIO_SMTP_REMETENTE) |
| `supabase/05_email_documentos.sql` | Links dos documentos, link do processo por ata, telefone do órgão e registro dos e-mails |
| `supabase/08_precos_reequilibrio.sql` | Linha do tempo de preços (reequilíbrios) e preço congelado em cada adesão |
| `supabase/07_corrigir_pedido.sql` | Correção de itens e quantidades de pedido lançado (substitui mantendo o número) |
| `supabase/06_pncp_orgaos.sql` | Órgãos/entidades de cada ata no PNCP (conferência com as adesões autorizadas) |
| `supabase/04_pncp.sql` | Tabelas das atualizações do PNCP, confirmação e agenda diária (pg_cron) |
| `versao.json` | Versão e notas (fonte única da versão) |

## Publicação

Usa o **mesmo projeto Supabase do Portal PNTP** (SOFT+), com tudo no schema **`consorcio`** (separado do schema `public` do portal). Sem custo adicional.

1. SQL Editor: rodar `supabase/01_estrutura.sql` e depois `supabase/02_solicitacoes.sql` (reexecutáveis).
2. Settings › API (Data API) › Exposed schemas: incluir `consorcio`.
3. Dar acesso de administrador: rodar o `insert` comentado no fim do script 01 (o login pode ser o mesmo do portal).
4. Publicar a Edge Function `consorcio-convidar-usuario` com "Verify JWT" desligado.
5. Rodar `04_pncp.sql` e publicar a Edge Function `consorcio-pncp` (arquivo único `index.ts`) com "Verify JWT" desligado.
6. Rodar `05_email_documentos.sql` e publicar a Edge Function `consorcio-enviar-email` com "Verify JWT" desligado.
5. `js/config.js` já aponta para o projeto (URL e chave pública). Nunca a chave secreta.
6. Authentication › URL Configuration: incluir o endereço do sistema em Redirect URLs (para "Esqueci minha senha").
7. Cloudflare Pages ligado a este repositório (sem build; diretório raiz).

Com `js/config.js` em branco o sistema abre em **modo demonstração** (dados só no navegador).

## Regras principais

- Limite de 50% por CNPJ, somando todos os pedidos do mesmo órgão no mesmo item.
- Limite total do dobro do registrado por item.
- Pedido acima do limite: item negado por inteiro, com motivo e saldo no ofício.
- Órgão federal: adesão vedada (art. 86, § 8º). Ata vencida na data do ofício: negado.
- Número do ofício do CIMOP digitado pelo usuário (sem repetição).
- Pedido nunca é apagado: é cancelado com motivo e o saldo volta.
