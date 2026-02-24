#!/usr/bin/env php
<?php
declare(strict_types=1);

use Shared\Infra\PromptBuilder;

require_once __DIR__ . '/../apps/shared/src/bootstrap.php';

function slugifyText(string $value): string {
    $value = trim($value);
    if ($value === '') return 'cliente';
    $raw = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $value);
    if (is_string($raw) && $raw !== '') $value = $raw;
    $value = strtolower($value);
    $value = preg_replace('/[^a-z0-9]+/', '-', $value) ?: 'cliente';
    $value = trim($value, '-');
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
    $tmp = $file . '.tmp_' . bin2hex(random_bytes(6));
    file_put_contents($tmp, $content);
    rename($tmp, $file);
}

function dirIsEmpty(string $dir): bool {
    if (!is_dir($dir)) return true;
    $entries = scandir($dir);
    if (!is_array($entries)) return true;
    foreach ($entries as $entry) {
        if ($entry === '.' || $entry === '..') continue;
        return false;
    }
    return true;
}

function copyDir(string $sourceDir, string $targetDir): void {
    if (!is_dir($sourceDir)) return;
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
        copy($sourcePath, $targetPath);
    }
}

function copyIfMissingOrEmpty(string $sourceDir, string $targetDir, string $entryFile = 'index.html'): void {
    if (!is_dir($sourceDir)) return;
    ensureDir($targetDir);
    $entryPath = rtrim($targetDir, '/') . '/' . ltrim($entryFile, '/');
    if (dirIsEmpty($targetDir) || !is_file($entryPath)) {
        copyDir($sourceDir, $targetDir);
    }
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
        return '#' . $m[1];
    }
    return '#0A1A2F';
}

function writeGeneratedLogo(string $clientRoot, string $name, string $palette): array {
    $logoDir = $clientRoot . '/assets/logo';
    ensureDir($logoDir);
    $primary = firstColor($palette);
    $safeName = strtoupper(substr(preg_replace('/[^A-Za-z0-9]+/', '', $name) ?: 'CLIENTE', 0, 12));
    $svg = <<<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="144" viewBox="0 0 512 144" role="img" aria-label="Logo $safeName">
  <rect width="512" height="144" rx="24" fill="$primary"/>
  <circle cx="72" cy="72" r="38" fill="#FFFFFF" opacity="0.18"/>
  <text x="136" y="66" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF">$safeName</text>
  <text x="136" y="95" font-family="Inter, Arial, sans-serif" font-size="18" fill="#E2E8F0">Identidade visual temporaria</text>
</svg>
SVG;
    $svgPath = $logoDir . '/logo.svg';
    writeAtomic($svgPath, $svg);

    // Arquivos de apoio para padrao operacional.
    $pngPath = $logoDir . '/logo-web.png';
    $faviconPath = $logoDir . '/favicon.ico';
    if (!is_file($pngPath)) {
        writeAtomic($pngPath, 'PNG_PLACEHOLDER_GENERATED');
    }
    if (!is_file($faviconPath)) {
        writeAtomic($faviconPath, 'ICO_PLACEHOLDER_GENERATED');
    }

    return [$svgPath, $pngPath, $faviconPath];
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

    $r = 0.0;
    $g = 0.0;
    $b = 0.0;
    if ($h < 60) {
        $r = $c; $g = $x; $b = 0;
    } elseif ($h < 120) {
        $r = $x; $g = $c; $b = 0;
    } elseif ($h < 180) {
        $r = 0; $g = $c; $b = $x;
    } elseif ($h < 240) {
        $r = 0; $g = $x; $b = $c;
    } elseif ($h < 300) {
        $r = $x; $g = 0; $b = $c;
    } else {
        $r = $c; $g = 0; $b = $x;
    }

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
    if ($step % 2 === 0) {
        $step += 1;
    }
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
    $palette = buildDynamicPalette($h);
    $cta = $pick($ctas, 4);
    $mainGoal = $pick($goalFocus, 5);
    $services = $serviceStacks[(($h + 7) % count($serviceStacks))];
    $differentials = $differentialStacks[(($h + 11) % count($differentialStacks))];

    $domainSlug = slugifyText($orgName ?: ('cliente-' . ($seq + 1)));
    $domain = $domainSlug . '.com.br';
    $integrations = implode(', ', pickManyUnique($integrationPool, $h + 17, 5));

    $legal = 'Cumprir LGPD, informar canais oficiais de atendimento e incluir politica de privacidade no rodape.';
    $extra = implode("\n", [
        'Layout premium responsivo com boa performance em mobile e desktop',
        'SEO local basico com metatags, headings e dados estruturados bem definidos',
        'Acessibilidade minima com foco visivel, labels corretas e contraste AA',
        'Microinteracoes sutis para reforcar percepcao de qualidade',
        'Conteudo orientado a conversao e sem copy generica',
    ]);

    $referenceList = implode("\n", pickManyUnique($refs, $h + 23, 3));
    $secondaryGoals = implode("\n", pickManyUnique([
        'Fortalecer credibilidade em buscas locais',
        'Diferenciar claramente a proposta de valor frente a concorrentes',
        'Aumentar o volume de contatos qualificados em canais digitais',
        'Reforcar prova social e reduzir objecoes comerciais',
        'Dar visibilidade para servicos de maior margem',
        'Criar narrativa de marca consistente em todas as paginas',
    ], $h + 31, 3));

    return [
        'legal_name' => $orgName !== '' ? $orgName : 'Cliente Teste ' . ($seq + 1),
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
        'visual_references' => $referenceList,
        'legal_content' => $legal,
        'integrations' => $integrations,
        'domain_target' => $domain,
        'extra_requirements' => $extra,
        'organization_slug' => buildOrgSlug($orgName, $orgId),
        'has_logo' => (($h % 2) === 0) ? 'sim' : 'nao',
        'has_brand_manual' => (($h % 3) !== 0) ? 'sim' : 'nao',
        'has_content' => 'sim',
        'logo_description' => 'Logo moderna com simbolo memoravel relacionada ao nicho e tipografia forte.',
        'billing_email' => $email,
    ];
}

