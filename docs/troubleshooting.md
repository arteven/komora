# Troubleshooting

## User-facing issues

### Workload secrets show as placeholder inside the box

**Symptom:** `printenv ANTHROPIC_API_KEY` inside the box prints `$MSB_ANTHROPIC_API_KEY`, not the real key.

**Cause:** Expected behavior. microsandbox uses TLS-proxy placeholder injection; the real value is only substituted for outbound HTTPS requests to the declared domain (`api.anthropic.com`). The placeholder is what lives in the environment.

**Fix:** Nothing to fix. Verify the key works by making an actual API call, not by inspecting env vars.

---

### `komora pause` / `komora resume` have no effect

**Symptom:** `komora pause` or `komora resume` does nothing visible or returns an error.

**Cause:** microsandbox does not yet implement pause/resume in the SDK or the `msb` CLI. The commands are wired up in komora for when the feature ships.

**Fix:** None currently. Use `komora down` / `komora up` as a workaround to free resources.

---

### `komora ssh` hangs or "connection refused" right after `komora up`

**Symptom:** `komora ssh` fails immediately after starting the box.

**Cause:** sshd takes a few seconds to start inside the VM. `komora ssh` probes for readiness but may time out if the VM is slow to boot.

**Fix:** Wait a moment and retry, or use `komora attach` as a fallback while sshd is starting. `komora status` shows sshd readiness.

---

## Developer / contributor gotchas

### Sandbox stops ~7 seconds after creation

**Symptom:** `komora rebuild` completes, `komora status` briefly shows running, then shows stopped.

**Cause:** The microsandbox TypeScript SDK's `Sandbox.builder().createDetached()` and `Sandbox.start()` hold a NAPI native object with a C++ destructor that stops the sandbox when the JS handle is garbage-collected (~7–9 seconds after the Node process moves on).

**Fix:** komora uses `msb create` / `msb start` CLI via `runMsb()`, not the SDK builder. Do not revert to SDK-based creation for persistent sandboxes.

**Relevant files:** `src/box/backend/sdk.ts` (`buildSandbox`), `src/box/backend/lifecycle.ts` (`upCmd`)

---

### `msb exec` hangs indefinitely when spawned with `stdio: 'pipe'`

**Symptom:** `komora attach --no-interactive` or any non-interactive exec hangs for minutes with no output.

**Cause:** `msb exec` waits for stdin to close when spawned with `stdio: 'pipe'`. With a TTY this is fine; with piped stdio there is no EOF on stdin.

**Fix:** Use `stdio: ['ignore', 'pipe', 'pipe']` for non-interactive `msb exec` spawns. `'ignore'` is equivalent to `/dev/null` on stdin.

**Relevant file:** `src/commands/attach.ts`

---

### `msb` CLI commands fail with "sandbox not found" when `HOME` is overridden

**Symptom:** In tests (or when `HOME` is set to a temp dir), `msb exec`, `msb start`, etc. return "sandbox not found" or hang.

**Cause:** The `msb` CLI locates its global database at `~/.microsandbox/db/msb.db`. Changing `HOME` makes `msb` unable to find the sandbox.

**Fix:** Never override `HOME` for komora test isolation. Use `XDG_CONFIG_HOME` and `XDG_STATE_HOME` for komora's own config paths; the real `HOME` must remain intact for `msb` to work.

**Relevant file:** `tests/integration/helpers.ts` (`withTmpHome`)

---

### `msb destroy` / `msb remove` fails with "sandbox still running"

**Symptom:** Attempting to remove a running sandbox fails.

**Cause:** `msb remove` (and the SDK's `Sandbox.remove()`) does not stop the sandbox first.

**Fix:** Always `msb stop` before `msb remove`. komora's `destroy` command does this correctly. A brief sleep between stop and remove may be needed in edge cases due to a race in the msb daemon.

**Relevant file:** `src/box/backend/lifecycle.ts` (`destroyCmd`)

---

### `msb snapshot create` fails if snapshot already exists

**Symptom:** `komora bake` fails on second run with a snapshot conflict error.

**Cause:** `msb snapshot create` requires `--force` to overwrite an existing snapshot.

**Fix:** komora's `image.ts` already passes `--force`. If calling `msb snapshot create` manually, add `--force`.

**Relevant file:** `src/box/backend/image.ts`
