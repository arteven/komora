import { describe, it, expect, beforeEach } from "vitest";
import { writeFileSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadManifest } from "../../src/box/load.js";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), "komora-load-"));
});

describe("loadManifest", () => {
  it("loads and parses a YAML file", async () => {
    const p = path.join(tmp, "box.yaml");
    writeFileSync(p, `version: 1\nimage: { base: debian:12-slim }\nbox: { name: komora-box, personalLayer: { volume: { name: pl, mount: /x } } }\n`);
    const m = await loadManifest(p);
    expect(m.box.name).toBe("komora-box");
  });

  it("throws when file is missing", async () => {
    await expect(loadManifest(path.join(tmp, "absent.yaml"))).rejects.toThrow(/not found/);
  });

  it("throws when YAML is malformed", async () => {
    const p = path.join(tmp, "bad.yaml");
    writeFileSync(p, "key: [\n  unclosed bracket\n");
    await expect(loadManifest(p)).rejects.toThrow(/parse/i);
  });

  it("throws when schema validation fails", async () => {
    const p = path.join(tmp, "schema-bad.yaml");
    writeFileSync(p, `version: 1\nbox: { name: x }\n`);
    await expect(loadManifest(p)).rejects.toThrow(/invalid box.yaml/);
  });
});
