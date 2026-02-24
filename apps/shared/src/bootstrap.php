<?php
declare(strict_types=1);

use Shared\Infra\Database;

require_once __DIR__ . '/Core/Env.php';
require_once __DIR__ . '/Support/Response.php';
require_once __DIR__ . '/Support/Request.php';
require_once __DIR__ . '/Support/Auth.php';
require_once __DIR__ . '/Support/FinancialAuditNotifier.php';
require_once __DIR__ . '/Support/AsaasWebhookProcessor.php';
require_once __DIR__ . '/Support/Validator.php';
require_once __DIR__ . '/Infra/Database.php';
require_once __DIR__ . '/Infra/AsaasClient.php';
require_once __DIR__ . '/Infra/PromptBuilderV2.php';
require_once __DIR__ . '/Infra/PromptBuilder.php';
require_once __DIR__ . '/Core/Router.php';

$root = dirname(__DIR__, 3);
Shared\Core\Env::load($root . '/.env', $root . '/.env.example');

function db(): Database {
    static $db;
    if (!$db) {
        $db = new Database([
            'host' => getenv('DB_HOST') ?: '127.0.0.1',
            'port' => (int)(getenv('DB_PORT') ?: 5432),
            'name' => getenv('DB_NAME') ?: 'ac_db',
            'user' => getenv('DB_USER') ?: 'ac_user',
            'pass' => getenv('DB_PASS') ?: 'ac_pass',
        ]);
    }
    return $db;
}
