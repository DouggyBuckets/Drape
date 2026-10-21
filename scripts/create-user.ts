// Creates (or updates) an account from the command line.
// Usage: npm run create-user -- --email you@example.com [--demo] [--claim-unowned]
//   --demo           mark this account as the shared, read-only demo wardrobe
//   --claim-unowned  assign every item without an owner to this account (migration 006 → 007)
// The password is prompted for (hidden), or read from DRAPE_PASSWORD for non-interactive use.
import { parseArgs } from "node:util";
import { createUser } from "../src/auth/users.js";
import { pool } from "../src/db/pool.js";

const { values: args } = parseArgs({
  options: { email: { type: "string" }, demo: { type: "boolean" }, "claim-unowned": { type: "boolean" } },
});

function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error("No terminal to prompt in; set DRAPE_PASSWORD instead.");
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  return new Promise((resolve, reject) => {
    let input = "";
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(input);
        }
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          return reject(new Error("Cancelled"));
        }
        input = ch === "\u007f" ? input.slice(0, -1) : input + ch;
      }
    };
    stdin.on("data", onData);
  });
}

try {
  if (!args.email) throw new Error("--email is required");
  const existing = await pool.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [args.email]);
  let userId = existing.rows[0]?.id;

  if (userId) {
    console.log(`User ${args.email} already exists; not changing the password.`);
  } else {
    const password = process.env.DRAPE_PASSWORD ?? (await promptHidden("Password (min 10 characters): "));
    if (password.length < 10) throw new Error("Password must be at least 10 characters.");
    if (!process.env.DRAPE_PASSWORD && password !== (await promptHidden("Repeat password: "))) {
      throw new Error("Passwords didn't match.");
    }
    userId = (await createUser(pool, args.email, password)).id;
    console.log(`Created ${args.email}.`);
  }

  if (args.demo) {
    await pool.query("UPDATE users SET is_demo = (id = $1) WHERE is_demo OR id = $1", [userId]);
    console.log("Marked as the demo account.");
  }
  if (args["claim-unowned"]) {
    const { rowCount } = await pool.query("UPDATE wardrobe_items SET user_id = $1 WHERE user_id IS NULL", [userId]);
    console.log(`Claimed ${rowCount} unowned items. Now run: npm run migrate`);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
