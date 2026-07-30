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

@test "no command defaults to run, which needs a repo when not in a host clone" {
  local dir; dir="$(mktemp -d)"
  git -C "$dir" init --quiet
  run "$KOMORA_BIN" --cwd "$dir"
  assert_failure
  assert_output --partial "no repo given and not in a host clone"
  rm -rf "$dir"
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
# the create path of cmd_run makes: uid resolution (`run --rm --entrypoint sh
# ... getent passwd sandbox`), existence checks, and the create/prime
# invocations get passed straight to `plan`, which under --dry-run never
# reaches podman at all.

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

# A scratch CLAUDE_CONFIG_DIR holding a fake credential, so tests never
# depend on (or leak) whatever the real host happens to have logged in with.
fake_credential_dir() {
  local dir; dir="$(mktemp -d)"
  printf '{"fake":"credential"}' > "$dir/.credentials.json"
  printf '%s' "$dir"
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

@test "--dry-run run creates both volumes and primes both as the resolved uid" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "komora-repo-arteven-komora"
  assert_output --partial "komora-profile-default"
  assert_output --partial "--user 998:998"
  # both volumes primed, not just one
  local prime_lines
  prime_lines="$(grep -c 'touch.*/x/.keep' <<< "$output")"
  assert_equal "$prime_lines" 2
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run defaults the profile to 'default' when KOMORA_PROFILE is unset" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "komora-profile-default"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run skips volume create for a volume that already exists (idempotent)" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998" "komora-repo-arteven-komora")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "volume create --label komora --label komora.repo=arteven/komora komora-repo-arteven-komora"
  assert_output --partial "volume create --label komora --label komora.profile=default komora-profile-default"
  # priming still runs against the pre-existing volume
  assert_output --partial "komora-repo-arteven-komora:/x"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

# --- Credential staging (#14, #18) ---

@test "--dry-run run fails clearly when no credential exists at the resolved config dir" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local empty_dir; empty_dir="$(mktemp -d)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$empty_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_failure
  assert_output --partial "no credential found"
  assert_output --partial "$empty_dir"
  rm -rf "$os_dir" "$pm_dir" "$empty_dir"
}

@test "--dry-run run stages the credential from an overridden CLAUDE_CONFIG_DIR, not the default" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "$cred_dir/.credentials.json"
  assert_output --partial 'cp\ /src/.credentials.json\ /x/.credentials.json'
  refute_output --partial "$HOME/.claude/.credentials.json"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resolves a symlinked CLAUDE_CONFIG_DIR before staging" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local real_dir; real_dir="$(fake_credential_dir)"
  local link_dir; link_dir="$(mktemp -u)"
  ln -s "$real_dir" "$link_dir"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$link_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "$real_dir/.credentials.json"
  refute_output --partial "$link_dir/.credentials.json"
  rm -rf "$os_dir" "$pm_dir" "$real_dir" "$link_dir"
}

# --- cmd_run: create-or-resume (#14, #18) ---
# A fake `openshell` stands in for the real binary. `sandbox get <name>`
# decides the create-vs-resume branch: exit 0 (found) means resume, exit 1
# ("sandbox not found", verified live) means create. `sandbox create` /
# `sandbox exec` invocations get passed straight to `plan`, which under
# --dry-run never reaches openshell at all — so the fake only has to answer
# `sandbox get`.

fake_openshell_sandbox_get() {
  local existing_name="${1:-}"
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/openshell" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "sandbox" && "\$2" == "get" ]]; then
  [[ "\$3" == "$existing_name" ]] && exit 0
  echo "sandbox not found" >&2
  exit 1
fi
exit 0
EOF
  chmod +x "$fake_dir/openshell"
  printf '%s' "$fake_dir"
}

# The sandbox name OpenShell would actually accept for arteven/komora
# (slug arteven-komora): komora-<10-hex-char hash>, 17 chars total, under
# the server's hard 19-char cap (#18, verified live — see sandbox_name's
# comment in bin/komora).
ARTEVEN_KOMORA_SANDBOX_NAME="komora-a68a5c2881"

@test "sandbox_name fits OpenShell's 19-char limit even for a slug that would otherwise overflow it" {
  run bash -c "source '$KOMORA_BIN' --source-only; sandbox_name 'arteven-komora'"
  assert_success
  assert_output "$ARTEVEN_KOMORA_SANDBOX_NAME"
  [[ "${#output}" -le 19 ]]
}

@test "sandbox_name is deterministic: the same slug always yields the same name" {
  run bash -c "source '$KOMORA_BIN' --source-only; sandbox_name 'arteven-komora'; echo; sandbox_name 'arteven-komora'"
  assert_success
  local first second
  first="$(sed -n '1p' <<< "$output")"
  second="$(sed -n '2p' <<< "$output")"
  assert_equal "$first" "$second"
}

@test "--dry-run run creates a sandbox named after the slug when none exists yet" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "openshell sandbox create --name $ARTEVEN_KOMORA_SANDBOX_NAME"
  assert_output --partial "komora.slug=arteven-komora"
  refute_output --partial "sandbox exec"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run passes both volumes with read_only:false explicit in driver-config-json" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # plan's %q output backslash-escapes every double-quote and comma in the JSON arg
  assert_output --partial 'source\":\"komora-repo-arteven-komora\"\,\"target\":\"/sandbox/repo\"\,\"read_only\":false'
  assert_output --partial 'source\":\"komora-profile-default\"\,\"target\":\"/sandbox/.claude\"\,\"read_only\":false'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run clones the repo inside before handing off to the agent, on first create" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial 'git\ clone\ https://github.com/arteven/komora.git\ /sandbox/repo'
  assert_output --partial 'exec\ claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resumes via sandbox exec, not create, when the sandbox already exists" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "openshell sandbox exec --name $ARTEVEN_KOMORA_SANDBOX_NAME --tty"
  refute_output --partial "sandbox create"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resume does not re-clone, only cds into the existing repo" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "git clone"
  assert_output --partial 'cd\ /sandbox/repo\ \&\&\ exec\ claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resume skips volume creation and priming, but still restages the credential" {
  # Regression for a live-reproducible bug: skipping credential staging on
  # resume serves a stale token after a host-side re-login, reproducing the
  # exact "401 OAuth access token has been revoked" #18 exists to prevent.
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "volume create"
  refute_output --partial "touch"
  assert_output --partial 'cp\ /src/.credentials.json\ /x/.credentials.json'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run with a bare owner/repo argument (no subcommand) also means run" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run arteven/komora
  assert_success
  assert_output --partial "openshell sandbox exec --name $ARTEVEN_KOMORA_SANDBOX_NAME"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run labels the repo volume with the full repo_id, not the slug, so a repo never collides with itself" {
  # Regression for a live bug: ensure_repo_and_profile_volumes once stored the
  # *slug* on komora.repo, so check_slug_collision (which compares against
  # repo_id) found every repo "colliding" with its own volume on a second run.
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial 'komora.repo=arteven/komora'
  refute_output --partial 'komora.repo=arteven-komora'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run refuses a slug collision the same way id does" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local fake_dir; fake_dir="$(fake_podman_reporting "komora-repo-foo-bar-baz" "foo-bar/baz")"
  PATH="$os_dir:$fake_dir:$PATH" run "$KOMORA_BIN" --dry-run run foo/bar-baz
  assert_failure
  assert_output --partial "collis"
  rm -rf "$os_dir" "$fake_dir"
}
