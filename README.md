# SOFT+ GOV · Controle de Adesões às Atas de Registro de Preços (CIMOP)

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
| `supabase/functions/convidar-usuario` | Edge Function que cria usuários |
| `versao.json` | Versão e notas (fonte única da versão) |

## Publicação

1. Supabase (região São Paulo): rodar `supabase/01_estrutura.sql` e `supabase/02_solicitacoes.sql` no SQL Editor.
2. Criar o primeiro login em Authentication › Users e rodar o `insert` comentado no fim do script 01.
3. Publicar a Edge Function `convidar-usuario` com "Verify JWT" desligado.
4. Preencher `js/config.js` com a URL e a chave pública (anon/publishable) do projeto. Nunca a chave secreta.
5. Cloudflare Pages ligado a este repositório (sem build; diretório raiz).

Com `js/config.js` em branco o sistema abre em **modo demonstração** (dados só no navegador).

## Regras principais

- Limite de 50% por CNPJ, somando todos os pedidos do mesmo órgão no mesmo item.
- Limite total do dobro do registrado por item.
- Pedido acima do limite: item negado por inteiro, com motivo e saldo no ofício.
- Órgão federal: adesão vedada (art. 86, § 8º). Ata vencida na data do ofício: negado.
- Número do ofício do CIMOP digitado pelo usuário (sem repetição).
- Pedido nunca é apagado: é cancelado com motivo e o saldo volta.