function ensureReleaseAndVariants(string $dealId, string $orgId, string $orgName, string $orgSlug, string $clientRoot): array {
    $db = db();
    $releasesRoot = $clientRoot . '/releases';
    ensureDir($releasesRoot);

    $active = $db->one(
        "SELECT id, version, status, project_root, assets_path
         FROM crm.deal_site_release
         WHERE deal_id=:did AND status IN ('DRAFT','READY','IN_REVIEW')
         ORDER BY version DESC, updated_at DESC
         LIMIT 1",
        [':did' => $dealId],
    );

    $releaseId = '';
    $version = 1;
    $releaseReused = false;

    if ($active) {
        $releaseId = (string)$active['id'];
        $version = (int)$active['version'];
        $releaseReused = true;
    } else {
        $max = $db->one("SELECT COALESCE(MAX(version),0) AS version FROM crm.deal_site_release WHERE deal_id=:did", [':did' => $dealId]);
        $version = ((int)($max['version'] ?? 0)) + 1;
    }

    $releaseLabel = 'v' . $version;
    $releaseRoot = $releasesRoot . '/' . $releaseLabel;
    $assetsPath = $clientRoot . '/assets';
    ensureDir($releaseRoot);
    ensureDir($assetsPath);

    if ($releaseReused) {
        $db->exec(
            "UPDATE crm.deal_site_release
             SET status='DRAFT', project_root=:project_root, assets_path=:assets_path, updated_at=now()
             WHERE id=:id",
            [
                ':id' => $releaseId,
                ':project_root' => $releaseRoot,
                ':assets_path' => $assetsPath,
            ],
        );
    } else {
        $row = $db->one(
            "INSERT INTO crm.deal_site_release(
                deal_id, version, status, project_root, assets_path, created_by, created_at, updated_at
             ) VALUES(
                :deal_id, :version, 'DRAFT', :project_root, :assets_path, 'BACKFILL', now(), now()
             ) RETURNING id",
            [
                ':deal_id' => $dealId,
                ':version' => $version,
                ':project_root' => $releaseRoot,
                ':assets_path' => $assetsPath,
            ],
        );
        $releaseId = (string)($row['id'] ?? '');
    }

    $libraryRoot = rtrim((string)(getenv('SITE24H_TEMPLATE_LIBRARY_ROOT') ?: '/home/server/projects/projeto-area-cliente/storage/site-models'), '/');
    $models = [
        'V1' => ['folder' => 'modelo_v1', 'source' => $libraryRoot . '/template_v1_institucional_1pagina', 'entry' => 'index.html'],
        'V2' => ['folder' => 'modelo_v2', 'source' => $libraryRoot . '/template_v2_institucional_3paginas', 'entry' => 'index.html'],
        'V3' => ['folder' => 'modelo_v3', 'source' => $libraryRoot . '/template_v3_institucional_chatbot', 'entry' => 'index.html'],
    ];

    $variants = [];
    foreach ($models as $code => $cfg) {
        $variantRoot = $releaseRoot . '/' . $cfg['folder'];
        ensureDir($variantRoot);
        copyIfMissingOrEmpty($cfg['source'], $variantRoot, $cfg['entry']);
        $preview = buildPreviewUrl($orgSlug, $releaseLabel, strtolower($code), $cfg['entry']);

        $db->exec(
            "INSERT INTO crm.deal_site_variant(release_id, variant_code, folder_path, entry_file, preview_url, status, created_at, updated_at)
             VALUES(:rid, :code, :folder_path, :entry, :preview, 'BASE_PREPARED', now(), now())
             ON CONFLICT (release_id, variant_code)
             DO UPDATE SET folder_path=EXCLUDED.folder_path, entry_file=EXCLUDED.entry_file, preview_url=EXCLUDED.preview_url, updated_at=now()",
            [
                ':rid' => $releaseId,
                ':code' => $code,
                ':folder_path' => $variantRoot,
                ':entry' => $cfg['entry'],
                ':preview' => $preview,
            ],
        );

        $variants[$code] = [
            'folderPath' => $variantRoot,
            'entryFile' => $cfg['entry'],
            'previewUrl' => $preview,
        ];
    }

    return [
        'releaseId' => $releaseId,
        'releaseVersion' => $version,
        'releaseLabel' => $releaseLabel,
        'releaseRoot' => $releaseRoot,
        'assetsPath' => $assetsPath,
        'variants' => $variants,
    ];
}

