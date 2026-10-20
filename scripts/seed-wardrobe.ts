// Seeds the hand-written fixture wardrobe (eval/fixtures/wardrobe.json).
// Usage: npm run seed            (replace fixtures)
//        npm run seed -- --reset (remove fixtures only)
import { pool } from "../src/db/pool.js";
import { removeFixtures, seedFixtures } from "../src/items/fixtures.js";

try {
  if (process.argv.includes("--reset")) {
    console.log(`Removed ${await removeFixtures(pool)} fixture items.`);
  } else {
    console.log(`Seeded ${await seedFixtures(pool)} fixture items (previous fixtures replaced; real items untouched).`);
  }
} finally {
  await pool.end();
}
