#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: node.sh <version>}"
curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
export PATH="/root/.local/share/fnm:$PATH"
eval "$(fnm env)"
fnm install "$VERSION"
fnm default "$VERSION"
echo 'eval "$(fnm env)"' >> /home/agent/.bashrc
