-- Optional link from in-app notification to concierge parcel (e.g. paqueteria_new).
ALTER TABLE `vecindario_notifications`
  ADD COLUMN `parcel_id` INTEGER NULL;
