#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?dotnet version required}"
apt-get install -y "dotnet-sdk-${VERSION}"
