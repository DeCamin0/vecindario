-- Segunda franja opcional de horario pádel (ej. 10:00–15:00 y 17:00–22:00).
ALTER TABLE `communities` ADD COLUMN `padel_open_time_2` VARCHAR(5) NULL;
ALTER TABLE `communities` ADD COLUMN `padel_close_time_2` VARCHAR(5) NULL;
