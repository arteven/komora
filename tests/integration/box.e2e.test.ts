import { describe, it, expect } from "vitest";
import path from "node:path";
import { spawn } from "node:child_process";

const E2E = process.env.KOMORA_E2E === "1";

function run(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const c = spawn("node", ["dist/cli.js", ...args], { env: process.env });
    let out = "", err = "";
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (err += d));
    c.on("exit", (code) => resolve({ code: code ?? 1, stdout: out, stderr: err }));
  });
}

describe.skipIf(!E2E)("box e2e", () => {
  const manifest = path.resolve("tests/integration/fixtures/box.yaml");

  it("bake → rebuild → status → destroy", async () => {
    const bakeRes = await run(["bake", "-m", manifest]);
    expect(bakeRes.code).toBe(0);
    const rebuildRes = await run(["rebuild", "-m", manifest]);
    expect(rebuildRes.code).toBe(0);
    const statusRes = await run(["status", "-m", manifest]);
    expect(statusRes.stdout).toMatch(/running/);
    const destroyRes = await run(["destroy", "-m", manifest]);
    expect(destroyRes.code).toBe(0);
  }, 1_200_000);
});
