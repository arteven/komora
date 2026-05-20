#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?rust version required}"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "$VERSION"
