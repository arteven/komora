import { describe, it, expect } from "vitest";
import { resolveSecretArgs } from "../../src/secrets/policy.js";
import type { Profile } from "../../src/config/types.js";

const profile = (allowed: NonNullable<Profile["secrets"]>["allowed"]): Profile => ({
  name: "p", image: "i:t", secrets: { allowed },
});

describe("resolveSecretArgs", () => {
  it("emits NAME=VALUE@HOST when hosts are listed", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T", hosts: ["a.com", "b.com"] }]),
      values: { T: "v" },
    });
    expect(args).toEqual(["--secret", "T=v@a.com", "--secret", "T=v@b.com"]);
  });

  it("emits NAME=VALUE with no host suffix when hosts is empty/absent", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: { T: "v" },
    });
    expect(args).toEqual(["--secret", "T=v"]);
  });

  it("skips secrets that are allowed but have no stored value", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: {},
    });
    expect(args).toEqual([]);
  });

  it("ignores stored values not in the allowed list", () => {
    const args = resolveSecretArgs({
      profile: profile([{ name: "T" }]),
      values: { T: "v", OTHER: "leaked" },
    });
    expect(args).toEqual(["--secret", "T=v"]);
  });
});
