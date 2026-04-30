import { msb } from "./msb.js";
import { withSandboxLock } from "./lock.js";
import { resolveSecretArgs } from "../secrets/policy.js";
import { getSecret } from "../secrets/store.js";
import type { ResolvedConfig } from "../config/types.js";

async function collectSecretValues(cfg: ResolvedConfig): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const optedIn = new Set(cfg.secretsAllow);
  for (const allow of cfg.profile.secrets?.allowed ?? []) {
    if (!optedIn.has(allow.name)) continue;
    const v = await getSecret(allow.name);
    if (v !== undefined) out[allow.name] = v;
  }
  return out;
}

export async function ensureSandbox(cfg: ResolvedConfig): Promise<void> {
  await withSandboxLock(cfg.sandboxName, async () => {
    const status = await msb.status(cfg.sandboxName);
    if (status === "missing") {
      const values = await collectSecretValues(cfg);
      const secretArgs = resolveSecretArgs({ profile: cfg.profile, values });
      await msb.create({
        name: cfg.sandboxName,
        image: cfg.profile.image,
        mounts: cfg.profile.mounts ?? [],
        env: cfg.profile.env ?? {},
        secretArgs,
        raw: cfg.raw,
      });
      await msb.start(cfg.sandboxName);
    } else if (status === "stopped") {
      await msb.start(cfg.sandboxName);
    }
  });
}

export async function stopSandbox(name: string): Promise<void> {
  await msb.stop(name);
}

export async function removeSandbox(name: string): Promise<void> {
  const status = await msb.status(name);
  if (status === "missing") return;
  if (status === "running") await msb.stop(name);
  await msb.rm(name);
}
