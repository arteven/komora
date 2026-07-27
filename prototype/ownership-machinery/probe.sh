#!/usr/bin/env bash
# PROTOTYPE — throwaway spike for komora issue #5. Not production code.
#
# Question: what must be built *around* --userns=keep-id:uid=N,gid=N for
# ownership to actually hold in daily use?
#
# Every probe is a real podman run; full state is printed after each step.
# Corrected after a first pass whose probes 5a/7b/7c were broken by spike
# bugs (missing mount dir, `git` absent from base-devel, unquoted loop var) —
# those are fixed here, and the fixes changed two conclusions.
#
# Env this was run against: Podman 6.0.1, crun 1.28, Linux 6.12, subuid 100000+65536.
set -u

IMG=${IMG:-localhost/komora-ownspike:latest}          # arch base-devel + baked agent uid 1000
IMG_GIT=${IMG_GIT:-localhost/komora-ownspike-git:latest}  # same + git
KEEPID="--userns=keep-id:uid=1000,gid=1000"
UID_H=$(id -u); GID_H=$(id -g)
ROOT=$(mktemp -d /tmp/ownspike.XXXXXX)

hr()  { echo; echo "=============== $* ==============="; }
sub() { echo; echo "--- $* ---"; }
# NOTE: plain `find` CANNOT stat subuid-owned dirs as the host user; use
# stat per-path, or podman unshare, when inspecting possibly-poisoned trees.
census() { find "$1" -printf '   %u:%g %p\n' 2>&1 | head -8; }
vol()    { podman volume inspect "$1" --format '{{.Mountpoint}}'; }
fresh()  { podman volume rm -f "$1" >/dev/null 2>&1; podman volume create "$1" >/dev/null; }

######################################################################
hr "1. NAMED VOLUMES — do they need repair at all?"
######################################################################
sub "1a. fresh named volume + keep-id + non-root image user"
fresh ownspike-v1
podman run --rm $KEEPID -v ownspike-v1:/vol $IMG \
  bash -c 'ls -ldn /vol; touch /vol/probe && echo "WRITE OK" || echo "WRITE FAILED"'
census "$(vol ownspike-v1)"
# RESULT: WRITE OK, host-owned. A *fresh* volume under keep-id needs NO chown.

sub "1b. volume mounted over an image-populated path (/home/agent)"
fresh ownspike-v2
podman run --rm $KEEPID -v ownspike-v2:/home/agent $IMG \
  bash -c 'ls -ldn /home/agent; ls -a /home/agent | head -4; touch /home/agent/x && echo "WRITE OK"'
census "$(vol ownspike-v2)"
# RESULT: WRITE OK — podman copies image content up and it lands correctly owned.

######################################################################
hr "2. THE DRIFT CASE — volume written without keep-id, then used with it"
######################################################################
fresh ownspike-v3
sub "2a. a prior/other run writes as plain root, no keep-id"
podman run --rm --user 0:0 -v ownspike-v3:/vol $IMG \
  bash -c 'touch /vol/stale; chown -R 1000:1000 /vol; ls -ln /vol'

sub "2b. agent tries to use it under keep-id"
podman run --rm $KEEPID -v ownspike-v3:/vol $IMG \
  bash -c 'ls -ln /vol; touch /vol/x 2>&1 && echo "WRITE OK" || echo "WRITE FAILED"'
# RESULT: WRITE FAILED. This is the case that needs repair.

######################################################################
hr "3. CHOWN REPAIR — the userns the repair runs in is what matters"
######################################################################
sub "3a. WRONG: disposable root-chown container WITHOUT keep-id (ai-pod's shape)"
podman run --rm --user 0:0 -v ownspike-v3:/vol $IMG chown -R 1000:1000 /vol
podman run --rm $KEEPID -v ownspike-v3:/vol $IMG \
  bash -c 'ls -ln /vol; touch /vol/after 2>&1 && echo "WRITE OK" || echo "WRITE FAILED"'
# RESULT: WRITE FAILED, and the files now show as uid 999 inside.
# The two containers have DIFFERENT uid maps, so "1000" names different host
# identities: without keep-id, container 1000 -> host 100999 (subuid range).

sub "3b. why: compare the two uid maps"
echo "no-keep-id root container:"; podman run --rm --user 0:0 $IMG cat /proc/self/uid_map
echo "keep-id container:";        podman run --rm $KEEPID $IMG cat /proc/self/uid_map

sub "3c. RIGHT: repair as root INSIDE the same keep-id userns"
fresh ownspike-v4
podman run --rm --user 0:0 -v ownspike-v4:/vol $IMG bash -c 'touch /vol/stale; chown -R 1000:1000 /vol'
echo "agent write BEFORE repair:"
podman run --rm $KEEPID -v ownspike-v4:/vol $IMG \
  bash -c 'touch /vol/x 2>&1 && echo "WRITE OK" || echo "WRITE FAILED (expected)"'
podman run --rm $KEEPID --user 0:0 -v ownspike-v4:/vol $IMG chown -R 1000:1000 /vol
echo "agent write AFTER repair:"
podman run --rm $KEEPID -v ownspike-v4:/vol $IMG \
  bash -c 'touch /vol/y 2>&1 && echo "WRITE OK" || echo "WRITE FAILED"'
# RESULT: FAILED -> OK. `keep-id + --user 0:0` is the correct repair shape.

sub "3d. cost of the repair container"
time podman run --rm $KEEPID --user 0:0 -v ownspike-v4:/vol $IMG chown -R 1000:1000 /vol

