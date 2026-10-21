import pg from "pg";

/** Creates the database named in `url` if needed (via the server's `postgres` maintenance DB). */
export async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.slice(1));
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Refusing to create database with unusual name: ${name}`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.href });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [name]);
    if (!rowCount) await client.query(`CREATE DATABASE ${name}`); // name validated above; identifiers can't be bound
  } finally {
    await client.end();
  }
}

/** Points DATABASE_URL at a sibling database on the same server (e.g. drape → drape_eval). */
export function siblingDatabaseUrl(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.href;
}
