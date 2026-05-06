import { describe, it, expect } from "vitest";
import { execa } from "execa";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

const SKIP = !process.env.KOMORA_E2E;
const CLI = path.resolve("src/cli.ts");

describe.skipIf(SKIP)("e2e: komora run shell", { timeout: 180_000 }, () => {
  let tmpDir: string;

  it("boots shell sandbox, runs command, exits 0", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "komora-e2e-"));

    const result = await execa("npx", ["tsx", CLI, "run", "shell", "--", "-c", "echo hello-from-sandbox"], {
      cwd: tmpDir,
      timeout: 120_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello-from-sandbox");
  });

  it("--dry-run prints config without booting", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "komora-e2e-"));

    const result = await execa("npx", ["tsx", CLI, "run", "shell", "--dry-run"], {
      cwd: tmpDir,
      timeout: 10_000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("shell-docker");
    expect(result.stdout).toContain("sandboxName");
  });
});
