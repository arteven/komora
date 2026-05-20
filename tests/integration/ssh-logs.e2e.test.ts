import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runCli, assertOk, freshBox } from "./helpers.js";

describe("ssh and logs e2e", () => {
  const manifest = process.env.KOMORA_E2E_SSH_MANIFEST;

  beforeAll(async () => {
    if (!manifest) {
      throw new Error(
        "globalSetup did not populate KOMORA_E2E_SSH_MANIFEST",
      );
    }
    await freshBox(process.env, manifest);
  });

  afterAll(async () => {
    try {
      if (manifest) await runCli(["-m", manifest, "destroy"]);
    } catch {
      /* best-effort */
    }
  });

  it.skip("komora ssh -- echo ok returns 0 with 'ok' on stdout", async () => {
    // TODO: sshCmd uses stdio:inherit and has no passthrough argv.
    // Wire this up once sshCmd accepts a cmd[] argument similar to attachCmd.
  });

  it("komora logs returns non-empty output", async () => {
    const res = await runCli(["-m", manifest!, "logs"]);
    assertOk(res, "logs");
    expect(res.stdout.length + res.stderr.length).toBeGreaterThan(0);
  });
});
