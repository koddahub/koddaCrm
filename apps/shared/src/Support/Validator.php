<?php
declare(strict_types=1);

namespace Shared\Support;

final class Validator {
    public static function required(array $data, array $fields): array {
        $errors = [];
        foreach ($fields as $field) {
            $value = $data[$field] ?? null;
            if ($value === null || $value === '') {
                $errors[$field] = 'Campo obrigatório';
            }
        }
        return $errors;
    }

    public static function email(?string $email): bool {
        return (bool) filter_var((string)$email, FILTER_VALIDATE_EMAIL);
    }
}
