#!/usr/bin/env bats
# Smoke tests for the komora entry point (#15).
#
# These assert only on externally observable behavior — the dry-run output
# and exit codes of the real script — never on internal function structure
# (#14, Testing Decisions).

setup() {
  load '/usr/lib/bats/bats-support/load'
  load '/usr/lib/bats/bats-assert/load'
  KOMORA_BIN="${BATS_TEST_DIRNAME}/../bin/komora"
}

@test "rejects an unknown command with a usage message and exit 2" {
  run "$KOMORA_BIN" bogus
  assert_failure 2
  assert_output --partial "unknown command 'bogus'"
  assert_output --partial "usage: komora"
}

@test "no command prints usage and exits 2" {
  run "$KOMORA_BIN"
  assert_failure 2
  assert_output --partial "usage: komora"
}

@test "--help prints usage and exits 0" {
  run "$KOMORA_BIN" --help
  assert_success
  assert_output --partial "usage: komora"
}

@test "--dry-run ls prints invocations instead of running them" {
  run "$KOMORA_BIN" --dry-run ls
  assert_success
  assert_line "podman volume ls --filter label=komora"
  assert_line "podman ps --all --filter label=komora"
}

@test "--dry-run works regardless of flag position" {
  run "$KOMORA_BIN" ls --dry-run
  assert_success
  assert_line "podman volume ls --filter label=komora"
}

@test "dry-run output is one invocation per line" {
  run "$KOMORA_BIN" --dry-run ls
  assert_success
  assert_equal "${#lines[@]}" 2
}

@test "unimplemented commands fail clearly rather than silently" {
  run "$KOMORA_BIN" stop
  assert_failure
  assert_output --partial "not yet implemented"
}
