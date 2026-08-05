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
  KOMORA_ROOT="${BATS_TEST_DIRNAME}/.."
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

@test "--dry-run run stages no credential on create — login happens inside the chamber (#30)" {
  # komora derives no agent credential from the host: the profile volume is
  # primed but never seeded with .credentials.json, and no code path reads the
  # host's config dir. A fresh profile mounts empty and the agent prompts for
  # login inside.
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  # Point CLAUDE_CONFIG_DIR at a host dir that DOES hold a credential; nothing
  # should read it. If host derivation crept back in, this would leak here.
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial ".credentials.json"
  refute_output --partial "$cred_dir"
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

# komora stages no credential from the host (#30): the profile volume starts
# empty and the developer logs in *inside* the chamber. The tests that asserted
# on host staging — resolving CLAUDE_CONFIG_DIR, copying .credentials.json,
# failing when the host had none — were removed with the behaviour, not adapted.
# What guards the removal is a positive assertion that neither create nor resume
# ever copies a credential (see the create and resume tests below).

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
  assert_output --partial "openshell sandbox create --name $ARTEVEN_KOMORA_SANDBOX_NAME --tty"
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
  assert_output --partial 'exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ claude'
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
  assert_output --partial 'cd\ /sandbox/repo\ \&\&\ exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resume skips volume creation and priming, and stages no credential" {
  # #30: the credential lives in the profile volume, written by an in-chamber
  # login; the volume outlives the sandbox, so a resume has nothing to stage.
  # This is the positive guard that host staging is gone from the resume path —
  # its previous incarnation asserted the opposite (restaging on resume).
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  PATH="$os_dir:$pm_dir:$PATH" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "volume create"
  refute_output --partial "touch"
  refute_output --partial ".credentials.json"
  rm -rf "$os_dir" "$pm_dir"
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

# --- CLAUDE_CONFIG_DIR: keeping the account binding in the volume (#29) ---
# Claude Code splits its state across ~/.claude/ (inside the mount) and
# ~/.claude.json (a *sibling* of it, holding oauthAccount and userID). Without
# the override the latter lives in the container's ephemeral layer, so
# destroying a sandbox loses the account binding while leaving the credential
# valid — a fresh chamber then authenticates but shows onboarding.

@test "run sets CLAUDE_CONFIG_DIR to the profile mount on create" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial 'CLAUDE_CONFIG_DIR=/sandbox/.claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run sets CLAUDE_CONFIG_DIR on resume too, not only on create" {
  # The resume path execs its own command, so it needs the override
  # independently — a create-only fix would lose the binding on every
  # subsequent launch.
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "sandbox exec"
  assert_output --partial 'CLAUDE_CONFIG_DIR=/sandbox/.claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "shell sets CLAUDE_CONFIG_DIR as well, so an agent started by hand inside finds its config" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run shell arteven/komora
  assert_success
  assert_output --partial 'CLAUDE_CONFIG_DIR=/sandbox/.claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

# --- the egress policy komora owns (#29, #31) ---
# komora passes --policy on every create. The load-bearing property is that it
# passes it *at all*: without it, a chamber silently inherits whatever the base
# image ships, so an image update can change komora's security posture without
# anyone deciding to. `--policy` fully REPLACES the built-in default rather than
# merging (verified against openshell 0.0.93), which is why the embedded policy
# carries the whole base policy and not a delta.
#
# #31 moved the vendored copy from a shipped policy/policy.yaml into an embedded
# heredoc (render_policy), materialised to a temp file per create. So the path
# --policy points at is now an mktemp file, not a repo path — the assertions
# below track a `komora-policy.` prefix rather than `policy/policy.yaml`.

@test "--dry-run run passes --policy on create, pointing at a materialised temp file" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "--policy"
  # the embedded policy lands in an mktemp file under $TMPDIR, recognisable by
  # its komora-policy. prefix — a stable-enough handle for the dry-run seam.
  assert_output --partial "komora-policy."
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the materialised policy path is not a repo-relative path, wherever komora is launched from" {
  # #29 resolved the policy relative to the script; #31 makes it a temp file
  # entirely, so the one invariant left is that no cwd- or repo-relative
  # path leaks into --policy.
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  local elsewhere; elsewhere="$(mktemp -d)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    run env -C "$elsewhere" "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "--policy"
  refute_output --partial "$elsewhere/policy"
  refute_output --partial "policy/policy.yaml"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir" "$elsewhere"
}

