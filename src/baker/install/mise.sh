#!/usr/bin/env bash
set -euo pipefail
curl -fsSL https://mise.run | sh
# make mise available system-wide
ln -sf /root/.local/bin/mise /usr/local/bin/mise
apt-get install -y direnv
