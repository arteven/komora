import { type Sandbox, SandboxStillRunningError } from "microsandbox";
import { msb } from "./msb.js";
import { withSandboxLock } from "./lock.js";
import { getSecret } from "../secrets/store.js";
import { buildSecretArgs } from "./_sdk.js";
import { loadToolchainScripts, runMountedToolchains } from "../toolchains/runner.js";
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
  // Strip microsandbox's IPv6 nameserver — best-effort since /etc/resolv.conf may be read-only
  try {
    await runQuietly(sandbox, "cp /etc/resolv.conf /tmp/resolv.conf && sed -i '/^nameserver fd42:/d' /tmp/resolv.conf && cp /tmp/resolv.conf /etc/resolv.conf && rm /tmp/resolv.conf", verbose);
  } catch {
    if (verbose) log.warn("could not patch /etc/resolv.conf (read-only), continuing");
  }

  if (cfg.toolchain.length > 0) {
    log.info(`installing toolchains: ${cfg.toolchain.map((t) => Object.keys(t)[0]).join(", ")}`);
    await runMountedToolchains(sandbox, cfg.toolchain, verbose);
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
      const scripts = cfg.toolchain.length > 0
        ? await loadToolchainScripts(cfg.toolchain)
        : undefined;
      const sandbox = await msb.create({
        name: cfg.sandboxName,
        image: cfg.image,
        memoryMib: cfg.agentDef.memoryMib,
        cpus: cfg.agentDef.cpus,
        mounts: cfg.mounts,
        env: cfg.env,
        secretArgs,
        domains: cfg.domains,
        raw: cfg.raw,
        scripts,
      });
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

async function stopIfRunning(name: string): Promise<void> {
  try {
    const sandbox = await msb.connect(name);
    await sandbox.stopAndWait();
  } catch {
    // already stopped or unreachable
  }
}

export async function removeSandbox(name: string): Promise<void> {
  const status = await msb.status(name);
  if (status === "missing") return;
  if (status === "running") await stopIfRunning(name);
  try {
    await msb.rm(name);
  } catch (e) {
    if (!(e instanceof SandboxStillRunningError)) throw e;
    // stopAndWait resolved but SDK still sees it as running — retry once
    await new Promise((r) => setTimeout(r, 500));
    await msb.rm(name);
  }
}