######################################################################
hr "4. ESCAPE MODE — package installs"
######################################################################
mkdir -p "$ROOT/esc" "$ROOT/esc2"
sub "4a. pacman under keep-id as the non-root agent"
podman run --rm $KEEPID -v "$ROOT/esc:/work:Z" $IMG \
  bash -c 'id -u; pacman -Sy --noconfirm tree 2>&1 | tail -1'
# RESULT: "error: you cannot perform this operation unless you are root."

sub "4b. sudo inside keep-id?"
podman run --rm $KEEPID $IMG bash -c 'sudo -n true 2>&1 || echo "SUDO UNAVAILABLE"'

sub "4c. escape: root, NO keep-id (agent-sandbox's root() profile)"
echo host-content > "$ROOT/esc2/hostfile"
podman run --rm --user 0:0 -v "$ROOT/esc2:/work:Z" $IMG bash -c '
  pacman -Sy --noconfirm tree >/dev/null 2>&1 && echo "INSTALL OK"
  echo made-by-root > /work/root-made.txt; mkdir -p /work/sub; echo n > /work/sub/n.txt'
census "$ROOT/esc2"
echo appended >> "$ROOT/esc2/root-made.txt" && echo "HOST EDIT OK"
# RESULT: INSTALL OK and everything host-owned — root maps 1:1 to the host user.

sub "4d. the escape-mode LIMIT: a build that drops privileges"
podman run --rm --user 0:0 -v "$ROOT/esc2:/work:Z" $IMG \
  bash -c 'runuser -u agent -- bash -c "echo x > /work/by-agent.txt" && echo "drop-priv OK" || echo "drop-priv DENIED"'
# RESULT: Permission denied — in escape mode container uid 1000 -> host 100999.
# Fails loudly rather than silently poisoning. Escape mode is root-only work.

######################################################################
hr "5. REPAIR OF ALREADY-WRONG HOST FILES (subuid-owned)"
######################################################################
mkdir -p "$ROOT/wrong"; echo good > "$ROOT/wrong/mine.txt"
sub "5a. poison it the way :U does"
podman run --rm --user 1001:1001 -v "$ROOT/wrong:/work:U" $IMG bash -c 'touch /work/poisoned.txt; true'
for f in "$ROOT/wrong" "$ROOT/wrong/mine.txt" "$ROOT/wrong/poisoned.txt"; do stat -c '   %u:%g %n' "$f"; done

sub "5b. host chown (unprivileged) — refused"
chown -R "$UID_H:$GID_H" "$ROOT/wrong" 2>&1 | head -2

sub "5c. repair via podman unshare (chown to 0:0 = the host user in that ns)"
podman unshare chown -R 0:0 "$ROOT/wrong" && echo "UNSHARE CHOWN OK"
for f in "$ROOT/wrong" "$ROOT/wrong/mine.txt" "$ROOT/wrong/poisoned.txt"; do stat -c '   %u:%g %n' "$f"; done
echo x >> "$ROOT/wrong/mine.txt" && echo "HOST EDIT OK"

sub "5d. detection — cheap pre-flight scan"
find "$ROOT/wrong" ! -uid "$UID_H" -printf '   %u %p\n' 2>/dev/null | head -5
echo "(empty above = clean)"

######################################################################
hr "6. AWKWARD CASES"
######################################################################
mkdir -p "$ROOT/awk"
sub "6a. round-trip: create inside -> edit on host -> edit inside"
podman run --rm $KEEPID -v "$ROOT/awk:/work:Z" $IMG bash -c 'echo made-inside > /work/inside.txt'
stat -c '   %u:%g %n' "$ROOT/awk/inside.txt"
echo host-appended >> "$ROOT/awk/inside.txt" && echo "host edit OK"
podman run --rm $KEEPID -v "$ROOT/awk:/work:Z" $IMG \
  bash -c 'echo again >> /work/inside.txt && echo "inside re-edit OK"; cat /work/inside.txt'

sub "6b. git: repo created inside, then used from the host"
podman run --rm $KEEPID -v "$ROOT/awk:/work:Z" $IMG_GIT bash -c '
  cd /work && git init -q repo && cd repo
  git -c user.email=a@b.c -c user.name=probe commit -q --allow-empty -m x && echo "COMMIT OK"
  git status --porcelain=v1 >/dev/null && echo "STATUS OK"'
git -C "$ROOT/awk/repo" log --oneline 2>&1 | head -2

sub "6c. git: HOST-created repo used inside (the real daily case)"
git init -q "$ROOT/hostrepo"
git -C "$ROOT/hostrepo" -c user.email=a@b.c -c user.name=h commit -q --allow-empty -m from-host
podman run --rm $KEEPID -v "$ROOT/hostrepo:/work:Z" $IMG_GIT bash -c '
  cd /work
  git status --porcelain=v1 >/dev/null 2>&1 && echo "STATUS OK (no safe.directory complaint)" || git status 2>&1 | head -3
  echo change > f.txt && git add f.txt && git -c user.email=a@b.c -c user.name=p commit -q -m inside && echo "COMMIT INSIDE OK"'
git -C "$ROOT/hostrepo" log --oneline 2>&1 | head -3

sub "6d. many small files (node_modules shape): 3000 files"
time podman run --rm $KEEPID -v "$ROOT/awk:/work:Z" $IMG \
  bash -c 'mkdir -p /work/nm; cd /work/nm; for i in $(seq 1 3000); do echo x > "f$i"; done; ls | wc -l'
find "$ROOT/awk/nm" -printf '%u:%g\n' | sort | uniq -c

######################################################################
hr "7. PERFORMANCE — does keep-id cost anything?"
######################################################################
sub "7a. plain run (no keep-id)"; time podman run --rm --user 0:0 $IMG true
sub "7b. keep-id run";           time podman run --rm $KEEPID $IMG true

echo; echo "=============== scratch: $ROOT ==============="
