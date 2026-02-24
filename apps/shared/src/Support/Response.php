<?php
declare(strict_types=1);

namespace Shared\Support;

final class Response {
    public static function json(array $data, int $status = 200): void {
        while (ob_get_level() > 0) {
            @ob_end_clean();
        }
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false) {
            $json = json_encode([
                'ok' => false,
                'error' => 'JSON_ENCODE_FAILED',
                'message' => 'Falha ao serializar resposta do servidor.',
            ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        }
        echo $json;
    }

    public static function html(string $html, int $status = 200): void {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
    }
}
