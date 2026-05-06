#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: dotnet.sh <version>}"
apt-get update -qq
apt-get install -y -qq wget apt-transport-https
wget -q "https://packages.microsoft.com/config/debian/12/packages-microsoft-prod.deb" -O /tmp/ms.deb
dpkg -i /tmp/ms.deb
rm /tmp/ms.deb
apt-get update -qq
apt-get install -y -qq "dotnet-sdk-${VERSION}"
