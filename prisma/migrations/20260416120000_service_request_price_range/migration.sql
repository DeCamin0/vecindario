-- Rango opcional de presupuesto (mínimo en price_amount, máximo en price_amount_max).
ALTER TABLE `community_service_requests`
  ADD COLUMN `price_amount_max` DECIMAL(12, 2) NULL AFTER `price_amount`;
