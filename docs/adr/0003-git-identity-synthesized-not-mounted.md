# ADR-0003: Git identity is synthesized, never mounted

- **Status**: Accepted
- **Date**: 2026-07-28
- **Ticket**: [#13 Decide how git identity reaches a chamber](https://github.com/arteven/komora/issues/13)
- **Split from**: [#4 Choose the chamber image](https://github.com/arteven/komora/issues/4), where identity was carved out of the dotfiles decision
- **Bounded by**: [#9 Decide the git credential path](https://github.com/arteven/komora/issues/9) — push credentials and signing keys are that ticket's, not this one's

## Context

Correct git identity is a **Must**-tier fidelity requirement: a chamber whose
commits are attributed wrongly fails the contract on first real use, and wrong
attribution is expensive to unwind once it is in someone else's history.

#4 decided the image carries **no dotfiles**. That cannot simply extend to git
identity, because identity is Must-tier while dotfiles generally are not — so
identity needs its own answer rather than inheriting #4's.

A representative host global config sorts into four groups: identity
(`user.name`, `user.email`); a GUI merge/difftool bound to an **absolute host
binary path**, plus its prompt/backup settings; behavioural preferences
(`init.defaultBranch` and an advice suppression); and credential helpers that
shell out to a host CLI **by absolute path**.

That distribution is the whole argument. Bind-mounting the host file imports
entries that are broken inside a chamber (a GUI tool that has neither its binary
nor a display) and entries that are unwanted (credential helpers, which would
drag #9's exposure decision in silently, through the identity path, without
anyone deciding it) — in order to deliver the two lines that actually matter.

Under [ADR-0001](0001-arch-base-image-recreatable-not-reproducible.md), a
mounted config is also not **irreplaceable** — it regenerates from its sources
trivially — so the disposability constraint gives no reason to mount either.

## Amendment (2026-08-05, #27): explicit-only, warn-never-block, and where it lives

The clone-inside architecture ([#14](https://github.com/arteven/komora/issues/14))
and the auth-inside-the-chamber decision ([#30](https://github.com/arteven/komora/issues/30))
withdrew this ADR's host-facing parts. What is **current** is here; the sections
below are kept for the reasoning, with the superseded ones marked. This is the
same "append a correction, don't rewrite history" discipline the map uses.

1. **§1 (synthesize, never mount) and §2 (regenerated every start) stand
   unchanged** — and are now *load-bearing*, since a chamber that mounted the
   host `~/.gitconfig` is structurally impossible under clone-inside anyway.
   Verified live (#27): a commit inside a real chamber carries the configured
   identity, read via `GIT_CONFIG_GLOBAL`.

2. **§3 (host fallback) is withdrawn.** Identity comes from komora's own config
   and **nowhere else**. There is no read-through to the host global or the repo
   local. Deriving identity from the host is the same category of mistake as
   deriving the *credential* from the host, which #30 removed wholesale — it
   reintroduces exactly the host-bound coupling §1 exists to prevent. An unset
   identity is **unset**, not inherited. This makes the prototype's `resolve_git`
   precedence chain moot: there is no chain left, only a single source.

3. **§5 (warn-and-confirm) becomes warn-only.** A chamber with no identity
   **still starts**; komora prints an actionable warning (naming both
   `komora git config` commands) and hands off. A confirmation prompt on the
   daily launch path is the ceremony the zero-ceremony Must exists to prevent
   ("warn, never block, on the daily launch path"). The §5 requirement for a
   non-interactive pre-confirm flag (`KOMORA_ASSUME_YES`) is therefore **dropped
   for this path** — there is no prompt to skip.

4. **§4's surface is narrowed to identity.** `komora git config` manages
   `user.name` and `user.email` only — komora's config is not a general git
   config store. The seeded `init.defaultBranch` and the arbitrary-key escape
   hatch are not built; add them back only if a real need appears.

5. **Where komora's own config lives (new decision this ADR now records).**
   komora keeps its own global config at
   `${XDG_CONFIG_HOME:-$HOME/.config}/komora/config`, INI-shaped in git's
   vocabulary so `git config --file` is its reader/writer. This is the first
   komora-owned config file, sized to hold more later (#22's PAT wants to sit
   beside the identity).

6. **Where the identity lands *inside* the chamber (the substantive question
   #27 answered).** The sandbox home is `/sandbox`; the repo volume mounts at
   `/sandbox/repo` and the profile volume at `/sandbox/.claude`, so **neither**
   covers `/sandbox/.gitconfig`. Rather than add a third mount for one file,
   komora writes the identity into the **profile volume**
   (`/sandbox/.claude/gitconfig`) and points git at it with `GIT_CONFIG_GLOBAL`,
   which git honours ahead of `~/.gitconfig` regardless of `HOME`. Identity
   therefore travels with the profile volume — the same volume the credential
   lives in — and survives a resume, since that volume outlives the sandbox. The
   fresh-every-start write (§2) is a shell fragment prepended to the in-chamber
   command on **both** the create and resume paths, alongside the
   `CLAUDE_CONFIG_DIR` override it shares a rationale with.

7. **§6 (per-profile override) stays deferred** as map fog — identity is global
   for now. §7 (signing declined) stands unchanged.

## Amendment (2026-08-05, #26): how the rule generalised, and how it did not

#26 set out to generalise this ADR "from git identity to credential staging".
That framing is now wrong, and the correction is worth more than the
generalisation would have been: **komora stages no credential at all.** #30
removed host credential derivation wholesale — the profile volume starts empty
and the developer logs in *inside* the chamber. There is no staging path left
for this rule to extend to.

What the rule generalised into instead is **two rules pointing in opposite
directions**, which together cover everything that crosses the chamber boundary:

1. **Synthesize, never mount** (this ADR, unchanged) governs what komora writes
   **into** a chamber: pull *named values* and rewrite them on every start, so
   the chamber holds a copy and never the truth. Applies to derived config.

2. **A tool's state is not all in the directory it names**
   ([#29](https://github.com/arteven/komora/issues/29)) governs what a tool
   writes **out**. Claude Code keeps its credential, sessions, and history in
   `~/.claude/` but its account binding in `~/.claude.json` — a *sibling*.
   Mounting the directory persisted the secret and lost the identity, so a fresh
   chamber was authenticated yet showed onboarding. Before trusting a mount to
   persist a tool, enumerate what the tool writes and where; where the tool
   offers a single-root override (`CLAUDE_CONFIG_DIR`), prefer it to guessing
   the layout.

For a secret that must authenticate *outbound* traffic, neither applies — that
is [ADR-0004](0004-git-push-credential-pat-at-the-proxy.md)'s **inject at the
proxy, never in the chamber**, which keeps the secret out of the blast radius
entirely rather than deciding how it gets in.

So the honest summary: this ADR's rule stayed exactly as wide as it was, and the
adjacent problems got their own rules rather than being absorbed into this one.

## Decision

### 1. Synthesize, never mount

komora writes the chamber's `.gitconfig` itself. The host's `~/.gitconfig` is
never bind-mounted, and neither is any file that `include`s it.

Synthesis means komora pulls **named values**, never a file. The difftool block
and the credential helpers therefore do not travel, by construction rather than
by filtering.

### 2. Regenerated on every chamber start

The chamber's `.gitconfig` is a **derived artifact**, rewritten on each start.
The chamber holds a copy; the truth lives outside it.

The alternative — writing it once at chamber creation — puts identity in the
writable layer, where ADR-0001 says nothing irreplaceable may live. It would
survive until a recreate silently reset it. Regenerating on start makes a
recreate a non-event, and it is what allows a mid-work profile switch (#8) to
re-derive identity correctly rather than leaving the pre-switch value in place.

### 3. Resolution order, with the host as a fallback source

For each essential key, at chamber start, first hit wins:

1. **komora's own config** — set via `komora git config`
2. **the host's `git config --global`**
3. **the repo's own config** (`--local`, in the project being chambered)
4. **none** — see §5

komora's config is an **override**, not a prerequisite. An unconfigured komora
still produces correct identity by reading through to the host, so first launch
needs no setup step — which matters because zero-ceremony launch is itself
Must-tier.

Reading the host here is not a retreat from §1. §1 governs *what form* the value
takes (named values, not a mounted file); this governs *where the value comes
from when komora has none*. The host is back in the loop deliberately, as a
source — the resolution still happens fresh on every start, and the result is
still derived and disposable.

### 4. Seeded defaults, extended in git's own syntax

komora seeds three keys: `user.name`, `user.email`, `init.defaultBranch`.

These are **defaults, not an allowlist**. Any key can be added with:

```
komora git config <key> <value>
```

which follows git's own key/value syntax, so there is no second vocabulary.
This replaces the fixed-allowlist-plus-passthrough-knob design considered
first: the escape hatch is the command surface itself, so a missed key costs a
command rather than a code change.

**One deliberate seam.** komora borrows git's key/value syntax but **not** git's
scope flags. Git's `--global`/`--local`/`--system` describe git's own scopes;
komora's scope axis is *global to komora* vs *per-profile* (§6), which is a
different shape. Reusing git's flag names would make `--global` mean two things.
komora keeps its own scope flag with its own name; the spelling belongs to #7.

`core.editor` is deliberately **left unset**. Under §4 it is not a decision —
it is a key to set if git's fallback ever becomes annoying.

### 5. Unresolved identity warns and requires confirmation

If all three sources are empty, komora **warns and asks for confirmation**
before starting. On confirm, the chamber starts without git identity, and the
human has accepted that commits will fail or misattribute. On decline, no
chamber starts.

Rejected alternatives, and why:

- **Start silently with no identity** — this is the failure the ticket exists
  to prevent. Git falls back to a container-derived identity, commits look
  plausible, and the damage is found later in a real repo's history.
- **Refuse to launch outright** — holds hostage work that has nothing to do
  with git. An identityless repo an agent only needs to *read* becomes
  unlaunchable.
- **Mechanically disable git** — needs an enforcement mechanism, and the weak
  version of it (just not writing a `.gitconfig`) is the silent-misattribution
  case above wearing a different hat. Confirmation puts the human in the loop
  and needs no enforcement at all.

Two requirements follow. The warning must **name the sources it checked** and
the command to fix it — "no git identity found" sends the reader hunting,
whereas naming komora config, host global, and repo local does not. And there
must be a **non-interactive pre-confirm flag**: a prompt is correct for a human
at a terminal and fatal for anything scripted. Both land on #7.

### 6. Global identity, with per-profile override

Identity is global to komora by default. A profile may override it, and the
profile's value wins when present.

Profiles are a **credential selection**, and identity is not a credential —
which argues identity sits off the profile axis entirely. But if a profile ever
corresponds to a separate context (work vs personal accounts), a single global
identity misattributes every commit made under it, which is the Must-tier
failure again. Global-with-override forces no decision now and precludes
nothing; the override's mechanics belong to #8.

### 7. Commit signing is explicitly declined

Not an oversight — a stated non-goal.

A signing key is a **credential**. Getting one into a chamber means mounting key
material into the blast radius or forwarding an agent socket, which #9 names as
a signing oracle: anything in the chamber can use it against every repo the
developer can reach. That is precisely the exposure the safety driver exists to
avoid, and admitting it here would smuggle it in as a side effect of an
*identity* decision rather than a deliberate credential one.

Identity is *who the commits say they are from*. Signing is *proof it was really
them*. Different problems. If signing is ever wanted, it enters through #9 as a
credential decision — **never** through the identity path.

## Consequences

- Anything not in the resolution chain is simply **absent** inside a chamber.
  This is the honest cost of synthesis, and it is discovered by missing it. §4
  makes recovery a single command.
- **#7 inherits three requirements**: the `komora git config` surface, komora's
  own scope flag (distinct from git's), and a non-interactive pre-confirm flag
  for the §5 warning. These are the first concrete constraints placed on the
  command surface from outside that ticket.
- **#8 inherits** the per-profile identity override.
- Chamber start becomes **conditionally interactive** — only on the unresolved
  path, and permanently quiet once identity resolves anywhere in the chain.
- The generalisable rule, and the one worth remembering: **pull named values,
  never mount a config file.** A host config file is a bundle of host-bound
  assumptions — absolute binary paths, credential helpers, `includeIf` chains.
  Mounting it imports every one of them to obtain the few that were wanted, and
  the imported ones fail in ways that look like komora's fault.
