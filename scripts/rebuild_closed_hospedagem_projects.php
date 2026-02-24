#!/usr/bin/env php
<?php
declare(strict_types=1);

use Shared\Infra\PromptBuilder;

require_once __DIR__ . '/../apps/shared/src/bootstrap.php';

const CLIENT_ROOT = '/home/server/projects/clientes';
const CLIENT_ROOT_EXPECTED = '/home/server/projects/clientes';

function slugifyText(string $value): string {
    $value = trim($value);
    if ($value === '') return 'cliente';
    $raw = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if (is_string($raw) && $raw !== '') {
        $value = $raw;
    }
    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: 'cliente';
    $value = trim((string)$value, '-');
    return $value !== '' ? $value : 'cliente';
}

function buildOrgSlug(string $legalName, string $orgId): string {
    $prefix = slugifyText($legalName);
    $suffix = substr(str_replace('-', '', strtolower($orgId)), 0, 8);
    if ($suffix === '') $suffix = '00000000';
    return $prefix . '-' . $suffix;
}

function ensureDir(string $dir): void {
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
}

function writeAtomic(string $file, string $content): void {
    ensureDir(dirname($file));
    $tmp = $file . '.tmp_' . bin2hex(random_bytes(5));
    file_put_contents($tmp, $content);
    rename($tmp, $file);
}

function removeTree(string $path): void {
    if (is_link($path) || is_file($path)) {
        @unlink($path);
        return;
    }
    if (!is_dir($path)) {
        return;
    }
    $entries = scandir($path);
    if (!is_array($entries)) return;
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        removeTree($path . '/' . $entry);
    }
    @rmdir($path);
}

function listChildDirs(string $root): array {
    $items = [];
    if (!is_dir($root)) return $items;
    $entries = scandir($root);
    if (!is_array($entries)) return $items;
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $full = $root . '/' . $entry;
        if (is_dir($full)) {
            $items[] = $entry;
        }
    }
    sort($items);
    return $items;
}

function wipeClientRoot(string $root): array {
    $removed = [];
    $entries = scandir($root);
    if (!is_array($entries)) {
        return $removed;
    }
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        $full = $root . '/' . $entry;
        $removed[] = $entry;
        removeTree($full);
    }
    sort($removed);
    return $removed;
}

function copyDir(string $sourceDir, string $targetDir): void {
    if (!is_dir($sourceDir)) {
        throw new RuntimeException('Template source inexistente: ' . $sourceDir);
    }
    ensureDir($targetDir);
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($sourceDir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST,
    );
    foreach ($it as $item) {
        $sourcePath = (string)$item->getPathname();
        $relative = substr($sourcePath, strlen(rtrim($sourceDir, '/')) + 1);
        if ($relative === false) continue;
        $targetPath = rtrim($targetDir, '/') . '/' . str_replace('\\', '/', $relative);
        if ($item->isDir()) {
            ensureDir($targetPath);
            continue;
        }
        ensureDir(dirname($targetPath));
        if (!@copy($sourcePath, $targetPath)) {
            throw new RuntimeException('Falha ao copiar arquivo de template: ' . $sourcePath);
        }
    }
}

function applyPermissions(string $root): void {
    if (!is_dir($root)) return;
    @chmod($root, 02777);
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::SELF_FIRST,
    );
    foreach ($it as $item) {
        $path = (string)$item->getPathname();
        if ($item->isDir()) {
            @chmod($path, 02777);
        } else {
            @chmod($path, 0666);
        }
    }

    $setfacl = trim((string)shell_exec('command -v setfacl 2>/dev/null'));
    if ($setfacl !== '') {
        $target = escapeshellarg($root);
        @shell_exec("setfacl -R -m u::rwx,g::rwx,o::rwx {$target} 2>/dev/null");
        @shell_exec("setfacl -R -d -m u::rwx,g::rwx,o::rwx {$target} 2>/dev/null");
    }
}

function clampInt(int $value, int $min, int $max): int {
    return max($min, min($max, $value));
}

function hslToHex(int $h, int $s, int $l): string {
    $h = ($h % 360 + 360) % 360;
    $s = clampInt($s, 0, 100) / 100;
    $l = clampInt($l, 0, 100) / 100;

    $c = (1 - abs(2 * $l - 1)) * $s;
    $x = $c * (1 - abs(fmod($h / 60, 2) - 1));
    $m = $l - $c / 2;

    $r = 0.0; $g = 0.0; $b = 0.0;
    if ($h < 60) { $r = $c; $g = $x; $b = 0; }
    elseif ($h < 120) { $r = $x; $g = $c; $b = 0; }
    elseif ($h < 180) { $r = 0; $g = $c; $b = $x; }
    elseif ($h < 240) { $r = 0; $g = $x; $b = $c; }
    elseif ($h < 300) { $r = $x; $g = 0; $b = $c; }
    else { $r = $c; $g = 0; $b = $x; }

    $toHex = static fn(float $v): string => str_pad(dechex((int)round(($v + $m) * 255)), 2, '0', STR_PAD_LEFT);
    return '#' . strtoupper($toHex($r) . $toHex($g) . $toHex($b));
}

