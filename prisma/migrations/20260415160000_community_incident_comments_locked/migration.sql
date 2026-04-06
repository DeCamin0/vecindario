-- Conserje puede cerrar comentarios en una incidencia (vecinos dejan de poder publicar).
ALTER TABLE `community_incidents`
ADD COLUMN `comments_locked` BOOLEAN NOT NULL DEFAULT false;
