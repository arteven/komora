import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { Sandbox } from "microsandbox";
import { log } from "../util/log.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const AVAILABLE_TOOLCHAINS = ["node", "bun", "python", "go", "rust", "dotnet"];

export function getToolchainScriptPath(name: string): string {
  if (!AVAILABLE_TOOLCHAINS.includes(name)) {
    throw new Error(`unknown toolchain '${name}'. Available: ${AVAILABLE_TOOLCHAINS.join(", ")}`);
  }
  return path.join(__dirname, `${name}.sh`);
}

export async function loadToolchainScripts(
  toolchain: Record<string, string>[],
): Promise<Record<string, string>> {
  const scripts: Record<string, string> = {};
  for (const entry of toolchain) {
    const [name] = Object.entries(entry)[0];
    const scriptPath = getToolchainScriptPath(name);
    scripts[name] = await fs.readFile(scriptPath, "utf-8");
  }
  return scripts;
}

export async function runMountedToolchains(
  sandbox: Sandbox,
  toolchain: Record<string, string>[],
  verbose: boolean,
): Promise<void> {
  for (const entry of toolchain) {
    const [name, version] = Object.entries(entry)[0];
    log.info(`toolchain: installing ${name}@${version}`);
    const result = await sandbox.shell(`/.msb/scripts/${name} '${version}'`);
    if (verbose) {
      const out = result.stdout();
      const err = result.stderr();
      if (out) process.stdout.write(out);
      if (err) process.stderr.write(err);
    }
    if (!result.success) {
      const out = result.stdout();
      const err = result.stderr();
      if (!verbose) {
        if (out) process.stdout.write(out);
        if (err) process.stderr.write(err);
      }
      throw new Error(`toolchain '${name}' install failed (exit ${result.code})`);
    }
  }
}
