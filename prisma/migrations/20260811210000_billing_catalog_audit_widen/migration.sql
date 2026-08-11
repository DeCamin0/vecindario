-- B7.3 — Ampliar before/after de billing_catalog_audits para auditar includesJson.
-- ADITIVO: solo MODIFY longitud de columnas de texto de auditoría.
-- NO toca community_billing* / Community / flags.

ALTER TABLE `billing_catalog_audits`
  MODIFY `before_value` VARCHAR(512) NOT NULL,
  MODIFY `after_value` VARCHAR(512) NOT NULL;
