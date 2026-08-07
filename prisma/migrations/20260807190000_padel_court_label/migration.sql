-- Nombre mostrado en la app para las pistas tipo pádel (ej. "Pista de squash"). NULL = "Pista de pádel".
ALTER TABLE `communities` ADD COLUMN `padel_court_label` VARCHAR(128) NULL;
