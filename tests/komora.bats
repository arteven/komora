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

# --- Seam 1: repo identity via `komora id` (#14, #16) ---

@test "id accepts a positional owner/repo and prints the repo id and slug" {
  run "$KOMORA_BIN" id arteven/komora
  assert_success
  assert_line "repo: arteven/komora"
  assert_line "slug: arteven-komora"
}

@test "id with no argument and no origin remote fails with an actionable error" {
  local dir; dir="$(mktemp -d)"
  git -C "$dir" init --quiet
  run "$KOMORA_BIN" id --cwd "$dir"
  assert_failure
  assert_output --partial "no repo given and not in a host clone"
  assert_output --partial "owner/repo"
  rm -rf "$dir"
}

@test "id derives owner/repo from an SSH-form origin remote" {
  local dir; dir="$(mktemp -d)"
  git -C "$dir" init --quiet
  git -C "$dir" remote add origin git@github.com:arteven/komora.git
  run "$KOMORA_BIN" id --cwd "$dir"
  assert_success
  assert_line "repo: arteven/komora"
  assert_line "slug: arteven-komora"
  rm -rf "$dir"
}

@test "id derives owner/repo from an HTTPS-form origin remote, matching the SSH-form slug" {
  local dir; dir="$(mktemp -d)"
  git -C "$dir" init --quiet
  git -C "$dir" remote add origin https://github.com/arteven/komora.git
  run "$KOMORA_BIN" id --cwd "$dir"
  assert_success
  assert_line "repo: arteven/komora"
  assert_line "slug: arteven-komora"
  rm -rf "$dir"
}

# --- Seam 2: pure helpers (#14, #16) ---
# Sourced directly rather than invoked as a subprocess, so we can call the
# shell function `slugify` in isolation.

@test "slugify lowercases and maps every rejected character to a single hyphen" {
  run bash -c "source '$KOMORA_BIN' --source-only; slugify 'Ar_Tev.En/KoMo Ra'"
  assert_success
  assert_output "ar-tev-en-komo-ra"
}

@test "slugify emits only [a-z0-9-]" {
  run bash -c "source '$KOMORA_BIN' --source-only; slugify 'foo/bar_baz.qux 1'"
  assert_success
  [[ "$output" =~ ^[a-z0-9-]+$ ]]
}

@test "parse_remote_url handles the SSH shorthand form" {
  run bash -c "source '$KOMORA_BIN' --source-only; parse_remote_url 'git@github.com:arteven/komora.git'"
  assert_success
  assert_output "arteven/komora"
}

@test "parse_remote_url handles the HTTPS form" {
  run bash -c "source '$KOMORA_BIN' --source-only; parse_remote_url 'https://github.com/arteven/komora.git'"
  assert_success
  assert_output "arteven/komora"
}

@test "parse_remote_url rejects a URL it cannot parse" {
  run bash -c "source '$KOMORA_BIN' --source-only; parse_remote_url 'not-a-url'"
  assert_failure
}

# --- Collision detection (#14, #16) ---
# A fake `podman` stands in for the real binary: it answers the one query
# cmd_id needs (the komora.repo label of an existing volume by name) without
# touching the host's actual Podman state.

fake_podman_reporting() {
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/podman" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "volume" && "\$2" == "inspect" ]]; then
  echo "$1"
  exit 0
fi
exit 1
EOF
  chmod +x "$fake_dir/podman"
  printf '%s' "$fake_dir"
}

@test "id refuses a slug collision against a different existing owner/repo" {
  local fake_dir; fake_dir="$(fake_podman_reporting "foo-bar/baz")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" id foo/bar-baz
  assert_failure
  assert_output --partial "foo/bar-baz"
  assert_output --partial "foo-bar/baz"
  assert_output --partial "collis"
  rm -rf "$fake_dir"
}

@test "id succeeds when the existing volume's owner/repo matches (resume, not collision)" {
  local fake_dir; fake_dir="$(fake_podman_reporting "arteven/komora")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" id arteven/komora
  assert_success
  assert_line "repo: arteven/komora"
  rm -rf "$fake_dir"
}

@test "slugify is not injective: foo/bar-baz and foo-bar/baz collide" {
  run bash -c "source '$KOMORA_BIN' --source-only; slugify 'foo/bar-baz'"
  assert_success
  local first="$output"
  run bash -c "source '$KOMORA_BIN' --source-only; slugify 'foo-bar/baz'"
  assert_success
  assert_equal "$output" "$first"
  assert_equal "$output" "foo-bar-baz"
}
