<?php
declare(strict_types=1);

namespace Shared\Infra;

final class PromptBuilder {
    public static function build(array $brief): array {
        return PromptBuilderV2::build($brief);
    }
}
