# ADR-0004: git push credential — a PAT injected at the proxy, never in the chamber

- **Status**: Accepted
- **Date**: 2026-08-05
- **Ticket**: [#22 Push to GitHub from inside the sandbox](https://github.com/arteven/komora/issues/22), which folded in and closes [#9 Decide the git credential path and accepted exposure](https://github.com/arteven/komora/issues/9)
- **Builds on**: [ADR-0003](0003-git-identity-synthesized-not-mounted.md) (identity, which explicitly deferred the *credential* to #9) and the vendored egress policy ([#29](https://github.com/arteven/komora/issues/29), [#31](https://github.com/arteven/komora/issues/31))

## Context

A chamber can already clone, fetch, and run the agent. What it could not do was
**push** — and #9 posed the two questions that gate it: *how does a chamber get
the credential to push, and what is the accepted exposure?*

#9's own framing sets the constraint. An agent running unleashed inside a chamber
is only as contained as the credentials it can reach. A forwarded ssh-agent
socket is a **signing oracle** — anything in the chamber can use it against every
repo the developer can reach. A long-lived, full-scope token is worse. #9's
leading candidate was ssh-agent forwarding plus short-lived GitHub-CLI tokens;
its adopted technique was **pass a file path, never the secret**, so credentials
never land in process argv or environment.

Two things resolved the question differently, and better, than that candidate:

1. **The egress proxy exists and is default-deny.** komora vendors the whole
   OpenShell policy and owns it (#29/#31). Every byte the chamber sends to
   github.com already passes through a proxy komora controls the policy for.
2. **OpenShell's provider system injects credentials *at that proxy*.** The
   builtin `github` provider profile declares `auth_style: bearer`,
   `header_name: authorization` (verified against `providers/github.yaml`
   @ v0.0.93). The real PAT is held in gateway state; the chamber receives only
   an **opaque placeholder** environment variable, and the proxy substitutes the
   real bearer header onto outbound requests to the provider's declared
   endpoints.

This is strictly better than "pass a file path, never the secret": there is no
secret file to pass at all. The token never enters the chamber in any form —
not argv, not environment, not a mounted file, not a volume.

**Push needs THREE halves; none works alone.** This is the reconciliation of an
apparent contradiction the codebase carried: the policy provenance header records
that a custom `github` *provider profile* "composes nothing" for push. All three
are true and they are different pieces:

- the builtin github profile *authenticates* github.com, but its own L7 rules
  allow only `git-upload-pack` (fetch/clone), **not** `git-receive-pack` (push);
- komora's vendored policy adds the `git-receive-pack` allow rule, but injects
  no credential;
- git itself **will not send an authenticated request** to github.com without a
  git-side credential configured — with none it prompts for a username and, being
  non-interactive in the chamber, dies with `fatal: could not read Username for
  'https://github.com'` *before any request reaches the proxy* (verified live).

So there are three pieces, learned the hard way during #22's live bring-up:

1. **policy** opens the push path (`git-receive-pack` allow rule);
2. **provider** holds the real PAT and injects it at the proxy;
3. **a git-side `url.insteadOf` rewrite** makes git actually emit an
   authenticated request carrying the provider's placeholder, which the proxy
   then rewrites to the real token.

The third piece is the one that surprised us: the provider injects a `GITHUB_TOKEN`
env var into the chamber, but **git does not read `GITHUB_TOKEN` on its own** — it
is not a credential-source git knows about. The placeholder must be woven into a
credential git *will* use. komora writes, into the chamber's `GIT_CONFIG_GLOBAL`
on every start:

```
git config url."https://x-access-token:$GITHUB_TOKEN@github.com/".insteadOf "https://github.com/"
```

`$GITHUB_TOKEN` is expanded **inside the chamber**, so it captures OpenShell's
current opaque, revision-scoped placeholder (`openshell:resolve:env:v<N>_GITHUB_TOKEN`)
— komora never handles the value, and rotation stays transparent. git then sends
that placeholder as an HTTP Basic password; the proxy's Basic-rewrite path swaps in
the real PAT on the wire. The rewrite is guarded on `[ -n "$GITHUB_TOKEN" ]` so it
is inert when no provider is attached, and it is re-synthesized on resume for the
same reason identity is (ADR-0003): a create-only write goes stale when the
placeholder revision rotates.

Two forms were tried and rejected in favour of `insteadOf`: an
`http.<url>.extraheader` carrying `Authorization: Bearer $GITHUB_TOKEN` — which
**git 2.43 ignores for its credential decision**, still prompting for a username
(verified live via `ls-remote`) — and embedding the credential in each remote's
URL, which is per-clone rather than a single global rule. `insteadOf` is the one
form that is both global and one git actually authenticates with.

## Decision

### 1. The credential is a GitHub PAT, injected at the proxy by an OpenShell provider

komora registers one OpenShell `github` provider per profile
(`komora-github-<profile>`) with `provider create --type github --from-existing`,
and attaches it to the chamber with `sandbox create --provider …`. The PAT is
read from the host environment (`GITHUB_TOKEN`, then `GH_TOKEN`) *by OpenShell*,
stored in gateway state, and never handled by komora as a value — komora reads
only the *name* of the variable that holds it, never its contents. The chamber
holds only the placeholder.

This keeps ADR-0003's rule intact and extends it: the chamber holds a *copy* of
identity and *no copy at all* of the credential.

### 2. Push wiring is opt-in; its absence never blocks a launch

With no PAT in the host environment komora attaches no provider, warns
actionably (naming the variable and this ADR), and creates the chamber anyway.
Clone, fetch, and the agent all still work; only push is withheld. This is the
same warn-never-block discipline ADR-0003 §3 applies to identity, for the same
reason: a chamber whose repo an agent only needs to read must not be held
hostage to a push credential it will never use.

### 3. Registration is idempotent and per-profile

The provider name is derived from the profile, so create-or-reuse is a name
lookup (`provider get`), mirroring how sandbox and volume creation already gate
on existence. Because the provider is a **credential selection** and a profile
*is* a credential selection (CONTEXT.md), switching profiles switches which PAT
(if any) signs pushes — the provider sits naturally on the profile axis, unlike
identity, which ADR-0003 keeps global.

### 4. ssh-agent forwarding and commit signing stay declined

#9's ssh-agent-forwarding candidate is **not** adopted. Forwarding a socket into
the blast radius is the signing-oracle exposure the safety driver exists to
avoid, and the proxy-injected PAT obtains push without it. Commit signing
remains declined exactly as ADR-0003 §7 states — a signing key is a credential
whose only in-chamber delivery is key material or a forwarded socket, both of
which reintroduce the oracle. Signing, if ever wanted, is a separate credential
decision, not a rider on this one.

## Accepted exposure

This is the accepted-risk statement #9 required. It states what a **compromised
agent** — one driven by hostile content: prompt injection from a fetched page, a
malicious dependency postinstall, a poisoned tool response — could do with the
push credential, and what it deliberately cannot.

**What the credential cannot do, by construction:**

- **It cannot be exfiltrated.** The real PAT is never in the chamber. A
  compromised agent can read its environment, its filesystem, and its volumes
  and find only an opaque placeholder. It cannot copy the token out, print it,
  POST it, or commit it, because it never possesses it.
- **It cannot reach non-GitHub hosts.** The default-deny proxy allows only the
  policy's declared endpoints. The credential is a bearer header the proxy adds
  to github.com traffic; it is not a general outbound capability.

**What a compromised agent *can* do while the chamber is live — the accepted
exposure:**

- **Push to any repo the PAT is scoped to.** Within its scope, the agent can
  push arbitrary refs — force-push, delete branches, push to any branch it can
  reach — for as long as the chamber runs. The proxy authenticates the push; it
  does not judge its contents. **This is the exposure, and it is bounded by the
  PAT's scope, which is the developer's to choose.** The stated expectation is a
  **fine-grained PAT** scoped to the specific repositories in play with
  **contents: read and write**, not a classic all-repo token. A push-scoped
  fine-grained PAT cannot read secrets, change settings, delete repos, or act
  outside its named repositories.
- **Spend the credential only through the proxy, only while attached.** The
  exposure is a *use* exposure, not a *possession* exposure: it ends when the
  chamber stops, and it never becomes a portable secret the agent can carry
  elsewhere. Rotating or revoking the PAT at GitHub cuts it off immediately,
  with nothing staged in a chamber to go stale (contrast the `401 …revoked`
  class #30 removed for the agent credential — the same property holds here).

**Knowingly left open** (accepted, not overlooked):

- **In-scope blast radius is real.** A compromised agent *can* damage the repos
  the PAT is scoped to (bad commits, force-pushes) while the chamber is live.
  The mitigation is scope, not mechanism: keep the PAT fine-grained and narrow.
  komora does not mint or narrow the token — that stays the developer's, the
  same boundary "verify, never manage" draws around the gateway (CONTEXT.md).
- **Short-lived tokens are not required.** #9 floated installation tokens
  measured in low hours. A fine-grained PAT injected at the proxy already gives
  the two properties that mattered — never-in-chamber and instantly-revocable —
  so token *lifetime* is left to the developer rather than mechanised by komora.
- **Unfiltered outbound is not the position; it never was.** The proxy is
  default-deny. This ADR widens it by exactly one rule (`git-receive-pack`) and
  one credential, and nothing else.

## Consequences

- **#9 is closed by this ADR**, which records the credential model and the
  accepted-risk statement #9 asked for — arriving at a different, stronger answer
  (proxy-injected PAT) than #9's leading candidate (ssh-agent + short-lived CLI
  tokens).
- **The generalisable rule:** where a secret must authenticate outbound traffic
  from the blast radius, inject it **at the proxy** and leave a placeholder in
  the chamber — never stage the secret inside. Possession is the exposure;
  proxy-injection removes possession while keeping use.
- **komora reads the name of a credential variable, never its value.** This
  boundary — komora wires the credential path without ever handling the secret —
  is a property worth preserving in any future credential komora brokers.
- The policy delta, the provider wiring, and the git-side `url.insteadOf`
  rewrite are **three pieces of one capability**; dropping any one silently
  disables push while the other two still look correct — a re-vendor that drops
  the `git-receive-pack` rule, a launch with no provider, or a change to the
  chamber gitconfig synthesis that omits the rewrite. The policy's ticket-cited
  delta comment, `chamber_gitconfig_snippet`'s push-credential block, and this
  ADR are the linked record of why all three are there.
