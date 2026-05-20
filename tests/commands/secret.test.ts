import { describe, it, expect, vi, beforeEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setCmd, listCmd, rmCmd } from "../../src/commands/secret.js";
import { getSecret } from "../../src/secrets/keychain.js";

beforeEach(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), "komora-sec-cmd-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = path.join(tmp, ".config");
});

describe("secret commands", () => {
  it("setCmd writes a secret given a value", async () => {
    await setCmd("FOO", { value: "bar" });
    expect(await getSecret("FOO")).toBe("bar");
  });

  it("listCmd prints names line-by-line", async () => {
    await setCmd("A", { value: "1" });
    await setCmd("B", { value: "2" });
    const lines: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    (process.stdout as any).write = (s: string) => { lines.push(s); return true; };
    try { await listCmd(); } finally { (process.stdout as any).write = orig; }
    expect(lines.join("")).toMatch(/A\nB/);
  });

  it("rmCmd removes a secret", async () => {
    await setCmd("X", { value: "1" });
    await rmCmd("X");
    expect(await getSecret("X")).toBeUndefined();
  });
});
