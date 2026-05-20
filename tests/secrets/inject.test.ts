import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectWorkloadValues, missingWorkload, buildSecretEnvArgs } from "../../src/secrets/inject.js";
import { setSecret } from "../../src/secrets/keychain.js";
import type { WorkloadSecret } from "../../src/box/types.js";

beforeEach(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), "komora-inj-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("inject", () => {
  it("collectWorkloadValues returns only keys present in keychain", async () => {
    await setSecret("PRESENT", "sk-abc");
    const w: WorkloadSecret[] = [
      { name: "PRESENT", domain: "api.foo.com" },
      { name: "ABSENT", domain: "api.bar.com" },
    ];
    expect(await collectWorkloadValues(w)).toEqual({ PRESENT: { value: "sk-abc", domain: "api.foo.com" } });
  });

  it("missingWorkload returns names not in keychain", async () => {
    await setSecret("PRESENT", "x");
    const w: WorkloadSecret[] = [
      { name: "PRESENT", domain: "a" },
      { name: "ABSENT", domain: "b" },
    ];
    expect(await missingWorkload(w)).toEqual(["ABSENT"]);
  });

  it("buildSecretEnvArgs produces NAME=VALUE@HOST tuples", () => {
    const got = buildSecretEnvArgs({
      A: { value: "1", domain: "api.a.com" },
      B: { value: "2", domain: "api.b.com" },
    });
    expect(got).toEqual([
      "--secret", "A=1@api.a.com",
      "--secret", "B=2@api.b.com",
    ]);
  });
});
