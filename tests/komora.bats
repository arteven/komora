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

  # Isolate komora's own global config (#27) so no test reads or writes the
  # dev's real ~/.config/komora/config. Every test starts with an empty komora
  # config — which means "no git identity set" — unless it writes one itself.
  # `komora git config` writes here; the launch tests read here to decide
  # whether to synthesize identity and whether to warn.
  export XDG_CONFIG_HOME="${BATS_TEST_TMPDIR}/xdg"
  mkdir -p "$XDG_CONFIG_HOME"

  # Scrub any GitHub PAT the dev's shell may export (#22): whether komora wires
  # the push provider is decided by GITHUB_TOKEN/GH_TOKEN in the environment, so
  # a token leaking in from the host would flip the create path under the test's
  # feet and make the suite pass or fail by accident. Every test starts with no
  # token — i.e. the "push not wired" path — unless it exports one itself.
  unset GITHUB_TOKEN GH_TOKEN
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
  local existing_name="${1:-}" existing_provider="${2:-}"
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/openshell" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "sandbox" && "\$2" == "get" ]]; then
  [[ "\$3" == "$existing_name" ]] && exit 0
  echo "sandbox not found" >&2
  exit 1
fi
# provider get <name>: mirrors sandbox get for the push provider (#22). Reports
# "found" only for the name the test names as already-registered, so a test can
# drive komora down either the register-now or the reuse-existing branch. The
# default (no provider named) is "not found", the create branch.
if [[ "\$1" == "provider" && "\$2" == "get" ]]; then
  [[ "\$3" == "$existing_provider" ]] && exit 0
  echo "provider not found" >&2
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
  assert_output --partial 'exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig\ claude'
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
  assert_output --partial 'cd\ /sandbox/repo\ \&\&\ exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig\ claude'
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

# --- git push: the PAT github provider (#22) ---
# The policy rule above opens the push *path*; the provider signs the push with
# a PAT injected at the proxy. These tests assert the create wiring: opt-in on a
# host token, the token value never surfacing, idempotent registration, and the
# resume path staying provider-free. The token=proxy-not-chamber guarantee is a
# property of OpenShell's provider system (verified in research, ADR-0004); what
# komora owns and these tests pin is that komora never handles the value.

