import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseProfile } from "../../src/config/load.js";

const builtinDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src", "profiles", "builtin");

describe("built-in profiles", () => {
  it("nodejs is valid against the schema", async () => {
    const yaml = await fs.readFile(path.join(builtinDir, "nodejs.yaml"), "utf8");
    const p = parseProfile(yaml);
    expect(p.name).toBe("nodejs");
    expect(p.image).toContain("node");
  });

  it("python is valid against the schema", async () => {
    const yaml = await fs.readFile(path.join(builtinDir, "python.yaml"), "utf8");
    const p = parseProfile(yaml);
    expect(p.name).toBe("python");
    expect(p.image).toContain("python");
  });
});
