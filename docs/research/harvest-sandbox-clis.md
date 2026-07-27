# Idea harvest — existing sandbox CLIs (issue #2, harvest half)

Survey of ~14 already-cloned agent-sandbox projects, plus a summary of what
this repo's own prior design spec (`archive/komora-research`) already
settled. This is an **idea harvest**, not an adopt/fork evaluation — the
implementation language for komora is already decided (Go).

Sources: `/tmp/komora-harvest/{ai-pod,jail-ai,ai-jail}` and
`/tmp/sbx/{OpenShell,agent-vm,drydock,hort,mattolson_agent-sandbox,
marvincaspar_agent-sandbox,thomaspeklak_agent-sandbox,nono,sandbox-runtime,
sandboxed.sh,yolobox}`.

Companion doc: the ownership-probe track (issue #2's other half) covers
`--userns=keep-id`, `:U`, and idmapped-mount experiments directly — not
duplicated here.

## 0. What `archive/komora-research` already settles

The `archive/komora-research` branch holds a prior design spec
(`docs/superpowers/specs/2026-04-18-komora-design.md`) and a Rust PoC
(`poc/`) for an earlier, **VM-backed** architecture — not the rootless-Podman
approach this harvest is scoped for. Key points, since they bound what's
still open:

- **Different substrate.** The prior design wrapped
  [microsandbox](https://github.com/microsandbox/microsandbox) (libkrun
  microVMs via virtio-fs), not OCI containers. It therefore never had to
  solve rootless-Podman UID mapping — virtio-fs has its own (separate)
  host/guest UID translation story, which the spec did not need to resolve
  because the project paused before shipping. **This means the current
  project's load-bearing ownership question (`--userns=keep-id`, `:U`,
  idmapped mounts) is genuinely unanswered by prior work, not just
  unrecorded** — it's a new question created by the pivot to containers.
- **Project status: PAUSED, not abandoned, not solved.** The blocker was
  unrelated to ownership: microsandbox's `SecretsConfig`/MITM proxy only
  rewrites *request*-side traffic
  (`crates/network/lib/secrets/config.rs:60-77`,
  `crates/network/lib/builder.rs:301-319`), not response bodies
  (`crates/network/lib/tls/proxy.rs:244-256` writes the server buffer
  through untouched). That blocks OAuth-token interception for Claude
  subscription (Pro/Max) users specifically, because Docker Sandboxes'
  equivalent flow (`/login` inside the sandbox, host-side proxy rewrites the
  OAuth response before it reaches the guest) requires exactly that
  response-side rewrite. Using `ANTHROPIC_AUTH_TOKEN` gateway-style
  injection was ruled out separately for subscription users: Anthropic's
  ToS (code.claude.com/docs/en/legal-and-compliance) forbids using
  Claude Pro/Max OAuth tokens outside Claude Code itself, and server-side
  enforcement (deployed 2026-01-09) actively rejects third-party clients
  presenting a subscription bearer.
- **Confirmed working on stock microsandbox v0.3.14** (via the PoC's
  integration tests): network default-deny + domain allowlist (T1, 5/5
  passing), TLS MITM with CA injection (T2, 3/3 passing — note the gotcha
  that `apk add ca-certificates` wipes msb's injected CA from the guest
  trust store and must be re-seeded from `/.msb/tls/ca.pem` after any
  package install touching the CA bundle), and request-side secret
  injection/header substitution (T3, 2/2 passing). ssh-agent forwarding
  (T5) and full-stack smoke (T6) were never started.
- **Relevant for the current Go/Podman direction**: the credential-brokering
  problem (subscription OAuth vs API key, response-body rewrite
  requirement) is architecture-agnostic and will resurface if komora ever
  wants a MITM-based credential isolation story on containers too — a
  container-native equivalent would need the same response-rewrite
  capability from whatever proxy library is chosen in Go. The domain
  allowlist / DNS-tunneling-defense design (`docs/GOALS.md`, prior spec
  §4.3: blocking DoT port 853 globally, hardcoded DoH resolver IPs on 443,
  and port 53 to non-sandbox resolvers) is reusable spec-language
  regardless of runtime.

## 1. File ownership approach per project

- **ai-pod** (Rust, podman/docker). Uses **named volumes**, not host bind mounts, for
  everything sensitive. The workspace itself IS bind-mounted (`-v <workspace>:/app:Z`,
  `/tmp/komora-harvest/ai-pod/src/container.rs:722`), so ownership is not solved there —
  it's punted to the user. `ContainerRuntime::warn_if_rootless_userns_mismatch`
  (`runtime.rs:149-187`) detects rootless Podman with a configured `/etc/subuid` range and
  **just prints a warning** telling the user to set `PODMAN_USERNS=keep-id` themselves; it
  never sets the flag automatically. Cost: silent breakage by default — first-write `EACCES`
  unless the user has read the warning and exported the env var before invoking the binary.
  For the *volume*-backed home dir and "mask" dirs (per-directory shadow volumes that hide a
  subtree of the workspace from the agent, e.g. `.git`), ownership is solved differently: a
  disposable `--user 0 --entrypoint chown` container chowns the fresh volume to the image's
  baked-in `ai-pod:ai-pod` user before first use (`seed_mask_volume`, `container.rs:59-84`).
  That works because named volumes have no host-side owner to preserve — only the in-container
  identity matters, so root-in-container chowning it once is sufficient and idempotent.
  User-supplied mounts (e.g. `~/.claude/skills`) use the SELinux `:z`/`:z,ro` label suffix,
  not a uid remap (`build_mount_args`, `container.rs:165-200`) — that solves SELinux context
  denial, not UID mismatch.

