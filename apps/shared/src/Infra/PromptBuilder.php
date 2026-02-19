<?php
declare(strict_types=1);

namespace Shared\Infra;

final class PromptBuilder {
    public static function build(array $brief): array {
        $bundle = [
            'type' => 'site_institucional_1_pagina',
            'brand' => [
                'nome' => $brief['legal_name'] ?? '',
                'dominio' => $brief['domain_target'] ?? '',
                'cores' => $brief['color_palette'] ?? '',
                'tom' => $brief['tone_of_voice'] ?? 'profissional',
            ],
            'conteudo' => [
                'objetivo' => $brief['objective'] ?? '',
                'publico' => $brief['audience'] ?? '',
                'diferenciais' => $brief['differentials'] ?? '',
                'servicos' => $brief['services'] ?? '',
                'cta' => $brief['cta_text'] ?? 'Fale conosco',
                'integracoes' => $brief['integrations'] ?? '',
                'legal' => $brief['legal_content'] ?? '',
                'referencias' => $brief['references'] ?? '',
                'extras' => $brief['extra_requirements'] ?? '',
            ],
            'assets' => [
                'tem_logo' => $brief['tem_logo'] ?? ($brief['has_logo'] ?? ''),
                'tem_identidade_visual' => $brief['tem_identidade_visual'] ?? ($brief['has_brand_manual'] ?? ''),
                'has_content' => $brief['has_content'] ?? '',
                'arquivos_enviados' => $brief['uploaded_files'] ?? [],
            ],
            'sections' => ['Hero', 'Sobre', 'Serviços', 'Diferenciais', 'Contato', 'FAQ', 'Rodapé'],
            'seo' => ['title', 'description', 'keywords', 'schema_org_localbusiness']
        ];

        $prompt = "Crie um site institucional de 1 página, pronto para produção, com HTML/CSS/JS sem frameworks pesados. " .
            "Use identidade da marca e foco em conversão. \n" .
            "Dados estruturados: " . json_encode($bundle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);

        return ['json' => $bundle, 'text' => $prompt];
    }
}
