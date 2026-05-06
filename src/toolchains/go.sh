#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: go.sh <version>}"
curl -fsSL "https://go.dev/dl/go${VERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xz
echo 'export PATH="/usr/local/go/bin:$PATH"' >> /home/agent/.bashrc
