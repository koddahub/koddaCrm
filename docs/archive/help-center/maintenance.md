# Manutenção da Central de Ajuda

## Visão geral
A Central de Ajuda do Praja foi estruturada para autoatendimento com busca, categorias, artigos e FAQ.

## Estrutura de rotas
- `/ajuda`
- `/ajuda/categoria/[slug]`
- `/ajuda/artigo/[slug]`
- `/ajuda/busca`
- `/ajuda/faq`
- `/ajuda/contato`

## Fonte de dados
Os dados da central estão em:
- `apps/crm-next/lib/help-center.ts`

Inclui:
- categorias (`helpCategories`)
- artigos (`helpArticles`)
- FAQ (`helpFaqSections`)

## Como adicionar novo artigo
1. Abra `apps/crm-next/lib/help-center.ts`.
2. Adicione um item em `helpArticles` com:
   - `slug` único
   - `title`
   - `description`
   - `categorySlug`
   - `categoryName`
   - `author`
   - `publishedAt` (YYYY-MM-DD)
   - `readTime`
   - `keywords`
   - `contentHtml`
3. Se necessário, atualize `articleCount` da categoria correspondente.

## Boas práticas de conteúdo
- Títulos orientados à ação: "Como conectar...", "Como resolver...".
- Texto objetivo: problema, passos, validação.
- Máximo de 6 passos por fluxo.
- Incluir termos de busca relevantes em `keywords`.
- Fechar com seção de solução de problemas quando aplicável.

## Feedback de artigos
- Componente: `apps/crm-next/components/help/ArticleFeedback.tsx`
- Endpoint: `apps/crm-next/app/api/help/feedback/route.ts`
- Atualmente o endpoint responde sucesso e está pronto para persistência futura.

## Métricas recomendadas
- Artigos mais acessados
- Termos de busca sem resultado
- Taxa de feedback positivo/negativo
- Cliques em "Falar com suporte"
- Tempo médio de leitura por artigo
