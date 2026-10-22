import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  ANTHROPIC_API_KEY: z.string().min(1),
  /** Number of reverse proxies in front of the app, so req.ip is the real client IP. */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Cost/abuse limits (rolling 24h). See src/limits/limits.ts.
  LIMIT_UPLOADS_PER_USER: z.coerce.number().int().positive().default(30),
  LIMIT_OUTFITS_PER_USER: z.coerce.number().int().positive().default(20),
  LIMIT_DEMO_OUTFITS_PER_IP: z.coerce.number().int().positive().default(5),
  LIMIT_DEMO_OUTFITS_TOTAL: z.coerce.number().int().positive().default(100),
  LIMIT_SIGNUPS_PER_IP: z.coerce.number().int().positive().default(5),
  DAILY_SPEND_CAP_USD: z.coerce.number().positive().default(5),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

/** Pure parser so it can be tested without touching process.env. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new EnvError(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}

function loadEnv(): Env {
  try {
    process.loadEnvFile(); // reads ./.env if present; real env vars take precedence
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  try {
    return parseEnv(process.env);
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const env = loadEnv();
