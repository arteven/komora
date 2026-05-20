import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadBox } from "../../src/box/index.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-loadbox-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("loadBox", () => {
  it("reads from default manifest path", async () => {
    const dir = path.join(tmp, ".config", "komora");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "box.yaml"),
      `version: 1\nimage: { base: debian:12-slim }\nbox: { name: komora-box, personalLayer: { volume: { name: pl, mount: /home/k/.local } } }\n`,
    );
    const r = await loadBox();
    expect(r.box.name).toBe("komora-box");
    expect(r.image.toolchains).toEqual([]);
  });

  it("accepts an explicit path override", async () => {
    const p = path.join(tmp, "elsewhere.yaml");
    writeFileSync(
      p,
      `version: 1\nimage: { base: debian:12-slim }\nbox: { name: kb2, personalLayer: { volume: { name: pl, mount: /x } } }\n`,
    );
    const r = await loadBox(p);
    expect(r.box.name).toBe("kb2");
  });
});
