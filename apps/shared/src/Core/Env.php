<?php
declare(strict_types=1);

namespace Shared\Core;

final class Env {
    public static function load(string $envFile, string $fallbackFile): void {
        $file = is_file($envFile) ? $envFile : $fallbackFile;
        if (!is_file($file)) {
            return;
        }
        $lines = file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#')) continue;
            [$k, $v] = array_pad(explode('=', $line, 2), 2, '');
            $k = trim($k);
            $v = trim($v, " \t\n\r\0\x0B\"");
            if ($k !== '' && getenv($k) === false) {
                putenv("$k=$v");
                $_ENV[$k] = $v;
            }
        }
    }
}
