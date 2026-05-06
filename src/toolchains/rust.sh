#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: rust.sh <version>}"
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain "$VERSION"
echo 'source /home/agent/.cargo/env' >> /home/agent/.bashrc
