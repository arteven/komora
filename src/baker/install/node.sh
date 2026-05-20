#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?node version required}"
curl -fsSL https://deb.nodesource.com/setup_${VERSION%%.*}.x | bash -
apt-get install -y nodejs
