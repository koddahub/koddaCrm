# Padrão de Identidade Visual - KoddaHub

## 1. Essência da marca
- Nome: KoddaHub
- Posicionamento: soluções web modernas para crescimento digital.
- Personalidade: tecnológica, confiável, ágil, consultiva e humana.
- Tom de voz: objetivo, claro e profissional.

## 2. Assinatura da marca
- Wordmark oficial: `Kodda` (laranja) + `Hub` (branco).
- Ícone oficial: Kodassauro.
- Regra: manter proporção, sem distorções e sem efeitos pesados.

## 3. Paleta oficial
### Primárias
- Kodda Orange: `#FF8A00`
- Night Blue: `#0A1A2F`
- Deep Blue: `#1E3A5F`

### Suporte
- Gold Accent: `#F0B90B`
- Light Gold: `#FFD45C`
- Success: `#0F9F6F`
- Danger: `#B42318`

### Neutros
- Text 900: `#1F2A37`
- Text 700: `#475467`
- Text 500: `#667085`
- Bg 100: `#F4F7FB`
- Card White: `#FFFFFF`
- Line: `#D8E1EC`

## 4. Tipografia
- Principal: Poppins
- Fallback: system-ui, Arial, sans-serif

## 5. Diretriz de layout para templates
- Cards com borda fria e raio entre 12px e 16px.
- Botões com formato pill e peso 600.
- Contraste AA (texto normal >= 4.5:1).
- Responsividade obrigatória: mobile, tablet e desktop.

## 6. Regras para o Prompt Engine (Site24h)
- Priorizar esta identidade quando houver manual de marca.
- Se não houver logo do cliente: gerar `logo_placeholder.svg` coerente com a paleta.
- Preservar estrutura visual base dos templates V1, V2 e V3.
- Não inventar componentes fora do padrão visual do projeto base.

## 7. Aplicação por variante
- V1: página única sem formulário, sem WhatsApp e sem chatbot.
- V2: Home + Sobre + Contato, com formulário e WhatsApp.
- V3: versão completa com formulário, WhatsApp e chatbot.

## 8. Referência de uso no cliente
Este arquivo pode ser copiado para a pasta do cliente como:
- `/home/server/projects/clientes/{org_slug}/identidade_visual.md`

Assim o Copilot usa a mesma base visual durante a personalização do site.
