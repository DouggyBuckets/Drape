import { describe, expect, it } from "vitest";
import { EnvError, parseEnv } from "./env.js";

const valid = {
  DATABASE_URL: "postgres://drape:drape@localhost:5433/drape",
  ANTHROPIC_API_KEY: "sk-ant-test",
};

describe("parseEnv", () => {
  it("applies defaults for optional values", () => {
    expect(parseEnv(valid)).toMatchObject({ NODE_ENV: "development", PORT: 3000 });
  });

  it("lists every missing required value", () => {
    expect(() => parseEnv({})).toThrow(EnvError);
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*ANTHROPIC_API_KEY/);
  });

  it("rejects a non-Postgres DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: "mysql://x/y" })).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-numeric PORT", () => {
    expect(() => parseEnv({ ...valid, PORT: "abc" })).toThrow(/PORT/);
  });
});
