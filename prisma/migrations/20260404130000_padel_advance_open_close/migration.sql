-- Antelación mínima (horas antes del tramo) y horario de apertura/cierre del pádel
ALTER TABLE `communities`
  ADD COLUMN `padel_min_advance_hours` INT NOT NULL DEFAULT 24,
  ADD COLUMN `padel_open_time` VARCHAR(5) NOT NULL DEFAULT '08:00',
  ADD COLUMN `padel_close_time` VARCHAR(5) NOT NULL DEFAULT '22:00';
