BEGIN;

DROP INDEX IF EXISTS idx_ticket_messages_ticket_created;
DROP TABLE IF EXISTS client.ticket_messages;

DROP INDEX IF EXISTS idx_fin_actions_request_id;
DROP INDEX IF EXISTS idx_fin_actions_type_created;
DROP INDEX IF EXISTS idx_fin_actions_status_created;
DROP INDEX IF EXISTS idx_fin_actions_org_created;
DROP TABLE IF EXISTS audit.financial_actions;

COMMIT;
