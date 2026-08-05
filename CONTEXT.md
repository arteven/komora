# komora — context

A rootless-Podman **chamber** that runs an agent CLI so it feels like running it
natively. Personalised for one developer — explicitly not a universal tool.

The driver is **safety**: the chamber is the blast radius, so agents can run
unleashed without permission-prompt fatigue. Environment hygiene is a dividend,
not the reason.

Route and open decisions live on the wayfinder map,
[#1](https://github.com/arteven/komora/issues/1).

## Glossary

**Chamber** — one rootless Podman container, keyed on a project, one per repo.
Long-lived but **disposable by design**: recreating one from the image must be
routine, so nothing irreplaceable may live in its writable layer. Not a
"sandbox" — that term is avoided, since half the surveyed prior art uses it for
bubblewrap/Landlock host-process isolation, which komora deliberately is not.

**The image** — one fat personal image shared by every chamber. Not per-project
images, not an in-chamber toolchain manager. See
[ADR-0001](docs/adr/0001-arch-base-image-recreatable-not-reproducible.md).

**Derived config** — configuration komora writes *into* a chamber and rewrites
on every start, so the chamber holds only a copy and never the truth. The
chamber's `.gitconfig` is the first instance. Contrast a bind-mounted host file,
which makes the chamber a live window onto the host. See
[ADR-0003](docs/adr/0003-git-identity-synthesized-not-mounted.md).

**Profile** — a **credential selection**, not an identity axis. Switchable
mid-work. Git identity is global to komora by default, but a profile may
override it.

**Recreatable, not reproducible** — a rebuild must produce a *working* chamber,
not a *bit-identical* one. The test for whether something may live in a
chamber's writable layer is whether it is **irreplaceable**, not whether it is
reproducible. See [ADR-0001](docs/adr/0001-arch-base-image-recreatable-not-reproducible.md).

**The fidelity contract** — the tiered definition of "feels native" (zero-ceremony
launch, host-correct file ownership, full TTY fidelity, working credentials,
correct git identity, surviving sessions; then clipboard and dev-server
reachability). Held on the map.

**Slice** — a working vertical increment. Each leaves something usable; slices
ship in order and don't front-load decisions a later slice answers better.

**Verify, never manage (the gateway)** — komora depends on an OpenShell gateway
but does not install, configure, or select a compute driver for one; those stay
the developer's, so an OpenShell upgrade never fights the wrapper. komora only
runs a **read-only preflight** (`openshell status`) before any sandbox
operation and reports actionably when no gateway is reachable, rather than
failing partway through creation with an error that reads like a komora bug.
The general shape: where OpenShell owns a thing, komora checks it and speaks to
its state, never reaches in to change it.

**Synthesize, never mount** — komora pulls **named values** from a source
rather than bind-mounting the file that holds them. A host config file bundles
host-bound assumptions (absolute binary paths, credential helpers, `includeIf`
chains); mounting it imports all of them to obtain the few that were wanted. See
[ADR-0003](docs/adr/0003-git-identity-synthesized-not-mounted.md).
