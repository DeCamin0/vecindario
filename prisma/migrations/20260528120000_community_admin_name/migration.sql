-- Nombre opcional del administrador de comunidad / empresa de gestión (junto a community_admin_email).
ALTER TABLE `communities`
  ADD COLUMN `community_admin_name` VARCHAR(255) NULL AFTER `community_admin_email`;
