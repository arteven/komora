# komora — context

A rootless-Podman **chamber** that runs an agent CLI so it feels like running it
natively. Personalised for one developer — explicitly not a universal tool.

The driver is **safety**: the chamber is the blast radius, so agents can run
unleashed without permission-prompt fatigue. Environment hygiene is a dividend,
not the reason.

Route and open decisions live on the wayfinder map,
[#1](https://github.com/arteven/komora/issues/1).

## Architecture

komora is a **thin wrapper around the `openshell` CLI**. The repo is **cloned
inside** the sandbox; two persistent Podman named volumes (repo, profile)
outlive it, and the sandbox is the disposable part. komora shells out to
`openshell` rather than linking a library or speaking a protocol — the cheapest
coupling to a substrate at `0.0.93`. See
[ADR-0005](docs/adr/0005-clone-inside-a-thin-wrapper-around-openshell.md).

An earlier architecture had komora build its own image and bind-mount the host
repo. Anything reading as if komora builds an image or solves file ownership is
**history, not route** —
[ADR-0001](docs/adr/0001-arch-base-image-recreatable-not-reproducible.md) and
[ADR-0002](docs/adr/0002-ownership-machinery-around-keep-id.md) are superseded
and say so.

## Glossary

**Chamber** — an OpenShell **sandbox** backed by two named volumes, keyed on a
project, one per repo. Long-lived but **disposable by design**, and now
literally so: everything worth keeping lives in the volumes, which outlive it,
so destroying a chamber costs a re-create and loses nothing.

The word is kept in preference to "sandbox" for komora's own concept, since half
the surveyed prior art uses "sandbox" for bubblewrap/Landlock host-process
isolation, which komora deliberately is not. Where these docs say *sandbox* they
mean OpenShell's object specifically.

**Repo volume** (`komora-repo-<slug>`) — holds the work tree, cloned inside on
creation. Keyed on the repo; labelled with the full `owner/repo` id so a slug
collision can be detected against something real.

**Profile volume** (`komora-profile-<name>`) — holds the agent credential, the
account binding (`~/.claude.json`, kept inside via `CLAUDE_CONFIG_DIR`),
sessions, history, and the synthesized gitconfig. Keyed on the profile.

**Priming** — writing to a fresh named volume **as the sandbox uid** so the
agent can write it later. Podman's first-mount auto-chown targets container
root, not the uid OpenShell's supervisor setuid()s down to, and a run that
merely *mounts* does not trigger the chown — so an unprimed volume mounts fine
and is then unwritable. The uid is resolved from the image, never hardcoded.

**The image** — the OpenShell community base image. Not komora's: it builds no
image and chooses no base distro. A repo needing something the image lacks would
take a per-repo `--from` image or an in-chamber install; no real instance yet.

**Derived config** — configuration komora writes *into* a chamber and rewrites
on every start, so the chamber holds only a copy and never the truth. The
chamber's gitconfig is the instance. Contrast a bind-mounted host file, which
makes the chamber a live window onto the host. See
[ADR-0003](docs/adr/0003-git-identity-synthesized-not-mounted.md).

**Profile** — a **credential selection**, not an identity axis. Switchable
mid-work. A profile is a *set* of secrets, not one: the agent credential and
every MCP server's OAuth token share the tree, so profile isolation is volume
isolation. Git identity is global to komora for now; a per-profile override is
deferred until there is a real instance of wanting one.

**Recreatable, not reproducible** — a rebuild must produce a *working* chamber,
not a *bit-identical* one. The test for whether something may live in a
chamber's writable layer is whether it is **irreplaceable**, not whether it is
reproducible. Decided about an image komora no longer builds; it survives as the
rule governing what belongs in a volume. Session history is the one thing that
failed the test, which is why it lives in the profile volume. See
[ADR-0001](docs/adr/0001-arch-base-image-recreatable-not-reproducible.md).

**The fidelity contract** — the tiered definition of "feels native". Held on the
map, [#1](https://github.com/arteven/komora/issues/1):

| Tier | Requirement |
| --- | --- |
| Must | Zero-ceremony launch — enter a repo, start a chamber, no build step |
| Must | The repo is cloned inside — no host mount, no ownership problem, no sync |
| Must | Full TTY fidelity — truecolor, resize, Ctrl-C, bracketed paste, mouse |
| Must | Working credentials, including browser-based login **from inside** |
| Must | A working `git push`, and correct git identity when one is configured |
| Must | Sessions and history survive a chamber being destroyed |
| Should | Clipboard — image paste into the prompt, copy out of the terminal |
| Should | Dev servers started inside are reachable from the host browser |

**Slice** — a working vertical increment. Each leaves something usable; slices
ship in order and don't front-load decisions a later slice answers better.

## Rules that generalise

Each earned by a ticket, each expected to decide the same way again.

**Verify, never manage (the gateway)** — komora depends on an OpenShell gateway
but does not install, configure, or select a compute driver for one; those stay
the developer's, so an OpenShell upgrade never fights the wrapper. komora only
runs a **read-only preflight** (`openshell status`) before any sandbox
operation and reports actionably when no gateway is reachable, rather than
failing partway through creation with an error that reads like a komora bug.
The general shape: where OpenShell owns a thing, komora checks it and speaks to
its state, never reaches in to change it.

**Prefer OpenShell's own mechanism over komora storage** — where OpenShell
already holds a thing, komora wraps it rather than reimplementing it: secrets
via providers, forwarding via `openshell forward service`, egress rules
via `--policy`. The one thing komora owns outright is its **egress policy**, and
only because a custom `--policy` fully *replaces* the built-in default rather
than merging with it (verified, not assumed) — so changing one rule means
vendoring the whole base policy. That is the most expensive coupling to
OpenShell komora has taken on, and the debt is real: upstream policy changes do
not reach komora's chambers until someone diffs the image.

**The policy gates `(binary, endpoint)` pairs, not endpoints** — allowing a host
is not enough if the binary dialling it is off that policy's list. Expect this
on every policy addition.

**Credentials are a matter of inside komora** — komora derives no agent
credential from the host. The profile volume starts empty and the developer logs
in *inside* the chamber, which deletes the whole `401 OAuth access token has
been revoked` failure class: there is no host copy to go stale, and no host
config dir to resolve wrong. An error in that class pointed convincingly at the
wrong layer for a long time.

**A tool's state is not all in the directory it names** — Claude Code keeps its
credential, sessions, and history in `~/.claude/` but its account binding in
`~/.claude.json`, a *sibling*. Mounting the directory persisted the secret and
lost the identity, so a fresh chamber was authenticated yet showed onboarding.
Before trusting a mount to persist a tool, enumerate what it writes and where;
where it offers a single-root override (`CLAUDE_CONFIG_DIR`), prefer that to
guessing the layout. The mirror of *synthesize, never mount*: komora rewrites
what it sends **in**, and pins down where the tool writes **out**.

**Warn, never block, on the daily launch path** — missing git setup produces a
warning and a working chamber. A confirmation prompt on a path taken many times
a day is the ceremony the zero-ceremony Must exists to prevent.

**Reasoning from what a policy omits does not establish what a program needs** —
check the program's own documented network requirements first. The shipped
policy allows `platform.claude.com` but not `claude.ai`, which looks like an
oversight and is correct: the chamber needs only the token-exchange host,
because OAuth's browser half runs on the host. This cost two wrong conclusions
in one session.

**Synthesize, never mount** — komora pulls **named values** from a source
rather than bind-mounting the file that holds them. A host config file bundles
host-bound assumptions (absolute binary paths, credential helpers, `includeIf`
chains); mounting it imports all of them to obtain the few that were wanted. See
[ADR-0003](docs/adr/0003-git-identity-synthesized-not-mounted.md).

**Inject at the proxy, never in the chamber** — a secret that must authenticate
outbound traffic from the blast radius (the git-push PAT) is held in gateway
state and added as a bearer header by the egress proxy; the chamber sees only an
opaque placeholder, never the token. Possession is the exposure, so removing
possession while keeping *use* is the win: the credential cannot be exfiltrated,
only spent through the proxy while the chamber is live. Push needs **three**
pieces, none sufficient alone: this proxy-injected credential, the policy's
`git-receive-pack` rule, *and* a git-side `url.insteadOf` rewrite that makes git
actually send an authenticated request (git does not read `GITHUB_TOKEN` on its
own; with no configured credential it prompts for a username and, non-interactive,
fails before reaching the proxy). See
[ADR-0004](docs/adr/0004-git-push-credential-pat-at-the-proxy.md).

**A capability that holds the terminal gets its own command** — `komora forward`
runs in the foreground and is not folded into `run`. `openshell forward service`
has no background flag (`forward start` does; that one binds local==remote and
its `-d` did not detach), and `run` already spends the terminal on the agent's
TTY. Sharing one invocation would mean daemonising a child komora does not
supervise, plus a pidfile and crash cleanup — machinery this architecture exists
to avoid. A second terminal is the honest shape, and the one `ssh -L` and
`kubectl port-forward` already trained the hands for. The forward's lifetime is
the terminal's, so Ctrl-C leaves nothing behind (verified: both host ports
released, no active forwards, chamber still Ready).

**Same verb, three mechanisms, one right answer** — "forwarding" named three
different things in OpenShell, and picking by name rather than by shape would
have picked wrong twice. `--forward` is create-time only, so it cannot reach a
long-lived chamber that is already running and cannot know a port the dev server
has not chosen yet. `forward start` is not gRPC at all — it shells out to
`ssh -L` via `openshell ssh-proxy`, binding local==remote so a host clash is
unresolvable. Only `forward service` attaches to an already-running, *idle*
sandbox and splits target from local. The lesson generalises past forwarding:
when an upstream offers several commands for one verb, test which one attaches
to the state komora actually has, rather than taking the one the docs mention
first.
