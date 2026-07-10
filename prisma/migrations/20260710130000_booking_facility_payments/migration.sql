ALTER TABLE `community_bookings`
  ADD COLUMN `usage_fee_paid` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `deposit_paid` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `deposit_returned_at` DATETIME(3) NULL,
  ADD COLUMN `deposit_returned_by_user_id` INTEGER NULL,
  ADD COLUMN `deposit_returned_by_name` VARCHAR(255) NULL;
