import { Sandbox, Volume, VolumeAlreadyExistsError, SandboxNotFoundError } from "microsandbox";
import type { SandboxStatus as SdkSandboxStatus } from "microsandbox";
import type { Mount } from "../config/types.js";
import { log } from "../util/log.js";

export interface SdkCreateInput {
  name: string;
  image: string;
  memoryMib?: number;
  cpus?: number;
  mounts: Mount[];
  env: Record<string, string>;
  secretArgs: string[];
  domains: string[];
  raw: Record<string, unknown>;
}

export interface SdkListItem {
  name: string;
  status: "running" | "stopped";
}

/** Env-var prefix used when materializing secrets into the SDK's secret
 * builder. Matches microsandbox's documented `$MSB_<NAME>` placeholder. */
const MSB_SECRET_ENV_PREFIX = "MSB_";

function secretEnvVarFor(name: string): string {
  return `${MSB_SECRET_ENV_PREFIX}${name}`;
}

/**
 * Parse a flat `--secret`-flag-style array into structured entries.
 *
 * Input shape: `["--secret", "NAME=VALUE", "--secret", "NAME=VALUE@HOST", ...]`.
 * Each pair is a single `--secret` flag followed by its value. The value is
 * `NAME=VALUE` or `NAME=VALUE@HOST` (host may itself contain `@` after the
 * first one is consumed).
 */
export interface ParsedSecret {
  name: string;
  value: string;
  host?: string;
}

export function parseSecretArgs(args: string[]): ParsedSecret[] {
  const out: ParsedSecret[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== "--secret") continue;
    const payload = args[i + 1];
    if (payload === undefined) {
      throw new Error("malformed secretArgs: trailing --secret with no value");
    }
    i++;
    const eq = payload.indexOf("=");
    if (eq < 0) {
      throw new Error(`malformed secret entry, missing '=': ${payload}`);
    }
    const name = payload.slice(0, eq);
    const rest = payload.slice(eq + 1);
    const at = rest.indexOf("@");
    if (at < 0) {
      out.push({ name, value: rest });
    } else {
      out.push({ name, value: rest.slice(0, at), host: rest.slice(at + 1) });
    }
  }
  return out;
}

/**
 * Collapse the SDK's 4-state lifecycle (`running | stopped | crashed |
 * draining`) into the adapter's 2-state contract (`running | stopped`).
 *
 * Trade-off: this is a deliberate V1 simplification. Komora's surface only
 * cares about "is the sandbox actively running?", so `crashed` and
 * `draining` both report as `stopped`. Callers that need to distinguish
 * crash conditions or graceful drain must talk to the microsandbox SDK
 * directly — not through this adapter.
 */
export function mapSdkStatus(status: SdkSandboxStatus): "running" | "stopped" {
  switch (status) {
    case "running":
      return "running";
    case "stopped":
    case "crashed":
    case "draining":
      return "stopped";
    default:
      // Future SDK additions land here. Keep the adapter conservative:
      // unknown ⇒ not running.
      // non-exhaustive
      return "stopped";
  }
}

/**
 * The `raw` field is a passthrough escape hatch for `msb` flags the SDK does
 * not yet model. The SDK adapter has no `--flag` plumbing, so we warn and
 * ignore (matching the resolver's pattern for `network`/`digest`).
 */
export function warnUnmappedRaw(
  raw: Record<string, unknown> | null | undefined,
  warn: (msg: string) => void = log.warn,
): void {
  if (!raw) return;
  const keys = Object.keys(raw);
  if (keys.length === 0) return;
  warn(
    `ignoring unmapped raw passthrough keys (no SDK plumbing in V1): ${keys.join(", ")}`,
  );
}

export function buildSecretArgs(values: Record<string, string>): string[] {
  const args: string[] = [];
  for (const [name, value] of Object.entries(values)) {
    args.push("--secret", `${name}=${value}`);
  }
  return args;
}

export const sdk = {
  async create(input: SdkCreateInput): Promise<Sandbox> {
    warnUnmappedRaw(input.raw);

    let builder = Sandbox.builder(input.name).image(input.image);

    if (input.memoryMib) builder = builder.memory(input.memoryMib);
    if (input.cpus) builder = builder.cpus(input.cpus);

    for (const [k, v] of Object.entries(input.env)) {
      builder = builder.env(k, v);
    }

    for (const m of input.mounts) {
      if (m.type === "bind") {
        if (!m.source) {
          throw new Error(
            `bind mount missing source for target ${m.target}`,
          );
        }
        const host = m.source;
        builder = builder.volume(m.target, (b) => b.bind(host));
      } else {
        if (!m.name) {
          throw new Error(
            `volume mount missing name for target ${m.target}`,
          );
        }
        const named = m.name;
        try {
          await Volume.builder(named).create();
        } catch (e) {
          if (!(e instanceof VolumeAlreadyExistsError)) throw e;
        }
        builder = builder.volume(m.target, (b) => b.named(named));
      }
    }

    for (const s of parseSecretArgs(input.secretArgs)) {
      const envVar = secretEnvVarFor(s.name);
      if (s.host) {
        builder = builder.secretEnv(envVar, s.value, s.host);
      } else {
        builder = builder.secret((b) => b.env(envVar).value(s.value));
      }
    }

    if (input.secretArgs.length > 0 && input.domains.length > 0) {
      builder = builder.network((n) =>
        n.tls((t: any) => {
          for (const d of input.domains) t = t.bypass(d);
          return t;
        }),
      );
    }

    return builder.create();
  },

  async start(name: string): Promise<Sandbox> {
    return Sandbox.start(name);
  },

  async connect(name: string): Promise<Sandbox> {
    const handle = await Sandbox.get(name);
    return handle.connect();
  },

  /**
   * Stop a sandbox by name. Idempotent: if the sandbox is not present in
   * `Sandbox.list()` (already removed, never created), this resolves
   * without throwing — matching `msb.status()`'s `"missing"` tolerance.
   *
   * There is a race window between `list()` and `handle.stop()`; if the
   * SDK throws a not-found-shaped error during stop we treat that as a
   * benign concurrent removal and resolve.
   */
  async stop(name: string): Promise<void> {
    try {
      const handle = await Sandbox.get(name);
      await handle.stop();
    } catch (e) {
      if (e instanceof SandboxNotFoundError) return;
      throw e;
    }
  },

  async rm(name: string): Promise<void> {
    await Sandbox.remove(name);
  },

  async list(): Promise<SdkListItem[]> {
    const handles = await Sandbox.list();
    return handles.map((h) => ({
      name: h.name,
      status: mapSdkStatus(h.status),
    }));
  },

  async logs(_name: string, _onLine: (line: string) => void): Promise<void> {
    throw new Error("sdk.logs: not implemented in V1");
  },
};
