#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?go version required}"
curl -fsSL "https://go.dev/dl/go${VERSION}.linux-amd64.tar.gz" -o /tmp/go.tgz
tar -C /usr/local -xzf /tmp/go.tgz && rm /tmp/go.tgz
ln -sf /usr/local/go/bin/go /usr/local/bin/go
