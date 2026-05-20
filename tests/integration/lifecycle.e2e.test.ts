import { describe, it, expect, beforeEach } from "vitest";
import path from "node:path";
import { runCli, assertOk, freshBox } from "./helpers.js";

const MANIFEST = path.resolve("tests/integration/fixtures/box.yaml");

describe("lifecycle e2e", () => {
  beforeEach(async () => {
    await freshBox(process.env, MANIFEST);
  });

  it("transitions through running → stopped → running → paused → running → destroyed", async () => {
    let status = await runCli(["-m", MANIFEST, "status"]);
    assertOk(status, "status (initial)");
    expect(status.stdout).toMatch(/running/);

    const down = await runCli(["-m", MANIFEST, "down"]);
    assertOk(down, "down");
    status = await runCli(["-m", MANIFEST, "status"]);
    assertOk(status, "status (after down)");
    expect(status.stdout).toMatch(/stopped/);

    const up = await runCli(["-m", MANIFEST, "up"]);
    assertOk(up, "up");
    status = await runCli(["-m", MANIFEST, "status"]);
    assertOk(status, "status (after up)");
    expect(status.stdout).toMatch(/running/);

    const pause = await runCli(["-m", MANIFEST, "pause"]);
    assertOk(pause, "pause");

    const resume = await runCli(["-m", MANIFEST, "resume"]);
    assertOk(resume, "resume");
    status = await runCli(["-m", MANIFEST, "status"]);
    assertOk(status, "status (after resume)");
    expect(status.stdout).toMatch(/running/);

    const destroy = await runCli(["-m", MANIFEST, "destroy"]);
    assertOk(destroy, "destroy");
  });
});
