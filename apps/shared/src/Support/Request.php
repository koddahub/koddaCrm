<?php
declare(strict_types=1);

namespace Shared\Support;

final class Request {
    public array $query;
    public array $body;
    public array $headers;

    public function __construct(array $query, array $body, array $headers) {
        $this->query = $query;
        $this->body = $body;
        $this->headers = $headers;
    }

    public static function capture(): self {
        $raw = file_get_contents('php://input') ?: '';
        $json = json_decode($raw, true);
        $headers = function_exists('getallheaders') ? getallheaders() : [];

        return new self(
            $_GET,
            is_array($json) ? $json : $_POST,
            is_array($headers) ? $headers : []
        );
    }

    public function input(string $key, mixed $default = null): mixed {
        return $this->body[$key] ?? $this->query[$key] ?? $default;
    }
}