function pickManyUnique(array $list, int $seed, int $count): array {
    $total = count($list);
    if ($total === 0 || $count <= 0) return [];
    if ($count >= $total) return $list;

    $picked = [];
    $used = [];
    $cursor = $seed % $total;
    $step = ($seed % ($total - 1)) + 1;
    if ($step % 2 === 0) $step += 1;

    for ($i = 0; $i < $total * 3 && count($picked) < $count; $i++) {
        $idx = $cursor % $total;
        if (!isset($used[$idx])) {
            $picked[] = $list[$idx];
            $used[$idx] = true;
        }
        $cursor += $step;
    }
    return $picked;
}

function buildDynamicPalette(int $seed): string {
    $h1 = $seed % 360;
    $h2 = ($h1 + 95 + (($seed >> 8) % 140)) % 360;
    $h3 = ($h1 + 6 + (($seed >> 14) % 18)) % 360;
    $h4 = ($h1 + 185 + (($seed >> 20) % 120)) % 360;

    $s1 = 52 + (($seed >> 5) % 20);
    $l1 = 12 + (($seed >> 11) % 12);

    $s2 = 72 + (($seed >> 3) % 24);
    $l2 = 48 + (($seed >> 9) % 14);

    $s3 = 24 + (($seed >> 15) % 20);
    $l3 = 94 + (($seed >> 21) % 5);

    $s4 = 22 + (($seed >> 19) % 20);
    $l4 = 16 + (($seed >> 25) % 12);

    $primary = hslToHex($h1, $s1, $l1);
    $accent = hslToHex($h2, $s2, $l2);
    $bg = hslToHex($h3, $s3, $l3);
    $text = hslToHex($h4, $s4, $l4);

    return implode(', ', [$primary, $accent, $bg, $text]);
}

function buildPreviewUrl(string $orgSlug, string $releaseLabel, string $variant, string $entryFile = 'index.html'): string {
    $base = rtrim((string)(getenv('CRM_PUBLIC_BASE_URL') ?: 'https://koddacrm.koddahub.com.br'), '/');
    $query = http_build_query([
        'release' => $releaseLabel,
        'variant' => strtolower($variant),
        'entry' => ltrim($entryFile, '/'),
    ]);
    return $base . '/' . rawurlencode($orgSlug) . '/previewv1?' . $query;
}

function firstColor(string $palette): string {
    if (preg_match('/#([0-9a-fA-F]{6})/', $palette, $m)) {
        return '#' . strtoupper($m[1]);
    }
    return '#0A1A2F';
}

function writeGeneratedLogo(string $clientRoot, string $name, string $palette): array {
    $logoDir = $clientRoot . '/assets/logo';
    ensureDir($logoDir);
    $primary = firstColor($palette);
    $safeName = strtoupper(substr(preg_replace('/[^A-Za-z0-9]+/', '', $name) ?: 'CLIENTE', 0, 14));

    $svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="144" viewBox="0 0 512 144" role="img" aria-label="Logo {$safeName}">
  <rect width="512" height="144" rx="24" fill="{$primary}"/>
  <circle cx="72" cy="72" r="38" fill="#FFFFFF" opacity="0.18"/>
  <text x="136" y="66" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF">{$safeName}</text>
  <text x="136" y="95" font-family="Inter, Arial, sans-serif" font-size="18" fill="#E2E8F0">Identidade visual temporaria</text>
</svg>
SVG;

    $svgPath = $logoDir . '/logo.svg';
    $pngPath = $logoDir . '/logo-web.png';
    $faviconPath = $logoDir . '/favicon.ico';

    writeAtomic($svgPath, $svg);
    writeAtomic($pngPath, 'PNG_PLACEHOLDER_GENERATED');
    writeAtomic($faviconPath, 'ICO_PLACEHOLDER_GENERATED');

    return [$svgPath, $pngPath, $faviconPath];
}

