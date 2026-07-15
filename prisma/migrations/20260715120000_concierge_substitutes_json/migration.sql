-- Suplentes múltiples + titulares sin límite fijo de 5 (JSON con active opcional).
ALTER TABLE `communities`
  ADD COLUMN `concierge_substitutes_json` JSON NOT NULL DEFAULT ('[]') AFTER `concierge_substitute_name`;

-- Migrar suplente legacy único al array.
UPDATE `communities`
SET `concierge_substitutes_json` = JSON_ARRAY(
  JSON_OBJECT(
    'email', TRIM(`concierge_substitute_email`),
    'name', IF(
      `concierge_substitute_name` IS NOT NULL AND TRIM(`concierge_substitute_name`) != '',
      TRIM(`concierge_substitute_name`),
      NULL
    )
  )
)
WHERE `concierge_substitute_email` IS NOT NULL
  AND TRIM(`concierge_substitute_email`) != '';
