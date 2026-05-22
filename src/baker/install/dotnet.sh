#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?dotnet version required}"
# Add Microsoft package feed for Debian 12 (bookworm)
curl -fsSL https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb -o /tmp/packages-microsoft-prod.deb
dpkg -i /tmp/packages-microsoft-prod.deb
rm /tmp/packages-microsoft-prod.deb
apt-get update
apt-get install -y "dotnet-sdk-${VERSION}"
