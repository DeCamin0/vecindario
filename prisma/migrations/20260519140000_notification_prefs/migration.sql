ALTER TABLE `vecindario_users`
  ADD COLUMN `notify_web_push` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_mobile_push` TINYINT(1) NOT NULL DEFAULT 1,
  ADD COLUMN `notify_email` TINYINT(1) NOT NULL DEFAULT 1;
