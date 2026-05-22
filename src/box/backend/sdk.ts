import { Volume, VolumeAlreadyExistsError } from "microsandbox";
import type { ResolvedBox } from "../types.js";
import { runMsb } from "./msb.js";

export interface BuildOpts {
  secretArgs: string[];
}

function parseSecret(args: string[]): Array<{ name: string; value: string; host: string }> {
  const out: Array<{ name: string; value: string; host: string }> = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--secret") continue;
    const p = args[i + 1];
    i++;
    const eq = p.indexOf("=");
    const at = p.indexOf("@", eq);
    if (eq < 0 || at < 0) throw new Error(`bad secret arg: ${p}`);
    out.push({ name: p.slice(0, eq), value: p.slice(eq + 1, at), host: p.slice(at + 1) });
  }
  return out;
}

async function ensureVolume(name: string): Promise<void> {
  try {
    await Volume.builder(name).create();
  } catch (e) {
    if (!(e instanceof VolumeAlreadyExistsError)) throw e;
  }
}

export async function buildSandbox(r: ResolvedBox, opts: BuildOpts): Promise<void> {
  const args: string[] = ["run", "--snapshot", r.baseSnapshotName, "--name", r.box.name, "--detach"];

  if (r.box.resources.memoryMib) args.push("-m", `${r.box.resources.memoryMib}M`);
  if (r.box.resources.cpus) args.push("-c", String(r.box.resources.cpus));

  args.push("--init", "/bin/sleep", "--init-arg", "infinity");

  if ("volume" in r.box.personalLayer && r.box.personalLayer.volume) {
    const v = r.box.personalLayer.volume;
    await ensureVolume(v.name);
    args.push("-v", `${v.name}:${v.mount}`);
  } else if ("mount" in r.box.personalLayer && r.box.personalLayer.mount) {
    const m = r.box.personalLayer.mount;
    args.push("-v", `${m.host}:${m.guest}`);
  }

  for (const v of r.box.volumes) {
    await ensureVolume(v.name);
    args.push("-v", `${v.name}:${v.mount}`);
  }

  for (const m of r.box.mounts) {
    args.push("-v", `${m.host}:${m.guest}`);
  }

  for (const p of r.box.ports) {
    args.push("-p", `${p.host}:${p.guest}`);
  }

  for (const s of parseSecret(opts.secretArgs)) {
    args.push("--secret", `${s.name}=${s.value}@${s.host}`);
  }

  await runMsb(args, { stdio: "pipe" });
}
