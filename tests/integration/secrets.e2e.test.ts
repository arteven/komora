import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  runCli,
  assertOk,
  attachExec,
  freshBox,
  withTmpHome,
  type TmpHome,
} from "./helpers.js";

describe("secrets injection e2e", () => {
  let home: TmpHome;
  let manifestPath: string;

  beforeAll(async () => {
    home = withTmpHome();
    manifestPath = path.join(home.env.XDG_CONFIG_HOME, "komora", "box.yaml");

    const base = fs.readFileSync(
      path.resolve("tests/integration/fixtures/box.yaml"),
      "utf8",
    );
    // Inject a workload secret. The keychain lives under tmp HOME so it can't collide with the user's real config.
    const withSecret = `${base.trimEnd()}\nsecrets:\n  workload:\n    - { name: TESTKEY, domain: test.local }\n`;
    fs.writeFileSync(manifestPath, withSecret, "utf8");

    const setRes = await runCli(
      ["secret", "set", "TESTKEY", "--value", "value123"],
      home.env,
    );
    assertOk(setRes, "secret set TESTKEY");

    await freshBox(home.env, manifestPath);
  });

  afterAll(async () => {
    try {
      await runCli(["-m", manifestPath, "destroy"], home.env);
    } catch {
      /* best-effort */
    }
    home.cleanup();
  });

  it("secret set → rebuild → workload env contains the secret", async () => {
    const out = await attachExec(home.env, manifestPath, "env");
    expect(out).toMatch(/^MSB_TESTKEY=value123$/m);
  });

  it("secret rm removes the secret from the keychain", async () => {
    const rm = await runCli(["secret", "rm", "TESTKEY"], home.env);
    assertOk(rm, "secret rm TESTKEY");

    const list = await runCli(["secret", "list"], home.env);
    assertOk(list, "secret list");
    expect(list.stdout.trim()).toBe("");
  });
});
