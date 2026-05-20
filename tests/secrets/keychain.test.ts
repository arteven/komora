import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setSecret, getSecret, listSecrets, removeSecret } from "../../src/secrets/keychain.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-kc-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("keychain (file store)", () => {
  it("setSecret/getSecret round-trips", async () => {
    await setSecret("ANTHROPIC_API_KEY", "sk-abc");
    expect(await getSecret("ANTHROPIC_API_KEY")).toBe("sk-abc");
  });

  it("getSecret returns undefined for unknown name", async () => {
    expect(await getSecret("MISSING")).toBeUndefined();
  });

  it("listSecrets returns names only", async () => {
    await setSecret("A", "1");
    await setSecret("B", "2");
    expect((await listSecrets()).sort()).toEqual(["A", "B"]);
  });

  it("removeSecret deletes a key", async () => {
    await setSecret("X", "1");
    await removeSecret("X");
    expect(await getSecret("X")).toBeUndefined();
  });

  it("writes the store file with mode 0600", async () => {
    await setSecret("X", "1");
    const file = path.join(tmp, ".config", "komora", "secrets.json");
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });

  it("tolerates a missing store file on read", async () => {
    expect(await listSecrets()).toEqual([]);
  });
});
