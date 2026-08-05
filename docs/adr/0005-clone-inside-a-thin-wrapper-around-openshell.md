# ADR-0005: Clone inside — komora is a thin wrapper around OpenShell

- **Status**: Accepted
- **Date**: 2026-08-05
- **Ticket**: [#26 Update CONTEXT.md and ADRs for the clone-inside architecture](https://github.com/arteven/komora/issues/26), recording the decision made in [#14](https://github.com/arteven/komora/issues/14)
- **Supersedes**: [ADR-0001](0001-arch-base-image-recreatable-not-reproducible.md) in part (the base-image choice; its *recreatable* rule survives) and [ADR-0002](0002-ownership-machinery-around-keep-id.md) (except the uid rule, narrowed to volume priming)

## Context

komora's first architecture built its own chamber image and **bind-mounted the
host repo** into it. That premise generated most of the project's hard
machinery: a Containerfile and base-distro choice ([ADR-0001](0001-arch-base-image-recreatable-not-reproducible.md)),
and a body of userns ownership work to keep host files correctly owned across
the rootless boundary ([ADR-0002](0002-ownership-machinery-around-keep-id.md)).
Both were carried to a working state — [#6](https://github.com/arteven/komora/issues/6)'s
walking skeleton ran a real agent on a real repo with ownership, TTY,
credentials, and identity all holding.

Two things then changed the calculus.

**The machinery was permanent, not transitional.** Ownership repair, escape
mode, and `podman unshare` recovery were not scaffolding to be removed once the
design settled — they were the ongoing cost of mounting a host directory into a
userns-remapped container, and they would have to be maintained and re-verified
against every Podman change.

**OpenShell arrived as a viable substrate.** NVIDIA's OpenShell already provides
the sandbox lifecycle, a default-deny egress proxy, credential providers that
inject secrets at that proxy, port forwarding, and a community base image
carrying several agent CLIs. Nearly every remaining komora feature had a
counterpart there.

The decisive constraint was discovered rather than chosen: **bind-mounting a
host repo is structurally unavailable through OpenShell.** Its Podman driver
exposes no userns knob, so getting a writable host mount would require patching
that Rust driver *and* shipping a custom image — reintroducing the exact hard
machinery this change exists to shed. Note that enabling bind mounts in the
gateway config makes them *permitted*, not *usable*: the userns mapping still
denies the agent write access. Those are unrelated properties, and conflating
them cost a wrong conclusion.

## Decision

**komora is a thin wrapper around the `openshell` CLI. The repo is cloned
inside the sandbox; two persistent named volumes outlive it.**

### 1. Clone inside, never mount

The repo is cloned into a **repo volume** on chamber creation, over HTTPS,
inside the sandbox. No host directory is mounted.

This does not solve the ownership problem — it **deletes** it. There is no host
file that can acquire a subuid owner, so there is nothing to repair, no escape
mode, and no poisoned-tree recovery. It also removes host-side sync questions
entirely: the chamber's work tree *is* the work tree, and code leaves it the way
code normally leaves a machine — by being pushed
([ADR-0004](0004-git-push-credential-pat-at-the-proxy.md)).

The cost is accepted and real: work in progress lives on a volume rather than in
a host directory, so it is reachable only through a chamber or `podman volume`.
The volumes outliving the sandbox is what makes that acceptable.

### 2. Two volumes, and the sandbox is the disposable part

| Volume | Holds | Keyed on |
| --- | --- | --- |
| **Repo volume** (`komora-repo-<slug>`) | the cloned work tree | the repo |
| **Profile volume** (`komora-profile-<name>`) | agent credential, account binding, sessions, history, synthesized gitconfig | the profile |

Both outlive the sandbox, which is disposable by design. This makes
"disposable" literally true rather than aspirational: destroying a chamber
costs a re-create, and loses nothing.

It is also what satisfies [ADR-0001](0001-arch-base-image-recreatable-not-reproducible.md)'s
surviving test. Session history is genuinely **irreplaceable**, so it may not
live in a writable layer — the profile volume is where it goes.

### 3. Drive the CLI, not the API or the SDK

komora shells out to `openshell`. It does not link a library, speak a protocol,
or generate driver config beyond documented flags.

OpenShell is at `0.0.93` and documents `--driver-config-json` as *"validation
behavior is not yet finalized"*. Against a substrate moving that fast, the
cheapest coupling wins: an upstream break should cost a flag, not a protocol.

**Corollary — prefer OpenShell's own mechanism over komora storage.** Where
OpenShell already holds a thing, komora wraps it rather than reimplementing it:
secrets via providers, forwarding via `--forward` / `openshell service`, egress
rules via `--policy`.

### 4. Bash, not Go

The recorded Go preference rested on *"not a thin wrapper — no surveyed project
stayed thin"*. Clone-inside inverts that premise: the machinery that would have
justified a real program is the machinery this decision deletes.

Port to Go if the script outgrows itself.

### 5. Verify, never manage

komora depends on an OpenShell gateway but does not install, configure, or
select a compute driver for one. It runs a read-only preflight
(`openshell status`) and reports actionably when no gateway is reachable
([#20](https://github.com/arteven/komora/issues/20)).

The general shape: where OpenShell owns a thing, komora checks it and speaks to
its state, never reaches in to change it.

**The one deliberate exception is the egress policy** ([#29](https://github.com/arteven/komora/issues/29),
[#31](https://github.com/arteven/komora/issues/31)). A custom `--policy` fully
*replaces* the built-in default rather than merging with it — verified, not
assumed — so komora must vendor the **whole** base policy to change one rule.
This is the most expensive coupling to OpenShell komora has taken on, and it is
taken knowingly: the alternative is no egress control of its own at all.

## Facts verified against `openshell 0.0.93`

Recorded because each was asserted before being checked, and each would mislead
a reader who assumed otherwise.

- **`run_as_user` accepts the literal name `sandbox`**, not only a uid in
  `[1000, 2e9]` (`is_valid_sandbox_identity`, `crates/openshell-policy/src/lib.rs:961`);
  the shipped default policy already sets it. An earlier claim that the sandbox
  uid `998` falls outside the accepted range is true but irrelevant — the range
  never applies to it. Resolving the uid is still required, for **priming**.
- **Podman driver volume mounts default to read-only**
  (`crates/openshell-driver-podman/src/container.rs:117`); `read_only: false`
  must be set explicitly. The driver config is `deny_unknown_fields`, so typos
  fail loudly rather than being ignored.
- **The base image's shipped policy has the `git-receive-pack` write rule
  present but commented out** — precisely the rule komora's vendored policy
  enables ([ADR-0004](0004-git-push-credential-pat-at-the-proxy.md)).

## Consequences

**Accepted:**

- **The image is someone else's.** komora inherits its toolchain and cannot
  add to it without a per-repo `--from` image or an in-chamber install. No real
  instance has come up.
- **Vendoring the whole policy is a maintenance debt.** Upstream policy changes
  do not reach komora's chambers until someone diffs the image. There is no
  trigger, no cadence, and no test that would notice — tracked as open fog on
  the map.
- **Work in progress is volume-resident**, not host-resident.
- **One live sandbox per repo volume.** Two agents in one git work tree share
  index, `HEAD`, and `index.lock`; git has no concurrency control for this
  ([#28](https://github.com/arteven/komora/issues/28)).

**Gained:**

- The entire ownership problem class, gone by construction.
- No image to build, publish, or keep current.
- Egress control, credential injection, and port forwarding inherited rather
  than built.
- A wrapper small enough to stay bash.

**Superseded tickets:** [#7](https://github.com/arteven/komora/issues/7)
(command surface) and [#8](https://github.com/arteven/komora/issues/8) (profile
model) were answered by this architecture rather than designed separately —
#7's "budget for more than a wrapper" premise was inverted by clone-inside.
[#10](https://github.com/arteven/komora/issues/10) (dev-server reachability)
became a wrapping job rather than a build.
[#9](https://github.com/arteven/komora/issues/9) folded into
[#22](https://github.com/arteven/komora/issues/22) and is recorded in
[ADR-0004](0004-git-push-credential-pat-at-the-proxy.md).
[#11](https://github.com/arteven/komora/issues/11) (clipboard) is untouched by
this change and still valid.

## Revisit if

- OpenShell's Podman driver gains a userns knob **and** a host mount becomes
  genuinely wanted — note that clone-inside is now load-bearing for more than
  ownership, so this would be a re-decision, not a reversion.
- The wrapper stops being thin. The bash/Go trade turns on exactly that.
- Vendoring the policy becomes more expensive than the egress control it buys.
