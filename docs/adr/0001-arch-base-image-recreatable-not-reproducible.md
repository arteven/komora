# ADR-0001: Arch base image — recreatable, not reproducible

- **Status**: Accepted
- **Date**: 2026-07-27
- **Ticket**: [#4 Choose the chamber image](https://github.com/arteven/komora/issues/4)

## Context

The chamber image is one fat personal image shared by every chamber. Its base
distro decides the package model, how current the toolchain is, and whether an
image rebuild can be trusted to produce a working chamber.

Two candidates were real:

- **Arch** — matches the host, so one set of package habits (`pacman`) spans
  host and chamber; rolling versions keep pace with agent CLIs, which assume
  recent everything.
- **Debian stable** — smaller, calmer, genuinely pinnable, and what most
  surveyed prior art shipped (see the slice-0 harvest).

The harvest recorded a sharp warning about stale bases: one project builds git
from source, sha256-pinned, purely because Debian bookworm ships a git too old
to create relative worktree metadata. That is the failure mode Arch avoids.

Arch's cost is the mirror image: `pacman -Syu` at build time is unpinnable in
practice, so rebuilding from an unchanged Containerfile can install different
versions than the previous build produced.

## Decision

**Use `archlinux:base-devel` as the chamber base image.**

Accept that the image is **recreatable, not reproducible**:

- **Recreatable** — the Containerfile can always produce a *working* chamber.
- **Reproducible** — a rebuild produces a *bit-identical* chamber.

komora requires the former and does not require the latter. A chamber is
disposable by design, so what matters is that destroying one and rebuilding it
is routine, not that the rebuild matches a historical artifact.

## The generalisation

This distinction is not specific to the base image. It is the test to apply
whenever something in a chamber looks like state:

> Ask whether the thing is **irreplaceable**, not whether it is **reproducible**.

The map's disposability constraint — nothing irreplaceable in a chamber's
writable layer — bars data that cannot be regenerated. It does not bar data
that regenerates itself.

Worked example, decided in the same ticket: the agent CLI's auto-updater is
left **enabled**, and the version tree it writes to is not treated as a
violation. An updated CLI regenerates itself on a fresh chamber within one run.
The image sets a known-good floor; it does not set a ceiling.

Expect this test to decide later volume-persistence questions the same way.

## Consequences

**Accepted:**

- A rebuild can pull different package versions than the previous one, so **a
  chamber broken by a rebuild is a real failure mode**. The response is to
  rebuild later or pin the specific offending package — not to debug under
  pressure, and not to treat it as a defect in the approach.
- Rolling versions run ahead of what upstreams test against. A project needing
  an older toolchain cannot be served by the fat image. That gap is tracked
  separately as per-project toolchain extension.

**Gained:**

- One package model across host and chamber.
- Current tooling by default, without per-tool version workarounds.

## Revisit if

- A project needs pinned or older toolchains often enough that the fat image
  stops being viable.
- Reproducibility becomes a real requirement — for instance, if chambers ever
  need to be comparable across machines or over time, rather than merely
  working.

Either condition invalidates the trade above, not merely the convenience.
