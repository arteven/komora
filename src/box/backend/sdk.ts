import { Sandbox, Volume, VolumeAlreadyExistsError } from "microsandbox";
import type { ResolvedBox } from "../types.js";

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

export async function buildSandbox(r: ResolvedBox, opts: BuildOpts): Promise<any> {
  let b: any = Sandbox.builder(r.box.name).image(r.image.base);

  if (r.box.resources.memoryMib) b = b.memory(r.box.resources.memoryMib);
  if (r.box.resources.cpus) b = b.cpus(r.box.resources.cpus);

  if ("volume" in r.box.personalLayer && r.box.personalLayer.volume) {
    const v = r.box.personalLayer.volume;
    await ensureVolume(v.name);
    b = b.volume(v.mount, (vb: any) => vb.named(v.name));
  } else if ("mount" in r.box.personalLayer && r.box.personalLayer.mount) {
    const m = r.box.personalLayer.mount;
    b = b.volume(m.guest, (vb: any) => vb.bind(m.host));
  }

  for (const v of r.box.volumes) {
    await ensureVolume(v.name);
    b = b.volume(v.mount, (vb: any) => vb.named(v.name));
  }

  for (const m of r.box.mounts) {
    b = b.volume(m.guest, (vb: any) => vb.bind(m.host));
  }

  for (const s of parseSecret(opts.secretArgs)) {
    b = b.secretEnv(`MSB_${s.name}`, s.value, s.host);
  }

  return b.create();
}
