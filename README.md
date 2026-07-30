# komora

A thin wrapper around the `openshell` CLI. See [CONTEXT.md](CONTEXT.md) and
[#14](https://github.com/arteven/komora/issues/14) for the architecture.

## Development

The entry point is `bin/komora`, a bash script. `--dry-run` prints the
`podman` / `openshell` invocations it would run instead of running them —
this is the seam the test suite asserts against.

```sh
./bin/komora --dry-run ls
```

**Tests**: [bats](https://github.com/bats-core/bats-core), run with:

```sh
bats tests/
```

**Pre-commit check**: `shellcheck` must pass clean on every script before
committing:

```sh
shellcheck bin/komora
```

## Verification log

Manual, non-bats verifications for prerequisite tickets that are "verifiable,
not demoable" (#14). Recorded here rather than left implicit, following #6's
evidence-base precedent.

### #17 — volume creation and priming

Run against `ghcr.io/nvidia/openshell-community/sandboxes/base:latest`,
Podman 6.0.1, on the developer's machine.

| Check | Result |
| --- | --- |
| uid resolution | `getent passwd sandbox` via `--entrypoint sh` returns `998`, matching the spec's stated value; no numeric literal in the script |
| unprimed volume ownership | first-mount auto-chown targets container root (`root:root`), confirming the failure mode the spec describes |
| priming writes as the sandbox uid | `podman run --user 998:998 --entrypoint sh -v <vol>:/x <image> -c 'touch /x/.keep'` succeeds; volume ownership becomes `sandbox:sandbox` |
| post-priming writability | a second `--user 998:998` run creates an unrelated file in the same volume without error |
| idempotency | `podman volume create` on an existing name errors (exit 125) — `ensure_volume`'s existence check is load-bearing, not defensive polish; re-running `komora volumes` end-to-end neither errors nor disturbs the existing `.keep` |
