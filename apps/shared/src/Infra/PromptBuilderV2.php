<?php
declare(strict_types=1);

namespace Shared\Infra;

final class PromptBuilderV2
{
    private static function pick(array $brief, array $keys, string $fallback = ''): string {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $brief)) {
                continue;
            }
            $value = trim((string) $brief[$key]);
            if ($value !== '') {
                return $value;
            }
        }
        return $fallback;
    }

    private static function boolLike(array $brief, array $keys): bool {
        $raw = strtolower(self::pick($brief, $keys));
        if ($raw === '') {
            return false;
        }
        return in_array($raw, ['1', 'true', 'yes', 'sim', 'y', 'tem', 'completo', 'partial', 'parcial'], true);
    }

    private static function listFromText(string $value): array {
        if (trim($value) === '') {
            return [];
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

    private static function inferAssetType(string $path): string {
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

    private static function slugify(string $value): string {
        $value = strtolower(trim($value));
        $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: 'cliente';
        $value = trim((string) $value, '-');
        return $value !== '' ? $value : 'cliente';
    }

    private static function normalizeBrief(array $brief): array {
        $clientName = self::pick($brief, ['legal_name', 'nome_cliente'], 'Cliente');
        $clientSlug = self::pick($brief, ['organization_slug', 'org_slug', 'client_slug'], '');
        if ($clientSlug === '') {
            $clientSlug = self::slugify($clientName);
        }
        return [
            'client' => [
                'nome' => $clientName,
                'slug' => $clientSlug,
                'domain_target' => self::pick($brief, ['domain_target', 'dominio_desejado'], 'nao informado'),
            ],
            'business' => [
                'tipo' => self::pick($brief, ['business_type', 'tipo_negocio'], 'nao informado'),
                'tempo_atuacao' => self::pick($brief, ['business_time', 'tempo_atuacao'], 'nao informado'),
                'objetivo_principal' => self::pick($brief, ['objective', 'objetivo_principal'], 'nao informado'),
                'publico_alvo' => self::pick($brief, ['audience', 'publico_alvo'], 'nao informado'),
                'diferenciais' => self::pick($brief, ['differentials', 'diferenciais_competitivos'], 'nao informado'),
                'produtos_servicos' => self::pick($brief, ['services', 'principais_produtos_servicos'], 'nao informado'),
                'nicho' => self::pick($brief, ['niche', 'nicho_especifico'], 'nao informado'),
            ],
            'style' => [
                'tom_voz' => self::pick($brief, ['tone_of_voice', 'tom_voz'], 'profissional_formal'),
                'estilo_visual' => self::pick($brief, ['style_vibe', 'estilo_visual'], 'moderno_clean'),
                'paleta_cores' => self::pick($brief, ['color_palette', 'paleta_cores'], 'nao informado'),
                'cta_principal' => self::pick($brief, ['cta_text', 'cta_principal'], 'Fale conosco'),
                'sites_referencia' => self::listFromText(self::pick($brief, ['references', 'sites_referencia'])),
                'objetivos_secundarios' => self::listFromText(self::pick($brief, ['secondary_goals', 'objetivos_secundarios'])),
            ],
            'content' => [
                'integracoes_desejadas' => self::listFromText(self::pick($brief, ['integrations', 'integracoes_desejadas'])),
                'paginas_necessarias' => self::listFromText(self::pick($brief, ['pages_needed', 'paginas_necessarias'])),
                'conteudo_legal' => self::pick($brief, ['legal_content', 'conteudo_legal'], 'nao informado'),
                'requisitos_tecnicos' => self::pick($brief, ['extra_requirements', 'requisitos_tecnicos_extras'], 'nao informado'),
            ],
            'identity' => [
                'possui_logo' => self::boolLike($brief, ['has_logo', 'tem_logo', 'possui_logo']),
                'possui_manual_marca' => self::boolLike($brief, ['has_brand_manual', 'tem_identidade_visual', 'possui_manual_marca']),
                'logo_descricao' => self::pick($brief, ['logo_description', 'descricao_logo'], 'nao informado'),
            ],
        ];
    }

    private static function extractAssetsContext(array $brief): array {
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

    private static function buildIdentityProfile(array $normalized, array $assets): array {
        $logoPresent = $normalized['identity']['possui_logo'] || count($assets['logo_files']) > 0;
        $manualPresent = $normalized['identity']['possui_manual_marca'] || count($assets['manual_files']) > 0;
        $logoStatus = $logoPresent ? 'received' : 'missing';
        $manualStatus = $manualPresent ? 'received' : 'missing';
        $contentStatus = $assets['has_content'] ? 'partial_or_received' : 'missing';

        $approvalBlockers = [];
        if (!$logoPresent) {
            $approvalBlockers[] = 'logo_ausente';
        }
        if (!$manualPresent) {
            $approvalBlockers[] = 'manual_marca_ausente';
        }

        return [
            'logo_status' => $logoStatus,
            'manual_status' => $manualStatus,
            'content_status' => $contentStatus,
            'approval_blockers' => $approvalBlockers,
            'logo_present' => $logoPresent,
            'manual_present' => $manualPresent,
        ];
    }

    private static function variantSpec(string $variant): array {
        if ($variant === 'V1') {
            return [
                'name' => 'Institucional 1 pagina',
                'folder' => 'modelo_v1',
                'required' => [
                    'Pagina unica com ancoras',
                    'Secoes: Hero, Sobre, Servicos, Diferenciais, Contato visual sem formulario, FAQ opcional, Rodape',
                    'SEO local basico no index.html',
                ],
                'forbidden' => [
                    'Nao adicionar formulario de contato',
                    'Nao adicionar botao WhatsApp',
                    'Nao adicionar chatbot',
                ],
                'files' => ['index.html', 'css/style.css', 'js/script.js'],
            ];
        }
        if ($variant === 'V2') {
            return [
                'name' => 'Institucional 3 paginas',
                'folder' => 'modelo_v2',
                'required' => [
                    'Paginas: index.html, sobre.html, contato.html',
                    'Formulario funcional em contato.html',
                    'Botao WhatsApp em todas as paginas',
                    'Navegacao coerente entre paginas e menu mobile funcional',
                ],
                'forbidden' => [
                    'Nao adicionar chatbot',
                ],
                'files' => ['index.html', 'sobre.html', 'contato.html', 'css/style.css', 'js/script.js'],
            ];
        }
        return [
            'name' => 'Institucional completo com chatbot',
            'folder' => 'modelo_v3',
            'required' => [
                'Paginas: index.html, sobre.html, contato.html',
                'Formulario funcional em contato.html',
                'Botao WhatsApp em todas as paginas',
                'Chatbot Kodassauro integrado e funcional',
                'Microinteracoes suaves e consistentes com o tema',
            ],
            'forbidden' => [
                'Nao remover chatbot desta variante',
            ],
            'files' => ['index.html', 'sobre.html', 'contato.html', 'css/style.css', 'js/script.js', 'js/kodassauro-chat.js'],
        ];
    }

    private static function stringifyList(array $list, string $fallback = 'nao informado'): string {
        return count($list) > 0 ? implode(', ', $list) : $fallback;
    }

    private static function buildVariantPrompt(string $variant, array $normalized, array $assets, array $identityProfile): string {
        $clientName = $normalized['client']['nome'];
        $clientSlug = (string) ($normalized['client']['slug'] ?? self::slugify($clientName));
        $variantSpec = self::variantSpec($variant);
        $variantFolder = $variantSpec['folder'];
        $clientRoot = '/home/server/projects/clientes/' . $clientSlug;
        $variantRoot = $clientRoot . '/' . $variantFolder;

        $pagesNeeded = self::stringifyList($normalized['content']['paginas_necessarias']);
        $integrations = self::stringifyList($normalized['content']['integracoes_desejadas']);
        $refs = self::stringifyList($normalized['style']['sites_referencia']);
        $secondaryGoals = self::stringifyList($normalized['style']['objetivos_secundarios']);

        $lines = [];
        $lines[] = '# Prompt Master ' . $variant . ' - Site24h';
        $lines[] = '';
        $lines[] = '## Missao';
        $lines[] = 'Personalizar o template da variante ' . $variant . ' para o cliente **' . $clientName . '**, mantendo arquitetura base e elevando qualidade visual/tecnica sem quebrar responsividade.';
        $lines[] = '';
        $lines[] = '## Contexto integral do briefing';
        $lines[] = '- Tipo de negocio: ' . $normalized['business']['tipo'];
        $lines[] = '- Tempo de atuacao: ' . $normalized['business']['tempo_atuacao'];
        $lines[] = '- Objetivo principal: ' . $normalized['business']['objetivo_principal'];
        $lines[] = '- Publico-alvo: ' . $normalized['business']['publico_alvo'];
        $lines[] = '- Diferenciais: ' . $normalized['business']['diferenciais'];
        $lines[] = '- Produtos/servicos: ' . $normalized['business']['produtos_servicos'];
        $lines[] = '- Nicho: ' . $normalized['business']['nicho'];
        $lines[] = '- Dominio alvo: ' . $normalized['client']['domain_target'];
        $lines[] = '- Tom de voz: ' . $normalized['style']['tom_voz'];
        $lines[] = '- Estilo visual: ' . $normalized['style']['estilo_visual'];
        $lines[] = '- Paleta de cores: ' . $normalized['style']['paleta_cores'];
        $lines[] = '- CTA principal: ' . $normalized['style']['cta_principal'];
        $lines[] = '- Objetivos secundarios: ' . $secondaryGoals;
        $lines[] = '- Sites de referencia: ' . $refs;
        $lines[] = '- Paginas necessarias: ' . $pagesNeeded;
        $lines[] = '- Integracoes desejadas: ' . $integrations;
        $lines[] = '- Conteudo legal: ' . $normalized['content']['conteudo_legal'];
        $lines[] = '- Requisitos tecnicos extras: ' . $normalized['content']['requisitos_tecnicos'];
        $lines[] = '';
        $lines[] = '## Contexto de assets reais';
        $lines[] = '- Pasta do cliente: `' . $clientRoot . '`';
        $lines[] = '- Pasta da variante: `' . $variantRoot . '`';
        $lines[] = '- Pasta de assets: `' . $clientRoot . '/assets`';
        $lines[] = '- Arquivo de identidade visual: `' . $clientRoot . '/identidade_visual.md`';
        $lines[] = '- Logos disponiveis: ' . self::stringifyList($assets['logo_files'], 'nenhuma');
        $lines[] = '- Manuais de marca disponiveis: ' . self::stringifyList($assets['manual_files'], 'nenhum');
        $lines[] = '- Conteudos disponiveis: ' . self::stringifyList($assets['content_files'], 'nenhum');
        $lines[] = '- Outros arquivos: ' . self::stringifyList($assets['other_files'], 'nenhum');
        $lines[] = '';
        $lines[] = '## Regras obrigatorias da variante ' . $variant;
        foreach ($variantSpec['required'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Regras proibidas da variante ' . $variant;
        foreach ($variantSpec['forbidden'] as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        $lines[] = '## Estrategia de edicao por arquivo';
        $lines[] = '1. Abrir primeiro `' . $variantRoot . '/index.html` e ajustar copy, estrutura de secoes e hierarquia sem quebrar classes base.';
        if (in_array('sobre.html', $variantSpec['files'], true)) {
            $lines[] = '2. Ajustar `' . $variantRoot . '/sobre.html` para narrativa institucional coerente com diferencial e publico.';
        }
        if (in_array('contato.html', $variantSpec['files'], true)) {
            $lines[] = '3. Ajustar `' . $variantRoot . '/contato.html` com campos de formulario adequados e CTA principal.';
        }
        $lines[] = '4. Refinar `' . $variantRoot . '/css/style.css` aplicando paleta, tipografia e contrastes sem alterar breakpoints existentes.';
        $lines[] = '5. Ajustar `' . $variantRoot . '/js/script.js` para manter interacoes atuais e inserir apenas scripts necessarios.';
        if ($variant === 'V3') {
            $lines[] = '6. Garantir `' . $variantRoot . '/js/kodassauro-chat.js` com estilo alinhado a marca e comportamento estavel.';
        }
        $lines[] = '';
        $lines[] = '## Matriz condicional (obrigatoria)';
        $lines[] = '- Se logo estiver ausente: usar `assets/logo_placeholder.svg` para trabalho interno e registrar TODO de substituicao.';
        $lines[] = '- Se manual de marca estiver ausente: normalizar paleta a partir do briefing e registrar BLOQUEIO para aprovacao externa.';
        $lines[] = '- Se textos/imagens estiverem ausentes: gerar placeholders coerentes com negocio e marcar cada bloco com `TODO_CONTEUDO_REAL`.';
        $lines[] = '';
        $lines[] = '## Definition of Done tecnico';
        $lines[] = '- HTML semantico com estrutura valida (header/main/section/footer).';
        $lines[] = '- CSS consistente com tokens de cor e contraste minimo AA.';
        $lines[] = '- JS sem erros de console e sem quebrar navegacao.';
        $lines[] = '- Responsividade validada em 375, 768, 1024 e 1366 px.';
        $lines[] = '- SEO minimo: title, meta description, headings coerentes e links internos funcionais.';
        $lines[] = '- Acessibilidade minima: alt em imagens relevantes, foco visivel e labels em campos.';
        $lines[] = '';
        $lines[] = '## Checklist final antes de marcar pronto';
        $lines[] = '- [ ] Todas as regras obrigatorias da variante atendidas';
        $lines[] = '- [ ] Nenhuma regra proibida violada';
        $lines[] = '- [ ] Assets de logo/manual validados (sem bloqueio pendente)';
        $lines[] = '- [ ] Conteudo alinhado ao briefing e tom de voz';
        $lines[] = '- [ ] Preview navegavel sem erro';
        $lines[] = '';
        $lines[] = '## Criterios de aceite operacionais';
        $lines[] = '- Entrega pronta para revisao interna com consistencia visual e tecnica.';
        $lines[] = '- Possivel enviar para cliente sem retrabalho estrutural.';
        $lines[] = '';
        if (count($identityProfile['approval_blockers']) > 0) {
            $lines[] = '## Bloqueios de aprovacao detectados';
            foreach ($identityProfile['approval_blockers'] as $blocker) {
                $lines[] = '- ' . $blocker;
            }
            $lines[] = '';
        }
        return implode("\n", $lines);
    }

    private static function buildIdentityMd(array $normalized, array $assets, array $identityProfile): string {
        $lines = [];
        $lines[] = '# Identidade Visual - Site24h';
        $lines[] = '';
        $lines[] = '- Cliente: **' . $normalized['client']['nome'] . '**';
        $lines[] = '- Gerado em: **' . date('c') . '**';
        $lines[] = '';
        $lines[] = '## DNA da marca';
        $lines[] = '- Posicionamento: ' . $normalized['business']['tipo'];
        $lines[] = '- Publico-alvo: ' . $normalized['business']['publico_alvo'];
        $lines[] = '- Objetivo de conversao: ' . $normalized['business']['objetivo_principal'];
        $lines[] = '- Tom de voz: ' . $normalized['style']['tom_voz'];
        $lines[] = '- CTA principal: ' . $normalized['style']['cta_principal'];
        $lines[] = '';
        $lines[] = '## Regras de paleta';
        $lines[] = '- Paleta declarada: ' . $normalized['style']['paleta_cores'];
        $lines[] = '- Primaria: usar para CTAs e destaques de conversao.';
        $lines[] = '- Secundaria: usar para estados de apoio e componentes auxiliares.';
        $lines[] = '- Neutros: usar para fundo e textos de leitura longa.';
        $lines[] = '- Contraste: garantir AA minimo.';
        $lines[] = '';
        $lines[] = '## Tipografia e hierarquia';
        $lines[] = '- Heading H1-H3 com peso alto e leitura rapida.';
        $lines[] = '- Corpo com legibilidade em mobile e desktop.';
        $lines[] = '- Evitar mais de 2 familias tipograficas.';
        $lines[] = '';
        $lines[] = '## Regras de logo';
        $lines[] = '- Status de logo: **' . $identityProfile['logo_status'] . '**';
        $lines[] = '- Arquivos de logo: ' . self::stringifyList($assets['logo_files'], 'nenhum');
        $lines[] = '- Se ausente: usar placeholder tecnico interno e bloquear aprovacao.';
        $lines[] = '- Aplicar no header e footer de todas as variantes.';
        $lines[] = '';
        $lines[] = '## Componentes chave';
        $lines[] = '- Botoes: contraste alto, hover visivel, foco acessivel.';
        $lines[] = '- Cards: sombra leve, borda coerente e espacamento consistente.';
        $lines[] = '- Secoes: ritmo visual com espacamento vertical consistente.';
        $lines[] = '';
        $lines[] = '## Anti-padroes proibidos';
        $lines[] = '- Nao misturar estilos fora da identidade definida.';
        $lines[] = '- Nao quebrar menu/responsividade base dos templates.';
        $lines[] = '- Nao publicar com assets criticos ausentes.';
        $lines[] = '';
        $lines[] = '## Matriz de faltas de assets';
        $lines[] = '- Sem logo: placeholder interno + bloqueio de aprovacao.';
        $lines[] = '- Sem manual: fallback de paleta/tom + bloqueio de aprovacao.';
        $lines[] = '- Sem conteudo: placeholders orientados por negocio, aprovacao apenas interna.';
        $lines[] = '';
        $lines[] = '## Inventario de assets';
        $lines[] = '- Manuais: ' . self::stringifyList($assets['manual_files'], 'nenhum');
        $lines[] = '- Conteudo: ' . self::stringifyList($assets['content_files'], 'nenhum');
        $lines[] = '- Outros: ' . self::stringifyList($assets['other_files'], 'nenhum');
        $lines[] = '';
        $lines[] = '## Blockers atuais de aprovacao';
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

    private static function buildMarkdown(array $bundle): string {
        $lines = [];
        $lines[] = '# Prompt de Personalizacao - Site24h';
        $lines[] = '';
        $lines[] = '- Cliente: **' . (string) ($bundle['client']['nome'] ?? 'Cliente') . '**';
        $lines[] = '- Gerado em: **' . (string) ($bundle['generated_at'] ?? date('c')) . '**';
        $lines[] = '- Objetivo principal: **' . (string) ($bundle['business']['objetivo_principal'] ?? 'nao informado') . '**';
        $lines[] = '- Publico-alvo: **' . (string) ($bundle['business']['publico_alvo'] ?? 'nao informado') . '**';
        $lines[] = '';
        $lines[] = '## Resumo executivo';
        $lines[] = '- Esta revisao gera tres prompts mestres individuais: V1, V2 e V3.';
        $lines[] = '- Os prompts completos estao em `prompt_v1_draft.md`, `prompt_v2_draft.md` e `prompt_v3_draft.md`.';
        $lines[] = '- Diretrizes de marca estao em `identidade_visual.md`.';
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

    public static function build(array $brief): array {
        $normalized = self::normalizeBrief($brief);
        $assets = self::extractAssetsContext($brief);
        $identityProfile = self::buildIdentityProfile($normalized, $assets);

        $variantPrompts = [];
        $variantInstructions = [];
        foreach (['V1', 'V2', 'V3'] as $variant) {
            $variantSpec = self::variantSpec($variant);
            $variantPrompts[$variant] = self::buildVariantPrompt($variant, $normalized, $assets, $identityProfile);
            $variantInstructions[$variant] = [
                'folder' => $variantSpec['folder'],
                'specificInstructions' => $variantSpec['required'],
                'negativeRules' => $variantSpec['forbidden'],
                'definitionOfDone' => [
                    'HTML/CSS/JS valido e sem erro de console',
                    'Responsivo (mobile/tablet/desktop)',
                    'SEO minimo + acessibilidade minima',
                    'Sem quebra da arquitetura do template base',
                ],
            ];
        }

        $identityMd = self::buildIdentityMd($normalized, $assets, $identityProfile);
        $bundle = [
            'task' => 'personalizar_templates_site',
            'version' => '2.1',
            'generated_at' => date('c'),
            'client' => $normalized['client'],
            'identity' => [
                'possui_logo' => $identityProfile['logo_present'],
                'possui_manual_marca' => $identityProfile['manual_present'],
                'logo_descricao' => $normalized['identity']['logo_descricao'],
                'paleta_cores' => $normalized['style']['paleta_cores'],
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
                'sem_logo' => !$identityProfile['logo_present'] ? 'placeholder_tecnico_interno + hard_block_aprovacao' : 'nao',
                'sem_manual_marca' => !$identityProfile['manual_present'] ? 'fallback_visual + hard_block_aprovacao' : 'nao',
                'sem_conteudo' => !$assets['has_content'] ? 'permitido_placeholder_orientado' : 'nao',
            ],
            'approvalRules' => [
                'hard_blockers' => $identityProfile['approval_blockers'],
                'allow_internal_preview_with_placeholders' => true,
                'allow_client_approval' => count($identityProfile['approval_blockers']) === 0,
            ],
            'variant_prompts' => $variantPrompts,
            'variantInstructions' => $variantInstructions,
            'identity_markdown' => $identityMd,
            'qualityRequirements' => [
                'Prompt por variante com estrategia de edicao por arquivo',
                'Regras positivas e negativas explicitas',
                'DoD tecnico completo para html/css/js/seo/a11y/responsividade',
                'Checklist operacional antes de aprovar',
            ],
        ];

        $text = 'Use os prompts individuais V1/V2/V3 para personalizar os modelos com fidelidade ao briefing, '
            . 'seguindo identidade visual, regras condicionais e Definition of Done tecnico.';

        return [
            'json' => $bundle,
            'text' => $text,
            'markdown' => self::buildMarkdown($bundle),
            'variantInstructions' => $variantInstructions,
        ];
    }
}
