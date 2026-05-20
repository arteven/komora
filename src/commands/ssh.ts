import { spawn } from "node:child_process";
import { loadBox } from "../box/index.js";

export interface SshOpts { manifest?: string; }

export async function sshCmd(opts: SshOpts): Promise<void> {
  const b = await loadBox(opts.manifest);
  if (!b.box.ssh?.enabled) throw new Error("ssh is disabled in box.yaml");
  const port = b.box.ports.find((p: any) => p.guest === 22)?.host;
  if (!port) throw new Error("no host port forwarded for guest 22");
  const user = b.box.ssh.user;

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ssh", ["-p", String(port), `${user}@127.0.0.1`], { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ssh exited ${code}`))));
    child.on("error", reject);
  });
}
