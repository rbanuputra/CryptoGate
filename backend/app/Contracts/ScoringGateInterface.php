<?php

namespace App\Contracts;

use App\Models\Token;

interface ScoringGateInterface
{
    public function score(Token $token): array;

    public function getGateNumber(): int;

    public function getGateName(): string;
}
