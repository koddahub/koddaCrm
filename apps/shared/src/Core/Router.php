<?php
declare(strict_types=1);

namespace Shared\Core;

use Shared\Support\Request;
use Shared\Support\Response;

final class Router {
    private array $routes = [];

    public function get(string $path, callable $handler): void { $this->map('GET', $path, $handler); }
    public function post(string $path, callable $handler): void { $this->map('POST', $path, $handler); }

    private function map(string $method, string $path, callable $handler): void {
        $this->routes[$method][] = ['path' => $path, 'handler' => $handler];
    }

    public function run(): void {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        foreach (($this->routes[$method] ?? []) as $route) {
            $params = [];
            if ($this->match($route['path'], $uri, $params)) {
                $request = Request::capture();
                $request->query = array_merge($request->query, $params);
                ($route['handler'])($request);
                return;
            }
        }

        Response::json(['error' => 'Not found', 'path' => $uri], 404);
    }

    private function match(string $pattern, string $uri, array &$params): bool {
        $p = trim($pattern, '/');
        $u = trim($uri, '/');

        if ($p === '' && $u === '') return true;

        $pParts = $p === '' ? [] : explode('/', $p);
        $uParts = $u === '' ? [] : explode('/', $u);

        if (count($pParts) !== count($uParts)) return false;

        foreach ($pParts as $i => $part) {
            $value = $uParts[$i] ?? '';
            if (preg_match('/^\{([a-zA-Z_][a-zA-Z0-9_]*)\}$/', $part, $m)) {
                $params[$m[1]] = urldecode($value);
                continue;
            }
            if ($part !== $value) return false;
        }
        return true;
    }
}
