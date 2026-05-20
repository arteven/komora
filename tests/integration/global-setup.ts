import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runCli, assertOk } from "./helpers.js";

const TMPL = path.resolve("tests/integration/fixtures/box-ssh.yaml.tmpl");
const BAKE_MANIFEST = path.resolve("tests/integration/fixtures/box.yaml");

export default async function setup(): Promise<() => Promise<void>> {
  if (process.env.KOMORA_E2E !== "1") {
    return async () => {};
  }

  const probe = spawnSync("msb", ["--version"], { stdio: "ignore" });
  if (probe.status !== 0) {
    throw new Error(
      "KOMORA_E2E=1 requires the `msb` CLI on PATH. Install microsandbox or unset KOMORA_E2E.",
    );
  }

  const sshDir = fs.mkdtempSync(path.join(os.tmpdir(), "komora-e2e-ssh-"));
  const keyPath = path.join(sshDir, "id_ed25519");
  const pubPath = `${keyPath}.pub`;
  const keygen = spawnSync("ssh-keygen", ["-t", "ed25519", "-N", "", "-f", keyPath], {
    stdio: "pipe",
  });
  if (keygen.status !== 0) {
    throw new Error(`ssh-keygen failed: ${keygen.stderr?.toString()}`);
  }

  const tmpl = fs.readFileSync(TMPL, "utf8");
  const rendered = tmpl.replace("__PUBKEY_PATH__", pubPath);
  const renderedPath = path.join(sshDir, "box-ssh.yaml");
  fs.writeFileSync(renderedPath, rendered, "utf8");

  process.env.KOMORA_E2E_SSH_KEY = keyPath;
  process.env.KOMORA_E2E_SSH_MANIFEST = renderedPath;
  process.env.KOMORA_E2E_SSH_DIR = sshDir;

  const bake = await runCli(["-m", BAKE_MANIFEST, "bake"]);
  assertOk(bake, "bake (globalSetup)");

  return async () => {
    try {
      await runCli(["-m", BAKE_MANIFEST, "destroy"]);
    } catch {
      /* best-effort */
    }
    fs.rmSync(sshDir, { recursive: true, force: true });
  };
}
