-- Pádel: máx. horas por reserva / vivienda-día con paso 0,5 (1 · 1,5 · 2 …)
ALTER TABLE `communities`
  MODIFY COLUMN `padel_max_hours_per_booking` DECIMAL(4, 1) NOT NULL DEFAULT 2.0,
  MODIFY COLUMN `padel_max_hours_apartment_day` DECIMAL(4, 1) NOT NULL DEFAULT 4.0;
