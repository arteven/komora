import { spawn } from "node:child_process";
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
