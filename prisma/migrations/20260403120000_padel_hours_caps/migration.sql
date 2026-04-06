-- Límites de pádel por reserva y por vivienda/día (configurables en Super Admin)
ALTER TABLE `communities`
  ADD COLUMN `padel_max_hours_per_booking` INT NOT NULL DEFAULT 2,
  ADD COLUMN `padel_max_hours_apartment_day` INT NOT NULL DEFAULT 4;
