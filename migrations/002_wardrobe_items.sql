-- Allowed values mirror src/extraction/rubric.ts. Zod validates in the app;
-- these CHECKs keep the table honest if anything else ever writes to it.
CREATE TABLE wardrobe_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  category         text NOT NULL CHECK (category IN ('top','bottom','outerwear','shoes','dress','accessory')),
  color            text NOT NULL CHECK (color IN ('black','white','gray','navy','blue','brown','beige',
                                                  'green','red','pink','purple','yellow','orange','multi')),
  formality        smallint NOT NULL CHECK (formality BETWEEN 1 AND 5),
  warmth           smallint NOT NULL CHECK (warmth BETWEEN 1 AND 5),
  seasons          text[] NOT NULL CHECK (cardinality(seasons) > 0
                                          AND seasons <@ ARRAY['spring','summer','fall','winter']),
  image_path       text NOT NULL,
  -- Provenance: which model produced the attributes, and its original output + token usage,
  -- kept even if the columns above are later corrected by hand.
  extraction_model text NOT NULL,
  extraction       jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX wardrobe_items_category_idx ON wardrobe_items (category);