function generateBriefProfile(string $orgId, string $orgName, string $email, int $seq): array {
    $sectors = [
        'Clinica de psicologia e desenvolvimento humano',
        'Escritorio de arquitetura residencial',
        'Consultoria financeira para pequenas empresas',
        'Agencia de marketing para negocios locais',
        'Studio de design e branding',
        'Escola de idiomas com foco em conversacao',
        'Clinica odontologica premium',
        'Assessoria juridica empresarial',
        'Empresa de energia solar residencial',
        'Academia boutique de treinamento funcional',
        'Consultoria de tecnologia para varejo',
        'Atelier de fotografia corporativa',
        'Produtora audiovisual para empresas e eventos',
        'Escola de reforco escolar personalizada',
        'Loja especializada em moveis planejados',
        'Consultoria em RH e recrutamento estrategico',
        'Empresa de automacao residencial inteligente',
        'Clinica de fisioterapia e reabilitacao esportiva',
        'Agencia de viagens sob medida',
        'Studio de arquitetura de interiores',
    ];

    $audiences = [
        'Empreendedores e gestores que precisam aumentar conversao comercial',
        'Familias e profissionais que valorizam atendimento premium e confiavel',
        'Tomadores de decisao que buscam parceiros tecnicos com entrega rapida',
        'Clientes locais com intencao de compra e necessidade imediata de atendimento',
        'Publico digital que compara opcoes antes de contratar o servico',
        'Pessoas buscando solucao especializada com suporte humano proximo',
        'Empresas que precisam escalar vendas com previsibilidade',
        'Consumidores exigentes que priorizam qualidade, confianca e suporte',
        'Liderancas que buscam parceiro tecnico de longo prazo',
    ];

    $tones = [
        'profissional_formal',
        'profissional_informal',
        'tecnico_especializado',
        'amigavel_acolhedor',
        'simples_direto',
        'inspirador_motivacional',
        'luxuoso_exclusivo',
        'criativo_inovador',
    ];

    $styles = [
        'moderno_clean',
        'classico_elegante',
        'minimalista',
        'tecnologico_futurista',
        'corporativo_tradicional',
        'criativo_artistico',
        'orgânico_natural',
        'luxuoso_exclusivo',
    ];

    $ctas = [
        'Solicitar diagnostico',
        'Fale com especialista',
        'Agendar reuniao',
        'Receber proposta personalizada',
        'Iniciar atendimento agora',
        'Quero uma consultoria',
        'Solicitar analise gratuita',
        'Quero acelerar meu projeto',
        'Falar com um consultor agora',
    ];

    $refs = [
        'https://koddahub.com.br',
        'https://stripe.com',
        'https://webflow.com',
        'https://slack.com',
        'https://notion.so',
        'https://airbnb.com',
        'https://linear.app',
        'https://www.framer.com',
        'https://asana.com',
        'https://www.behance.net',
        'https://www.notion.com/product/sites',
    ];

    $goalFocus = [
        'captar leads qualificados com alto potencial de fechamento',
        'aumentar vendas recorrentes com processo comercial previsivel',
        'gerar agendamentos semanais para equipe de atendimento',
        'fortalecer autoridade digital para fechar contratos de maior ticket',
        'converter visitantes em oportunidades reais de negocio',
        'reduzir ciclo de venda com comunicacao clara e prova social forte',
    ];

    $serviceStacks = [
        ['Diagnostico estrategico', 'Plano de acao personalizado', 'Acompanhamento de performance'],
        ['Consultoria especializada', 'Implantacao ponta a ponta', 'Suporte continuo'],
        ['Mapeamento de oportunidades', 'Execucao orientada a resultados', 'Revisoes mensais com metas'],
        ['Planejamento e posicionamento', 'Desenvolvimento da solucao', 'Operacao assistida'],
    ];

    $differentialStacks = [
        ['Atendimento consultivo com responsavel dedicado', 'Processo estruturado com prazos claros', 'Foco em conversao e experiencia do cliente'],
        ['Especializacao no nicho com abordagem pratica', 'Comunicacao transparente durante todo o projeto', 'Entrega com padrao tecnico e visual elevado'],
        ['Visao estrategica + execucao agil', 'Indicadores claros de desempenho', 'Apoio proximo na tomada de decisao'],
        ['Metodo proprietario de implementacao', 'Priorizacao orientada a impacto', 'Melhoria continua com base em dados'],
    ];

    $integrationPool = [
        'Google Maps',
        'Instagram',
        'Google Analytics',
        'Formulario de contato',
        'WhatsApp',
        'Meta Pixel',
        'YouTube',
        'Calendly',
        'Newsletter',
        'Chat online',
    ];

    $h = hexdec(substr(hash('sha256', $orgId . '|' . $seq), 0, 8));
    $pick = static fn(array $list, int $offset = 0) => $list[(($h + ($offset * 131)) % count($list))];

    $sector = $pick($sectors);
    $audience = $pick($audiences, 1);
    $tone = $pick($tones, 2);
    $style = $pick($styles, 3);
    $palette = buildDynamicPalette($h + ($seq * 911));
    $cta = $pick($ctas, 4);
    $mainGoal = $pick($goalFocus, 5);

    $services = $serviceStacks[(($h + 7) % count($serviceStacks))];
    $differentials = $differentialStacks[(($h + 11) % count($differentialStacks))];

    $integrations = implode(', ', pickManyUnique($integrationPool, $h + 17, 5));
    $references = implode("\n", pickManyUnique($refs, $h + 23, 3));
    $secondaryGoals = implode("\n", pickManyUnique([
        'Fortalecer credibilidade em buscas locais',
        'Diferenciar claramente a proposta de valor frente a concorrentes',
        'Aumentar o volume de contatos qualificados em canais digitais',
        'Reforcar prova social e reduzir objecoes comerciais',
        'Dar visibilidade para servicos de maior margem',
        'Criar narrativa de marca consistente em todas as paginas',
    ], $h + 31, 3));

    $domainSlug = slugifyText($orgName !== '' ? $orgName : ('cliente-' . ($seq + 1)));
    $domain = $domainSlug . '.com.br';

    $legal = 'Cumprir LGPD, informar canais oficiais de atendimento e incluir politica de privacidade no rodape.';
    $extra = implode("\n", [
        'Layout premium responsivo com boa performance em mobile e desktop',
        'SEO local basico com metatags, headings e dados estruturados bem definidos',
        'Acessibilidade minima com foco visivel, labels corretas e contraste AA',
        'Microinteracoes sutis para reforcar percepcao de qualidade',
        'Conteudo orientado a conversao e sem copy generica',
    ]);

    return [
        'legal_name' => $orgName !== '' ? $orgName : 'Cliente Fechado ' . ($seq + 1),
        'business_type' => $sector,
        'objective' => 'Em 90 dias: ' . $mainGoal,
        'audience' => $audience,
        'differentials' => implode("\n", $differentials),
        'services' => implode("\n", $services),
        'cta_text' => $cta,
        'tone_of_voice' => $tone,
        'style_vibe' => $style,
        'secondary_goals' => $secondaryGoals,
        'color_palette' => $palette,
        'visual_references' => $references,
        'legal_content' => $legal,
        'integrations' => $integrations,
        'domain_target' => $domain,
        'extra_requirements' => $extra,
        'organization_slug' => buildOrgSlug($orgName, $orgId),
        'has_logo' => (($h % 2) === 0) ? 'sim' : 'nao',
        'has_brand_manual' => (($h % 3) !== 0) ? 'sim' : 'nao',
        'has_content' => 'sim',
        'logo_description' => 'Logo profissional com simbolo autoral ligada ao nicho e tom do briefing.',
        'billing_email' => $email,
    ];
}

