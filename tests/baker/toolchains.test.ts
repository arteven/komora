import { describe, it, expect } from "vitest";
import { toolchainScript } from "../../src/baker/toolchains.js";

describe("toolchainScript", () => {
  it("emits a script that installs node at a specific version", () => {
    const s = toolchainScript({ node: "22" });
    expect(s).toMatch(/node/);
    expect(s).toMatch(/22/);
  });

  it("emits a script that installs python at a specific version", () => {
    expect(toolchainScript({ python: "3.12" })).toMatch(/python/i);
  });

  it("throws on unknown toolchain", () => {
    expect(() => toolchainScript({ kotlin: "1.0" })).toThrow(/unknown toolchain: kotlin/);
  });
});
