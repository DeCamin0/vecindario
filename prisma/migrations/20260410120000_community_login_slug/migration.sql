-- Enlace público por comunidad: /vecindario/c/{slug}/login
ALTER TABLE `communities`
  ADD COLUMN `login_slug` VARCHAR(80) NULL;

CREATE UNIQUE INDEX `communities_login_slug_key` ON `communities` (`login_slug`);
