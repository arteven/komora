#!/usr/bin/env bash
set -euo pipefail
VERSION="${1:?python version required}"
apt-get install -y python${VERSION} python3-pip python3-venv
