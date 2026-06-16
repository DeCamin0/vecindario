-- AlterTable
ALTER TABLE `community_concierge_parcels`
  ADD COLUMN `delivery_kind` VARCHAR(16) NOT NULL DEFAULT 'courier',
  ADD COLUMN `item_description` VARCHAR(255) NULL;
