import { spawn } from "node:child_process";

export interface MsbOpts {
  stdio?: "inherit" | "pipe";
  env?: NodeJS.ProcessEnv;
}

export async function runMsb(args: string[], opts: MsbOpts = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("msb", args, {
      stdio: opts.stdio ?? "inherit",
      env: opts.env ?? process.env,
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`msb exited with code ${code}`));
    });
    child.on("error", reject);
  });
}