- **jail-ai** (Rust, podman). Simplest approach seen: always passes
  `--userns=keep-id` unconditionally in `build_run_args`
  (`/tmp/komora-harvest/jail-ai/src/backend/podman.rs:241-247`, comment: *"Preserve user ID
  mapping from host to avoid permission issues with bind mounts"*). No conditional logic, no
  detection — it's just always on. Cost: this only works because jail-ai's own persistent
  state (the "home" and per-jail "nix store" volumes, `podman.rs:254-274`) are podman *named
  volumes* (owned by the mapped keep-id UID at creation, no separate chown step needed) and
  the workspace is a plain bind mount that now round-trips through keep-id cleanly. Unlike
  ai-pod, there is no opt-out path and no warning system — either keep-id works for the
  host's rootless config or jail-ai just fails at container start.

- **ai-jail** (Rust). **Not container-based at all** — this is the one project in the set that
  is a pure Linux-namespace / bubblewrap (`bwrap`) sandbox on Linux and macOS Seatbelt
  sandbox-exec on macOS (`/tmp/komora-harvest/ai-jail/src/sandbox/mod.rs:1-27`, dispatch via
  `#[cfg(target_os = ...)]` to `bwrap`/`seatbelt` modules). Because there's no separate
  container filesystem, **ownership is a non-issue by construction**: bind mounts inside a
  bwrap namespace are the same inode, same host UID, on both sides — there is no UID
  remapping layer at all. This is a genuinely different answer to the ownership question:
  sidestep it by not virtualizing the filesystem in the first place. The tradeoff is weaker
  isolation than a container (shared kernel, no separate rootfs) and OS-specific code paths
  (bwrap vs Landlock vs seccomp vs Seatbelt, four separate backends to maintain). Directory
  visibility is controlled by an explicit allow/deny list instead of ownership at all: a
  hardcoded `DOTDIR_DENY` (`.gnupg`, `.aws`, `.ssh`, `.mozilla`, `.thunderbird`,
  `.basilisk-dev`, `.sparrow` — `mod.rs:35-43`) is never bound in, and a `DOTDIR_RW` allowlist
  (`.claude`, `.codex`, `.cargo`, `.npm`, `.docker`, etc. — `mod.rs:116-148`) is bound
  read-write. `--ssh` is the only way to exempt `.ssh` from the deny list
  (`dotdir_exemptions`, `mod.rs:451-457`).

- **thomaspeklak/agent-sandbox** (Rust, podman). Plain `--userns=keep-id` is the
  *default* `SecurityConfig` (`crates/ags/src/plan/types.rs:110-121`, `userns:
  Some("keep-id")`) — essentially free, host UID maps 1:1, no chown logic
  anywhere. Notably it also ships an explicit **opt-out**: a `root()` security
  profile "for package installs" that *omits* `userns` entirely and runs as
  `user: root`, with the comment *"UID 0 in the container maps to the host user
  (rootless podman default)"* (`types.rs:136-140`) — i.e. they consciously trade
  away the keep-id ownership guarantee only for the one workflow (installing
  system packages) where it gets in the way, rather than disabling it globally.
- **OpenShell** (Rust, multi-driver: podman/docker/kubernetes/vm). Does **not**
  use `--userns=keep-id` on the Podman driver. Instead runs the supervisor
  process as root-in-container (`user: "0:0"`,
  `crates/openshell-driver-podman/src/container.rs:957-1019`) and has the
  supervisor itself `setuid()`/`setgid()`/`chown()` down to the sandbox UID
  after preparing the filesystem — which requires deliberately *keeping*
  `SETUID`, `SETGID`, `CHOWN`, `FOWNER` in the capability set rather than
  dropping them (`container.rs:1006-1018`). It also needs an explicit
  `DAC_READ_SEARCH` capability add solely so the root supervisor can read
  `/proc/<pid>/fd/` of the differently-UID'd sandboxed process for
  policy/identity resolution — the kernel denies cross-UID access to those
  directories otherwise. Cost vs. keep-id: strictly more capability surface
  kept alive inside the container in exchange for not needing a
  subuid/subgid range configured on the host. The Kubernetes driver takes the
  pod-level equivalent (`spec.hostUsers: false`, `e2e/rust/tests/user_namespaces.rs`)
  but that whole e2e test is `#[ignore]`d with an inline postmortem
  admitting it's unreliable in Docker-in-Docker dev clusters (see §8).
- **agent-vm** (Rust, VM-backed via libkrun/microsandbox). The ownership
  question genuinely does not exist in this architecture: the guest VM boots
  as its own root and virtio-fs shares two host directories (cwd → `/workspace`,
  state dir → `/agent-vm-state`) without any UID-remap step
  (`ARCHITECTURE.md:236-244`). The cost shows up elsewhere instead: virtio
  devices each consume an IRQ pin, and the default in-kernel IOAPIC caps out
  around 11 usable pins for the whole VM — saturated by exactly the two fs
  mounts plus net/vsock/console, so a third mount used to fail with
  `IrqsExhausted` until they enabled `split_irqchip` to raise the ceiling to
  ~219 (at the cost of one extra worker thread per VM). Confirms the
  archive/komora-research point in §0: VM-backed designs trade the
  container-ownership problem for a different resource-ceiling problem.
- **marvincaspar/agent-sandbox** (Bash + Docker). Cheapest mechanism seen:
  explicit `--user "$(id -u):$(id -g)"` at `docker run` time, combined with an
  image built so `/home/piuser` is `chmod 1777` and `/etc/passwd` is
  `chmod a+w` — the entrypoint then appends a matching passwd line for
  whatever UID shows up at runtime so `getpwuid(3)` resolves
  (`pi/entrypoint.sh:4-10`). Comment notes plainly: *"700 would block a
  non-matching UID."* No capability grants needed, no chown pass, no keep-id
  — but it depends entirely on the image being built with world-writable
  permissions on exactly the right paths, which is easy to get wrong when
  copying the pattern to a new image.

## 2. Credential injection

- **ai-pod**: `~/.claude.json` is `podman cp`'d from host into the named home
  volume on first init only (`copy_claude_json`, `container.rs:405-417`);
  on every launch it's pulled back out, patched with an `mcpServers.ai-pod`
  entry carrying **literal** `api_key`/`session_id` values (not `${VAR}`
  placeholders — see gotcha below), and copied back in
  (`refresh_claude_mcp_in_volume`, `container.rs:484-557`). Git identity
  copied the same way (`write_gitconfig_to_volume`, `container.rs:339-371`).
  Because the home dir is a named volume, not a bind mount, an OAuth login
  done inside the container persists in the volume but is invisible on the
  host filesystem.
- **jail-ai**: opposite choice — host `~/.claude` is bind-mounted directly
  (`mount_agent_configs`, `jail_setup.rs:95-135`), or just the single
  `.credentials.json` file when `HAS_AUTO_CREDENTIALS` is set. A login done
  inside the container writes straight back to the real host
  `~/.claude/.credentials.json`. `--network=host` and `--network=private`
  (slirp4netns) are both framed in the code specifically as *"to allow
  callbacks to localhost"* / *"supports port forwarding"* for OAuth
  (`podman.rs:312-318`) — i.e. the network mode choice is driven by the
  OAuth callback requirement, not general connectivity.
- **ai-jail**: no copy/injection step at all — host dotdirs in `DOTDIR_RW`
  (`.claude`, `.gemini`, `.codex`, `.cargo`, `.npm`, etc., `mod.rs:116-148`)
  are bound read-write at their real host paths; `.ssh`/`.gnupg`/`.aws`/
  `.mozilla` etc. are hard-excluded (`DOTDIR_DENY`) unless explicitly
  exempted (`--ssh`). Because it's the same filesystem, no separate
  re-login story is needed — the host's existing session works unmodified.
- **yolobox**: per-tool config flags (`--claude-config`, `--codex-config`,
  `--gemini-config`, `--gh-token`, `--git-config`) plus an env-passthrough
  allowlist (`ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, etc.,
  `main.go:50-70`) unless `--no-env-passthrough`. Symlinks inside `~/.claude`
  are dereferenced into a staged temp copy before mounting
  (`runtime_support.go:63-120`) specifically to avoid host-symlink escape or
  breakage across the mount boundary. No host-browser OAuth re-login bridge
  — relies entirely on copying in whatever credential files already exist.
- **drydock**: the one project that treats credential injection as the
  central design problem rather than a convenience feature. Real API keys
  never cross into the VM: `internal/gateway/provider.go` mints a
  short-lived, per-task, budget-capped bearer and only
  `ANTHROPIC_BASE_URL`/`ANTHROPIC_AUTH_TOKEN` (or the OpenAI equivalents)
  are injected. The real key lives host-side in `~/.drydock/api-keys.env`
  (mode 0600) and is read once by the broker daemon. Subscription
  (OAuth) mode is weaker: full OAuth access/refresh tokens are stored
  host-side (`~/.drydock/claude-oauth.json`, mode 0600) and SECURITY.md
  admits three times, verbatim, that these are **"Not per-task
  revocable"** — a documented residual risk, not a solved problem.
- **sandboxed.sh**: also deliberately avoids putting secrets in the
  environment of the sandboxed process. `git_credentials.rs` resolves a
  GitHub token (dashboard OAuth → env vars → workspace-scoped env) and
  writes `~/.git-credentials` (mode 0600) plus a sentinel-delimited managed
  block in `~/.gitconfig`, but the env var handed to the sandboxed process
  carries only a **file path**
  (`SANDBOXED_SH_GIT_CREDENTIALS_FILE`), with the comment: *"The env
  carries only a file path, never the OAuth token, so nsenter shell argv
  cannot expose it."* Credentials are written to a sandboxed subdir
  (`.sandboxed-sh/git-home`) instead of the operator's real `$HOME` to
  avoid clobbering the operator's own dotfiles.
- **sandbox-runtime**: inverts the direction entirely — its
  `maskedFileBinds` mechanism (`linux-sandbox-utils.ts:54-63,1256-1261`)
  **read-blocks** credential files by `--ro-bind`-mounting a decoy file
  over the real one, rather than injecting anything. No OAuth handling.
- **thomaspeklak/agent-sandbox**: persistent named cache volumes per agent
  tool baked into the launch plan (`plan/build.rs:76-86`, e.g.
  `claude-install → /opt/claude-home`, `npm-global → /home/dev/.npm-global`).
  Host-browser OAuth is handled by a purpose-built **auth_proxy** subsystem
  (`crates/ags/src/auth_proxy/{host.rs,protocol.rs}`): the container-side
  shim sends `ShimMessage::OpenUrl{session_id, url, callback_port}` over a
  Unix socket to the host; when `callback_port` is set (localhost OAuth
  redirect), the host captures the loopback HTTP callback and relays it back
  as `HostMessage::CallbackRequest`, which the shim replays against the
  container-local server — a genuine localhost-OAuth-callback relay in
  ~90 lines of protocol code, worth studying directly if komora ever needs
  this without falling back to `--network=host`.
- **agent-vm**: the most elaborate credential story here — a "two-layer
  placeholder dance" (`ARCHITECTURE.md:364-397`). Host reads
  `~/.claude/.credentials.json` / `~/.codex/auth.json`, extracts the real
  token host-side, registers it with microsandbox as a secret keyed to a
  stable placeholder string, and writes a **placeholder** credentials JSON
  (same shape, fake token) into the guest state dir; microsandbox's
  TLS-intercepting proxy splices the real token back in only on egress to
  an allow-listed host — "the agent inside the VM never sees the real token
  in any form." Explicitly documented gaps: no token-refresh support yet,
  and no MITM of the OAuth refresh endpoint (unlike "the original Bash
  agent-vm," which does forge refresh responses) — i.e. this is the same
  request-vs-response-side MITM distinction the archive spec (§0) hit,
  independently rediscovered here, and still incomplete.
- **marvincaspar/agent-sandbox**: bind-mounts `~/.pi/agent`,
  `~/.config/opencode`, `~/.config/acli` read-write, plus forwards a
  hardcoded env allowlist (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.).
  OAuth re-login on macOS requires Docker Desktop's "Host Networking" so the
  browser callback reaches the container, PLUS a `fake-browser`/`xdg-open`
  shim that writes the auth URL to a log file which the host wrapper tails
  and opens with the real host browser (`pi/pi:169-255`), with a documented
  WSL-specific branch (`wslview`/`explorer.exe`) and a Mac-specific reason
  for polling a log file instead of a true named pipe: *"VirtioFS does not
  support mounted FIFOs on macOS"* (`pi/pi:234-235`).
- **mattolson_agent-sandbox**: credentials never touch the agent container
  directly. A separate `proxy` container bind-mounts
  `${AGENTBOX_SECRET_DIR:-~/.config/agent-sandbox/secrets}` read-only, with
  `bind.create_host_path: false` so Compose fails loudly instead of
  silently creating an empty secrets dir. Git auth is injected via a
  `GIT_ASKPASS` shim (`agentbox-git-askpass.sh`) reading exported
  `AGENTBOX_GIT_FAKE_USERNAME`/`PASSWORD`, themselves sourced from
  `/etc/agent-sandbox/shell-init.sh` at shell startup — which is also the
  gotcha (see §8): already-running processes don't see a credential
  refresh until a fresh shell is opened.

## 3. Launch UX

- **ai-pod**: no subcommand needed for the default launch path; `ai-pod
  build`/`ai-pod serve` (background MCP coordination server on :7822)/
  `ai-pod init` (drops an editable Dockerfile into the workspace). Notably,
  the shipped `ai-pod.Dockerfile` `curl`s install scripts from the ai-pod
  server's own `/install/claude.sh` endpoint at build time — image build
  requires `ai-pod serve` to already be running. No documented cold/warm
  timings.
- **jail-ai**: `jail-ai claude` / `jail-ai codex` per-agent subcommands,
  each triggering auto-detected layered-image build/reuse
  (`ensure_layered_image_available`). `--upgrade` forces layer rebuild +
  container recreation.
- **ai-jail**: `ai-jail claude` (or any command) directly execs
  bwrap/sandbox-exec around the host binary — no image, no build step, by
  construction the fastest cold start of anything surveyed. `--dry-run`
  prints the would-be invocation.
- **yolobox**: direct subcommands per tool (`yolobox claude`, `yolobox
  codex`, ...); bare `yolobox` runs a configured `default_harness` or drops
  to shell. `yolobox fork --name <env> <cmd>` copies the project into a
  named directory with its own Compose namespace. An optional `--setup`
  TUI wizard persists config to `~/.config/yolobox/config.toml`.
- **drydock**: not interactive at all — a broker (`brokerd`) + CLI
  submitting queued tasks (`drydock approve`, `drydock pending`, `drydock
  prune`), batch-oriented rather than `docker run -it`.
- **sandboxed.sh**: `git clone && cp .env.example .env && docker compose
  up -d` for the all-in-one path; README states native install is "~30
  minutes." Cold start bootstraps a whole distro (debootstrap/pacstrap) per
  new workspace unless a cached rootfs tarball exists; warm start restores
  from that cache via `tar xf`.
- **mattolson_agent-sandbox**: `agentbox` Go CLI drives `docker compose`,
  layering per-agent overlay compose files (`agent.claude.yml`, etc.) on a
  `base.yml`. Devcontainer JSON templates are also generated as an
  alternate VS Code entry point.

- **thomaspeklak/agent-sandbox**: single `ags`/`pi`/`codex`/`opencode` CLI
  invocation builds an in-process `LaunchPlan`, then shells to
  `podman run --rm -it --pull=never`. No cold/warm timing published.
- **agent-vm**: the one project with hard numbers
  (`LAUNCH-PROFILE.md`): cold total **~4.1s** (2.2s pre-boot GitHub/registry
  network calls + 1.5s kernel boot + 270ms run + 50ms stop). After they
  cached the `gh api user` identity lookup for 24h and made the update
  check non-blocking, warm-cache launch dropped to **~1.9s total, ~32ms
  pre-boot** — a concrete before/after regression-and-fix case worth
  reading in full (see §8; the regression itself was self-inflicted).
- **OpenShell**: gRPC `sandbox create` through the gateway — heavier
  ceremony (server + separate driver process), no timing numbers found.
- **marvincaspar/agent-sandbox**: `pi`/`opencode` Bash wrappers invoking
  `docker run` directly; auto-builds the image on first run if missing.

## 4. Lifecycle

- **ai-pod**: `--rm -it` per session (ephemeral container), but state
  persists in named volumes keyed by a workspace-path hash. Container names
  are `ai-pod-{hash}-{session_id}`; concurrent sessions on one workspace get
  distinct containers sharing one home volume. The per-workspace bridge
  network is created **up front**, not lazily, because *"Lazy attach via
  `podman network connect` after the fact does not work for rootless podman
  (slirp4netns containers cannot be added to additional networks)"*
  (`container.rs:702-708`) — a rootless-Podman networking gotcha worth
  carrying forward regardless of language.
- **jail-ai**: containers are long-lived (`podman run -d ... tini --
  sleep infinity`), not `--rm`, and interacted with via `podman exec`.
  Naming: `jail__{project}__{hash}__{agent}`; the trailing `__{agent}`
  segment is stripped to derive a shared per-project base name used for a
  shared Nix-store volume across agents on the same project.
- **ai-jail**: no persistent container — lifecycle is exactly the wrapped
  process's lifetime.
- **yolobox**: `--rm` per invocation with persistent named volumes for
  home/cache (skippable via `--scratch`). `--name` gives a fixed container
  name, with the setup wizard itself warning that "fixed names cannot run
  concurrently." `--pod <name>` joins an existing Podman pod for shared
  networking (Podman-only, validated at startup).
- **drydock**: every task gets a genuinely fresh VM (`--rm` semantics per
  THREAT_MODEL.md: *"Every task runs in a fresh VM"*); a separate,
  persistent "anchor container" exists solely to keep the vmnet gateway IP
  alive between tasks.
- **mattolson_agent-sandbox**: deliberately long-lived — the base image's
  entrypoint is `sleep infinity`; `agentbox exec` attaches to the running
  container rather than spinning up a new one each time.

- **thomaspeklak/agent-sandbox**: `podman run --rm` per invocation
  (ephemeral container) but persistent named cache volumes (pnpm-home,
  claude-install, cargo-home, go-path, etc.) survive between runs — apparent
  statefulness without a long-lived container. A separate
  `update_agents.rs` runs a throwaway container purely to refresh agent
  installs inside those persistent volumes.
- **agent-vm**: per-project state directory keyed by a hash of cwd
  (`$XDG_STATE_HOME/agent-vm/<hash>/`); one virtio-fs state mount holds all
  agents' persistent config via symlinks baked into the rootfs overlay. The
  VM itself is ephemeral per launch; only the host-side state persists.
- **OpenShell**: sandboxes are first-class resources with an explicit
  gRPC create/delete/watch/list lifecycle — a server managing many
  sandboxes, not a thin CLI-per-invocation wrapper like the rest of this
  set.
- **marvincaspar/agent-sandbox**: fully ephemeral `docker run` per
  invocation; `pi-net-$$`/`pi-proxy-$$` names use the shell PID for
  uniqueness, teardown via `trap`.

## 5. Image

- **ai-pod**: `FROM rust:latest` — a notably heavy base for a general
  coding-agent sandbox (comment doesn't explain why Rust specifically, vs.
  a slim base plus toolchain install). Claude Code / OpenCode installed via
  curl-pipe-bash from the tool's *own* server. A leftover hardcoded git
  identity (the original author's own name/email) ships as the
  Dockerfile-level fallback, overridden at seed time if the host has a git
  global identity — worth flagging as an easy thing to forget to
  genericize when adapting a Dockerfile from an upstream project.
- **jail-ai**: most granular image strategy of everything surveyed — a
  `base.Containerfile` plus optional stacked layers
  (rust/python/nodejs/golang/java/csharp/cpp/php/terraform/kubernetes/
  aws/gcp/nix), auto-detected per project, plus separate per-agent
  Containerfiles. Avoids one monolithic image at the cost of a
  layer-resolution/build-orchestration subsystem.
- **ai-jail**: no image (host-process sandbox).
- **mattolson_agent-sandbox**: `debian:bookworm-slim`, but git is built
  from source and sha256-pinned because *"Debian bookworm ships Git
  2.39.5, which cannot create relative worktree metadata"*
  (`Dockerfile:90-91`) — a specific, non-obvious toolchain-version gotcha.
  Personal dotfiles are **not** baked in — a minimal built-in
  `.zshrc`/`tmux.conf` ships, and `entrypoint.sh` auto-links a mounted
  `~/.dotfiles` directory at container start if present. Skills are baked
  into the image and then symlinked out at startup.
- **hort**: (design contract, not working code) the example Dockerfile
  explicitly forbids the rootfs image from defining `CMD`/`ENTRYPOINT` that
  runs an agent, since hort injects `sleep infinity` as anchor itself, and
  requires `chmod 1777 /workdir` instead of a fixed-uid `chown` — because
  hort intends to map its own container user to whatever host uid owns the
  worktree, so nothing in the image may assume a fixed uid. **This is
  unimplemented**: the only `ContainerRuntime` port is `NullRuntime`
  (`/tmp/sbx/hort/src/adapters/runtime.rs:17-31`), whose every method
  returns `Err(HortError::RuntimeUnavailable)` — grep across `src/` finds
  zero `podman`/`runc`/`youki` invocations. Treat hort's design notes as
  a spec to read, not evidence that the approach works.

- **thomaspeklak/agent-sandbox**: dedicated Containerfile, tmux config
  baked in; personal `.gitconfig` is handled by writing a *synthesized*
  file under a fixed container-home path rather than mounting the host's
  real one.
- **marvincaspar/agent-sandbox**: `cgr.dev/chainguard/node:latest-dev`
  pinned by sha256 digest, multi-stage per language (go, php8.4, php8.5) on
  a shared base. Personal shell config not baked — only agent config dirs
  mounted.
- **agent-vm**: ships a dedicated `chrome` user (uid 9999) for
  chrome-devtools-mcp; Node 22 plus Claude/OpenCode/Codex CLIs baked in via
  their own install scripts at image build time.
- **OpenShell**: an unusual image-distribution trick — the supervisor
  binary is shipped via Podman `image_volumes`, mounting the *supervisor's
  own image's* filesystem read-only into the sandbox container without
  ever starting a container from that image, specifically to override a
  community sandbox image's default `ENTRYPOINT` (e.g. one that defaults
  to `/bin/bash`) without having to rebuild that image.

## 6. TTY / clipboard / ports

- **ai-pod**: `-it` on interactive launch, but the ACP/IDE stdio path
  deliberately drops `-t`: *"Without a tty on stdin ... `-t` would allocate
  a pseudo-TTY that mangles the JSON-RPC byte stream the agent emits. Keep
  `-i` so stdin stays attached."* (`container.rs:826-834`). `attach`  uses
  `podman attach --detach-keys=ctrl-p,ctrl-q`.
- **jail-ai**: port mappings gated behind networking being enabled at all;
  both `--network=host` and `--network=private` are chosen specifically to
  make OAuth localhost callbacks work.
- **ai-jail**: explicitly preserves `TERM`/`COLORTERM`/`TERM_PROGRAM`/
  `TERM_PROGRAM_VERSION` for terminal fidelity, ships a custom `(jail)
  \w \$` PS1, and (for browser automation) disables Chromium's own
  sandbox because *"Chromium's own zygote/setuid sandbox does not survive
  this bwrap/userns setup reliably"* — a real double-sandboxing
  incompatibility, worked around by weakening one of the two sandboxes.
- **yolobox**: decides `-it` vs `-i` per-tool and per-invocation (e.g.
  `claude -p`/`--print` skips TTY) with the comment *"Docker/Podman PTYs
  merge stdout/stderr, so only attach a TTY when the command is actually
  interactive."* `--clipboard`/`--open-bridge` run local HTTP bridge
  servers with token auth, and are mutually exclusive with `--no-network`.
- **sandboxed.sh**: always uses `--console=pipe` for nspawn (no real TTY
  passthrough); binds `/tmp/.X11-unix` + forwards `DISPLAY` for a
  desktop-automation feature (sway/grim/wtype/Xvfb), not general terminal
  fidelity.
- **sandbox-runtime**: no container image, so no "publish a port" concept
  as such — network access for the sandboxed process instead goes through
  Unix-socket-to-TCP `socat` bridges (HTTP proxy on 3128, SOCKS on 1080),
  i.e. outbound-only proxying rather than inbound dev-server exposure.

- **thomaspeklak/agent-sandbox**: the richest terminal-fidelity surface
  seen — dedicated modules for clipboard relay, a "webview relay," a
  host-UI bridge/dialog system, and read-only Wayland socket passthrough
  for GUI apps, documented as an "App Origin Relay"/"Host UI Bridge" for
  forwarding dev-server-style content back to the host.
- **marvincaspar/agent-sandbox**: `-it` for TTY; `--network host` (no-proxy
  mode) or an isolated internal network (proxy mode) for dev-server port
  reachability. No clipboard/image-paste — only the OAuth URL-relay shim
  described in §2.
- **agent-vm**: `virtio-console` for TTY; a separate non-TTY streaming mode
  was added later specifically to support piping stdout into another tool.

## 7. Security posture

- **ai-pod**: proactively scans the *workspace* (not the container) for
  credential-shaped files before every bind-mount, since the whole
  workspace is otherwise visible to the agent by default (`.env*`,
  `id_rsa`/`id_ed25519`, `.npmrc`, `.netrc`, `credentials.json`,
  `service-account.json`, `terraform.tfstate`, `*.pem/*.key/*.p12/*.pfx`,
  `.aws/`, `.ssh/`, `.gnupg/`). Offers "Hide from AI" (moves file aside,
  replaces with a symlink host tools can still follow) vs "Expose" — an
  escape-hatch-with-warning model, not a hard deny.
- **jail-ai**: `--network=host` documented as *"Less secure but provides
  full access to host network services"*; Podman-in-Podman via a mounted
  rootless podman socket is opt-in and grants full container-management
  capability from inside the jail when enabled.
- **ai-jail**: the most explicit posture code of the podman-adjacent
  group. Docker-socket passthrough requires an explicit `--docker` flag
  AND is force-disabled under `--lockdown` or any browser profile, with a
  runtime warning naming exactly what it bypasses: *"...bypassing --mask,
  --deny-path, and Landlock. Disable with --no-docker."* — and the gating
  logic cross-references its own GitHub issue (#88) directly in code
  comments.
- **yolobox**: `warnSecurityRelaxations()` fires whenever `--cap-add`,
  `--device`, or `seccomp=unconfined` are used — *"Security-impacting
  runtime flags active (...). Ensure you trust the workload."* — again a
  warn-only, not block, model.
- **drydock**: real API keys, host filesystem, git credentials, and DNS
  resolution are all deliberately excluded from the VM (DNS is dropped
  entirely — only the egress-enforcing proxy resolves allowlisted hosts).
  Escape hatches are all named and scoped explicitly: `--auto-approve`
  ("the one knob that bypasses the [diff-review] gate"),
  `per_task_widening.requires_approval: false`, and `--no-token` (removes
  the web-UI bearer-token gate, "use it only on single-user machines").
- **mattolson_agent-sandbox**: `cap_drop: ALL` on both proxy and agent
  containers, with the agent container re-adding only
  `NET_ADMIN, NET_RAW, SETUID, SETGID` for its own firewall setup and
  privilege drop — not a broad `--privileged`. Passwordless sudo is scoped
  to exactly three named scripts, not general sudo. Startup hard-fails if
  firewall init fails.
- **sandboxed.sh**: the Docker install path uses `privileged: true`
  specifically to let nspawn nest inside Docker — a deliberately broader
  host grant traded for architecture convenience, called out plainly in
  the README's own install-method comparison table.
- **sandbox-runtime**: layered defense documented directly in code:
  default-deny filesystem (`--ro-bind / /` then allow-listed writes),
  `--unshare-net` (all-or-nothing network isolation — the code explicitly
  contrasts this with macOS's kernel-level domain allowlisting: *"Linux's
  `--unshare-net` provides only all-or-nothing network isolation. Domain
  filtering happens at the host proxy level, not the sandbox boundary"*),
  `--unshare-pid` always, and in "secure mode" `--unshare-user --cap-drop
  ALL --proc /proc` specifically to stop a root parent from letting the
  sandboxed process remount the ro-bind root. The escape hatch
  (`enableWeakerNestedSandbox`) explicitly drops the `--proc` protection
  for use inside unprivileged Docker, with the tradeoff spelled out in a
  comment: doing so "is possible to read host /proc and leak information
  about code running outside the sandbox."

- **OpenShell**: very explicit capability bookkeeping on the Podman
  driver — drops `DAC_OVERRIDE, FSETID, KILL, NET_BIND_SERVICE, NET_RAW,
  SETFCAP, SYS_CHROOT`, adds back `SYS_ADMIN, NET_ADMIN, SYS_PTRACE,
  SYSLOG, DAC_READ_SEARCH, SETPCAP` — every cap has an inline comment
  justifying it. Container-level seccomp is deliberately disabled
  (`seccomp_profile_path: "unconfined"`) because the in-container
  supervisor installs its *own* two-phase seccomp BPF filter at runtime
  that "self-seals by blocking further `seccomp(SET_MODE_FILTER)` calls
  after installation" — container-level seccomp would otherwise block the
  Landlock/seccomp syscalls the supervisor itself needs during setup. A
  genuinely interesting self-sealing pattern worth understanding before
  dismissing "unconfined" as automatically wrong.
- **thomaspeklak/agent-sandbox**: default posture is `keep-id` +
  `no-new-privileges` + `label=disable` + `cap-drop=all` +
  `pids-limit=4096`; a `lockdown()` variant adds `noexec` on `/var/tmp` and
  `/run`; the `root()` escape hatch (see §1) is documented plainly as
  existing "so the agent can install packages," trading away the entire
  hardened default for that one workflow.
- **marvincaspar/agent-sandbox**: `--cap-drop=ALL
  --security-opt=no-new-privileges --ipc=none`, non-root numeric UID, no
  Docker socket; an opt-in tinyproxy sidecar with a default-deny hostname
  allowlist restricted to ports 443/563. Escape hatch stated in the README
  itself: *"Without `--proxy`, the container has unrestricted internet
  access."*
- **agent-vm**: sets `IS_SANDBOX=1` specifically because upstream Claude
  Code refuses to run as root with `--dangerously-skip-permissions` unless
  that var is set — and here the in-guest user genuinely is root, with the
  argument being that VM isolation itself is the security boundary, so the
  usual non-root-in-container requirement doesn't apply. Worth flagging as
  a real precedent for "root-in-sandbox is fine if the isolation boundary
  is strong enough," which does *not* transfer to a plain container without
  the same VM-level guarantee.

## 8. Gotchas

Quoted verbatim, grouped by theme — this is the section worth reading in
full before building anything.

**Rootless-Podman UID mapping keeps needing patches, not one fix:**
- ai-pod: *"On rootless Podman, the default user-namespace mapping remaps
  the host user to container UID 0, so pre-existing workspace files appear
  root-owned inside the container and the agent hits EACCES on its first
  write. There's no way to fix that from inside ai-pod without weakening
  the namespace boundary..."* (`runtime.rs:149-156`) — and the fix is left
  entirely to the user remembering an env var.
- yolobox ships a **repair flag** for its own past bug: the `:U` volume
  suffix comment reads *"...repairs older keep-id volumes that were
  created with subordinate-ID ownership and now appear as uid/gid 999
  in-container"* (`runtime_support.go:42-44`) — i.e. even a project that
  gets keep-id right today still carries a live migration for volumes it
  got wrong in a previous version. This is strong evidence the "ownership
  mapping story is settled with one flag" assumption is optimistic —
  expect at least one iteration/regression class here in practice.
- ai-pod also had a real "stored mount bricks every future launch" bug: a
  stale/hand-edited `config.json` mount entry pointing outside the current
  `$HOME` used to hard-error rather than warn-and-skip; the regression test
  comment documents the fix explicitly.

**Networking + rootless Podman interact in non-obvious ways:**
- ai-pod: the per-workspace network must be attached **at container
  creation**, not lazily, because *"slirp4netns containers cannot be added
  to additional networks"* after the fact under rootless Podman
  (`container.rs:702-708`).
- jail-ai chose `--network=host` / `--network=private` specifically
  because OAuth callbacks need to reach `localhost`.

**Credential-shim and env-var timing:**
- mattolson_agent-sandbox: git-auth env exports only load at shell
  startup via `/etc/agent-sandbox/shell-init.sh`, so *"Already-running
  processes — including the agent process you started before applying the
  policy — do not see updated exports"* after a proxy policy reload;
  users must run `agentbox exec` (a fresh shell) to pick up new
  credentials.
- ai-pod bakes literal `api_key`/`session_id` values into `~/.claude.json`
  instead of `${VAR}` placeholders *"because `claude doctor` eagerly
  validates referenced env vars and warns if any context can't see
  them"* — a workaround for an upstream Claude Code CLI behavior, with the
  side effect that secrets sit in plaintext inside the persisted volume.

**Double-sandboxing incompatibilities:**
- ai-jail: *"Chromium's own zygote/setuid sandbox does not survive this
  bwrap/userns setup reliably, so browser profiles run Chromium without
  its internal sandbox"* — trading one sandbox layer for another rather
  than composing them.
- sandbox-runtime's own comment for the Docker-nested weaker mode: *"it is
  possible to read host /proc and leak information about code running
  outside the sandbox... not available when running in unprivileged
  docker containers so we support running without it if explicitly
  requested"* — an accepted, named weaker posture purely for Docker
  compatibility.
- sandboxed.sh cross-references this exact same class of problem from the
  other direction: *"EPERM here means a masked /proc is underneath
  (unprivileged Docker) and the kernel domination check refused the
  overmount... enableWeakerNestedSandbox targets exactly this
  environment"* — two unrelated projects independently hit and named the
  identical Docker-nesting `/proc`-overmount limitation.

**Reboot / persistence edge cases:**
- jail-ai's eBPF host-blocking loader does not survive a host reboot and
  self-heals lazily: *"⚠️ eBPF loader not running for container {} (likely
  due to system reboot)"* with an explicit reattach path, and the code
  explicitly refuses to trust anything but its own in-memory bookkeeping
  of which containers have an active loader.
- sandboxed.sh: *"A single live mount makes remove_dir_all fail with
  EBUSY — and worse, it would recurse into a live bind mount"* — a real
  workspace-teardown hazard requiring a mountinfo walk before deletion.

**Unimplemented-but-documented designs (read the docs, not the churn):**
- hort's own module doc for its no-op runtime: *"`NullRuntime`: the honest
  stand-in for the container runtime until the embedded one lands... any
  operation that would start a container reports that the runtime is not
  available"* (`adapters/runtime.rs:1-9`) — confirmed by grep: zero
  `podman`/`runc`/`youki` invocations anywhere in `src/`. Its egress-proxy
  adapter is likewise a stub: *"Stub until SP-1... TODO(A-S2): spawn/
  teardown pasta with the spike-pinned flags"* (`adapters/pasta.rs:1-6`).
  hort is a useful *design* to read (uid-mapping-to-worktree-owner intent,
  two-phase-commit-style sandbox metadata persistence before the anchor
  starts) but not evidence that the design has been validated in code.

**Non-authoritative diagnostics — don't gate policy on them:**
- sandbox-runtime's seccomp helper reads a suspect process's memory to
  report which path triggered a denial for logging purposes, and says so
  outright: *"That memory is ATTACKER-CONTROLLED and racy... the path
  reported here is a HINT for diagnostics and must never gate a policy
  decision."* — a good design principle to carry forward regardless of
  runtime: observability data from inside the sandboxed process is not
  trustworthy enough to enforce on.

**Credential-model residual risk, admitted rather than hidden:**
- drydock's SECURITY.md states, three separate times across the API-key
  and OAuth modes, that minted/stored credentials are **"Not per-task
  revocable"** — this is the same MITM-response-rewrite gap the prior
  `archive/komora-research` spec hit from a different angle (§0 above);
  drydock's mitigation is narrower scope + short expiry, not revocation.
- drydock also flags `task_budget_usd` as only a **soft cap**: *"the
  gateway meters a request's cost only once its response completes, so a
  request that is in flight has not yet been charged... a hostile in-VM
  agent could fire many requests concurrently to ride past the cap"* —
  mitigated by a low `task_max_inflight` default, not eliminated.

**Own e2e tests admitting they don't work / launch-time self-inflicted regressions:**
- OpenShell's Kubernetes user-namespace e2e test is `#[ignore]`d with an
  inline postmortem naming the exact blockers: kubectl invoked against a
  hardcoded container name with no setup for it in the repo, and the test
  mutating a StatefulSet's env triggering a mid-test pod rollout, so
  *"transient connection failures surface as a generic 'sandbox did not
  appear within 60s' with no actionable signal."* Also: *"The sandbox pod
  may fail to start in Docker-in-Docker dev clusters where the filesystem
  does not support ID-mapped mounts."*
- agent-vm's `LAUNCH-PROFILE.md` is essentially a mea culpa: a prior commit
  ("bake host gh/git identity into guest gitconfig") added a blocking,
  uncached `gh api user` network call to *every single launch*, doubling
  launch time before being caught and fixed with a 24h cache — a concrete
  example of a well-intentioned convenience feature quietly regressing
  cold-start UX.
- agent-vm, `ARCHITECTURE.md:583-590`: a real credential leak caught in
  their own Phase-4 verification: *"the first cut wrote the tokens to
  `<state>/tokens/{anthropic,openai}`, i.e. inside the [virtio-fs] mount,
  so `cat /agent-vm-state/tokens/anthropic`..."* would have exposed real
  tokens to the guest — moved to a sibling host-only `0700` dir once
  caught. Direct evidence that "just don't put secrets under the shared
  mount" is a real, easy-to-miss mistake even for a project built
  specifically around credential isolation.

## 9. Non-`podman run` architectures

- **jail-ai** additionally supports macOS's native `apple-container`
  runtime as a second backend (`backend/container_app.rs`) alongside
  Podman, plus an auxiliary eBPF loader process for host-blocking network
  policy — no Quadlet/systemd/pods, but a genuine multi-backend
  abstraction worth noting for a Go port that wants Docker+Podman+Apple
  container support behind one interface.
- **ai-jail** is the clearest non-container architecture in the whole set:
  bubblewrap (`bwrap`) namespaces + Landlock LSM + seccomp-BPF on Linux,
  macOS Seatbelt (`sandbox-exec`) on macOS — no image, no daemon, no
  separate rootfs at all.
- **nono** (not yet covered above) is likewise not container-based:
  README states outright *"no daemon, no container, no VM, and no disk
  space usage"* — Landlock/seccomp on Linux, Seatbelt on macOS, with a
  registry-distributed profile model (`nono run --profile
  nolabs-ai/opencode -- opencode`) and a notable per-tool re-sandboxing
  feature: delegated tool calls can be dropped into their *own*, more
  restrictive child sandbox that does not inherit the parent agent's
  broader `--allow` grants.
- **sandboxed.sh** uses `systemd-nspawn` with debootstrap/pacstrap-built
  rootfs trees as its actual isolation layer; Docker is only the outer
  packaging container for the control-plane web service, not the workload
  sandbox. One-shot command executions are wrapped in transient
  `systemd-run` scopes (tagged `sandboxed-exec-<token>-<uuid>`) for
  cgroup-based resource capping and discoverability.
- **sandbox-runtime** uses bubblewrap plus a custom, separately-compiled
  seccomp/BPF helper binary run inside its own nested PID+mount+user
  namespace specifically so the unfiltered wrapper processes are not
  addressable from inside — an explicit anti-ptrace design (*"the bwrap
  init, bash wrapper, and socat helpers are not addressable, so they
  cannot be ptraced or patched via /proc/N/mem even on systems with
  `kernel.yama.ptrace_scope=0`"*).
- **drydock** is VM-backed via Apple's `container` runtime + `vmnet`, with
  a broker daemon (`brokerd`) fronting a per-uid Unix socket and egress
  enforcement done via `squid` + `nft`, not container network policy —
  closer in spirit to the prior `archive/komora-research` microsandbox
  design than to any of the Podman-based projects here.
- **mattolson_agent-sandbox** runs a full Docker Compose stack (a
  mitmproxy-based `proxy` service + the `agent` service, connected via
  `HTTP_PROXY`/`HTTPS_PROXY` pointed at the proxy's Compose service name,
  health-checked), with policy files hot-reloadable via SIGHUP without a
  container restart, plus generated devcontainer.json templates as an
  alternate entry point into the same images.
- **OpenShell** is the clearest **pluggable-backend** architecture in the
  whole set: every driver (Podman, Docker, Kubernetes, VM) implements the
  same generated gRPC service trait (`create_sandbox`, `delete_sandbox`,
  `get_sandbox`, `list_sandboxes`, `stop_sandbox`, `watch_sandboxes`,
  `get_capabilities`, `validate_sandbox_create`), so drivers can run as
  **separate processes/binaries** speaking a stable proto contract to a
  central gateway rather than being in-process trait implementations. This
  is the strongest direct precedent for a Go komora that wants
  Podman-today, other-backends-later without a rewrite: define the gRPC
  (or even just Go interface) contract first, ship one driver.
- **agent-vm** is fully microVM-backed (libkrun via a vendored,
  patched fork of microsandbox) — no container runtime at all. It's the
  closest living relative of the *prior* `archive/komora-research` design
  in this whole harvest, and it independently hit and worked around the
  same problem class that spec paused on: OAuth token handling required
  extending microsandbox's secrets API (`SecretValue::File` variant, wire-
  compatible via a NUL-prefixed sentinel string so old daemons degrade
  gracefully) rather than working within stock microsandbox.
- **thomaspeklak/agent-sandbox**'s "plan" system
  (`crates/ags/src/plan/{types.rs,build.rs,build_env.rs,build_workdir.rs}`)
  is a pure in-process intermediate representation: a `LaunchPlan` struct
  (image, mounts, env, security config, network mode, entrypoint) is fully
  constructed and *validated* (mount existence/dir-ness checks, typed
  `PlanError` variants) before any podman invocation, and a separate
  renderer turns the validated plan into a flat `podman run` argv. There is
  exactly one backend here, but the plan/render split — build a typed,
  testable intermediate representation, then compile it to the specific
  runtime's CLI syntax as a last step — is a clean pattern for a Go
  implementation regardless of how many backends it eventually supports.

## Comparison table

| Project | Substrate | Ownership approach | Credential injection | Lifecycle | Notable escape hatch |
|---|---|---|---|---|---|
| ai-pod | Podman/Docker | warn-only, user sets `PODMAN_USERNS=keep-id`; volumes chowned via disposable root container | copy-in/copy-out of `.claude.json` to a named volume, literal secrets baked in | ephemeral container, persistent named volumes | none notable — mostly warn-and-continue |
| jail-ai | Podman (+ Apple `container`) | unconditional `--userns=keep-id` | direct bind-mount of host `~/.claude` | long-lived (`sleep infinity` + exec) | podman-in-podman socket mount (opt-in) |
| ai-jail | bwrap / Seatbelt (no container) | moot — same host UID throughout | direct bind-mount of allow-listed dotdirs | process lifetime | Docker socket passthrough (opt-in, gated, warned) |
| hort | designed for OCI, **unimplemented** | design-only: map container user to worktree owner | not implemented | designed long-lived per name | n/a — no working runtime yet |
| yolobox | Podman/Docker/Apple `container` | `--userns=keep-id:uid=…,gid=…` + `:Z,U` volume repair flag | per-tool config flags + env passthrough allowlist | `--rm` + persistent volumes | `--cap-add`/`--device`/`seccomp=unconfined` (warned, not blocked) |
| drydock | Apple `container` VM + broker | n/a (agent never touches host FS directly) | short-lived, budget-capped bearer tokens via gateway; OAuth stored host-side, **not per-task revocable** | fresh VM per task | `--auto-approve` bypasses diff-review gate |
| nono | Landlock/seccomp/Seatbelt (no container) | n/a | `--allow <path>` capability grants | process lifetime | `--allow-command` for blocked exec |
| mattolson_agent-sandbox | Docker Compose | fixed uid 501 baked into image (matches macOS default user) | mitmproxy sidecar + `GIT_ASKPASS` shim, secrets never in agent container | long-lived (`sleep infinity`) | none found — capabilities narrowly scoped |
| sandboxed.sh | systemd-nspawn (Docker for control plane only) | relies on nspawn's own idmap; not custom-solved | file-path-only env var pointing at a credentials file | persistent dirs, `--ephemeral` optional | Docker install path requires `privileged: true` |
| sandbox-runtime | bubblewrap + custom seccomp (no container) | moot — real host FS bind-mounted | `maskedFileBinds` (blocks reads, doesn't inject) | one process per command | `enableWeakerNestedSandbox` drops `/proc` protection for Docker nesting |
| OpenShell | gRPC-pluggable: Podman/Docker/Kubernetes/VM | root-in-container + supervisor `setuid()`/`chown()` down, extra caps kept live | gateway-mediated; root-only Podman secrets | gRPC create/delete/watch, server-managed | container-level seccomp deliberately `unconfined` (supervisor self-seals its own filter) |
| agent-vm | libkrun/microsandbox microVM | n/a — VM owns its own filesystem via virtio-fs | two-layer placeholder + MITM-splice of real token on egress; no refresh yet | ephemeral VM, persistent host state dir | root-in-guest accepted because VM is the isolation boundary |
| thomaspeklak/agent-sandbox | Podman | `--userns=keep-id` (default), explicit `root()` opt-out for package installs | persistent cache volumes + custom auth-proxy OAuth callback relay | `--rm` + persistent volumes | `root()` security profile, `lockdown()` for hardening up |
| marvincaspar/agent-sandbox | Docker (Bash scripts) | explicit `--user uid:gid` + world-writable image paths | env allowlist + bind-mounted config dirs; fake-browser URL relay for OAuth | fully ephemeral, PID-suffixed names | proxy is opt-in — unrestricted egress without it |

## Techniques worth adopting

1. **thomaspeklak's plan/render split** (`LaunchPlan` struct → validated in
   process → rendered to `podman run` argv as a last step). This is a clean
   fit for Go: build a typed, testable intermediate representation of "what
   this sandbox invocation should do," validate it before touching the
   runtime, and keep the runtime-specific argv-building as a thin final
   layer. It also makes a future second backend cheap without a rewrite.
2. **OpenShell's driver-as-gRPC-service contract.** Even if komora ships one
   backend (Podman) for a long time, defining the driver boundary as a
   small, explicit interface (create/delete/get/list/watch/capabilities) up
   front — rather than letting Podman-specific flag-building leak through
   the whole codebase — is what let OpenShell add Kubernetes and VM drivers
   without touching the gateway.
3. **jail-ai's unconditional `--userns=keep-id` for the simple case**, with
   thomaspeklak's `root()`-style *named, deliberate* escape hatch for the
   one workflow (package installs) that needs full root. Two clean states
   beat ai-pod's "warn and hope the user reads it" default.
2b. **yolobox's `:U` volume-repair flag as an admission, not an
   afterthought.** Whatever ownership mechanism komora ships v1 with, plan
   for a migration path from day one — yolobox needed one for its own past
   keep-id bug, and it's cheap to add now vs. retrofit later.
4. **drydock's named, scoped escape hatches with an explicit "what this
   bypasses" statement** (`--auto-approve`, `--no-token`,
   `per_task_widening.requires_approval: false`) rather than one big
   `--privileged`/`--insecure` knob. Same spirit in mattolson's narrowly
   re-added capabilities (`NET_ADMIN, NET_RAW, SETUID, SETGID`, not
   `--privileged`) and ai-jail's `docker_passthrough_active()` gate that is
   forced off under lockdown/browser modes regardless of the flag.
5. **sandboxed.sh's "env carries only a file path, never the secret"**
   design for anything that has to cross into the sandboxed process's
   environment — argv and env are both visible via `/proc/<pid>/environ`
   and `/proc/<pid>/cmdline` to anything with ptrace-adjacent access on the
   host side; a file path is strictly less exposure than the value itself.
6. **sandbox-runtime's principle that in-sandbox diagnostic data is never
   authoritative for policy** (`process_vm_readv` values are "a HINT for
   diagnostics and must never gate a policy decision") — worth writing into
   komora's own observability code from day one rather than relearning it.
7. **ai-pod's proactive workspace credential-file scan before mounting**
   (`.env*`, `id_rsa`, `.npmrc`, `.netrc`, cloud credential JSON, `*.pem`
   etc.) as a "hide from AI" prompt. Even a simple heuristic scan catches a
   real, common class of accidental exposure that a pure allow/deny-dotdir
   list (ai-jail's approach) misses, since it also covers files *inside*
   the project workspace itself, not just home-directory dotdirs.

## Techniques worth avoiding

1. **ai-pod's silent-by-default ownership handling.** A warning printed to
   stderr that the user must read *before* invoking the tool, with no
   automatic fix and no hard failure, is the worst of both worlds: it
   doesn't prevent the bug, and it's easy to miss in a busy terminal. Either
   auto-apply `keep-id` (jail-ai's approach) or fail fast with the fix
   command in the error, don't warn-and-continue.
2. **Baking a hardcoded personal identity into a Dockerfile as a "fallback"**
   (ai-pod's leftover author git identity). If a genericized example needs
   a fallback, use an obviously-placeholder value (`sandbox@localhost`),
   not a real person's name/email — this is an easy thing to forget to
   scrub when adapting an upstream Dockerfile, and it's a privacy leak
   nobody will notice until commits show up wrong.
3. **Relying on world-writable image paths for ownership** (marvincaspar's
   `chmod 1777`/`chmod a+w /etc/passwd`). It works, but it's brittle to
   replicate correctly on a new image and weakens the container's own
   internal permission model (any process in the container can now write
   those paths, not just the intended runtime user) — keep-id-style UID
   mapping is a cleaner boundary if the runtime supports it.
4. **One undifferentiated `--insecure`/`--privileged` toggle.** None of the
   more mature projects in this set do this — they all name specific,
   narrow escape hatches (drydock, ai-jail, mattolson). A single broad
   toggle makes it impossible to reason about what a user actually opted
   into, and it's the kind of thing that gets flipped on "just to make it
   work" and forgotten.
5. **Silent per-launch network calls that regress cold-start UX**
   (agent-vm's `gh api user` incident, which doubled launch time until
   caught and cached). Any convenience feature that adds a network round
   trip to the hot path needs an explicit cache-and-measure step before
   shipping, not after a user notices it's slow.
6. **Trusting in-container observability without a note that it's
   spoofable** — the inverse of the "adopt" item above: don't build
   anything (in komora's audit log, say) that reads process state from
   inside the sandbox and treats it as ground truth for an allow/deny
   decision, per sandbox-runtime's explicit warning about
   `process_vm_readv`-sourced data.

## Contradictions with the map's assumptions

Referring to issue #1's premises (rootless Podman + Go is a solved-enough
starting point for this project):

- **"Ownership is a solved problem with one flag" does not hold up.**
  Every project that touches it directly needed at least one additional
  mechanism beyond `--userns=keep-id` itself: ai-pod needs a disposable
  root-chown container for named volumes on top of the (unapplied) keep-id
  warning; yolobox needed a `:U` volume-migration flag to repair its *own*
  prior keep-id bug; OpenShell avoided keep-id entirely in favor of
  in-container `setuid()`/`chown()` with extra capabilities kept live;
  thomaspeklak needed an explicit `root()` opt-out for the one workflow
  keep-id breaks (package installs). None of the four Podman-based projects
  that actually ship this treat it as a single static flag with no
  follow-up work — the load-bearing ownership question this issue opened
  with is real, not a formality, and the ownership-probe track's own
  findings should be read alongside this: expect at least a chown-repair
  path and an explicit non-keep-id mode, not just one flag set once.
- **A meaningful fraction of the harvested corpus isn't container-based at
  all.** ai-jail, nono, and sandbox-runtime (3 of 14) use bubblewrap/
  Landlock/seccomp/Seatbelt directly with no container runtime, and
  sandboxed.sh's actual isolation layer is systemd-nspawn with Docker only
  wrapping the control plane. If komora's assumption is "rootless Podman is
  *the* mainstream approach for this problem space," that's true for only
  about half of what's actually been built and shipped — the other half
  independently decided a container runtime was unnecessary overhead for
  the same problem. That's not an argument to abandon containers (isolation
  strength differs meaningfully — namespace/seccomp sandboxes share a
  kernel and binaries with the host, VMs and containers don't), but it is
  evidence the "obviously containers" framing wasn't obvious to a
  meaningful share of prior builders, and it's worth being explicit in
  komora's own spec about *why* containers specifically (image
  reproducibility? stronger isolation? something else) rather than treating
  it as unquestioned.
- **The credential-brokering problem the prior `archive/komora-research`
  spec paused on (response-body MITM rewrite for OAuth subscription tokens)
  is not solved anywhere in this harvest either, container or VM-based.**
  agent-vm (VM-backed, closest architecture to the paused spec)
  independently hit and is still missing the same OAuth-refresh-response
  MITM capability the archive spec identified as its blocker. drydock
  sidesteps it by accepting "not per-task revocable" as a documented
  residual risk rather than solving it. No project in this harvest — Rust,
  Go, container, or VM — has a working response-side MITM rewrite for
  subscription OAuth tokens. If komora's Go rewrite intends to offer
  credential isolation *for subscription users specifically*, that
  capability gap is real and unaddressed industry-wide, not a
  Rust-vs-Go or container-vs-VM artifact — it should be scoped as its own
  slice with its own explicit go/no-go gate, the same way the archive spec
  originally did.
- **"A CLI wrapper around `podman run` is a thin, mostly-mechanical layer"
  undersells the actual scope once ownership, credentials, and lifecycle
  are all handled properly.** The more complete projects here (OpenShell,
  thomaspeklak, yolobox, ai-pod) all grew a plan/validate/render step, a
  credential-proxy or auth-relay subsystem, and non-trivial volume/lifecycle
  bookkeeping — none of them stayed a thin wrapper for long. Scoping komora
  P1 as "just shell out to podman with the right flags" likely
  understates the eventual surface area; the harvested precedent suggests
  budgeting for a typed launch-plan layer and a credential subsystem from
  the start rather than retrofitting them.
