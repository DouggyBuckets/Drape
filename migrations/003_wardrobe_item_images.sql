-- Expand step: store the normalized JPEG in the row instead of on local disk
-- (hosting platforms usually have ephemeral disks). image_path stays until backfilled.
ALTER TABLE wardrobe_items ADD COLUMN image bytea;
ALTER TABLE wardrobe_items ALTER COLUMN image_path DROP NOT NULL;
