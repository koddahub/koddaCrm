# Roteiro de Testes - Central de Ajuda

## CT-01: Página inicial
- [ ] Busca aparece em destaque
- [ ] Categorias exibidas com ícones
- [ ] Artigos populares carregam
- [ ] FAQ preview exibe perguntas
- [ ] CTA para contato funciona

## CT-02: Busca
- [ ] Sugestões aparecem ao digitar
- [ ] Resultado por termo popular
- [ ] Busca sem resultado mostra orientação
- [ ] Navegação para artigo via resultado

## CT-03: Categoria
- [ ] Página `/ajuda/categoria/[slug]` abre corretamente
- [ ] Lista de artigos da categoria está correta
- [ ] Breadcrumb funciona

## CT-04: Artigo
- [ ] Página `/ajuda/artigo/[slug]` abre corretamente
- [ ] Metadados (autor, data, leitura) são exibidos
- [ ] Conteúdo HTML renderiza com estrutura correta
- [ ] Artigos relacionados aparecem

## CT-05: Feedback
- [ ] Botão "Sim" registra feedback
- [ ] Botão "Não" abre campo de comentário
- [ ] Envio do comentário conclui com mensagem de sucesso
- [ ] Endpoint `/api/help/feedback` responde com `success: true`

## CT-06: FAQ
- [ ] Itens expandem/colapsam
- [ ] Conteúdo de respostas está visível
- [ ] Botão para contato funciona

## CT-07: Contato
- [ ] Página `/ajuda/contato` carrega
- [ ] Links de e-mail funcionam (`mailto`)
- [ ] Link de telefone funciona (`tel`)
- [ ] Link de WhatsApp abre em nova aba

## CT-08: Widget flutuante
- [ ] Botão aparece nas páginas de ajuda
- [ ] Abre/fecha corretamente
- [ ] Links internos do widget funcionam

## CT-09: Responsividade
- [ ] Mobile: layout em coluna única
- [ ] Tablet: cards reorganizados sem quebra visual
- [ ] Desktop: grid completo com espaçamento adequado

## CT-10: Performance
- [ ] Carregamento inicial da ajuda abaixo de 2s em ambiente de referência
- [ ] Busca responde sem travamento visual
- [ ] Navegação entre páginas sem erros de hidratação