@test "--dry-run run with a PAT registers the github provider and attaches it on create" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" GITHUB_TOKEN=ghp_fake \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # registration, once, reading the PAT from the environment (never a CLI arg)
  assert_output --partial "openshell provider create --name komora-github-default --type github --from-existing"
  # attached to the create so the proxy signs pushes for this chamber
  assert_output --partial "--provider komora-github-default"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the PAT value never appears in komora's output — the chamber holds no token (#22, #9)" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  # A recognisable sentinel as the token; it must appear nowhere in the trace.
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" GITHUB_TOKEN=ghp_SENTINEL_secret_value \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "ghp_SENTINEL_secret_value"
  # --from-existing is the mechanism that keeps it out: the value flows through
  # the environment, never as an argument komora assembles
  assert_output --partial "--from-existing"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run without a PAT attaches no provider and warns, but still creates the chamber" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  # setup() has scrubbed GITHUB_TOKEN/GH_TOKEN, so this is the no-token path.
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "provider create"
  refute_output --partial "--provider"
  # the chamber is still created — push is the only capability withheld
  assert_output --partial "openshell sandbox create --name $ARTEVEN_KOMORA_SANDBOX_NAME"
  # and komora says so actionably, on stderr
  assert_output --partial "git push from this chamber will be denied"
  assert_output --partial "GITHUB_TOKEN"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run reuses an already-registered provider instead of re-creating it (idempotent)" {
  # The fake reports komora-github-default as already present, so komora should
  # attach it without a second `provider create`.
  local os_dir; os_dir="$(fake_openshell_sandbox_get "" "komora-github-default")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" GITHUB_TOKEN=ghp_fake \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "provider create"
  assert_output --partial "--provider komora-github-default"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run attaches an already-registered provider even with NO host token (#22)" {
  # Bug A regression: the ADR-0004 setup puts the PAT in gateway state (e.g. via
  # `openshell provider create`), NOT in the shell env. setup() scrubs
  # GITHUB_TOKEN/GH_TOKEN, and the fake reports the provider already present.
  # komora must attach it — gating on a host token here would deny push for the
  # exact configuration that keeps the token out of the environment.
  local os_dir; os_dir="$(fake_openshell_sandbox_get "" "komora-github-default")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # attached despite no env token, and not re-created (it already exists)
  assert_output --partial "--provider komora-github-default"
  refute_output --partial "provider create"
  # and NO "push will be denied" warning — push is wired
  refute_output --partial "git push from this chamber will be denied"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "GH_TOKEN is accepted when GITHUB_TOKEN is unset" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" GH_TOKEN=ghp_fake \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "--provider komora-github-default"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the provider name follows the profile, matching 'profile is a credential selection'" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" \
    KOMORA_PROFILE=work GITHUB_TOKEN=ghp_fake \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "--provider komora-github-work"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run run resume attaches no provider — the credential lives at the gateway, not the chamber (#22)" {
  # On resume the sandbox already exists; the provider was registered at create
  # and lives in gateway state, so resume neither re-registers nor re-attaches.
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" GITHUB_TOKEN=ghp_fake \
    run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "openshell sandbox exec --name $ARTEVEN_KOMORA_SANDBOX_NAME"
  refute_output --partial "provider create"
  refute_output --partial "--provider"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
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
  assert_output --partial 'exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig\ bash\ -l'
  # the agent is not the final command — matched with the env prefix so
  # CLAUDE_CONFIG_DIR's own "claude" substring can't satisfy it
  refute_output --partial 'GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig\ claude'
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
  assert_output --partial 'cd\ /sandbox/repo\ \&\&\ exec\ env\ CLAUDE_CONFIG_DIR=/sandbox/.claude\ GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig\ bash\ -l'
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

# --- gateway preflight (#20) ---
# komora verifies a reachable OpenShell gateway before any sandbox operation,
# and says so actionably when there is none — instead of failing partway through
# `sandbox create`. komora does not manage the gateway: the check is read-only,
# never writing config, installing, or selecting a driver.
#
# `openshell status` is the probe (exit 0 reachable, non-zero not). Under
# --dry-run the live probe is skipped and a marker line stands in, so planning
# needs no live gateway. The fakes below drive the probe's exit code directly.

# A fake `openshell` that answers `status` with a chosen exit code, so a test
# can stand up a "reachable" or "unreachable" gateway without a live one. All
# other subcommands (`sandbox get`, etc.) succeed, matching
# fake_openshell_sandbox_get's default for the create branch.
fake_openshell_status() {
  local status_exit="$1" existing_name="${2:-}"
  local fake_dir; fake_dir="$(mktemp -d)"
  cat > "$fake_dir/openshell" <<EOF
#!/usr/bin/env bash
if [[ "\$1" == "status" ]]; then
  exit $status_exit
fi
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

@test "run refuses with an actionable error when no gateway is reachable, before any sandbox work" {
  # NOT --dry-run: the live probe must actually run and gate the create.
  local os_dir; os_dir="$(fake_openshell_status 1)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" run arteven/komora
  assert_failure
  assert_output --partial "no reachable OpenShell gateway"
  # actionable: names what to do, and that the gateway is the dev's to set up
  assert_output --partial "does not manage"
  assert_output --partial "openshell status"
  # failed up front: never reached volume priming or sandbox creation
  refute_output --partial "sandbox create"
  refute_output --partial "touch"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run proceeds past the preflight when the gateway is reachable" {
  # A reachable gateway (status exit 0) lets the create path run to the point
  # where it would exec podman/openshell — here landing on the resume branch,
  # since the fake reports the sandbox as existing.
  local os_dir; os_dir="$(fake_openshell_status 0 "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" run arteven/komora
  assert_success
  refute_output --partial "no reachable OpenShell gateway"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "shell is gated by the same preflight as run" {
  local os_dir; os_dir="$(fake_openshell_status 1)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" shell arteven/komora
  assert_failure
  assert_output --partial "no reachable OpenShell gateway"
  refute_output --partial "sandbox create"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "--dry-run skips the live gateway probe, so planning needs no gateway" {
  # A fake whose `status` FAILS (exit 1): if the live probe ran under --dry-run,
  # the create would be refused. It is not — the probe is skipped and a marker
  # line stands in, so the full plan still prints.
  local os_dir; os_dir="$(fake_openshell_status 1)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "no reachable OpenShell gateway"
  # the marker records where the live check would run — clearly not executed
  assert_output --partial "gateway preflight (skipped under --dry-run)"
  # and the rest of the plan still prints
  assert_output --partial "openshell sandbox create --name $ARTEVEN_KOMORA_SANDBOX_NAME"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the preflight never writes gateway config, installs, or selects a driver" {
  # komora does not manage the gateway (#20). The only openshell call the
  # preflight makes is the read-only `status`; it must issue none of the
  # mutating gateway/settings verbs. A fake records every argv it is called with.
  local os_dir; os_dir="$(mktemp -d)"
  local log="$os_dir/calls.log"
  cat > "$os_dir/openshell" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$log"
[[ "\$1" == "status" ]] && exit 1   # unreachable, so komora stops at the preflight
exit 0
EOF
  chmod +x "$os_dir/openshell"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" run arteven/komora
  assert_failure
  # the only openshell invocation was the read-only probe
  run cat "$log"
  assert_output "status"
  refute_output --partial "gateway add"
  refute_output --partial "gateway select"
  refute_output --partial "settings"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

# --- git identity: komora git config + chamber synthesis (#27) ---
# ADR-0003 makes correct git identity a Must: synthesized fresh on every start,
# never mounted from the host. Identity is explicit-only — komora's own global
# config and nowhere else — and an unset identity WARNS but never blocks.
#
# XDG_CONFIG_HOME is redirected in setup() so these read and write an isolated,
# initially-empty komora config, never the dev's real one.

@test "git config with no identity set says so, actionably, and exits 0" {
  run "$KOMORA_BIN" git config
  assert_success
  assert_output --partial "no git identity set"
  assert_output --partial "komora git config user.name"
  assert_output --partial "komora git config user.email"
}

@test "git config user.name/user.email persist and read back" {
  run "$KOMORA_BIN" git config user.name "Ada Lovelace"
  assert_success
  run "$KOMORA_BIN" git config user.email "ada@example.com"
  assert_success
  run "$KOMORA_BIN" git config user.name
  assert_output "Ada Lovelace"
  run "$KOMORA_BIN" git config user.email
  assert_output "ada@example.com"
}

@test "git config with no key shows the current identity once set" {
  "$KOMORA_BIN" git config user.name "Ada Lovelace"
  "$KOMORA_BIN" git config user.email "ada@example.com"
  run "$KOMORA_BIN" git config
  assert_success
  assert_output --partial "Ada Lovelace"
  assert_output --partial "ada@example.com"
}

@test "git config writes komora's own config under XDG_CONFIG_HOME, not the host ~/.gitconfig" {
  "$KOMORA_BIN" git config user.name "Ada Lovelace"
  assert [ -f "$XDG_CONFIG_HOME/komora/config" ]
  run cat "$XDG_CONFIG_HOME/komora/config"
  assert_output --partial "Ada Lovelace"
}

@test "git config refuses a key other than user.name / user.email" {
  run "$KOMORA_BIN" git config user.signingkey ABC123
  assert_failure 2
  assert_output --partial "only manages user.name and user.email"
}

@test "git rejects a subcommand other than config" {
  run "$KOMORA_BIN" git status
  assert_failure 2
  assert_output --partial "unknown git subcommand 'status'"
}

@test "run warns (without failing) when no git identity is configured" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "no git identity configured"
  assert_output --partial "komora git config user.name"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run with no identity synthesizes nothing — the chamber snippet is a bare no-op" {
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # no `git config --file` write in the in-chamber command when identity is unset
  refute_output --partial "git config --file"
  # the create path always passes GIT_CONFIG_GLOBAL so git finds the file once
  # one is written on a later start
  assert_output --partial "GIT_CONFIG_GLOBAL=/sandbox/.claude/gitconfig"
  # the no-op must be a COMPLETE statement (':;'), never a bare ':' — spliced
  # before `if [ ! -d … ]`, a bare ':' swallows the `if` as its arguments and
  # orphans `then` → `sh: Syntax error: "then" unexpected`. Assert the emitted
  # in-chamber command actually parses under /bin/sh, the guard Bug B slipped.
  # The plan trace %q-quotes the whole `sh -c` argument, so ':; if …' renders as
  # ':\;\ if\ …'. A bare ':' (Bug B) would render 'sh -c : if …' — the space
  # between ':' and 'if' unescaped and unquoted, orphaning `then` in the chamber.
  assert_output --partial 'sh -c :\;\ if\ \[\ \!\ -d'
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run with identity set writes a fresh .gitconfig into the chamber before handoff, on create" {
  "$KOMORA_BIN" git config user.name "Ada Lovelace"
  "$KOMORA_BIN" git config user.email "ada@example.com"
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # a fresh file every start: clear then write, before the clone
  assert_output --partial 'rm\ -f\ /sandbox/.claude/gitconfig'
  assert_output --partial 'git\ config\ --file\ /sandbox/.claude/gitconfig\ user.name\ \'"'"'Ada\ Lovelace\'"'"''
  assert_output --partial 'git\ config\ --file\ /sandbox/.claude/gitconfig\ user.email\ \'"'"'ada@example.com\'"'"''
  # no warning when identity is set
  refute_output --partial "no git identity configured"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "run with identity set writes a fresh .gitconfig on resume too, not only create" {
  # The synthesis is on every start (ADR-0003): a value changed since the
  # sandbox was created must reach a resumed chamber. A create-only write goes
  # stale — same reason CLAUDE_CONFIG_DIR is set on both branches.
  "$KOMORA_BIN" git config user.name "Ada Lovelace"
  local os_dir; os_dir="$(fake_openshell_sandbox_get "$ARTEVEN_KOMORA_SANDBOX_NAME")"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  assert_output --partial "sandbox exec"
  refute_output --partial "git clone"
  assert_output --partial 'git\ config\ --file\ /sandbox/.claude/gitconfig\ user.name\ \'"'"'Ada\ Lovelace\'"'"''
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "a value containing a single quote is safely quoted in the chamber command" {
  # The in-chamber write is a `sh -c` string; a name with an apostrophe must
  # not be able to break out of the single-quoted value.
  "$KOMORA_BIN" git config user.name "Ada O'Lovelace"
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  PATH="$os_dir:$pm_dir:$PATH" CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  # the standard '\'' close-reopen escape, seen through plan's %q backslashing
  assert_output --partial "Ada\\ O\\'\\\\\\'\\'Lovelace"
  rm -rf "$os_dir" "$pm_dir" "$cred_dir"
}

@test "the host's ~/.gitconfig is read by nothing on any path" {
  # komora derives no identity from the host (#27). Point HOME at a dir with a
  # gitconfig carrying a distinctive identity; it must never appear in output.
  local home_dir; home_dir="$(mktemp -d)"
  cat > "$home_dir/.gitconfig" <<GITCONFIG
[user]
	name = HOST LEAK NAME
	email = host-leak@example.com
GITCONFIG
  local os_dir; os_dir="$(fake_openshell_sandbox_get)"
  local pm_dir; pm_dir="$(fake_podman_priming "998")"
  local cred_dir; cred_dir="$(fake_credential_dir)"
  # XDG_CONFIG_HOME under the fake HOME too, so komora's own config is empty
  PATH="$os_dir:$pm_dir:$PATH" HOME="$home_dir" XDG_CONFIG_HOME="$home_dir/.config" \
    CLAUDE_CONFIG_DIR="$cred_dir" run "$KOMORA_BIN" --dry-run run arteven/komora
  assert_success
  refute_output --partial "HOST LEAK NAME"
  refute_output --partial "host-leak@example.com"
  rm -rf "$home_dir" "$os_dir" "$pm_dir" "$cred_dir"
}
