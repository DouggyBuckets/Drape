-- Contract step: every item must belong to a user.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM wardrobe_items WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'wardrobe_items has rows without an owner'
      USING HINT = 'Run: npm run create-user -- --email <you> --claim-unowned   (then migrate again)';
  END IF;
END $$;
ALTER TABLE wardrobe_items ALTER COLUMN user_id SET NOT NULL;
