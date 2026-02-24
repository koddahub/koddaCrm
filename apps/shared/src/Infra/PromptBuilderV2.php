<?php
declare(strict_types=1);

namespace Shared\Infra;

final class PromptBuilderV2
{
    private const ASSET_SOURCE_WHITELIST = [
        'https://unsplash.com',
        'https://www.pexels.com',
        'https://pixabay.com',
        'https://openverse.org',
        'https://commons.wikimedia.org',
        'https://burst.shopify.com',
        'https://www.svgrepo.com',
        'https://heroicons.com',
        'https://tabler.io/icons',
        'https://lucide.dev/icons',
        'https://undraw.co',
        'https://storyset.com',
    ];

    private static function pick(array $brief, array $keys, string $fallback = ''): string
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $brief)) {
                continue;
            }
            $raw = $brief[$key];
            if (is_array($raw)) {
                $items = [];
                foreach ($raw as $item) {
                    if (is_array($item)) {
                        continue;
                    }
                    $text = trim((string) $item);
                    if ($text !== '') {
                        $items[] = $text;
                    }
                }
                $value = implode(', ', array_values(array_unique($items)));
            } elseif (is_bool($raw)) {
                $value = $raw ? 'true' : 'false';
            } else {
                $value = trim((string) $raw);
            }
            if ($value !== '') {
                return $value;
            }
        }
        return $fallback;
    }

    private static function boolLike(array $brief, array $keys): bool
    {
        $raw = strtolower(self::pick($brief, $keys));
        if ($raw === '') {
            return false;
        }
        return in_array($raw, [
            '1', 'true', 'yes', 'sim', 'y', 'tem', 'completo', 'partial', 'parcial',
            'tenho_tudo', 'tenho_parcial', 'sim_completo', 'sim_parcial',
        ], true);
    }

    private static function listFromText(string $value): array
    {
        if (trim($value) === '') {
            return [];
        }
        $jsonDecoded = json_decode($value, true);
        if (is_array($jsonDecoded)) {
            $list = [];
            foreach ($jsonDecoded as $item) {
                $text = trim((string) $item);
                if ($text !== '') {
                    $list[] = $text;
                }
            }
            return array_values(array_unique($list));
        }
        $parts = preg_split('/[\n,;]+/', $value) ?: [];
        $list = [];
        foreach ($parts as $part) {
            $item = trim((string) $part);
            if ($item !== '') {
                $list[] = $item;
            }
        }
        return array_values(array_unique($list));
    }

    private static function inferAssetType(string $path): string
    {
        $name = strtolower(basename($path));
        if (str_contains($name, 'logo')) {
            return 'logo';
        }
        if (str_contains($name, 'manual') || str_contains($name, 'brand') || str_contains($name, 'identidade')) {
            return 'manual';
        }
        if (str_contains($name, 'conteudo') || str_contains($name, 'content') || str_contains($name, 'texto') || str_contains($name, 'imagem')) {
            return 'conteudo';
        }
        return 'outro';
    }

    private static function slugify(string $value): string
    {
        $value = trim($value);
        if ($value === '') {
            return 'cliente';
        }
        $raw = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
        if (is_string($raw) && $raw !== '') {
            $value = $raw;
        }
        $value = strtolower($value);
        $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: 'cliente';
        $value = trim((string) $value, '-');
        return $value !== '' ? $value : 'cliente';
    }

    private static function stringifyList(array $list, string $fallback = 'nao informado'): string
    {
        return count($list) > 0 ? implode(', ', $list) : $fallback;
    }

    private static function ensureDefault(string $value, string $fallback): string
    {
        $value = trim($value);
        return $value !== '' ? $value : $fallback;
    }

    private static function inlineText(string $value, string $fallback = 'nao informado'): string
    {
        $value = trim($value);
        if ($value === '') {
            return $fallback;
        }
        $value = preg_replace('/\s+/u', ' ', $value) ?: $value;
        return trim($value);
    }

    private static function normalizeForPrompt(string $value): string
    {
        return self::inlineText($value, 'nao informado');
    }

    private static function normalizeBrief(array $brief): array
    {
        $clientName = self::ensureDefault(self::pick($brief, ['legal_name', 'nome_cliente', 'name']), 'Cliente');
        $clientSlug = self::pick($brief, ['organization_slug', 'org_slug', 'client_slug'], '');
        if ($clientSlug === '') {
            $clientSlug = self::slugify($clientName);
        }

        $businessType = self::ensureDefault(self::pick($brief, ['business_type', 'tipo_negocio', 'segment']), 'servicos especializados');
        $objective = self::ensureDefault(self::pick($brief, ['objective', 'objetivo_principal']), 'captar leads qualificados e aumentar conversao comercial');
        $audience = self::ensureDefault(self::pick($brief, ['audience', 'publico_alvo']), 'decisores e compradores em busca de solucao confiavel');
        $differentials = self::ensureDefault(self::pick($brief, ['differentials', 'diferenciais_competitivos']), 'atendimento consultivo, agilidade de entrega e foco em resultado');
        $services = self::ensureDefault(self::pick($brief, ['services', 'principais_produtos_servicos']), 'servicos principais alinhados ao objetivo de negocio');
        $tone = self::ensureDefault(self::pick($brief, ['tone_of_voice', 'tom_voz']), 'profissional_informal');
        $style = self::ensureDefault(self::pick($brief, ['style_vibe', 'estilo_visual']), 'moderno_clean');
        $palette = self::ensureDefault(self::pick($brief, ['color_palette', 'paleta_cores']), '#0A1A2F, #FF8A00, #F8FAFC, #1F2937');
        $cta = self::ensureDefault(self::pick($brief, ['cta_text', 'cta_principal']), 'Fale conosco');
        $domainTarget = self::ensureDefault(self::pick($brief, ['domain_target', 'dominio_desejado']), 'a definir');
        $extraRequirements = self::ensureDefault(self::pick($brief, ['extra_requirements', 'requisitos_tecnicos_extras']), 'manter performance, SEO basico e acessibilidade minima');

        $integracoes = self::listFromText(self::pick($brief, ['integrations', 'integracoes_desejadas']));
        if (count($integracoes) === 0) {
            $integracoes = ['Google Maps', 'Formulario de contato', 'Canal de atendimento principal'];
        }

        $paginas = self::listFromText(self::pick($brief, ['pages_needed', 'paginas_necessarias']));
        if (count($paginas) === 0) {
            $paginas = ['Pagina Inicial', 'Sobre', 'Contato'];
        }

        $refs = self::listFromText(self::pick($brief, ['visual_references', 'references', 'sites_referencia']));
        if (count($refs) === 0) {
            $refs = ['https://koddahub.com.br'];
        }

        $secondaryGoals = self::listFromText(self::pick($brief, ['secondary_goals', 'objetivos_secundarios']));
        if (count($secondaryGoals) === 0) {
            $secondaryGoals = ['fortalecer credibilidade', 'educar o cliente sobre servicos', 'estimular contato imediato'];
        }

        return [
            'client' => [
                'nome' => $clientName,
                'slug' => $clientSlug,
                'domain_target' => $domainTarget,
            ],
            'business' => [
                'tipo' => $businessType,
                'tempo_atuacao' => self::ensureDefault(self::pick($brief, ['business_time', 'tempo_atuacao']), 'em consolidacao no mercado'),
                'objetivo_principal' => $objective,
                'publico_alvo' => $audience,
                'diferenciais' => $differentials,
                'produtos_servicos' => $services,
                'nicho' => self::ensureDefault(self::pick($brief, ['niche', 'nicho_especifico']), $businessType),
                // Chaves de compatibilidade para o CRM atual.
                'objective' => $objective,
                'audience' => $audience,
                'differentials' => $differentials,
                'services' => $services,
                'domainTarget' => $domainTarget,
                'extraRequirements' => $extraRequirements,
                'legalContent' => self::ensureDefault(self::pick($brief, ['legal_content', 'conteudo_legal']), 'sem restricoes legais adicionais informadas'),
                'integrations' => implode(', ', $integracoes),
                'visualReferences' => implode(', ', $refs),
            ],
            'style' => [
                'tom_voz' => $tone,
                'estilo_visual' => $style,
                'paleta_cores' => $palette,
                'cta_principal' => $cta,
                'sites_referencia' => $refs,
                'objetivos_secundarios' => $secondaryGoals,
                // Compatibilidade com UI
                'toneOfVoice' => $tone,
                'color_palette' => $palette,
                'cta' => $cta,
            ],
            'content' => [
                'integracoes_desejadas' => $integracoes,
                'paginas_necessarias' => $paginas,
                'conteudo_legal' => self::ensureDefault(self::pick($brief, ['legal_content', 'conteudo_legal']), 'sem restricoes legais adicionais informadas'),
                'requisitos_tecnicos' => $extraRequirements,
            ],
            'identity' => [
                'possui_logo' => self::boolLike($brief, ['has_logo', 'tem_logo', 'possui_logo']),
                'possui_manual_marca' => self::boolLike($brief, ['has_brand_manual', 'tem_identidade_visual', 'possui_manual_marca']),
                'logo_descricao' => self::ensureDefault(self::pick($brief, ['logo_description', 'descricao_logo']), 'marca profissional alinhada ao nicho e tom de voz'),
            ],
        ];
    }

    private static function extractAssetsContext(array $brief): array
    {
        $uploadedFiles = array_values(array_filter(array_map(
            static fn($item) => trim((string) $item),
            (array) ($brief['uploaded_files'] ?? [])
        )));

        $logoFiles = [];
        $manualFiles = [];
        $contentFiles = [];
        $otherFiles = [];

        foreach ($uploadedFiles as $file) {
            $type = self::inferAssetType($file);
            if ($type === 'logo') {
                $logoFiles[] = $file;
            } elseif ($type === 'manual') {
                $manualFiles[] = $file;
            } elseif ($type === 'conteudo') {
                $contentFiles[] = $file;
            } else {
                $otherFiles[] = $file;
            }
        }

        $hasContent = self::boolLike($brief, ['has_content', 'possui_textos_imagens']) || count($contentFiles) > 0;

        return [
            'uploaded_files' => $uploadedFiles,
            'logo_files' => $logoFiles,
            'manual_files' => $manualFiles,
            'content_files' => $contentFiles,
            'other_files' => $otherFiles,
            'has_content' => $hasContent,
        ];
    }

    private static function buildIdentityProfile(array $normalized, array $assets): array
    {
        $logoPresent = $normalized['identity']['possui_logo'] || count($assets['logo_files']) > 0;
        $manualPresent = $normalized['identity']['possui_manual_marca'] || count($assets['manual_files']) > 0;

        $approvalBlockers = [];
        if (!$logoPresent) {
            $approvalBlockers[] = 'logo_ausente';
        }
        if (!$manualPresent) {
            $approvalBlockers[] = 'manual_marca_ausente';
        }

        return [
            'logo_status' => $logoPresent ? 'received' : 'missing',
            'manual_status' => $manualPresent ? 'received' : 'missing',
            'content_status' => $assets['has_content'] ? 'partial_or_received' : 'missing',
            'approval_blockers' => $approvalBlockers,
            'logo_present' => $logoPresent,
            'manual_present' => $manualPresent,
        ];
    }

    private static function variantSpec(string $variant): array
    {
        if ($variant === 'V1') {
            return [
                'name' => 'Institucional 1 pagina (base)',
                'folder' => 'modelo_v1',
                'ladder' => 'base',
                'required' => [
                    'One-page institucional com navegacao por ancoras internas.',
                    'Secoes obrigatorias: Hero, Sobre, Servicos, Diferenciais, Prova social, CTA final, Rodape.',
                    'Sem formulario de contato na pagina.',
                    'Sem botao WhatsApp flutuante.',
                    'Sem chatbot.',
                ],
                'forbidden' => [
                    'Nao criar paginas extras alem de index.html.',
                    'Nao inserir widgets de chat ou canais flutuantes de atendimento.',
                ],
                'files' => ['index.html', 'css/style.css', 'js/main.js'],
            ];
        }

        if ($variant === 'V2') {
            return [
                'name' => 'Institucional 3 paginas (evolucao do V1)',
                'folder' => 'modelo_v2',
                'ladder' => 'evolve_v1',
                'required' => [
                    'Reaproveitar a base visual e componentes do V1, evoluindo o projeto.',
                    'Paginas obrigatorias: index.html, sobre.html, contato.html.',
                    'Formulario funcional em contato.html com validacao front e feedback visual.',
                    'Botao WhatsApp flutuante em todas as paginas.',
                    'Menu e navegacao consistentes entre as tres paginas.',
                ],
                'forbidden' => [
                    'Nao incluir chatbot.',
                ],
                'files' => ['index.html', 'sobre.html', 'contato.html', 'css/style.css', 'js/main.js', 'js/form-handler.js'],
            ];
        }

        return [
            'name' => 'Institucional completo com chatbot (evolucao do V2)',
            'folder' => 'modelo_v3',
            'ladder' => 'evolve_v2',
            'required' => [
                'Manter toda a estrutura funcional do V2 (3 paginas + formulario).',
                'Substituir canal flutuante de WhatsApp por chatbot completo e personalizado ao negocio.',
                'Chatbot com persona, intents, respostas rapidas, fallback e handoff para contato humano.',
                'CTA principal deve priorizar interacao pelo chatbot.',
            ],
            'forbidden' => [
                'Nao manter botao WhatsApp flutuante ativo no V3.',
                'Nao usar chatbot generico sem contexto do negocio.',
            ],
            'files' => ['index.html', 'sobre.html', 'contato.html', 'css/style.css', 'js/main.js', 'js/form-handler.js', 'css/kodassauro.css', 'js/kodassauro-chat.js'],
        ];
    }

    private static function buildMasterPrompt(array $normalized, array $assets, array $identityProfile): string
    {
        $clientName = $normalized['client']['nome'];
        $clientSlug = $normalized['client']['slug'];
        $clientRoot = '/home/server/projects/clientes/' . $clientSlug;

        $lines = [];
        $lines[] = '# Prompt Pai Orquestrador - Site24h';
        $lines[] = '';
        $lines[] = '> Arquivo imutavel por UI. Somente backend pode regenerar ao novo briefing.';
        $lines[] = '';
        $lines[] = '## Missao global';
        $lines[] = 'Entregar um site **pronto para publicacao** para o cliente **' . $clientName . '**, com qualidade de producao, coerencia visual, conteudo completo e QA tecnico finalizado.';
        $lines[] = '';
        $lines[] = '## Contexto operacional da KoddaHub (leia primeiro, sem pular)';
        $lines[] = 'A KoddaHub opera uma esteira de criacao (Site24h) para clientes de **hospedagem**. O CRM controla etapas e auditoria; esta pasta local e o ambiente de trabalho. A meta e que voce acerte de primeira: gerar uma entrega que pareca trabalho sob medida de agencia, nao um template cru.';
        $lines[] = '';
        $lines[] = '### 1) O que a KoddaHub oferece (planos de hospedagem)';
        $lines[] = 'No portal, vendemos hospedagem mensal em 3 planos. Isso define a complexidade esperada do site e evita prometer tudo para todo mundo.';
        $lines[] = '';
        $lines[] = '- **Basico (R$ 149,99/mes)**: site institucional basico (1 pagina), dominio incluso (se ainda nao tiver), migracao gratuita, 1 e-mail profissional.';
        $lines[] = '- **Profissional (R$ 249,00/mes)**: site institucional ate 3 paginas, formulario de contato + botao WhatsApp, e-mails profissionais ilimitados, suporte tecnico e atualizacoes.';
        $lines[] = '- **Pro (R$ 399,00/mes)**: chatbot incluso no site, e-commerce basico incluso, atualizacao de site industrial com catalogo, ranqueamento profissional no Google.';
        $lines[] = '';
        $lines[] = '### 2) Por que existem 3 versoes (V1/V2/V3)';
        $lines[] = 'As versoes sao uma escadinha para nao reinventar tudo do zero: voce parte de bases consistentes e evolui de forma controlada e previsivel.';
        $lines[] = '';
        $lines[] = '- **V1**: base rapida e enxuta para conversao (one-page, sem canais flutuantes).';
        $lines[] = '- **V2**: evolucao da V1 para multipagina e captura mais direta (formulario + WhatsApp).';
        $lines[] = '- **V3**: evolucao da V2 com atendimento inteligente (chatbot como protagonista, sem WhatsApp flutuante).';
        $lines[] = '';
        $lines[] = '### 3) O que acontece quando o cliente envia o briefing';
        $lines[] = 'O sistema faz duas coisas em paralelo: grava dados estruturados no banco e prepara a pasta de trabalho no filesystem.';
        $lines[] = '';
        $lines[] = '- **Banco (fonte de historico)**:';
        $lines[] = '  - `client.project_briefs`: objetivo, publico, diferenciais, servicos, CTA, tom, paleta, referencias, integracoes, dominio e requisitos extras.';
        $lines[] = '  - `client.ai_prompts`: prompt gerado (JSON + texto).';
        $lines[] = '- **Filesystem (fonte operacional do trabalho)**: raiz oficial `' . $clientRoot . '`. Aqui ficam os arquivos de execucao que voce deve usar para gerar o site.';
        $lines[] = '';
        $lines[] = 'Arquivos operacionais (na raiz do cliente):';
        $lines[] = '- `prompt_pai_orquestrador.md` (diretrizes globais do projeto e qualidade).';
        $lines[] = '- `prompt_v1_draft.md`, `prompt_v2_draft.md`, `prompt_v3_draft.md` (execucao por variante).';
        $lines[] = '- `prompt_personalizacao.md` e `prompt_personalizacao.json` (consolidado/indice tecnico).';
        $lines[] = '- `identidade_visual.md` (tokens e regras de aplicacao visual).';
        $lines[] = '- `assets/` + `assets/assets_manifest.json` (uploads/gerados e rastreio de fontes/licencas).';
        $lines[] = '';
        $lines[] = 'Objetivo disso: o produto real para operacao/IA e a pasta de trabalho. O CRM orquestra e registra.';
        $lines[] = '';
        $lines[] = '### 4) O que sao os modelos (templates) e como eles entram na pasta do cliente';
        $lines[] = 'Existe uma biblioteca fixa de templates base (white-label) em: `/home/server/projects/projeto-area-cliente/storage/site-models/`.';
        $lines[] = 'No onboarding, esses templates sao copiados para a pasta do cliente dentro de `releases/v1/`, para nao misturar clientes e nao alterar a biblioteca base.';
        $lines[] = '';
        $lines[] = '- Biblioteca base:';
        $lines[] = '  - `template_v1_institucional_1pagina`';
        $lines[] = '  - `template_v2_institucional_3paginas`';
        $lines[] = '  - `template_v3_institucional_chatbot`';
        $lines[] = '- Copias de trabalho (onde voce edita o site):';
        $lines[] = '  - V1: `' . $clientRoot . '/releases/v1/modelo_v1`';
        $lines[] = '  - V2: `' . $clientRoot . '/releases/v1/modelo_v2`';
        $lines[] = '  - V3: `' . $clientRoot . '/releases/v1/modelo_v3`';
        $lines[] = '';
        $lines[] = '### 5) O Prompt Pai (por que existe)';
        $lines[] = 'O `prompt_pai_orquestrador.md` existe para situar a IA e impedir execucao superficial. Ele define a missao, regras de completude, politica de assets, escadinha V1->V2->V3 e Definition of Done.';
        $lines[] = 'Objetivo: padronizar qualidade e garantir que a IA execute como projeto de verdade, nao como demo.'; 
        $lines[] = '';
        $lines[] = '### 6) Prompts V1/V2/V3 (como funcionam)';
        $lines[] = 'Cada prompt por variante e operacional e prescritivo, contendo: dados do briefing, caminhos reais de arquivos, regras obrigatorias/proibidas, ordem de edicao por arquivo, matriz condicional e checklist tecnico final. O V3 inclui orientacao especifica do chatbot (persona, intents, handoff, onboarding).';
        $lines[] = 'Objetivo: dirigir a IA (Copilot/LLM) dentro da pasta do cliente para produzir um resultado consistente, unico e pronto.'; 
        $lines[] = '';
        $lines[] = '### O que voce esta construindo (sem ambiguidade)';
        $lines[] = '- Esta pasta e uma base generica + briefing. Sua execucao deve transformar a base em um site unico, incrivel e profissional para o cliente.';
        $lines[] = '- Nao e para preencher campos. E para **criar** uma experiencia completa (narrativa + design + midia + conversao) pronta para publicar.';
        $lines[] = '';
        $lines[] = '### Seu papel na execucao';
        $lines[] = '- Operar como diretor de criacao + designer + desenvolvedor senior para entregar resultado final impressionante.';
        $lines[] = '- Nao fazer adaptacao superficial: reescrever copy, ajustar layout, polir componentes e elevar acabamento visual.';
        $lines[] = '- A IA tem liberdade criativa total dentro das regras da variante, desde que respeite briefing e qualidade.';
        $lines[] = '';
        $lines[] = '### Entregavel minimo (o que tem que existir ao final)';
        $lines[] = '- Conteudo completo por secao/pagina (sem lorem/sem frases genericas repetidas).';
        $lines[] = '- Identidade aplicada (cores, tipografia, componentes, CTA) de forma consistente.';
        $lines[] = '- Midia profissional (imagens/ilustracoes/icones) para suportar o conteudo e elevar acabamento.';
        $lines[] = '- Navegacao completa (menu/ancoras/paginas) funcionando no preview do CRM.';
        $lines[] = '- Formulario (V2/V3) com UX completa no front (validacao + loading + sucesso/erro).';
        $lines[] = '- Chatbot (V3) personalizado ao negocio (persona + intents + handoff).';
        $lines[] = '';
        $lines[] = '## Sequencia obrigatoria de execucao';
        $lines[] = '1. Ler briefing integral + identidade visual + assets locais do cliente.';
        $lines[] = '2. Resolver lacunas (logo, identidade, textos, imagens) sem deixar layout cru.';
        $lines[] = '3. Executar variante solicitada (V1/V2/V3) obedecendo regras da escadinha.';
        $lines[] = '4. Rodar QA tecnico/visual e corrigir tudo antes de marcar pronto.';
        $lines[] = '5. Entregar preview navegavel + checklist de aceite completo.';
        $lines[] = '';
        $lines[] = '## Resultado esperado (objetivo final sem ambiguidade)';
        $lines[] = '- Site pronto para publicacao real, com narrativa forte, visual premium e experiencia completa.';
        $lines[] = '- Nao entregar mock superficial, wireframe cru ou placeholders sem refinamento.';
        $lines[] = '- O resultado deve parecer trabalho sob medida de alta qualidade, nao template generico reaproveitado.';
        $lines[] = '';
        $lines[] = '## Contexto do cliente';
        $lines[] = '- Tipo de negocio: ' . self::normalizeForPrompt((string) $normalized['business']['tipo']);
        $lines[] = '- Objetivo principal: ' . self::normalizeForPrompt((string) $normalized['business']['objetivo_principal']);
        $lines[] = '- Publico-alvo: ' . self::normalizeForPrompt((string) $normalized['business']['publico_alvo']);
        $lines[] = '- Diferenciais: ' . self::normalizeForPrompt((string) $normalized['business']['diferenciais']);
        $lines[] = '- Produtos/servicos: ' . self::normalizeForPrompt((string) $normalized['business']['produtos_servicos']);
        $lines[] = '- Dominio alvo: ' . self::normalizeForPrompt((string) $normalized['client']['domain_target']);
        $lines[] = '- Tom de voz: ' . self::normalizeForPrompt((string) $normalized['style']['tom_voz']);
        $lines[] = '- Estilo visual: ' . self::normalizeForPrompt((string) $normalized['style']['estilo_visual']);
        $lines[] = '- Paleta base: ' . self::normalizeForPrompt((string) $normalized['style']['paleta_cores']);
        $lines[] = '';
        $lines[] = '## Direcao criativa global (efeito "site inesquecivel")';
        $lines[] = '- Projetar hero com proposta de valor cristalina + CTA forte acima da dobra.';
        $lines[] = '- Criar narrativa em camadas: dor -> solucao -> prova -> objecoes -> acao.';
        $lines[] = '- Aplicar recursos visuais premium: gradientes controlados, textura sutil, sombras suaves, ritmo de espacamento e composicao intencional.';
        $lines[] = '- Incluir microinteracoes relevantes (hover, transicao de secoes, estados de botao e feedback de formulario).';
        $lines[] = '- Garantir resultado unico pelo contexto do cliente, evitando frases genericas e blocos repetidos.';
        $lines[] = '';
        $lines[] = '## Politica obrigatoria de midia (imagens / gifs / videos)';
        $lines[] = '- Se o cliente NAO enviou fotos/imagens/portfolio: voce deve incluir midia profissional open-source/licenciada para elevar acabamento.';
        $lines[] = '- Exigencia: nao deixar secoes \"secas\". Use fotos reais, ilustracoes vetoriais ou icones coerentes com o nicho.';
        $lines[] = '- Quando fizer sentido (principalmente em Hero): pode usar video leve (MP4/WebM) ou GIF curto como detalhe, mas sempre com fallback e performance (poster + compressao + sem travar mobile).';
        $lines[] = '- Nunca hotlink final: baixar e salvar localmente em `assets/externos/` e registrar no manifest com fonte/licenca.';
        $lines[] = '- Padrao recomendado de midia minima por variante:';
        $lines[] = '  - V1: 1 hero (foto/ilustracao), 3 imagens de servicos/solucoes, 1 imagem sobre/equipe, 1 imagem prova social (ou icones).';
        $lines[] = '  - V2: o pacote do V1 + imagens especificas para Sobre e Contato (atendimento, mapa, ambiente, equipe).';
        $lines[] = '  - V3: igual V2 + assets do chatbot (avatar/icone/estados) integrados a identidade.';
        $lines[] = '';
        $lines[] = '## Contrato de arquivos';
        $lines[] = '- Pasta cliente: `' . $clientRoot . '`';
        $lines[] = '- Prompt pai: `' . $clientRoot . '/prompt_pai_orquestrador.md`';
        $lines[] = '- Prompts por variante: `prompt_v1_draft.md`, `prompt_v2_draft.md`, `prompt_v3_draft.md`';
        $lines[] = '- Identidade visual: `' . $clientRoot . '/identidade_visual.md`';
        $lines[] = '- Assets locais: `' . $clientRoot . '/assets`';
        $lines[] = '- Manifest de assets: `' . $clientRoot . '/assets/assets_manifest.json`';
        $lines[] = '- Modelos base por variante (onde editar o site):';
        $lines[] = '  - V1: `' . $clientRoot . '/releases/v1/modelo_v1`';
        $lines[] = '  - V2: `' . $clientRoot . '/releases/v1/modelo_v2`';
        $lines[] = '  - V3: `' . $clientRoot . '/releases/v1/modelo_v3`';
        $lines[] = '';
        $lines[] = '## Politica para faltas de briefing/asset';
        $lines[] = '- Sem logo: gerar `assets/logo/logo.svg` + `logo-web.png` + `favicon.ico` com direcao profissional alinhada ao negocio.';
        $lines[] = '- Sem manual de marca: criar identidade visual completa (paleta, tipografia, componentes) e registrar rationale em `identidade_visual.md`.';
        $lines[] = '- Sem imagens/elementos: buscar em fontes permitidas, baixar localmente e registrar origem/licenca no manifest.';
        $lines[] = '- Sem conteudo textual: gerar copy completa orientada a conversao, marcar somente pontos que exigem validacao humana.';
        $lines[] = '';
        $lines[] = '## Politica de assets externos (obrigatoria)';
        $lines[] = '- Pesquisar ativos compativeis com nicho/estilo/tom e salvar localmente em `assets/externos/`.';
        $lines[] = '- Nunca depender de hotlink externo na versao final.';
        $lines[] = '- Registrar em `assets/assets_manifest.json`: `source_url`, `license`, `attribution_required`, `downloaded_at`, `local_path`, `category`.';
        $lines[] = '- Quando houver exigencia de atribuicao, incluir nota no rodape ou arquivo de creditos.';
        $lines[] = '';
        $lines[] = '## Fontes externas permitidas (whitelist minima)';
        foreach (self::ASSET_SOURCE_WHITELIST as $source) {
            $lines[] = '- ' . $source;
        }
        $lines[] = '';
        $lines[] = '## Regras de completude';
        $lines[] = '- Proibido entregar placeholders crus sem contexto de negocio.';
        $lines[] = '- Proibido hotlink de asset externo no resultado final; tudo local.';
        $lines[] = '- Proibido quebrar arquitetura base do template e responsividade existente.';
        $lines[] = '- Proibido pular QA final de links, formularios, JS e acessibilidade minima.';
        $lines[] = '- Proibido deixar o site com cara de template generico: elevar copy, midia e acabamento.';
        $lines[] = '';
        $lines[] = '## Escadinha tecnica obrigatoria';
        $lines[] = '- V1 = base one-page sem formulario, sem WhatsApp, sem chatbot.';
        $lines[] = '- V2 = evolucao do V1 com 3 paginas + formulario + WhatsApp flutuante.';
        $lines[] = '- V3 = evolucao do V2 com formulario + chatbot completo, removendo WhatsApp flutuante.';
        $lines[] = '';
        $lines[] = '## Definition of Done global';
        $lines[] = '- Site pronto para publicacao, sem erro de console e com navegacao completa.';
        $lines[] = '- Conteudo coerente com briefing e tom de voz.';
        $lines[] = '- Responsividade validada em mobile/tablet/desktop.';
        $lines[] = '- SEO minimo (title, description, headings coerentes, links funcionais).';
        $lines[] = '- Acessibilidade minima (labels, alt, foco visivel, contraste AA).';
        $lines[] = '- Manifest de assets preenchido com fonte/licenca quando houver material externo.';
        $lines[] = '- Estetica final premium, com acabamento visual consistente e sem aparencia de template cru.';
        $lines[] = '';
        $lines[] = '## Blockers atuais';
        if (count($identityProfile['approval_blockers']) > 0) {
            foreach ($identityProfile['approval_blockers'] as $blocker) {
                $lines[] = '- ' . $blocker;
            }
        } else {
            $lines[] = '- Nenhum blocker critico de logo/manual.';
        }
        $lines[] = '';

        return implode("\n", $lines);
    }

    private static function variantDeepGuidance(string $variant): array
    {
        if ($variant === 'V1') {
            return [
                'experience_goals' => [
                    'Transformar uma pagina unica em uma jornada completa de conversao, com leitura facil e ritmo visual forte.',
                    'Construir credibilidade desde a primeira dobra com headline precisa, prova social e diferenciais tangiveis.',
                    'Garantir navegacao por ancoras muito fluida, sem confusao de hierarquia de conteudo.',
                ],
                'section_playbook' => [
                    'Hero: headline de impacto + subheadline orientada ao publico + CTA principal direto.',
                    'Sobre: contexto rapido da empresa, autoridade e visao de entrega.',
                    'Servicos/solucoes: cards objetivos com beneficio real, nao apenas lista de nome.',
                    'Diferenciais: transformar diferenciais do briefing em argumentos concretos.',
                    'Prova social: depoimentos/cases/indicadores de resultado coerentes com nicho.',
                    'CTA final + rodape: reforcar chamada principal e canais oficiais sem widgets extras.',
                ],
                'visual_magic' => [
                    'Usar composicao premium com contraste forte entre secoes, variacao de fundo e ritmo de espacamento.',
                    'Aplicar efeitos sutis de entrada/hover para dar sensacao de produto moderno sem exagero.',
                    'Criar assinatura visual propria do cliente a partir da paleta e do tom de voz.',
                ],
            ];
        }

        if ($variant === 'V2') {
            return [
                'experience_goals' => [
                    'Evoluir V1 para arquitetura multipagina sem perder consistencia visual e narrativa.',
                    'Aumentar profundidade de conteudo com pagina Sobre robusta e pagina Contato orientada a conversao.',
                    'Tornar formulario e WhatsApp canais de captura realmente funcionais no front-end.',
                ],
                'section_playbook' => [
                    'Home: manter base de V1 com refinamentos e links claros para Sobre/Contato.',
                    'Sobre: historia, metodo, equipe e autoridade com bloco de confianca.',
                    'Contato: formulario completo com estados de loading/sucesso/erro + informacoes de atendimento.',
                    'WhatsApp flutuante: presente nas 3 paginas, com mensagem inicial alinhada ao nicho.',
                ],
                'visual_magic' => [
                    'Manter tokens do V1 e elevar acabamento com variacoes de layout entre paginas.',
                    'Adicionar detalhes de interacao e feedback visual para reforcar profissionalismo.',
                    'Garantir continuidade de marca em menus, CTAs e blocos de apoio.',
                ],
            ];
        }

        return [
            'experience_goals' => [
                'Transformar V2 em experiencia de atendimento inteligente com chatbot protagonista.',
                'Manter poder de conversao do formulario e elevar engajamento com conversa guiada.',
                'Entregar sensacao de produto digital completo, moderno e personalizado ao negocio.',
            ],
            'section_playbook' => [
                'Base multipagina: manter Home, Sobre e Contato com consistencia visual do V2.',
                'Contato: formulario completo e CTA para abrir chatbot como canal prioritario.',
                'Chatbot: abrir rapido, linguagem aderente ao tom de voz, respostas objetivas e fluxo claro.',
                'Canal flutuante: remover WhatsApp flutuante, mantendo handoff humano pelo proprio chatbot.',
            ],
            'visual_magic' => [
                'Tratar chatbot como parte da identidade visual, nao como widget colado.',
                'Aplicar microanimacoes no abrir/fechar do chat e estados de conversa.',
                'Garantir que o chat nao conflite com menu, formulario e elementos fixos.',
            ],
        ];
    }

    private static function buildVariantPrompt(string $variant, array $normalized, array $assets, array $identityProfile, string $masterPath): string
    {
        $spec = self::variantSpec($variant);
        $deep = self::variantDeepGuidance($variant);
        $clientName = $normalized['client']['nome'];
        $clientSlug = $normalized['client']['slug'];
        $clientRoot = '/home/server/projects/clientes/' . $clientSlug;
        $variantRoot = $clientRoot . '/releases/v1/' . $spec['folder'];

        $pagesNeeded = self::stringifyList($normalized['content']['paginas_necessarias']);
        $integrations = self::stringifyList($normalized['content']['integracoes_desejadas']);
        $refs = self::stringifyList($normalized['style']['sites_referencia']);
        $secondaryGoals = self::stringifyList($normalized['style']['objetivos_secundarios']);

        $lines = [];
        $lines[] = '# Prompt de Execucao ' . $variant . ' - Site24h';
        $lines[] = '';
        $lines[] = '> Este prompt depende do Prompt Pai: `' . $masterPath . '`.';
        $lines[] = '> Leia o Prompt Pai antes de executar qualquer alteracao.';
        $lines[] = '';
        $lines[] = '## Objetivo da variante';
        $lines[] = 'Gerar/ajustar a variante **' . $variant . ' (' . $spec['name'] . ')** para o cliente **' . $clientName . '** com qualidade de publicacao e aderencia total ao briefing.';
        $lines[] = '';
        $lines[] = '## Modo de execucao (nivel agencia premium)';
        $lines[] = '- Operar como diretor de criacao + designer + desenvolvedor senior para entregar resultado final impressionante.';
        $lines[] = '- Nao fazer adaptacao superficial: reescrever copy, ajustar layout, polir componentes e elevar acabamento visual.';
        $lines[] = '- Buscar referencias e ativos quando faltar material, sempre com licenca rastreada e arquivo local.';
        $lines[] = '- Entregar experiencia final pronta para publicar, com narrativa forte e conversao clara.';
        $lines[] = '';
        $lines[] = '## Escadinha da variante';
        if ($spec['ladder'] === 'base') {
            $lines[] = '- Esta e a base estrutural de todo o projeto.';
            $lines[] = '- Tudo que for padrao visual/componente deve nascer aqui para ser reaproveitado nas variantes superiores.';
        } elseif ($spec['ladder'] === 'evolve_v1') {
            $lines[] = '- Evoluir a base de V1, mantendo coerencia de tokens/componentes.';
            $lines[] = '- Adicionar funcionalidades especificas de V2 sem descaracterizar o nucleo visual.';
        } else {
            $lines[] = '- Evoluir V2 mantendo funcionalidades essenciais e elevando atendimento com chatbot.';
            $lines[] = '- Remover canal flutuante de WhatsApp e priorizar fluxo via chatbot.';
        }
        $lines[] = '';
        $lines[] = '## Objetivos de experiencia desta variante';
        foreach ($deep['experience_goals'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Blueprint de secoes e conteudo';
        foreach ($deep['section_playbook'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Direcao visual e efeitos ("fator wow" controlado)';
        foreach ($deep['visual_magic'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Dados do briefing (100% obrigatorio aplicar)';
        $lines[] = '- Tipo de negocio: ' . self::normalizeForPrompt((string) $normalized['business']['tipo']);
        $lines[] = '- Tempo de atuacao: ' . self::normalizeForPrompt((string) $normalized['business']['tempo_atuacao']);
        $lines[] = '- Objetivo principal: ' . self::normalizeForPrompt((string) $normalized['business']['objetivo_principal']);
        $lines[] = '- Publico-alvo: ' . self::normalizeForPrompt((string) $normalized['business']['publico_alvo']);
        $lines[] = '- Diferenciais: ' . self::normalizeForPrompt((string) $normalized['business']['diferenciais']);
        $lines[] = '- Produtos/servicos: ' . self::normalizeForPrompt((string) $normalized['business']['produtos_servicos']);
        $lines[] = '- Nicho: ' . self::normalizeForPrompt((string) $normalized['business']['nicho']);
        $lines[] = '- Tom de voz: ' . self::normalizeForPrompt((string) $normalized['style']['tom_voz']);
        $lines[] = '- Estilo visual: ' . self::normalizeForPrompt((string) $normalized['style']['estilo_visual']);
        $lines[] = '- Paleta: ' . self::normalizeForPrompt((string) $normalized['style']['paleta_cores']);
        $lines[] = '- CTA principal: ' . self::normalizeForPrompt((string) $normalized['style']['cta_principal']);
        $lines[] = '- Objetivos secundarios: ' . $secondaryGoals;
        $lines[] = '- Sites referencia: ' . $refs;
        $lines[] = '- Paginas necessarias: ' . $pagesNeeded;
        $lines[] = '- Integracoes desejadas: ' . $integrations;
        $lines[] = '- Conteudo legal: ' . self::normalizeForPrompt((string) $normalized['content']['conteudo_legal']);
        $lines[] = '- Requisitos tecnicos extras: ' . self::normalizeForPrompt((string) $normalized['content']['requisitos_tecnicos']);
        $lines[] = '';
        $lines[] = '## Contexto de arquivos';
        $lines[] = '- Pasta cliente: `' . $clientRoot . '`';
        $lines[] = '- Pasta variante: `' . $variantRoot . '`';
        $lines[] = '- Assets: `' . $clientRoot . '/assets`';
        $lines[] = '- Identidade: `' . $clientRoot . '/identidade_visual.md`';
        $lines[] = '- Prompt consolidado: `' . $clientRoot . '/prompt_personalizacao.md`';
        $lines[] = '- Logos disponiveis: ' . self::stringifyList($assets['logo_files'], 'nenhuma');
        $lines[] = '- Manuais disponiveis: ' . self::stringifyList($assets['manual_files'], 'nenhum');
        $lines[] = '- Conteudos disponiveis: ' . self::stringifyList($assets['content_files'], 'nenhum');
        $lines[] = '';
        $lines[] = '## Regras obrigatorias da variante';
        foreach ($spec['required'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Regras proibidas da variante';
        foreach ($spec['forbidden'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Estrategia de edicao por arquivo (ordem obrigatoria)';
        $step = 1;
        foreach ($spec['files'] as $file) {
            $lines[] = $step . '. Editar `' . $variantRoot . '/' . $file . '` aplicando briefing, identidade e regras da variante.';
            $step++;
        }
        $lines[] = $step . '. Revisar consistencia global (tokens, espacamento, tipografia, componentes) e remover residuos genericos.';
        $step++;
        $lines[] = $step . '. Rodar QA tecnico/visual completo antes de marcar pronto.';
        $lines[] = '';
        $lines[] = '## Matriz condicional de completude';
        $lines[] = '- Sem logo: gerar logo vetorial profissional (`assets/logo/logo.svg`) + variacoes (`logo-web.png`, `favicon.ico`) e registrar no manifesto.';
        $lines[] = '- Sem manual: definir tokens de identidade visual completos e documentar criterio em `identidade_visual.md`.';
        $lines[] = '- Sem imagens: buscar fontes whitelist, baixar local em `assets/externos/`, registrar `source_url`, `license`, `attribution_required`.';
        $lines[] = '- Sem textos: gerar copy de alta qualidade por secao, orientada ao objetivo de conversao e ao tom de voz.';
        $lines[] = '- Sem elementos graficos especificos: compor com ilustracoes/fotos/icones de alto nivel, mantendo unidade visual.';
        $lines[] = '- Ao gerar conteudo complementar, priorizar clareza, autoridade e chamada para acao objetiva.';
        $lines[] = '';
        if ($variant === 'V3') {
            $lines[] = '## Personalizacao obrigatoria do chatbot (V3)';
            $lines[] = '- Definir persona do bot alinhada ao nicho e tom de voz do cliente.';
            $lines[] = '- Criar intents minimas: boas-vindas, servicos, preco/condicoes, qualificacao de lead, agendamento, encaminhamento humano.';
            $lines[] = '- Criar respostas rapidas com linguagem natural e objetiva.';
            $lines[] = '- Implementar fallback elegante para perguntas fora de contexto.';
            $lines[] = '- Definir handoff para contato humano com CTA claro e rastreavel.';
            $lines[] = '- Incluir bloco de configuracao editavel (persona, intents, regras de tom, mensagem de encerramento).';
            $lines[] = '- Garantir onboarding inicial do bot com 2-3 perguntas que qualifiquem o lead com baixa friccao.';
            $lines[] = '';
        }
        $lines[] = '## Regras de copywriting e narrativa';
        $lines[] = '- Headlines curtas, concretas e orientadas a beneficio.';
        $lines[] = '- Evitar jargao vazio; transformar diferenciais em provas, metodos e resultados.';
        $lines[] = '- Distribuir CTAs em pontos estrategicos da jornada, com texto alinhado ao objetivo principal.';
        $lines[] = '- Manter coerencia de tom em todas as paginas e componentes.';
        $lines[] = '';
        $lines[] = '## Definition of Done tecnico da variante';
        $lines[] = '- HTML semantico, headings corretos e links internos validos.';
        $lines[] = '- CSS limpo, consistente com paleta e contraste AA.';
        $lines[] = '- JS sem erro de console e interacoes estaveis.';
        $lines[] = '- Responsividade validada em 375, 768, 1024, 1366 e 1920.';
        $lines[] = '- SEO minimo completo (title, description, OG basico, headings coerentes).';
        $lines[] = '- Acessibilidade minima (labels, foco visivel, textos alternativos, ordem de navegacao).';
        $lines[] = '';
        $lines[] = '## Checklist de aceite (auditoria)';
        $lines[] = '- [ ] Briefing aplicado integralmente no conteudo e layout';
        $lines[] = '- [ ] Regras obrigatorias da variante atendidas';
        $lines[] = '- [ ] Nenhuma regra proibida violada';
        $lines[] = '- [ ] Identidade visual aplicada em header, secoes e footer';
        $lines[] = '- [ ] Navegacao completa sem erro no preview';
        $lines[] = '- [ ] Sem hotlinks de assets externos no resultado final';
        $lines[] = '- [ ] Site pronto para publicacao';
        $lines[] = '- [ ] Entrega com qualidade premium (nao aparenta template generico)';
        $lines[] = '';

        if (count($identityProfile['approval_blockers']) > 0) {
            $lines[] = '## Blockers detectados neste briefing';
            foreach ($identityProfile['approval_blockers'] as $blocker) {
                $lines[] = '- ' . $blocker;
            }
            $lines[] = '- Ajustar os blockers acima antes de envio para aprovacao do cliente.';
            $lines[] = '';
        }

        return implode("\n", $lines);
    }

    private static function buildIdentityMd(array $normalized, array $assets, array $identityProfile): string
    {
        $lines = [];
        $lines[] = '# Identidade Visual - Site24h';
        $lines[] = '';
        $lines[] = '- Cliente: **' . $normalized['client']['nome'] . '**';
        $lines[] = '- Atualizado em: **' . date('c') . '**';
        $lines[] = '';
        $lines[] = '## DNA da marca';
        $lines[] = '- Posicionamento: ' . self::normalizeForPrompt((string) $normalized['business']['tipo']);
        $lines[] = '- Publico-alvo: ' . self::normalizeForPrompt((string) $normalized['business']['publico_alvo']);
        $lines[] = '- Objetivo de conversao: ' . self::normalizeForPrompt((string) $normalized['business']['objetivo_principal']);
        $lines[] = '- Tom de voz: ' . self::normalizeForPrompt((string) $normalized['style']['tom_voz']);
        $lines[] = '- CTA principal: ' . self::normalizeForPrompt((string) $normalized['style']['cta_principal']);
        $lines[] = '';
        $lines[] = '## Paleta e contraste';
        $lines[] = '- Paleta base declarada: ' . $normalized['style']['paleta_cores'];
        $lines[] = '- Definir papeis: primaria, secundaria, acento, fundo, texto, estado de erro/sucesso.';
        $lines[] = '- Garantir contraste AA nos pares texto/fundo e botoes.';
        $lines[] = '- Criar variacao de paleta para estados interativos (hover/focus/active) sem perder consistencia.';
        $lines[] = '';
        $lines[] = '## Tipografia e hierarquia';
        $lines[] = '- Usar no maximo duas familias tipograficas com boa leitura em mobile.';
        $lines[] = '- H1-H3 com hierarquia clara e apoio de subtitulos curtos.';
        $lines[] = '- Corpo de texto com 16px base e line-height adequado.';
        $lines[] = '';
        $lines[] = '## Regras de logo';
        $lines[] = '- Status logo: **' . $identityProfile['logo_status'] . '**';
        $lines[] = '- Arquivos logo recebidos: ' . self::stringifyList($assets['logo_files'], 'nenhum');
        $lines[] = '- Se ausente: gerar `assets/logo/logo.svg`, `logo-web.png` e `favicon.ico` coerentes com nicho + tom.';
        $lines[] = '';
        $lines[] = '## Regras de componentes';
        $lines[] = '- Botoes: destaque para CTA principal, hover/focus visiveis.';
        $lines[] = '- Cards/blocos: padrao unico de borda, sombra e espacamento.';
        $lines[] = '- Header/footer: identidade consistente em todas as variantes.';
        $lines[] = '- Secoes hero e prova social devem sustentar percepcao premium e confianca imediata.';
        $lines[] = '- Estados vazios, loading e erro devem seguir a mesma identidade visual.';
        $lines[] = '';
        $lines[] = '## Matriz de faltas (acao obrigatoria)';
        $lines[] = '- Sem logo: gerar variacoes locais e registrar rationale.';
        $lines[] = '- Sem manual: derivar identidade completa a partir do briefing.';
        $lines[] = '- Sem conteudo: gerar material provisiorio de alto nivel com marcacoes de validacao.';
        $lines[] = '';
        $lines[] = '## Inventario de assets';
        $lines[] = '- Manual: ' . self::stringifyList($assets['manual_files'], 'nenhum');
        $lines[] = '- Conteudo: ' . self::stringifyList($assets['content_files'], 'nenhum');
        $lines[] = '- Outros: ' . self::stringifyList($assets['other_files'], 'nenhum');
        $lines[] = '';
        $lines[] = '## Blockers de aprovacao';
        if (count($identityProfile['approval_blockers']) > 0) {
            foreach ($identityProfile['approval_blockers'] as $blocker) {
                $lines[] = '- ' . $blocker;
            }
        } else {
            $lines[] = '- Nenhum blocker.';
        }
        $lines[] = '';

        return implode("\n", $lines);
    }

    private static function buildMarkdown(array $bundle): string
    {
        $lines = [];
        $lines[] = '# Prompt de Personalizacao - Site24h';
        $lines[] = '';
        $lines[] = '- Cliente: **' . (string) ($bundle['client']['nome'] ?? 'Cliente') . '**';
        $lines[] = '- Gerado em: **' . (string) ($bundle['generated_at'] ?? date('c')) . '**';
        $lines[] = '- Objetivo principal: **' . (string) ($bundle['business']['objetivo_principal'] ?? 'nao informado') . '**';
        $lines[] = '- Publico-alvo: **' . (string) ($bundle['business']['publico_alvo'] ?? 'nao informado') . '**';
        $lines[] = '';
        $lines[] = '## Arquivos de execucao';
        $lines[] = '- Prompt Pai: `prompt_pai_orquestrador.md`';
        $lines[] = '- Prompt V1: `prompt_v1_draft.md`';
        $lines[] = '- Prompt V2: `prompt_v2_draft.md`';
        $lines[] = '- Prompt V3: `prompt_v3_draft.md`';
        $lines[] = '- Identidade visual: `identidade_visual.md`';
        $lines[] = '- Manifesto de assets: `assets/assets_manifest.json`';
        $lines[] = '';
        $lines[] = '## Blockers de aprovacao';
        $blockers = (array) ($bundle['approvalRules']['hard_blockers'] ?? []);
        if (count($blockers) === 0) {
            $lines[] = '- Nenhum blocker detectado.';
        } else {
            foreach ($blockers as $blocker) {
                $lines[] = '- ' . (string) $blocker;
            }
        }
        $lines[] = '';
        $lines[] = '## Qualidade obrigatoria';
        foreach ((array) ($bundle['qualityRequirements'] ?? []) as $item) {
            $lines[] = '- ' . (string) $item;
        }
        $lines[] = '';

        return implode("\n", $lines);
    }

    public static function build(array $brief): array
    {
        $normalized = self::normalizeBrief($brief);
        $assets = self::extractAssetsContext($brief);
        $identityProfile = self::buildIdentityProfile($normalized, $assets);

        $clientRoot = '/home/server/projects/clientes/' . $normalized['client']['slug'];
        $masterPromptPath = $clientRoot . '/prompt_pai_orquestrador.md';
        $masterPromptMarkdown = self::buildMasterPrompt($normalized, $assets, $identityProfile);

        $variantPrompts = [];
        $variantInstructions = [];
        foreach (['V1', 'V2', 'V3'] as $variant) {
            $variantSpec = self::variantSpec($variant);
            $variantPrompts[$variant] = self::buildVariantPrompt($variant, $normalized, $assets, $identityProfile, $masterPromptPath);
            $variantInstructions[$variant] = [
                'folder' => $variantSpec['folder'],
                'specificInstructions' => $variantSpec['required'],
                'negativeRules' => $variantSpec['forbidden'],
                'definitionOfDone' => [
                    'HTML/CSS/JS valido e sem erro de console',
                    'Responsivo em mobile/tablet/desktop',
                    'SEO e acessibilidade minima atendidos',
                    'Sem quebra da arquitetura base do template',
                ],
            ];
        }

        $identityMd = self::buildIdentityMd($normalized, $assets, $identityProfile);

        $bundle = [
            'task' => 'personalizar_templates_site',
            'version' => '3.0',
            'generated_at' => date('c'),
            'client' => $normalized['client'],
            'identity' => [
                'possui_logo' => $identityProfile['logo_present'],
                'possui_manual_marca' => $identityProfile['manual_present'],
                'logo_descricao' => $normalized['identity']['logo_descricao'],
                'paleta_cores' => $normalized['style']['paleta_cores'],
                'toneOfVoice' => $normalized['style']['tom_voz'],
                'colorPaletteRaw' => $normalized['style']['paleta_cores'],
                'logoStatus' => $identityProfile['logo_status'],
                'manualStatus' => $identityProfile['manual_status'],
            ],
            'business' => $normalized['business'],
            'style' => $normalized['style'],
            'content' => [
                ...$normalized['content'],
                'status_conteudo' => $assets['has_content'] ? 'informado_ou_parcial' : 'placeholder_orientado',
            ],
            'assets' => [
                'uploaded_files' => $assets['uploaded_files'],
                'logo_files' => $assets['logo_files'],
                'manual_files' => $assets['manual_files'],
                'content_files' => $assets['content_files'],
                'other_files' => $assets['other_files'],
                'logo_status' => $identityProfile['logo_status'],
                'manual_status' => $identityProfile['manual_status'],
                'content_status' => $identityProfile['content_status'],
            ],
            'conditions' => [
                'sem_logo' => !$identityProfile['logo_present'] ? 'gerar_logo_svg_png_favicon + hard_block_aprovacao' : 'nao',
                'sem_manual_marca' => !$identityProfile['manual_present'] ? 'derivar_identidade + hard_block_aprovacao' : 'nao',
                'sem_conteudo' => !$assets['has_content'] ? 'gerar_copy_e_imagens_provisorias_de_qualidade' : 'nao',
            ],
            'approvalRules' => [
                'hard_blockers' => $identityProfile['approval_blockers'],
                'allow_internal_preview_with_placeholders' => true,
                'allow_client_approval' => count($identityProfile['approval_blockers']) === 0,
            ],
            'master_prompt_markdown' => $masterPromptMarkdown,
            'master_prompt_path' => $masterPromptPath,
            'master_prompt_locked' => true,
            'variant_prompts' => $variantPrompts,
            'variantInstructions' => $variantInstructions,
            'identity_markdown' => $identityMd,
            'assets_manifest_schema' => [
                'path' => 'assets/assets_manifest.json',
                'fields' => ['source_url', 'license', 'attribution_required', 'downloaded_at', 'local_path', 'category'],
                'allowed_sources' => self::ASSET_SOURCE_WHITELIST,
            ],
            'qualityRequirements' => [
                'Prompt por variante com estrategia prescritiva por arquivo',
                'Regras positivas e negativas explicitas por variante',
                'DoD tecnico completo para html/css/js/seo/a11y/responsividade',
                'Checklist operacional auditavel antes de aprovar',
                'Entrega pronta para publicacao, sem layout cru',
            ],
        ];

        $text = 'Executar Prompt Pai + prompt da variante alvo (V1/V2/V3) para gerar site pronto para publicacao com qualidade de producao.';

        return [
            'json' => $bundle,
            'text' => $text,
            'markdown' => self::buildMarkdown($bundle),
            'master_prompt_markdown' => $masterPromptMarkdown,
            'variantInstructions' => $variantInstructions,
        ];
    }
}
