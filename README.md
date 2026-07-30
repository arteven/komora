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
