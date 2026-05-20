import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

const CLI_PATH = path.resolve("dist/cli.js");

export function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("exit", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export function assertOk(result: CliResult, label: string): void {
  if (result.code !== 0) {
    throw new Error(
      `${label} failed (exit ${result.code})\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    );
  }
}

export interface TmpHome {
  dir: string;
  env: { HOME: string; XDG_CONFIG_HOME: string; XDG_STATE_HOME: string };
  cleanup: () => void;
}

export function withTmpHome(): TmpHome {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "komora-e2e-HOME-"));
  fs.mkdirSync(path.join(dir, ".config", "komora"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".local", "state", "komora"), { recursive: true });
  return {
    dir,
    env: {
      HOME: dir,
      XDG_CONFIG_HOME: path.join(dir, ".config"),
      XDG_STATE_HOME: path.join(dir, ".local", "state"),
    },
    cleanup: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}

export async function attachExec(
  env: NodeJS.ProcessEnv,
  manifest: string,
  shellCmd: string,
): Promise<string> {
  const res = await runCli(["-m", manifest, "attach", "--", "sh", "-c", shellCmd], env);
  assertOk(res, `attach -- sh -c "${shellCmd}"`);
  return res.stdout;
}

export async function freshBox(
  env: NodeJS.ProcessEnv,
  manifest: string,
): Promise<void> {
  const destroy = await runCli(["-m", manifest, "destroy"], env);
  // Tolerate "box not found" / similar idempotent failures; any other failure is fatal.
  if (destroy.code !== 0 && !/not found|does not exist/i.test(destroy.stderr)) {
    throw new Error(
      `destroy failed unexpectedly (exit ${destroy.code})\nstderr: ${destroy.stderr}`,
    );
  }
  const rebuild = await runCli(["-m", manifest, "rebuild"], env);
  assertOk(rebuild, "rebuild");
}
