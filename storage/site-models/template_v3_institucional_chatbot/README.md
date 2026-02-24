# Template V3 - Institucional completo (3 páginas + chatbot)

## Escopo
- `index.html`, `sobre.html`, `contato.html`
- Formulário funcional no front em `contato.html`
- Chatbot em todas as páginas (`kodassauroRoot`)

## Estrutura
- `css/style.css`: base visual white-label
- `css/kodassauro.css`: estilos do chatbot
- `js/main.js`: menu mobile e configuração de contato
- `js/form-handler.js`: validação e feedback do formulário
- `js/kodassauro-chat.js`: comportamento do chatbot e canais
- `assets/`: fontes, imagens, logo e vendors locais

## Contrato de configuração (frontend)
Defina no `<script>` da página:

```js
window.TemplateConfig = {
  brandName: 'Sua Empresa',
  contactEmail: 'contato@suaempresa.com.br',
  contactPhone: '(11) 99999-9999',
  whatsappNumber: '5511999999999',
  formMode: 'front-only', // 'front-only' | 'api'
  formEndpoint: '' // obrigatório quando formMode='api'
}
```

## Regras
- Mantém todas as funcionalidades do V2
- Inclui chatbot funcional e mantém formulário de contato
- Canais do chatbot devem usar os mesmos dados de contato do template

## Critérios de conformidade
- V2 completo + chatbot funcional
- Sem conflito de UI entre chatbot/menu/formulário
- Sem links/arquivos quebrados
