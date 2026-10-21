-- Contract step: images now live in wardrobe_items.image (backfilled after 003).
ALTER TABLE wardrobe_items DROP COLUMN image_path;
