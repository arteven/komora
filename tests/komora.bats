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

@test "--cwd with no value fails with a komora-voiced error, not an unbound-variable crash" {
  run "$KOMORA_BIN" --cwd
  assert_failure
  refute_output --partial "unbound variable"
  assert_output --partial "komora:"
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

@test "parse_remote_url strips a trailing slash on the HTTPS form" {
  run bash -c "source '$KOMORA_BIN' --source-only; parse_remote_url 'https://github.com/arteven/komora/'"
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
# touching the host's actual Podman state. It only answers for the exact
# volume name #14 specifies (komora-repo-<slug>), so a collision check that
# queries the wrong name gets no match rather than a false positive.

fake_podman_reporting() {
  local expect_vol="$1" label="$2"
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/podman" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "volume" && "\$2" == "inspect" && "\$5" == "$expect_vol" ]]; then
  echo "$label"
  exit 0
fi
exit 1
EOF
  chmod +x "$fake_dir/podman"
  printf '%s' "$fake_dir"
}

@test "id refuses a slug collision against a different existing owner/repo" {
  # foo/bar-baz slugs to foo-bar-baz -> volume komora-repo-foo-bar-baz (#14).
  local fake_dir; fake_dir="$(fake_podman_reporting "komora-repo-foo-bar-baz" "foo-bar/baz")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" id foo/bar-baz
  assert_failure
  assert_output --partial "foo/bar-baz"
  assert_output --partial "foo-bar/baz"
  assert_output --partial "collis"
  rm -rf "$fake_dir"
}

@test "id succeeds when the existing volume's owner/repo matches (resume, not collision)" {
  local fake_dir; fake_dir="$(fake_podman_reporting "komora-repo-arteven-komora" "arteven/komora")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" id arteven/komora
  assert_success
  assert_line "repo: arteven/komora"
  rm -rf "$fake_dir"
}

@test "id queries the spec-named repo volume (komora-repo-<slug>), not a bare slug volume" {
  # A fake that only answers for the WRONG (bare-slug) name must produce no
  # match, proving the real lookup targets komora-repo-<slug> per #14.
  local fake_dir; fake_dir="$(fake_podman_reporting "komora-arteven-komora" "someone-else/other")"
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

# --- Volume priming (#14, #17) ---
# A fake `podman` stands in for the real binary so these run without a live
# Podman daemon or the multi-gigabyte base image. It answers exactly the calls
# cmd_volumes makes: uid resolution (`run --rm --entrypoint sh ... getent
# passwd sandbox`), existence checks, and the create/prime invocations get
# passed straight to `plan`, which under --dry-run never reaches podman at all.

fake_podman_priming() {
  local uid="$1" existing_vol="${2:-}"
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/podman" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "run" && "\$*" == *"getent passwd sandbox"* ]]; then
  echo "$uid"
  exit 0
fi
if [[ "\$1" == "volume" && "\$2" == "exists" ]]; then
  [[ "\$3" == "$existing_vol" ]] && exit 0
  exit 1
fi
exit 0
EOF
  chmod +x "$fake_dir/podman"
  printf '%s' "$fake_dir"
}

@test "resolve_sandbox_uid reads the uid from the image, not a hardcoded value" {
  local fake_dir; fake_dir="$(fake_podman_priming "998")"
  PATH="$fake_dir:$PATH" run bash -c "source '$KOMORA_BIN' --source-only; resolve_sandbox_uid"
  assert_success
  assert_output "998"
  rm -rf "$fake_dir"
}

@test "resolve_sandbox_uid reflects whatever uid the image reports, proving no hardcoded fallback" {
  local fake_dir; fake_dir="$(fake_podman_priming "1234")"
  PATH="$fake_dir:$PATH" run bash -c "source '$KOMORA_BIN' --source-only; resolve_sandbox_uid"
  assert_success
  assert_output "1234"
  rm -rf "$fake_dir"
}

@test "--dry-run volumes creates both volumes and primes both as the resolved uid" {
  local fake_dir; fake_dir="$(fake_podman_priming "998")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" --dry-run volumes myslug myprofile
  assert_success
  assert_output --partial "komora-repo-myslug"
  assert_output --partial "komora-profile-myprofile"
  assert_output --partial "--user 998:998"
  # both volumes primed, not just one
  local prime_lines
  prime_lines="$(grep -c 'touch.*/x/.keep' <<< "$output")"
  assert_equal "$prime_lines" 2
  rm -rf "$fake_dir"
}

@test "--dry-run volumes defaults the profile to 'default' when none is given" {
  local fake_dir; fake_dir="$(fake_podman_priming "998")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" --dry-run volumes myslug
  assert_success
  assert_output --partial "komora-profile-default"
  rm -rf "$fake_dir"
}

@test "--dry-run volumes skips volume create for a volume that already exists (idempotent)" {
  local fake_dir; fake_dir="$(fake_podman_priming "998" "komora-repo-myslug")"
  PATH="$fake_dir:$PATH" run "$KOMORA_BIN" --dry-run volumes myslug myprofile
  assert_success
  refute_output --partial "volume create --label komora --label komora.repo=myslug komora-repo-myslug"
  assert_output --partial "volume create --label komora --label komora.profile=myprofile komora-profile-myprofile"
  # priming still runs against the pre-existing volume
  assert_output --partial "komora-repo-myslug:/x"
  rm -rf "$fake_dir"
}

@test "volumes requires a slug argument" {
  run "$KOMORA_BIN" volumes
  assert_failure
  assert_output --partial "requires a repo slug"
}