@test "KOMORA_POLICY overrides the embedded policy, passing the path straight through" {
  # This is what makes the policy testable — iterate against a candidate file
  # without editing the script, and skip the heredoc entirely.
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  local custom; custom="$(mktemp -d)/custom-policy.yaml"
  printf 'version: 1\n' > "$custom"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" KOMORA_POLICY="$custom" \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "$custom"
  # the override wins: the heredoc's temp file is never materialised
  refute_output --partial "komora-policy."
  rm -rf "$os_dir" "$pm_dir" "$cred_dir" "$(dirname "$custom")"
}

@test "run refuses when KOMORA_POLICY points at a missing file, rather than inheriting the image default" {
  # An explicit override that names a file OpenShell cannot read is a hard
  # refusal for the same reason #29 gave: falling back to the image default
  # would present as a working chamber on a weaker posture than komora
  # committed to.
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    KOMORA_POLICY="/nonexistent/policy.yaml" \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_failure
  assert_output --partial "policy file not found"
  refute_output --partial "sandbox create"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run refuses when the policy temp dir is not writable, rather than creating on an empty policy" {
  # With no shipped file there is nothing to be *missing*; the refusal now
  # guards the write. A non-writable TMPDIR must fail loudly, not fall back to
  # the image default (#31).
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    TMPDIR="/nonexistent/dir" \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_failure
  assert_output --partial "temp file"
  refute_output --partial "sandbox create"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the rendered policy is byte-identical to the checked-in fixture, so drift is caught" {
  # render_policy is the single frozen vendored copy (#31). If someone edits
  # the heredoc without re-vendoring the fixture, this fails — the whole point
  # of embedding the policy is that its bytes stay pinned.
  run diff "$KOMORA_ROOT/tests/fixtures/policy.expected.yaml" <("$KOMORA_BIN" --render-policy)
  assert_success
}

