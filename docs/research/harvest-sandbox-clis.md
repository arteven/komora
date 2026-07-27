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

_(status: pending)_

## 2. Credential injection

_(status: pending)_

## 3. Launch UX

_(status: pending)_

## 4. Lifecycle

_(status: pending)_

## 5. Image

_(status: pending)_

## 6. TTY / clipboard / ports

_(status: pending)_

## 7. Security posture

_(status: pending)_

## 8. Gotchas

_(status: pending)_

## 9. Non-`podman run` architectures

_(status: pending)_

## Comparison table

_(status: pending)_

## Techniques worth adopting

_(status: pending)_

## Techniques worth avoiding

_(status: pending)_

## Contradictions with the map's assumptions

_(status: pending)_
