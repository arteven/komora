import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

const e2e = process.env.KOMORA_E2E === "1";
const itE2E = e2e ? it : it.skip;

describe("e2e: komora run", () => {
  itE2E("creates, runs `echo hi`, and exits with the agent's exit code", { timeout: 180_000 }, async () => {
    const work = await fs.mkdtemp(path.join(os.tmpdir(), "komora-e2e-"));
    await fs.writeFile(path.join(work, "komora.config.yaml"), "agent: sh\nprofile: nodejs\n");

    const r = await execa("npx", ["tsx", path.resolve("src/cli.ts"), "run", "sh", "--", "-c", "echo hi"], {
      cwd: work, reject: false,
    });
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain("hi");

    await execa("npx", ["tsx", path.resolve("src/cli.ts"), "rm", `${path.basename(work)}-sh-nodejs`], {
      cwd: work, reject: false,
    });
    await fs.rm(work, { recursive: true, force: true });
  });
});
