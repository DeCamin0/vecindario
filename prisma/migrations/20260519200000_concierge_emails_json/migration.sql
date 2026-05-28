-- Lista de conserjes (1–5 correos) + suplente aparte
ALTER TABLE `communities` ADD COLUMN `concierge_emails_json` JSON NOT NULL DEFAULT ('[]');

UPDATE `communities`
SET `concierge_emails_json` = CASE
  WHEN `concierge_email` IS NOT NULL AND TRIM(`concierge_email`) != ''
    AND `concierge_email_2` IS NOT NULL AND TRIM(`concierge_email_2`) != ''
    AND LOWER(TRIM(`concierge_email`)) != LOWER(TRIM(`concierge_email_2`))
    THEN JSON_ARRAY(TRIM(`concierge_email`), TRIM(`concierge_email_2`))
  WHEN `concierge_email` IS NOT NULL AND TRIM(`concierge_email`) != ''
    THEN JSON_ARRAY(TRIM(`concierge_email`))
  ELSE JSON_ARRAY()
END;
