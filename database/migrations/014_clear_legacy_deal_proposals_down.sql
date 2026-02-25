-- Irreversível: não há como restaurar os dados removidos automaticamente.
DO $$
BEGIN
  RAISE NOTICE '014_clear_legacy_deal_proposals_down: migration irreversível, sem restauração de dados';
END $$;
