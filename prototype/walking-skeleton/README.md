# PROTOTYPE — walking-skeleton chamber

Throwaway spike for [#6](https://github.com/arteven/komora/issues/6), slice 1.
**Not production code** — the real launcher is Go; this is bash to answer the
question cheaply. Kept on this branch as a primary source for the ticket's
verdict.

## Run it

```sh
podman build -t localhost/komora-skeleton:latest -f Containerfile .
./chamber.sh run     [repo]   # agent CLI in a chamber, defaults to $PWD
./chamber.sh shell   [repo]   # interactive zsh instead
./chamber.sh destroy [repo]   # container + home volume
```

`KOMORA_ASSUME_YES=1` skips the no-git-identity confirmation (ADR-0003 §5).
`KOMORA_PROFILE` selects the credential profile directory.

Environment it was run against: Podman 6.0.1, Linux 6.12, subuid/subgid
`100000+65536`, host uid/gid 1000, Claude Code 2.1.220.

## What it found

| Criterion | Result |
| --- | --- |
| 1. It runs | Agent CLI starts, reads/edits/runs commands in a bind-mounted repo |
| 2. Ownership | `keep-id:uid=1000,gid=1000` holds against a real session; every file host-owned, no `safe.directory` complaint |
| 3. Credentials | Auth works; re-login degrades cleanly to paste-the-URL (no localhost callback) |
| 4. Terminal | Real pty, truecolor, SIGWINCH resize, Ctrl-C, bracketed paste all correct |
| 5. Sessions | Survive container destruction; **lost with the volume** — see below |
| 6. Git identity | Commits carry the synthesized identity, `.gitconfig` rewritten each start |

### Three things worth carrying forward

**`gh` is `github-cli`.** #4 recorded the build failure but misdiagnosed it as
"`extra` isn't enabled in the minimal image". `extra` *is* enabled; the package
is simply named `github-cli`. The recorded workaround (enable `extra`) would not
have fixed it.

**Missing `~/.zshrc` breaks the terminal.** With no `~/.zshrc`, zsh runs
`zsh-newuser-install` on first interactive start, which grabs the keyboard and
makes paste and keys misbehave until dismissed — it looks exactly like a TTY
fidelity bug. `touch ~/.zshrc` in the image fixes it. This does not contradict
#4's "no dotfiles": an empty file is not shell config, it is the switch that
turns the wizard off. Podman copies image content into a fresh empty named
volume, so the fix survives the `/home/agent` volume mount.

**The host credential may not be at `~/.claude`.** `CLAUDE_CONFIG_DIR` relocates
it, and mounting the stale `~/.claude/.credentials.json` produces
`401 OAuth access token has been revoked` — an error that reads as a chamber
fault but is not one. The launcher resolves `CLAUDE_CONFIG_DIR` first, and
**copies** the credential into a per-profile `0700` dir rather than mounting it:
the chamber must be able to write it (rotation would wedge on a read-only
mount, per #12) but must not be able to write back to the host's live file.

That live file also bundles **every MCP server's OAuth token** alongside the
Claude credential, which matters for the profile model (#8) and for the MCP fog
patch — a profile is not a single secret.

### The open question this hands to slice 2

Session history lives in the chamber's home volume. It survives destroying the
*container* (verified: destroyed, recreated, resumed, recalled a token from the
prior session), but is **permanently lost** with the volume. By ADR-0001's test
sessions are irreplaceable, so they do not belong solely in chamber-scoped
storage. Recreate from scratch is 5.6s and everything else regenerates.

Also seen: an interrupted run leaves the container name held, so the next launch
fails with "name is already in use". Lifecycle concern, belongs to #7.