function writePromptFiles(string $clientRoot, array $prompt, string $orgId, string $orgSlug, string $releaseId, string $releaseLabel): array {
    $promptJson = is_array($prompt['json'] ?? null) ? $prompt['json'] : [];
    $promptMarkdown = trim((string)($prompt['markdown'] ?? ($prompt['text'] ?? '')));
    $variantPrompts = is_array($promptJson['variant_prompts'] ?? null) ? $promptJson['variant_prompts'] : [];

    $masterPromptPath = $clientRoot . '/prompt_pai_orquestrador.md';
    $promptJsonPath = $clientRoot . '/prompt_personalizacao.json';
    $promptMdPath = $clientRoot . '/prompt_personalizacao.md';
    $identityPath = $clientRoot . '/identidade_visual.md';
    $assetsManifestPath = $clientRoot . '/assets/assets_manifest.json';
    $releaseManifestPath = $clientRoot . '/release_manifest.json';

    writeAtomic($masterPromptPath, (string)($prompt['master_prompt_markdown'] ?? ($promptJson['master_prompt_markdown'] ?? '')));
    writeAtomic($promptJsonPath, json_encode($promptJson, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    writeAtomic($promptMdPath, $promptMarkdown !== '' ? $promptMarkdown : '# Prompt de personalizacao');
    writeAtomic($clientRoot . '/prompt_v1_draft.md', trim((string)($variantPrompts['V1'] ?? $promptMarkdown)));
    writeAtomic($clientRoot . '/prompt_v2_draft.md', trim((string)($variantPrompts['V2'] ?? $promptMarkdown)));
    writeAtomic($clientRoot . '/prompt_v3_draft.md', trim((string)($variantPrompts['V3'] ?? $promptMarkdown)));
    writeAtomic($identityPath, (string)($promptJson['identity_markdown'] ?? '# Identidade Visual - Site24h'));

    $sources = (array)($promptJson['assets_manifest_schema']['allowed_sources'] ?? []);
    $sources = array_values(array_filter(array_map(static fn($item) => trim((string)$item), $sources)));
    writeAtomic($assetsManifestPath, json_encode([
        'version' => '1.0',
        'generatedAt' => date('c'),
        'organizationId' => $orgId,
        'organizationSlug' => $orgSlug,
        'releaseId' => $releaseId,
        'releaseLabel' => $releaseLabel,
        'allowed_sources' => $sources,
        'assets' => [],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    writeAtomic($releaseManifestPath, json_encode([
        'organizationId' => $orgId,
        'organizationSlug' => $orgSlug,
        'releaseId' => $releaseId,
        'releaseLabel' => $releaseLabel,
        'generatedAt' => date('c'),
        'files' => [
            'masterPrompt' => $masterPromptPath,
            'promptJson' => $promptJsonPath,
            'promptMarkdown' => $promptMdPath,
            'identity' => $identityPath,
            'assetsManifest' => $assetsManifestPath,
        ],
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));

    return [
        'masterPromptPath' => $masterPromptPath,
        'promptJsonPath' => $promptJsonPath,
        'promptMdPath' => $promptMdPath,
        'identityPath' => $identityPath,
        'assetsManifestPath' => $assetsManifestPath,
    ];
}

$db = db();
$rows = $db->all(
    "SELECT DISTINCT ON (o.id)
        o.id::text AS organization_id,
        COALESCE(o.legal_name, '') AS legal_name,
        COALESCE(o.billing_email, '') AS billing_email,
        d.id::text AS deal_id,
        d.lifecycle_status
     FROM client.organizations o
     JOIN crm.deal d ON d.organization_id=o.id
     WHERE d.deal_type='HOSPEDAGEM'
       AND (
            lower(COALESCE(o.billing_email, '')) LIKE '%@teste.lan'
         OR lower(COALESCE(o.billing_email, '')) LIKE '%@koddahub.local'
       )
     ORDER BY o.id, d.updated_at DESC"
);

if (count($rows) === 0) {
    fwrite(STDOUT, "Nenhum cliente de teste com deal HOSPEDAGEM encontrado.\n");
    exit(0);
}

$clientRootBase = rtrim((string)(getenv('CLIENT_PROJECTS_ROOT') ?: '/home/server/projects/clientes'), '/');
$processed = 0;
$errors = 0;
$report = [];

foreach ($rows as $idx => $row) {
    $orgId = (string)$row['organization_id'];
    $orgName = trim((string)$row['legal_name']);
    $email = trim((string)$row['billing_email']);
    $dealId = (string)$row['deal_id'];

    try {
        $brief = generateBriefProfile($orgId, $orgName, $email, $idx);
        $orgSlug = (string)$brief['organization_slug'];

        $latestBrief = $db->one(
            "SELECT id::text FROM client.project_briefs WHERE organization_id=:oid ORDER BY created_at DESC LIMIT 1",
            [':oid' => $orgId],
        );

        if ($latestBrief) {
            $briefId = (string)$latestBrief['id'];
            $db->exec(
                "UPDATE client.project_briefs
                 SET objective=:objective,
                     audience=:audience,
                     differentials=:differentials,
                     services=:services,
                     cta_text=:cta_text,
                     tone_of_voice=:tone_of_voice,
                     color_palette=:color_palette,
                     visual_references=:visual_references,
                     legal_content=:legal_content,
                     integrations=:integrations,
                     domain_target=:domain_target,
                     extra_requirements=:extra_requirements,
                     status='SUBMITTED'
                 WHERE id=:id",
                [
                    ':id' => $briefId,
                    ':objective' => $brief['objective'],
                    ':audience' => $brief['audience'],
                    ':differentials' => $brief['differentials'],
                    ':services' => $brief['services'],
                    ':cta_text' => $brief['cta_text'],
                    ':tone_of_voice' => $brief['tone_of_voice'],
                    ':color_palette' => $brief['color_palette'],
                    ':visual_references' => $brief['visual_references'],
                    ':legal_content' => $brief['legal_content'],
                    ':integrations' => $brief['integrations'],
                    ':domain_target' => $brief['domain_target'],
                    ':extra_requirements' => $brief['extra_requirements'],
                ],
            );
        } else {
            $ins = $db->one(
                "INSERT INTO client.project_briefs(
                    organization_id, objective, audience, differentials, services,
                    cta_text, tone_of_voice, color_palette, visual_references,
                    legal_content, integrations, domain_target, extra_requirements, status
                 ) VALUES(
                    :organization_id, :objective, :audience, :differentials, :services,
                    :cta_text, :tone_of_voice, :color_palette, :visual_references,
                    :legal_content, :integrations, :domain_target, :extra_requirements, 'SUBMITTED'
                 ) RETURNING id",
                [
                    ':organization_id' => $orgId,
                    ':objective' => $brief['objective'],
                    ':audience' => $brief['audience'],
                    ':differentials' => $brief['differentials'],
                    ':services' => $brief['services'],
                    ':cta_text' => $brief['cta_text'],
                    ':tone_of_voice' => $brief['tone_of_voice'],
                    ':color_palette' => $brief['color_palette'],
                    ':visual_references' => $brief['visual_references'],
                    ':legal_content' => $brief['legal_content'],
                    ':integrations' => $brief['integrations'],
                    ':domain_target' => $brief['domain_target'],
                    ':extra_requirements' => $brief['extra_requirements'],
                ],
            );
            $briefId = (string)($ins['id'] ?? '');
        }

        $prompt = PromptBuilder::build($brief);
        if (!isset($prompt['markdown']) || trim((string)$prompt['markdown']) === '') {
            $prompt['markdown'] = (string)($prompt['text'] ?? '');
        }
        if (is_array($prompt['json'])) {
            $prompt['json']['markdown'] = $prompt['markdown'];
            $prompt['json']['variantInstructions'] = $prompt['variantInstructions'] ?? ($prompt['json']['variantInstructions'] ?? []);
        }

        $db->exec("DELETE FROM client.ai_prompts WHERE brief_id=:bid", [':bid' => $briefId]);
        $db->exec(
            "INSERT INTO client.ai_prompts(brief_id, prompt_json, prompt_text, version)
             VALUES(:brief_id, :prompt_json::jsonb, :prompt_text, 2)",
            [
                ':brief_id' => $briefId,
                ':prompt_json' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
                ':prompt_text' => (string)$prompt['text'],
            ],
        );

        $clientRoot = $clientRootBase . '/' . $orgSlug;
        ensureDir($clientRoot);

        $release = ensureReleaseAndVariants($dealId, $orgId, $orgName, $orgSlug, $clientRoot);
        $logoFiles = writeGeneratedLogo($clientRoot, $orgName !== '' ? $orgName : $orgSlug, (string)$brief['color_palette']);

        $paths = writePromptFiles($clientRoot, $prompt, $orgId, $orgSlug, (string)$release['releaseId'], (string)$release['releaseLabel']);

        $maxRev = $db->one("SELECT COALESCE(MAX(version),0) AS version FROM crm.deal_prompt_revision WHERE deal_id=:did", [':did' => $dealId]);
        $nextRev = ((int)($maxRev['version'] ?? 0)) + 1;
        $db->exec(
            "INSERT INTO crm.deal_prompt_revision(deal_id, version, prompt_text, prompt_json, status, created_by, created_at, updated_at)
             VALUES(:deal_id, :version, :prompt_text, :prompt_json::jsonb, 'DRAFT', 'BACKFILL', now(), now())",
            [
                ':deal_id' => $dealId,
                ':version' => $nextRev,
                ':prompt_text' => (string)$prompt['markdown'],
                ':prompt_json' => json_encode($prompt['json'], JSON_UNESCAPED_UNICODE),
            ],
        );

        $db->exec(
            "INSERT INTO crm.deal_activity(deal_id, activity_type, content, metadata, created_by)
             VALUES(:deal_id, 'PREPROMPT_BACKFILL', :content, :metadata::jsonb, 'SYSTEM')",
            [
                ':deal_id' => $dealId,
                ':content' => 'Backfill de briefing/prompt de teste aplicado com Prompt Pai + V1/V2/V3.',
                ':metadata' => json_encode([
                    'brief_id' => $briefId,
                    'release_id' => $release['releaseId'],
                    'release_label' => $release['releaseLabel'],
                    'client_root' => $clientRoot,
                    'master_prompt_path' => $paths['masterPromptPath'],
                    'logo_generated' => $logoFiles,
                ], JSON_UNESCAPED_UNICODE),
            ],
        );

        $processed++;
        $report[] = [
            'organization_id' => $orgId,
            'billing_email' => $email,
            'deal_id' => $dealId,
            'brief_id' => $briefId,
            'release' => $release['releaseLabel'],
            'client_root' => $clientRoot,
        ];
        fwrite(STDOUT, "[OK] {$orgName} ({$email}) -> {$clientRoot} [{$release['releaseLabel']}]\n");
    } catch (Throwable $e) {
        $errors++;
        fwrite(STDERR, "[ERRO] org={$orgId} email={$email} msg={$e->getMessage()}\n");
    }
}

fwrite(STDOUT, "\nResumo backfill:\n");
fwrite(STDOUT, "- Processados: {$processed}\n");
fwrite(STDOUT, "- Erros: {$errors}\n");

$reportPath = '/tmp/site24h_backfill_report_' . date('Ymd_His') . '.json';
writeAtomic($reportPath, json_encode([
    'generated_at' => date('c'),
    'processed' => $processed,
    'errors' => $errors,
    'items' => $report,
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
fwrite(STDOUT, "- Relatorio: {$reportPath}\n");
