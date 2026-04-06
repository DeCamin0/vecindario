-- Vivienda del presidente (portal + piso); el presidente entra como vecino con esos datos.
ALTER TABLE `communities`
  ADD COLUMN `president_portal` VARCHAR(64) NULL,
  ADD COLUMN `president_piso` VARCHAR(64) NULL;
