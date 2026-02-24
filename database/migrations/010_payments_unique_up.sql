-- Execute outside explicit transaction when using CONCURRENTLY.
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_client_payments_asaas_payment_id
  ON client.payments(asaas_payment_id)
  WHERE asaas_payment_id IS NOT NULL;
