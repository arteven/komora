import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setSecret, listSecrets, removeSecret, getSecret } from "../../src/secrets/store.js";

describe("secrets store", () => {
  let configHome: string;

  beforeEach(async () => {
    configHome = await fs.mkdtemp(path.join(os.tmpdir(), "komora-sec-"));
    process.env.XDG_CONFIG_HOME = configHome;
  });

  afterEach(async () => {
    delete process.env.XDG_CONFIG_HOME;
    await fs.rm(configHome, { recursive: true, force: true });
  });

  it("set+list+get roundtrips", async () => {
    await setSecret("A", "alpha");
    await setSecret("B", "beta");
    expect((await listSecrets()).sort()).toEqual(["A", "B"]);
    expect(await getSecret("A")).toBe("alpha");
  });

  it("rm removes a secret", async () => {
    await setSecret("A", "alpha");
    await removeSecret("A");
    expect(await listSecrets()).toEqual([]);
    expect(await getSecret("A")).toBeUndefined();
  });

  it("creates secrets.json with mode 0600", async () => {
    await setSecret("A", "alpha");
    const stat = await fs.stat(path.join(configHome, "komora", "secrets.json"));
    expect((stat.mode & 0o777)).toBe(0o600);
  });

  it("creates configDir with mode 0700 when missing", async () => {
    await setSecret("A", "alpha");
    const stat = await fs.stat(path.join(configHome, "komora"));
    expect((stat.mode & 0o777)).toBe(0o700);
  });

  it("returns empty list when file does not exist", async () => {
    expect(await listSecrets()).toEqual([]);
  });

  it("rejects an empty name", async () => {
    await expect(setSecret("", "x")).rejects.toThrow();
  });
});
