<?php
declare(strict_types=1);

require_once __DIR__ . '/../apps/shared/src/bootstrap.php';

$logFile = __DIR__ . '/../storage/logs/worker.log';

while (true) {
    try {
        $emails = db()->all("SELECT id, email_to, subject, body, attachments FROM crm.email_queue WHERE status='PENDING' ORDER BY created_at ASC LIMIT 20");
        foreach ($emails as $mail) {
            $attachmentsText = '';
            if (!empty($mail['attachments'])) {
                $attachmentsText = ' | anexos=' . json_encode($mail['attachments']);
            }

            // Simulação de envio automático (MVP local)
            file_put_contents(
                $logFile,
                '[' . date('c') . '] email_simulado -> ' . $mail['email_to'] . ' | ' . $mail['subject'] . $attachmentsText . PHP_EOL,
                FILE_APPEND
            );

            db()->exec("UPDATE crm.email_queue SET status='SENT_SIMULATED', processed_at=now() WHERE id=:id", [':id' => $mail['id']]);
        }

        $events = db()->all("SELECT id, provider, event_type FROM client.webhook_events WHERE processed=false ORDER BY created_at ASC LIMIT 30");
        foreach ($events as $ev) {
            db()->exec("UPDATE client.webhook_events SET processed=true WHERE id=:id", [':id' => $ev['id']]);
            file_put_contents($logFile, '[' . date('c') . '] webhook_processado -> ' . $ev['provider'] . ':' . $ev['event_type'] . PHP_EOL, FILE_APPEND);
        }

        file_put_contents($logFile, '[' . date('c') . '] worker_loop_ok' . PHP_EOL, FILE_APPEND);
    } catch (Throwable $e) {
        file_put_contents($logFile, '[' . date('c') . '] worker_error: ' . $e->getMessage() . PHP_EOL, FILE_APPEND);
    }

    sleep(12);
}
