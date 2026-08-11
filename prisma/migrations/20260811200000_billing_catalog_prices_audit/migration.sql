-- B7.2 — Catálogo precios por usageMode + auditoría de catálogo
-- 100% ADITIVO: CREATE TABLE + INSERT backfill + INDEX.
-- NO DROP / MODIFY destructivo / recrear tablas.
-- NO UPDATE/DELETE sobre community_billing / community_billing_lines / community_billing_audits.

CREATE TABLE `billing_catalog_plan_prices` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `plan_code` VARCHAR(64) NOT NULL,
  `usage_mode` VARCHAR(32) NOT NULL,
  `monthly_price_eur` DECIMAL(10, 2) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `bcpp_plan_mode_uidx`(`plan_code`, `usage_mode`),
  INDEX `bcpp_usage_mode_idx`(`usage_mode`),
  CONSTRAINT `billing_catalog_plan_prices_plan_code_fkey`
    FOREIGN KEY (`plan_code`) REFERENCES `billing_catalog_plans`(`code`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `billing_catalog_audits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `actor_user_id` INTEGER NOT NULL,
  `actor_email` VARCHAR(255) NOT NULL,
  `entity_type` VARCHAR(32) NOT NULL,
  `entity_code` VARCHAR(64) NOT NULL,
  `usage_mode` VARCHAR(32) NULL,
  `field` VARCHAR(64) NOT NULL,
  `before_value` VARCHAR(32) NOT NULL,
  `after_value` VARCHAR(32) NOT NULL,
  `batch_id` VARCHAR(36) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `bca_created_idx`(`created_at`),
  INDEX `bca_entity_idx`(`entity_code`),
  INDEX `bca_batch_idx`(`batch_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Backfill precios comerciales B7.1 (solo INSERT; no toca contratos).
INSERT INTO `billing_catalog_plan_prices` (`plan_code`, `usage_mode`, `monthly_price_eur`, `updated_at`)
VALUES
  ('a_medida', 'neighbors_and_staff', 24.00, CURRENT_TIMESTAMP(3)),
  ('a_medida', 'staff_only', 16.00, CURRENT_TIMESTAMP(3)),
  ('comunidad', 'neighbors_and_staff', 44.00, CURRENT_TIMESTAMP(3)),
  ('conserjeria', 'neighbors_and_staff', 46.00, CURRENT_TIMESTAMP(3)),
  ('conserjeria', 'staff_only', 39.00, CURRENT_TIMESTAMP(3)),
  ('completo', 'neighbors_and_staff', 69.00, CURRENT_TIMESTAMP(3));
