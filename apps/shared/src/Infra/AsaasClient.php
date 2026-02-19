<?php
declare(strict_types=1);

namespace Shared\Infra;

final class AsaasClient {
    private string $baseUrl;
    private string $apiKey;

    public function __construct() {
        $this->baseUrl = rtrim(getenv('ASAAS_BASE_URL') ?: 'https://sandbox.asaas.com/api/v3', '/');
        $this->apiKey = getenv('ASAAS_API_KEY') ?: '';
    }

    public function createCustomer(array $payload): array {
        return $this->request('POST', '/customers', $payload);
    }

    public function createSubscription(array $payload): array {
        return $this->request('POST', '/subscriptions', $payload);
    }

    public function updateSubscription(string $id, array $payload): array {
        return $this->request('POST', '/subscriptions/' . $id, $payload);
    }

    private function request(string $method, string $path, array $payload = []): array {
        if ($this->apiKey === '') {
            return ['mock' => true, 'id' => 'mock_' . uniqid(), 'status' => 'PENDING', 'payload' => $payload];
        }

        $ch = curl_init($this->baseUrl . $path);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => [
                'accept: application/json',
                'content-type: application/json',
                'access_token: ' . $this->apiKey,
            ],
            CURLOPT_POSTFIELDS => json_encode($payload, JSON_UNESCAPED_UNICODE),
        ]);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        $decoded = json_decode((string)$response, true);
        if (!is_array($decoded)) {
            $decoded = ['raw' => $response];
        }
        $decoded['http_status'] = $status;
        return $decoded;
    }
}
