# box.yaml Reference

`~/.config/komora/box.yaml` is the single manifest that describes your personal dev box. komora reads this file on every command. Unknown keys are rejected.

---

## `version`

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `version` | integer | yes | — | Must be `1`. |

---

## `image`

Defines what goes into the baked base image. Changing any field here requires a `komora bake` followed by `komora rebuild`.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `base` | string | yes | — | OCI image reference used as the starting layer (e.g. `docker.io/library/debian:12-slim`). |
| `toolchains` | list of objects | no | `[]` | Language toolchains to install via mise. Each item is a single-key object whose key is the toolchain name and whose value is the version string. |
| `agents` | list of strings | no | `[]` | AI agent CLIs to install. Each value must match `^[a-z][a-z0-9-]*$`. Recognized names: `claude`, `opencode`, `gemini`. |
| `packages` | list of strings | no | `[]` | Additional OS packages to install (apt/apk/dnf depending on the base image). |

**`image.toolchains`** — each entry is an object with exactly one key. The key is the toolchain name (e.g. `node`, `python`, `go`, `rust`) and the value is the version string understood by mise (e.g. `"22"`, `"3.12"`, `"stable"`). Multiple toolchains are listed as separate list items.

```yaml
toolchains:
  - { node: "22" }
  - { python: "3.12" }
```

---

## `box`

Runtime configuration for the microVM instance.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `name` | string | yes | — | Logical name for the box. Must match `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `resources` | object | no | see sub-fields | CPU, memory, and disk allocation. |
| `resources.memoryMib` | integer | no | unset | RAM in mebibytes. Minimum 256. |
| `resources.cpus` | integer | no | unset | vCPU count. Minimum 1. |
| `resources.diskGib` | integer | no | unset | Root disk size in gibibytes. Minimum 1. |
| `personalLayer` | object | yes | — | Persistent layer for user-specific state. Exactly one of `volume` or `mount` must be present. |
| `volumes` | list of objects | no | `[]` | Named microsandbox volumes to create and attach. |
| `volumes[].name` | string | yes | — | Volume name. Must match `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `volumes[].mount` | string | yes | — | Absolute path inside the box where the volume is mounted. |
| `mounts` | list of objects | no | `[]` | Host paths to bind-mount into the box. |
| `mounts[].host` | string | yes | — | Path on the host. `~` is expanded. |
| `mounts[].guest` | string | yes | — | Absolute path inside the box. |
| `mounts[].readonly` | boolean | no | `false` | If `true`, the mount is read-only inside the box. |
| `ports` | list of objects | no | `[]` | Host-to-guest TCP port forwards. |
| `ports[].host` | integer | yes | — | Port number on the host. |
| `ports[].guest` | integer | yes | — | Port number inside the box. |
| `network` | object | no | unset | Outbound network policy. |
| `network.policy` | string | yes (if `network` present) | — | One of `none`, `public-only`, `nonlocal`, `allow-all`. See notes below. |
| `network.denyDomainSuffix` | list of strings | no | `[]` | Additional domain suffixes to block (applies on top of the policy). |
| `network.tlsIntercept` | boolean | no | `false` | Whether to enable TLS interception for inspection. |
| `ssh` | object | no | unset | SSH server configuration. |
| `ssh.enabled` | boolean | yes (if `ssh` present) | — | Whether to start the in-box SSH daemon. |
| `ssh.user` | string | yes (if `ssh` present) | — | Username inside the box to accept connections for. Must match `^[a-z_][a-z0-9_-]*$`. |
| `ssh.authorizedKeysFromHost` | string | yes (if `ssh` present) | — | Path to a public key file on the host whose contents are injected into the box's `authorized_keys`. |
| `identity` | object | no | unset | Host identity forwarding into the box. |
| `identity.forwardSshAgent` | boolean | yes (if `identity` present) | — | Whether to forward the host `SSH_AUTH_SOCK` into the box. |
| `features` | object | no | unset | Optional capability flags. |
| `features.docker` | boolean | no | `false` | Enable Docker-in-box support (requires compatible base image). |
| `features.clipboard` | boolean | no | `false` | Enable clipboard sharing between host and box. |

