import { msb } from "./msb.js";
import { withSandboxLock } from "./lock.js";
import { getSecret } from "../secrets/store.js";
import { buildSecretArgs } from "./_sdk.js";
import { runToolchains } from "../toolchains/runner.js";
import type { ResolvedConfig } from "../config/types.js";
import { log } from "../util/log.js";

async function collectSecretValues(secretNames: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const name of secretNames) {
    const v = await getSecret(name);
    if (v !== undefined) out[name] = v;
  }
  return out;
}

async function runInitSequence(cfg: ResolvedConfig): Promise<void> {
  await msb.execInSandbox(cfg.sandboxName, "bash", [
    "-c",
    "sed -i '/^nameserver fd42:/d' /etc/resolv.conf",
  ]);

  if (cfg.toolchain.length > 0) {
    log.info(`installing toolchains: ${cfg.toolchain.map((t) => Object.keys(t)[0]).join(", ")}`);
    await runToolchains(cfg.sandboxName, cfg.toolchain);
  }

  for (const cmd of cfg.setup) {
    log.info(`setup: ${cmd}`);
    await msb.execInSandbox(cfg.sandboxName, "bash", ["-c", cmd]);
  }
}

export async function ensureSandbox(cfg: ResolvedConfig): Promise<void> {
  await withSandboxLock(cfg.sandboxName, async () => {
    const status = await msb.status(cfg.sandboxName);
    if (status === "missing") {
      const values = await collectSecretValues(cfg.secrets);
      const secretArgs = buildSecretArgs(values);
      await msb.create({
        name: cfg.sandboxName,
        image: cfg.image,
        mounts: cfg.mounts,
        env: cfg.env,
        secretArgs,
        raw: cfg.raw,
      });
      await msb.start(cfg.sandboxName);
      await runInitSequence(cfg);
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
