<?php
declare(strict_types=1);

namespace Shared\Infra;

final class PromptBuilderV2
{
    private static function pick(array $brief, array $keys, string $fallback = ''): string
    {
        foreach ($keys as $key) {
            if (!array_key_exists($key, $brief)) {
                continue;
            }
            $value = trim((string)$brief[$key]);
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
        return in_array($raw, ['1', 'true', 'yes', 'sim', 'y', 'tem', 'completo', 'partial', 'parcial'], true);
    }

    private static function listFromText(string $value): array
    {
        if (trim($value) === '') {
            return [];
        }
        $parts = preg_split('/[\n,;]+/', $value) ?: [];
        $list = [];
        foreach ($parts as $part) {
            $item = trim((string)$part);
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
        if (str_contains($name, 'manual') || str_contains($name, 'brand')) {
            return 'manual';
        }
        if (str_contains($name, 'conteudo') || str_contains($name, 'content')) {
            return 'conteudo';
        }
        return 'outro';
    }

    private static function buildMarkdown(array $bundle): string
    {
        $clientName = (string)($bundle['client']['nome'] ?? 'Cliente');
        $generatedAt = (string)($bundle['generated_at'] ?? date('c'));
        $negocio = (string)($bundle['business']['tipo'] ?? 'nao informado');
        $objetivo = (string)($bundle['business']['objetivo_principal'] ?? 'nao informado');
        $publico = (string)($bundle['business']['publico_alvo'] ?? 'nao informado');
        $tom = (string)($bundle['style']['tom_voz'] ?? 'nao informado');
        $estilo = (string)($bundle['style']['estilo_visual'] ?? 'nao informado');
        $cta = (string)($bundle['style']['cta_principal'] ?? 'Fale conosco');
        $integracoes = $bundle['content']['integracoes_desejadas'] ?? [];
        $paginas = $bundle['content']['paginas_necessarias'] ?? [];

        $lines = [];
        $lines[] = '# Prompt de Personalizacao - Site24h';
        $lines[] = '';
        $lines[] = '- Cliente: **' . $clientName . '**';
        $lines[] = '- Gerado em: **' . $generatedAt . '**';
        $lines[] = '- Tipo de negocio: **' . $negocio . '**';
        $lines[] = '';
        $lines[] = '## Objetivo';
        $lines[] = $objetivo;
        $lines[] = '';
        $lines[] = '## Publico-alvo';
        $lines[] = $publico;
        $lines[] = '';
        $lines[] = '## Estilo e comunicacao';
        $lines[] = '- Tom de voz: **' . $tom . '**';
        $lines[] = '- Estilo visual: **' . $estilo . '**';
        $lines[] = '- CTA principal: **' . $cta . '**';
        $lines[] = '';
        $lines[] = '## Integracoes desejadas';
        $lines[] = count($integracoes) > 0 ? implode(', ', $integracoes) : 'Nao informado';
        $lines[] = '';
        $lines[] = '## Paginas necessarias';
        $lines[] = count($paginas) > 0 ? implode(', ', $paginas) : 'Nao informado';
        $lines[] = '';
        $lines[] = '## Instrucoes por variante';
        foreach (['V1', 'V2', 'V3'] as $variant) {
            $rules = $bundle['variantInstructions'][$variant]['specificInstructions'] ?? [];
            $lines[] = '### ' . $variant;
            foreach ($rules as $rule) {
                $lines[] = '- ' . $rule;
            }
            $lines[] = '';
        }
        $lines[] = '## Condicionais';
        $conditions = $bundle['conditions'] ?? [];
        foreach ($conditions as $k => $v) {
            $lines[] = '- **' . $k . '**: ' . (is_array($v) ? json_encode($v, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : (string)$v);
        }
        $lines[] = '';
        $lines[] = '## Qualidade obrigatoria';
        $quality = $bundle['qualityRequirements'] ?? [];
        foreach ($quality as $item) {
            $lines[] = '- ' . $item;
        }
        $lines[] = '';
        return implode("\n", $lines);
    }

    public static function build(array $brief): array
    {
        $uploadedFiles = array_values(array_filter(array_map(
            static fn($item) => trim((string)$item),
            (array)($brief['uploaded_files'] ?? [])
        )));

        $hasLogo = self::boolLike($brief, ['has_logo', 'tem_logo', 'possui_logo']);
        $hasBrandManual = self::boolLike($brief, ['has_brand_manual', 'tem_identidade_visual', 'possui_manual_marca']);
        $hasContent = self::boolLike($brief, ['has_content', 'possui_textos_imagens']);

        $logoDescription = self::pick($brief, ['logo_description', 'descricao_logo'], 'Nao informado');
        $logoFiles = array_values(array_filter($uploadedFiles, static fn($path) => self::inferAssetType($path) === 'logo'));
        $manualFiles = array_values(array_filter($uploadedFiles, static fn($path) => self::inferAssetType($path) === 'manual'));
        $contentFiles = array_values(array_filter($uploadedFiles, static fn($path) => self::inferAssetType($path) === 'conteudo'));

        $bundle = [
            'task' => 'personalizar_templates_site',
            'version' => '2.0',
            'generated_at' => date('c'),
            'client' => [
                'nome' => self::pick($brief, ['legal_name', 'nome_cliente'], 'Cliente'),
                'domain_target' => self::pick($brief, ['domain_target', 'dominio_desejado']),
            ],
            'identity' => [
                'possui_logo' => $hasLogo,
                'logo_files' => $logoFiles,
                'logo_descricao' => $hasLogo ? null : $logoDescription,
                'possui_manual_marca' => $hasBrandManual,
                'manual_files' => $manualFiles,
                'paleta_cores' => self::pick($brief, ['color_palette', 'paleta_cores'], 'Nao informado'),
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
                'cta_principal' => self::pick($brief, ['cta_text', 'cta_principal'], 'Fale conosco'),
                'sites_referencia' => self::listFromText(self::pick($brief, ['references', 'sites_referencia'])),
                'objetivos_secundarios' => self::listFromText(self::pick($brief, ['secondary_goals', 'objetivos_secundarios'])),
            ],
            'content' => [
                'status_conteudo' => $hasContent ? 'informado' : 'placeholder',
                'conteudo_files' => $contentFiles,
                'integracoes_desejadas' => self::listFromText(self::pick($brief, ['integrations', 'integracoes_desejadas'])),
                'paginas_necessarias' => self::listFromText(self::pick($brief, ['pages_needed', 'paginas_necessarias'])),
                'conteudo_legal' => self::pick($brief, ['legal_content', 'conteudo_legal'], 'nao informado'),
                'requisitos_tecnicos' => self::pick($brief, ['extra_requirements', 'requisitos_tecnicos_extras'], 'nao informado'),
            ],
            'assets' => [
                'uploaded_files' => $uploadedFiles,
            ],
            'conditions' => [
                'sem_logo' => $hasLogo ? 'nao' : 'gerar logo_placeholder.svg com base na descricao',
                'sem_manual_marca' => $hasBrandManual ? 'nao' : 'usar paleta/estilo informados',
                'sem_conteudo' => $hasContent ? 'nao' : 'gerar placeholders por tipo de negocio',
            ],
            'variantInstructions' => [
                'V1' => [
                    'folder' => 'modelo_v1',
                    'specificInstructions' => [
                        'Manter formato de pagina unica.',
                        'Nao incluir formulario de contato.',
                        'Nao incluir botao WhatsApp.',
                        'Nao incluir chatbot.',
                    ],
                ],
                'V2' => [
                    'folder' => 'modelo_v2',
                    'specificInstructions' => [
                        'Manter 3 paginas: index.html, sobre.html e contato.html.',
                        'Incluir formulario funcional em contato.html.',
                        'Incluir botao WhatsApp em todas as paginas.',
                        'Nao incluir chatbot.',
                    ],
                ],
                'V3' => [
                    'folder' => 'modelo_v3',
                    'specificInstructions' => [
                        'Manter 3 paginas (ou expandir quando necessario).',
                        'Incluir formulario funcional.',
                        'Incluir botao WhatsApp.',
                        'Incluir chatbot Kodassauro integrado ao tema.',
                    ],
                ],
            ],
            'qualityRequirements' => [
                'Manter responsividade em mobile, tablet e desktop.',
                'Preservar estrutura base dos templates.',
                'Garantir links, ancoras e navegacao funcionando.',
                'Personalizar metatags basicas de SEO.',
            ],
        ];

        $text = 'Personalize os templates V1/V2/V3 com base no briefing condicional. '
            . 'Aplique identidade visual, tom de voz, objetivos e integracoes mantendo estrutura original. '
            . 'Use os assets disponiveis e gere placeholders quando faltarem informacoes.';

        return [
            'json' => $bundle,
            'text' => $text,
            'markdown' => self::buildMarkdown($bundle),
            'variantInstructions' => $bundle['variantInstructions'],
        ];
    }
}
