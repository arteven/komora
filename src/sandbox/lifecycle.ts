import type { Sandbox } from "microsandbox";
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

export async function runQuietly(
  sandbox: Sandbox,
  script: string,
  verbose: boolean,
): Promise<void> {
  const result = await sandbox.shell(script);
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
    throw new Error(`command failed (exit ${result.code}): ${script}`);
  }
}

async function runInitSequence(sandbox: Sandbox, cfg: ResolvedConfig, verbose: boolean): Promise<void> {
  await runQuietly(sandbox, "sed -i '/^nameserver fd42:/d' /etc/resolv.conf", verbose);

  if (cfg.toolchain.length > 0) {
    log.info(`installing toolchains: ${cfg.toolchain.map((t) => Object.keys(t)[0]).join(", ")}`);
    await runToolchains(sandbox, cfg.toolchain, verbose);
  }

  for (const cmd of cfg.setup) {
    log.info(`setup: ${cmd}`);
    await runQuietly(sandbox, cmd, verbose);
  }
}

export async function ensureSandbox(
  cfg: ResolvedConfig,
  opts?: { verbose?: boolean },
): Promise<Sandbox> {
  const verbose = opts?.verbose ?? false;
  return withSandboxLock(cfg.sandboxName, async () => {
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
        domains: cfg.domains,
        raw: cfg.raw,
      });
      const sandbox = await msb.start(cfg.sandboxName);
      await runInitSequence(sandbox, cfg, verbose);
      return sandbox;
    } else if (status === "stopped") {
      return msb.start(cfg.sandboxName);
    } else {
      return msb.connect(cfg.sandboxName);
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
