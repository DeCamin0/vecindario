-- B1 Plan y facturación — 100% ADITIVO
-- Solo CREATE TABLE + índices + FK desde tablas NUEVAS hacia communities / vecindario_users.
-- NO ALTER de communities ni de ninguna tabla existente.
-- NO UPDATE / DELETE de datos.
-- NO crea filas community_billing (comunidades existentes = Sin configurar).

-- ---------------------------------------------------------------------------
-- Catálogo de planes
-- ---------------------------------------------------------------------------
CREATE TABLE `billing_catalog_plans` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `monthly_price_eur` DECIMAL(10, 2) NOT NULL,
  `includes_json` JSON NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `billing_catalog_plans_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Catálogo de módulos
-- ---------------------------------------------------------------------------
CREATE TABLE `billing_catalog_modules` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `list_price_eur` DECIMAL(10, 2) NOT NULL,
  `flag_key` VARCHAR(64) NULL,
  `parent_code` VARCHAR(64) NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  UNIQUE INDEX `billing_catalog_modules_code_key`(`code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Contrato comercial por comunidad (0 filas al migrar)
-- ---------------------------------------------------------------------------
CREATE TABLE `community_billing` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `plan_code` VARCHAR(64) NOT NULL,
  `plan_name` VARCHAR(128) NOT NULL,
  `plan_list_price_eur` DECIMAL(10, 2) NOT NULL,
  `plan_charged_price_eur` DECIMAL(10, 2) NOT NULL,
  `commercial_status` VARCHAR(32) NOT NULL,
  `dwelling_count` INTEGER NULL,
  `dwelling_source` VARCHAR(32) NOT NULL DEFAULT 'unknown',
  `size_surcharge_eur` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `discount_eur` DECIMAL(10, 2) NOT NULL DEFAULT 0,
  `discount_note` VARCHAR(512) NULL,
  `negotiated_total_eur` DECIMAL(10, 2) NULL,
  `vat_rate_pct` DECIMAL(5, 2) NOT NULL DEFAULT 21.00,
  `currency` VARCHAR(3) NOT NULL DEFAULT 'EUR',
  `notes` TEXT NULL,
  `configured_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `configured_by_user_id` INTEGER NULL,
  `updated_at` DATETIME(3) NOT NULL,
  `updated_by_user_id` INTEGER NULL,

  UNIQUE INDEX `community_billing_community_id_key`(`community_id`),
  INDEX `cbill_status_idx`(`commercial_status`),
  INDEX `cbill_plan_idx`(`plan_code`),
  INDEX `cbill_configured_by_idx`(`configured_by_user_id`),
  INDEX `cbill_updated_by_idx`(`updated_by_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Líneas de módulos del contrato
-- ---------------------------------------------------------------------------
CREATE TABLE `community_billing_lines` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_billing_id` INTEGER NOT NULL,
  `module_code` VARCHAR(64) NOT NULL,
  `module_name` VARCHAR(128) NOT NULL,
  `included_in_plan` BOOLEAN NOT NULL DEFAULT false,
  `pricing_mode` VARCHAR(32) NOT NULL,
  `list_price_eur` DECIMAL(10, 2) NOT NULL,
  `charged_price_eur` DECIMAL(10, 2) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,

  UNIQUE INDEX `cbill_line_billing_module_uid`(`community_billing_id`, `module_code`),
  INDEX `cbill_line_module_idx`(`module_code`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Auditoría comercial
-- ---------------------------------------------------------------------------
CREATE TABLE `community_billing_audits` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `community_id` INTEGER NOT NULL,
  `actor_user_id` INTEGER NULL,
  `actor_email` VARCHAR(255) NULL,
  `action` VARCHAR(32) NOT NULL,
  `before_json` JSON NULL,
  `after_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `cbill_audit_comm_created_idx`(`community_id`, `created_at`),
  INDEX `cbill_audit_actor_idx`(`actor_user_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Foreign keys (solo desde tablas nuevas; no alteran columnas de tablas existentes)
-- ---------------------------------------------------------------------------
ALTER TABLE `community_billing`
  ADD CONSTRAINT `community_billing_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_billing`
  ADD CONSTRAINT `community_billing_configured_by_user_id_fkey`
    FOREIGN KEY (`configured_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `community_billing`
  ADD CONSTRAINT `community_billing_updated_by_user_id_fkey`
    FOREIGN KEY (`updated_by_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `community_billing_lines`
  ADD CONSTRAINT `community_billing_lines_community_billing_id_fkey`
    FOREIGN KEY (`community_billing_id`) REFERENCES `community_billing`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_billing_audits`
  ADD CONSTRAINT `community_billing_audits_community_id_fkey`
    FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `community_billing_audits`
  ADD CONSTRAINT `community_billing_audits_actor_user_id_fkey`
    FOREIGN KEY (`actor_user_id`) REFERENCES `vecindario_users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
