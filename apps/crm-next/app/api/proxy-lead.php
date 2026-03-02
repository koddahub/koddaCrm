<?php
// /api/proxy-lead.php

// Permite que qualquer origem faça requisição a este proxy (apenas para teste)
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

// Se for uma requisição OPTIONS, apenas retorna os headers e encerra.
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit();
}

// Pega os dados enviados pelo seu formulário (via POST)
$input = json_decode(file_get_contents('php://input'), true);

// Prepara os dados para enviar ao CRM (apenas os 5 campos necessários)
$data = [
    'name' => $input['name'] ?? '',
    'email' => $input['email'] ?? '',
    'phone' => $input['phone'] ?? '',
    'interest' => $input['interest'] ?? '',
    'source' => $input['source'] ?? 'site_form'
];

// Envia a requisição para o CRM usando cURL
$ch = curl_init('https://koddacrm.koddahub.com.br/api/leads/ingest-site-form');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

// Retorna a mesma resposta que o CRM deu
http_response_code($httpCode);
echo $response;
?>