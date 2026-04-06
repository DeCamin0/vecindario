-- Rol conserje + email opcional en comunidad
ALTER TABLE `vecindario_users`
  MODIFY COLUMN `role` ENUM('resident', 'community_admin', 'president', 'super_admin', 'concierge') NOT NULL DEFAULT 'resident';

ALTER TABLE `communities`
  ADD COLUMN `concierge_email` VARCHAR(255) NULL;
