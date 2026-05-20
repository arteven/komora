#!/usr/bin/env bash
set -euo pipefail
curl -fsSL https://mise.run | sh
apt-get install -y direnv
