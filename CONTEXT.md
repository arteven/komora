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

**Profile** — a **credential selection**, not an identity axis. Switchable
mid-work.

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