@test "materialise_policy writes the policy to a temp file and cleans it up on exit" {
  # The temp file must exist while komora runs — so `openshell sandbox create`
  # can read it — and must not survive the process (#31). We source komora in a
  # subshell that reports both the chosen path and whether the file existed at
  # the moment materialise_policy returned; then, back in the parent, we assert
  # the EXIT trap removed it once that subshell exited.
  local dir; dir="$(mktemp -d)"
  local out path existed_during
  out="$(TMPDIR="$dir" bash -c "
    source '$KOMORA_BIN' --source-only
    materialise_policy
    printf '%s\n' \"\$KOMORA_POLICY_PATH\"
    [[ -s \"\$KOMORA_POLICY_PATH\" ]] && echo EXISTED_DURING
  ")"
  path="$(sed -n '1p' <<< "$out")"
  existed_during="$(sed -n '2p' <<< "$out")"
  assert [ -n "$path" ]
  # the path is under our scratch TMPDIR, with the expected prefix
  assert [ "$(dirname "$path")" = "$dir" ]
  [[ "$(basename "$path")" == komora-policy.* ]]
  # the file was present (and non-empty) while the shell was alive...
  assert_equal "$existed_during" "EXISTED_DURING"
  # ...and the trap fired: it is gone now the subshell has exited
  assert [ ! -e "$path" ]
  rm -rf "$dir"
}

@test "the embedded policy carries the whole base policy, not a delta" {
  # `--policy` replaces rather than merges, so a delta-only file would strip
  # every default entry — presenting as a broken chamber (agent cannot reach
  # Anthropic, git cannot clone) rather than as a policy mistake.
  local rendered; rendered="$("$KOMORA_BIN" --render-policy)"
  # every network policy the base image ships, verified present
  for np in claude_code github_ssh_over_https github_rest_api copilot pypi \
            codex opencode cursor vscode nvidia_inference; do
    grep -q "^  ${np}:" <<< "$rendered" || { echo "missing network policy: $np" >&2; return 1; }
  done
}

@test "the embedded policy enables git-receive-pack for git push" {
  local rendered; rendered="$("$KOMORA_BIN" --render-policy)"
  # present as a live rule, not as the commented-out block upstream ships
  grep -q '^ *- allow:' <<< "$rendered"
  run grep -A1 'path: "/\*\*/git-receive-pack"' <<< "$rendered"
  assert_success
  refute_output --partial "#"
}

@test "the embedded policy loosens nothing else: no wildcard hosts, no added access: full" {
  local rendered; rendered="$("$KOMORA_BIN" --render-policy)"
  # a wildcard host would defeat the default-deny proxy entirely
  run grep -nE 'host: *["'"'"']?\*' <<< "$rendered"
  assert_failure
  # api.anthropic.com is the only `access: full` the base ships; komora adds none
  run bash -c "grep -c 'access: full' <<< \"\$1\"" _ "$rendered"
  assert_output "1"
}

@test "the embedded policy widens no binary allowlist beyond the base image's" {
  # The binary allowlist is a meaningful part of the containment: the policy
  # gates (binary, endpoint) pairs, so widening it is a real loosening even
  # when no host is added (#29).
  # Counts binary list entries only (`- path:` / `- { path:`), so the
  # provenance header's example paths in comments don't inflate it.
  local rendered; rendered="$("$KOMORA_BIN" --render-policy)"
  run bash -c "grep -cE '^ *- \{? *path: ' <<< \"\$1\"" _ "$rendered"
  assert_output "31"
}

# --- cmd_shell: same create-or-resume, differing final command (#14, #19) ---
# `shell` shares launch_into with `run`; these tests focus on what #19 adds —
# a shell instead of the agent — and lean on the run tests above to already
# cover the shared volume/priming/staging/collision machinery.

@test "--dry-run shell creates a sandbox with --tty and execs a login shell, not the agent, on first create" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run shell arteven/komora
  assert_success
  assert_output --partial "openshell sandbox create --name $ARTEVEN_KOMORA_SANDBOX_NAME --tty"
  assert_output --partial 'git\ clone\ https://github.com/arteven/komora.git\ /sandbox/repo'
  assert_output --partial 'exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ bash\ -l'
  # the agent is not the final command — matched with the env prefix so
  # CLAUDE_CONFIG_DIR's own "claude" substring can't satisfy it
  refute_output --partial 'CLAUDE_CONFIG_DIR=/sandbox/.claude\ claude'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run shell resumes via sandbox exec into a login shell, not create, when the sandbox already exists" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run shell arteven/komora
  assert_success
  assert_output --partial "openshell sandbox exec --name $ARTEVEN_KOMORA_SANDBOX_NAME --tty"
  refute_output --partial "sandbox create"
  refute_output --partial "git clone"
  assert_output --partial 'cd\ /sandbox/repo\ \&\&\ exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ bash\ -l'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run shell stages no credential on resume, same as run (#30)" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  PATH="$os_dir:$pm_dir:$PATH" run "$KOMORA_BIN" --dry-run shell arteven/komora
  assert_success
  refute_output --partial "volume create"
  refute_output --partial "touch"
  refute_output --partial ".credentials.json"
  rm -rf "$os_dir" "$pm_dir"
}

@test "shell derives owner/repo from the host clone, same as run" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  local dir; dir="$(mktemp -d)"
  git -C "$dir" init --quiet
  git -C "$dir" remote add origin git@github.com:arteven/komora.git
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run --cwd "$dir" shell
  assert_success
  assert_output --partial "openshell sandbox exec --name $ARTEVEN_KOMORA_SANDBOX_NAME --tty"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir" "$dir"
}
