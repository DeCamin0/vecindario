-- B5.1 / B6-PREP — usage_mode en community_billing
-- 100% ADITIVO: solo ADD COLUMN + INDEX.
-- NO DROP / MODIFY destructivo / recrear tablas / UPDATE masivo.
-- Filas existentes (si hubiera): reciben DEFAULT 'neighbors_and_staff' al añadir NOT NULL DEFAULT.
-- community_billing actual esperado: 0 filas → sin impacto de datos.

ALTER TABLE `community_billing`
  ADD COLUMN `usage_mode` VARCHAR(32) NOT NULL DEFAULT 'neighbors_and_staff';

CREATE INDEX `cbill_usage_mode_idx` ON `community_billing`(`usage_mode`);
