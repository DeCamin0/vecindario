-- Junta: vicepresidente y vocales por vivienda (portal + piso). Presidente sigue en president_portal/president_piso.
ALTER TABLE `communities`
  ADD COLUMN `board_vice_portal` VARCHAR(64) NULL,
  ADD COLUMN `board_vice_piso` VARCHAR(64) NULL,
  ADD COLUMN `board_vocals_json` JSON NULL;
