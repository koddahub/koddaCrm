# Template V2 - Institucional (3 páginas)

## Escopo
- `index.html`, `sobre.html`, `contato.html`
- WhatsApp flutuante em todas as páginas
- Formulário funcional no front em `contato.html`
- Sem chatbot

## Estrutura
- `css/style.css`: base visual white-label e componentes de formulário
- `js/main.js`: menu mobile, estado ativo do menu, config de contato e WhatsApp
- `js/form-handler.js`: validação, loading e feedback de envio
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

## Formulário
- Modo padrão: `front-only` (simula envio com feedback completo)
- Modo integração: `api` (POST JSON para `formEndpoint`)
- Campos obrigatórios: nome, email, telefone, assunto, mensagem

## Critérios de conformidade
- 3 páginas funcionais e navegáveis
- WhatsApp ativo em todas as páginas
- Sem chatbot
- Sem links/arquivos quebrados
