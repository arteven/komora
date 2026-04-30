import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { profileSchema } from "../../src/config/profile-schema.js";
import { repoConfigSchema } from "../../src/config/schema.js";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

describe("profileSchema", () => {
  const validate = ajv.compile(profileSchema);

  it("accepts a minimal valid profile", () => {
    expect(validate({ name: "n", image: "img:tag" })).toBe(true);
  });

  it("rejects a profile missing image", () => {
    expect(validate({ name: "n" })).toBe(false);
  });

  it("rejects an unknown top-level field", () => {
    expect(validate({ name: "n", image: "i", bogus: 1 })).toBe(false);
  });

  it("accepts secrets.allowed entries with hosts and requireTls", () => {
    expect(validate({
      name: "n",
      image: "i",
      secrets: { allowed: [{ name: "X", hosts: ["a"], requireTls: true }] },
    })).toBe(true);
  });
});

describe("repoConfigSchema", () => {
  const validate = ajv.compile(repoConfigSchema);

  it("accepts a minimal valid config", () => {
    expect(validate({ agent: "claude", profile: "nodejs" })).toBe(true);
  });

  it("rejects without agent", () => {
    expect(validate({ profile: "nodejs" })).toBe(false);
  });

  it("allows raw passthrough as an object", () => {
    expect(validate({ agent: "claude", profile: "nodejs", raw: { cpus: 4 } })).toBe(true);
  });

  it("rejects raw as a non-object", () => {
    expect(validate({ agent: "claude", profile: "nodejs", raw: "x" })).toBe(false);
  });
});
