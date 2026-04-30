# Spike: microsandbox JS SDK coverage

## Decision

**Use the SDK: `microsandbox@0.4.2` (npm).**

Rationale: the package is published by the upstream maintainer (`appcypher`), is
TypeScript-native (`dist/index.d.ts`, ESM), exposes a builder-based `Sandbox`
API, and natively models every primitive Komora V1 needs (lifecycle, exec,
secrets, volumes, network policy, ports, env). Going subprocess-only would
duplicate JSON parsing of `msb` CLI output for no gain. The SDK also matches
the `msb` 0.4.2 binary already installed at `~/.microsandbox/bin/msb`.

## Sources consulted

- `npm view microsandbox` — package `microsandbox@0.4.2`, 14 versions,
  Apache-2.0, no runtime deps, published 2026-04-30 (~15h before this spike).
- Tarball contents (`npm pack --dry-run`) — confirms shipped TS declarations and
  N-API binary loader (`dist/internal/napi.*`, `internal/resolve-binary.js`).
- TypeScript SDK reference: `https://docs.microsandbox.dev/sdk/typescript/{sandbox,execution,secrets}.md`.
- Docs index: `https://docs.microsandbox.dev/llms.txt`.

## Method coverage

Komora V1 only needs the lifecycle + exec + secrets primitives below. All are
covered by the SDK; no `msb` subprocess fallback is required for the V1 path.

| Operation | SDK entry point                               | Subprocess fallback needed? |
| --------- | --------------------------------------------- | --------------------------- |
| create    | `Sandbox.builder(name).image(...)…create()`   | No                          |
| start     | `Sandbox.start(name)` / `handle.start()`      | No                          |
| stop      | `sandbox.stop()` / `handle.stop()`            | No                          |
| exec      | `sandbox.exec(cmd, args)` / `execStream(...)` | No                          |
| rm        | `Sandbox.remove(name)` / `handle.remove()`    | No                          |
| list      | `Sandbox.list()`                              | No                          |

Adjacent V1 features also covered natively:

- Secrets with placeholder substitution: `builder.secret(s => …)` and
  `builder.secretEnv(envVar, value, allowedHost)` (auto `$MSB_<NAME>`).
- Env, workdir, user, hostname, entrypoint, shell.
- Volume mounts: `builder.volume(guestPath, m => m.bind(...))`.
- Port publish: `builder.port(host, guest)` / `portUdp`.
- Network policy: `builder.network(n => n.policy(...))` / `disableNetwork()`.
- Image pull behavior: `builder.pullPolicy('if-missing' | 'always' | 'never')`.
- Lifecycle limits: `maxDuration(secs)`, `idleTimeout(secs)`.
- Replace-by-name: `builder.replace()`.
- Interactive PTY attach (for future `komora attach`): `sandbox.attach(...)` /
  `attachShell()` / `attachWith(...)`.

## Known gaps that still want `execa("msb", …)`

These are out-of-scope for the SDK surface and Komora's `msb.ts` module will
shell out for them:

- **Image cache warmup / explicit pull outside a sandbox**: `msb pull <image>`.
  The SDK only pulls lazily as part of `create()`; for `komora pull` /
  preflight we will exec the CLI.
- **Daemon / server lifecycle**: `msb server start|stop|status`. The SDK is
  daemonless within the host process, but the optional shared daemon mode (V2)
  is CLI-only.
- **Binary preflight**: existence + version check of `~/.microsandbox/bin/msb`
  via `msb --version` — pure subprocess.
- **Volume CRUD outside a sandbox**: `msb volume create|ls|rm`. Bind mounts are
  modeled in the SDK, but managed named volumes are CLI-driven.
- **Disk image / OCI registry login state**: `msb login`, registry config — no
  SDK equivalent surfaced; CLI only.
- **Raw passthrough escape hatch**: if a future profile field needs an `msb`
  flag the SDK does not yet model (the docs flag several "coming soon"
  features: snapshots, fs hooks, peer sandboxes, plugins, events for TS), we
  fall back to `execa("msb", [...])` rather than blocking on SDK gaps.

## V2-relevant notes (short)

- Snapshots/fork (`sandbox.snapshot()`) are listed as "coming soon" for TS in
  the docs; do not depend on them in V1.
- Filesystem read/write hooks (`onRead` / `onWrite`) are TS "coming soon".
- Bidirectional events API (`onEvent` / `emit`) is "coming soon" for TS.
- Auth: registry auth lives on the builder (`builder.registry(r => r.auth(...))`);
  no separate global auth SDK call. Token storage stays the user's
  responsibility (matches Komora's secrets store design).
- The SDK ships a native binary via N-API (`dist/internal/napi.*`) plus a
  resolver (`dist/internal/resolve-binary.js`); platform support follows
  upstream (macOS Apple Silicon + Linux KVM). KVM availability already
  confirmed in `docs/spike-dind-feasibility.md`.

## Install record

```
npm install microsandbox@0.4.2
# → added 2 packages, no prod dep additions other than microsandbox itself
```

`package.json` now pins `"microsandbox": "^0.4.2"`. `npm test` (56/56) and
`npm run typecheck` are clean post-install.
