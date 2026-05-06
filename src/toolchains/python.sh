#!/bin/bash
set -euo pipefail
VERSION="${1:?usage: python.sh <version>}"
apt-get update -qq
apt-get install -y -qq software-properties-common
add-apt-repository -y ppa:deadsnakes/ppa
apt-get update -qq
apt-get install -y -qq "python${VERSION}" "python${VERSION}-venv"
update-alternatives --install /usr/bin/python3 python3 "/usr/bin/python${VERSION}" 1
