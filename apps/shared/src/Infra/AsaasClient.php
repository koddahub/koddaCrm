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

    public function getSubscription(string $id): array {
        $raw = $this->request('GET', '/subscriptions/' . rawurlencode($id));
        return $this->toProviderResult($raw);
    }

    public function updateSubscription(string $id, array $payload): array {
        $path = '/subscriptions/' . rawurlencode($id);
        $putResponse = $this->request('PUT', $path, $payload);
        $status = (int)($putResponse['http_status'] ?? 0);
        if ($status >= 200 && $status < 300) {
            return $putResponse;
        }
        if (in_array($status, [400, 404, 405], true) || $this->isMethodNotSupportedResponse($putResponse)) {
            return $this->request('POST', $path, $payload);
        }
        return $putResponse;
    }

    public function updateSubscriptionPlan(string $id, string $planIdOrCode, array $opts = []): array {
        $payload = $opts;
        if ($planIdOrCode !== '' && !isset($payload['plan_code'])) {
            $payload['plan_code'] = $planIdOrCode;
        }
        if (isset($payload['value'])) {
            $payload['value'] = (float)$payload['value'];
        }
        $raw = $this->updateSubscription($id, $payload);
        return $this->toProviderResult($raw);
    }

    public function updateSubscriptionValue(string $id, float $newValue, array $opts = []): array {
        $payload = array_merge($opts, ['value' => (float)$newValue]);
        $raw = $this->updateSubscription($id, $payload);
        return $this->toProviderResult($raw);
    }
    public function listSubscriptions(array $filters = []): array {
        $query = http_build_query($filters);
        $path = '/subscriptions' . ($query !== '' ? '?' . $query : '');
        return $this->request('GET', $path);
    }

    public function listSubscriptionsByCustomer(string $customerId, int $limit = 10, int $offset = 0): array {
        $safeLimit = max(1, min(100, $limit));
        $safeOffset = max(0, $offset);
        return $this->listSubscriptions([
            'customer' => $customerId,
            'limit' => $safeLimit,
            'offset' => $safeOffset,
        ]);
    }

    public function listPaymentsOfSubscription(string $subscriptionId, int $limit = 10, int $offset = 0): array {
        $safeLimit = max(1, min(100, $limit));
        $safeOffset = max(0, $offset);
        $subscriptionPath = '/subscriptions/' . rawurlencode($subscriptionId) . '/payments?'
            . http_build_query(['limit' => $safeLimit, 'offset' => $safeOffset]);
        $subscriptionPayments = $this->request('GET', $subscriptionPath);
        if ($this->isSuccess($subscriptionPayments)) {
            return $subscriptionPayments;
        }
        $fallbackPath = '/payments?' . http_build_query([
            'subscription' => $subscriptionId,
            'limit' => $safeLimit,
            'offset' => $safeOffset,
        ]);
        return $this->request('GET', $fallbackPath);
    }

    public function getPaymentBillingInfo(string $paymentId): array {
        $raw = $this->request('GET', '/payments/' . rawurlencode($paymentId) . '/billingInfo');
        return $this->toProviderResult($raw);
    }

    public function updateSubscriptionCreditCardWithoutCharge(string $subscriptionId, array $payload): array {
        $raw = $this->request('PUT', '/subscriptions/' . rawurlencode($subscriptionId) . '/creditCard', $payload);
        return $this->toProviderResult($raw);
    }

    public function cancelSubscription(string $id, string $mode = 'END_OF_CYCLE'): array {
        $normalizedMode = strtoupper(trim($mode));
        if (!in_array($normalizedMode, ['END_OF_CYCLE', 'IMMEDIATE'], true)) {
            $normalizedMode = 'END_OF_CYCLE';
        }

        if ($normalizedMode === 'END_OF_CYCLE') {
            $raw = $this->request('POST', '/subscriptions/' . rawurlencode($id), [
                'status' => 'INACTIVE',
                'cancelAtEndOfCycle' => true,
            ]);
            if ($this->isSuccess($raw)) {
                return $this->toProviderResult($raw);
            }
        }

        $raw = $this->request('DELETE', '/subscriptions/' . rawurlencode($id), [
            'mode' => $normalizedMode,
        ]);
        return $this->toProviderResult($raw);
    }

    public function createPaymentRetryLink(string $subscriptionId): array {
        $payments = $this->getPaymentsBySubscription($subscriptionId, 1);
        $payment = $payments['data'][0] ?? null;
        if (!is_array($payment)) {
            return [
                'ok' => false,
                'status_code' => (int)($payments['http_status'] ?? 404),
                'data' => null,
                'error_code' => 'NO_PENDING_PAYMENT',
                'error_message_safe' => 'Nenhuma cobrança pendente encontrada.',
                'provider_request_id' => null,
            ];
        }
        $retryUrl = $this->firstNonEmptyUrl([
            $payment['invoiceUrl'] ?? null,
            $payment['bankSlipUrl'] ?? null,
            $payment['paymentLink'] ?? null,
            $payment['checkoutUrl'] ?? null,
        ]);
        if ($retryUrl === null) {
            return [
                'ok' => false,
                'status_code' => (int)($payments['http_status'] ?? 404),
                'data' => null,
                'error_code' => 'RETRY_URL_NOT_AVAILABLE',
                'error_message_safe' => 'Link de cobrança indisponível no momento.',
                'provider_request_id' => null,
            ];
        }

        return [
            'ok' => true,
            'status_code' => 200,
            'data' => [
                'payment_id' => (string)($payment['id'] ?? ''),
                'payment_redirect_url' => $retryUrl,
            ],
            'error_code' => null,
            'error_message_safe' => null,
            'provider_request_id' => null,
        ];
    }

    public function createCardUpdateLinkForSubscription(string $subscriptionId): array {
        if ($this->apiKey === '') {
            return [
                'ok' => true,
                'status_code' => 200,
                'data' => [
                    'card_update_url' => '/portal/dashboard?mock_card_update=1&subscription=' . rawurlencode($subscriptionId),
                    'provider_flow' => 'MOCK_CARD_UPDATE',
                    'customer_id' => null,
                ],
                'error_code' => null,
                'error_message_safe' => null,
                'provider_request_id' => null,
            ];
        }

        $subscription = $this->getSubscription($subscriptionId);
        if (!$subscription['ok']) {
            return $subscription;
        }

        $subData = is_array($subscription['data']) ? $subscription['data'] : [];
        $customerId = trim((string)($subData['customer'] ?? ''));

        $subscriptionSelfServiceUrl = $this->firstNonEmptyUrl([
            $subData['cardUpdateUrl'] ?? null,
            $subData['billingInfoUpdateUrl'] ?? null,
            $subData['customerPortalUrl'] ?? null,
            $subData['manageSubscriptionUrl'] ?? null,
            $subData['url'] ?? null,
        ]);
        if ($subscriptionSelfServiceUrl === null) {
            $subscriptionSelfServiceUrl = $this->extractNonChargeUrlFromResponse($subData);
        }
        if ($subscriptionSelfServiceUrl !== null && !$this->isLikelyPaymentUrl($subscriptionSelfServiceUrl)) {
            return [
                'ok' => true,
                'status_code' => (int)($subscription['status_code'] ?? 200),
                'data' => [
                    'card_update_url' => $subscriptionSelfServiceUrl,
                    'provider_flow' => 'MANAGE_SUBSCRIPTION',
                    'customer_id' => $customerId !== '' ? $customerId : null,
                ],
                'error_code' => null,
                'error_message_safe' => null,
                'provider_request_id' => (string)($subscription['provider_request_id'] ?? ''),
            ];
        }

        $configuredPath = trim((string)(getenv('ASAAS_SUBSCRIPTION_CARD_UPDATE_ENDPOINT') ?: ''));
        if ($configuredPath !== '') {
            $method = strtoupper(trim((string)(getenv('ASAAS_SUBSCRIPTION_CARD_UPDATE_METHOD') ?: 'POST')));
            if (!in_array($method, ['GET', 'POST'], true)) {
                $method = 'POST';
            }
            $path = str_replace('{subscription_id}', rawurlencode($subscriptionId), $configuredPath);
            $payload = [];
            $callbackUrl = trim((string)(getenv('ASAAS_CARD_UPDATE_RETURN_URL') ?: ''));
            if ($callbackUrl !== '') {
                $payload['callbackUrl'] = $callbackUrl;
            }
            $raw = $this->request($method, $path, $payload);
            $url = $this->extractNonChargeUrlFromResponse($raw);
            if ($url !== null) {
                return [
                    'ok' => true,
                    'status_code' => (int)($raw['http_status'] ?? 200),
                    'data' => [
                        'card_update_url' => $url,
                        'provider_flow' => 'SUBSCRIPTION_CARD_UPDATE',
                        'customer_id' => $customerId !== '' ? $customerId : null,
                    ],
                    'error_code' => null,
                    'error_message_safe' => null,
                    'provider_request_id' => (string)($raw['requestId'] ?? $raw['id'] ?? ''),
                ];
            }
        }

        if ($customerId !== '') {
            $customerFlow = $this->createBillingInfoUpdateLinkForCustomer($customerId);
            if ($customerFlow['ok']) {
                if (!isset($customerFlow['data']) || !is_array($customerFlow['data'])) {
                    $customerFlow['data'] = [];
                }
                $customerFlow['data']['provider_flow'] = $customerFlow['data']['provider_flow'] ?? 'CUSTOMER_BILLING_UPDATE';
                return $customerFlow;
            }
        }

        $manageTemplate = trim((string)(getenv('ASAAS_MANAGE_SUBSCRIPTION_URL_TEMPLATE') ?: ''));
        if ($manageTemplate !== '') {
            $manageUrl = str_replace('{subscription_id}', rawurlencode($subscriptionId), $manageTemplate);
            if (!$this->isLikelyPaymentUrl($manageUrl)) {
                return [
                    'ok' => true,
                    'status_code' => 200,
                    'data' => [
                        'card_update_url' => $manageUrl,
                        'provider_flow' => 'MANAGE_SUBSCRIPTION',
                        'customer_id' => $customerId !== '' ? $customerId : null,
                    ],
                    'error_code' => null,
                    'error_message_safe' => null,
                    'provider_request_id' => null,
                ];
            }
        }

        return [
            'ok' => false,
            'status_code' => 422,
            'data' => null,
            'error_code' => 'CARD_UPDATE_FLOW_UNAVAILABLE',
            'error_message_safe' => 'Não foi possível localizar um fluxo seguro de atualização de cartão sem cobrança.',
            'provider_request_id' => null,
        ];
    }

    public function createBillingInfoUpdateLinkForCustomer(string $customerId): array {
        if ($this->apiKey === '') {
            return [
                'ok' => true,
                'status_code' => 200,
                'data' => [
                    'card_update_url' => '/portal/dashboard?mock_card_update=1&customer=' . rawurlencode($customerId),
                    'provider_flow' => 'MOCK_CARD_UPDATE',
                    'customer_id' => $customerId,
                ],
                'error_code' => null,
                'error_message_safe' => null,
                'provider_request_id' => null,
            ];
        }

        $configuredPath = trim((string)(getenv('ASAAS_CUSTOMER_BILLING_UPDATE_ENDPOINT') ?: ''));
        if ($configuredPath !== '') {
            $method = strtoupper(trim((string)(getenv('ASAAS_CUSTOMER_BILLING_UPDATE_METHOD') ?: 'POST')));
            if (!in_array($method, ['GET', 'POST'], true)) {
                $method = 'POST';
            }
            $path = str_replace('{customer_id}', rawurlencode($customerId), $configuredPath);
            $payload = [];
            $callbackUrl = trim((string)(getenv('ASAAS_CARD_UPDATE_RETURN_URL') ?: ''));
            if ($callbackUrl !== '') {
                $payload['callbackUrl'] = $callbackUrl;
            }
            $raw = $this->request($method, $path, $payload);
            $url = $this->extractNonChargeUrlFromResponse($raw);
            if ($url !== null) {
                return [
                    'ok' => true,
                    'status_code' => (int)($raw['http_status'] ?? 200),
                    'data' => [
                        'card_update_url' => $url,
                        'provider_flow' => 'CUSTOMER_BILLING_UPDATE',
                        'customer_id' => $customerId,
                    ],
                    'error_code' => null,
                    'error_message_safe' => null,
                    'provider_request_id' => (string)($raw['requestId'] ?? $raw['id'] ?? ''),
                ];
            }
        }

        $template = trim((string)(getenv('ASAAS_CUSTOMER_BILLING_UPDATE_URL_TEMPLATE') ?: ''));
        if ($template !== '') {
            $url = str_replace('{customer_id}', rawurlencode($customerId), $template);
            if (!$this->isLikelyPaymentUrl($url)) {
                return [
                    'ok' => true,
                    'status_code' => 200,
                    'data' => [
                        'card_update_url' => $url,
                        'provider_flow' => 'CUSTOMER_BILLING_UPDATE',
                        'customer_id' => $customerId,
                    ],
                    'error_code' => null,
                    'error_message_safe' => null,
                    'provider_request_id' => null,
                ];
            }
        }

        return [
            'ok' => false,
            'status_code' => 422,
            'data' => null,
            'error_code' => 'BILLING_UPDATE_FLOW_UNAVAILABLE',
            'error_message_safe' => 'Fluxo de atualização de dados de cobrança indisponível.',
            'provider_request_id' => null,
        ];
    }

    public function createProrataCharge(string $customerId, float $amount, string $description): array {
        $rounded = round($amount, 2);
        if ($rounded <= 0) {
            return [
                'ok' => true,
                'status_code' => 200,
                'data' => ['skipped' => true, 'amount' => 0],
                'error_code' => null,
                'error_message_safe' => null,
                'provider_request_id' => null,
            ];
        }
        $payload = [
            'customer' => $customerId,
            'billingType' => (string)(getenv('ASAAS_PRORATA_BILLING_TYPE') ?: 'UNDEFINED'),
            'value' => $rounded,
            'dueDate' => date('Y-m-d'),
            'description' => $description,
        ];
        $raw = $this->request('POST', '/payments', $payload);
        return $this->toProviderResult($raw);
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

    private function firstNonEmptyUrl(array $candidates): ?string {
        foreach ($candidates as $url) {
            if (is_string($url) && trim($url) !== '') {
                return trim($url);
            }
        }
        return null;
    }

    private function extractNonChargeUrlFromResponse(array $raw): ?string {
        $candidates = [
            $raw['cardUpdateUrl'] ?? null,
            $raw['billingInfoUpdateUrl'] ?? null,
            $raw['customerPortalUrl'] ?? null,
            $raw['manageSubscriptionUrl'] ?? null,
            $raw['url'] ?? null,
            (is_array($raw['data'] ?? null) ? ($raw['data']['cardUpdateUrl'] ?? null) : null),
            (is_array($raw['data'] ?? null) ? ($raw['data']['billingInfoUpdateUrl'] ?? null) : null),
            (is_array($raw['data'] ?? null) ? ($raw['data']['url'] ?? null) : null),
        ];
        foreach ($this->collectUrlsRecursively($raw) as $url) {
            $candidates[] = $url;
        }
        foreach ($candidates as $url) {
            if (!is_string($url) || trim($url) === '') {
                continue;
            }
            $candidate = trim($url);
            if ($this->isLikelyPaymentUrl($candidate)) {
                continue;
            }
            return $candidate;
        }
        return null;
    }

    private function collectUrlsRecursively(array $node): array {
        $urls = [];
        foreach ($node as $value) {
            if (is_array($value)) {
                foreach ($this->collectUrlsRecursively($value) as $nested) {
                    $urls[] = $nested;
                }
                continue;
            }
            if (!is_string($value)) {
                continue;
            }
            $candidate = trim($value);
            if ($candidate === '') {
                continue;
            }
            if (preg_match('#^https?://#i', $candidate) === 1 || str_starts_with($candidate, '/')) {
                $urls[] = $candidate;
            }
        }
        return array_values(array_unique($urls));
    }

    private function isLikelyPaymentUrl(string $url): bool {
        $lower = strtolower($url);
        $needles = [
            'invoice',
            'boleto',
            'pix',
            '/cobranca',
            '/cobrança',
            '/checkout',
            '/v3/payments',
        ];
        foreach ($needles as $needle) {
            if (str_contains($lower, $needle)) {
                return true;
            }
        }
        return false;
    }

    private function isMethodNotSupportedResponse(array $raw): bool {
        $errorFragments = [];
        $message = $raw['message'] ?? null;
        if (is_string($message) && trim($message) !== '') {
            $errorFragments[] = strtolower($message);
        }
        $errorCode = $raw['code'] ?? null;
        if (is_string($errorCode) && trim($errorCode) !== '') {
            $errorFragments[] = strtolower($errorCode);
        }
        $firstError = $raw['errors'][0] ?? null;
        if (is_array($firstError)) {
            foreach (['code', 'description'] as $field) {
                $value = $firstError[$field] ?? null;
                if (is_string($value) && trim($value) !== '') {
                    $errorFragments[] = strtolower($value);
                }
            }
        }
        if ($errorFragments === []) {
            return false;
        }
        foreach ($errorFragments as $fragment) {
            if (
                str_contains($fragment, 'method not allowed')
                || str_contains($fragment, 'method not supported')
                || str_contains($fragment, 'unsupported method')
            ) {
                return true;
            }
        }
        return false;
    }

    private function toProviderResult(array $raw): array {
        $statusCode = (int)($raw['http_status'] ?? 0);
        if ($statusCode <= 0) {
            $statusCode = 500;
        }
        $ok = $this->isSuccess($raw);

        $errorCode = null;
        $errorMessageSafe = null;
        if (!$ok) {
            $errorCode = (string)($raw['code'] ?? '');
            if ($errorCode === '' && isset($raw['errors'][0]['code'])) {
                $errorCode = (string)$raw['errors'][0]['code'];
            }
            $errorMessageSafe = (string)($raw['message'] ?? '');
            if ($errorMessageSafe === '' && isset($raw['errors'][0]['description'])) {
                $errorMessageSafe = (string)$raw['errors'][0]['description'];
            }
            if ($errorMessageSafe === '') {
                $errorMessageSafe = 'Falha na integração com ASAAS.';
            }
            if ($errorCode === '') {
                $errorCode = 'ASAAS_REQUEST_FAILED';
            }
        }

        $data = $raw;
        unset($data['http_status']);
        unset($data['errors']);
        unset($data['curl_error']);

        return [
            'ok' => $ok,
            'status_code' => $statusCode,
            'data' => $data,
            'error_code' => $errorCode,
            'error_message_safe' => $errorMessageSafe,
            'provider_request_id' => (string)($raw['requestId'] ?? $raw['id'] ?? ''),
            'raw' => $raw,
        ];
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
