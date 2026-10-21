// Seeds the hand-written fixture wardrobe (eval/fixtures/wardrobe.json) into one user's wardrobe.
// Usage: npm run seed                          (into fixtures@drape.local)
//        npm run seed -- --email you@x.com     (into your own account)
//        npm run seed -- --reset [--email ...] (remove that user's fixtures only)
import { parseArgs } from "node:util";
import { pool } from "../src/db/pool.js";
import { ensureUser, FIXTURE_USER_EMAIL, removeFixtures, seedFixtures } from "../src/items/fixtures.js";

const { values: args } = parseArgs({ options: { email: { type: "string" }, reset: { type: "boolean" } } });

try {
  const email = args.email ?? FIXTURE_USER_EMAIL;
  if (args.email) {
    const { rowCount } = await pool.query("SELECT 1 FROM users WHERE email = $1", [email]);
    if (!rowCount) throw new Error(`No user ${email}. Create it first: npm run create-user -- --email ${email}`);
  }
  const userId = await ensureUser(pool, email);
  if (args.reset) {
    console.log(`Removed ${await removeFixtures(pool, userId)} fixture items from ${email}.`);
  } else {
    console.log(`Seeded ${await seedFixtures(pool, userId)} fixture items into ${email} (real items untouched).`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