function fetchClosedHospedagemTargets(): array {
    return db()->all(
        "SELECT DISTINCT ON (d.organization_id)
            d.id::text AS deal_id,
            d.organization_id::text AS organization_id,
            COALESCE(o.legal_name, '') AS legal_name,
            COALESCE(o.billing_email, '') AS billing_email
         FROM crm.deal d
         JOIN client.organizations o ON o.id = d.organization_id
         WHERE d.deal_type='HOSPEDAGEM'
           AND d.lifecycle_status='CLIENT'
           AND d.organization_id IS NOT NULL
         ORDER BY d.organization_id, d.updated_at DESC"
    );
}

function upsertBriefAndPrompt(array $target, array $brief, array $prompt): array {
    $pdo = db()->pdo();
    $pdo->beginTransaction();
    try {
        $latestBrief = db()->one(
            "SELECT id::text AS id FROM client.project_briefs WHERE organization_id=CAST(:oid AS uuid) ORDER BY created_at DESC LIMIT 1",
            [':oid' => $target['organization_id']],
        );

        if ($latestBrief) {
            $briefId = (string)$latestBrief['id'];
            db()->exec(
                "UPDATE client.project_briefs
                 SET objective=:objective,
                     audience=:audience,
                     differentials=:differentials,
                     services=:services,
                     cta_text=:cta_text,
                     tone_of_voice=:tone,
                     color_palette=:palette,
                     visual_references=:refs,
                     legal_content=:legal,
                     integrations=:integrations,
                     domain_target=:domain,
                     extra_requirements=:extra,
                     status='SUBMITTED'
                 WHERE id=CAST(:id AS uuid)",
                [
                    ':id' => $briefId,
                    ':objective' => $brief['objective'],
                    ':audience' => $brief['audience'],
                    ':differentials' => $brief['differentials'],
                    ':services' => $brief['services'],
                    ':cta_text' => $brief['cta_text'],
                    ':tone' => $brief['tone_of_voice'],
                    ':palette' => $brief['color_palette'],
                    ':refs' => $brief['visual_references'],
                    ':legal' => $brief['legal_content'],
                    ':integrations' => $brief['integrations'],
                    ':domain' => $brief['domain_target'],
                    ':extra' => $brief['extra_requirements'],
                ],
            );
        } else {
            $row = db()->one(
                "INSERT INTO client.project_briefs(
                    organization_id, objective, audience, differentials, services,
                    cta_text, tone_of_voice, color_palette, visual_references,
                    legal_content, integrations, domain_target, extra_requirements, status
                 ) VALUES(
                    CAST(:organization_id AS uuid), :objective, :audience, :differentials, :services,
                    :cta_text, :tone, :palette, :refs,
                    :legal, :integrations, :domain, :extra, 'SUBMITTED'
                 ) RETURNING id::text AS id",
                [
                    ':organization_id' => $target['organization_id'],
                    ':objective' => $brief['objective'],
                    ':audience' => $brief['audience'],
                    ':differentials' => $brief['differentials'],
                    ':services' => $brief['services'],
                    ':cta_text' => $brief['cta_text'],
                    ':tone' => $brief['tone_of_voice'],
                    ':palette' => $brief['color_palette'],
                    ':refs' => $brief['visual_references'],
                    ':legal' => $brief['legal_content'],
                    ':integrations' => $brief['integrations'],
                    ':domain' => $brief['domain_target'],
                    ':extra' => $brief['extra_requirements'],
                ],
            );
            $briefId = (string)($row['id'] ?? '');
        }

        if ($briefId === '') {
            throw new RuntimeException('Falha ao resolver brief_id');
        }

        db()->exec("DELETE FROM client.ai_prompts WHERE brief_id=CAST(:bid AS uuid)", [':bid' => $briefId]);
        db()->exec(
            "INSERT INTO client.ai_prompts(brief_id, prompt_json, prompt_text, version)
             VALUES(CAST(:brief_id AS uuid), :prompt_json::jsonb, :prompt_text, 2)",
            [
                ':brief_id' => $briefId,
                ':prompt_json' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
                ':prompt_text' => (string)($prompt['text'] ?? 'Executar Prompt Pai + variante.'),
            ],
        );

        $pdo->commit();
        return ['brief_id' => $briefId];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function recreateReleaseRows(array $target, string $orgSlug, string $clientRoot, array $variantMap): array {
    $pdo = db()->pdo();
    $pdo->beginTransaction();
    try {
        db()->exec("DELETE FROM crm.deal_site_variant WHERE release_id IN (SELECT id FROM crm.deal_site_release WHERE deal_id=CAST(:deal_id AS uuid))", [':deal_id' => $target['deal_id']]);
        db()->exec("DELETE FROM crm.deal_prompt_asset WHERE release_id IN (SELECT id FROM crm.deal_site_release WHERE deal_id=CAST(:deal_id AS uuid))", [':deal_id' => $target['deal_id']]);
        db()->exec("DELETE FROM crm.deal_site_release WHERE deal_id=CAST(:deal_id AS uuid)", [':deal_id' => $target['deal_id']]);

        $releaseRoot = $clientRoot . '/releases/v1';
        $assetsPath = $clientRoot . '/assets';
        $promptMdPath = $clientRoot . '/prompt_personalizacao.md';
        $promptJsonPath = $clientRoot . '/prompt_personalizacao.json';

        $release = db()->one(
            "INSERT INTO crm.deal_site_release(
                deal_id, version, status, project_root, assets_path, prompt_md_path, prompt_json_path, created_by, created_at, updated_at
             ) VALUES(
                CAST(:deal_id AS uuid), 1, 'DRAFT', :project_root, :assets_path, :prompt_md_path, :prompt_json_path, 'SYSTEM', now(), now()
             ) RETURNING id::text AS id, version",
            [
                ':deal_id' => $target['deal_id'],
                ':project_root' => $releaseRoot,
                ':assets_path' => $assetsPath,
                ':prompt_md_path' => $promptMdPath,
                ':prompt_json_path' => $promptJsonPath,
            ],
        );

        $releaseId = (string)($release['id'] ?? '');
        if ($releaseId === '') {
            throw new RuntimeException('Falha ao inserir release');
        }

        $releaseLabel = 'v1';
        foreach ($variantMap as $variantCode => $meta) {
            db()->exec(
                "INSERT INTO crm.deal_site_variant(
                    release_id, variant_code, folder_path, entry_file, preview_url, status, created_at, updated_at
                 ) VALUES(
                    CAST(:release_id AS uuid), :variant_code, :folder_path, :entry_file, :preview_url, 'BASE_PREPARED', now(), now()
                 )",
                [
                    ':release_id' => $releaseId,
                    ':variant_code' => $variantCode,
                    ':folder_path' => $meta['folder_path'],
                    ':entry_file' => $meta['entry_file'],
                    ':preview_url' => buildPreviewUrl($orgSlug, $releaseLabel, strtolower($variantCode), $meta['entry_file']),
                ],
            );
        }

        $maxRev = db()->one("SELECT COALESCE(MAX(version),0) AS version FROM crm.deal_prompt_revision WHERE deal_id=CAST(:deal_id AS uuid)", [':deal_id' => $target['deal_id']]);
        $nextRev = ((int)($maxRev['version'] ?? 0)) + 1;

        $promptJsonText = (string)@file_get_contents($promptJsonPath);
        $promptMarkdown = (string)@file_get_contents($promptMdPath);

        db()->exec(
            "INSERT INTO crm.deal_prompt_revision(deal_id, version, prompt_text, prompt_json, status, created_by, created_at, updated_at)
             VALUES(CAST(:deal_id AS uuid), :version, :prompt_text, :prompt_json::jsonb, 'DRAFT', 'SYSTEM', now(), now())",
            [
                ':deal_id' => $target['deal_id'],
                ':version' => $nextRev,
                ':prompt_text' => $promptMarkdown,
                ':prompt_json' => $promptJsonText !== '' ? $promptJsonText : '{}',
            ],
        );

        db()->exec(
            "INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
             VALUES(CAST(:deal_id AS uuid), 'PREPROMPT_REBUILD_CLOSED_HOSPEDAGEM', :content, :metadata::jsonb, 'SYSTEM')",
            [
                ':deal_id' => $target['deal_id'],
                ':content' => 'Rebuild completo da pasta do cliente com base em CLIENT/HOSPEDAGEM.',
                ':metadata' => json_encode([
                    'organization_id' => $target['organization_id'],
                    'organization_slug' => $orgSlug,
                    'client_root' => $clientRoot,
                    'release_id' => $releaseId,
                    'release_label' => $releaseLabel,
                ], JSON_UNESCAPED_UNICODE),
            ],
        );

        $pdo->commit();
        return [
            'release_id' => $releaseId,
            'release_label' => $releaseLabel,
            'release_version' => 1,
            'prompt_revision_version' => $nextRev,
        ];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        throw $e;
    }
}

