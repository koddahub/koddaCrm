<?php
declare(strict_types=1);

namespace Shared\Infra;

final class AsaasClient {
    private string $baseUrl;
    private string $apiKey;
    private string $walletId;

    public function __construct() {
        $this->baseUrl = rtrim(getenv('ASAAS_BASE_URL') ?: 'https://api-sandbox.asaas.com/v3', '/');
        $this->apiKey = getenv('ASAAS_API_KEY') ?: '';
        $this->walletId = getenv('ASAAS_WALLET_ID') ?: '';
    }

    public function createCustomer(array $payload): array {
        return $this->request('POST', '/customers', $payload);
    }

    public function findCustomerByCpfCnpj(string $cpfCnpj): ?array {
        $normalized = preg_replace('/\D+/', '', $cpfCnpj);
        if ($normalized === '') {
            return null;
        }
        $response = $this->request('GET', '/customers?cpfCnpj=' . rawurlencode($normalized) . '&limit=1');
        $first = $response['data'][0] ?? null;
        return is_array($first) ? $first : null;
    }

    public function createSubscription(array $payload): array {
        if ($this->walletId !== '' && !isset($payload['walletId'])) {
            $payload['walletId'] = $this->walletId;
        }
        return $this->request('POST', '/subscriptions', $payload);
    }

    public function updateSubscription(string $id, array $payload): array {
        return $this->request('POST', '/subscriptions/' . $id, $payload);
    }

    public function cancelSubscription(string $id): array {
        return $this->request('DELETE', '/subscriptions/' . $id);
    }

    public function getPaymentsBySubscription(string $subscriptionId, int $limit = 1): array {
        return $this->request('GET', '/payments?subscription=' . rawurlencode($subscriptionId) . '&limit=' . max(1, $limit));
    }

    public function isSuccess(array $response): bool {
        $status = (int)($response['http_status'] ?? 0);
        if ($status < 200 || $status >= 300) {
            return false;
        }
        if (!empty($response['errors']) && is_array($response['errors'])) {
            return false;
        }
        return true;
    }

    public function extractPaymentRedirectUrl(array $subscriptionResponse): ?string {
        $candidates = [
            $subscriptionResponse['invoiceUrl'] ?? null,
            $subscriptionResponse['bankSlipUrl'] ?? null,
            $subscriptionResponse['checkoutUrl'] ?? null,
            $subscriptionResponse['paymentLink'] ?? null,
        ];
        foreach ($candidates as $url) {
            if (is_string($url) && $url !== '') {
                return $url;
            }
        }

        $subscriptionId = (string)($subscriptionResponse['id'] ?? '');
        if ($subscriptionId === '') {
            return null;
        }
        $payments = $this->getPaymentsBySubscription($subscriptionId, 1);
        $first = $payments['data'][0] ?? null;
        if (!is_array($first)) {
            return null;
        }
        $paymentCandidates = [
            $first['invoiceUrl'] ?? null,
            $first['bankSlipUrl'] ?? null,
            $first['paymentLink'] ?? null,
        ];
        foreach ($paymentCandidates as $url) {
            if (is_string($url) && $url !== '') {
                return $url;
            }
        }
        return null;
    }

    private function request(string $method, string $path, array $payload = []): array {
        if ($this->apiKey === '') {
            return [
                'mock' => true,
                'id' => 'mock_' . uniqid(),
                'status' => 'PENDING',
                'invoiceUrl' => '/portal/dashboard?mock_payment=1',
                'http_status' => 200,
                'payload' => $payload
            ];
        }

        $ch = curl_init($this->baseUrl . $path);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => [
                'accept: application/json',
                'content-type: application/json',
                'access_token: ' . $this->apiKey,
                'User-Agent: KoddaHub-Portal/1.0',
            ],
        ];
        if ($method !== 'GET') {
            $options[CURLOPT_POSTFIELDS] = json_encode($payload, JSON_UNESCAPED_UNICODE);
        }
        curl_setopt_array($ch, $options);
        $response = curl_exec($ch);
        $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlErrNo = curl_errno($ch);
        $curlErr = curl_error($ch);
        curl_close($ch);

        $decoded = json_decode((string)$response, true);
        if (!is_array($decoded)) {
            $decoded = ['raw' => $response];
        }
        $decoded['http_status'] = $status;
        if ($curlErrNo !== 0) {
            $decoded['curl_error'] = $curlErr;
        }
        return $decoded;
    }
}
