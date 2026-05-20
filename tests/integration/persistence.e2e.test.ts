import { describe, it, expect, beforeAll } from "vitest";
import path from "node:path";
import { runCli, assertOk, attachExec, freshBox } from "./helpers.js";

const MANIFEST = path.resolve("tests/integration/fixtures/box.yaml");

describe("personal-layer persistence e2e", () => {
  beforeAll(async () => {
    await freshBox(process.env, MANIFEST);
  });

  it("file written under /home/komora/.local survives destroy + rebuild", async () => {
    const marker = `marker-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const writeOut = await attachExec(
      process.env,
      MANIFEST,
      `echo ${marker} > /home/komora/.local/marker && cat /home/komora/.local/marker`,
    );
    expect(writeOut.trim()).toBe(marker);

    const destroy = await runCli(["-m", MANIFEST, "destroy"]);
    assertOk(destroy, "destroy");

    const rebuild = await runCli(["-m", MANIFEST, "rebuild"]);
    assertOk(rebuild, "rebuild");

    const readOut = await attachExec(
      process.env,
      MANIFEST,
      "cat /home/komora/.local/marker",
    );
    expect(readOut.trim()).toBe(marker);
  });
});
