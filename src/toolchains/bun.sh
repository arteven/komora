#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: bun.sh <version>}"
curl -fsSL https://bun.sh/install | bash -s "bun-v${VERSION}"
echo 'export PATH="/home/agent/.bun/bin:$PATH"' >> /home/agent/.bashrc
