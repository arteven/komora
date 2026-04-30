import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withSandboxLock } from "../../src/sandbox/lock.js";

describe("withSandboxLock", () => {
  let stateHome: string;

  beforeEach(async () => {
    stateHome = await fs.mkdtemp(path.join(os.tmpdir(), "komora-lk-"));
    process.env.XDG_STATE_HOME = stateHome;
  });

  afterEach(async () => {
    delete process.env.XDG_STATE_HOME;
    await fs.rm(stateHome, { recursive: true, force: true });
  });

  it("serializes concurrent withSandboxLock callers", async () => {
    const order: string[] = [];
    const slow = async (tag: string, ms: number) => {
      await withSandboxLock("foo-claude-nodejs", async () => {
        order.push(`${tag}:start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${tag}:end`);
      });
    };
    await Promise.all([slow("a", 60), slow("b", 10)]);
    // Whoever starts first must end before the other starts.
    // (Lock-acquisition order is non-deterministic, so we assert
    // non-interleaving rather than a fixed letter ordering.)
    const first = order[0]!.split(":")[0];
    const second = first === "a" ? "b" : "a";
    expect(order).toEqual([
      `${first}:start`, `${first}:end`, `${second}:start`, `${second}:end`,
    ]);
  });

  it("releases on thrown error", async () => {
    await expect(
      withSandboxLock("name", async () => { throw new Error("boom"); })
    ).rejects.toThrow("boom");
    // Second call should not block.
    await withSandboxLock("name", async () => undefined);
  });
});
