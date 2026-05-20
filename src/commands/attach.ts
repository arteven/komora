import { spawn } from "node:child_process";
import { loadBox } from "../box/index.js";

export interface AttachOpts { manifest?: string; }

export async function attachCmd(opts: AttachOpts, cmd: string[] = []): Promise<void> {
  const b = await loadBox(opts.manifest);
  const interactive = cmd.length === 0;
  const args = interactive
    ? ["exec", b.box.name, "--", "bash"]
    : ["exec", b.box.name, "--", ...cmd];
  return new Promise((resolve, reject) => {
    const child = spawn("msb", args, {
      stdio: interactive ? "inherit" : ["ignore", "pipe", "pipe"],
      env: process.env,
    });
    if (!interactive) {
      child.stdout!.pipe(process.stdout);
      child.stderr!.pipe(process.stderr);
    }
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`msb exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
