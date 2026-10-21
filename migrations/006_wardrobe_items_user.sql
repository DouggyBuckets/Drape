-- Expand step: each item belongs to a user. Existing rows are claimed by
-- `npm run create-user -- --claim-unowned`; 007 then makes the column required.
ALTER TABLE wardrobe_items ADD COLUMN user_id uuid REFERENCES users (id) ON DELETE CASCADE;
CREATE INDEX wardrobe_items_user_category_idx ON wardrobe_items (user_id, category);
