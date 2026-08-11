-- T1 — Tramos configurables por tamaño (catálogo).
-- 100% ADITIVO: CREATE TABLE only.
-- NO DROP / MODIFY / recrear tablas.
-- NO INSERT/UPDATE/DELETE sobre community_billing / community_billing_lines / community_billing_audits.
-- Defaults de tramos: solo vía seed (si tabla vacía). No sobrescribe ediciones Super Admin.

CREATE TABLE `billing_catalog_size_tiers` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `from_units` INTEGER NOT NULL,
  `to_units` INTEGER NULL,
  `surcharge_eur` DECIMAL(10, 2) NOT NULL,
  `sort_order` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `bcst_from_uidx`(`from_units`),
  INDEX `bcst_sort_idx`(`sort_order`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
