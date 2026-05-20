# Secrets in komora

komora manages one persistent personal dev microVM (the box). The box runs AI coding agents that need API keys, and the user needs SSH access into it. The secrets model is designed around two constraints:

1. API keys must never appear in the VM's environment in plaintext.
2. The user's SSH private key must never enter the VM at all.

These are met by two distinct tiers: **workload secrets** and **identity secrets**.

---

## Tier 1: Workload secrets (API keys, tokens)

Workload secrets are credentials that agents running inside the box need to reach external services — for example `ANTHROPIC_API_KEY` for `api.anthropic.com`.

### Declaration

Declared in `~/.config/komora/box.yaml` under `secrets.workload`. Each entry names the environment variable and the domain the key is valid for:

```yaml
secrets:
  workload:
    - name: ANTHROPIC_API_KEY
      domain: api.anthropic.com
    - name: OPENAI_API_KEY
      domain: api.openai.com
```

The declaration does **not** contain the value. Values are stored separately in the keychain.

### Keychain

Values are stored on the host at `~/.config/komora/secrets.json` (derived from `XDG_CONFIG_HOME`). The file is written atomically: written to a `.tmp` file, `chmod 0600`, then renamed into place. Mode `0600` is enforced on every write.

This is a plain JSON file, not a system keychain. OS keychain integration is a deliberate v3 item; v1 prioritises simplicity.

Manage values with:

```bash
komora secret set ANTHROPIC_API_KEY     # prompts for value, never echoed
komora secret list                      # prints names only, never values
komora secret rm ANTHROPIC_API_KEY
```

### How injection works end-to-end

1. `komora up` reads `box.yaml` and calls `collectWorkloadValues()` from `src/secrets/inject.ts`.
2. For each declared workload secret, it looks up the value in the keychain via `getSecret()`. Secrets not present in the keychain are silently skipped.
3. For each secret that has a value, `buildSecretEnvArgs()` produces a `--secret NAME=value@domain` argument pair.
4. These arguments are passed to `msb` when starting the VM.
5. Inside the VM, the environment variable is set to a placeholder token: `ANTHROPIC_API_KEY=$MSB_ANTHROPIC_API_KEY`.
6. When a process inside the VM makes an outbound HTTPS request to `api.anthropic.com`, microsandbox's TLS-intercept proxy intercepts the connection, substitutes the real key, and forwards the request. The plaintext value never exists in the VM's process space.

### What `printenv` shows

```
$ printenv ANTHROPIC_API_KEY
$MSB_ANTHROPIC_API_KEY
```

This is correct and expected. The placeholder is proof that the secret was injected into the proxy but not exposed to the VM. Any process that reads `$ANTHROPIC_API_KEY` directly gets the placeholder string; only traffic to the declared domain gets the real value substituted at the TLS layer.

### Missing secrets at `up` time

If a workload secret is declared in `box.yaml` but not present in the keychain, komora skips it silently. The placeholder env var is still set inside the VM, but requests to the domain will fail authentication. Run `komora secret list` to audit which secrets are stored and compare against your `box.yaml` declarations.

---

## Tier 2: Identity secrets (SSH key, git signing)

Identity secrets are credentials that make the box act **as the user** — signing git commits, SSHing to remote machines, pushing to GitHub.

### Declaration

```yaml
secrets:
  identity:
    - ssh-agent
```

### How it works

The user's SSH agent socket on the host is forwarded into the VM. `SSH_AUTH_SOCK` is set inside the box to point at a proxied socket connected back to the host agent. The VM can issue signing and authentication operations that the host agent fulfils, but the private key bytes never cross the boundary into the VM.

Concretely:

- `git push` inside the box works because the SSH agent answers the authentication challenge.
- `ssh other-machine` inside the box works for any key loaded in the host agent.
- `cat ~/.ssh/id_ed25519` inside the box produces nothing — the key file is not there.

---

## Storage layout

| Path | Contents | Mode |
|---|---|---|
| `~/.config/komora/box.yaml` | Manifest — declarations, no values | `0644` |
| `~/.config/komora/secrets.json` | Workload secret values (keychain) | `0600` |

`XDG_CONFIG_HOME` overrides `~/.config` if set.

---

## Updating a secret value

Changing a stored value takes effect only when the VM is next started, because the values are injected at `msb` start time by the proxy.

```bash
komora secret set ANTHROPIC_API_KEY   # update value in keychain
komora down && komora up              # restart to re-inject
```

Or use `komora rebuild` which tears down and rebuilds the VM from scratch.

---

## Out of scope (v1)

- **OS keychain integration** (macOS Keychain, GNOME Secrets, KeePassXC): planned for v3. The current flat JSON file is the entire keychain.
- **Per-secret rotation without restart**: the proxy reads values at start time; live rotation requires a VM restart.
- **Host-side credential proxy** (intercepting requests from outside the VM): v3 item.
- **Secret namespacing by profile**: there is one box and one keychain; profile support is a future item.

---

## Source files

| File | Responsibility |
|---|---|
| `src/secrets/keychain.ts` | `setSecret`, `getSecret`, `listSecrets`, `removeSecret` — atomic read/write of `secrets.json` |
| `src/secrets/tiers.ts` | `classify(r: ResolvedBox): Tiers` — splits a resolved manifest into workload and identity lists |
| `src/secrets/inject.ts` | `collectWorkloadValues()`, `missingWorkload()`, `buildSecretEnvArgs()` — resolves values and produces `--secret` CLI args |
