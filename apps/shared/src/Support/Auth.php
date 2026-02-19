<?php
declare(strict_types=1);

namespace Shared\Support;

final class Auth {
    public static function hashPassword(string $password): string {
        return password_hash($password, PASSWORD_BCRYPT);
    }

    public static function verifyPassword(string $password, string $hash): bool {
        return password_verify($password, $hash);
    }

    public static function issueToken(array $payload): string {
        $secret = getenv('JWT_SECRET') ?: 'secret';
        $payload['iat'] = time();
        $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
        $sig = hash_hmac('sha256', (string)$json, $secret);
        return rtrim(strtr(base64_encode((string)$json), '+/', '-_'), '=') . '.' . $sig;
    }
}
