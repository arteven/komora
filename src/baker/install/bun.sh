#!/usr/bin/env bash
set -euo pipefail
apt-get install -y unzip
curl -fsSL https://bun.sh/install | bash
# make bun available system-wide
ln -sf /root/.bun/bin/bun /usr/local/bin/bun
