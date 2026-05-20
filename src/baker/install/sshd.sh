#!/usr/bin/env bash
set -euo pipefail
USER_NAME="${1:?user required}"
PUBKEY_PATH="${2:?pubkey path required}"
apt-get install -y openssh-server
useradd -m -s /bin/bash "$USER_NAME" || true
mkdir -p "/home/$USER_NAME/.ssh"
chmod 700 "/home/$USER_NAME/.ssh"
cat "$PUBKEY_PATH" >> "/home/$USER_NAME/.ssh/authorized_keys"
chmod 600 "/home/$USER_NAME/.ssh/authorized_keys"
chown -R "$USER_NAME:$USER_NAME" "/home/$USER_NAME/.ssh"
sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
mkdir -p /run/sshd