function writeClientFiles(string $clientRoot, array $prompt, array $variantMap, string $organizationId, string $orgSlug, string $releaseId): array {
    $promptJson = is_array($prompt['json'] ?? null) ? $prompt['json'] : [];
    $promptMarkdown = trim((string)($prompt['markdown'] ?? ($prompt['text'] ?? '# Prompt de personalizacao')));
    $variantPrompts = is_array($promptJson['variant_prompts'] ?? null) ? $promptJson['variant_prompts'] : [];

    $files = [
        $clientRoot . '/prompt_pai_orquestrador.md' => (string)($prompt['master_prompt_markdown'] ?? ($promptJson['master_prompt_markdown'] ?? '# Prompt Pai')),
        $clientRoot . '/prompt_personalizacao.md' => $promptMarkdown,
        $clientRoot . '/prompt_personalizacao.json' => json_encode($promptJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        $clientRoot . '/prompt_v1_draft.md' => trim((string)($variantPrompts['V1'] ?? $promptMarkdown)),
        $clientRoot . '/prompt_v2_draft.md' => trim((string)($variantPrompts['V2'] ?? $promptMarkdown)),
        $clientRoot . '/prompt_v3_draft.md' => trim((string)($variantPrompts['V3'] ?? $promptMarkdown)),
        $clientRoot . '/identidade_visual.md' => (string)($promptJson['identity_markdown'] ?? '# Identidade Visual - Site24h'),
        $clientRoot . '/prompt_drafts.json' => json_encode([
            'savedAt' => date('c'),
            'variants' => [
                'V1' => $clientRoot . '/prompt_v1_draft.md',
                'V2' => $clientRoot . '/prompt_v2_draft.md',
                'V3' => $clientRoot . '/prompt_v3_draft.md',
            ],
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
    ];

    foreach ($files as $file => $content) {
        writeAtomic($file, $content);
    }

    $assetsManifestPath = $clientRoot . '/assets/assets_manifest.json';
    $allowedSources = (array)($promptJson['assets_manifest_schema']['allowed_sources'] ?? []);
    $allowedSources = array_values(array_filter(array_map(static fn($v) => trim((string)$v), $allowedSources)));

    $assets = [];
    $assetRoot = $clientRoot . '/assets';
    if (is_dir($assetRoot)) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($assetRoot, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::LEAVES_ONLY,
        );
        foreach ($it as $item) {
            if ($item->isDir()) continue;
            $full = (string)$item->getPathname();
            $rel = str_replace(rtrim($clientRoot, '/') . '/', '', $full);
            $assets[] = [
                'category' => str_contains(strtolower($rel), 'logo') ? 'logo' : 'outro',
                'local_path' => $full,
                'source_url' => null,
                'license' => 'local_upload_or_generated',
                'attribution_required' => false,
                'downloaded_at' => date('c'),
            ];
        }
    }

    writeAtomic($assetsManifestPath, json_encode([
        'version' => '1.0',
        'generatedAt' => date('c'),
        'organizationId' => $organizationId,
        'organizationSlug' => $orgSlug,
        'releaseId' => $releaseId,
        'releaseLabel' => 'v1',
        'allowed_sources' => $allowedSources,
        'assets' => $assets,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    $releaseManifestPath = $clientRoot . '/release_manifest.json';
    writeAtomic($releaseManifestPath, json_encode([
        'organizationId' => $organizationId,
        'organizationSlug' => $orgSlug,
        'releaseId' => $releaseId,
        'releaseLabel' => 'v1',
        'generatedAt' => date('c'),
        'variants' => $variantMap,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return [
        'assets_manifest_path' => $assetsManifestPath,
        'release_manifest_path' => $releaseManifestPath,
        'required_files' => array_keys($files),
    ];
}

function ensureTemplates(string $releaseRoot, string $libraryRoot): array {
    $variants = [
        'V1' => ['folder' => 'modelo_v1', 'template' => 'template_v1_institucional_1pagina', 'entry' => 'index.html'],
        'V2' => ['folder' => 'modelo_v2', 'template' => 'template_v2_institucional_3paginas', 'entry' => 'index.html'],
        'V3' => ['folder' => 'modelo_v3', 'template' => 'template_v3_institucional_chatbot', 'entry' => 'index.html'],
    ];

    $map = [];
    foreach ($variants as $code => $cfg) {
        $source = rtrim($libraryRoot, '/') . '/' . $cfg['template'];
        $target = $releaseRoot . '/' . $cfg['folder'];
        copyDir($source, $target);
        $map[$code] = [
            'folder_path' => $target,
            'entry_file' => $cfg['entry'],
            'variant_code' => $code,
        ];
    }
    return $map;
}

function validateClientStructure(string $clientRoot): array {
    $missing = [];
    $requiredFiles = [
        'prompt_pai_orquestrador.md',
        'prompt_v1_draft.md',
        'prompt_v2_draft.md',
        'prompt_v3_draft.md',
        'prompt_personalizacao.md',
        'prompt_personalizacao.json',
        'identidade_visual.md',
        'release_manifest.json',
        'assets/assets_manifest.json',
    ];
    foreach ($requiredFiles as $file) {
        if (!is_file($clientRoot . '/' . $file)) {
            $missing[] = $file;
        }
    }

    $requiredDirs = [
        'releases/v1/modelo_v1',
        'releases/v1/modelo_v2',
        'releases/v1/modelo_v3',
    ];
    foreach ($requiredDirs as $dir) {
        if (!is_dir($clientRoot . '/' . $dir)) {
            $missing[] = $dir;
        }
    }
    return $missing;
}

function main(): int {
    $root = realpath(CLIENT_ROOT) ?: CLIENT_ROOT;
    if ($root !== CLIENT_ROOT_EXPECTED) {
        throw new RuntimeException('Root inválido: ' . $root);
    }

    ensureDir($root);

    $targets = fetchClosedHospedagemTargets();
    if (count($targets) === 0) {
        throw new RuntimeException('Nenhum cliente fechado de hospedagem encontrado.');
    }

    $beforeDirs = listChildDirs($root);
    $removedDirs = wipeClientRoot($root);
    ensureDir($root);

    $libraryRoot = (string)(getenv('SITE24H_TEMPLATE_LIBRARY_ROOT') ?: '/home/server/projects/projero-area-cliente/storage/site-models');
    if (!is_dir($libraryRoot)) {
        throw new RuntimeException('Biblioteca de templates não encontrada: ' . $libraryRoot);
    }

    $processed = 0;
    $failed = 0;
    $items = [];
    $errors = [];
    $expectedSlugs = [];
    $paletteSet = [];

    foreach ($targets as $idx => $target) {
        $orgId = (string)$target['organization_id'];
        $legalName = trim((string)$target['legal_name']);
        $billingEmail = trim((string)$target['billing_email']);
        $dealId = (string)$target['deal_id'];
        $slug = buildOrgSlug($legalName, $orgId);
        $expectedSlugs[] = $slug;

        $clientRoot = $root . '/' . $slug;
        $releaseRoot = $clientRoot . '/releases/v1';

        try {
            ensureDir($clientRoot);
            ensureDir($releaseRoot);
            ensureDir($clientRoot . '/assets');

            $brief = generateBriefProfile($orgId, $legalName, $billingEmail, $idx);
            $paletteSet[] = (string)$brief['color_palette'];

            $prompt = PromptBuilder::build($brief);
            if (is_array($prompt['json'])) {
                $prompt['json']['markdown'] = (string)($prompt['markdown'] ?? $prompt['text'] ?? '');
                $prompt['json']['variantInstructions'] = $prompt['variantInstructions'] ?? ($prompt['json']['variantInstructions'] ?? []);
            }

            $dbInfo = upsertBriefAndPrompt($target, $brief, $prompt);
            $variantMap = ensureTemplates($releaseRoot, $libraryRoot);
            $logoFiles = writeGeneratedLogo($clientRoot, $legalName !== '' ? $legalName : $slug, (string)$brief['color_palette']);
            $releaseInfo = recreateReleaseRows($target, $slug, $clientRoot, $variantMap);
            $fileInfo = writeClientFiles($clientRoot, $prompt, $variantMap, $orgId, $slug, $releaseInfo['release_id']);

            $missing = validateClientStructure($clientRoot);
            if (count($missing) > 0) {
                throw new RuntimeException('Estrutura incompleta: ' . implode(', ', $missing));
            }

            applyPermissions($clientRoot);

            $items[] = [
                'organization_id' => $orgId,
                'deal_id' => $dealId,
                'legal_name' => $legalName,
                'billing_email' => $billingEmail,
                'slug' => $slug,
                'client_root' => $clientRoot,
                'brief_id' => $dbInfo['brief_id'],
                'release_id' => $releaseInfo['release_id'],
                'release_label' => $releaseInfo['release_label'],
                'logo_files' => $logoFiles,
                'assets_manifest_path' => $fileInfo['assets_manifest_path'],
                'release_manifest_path' => $fileInfo['release_manifest_path'],
            ];

            $processed++;
            fwrite(STDOUT, "[OK] {$legalName} ({$billingEmail}) -> {$clientRoot} [v1]\n");
        } catch (Throwable $e) {
            $failed++;
            $errors[] = [
                'organization_id' => $orgId,
                'deal_id' => $dealId,
                'slug' => $slug,
                'message' => $e->getMessage(),
            ];
            fwrite(STDERR, "[ERRO] {$slug} {$e->getMessage()}\n");
        }
    }

    sort($expectedSlugs);
    $afterDirs = listChildDirs($root);

    $expectedSet = array_fill_keys($expectedSlugs, true);
    $afterSet = array_fill_keys($afterDirs, true);

    $extraAfter = [];
    foreach ($afterSet as $dir => $_) {
        if (!isset($expectedSet[$dir])) {
            $extraAfter[] = $dir;
        }
    }
    $missingAfter = [];
    foreach ($expectedSet as $dir => $_) {
        if (!isset($afterSet[$dir])) {
            $missingAfter[] = $dir;
        }
    }
    sort($extraAfter);
    sort($missingAfter);

    applyPermissions($root);

    $paletteUniqueCount = count(array_unique($paletteSet));

    $summary = [
        'targets_count' => count($targets),
        'before_dirs_count' => count($beforeDirs),
        'removed_dirs_count' => count($removedDirs),
        'after_dirs_count' => count($afterDirs),
        'processed' => $processed,
        'failed' => $failed,
        'extra_dirs_after' => $extraAfter,
        'missing_dirs_after' => $missingAfter,
        'palette_unique' => $paletteUniqueCount,
        'palette_total' => count($paletteSet),
    ];

    $report = [
        'generated_at' => date('c'),
        'root' => $root,
        'targets' => array_map(static function(array $r): array {
            return [
                'organization_id' => $r['organization_id'],
                'deal_id' => $r['deal_id'],
                'legal_name' => $r['legal_name'],
                'billing_email' => $r['billing_email'],
            ];
        }, $targets),
        'before_dirs' => $beforeDirs,
        'removed_dirs' => $removedDirs,
        'recreated_items' => $items,
        'errors' => $errors,
        'summary' => $summary,
    ];

    $reportPath = '/tmp/rebuild_closed_hospedagem_report_' . date('Ymd_His') . '.json';
    writeAtomic($reportPath, json_encode($report, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    fwrite(STDOUT, "\nResumo rebuild:\n");
    fwrite(STDOUT, '- Alvos: ' . count($targets) . "\n");
    fwrite(STDOUT, '- Processados: ' . $processed . "\n");
    fwrite(STDOUT, '- Falhas: ' . $failed . "\n");
    fwrite(STDOUT, '- Pastas antes: ' . count($beforeDirs) . "\n");
    fwrite(STDOUT, '- Pastas removidas: ' . count($removedDirs) . "\n");
    fwrite(STDOUT, '- Pastas depois: ' . count($afterDirs) . "\n");
    fwrite(STDOUT, '- Paletas únicas: ' . $paletteUniqueCount . '/' . count($paletteSet) . "\n");
    fwrite(STDOUT, '- Extras após rebuild: ' . count($extraAfter) . "\n");
    fwrite(STDOUT, '- Faltantes após rebuild: ' . count($missingAfter) . "\n");
    fwrite(STDOUT, '- Relatório: ' . $reportPath . "\n");

    if ($failed > 0 || count($extraAfter) > 0 || count($missingAfter) > 0) {
        return 2;
    }
    return 0;
}

try {
    exit(main());
} catch (Throwable $e) {
    fwrite(STDERR, '[FATAL] ' . $e->getMessage() . "\n");
    exit(1);
}