**`box.personalLayer`** — exactly one of `volume` or `mount` must be specified, not both.

- `volume` form: `{ volume: { name: <string>, mount: <path> } }` — uses a named microsandbox volume. The volume persists across box rebuilds and is identified by `name`. `mount` is the path inside the box.
- `mount` form: `{ mount: { host: <path>, guest: <path>, readonly?: <bool> } }` — uses a host directory. Useful when you want the personal layer to live on your host filesystem.

**`box.network.policy` values:**

| Value | Meaning |
|---|---|
| `none` | No outbound network access. |
| `public-only` | Allows connections to public internet addresses only; blocks RFC-1918 and link-local ranges. |
| `nonlocal` | Allows all non-loopback traffic (public internet and private networks reachable from the host). |
| `allow-all` | Unrestricted outbound access including loopback. |

---

## `secrets`

Declares secrets that komora injects into the box at start time. See [docs/secrets.md](secrets.md) for the full secrets model.

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `workload` | list of objects | no | `[]` | API keys and tokens scoped to specific domains. |
| `workload[].name` | string | yes | — | Environment variable name injected into the box. Must match `^[A-Z_][A-Z0-9_]*$`. |
| `workload[].domain` | string | yes | — | Domain that the secret is bound to. Non-empty string. komora uses this for scoped injection and audit. |
| `identity` | list of strings | no | `[]` | Identity credentials to forward. Only `"ssh-agent"` is currently valid. |

**`secrets.workload` domain binding** — each workload secret is associated with a `domain` that indicates which service the credential belongs to (e.g. `api.anthropic.com`). komora uses this metadata to scope injection: the secret's value is read from the host keychain at box start and injected as the named environment variable. The `domain` field does not restrict network access on its own; it is informational and used for grouping and auditing.

**`secrets.identity`** — currently the only supported value is `"ssh-agent"`. Including it is equivalent to setting `identity.forwardSshAgent: true` in the `box` section; both must be consistent. The `identity` secrets list is the declarative record of which host identity credentials are forwarded.

---

## Full example

```yaml
version: 1

image:
  base: docker.io/library/debian:12-slim
  toolchains:
    - { node: "22" }
    - { python: "3.12" }
    - { go: "1.23" }
    - { rust: "stable" }
  agents:
    - claude
    - opencode
    - gemini
  packages:
    - tmux
    - zsh
    - neovim
    - ripgrep
    - fzf
    - direnv
    - mise

box:
  name: komora-box
  resources:
    memoryMib: 8192
    cpus: 4
    diskGib: 64
  personalLayer:
    volume: { name: personal-layer, mount: /home/komora/.local }
  volumes:
    - { name: claude-home,   mount: /home/komora/.claude }
    - { name: opencode-home, mount: /home/komora/.opencode }
    - { name: gemini-home,   mount: /home/komora/.gemini }
  mounts:
    - { host: ~/Projects,        guest: /home/komora/Projects }
    - { host: ~/.config/git,     guest: /home/komora/.config/git, readonly: true }
  ports:
    - { host: 2222, guest: 22 }
  network:
    policy: nonlocal
    denyDomainSuffix: []
    tlsIntercept: false
  ssh:
    enabled: true
    user: komora
    authorizedKeysFromHost: ~/.ssh/id_ed25519.pub
  identity:
    forwardSshAgent: true
  features:
    docker: false
    clipboard: true

secrets:
  workload:
    - { name: ANTHROPIC_API_KEY, domain: api.anthropic.com }
    - { name: OPENAI_API_KEY,    domain: api.openai.com }
    - { name: GITHUB_TOKEN,      domain: api.github.com }
  identity:
    - ssh-agent
```
