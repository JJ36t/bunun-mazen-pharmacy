#!/usr/bin/env bash
# Generate Tauri updater signing keypair
# P0 fix: replaces the placeholder "UPDATER_PUBKEY_MUST_BE_SET_BEFORE_RELEASE" with a real key.
#
# Usage:
#   bash scripts/generate_updater_key.sh
#
# This script:
#   1. Generates an Ed25519 keypair using @tauri-apps/cli
#   2. Saves the private key to ~/.tauri/pharmacy-updater.key (chmod 600)
#   3. Prints the public key with instructions to update tauri.conf.json
#   4. Optionally patches tauri.conf.json automatically if --yes is passed

set -e

KEY_PATH="${TAURI_PRIVATE_KEY_PATH:-$HOME/.tauri/pharmacy-updater.key}"
AUTO_PATCH="${1:-}"

if [ -f "$KEY_PATH" ]; then
    echo "[INFO] Key already exists at: $KEY_PATH"
    echo "[INFO] To re-generate, delete it first: rm $KEY_PATH"
    exit 0
fi

mkdir -p "$(dirname "$KEY_PATH")"
chmod 700 "$(dirname "$KEY_PATH")"

echo "[INFO] Generating Tauri updater signing keypair..."
echo "[INFO] Key path: $KEY_PATH"
echo "[INFO] Password (empty for no password): "
# Generate the keypair (no password prompt by passing -w "")
npm run tauri signer generate -- -w "$KEY_PATH" "" 2>&1 | tee /tmp/tauri_signer_output.log

# Extract the public key from the output
PUBKEY=$(grep -oE 'PUBKEY_[A-Za-z0-9+/=]+' /tmp/tauri_signer_output.log | head -1)

if [ -z "$PUBKEY" ]; then
    echo "[ERROR] Could not extract pubkey from signer output."
    echo "[ERROR] Manual extraction required. Output saved to /tmp/tauri_signer_output.log"
    exit 1
fi

echo ""
echo "========================================"
echo "[SUCCESS] Tauri updater keypair generated"
echo "========================================"
echo "Private key: $KEY_PATH (KEEP SECRET — never commit)"
echo "Public key:  $PUBKEY"
echo "========================================"

# Set secure permissions on the private key
chmod 600 "$KEY_PATH"

if [ "$AUTO_PATCH" = "--yes" ]; then
    echo "[INFO] Patching tauri.conf.json with public key..."
    CONF="src-tauri/tauri.conf.json"
    # Use python for safe JSON manipulation
    python3 -c "
import json, sys
with open('$CONF', 'r') as f:
    conf = json.load(f)
conf['plugins']['updater']['pubkey'] = '$PUBKEY'
# Remove the placeholder notice
conf['plugins']['updater'].pop('_pubkey_notice', None)
with open('$CONF', 'w') as f:
    json.dump(conf, f, indent=2)
print('[INFO] tauri.conf.json updated with public key')
"
else
    echo ""
    echo "NEXT STEPS:"
    echo "  1. Edit src-tauri/tauri.conf.json"
    echo "  2. Replace the value of plugins.updater.pubkey with:"
    echo "     $PUBKEY"
    echo "  3. Delete the _pubkey_notice field"
    echo "  4. For signed releases, set TAURI_SIGNING_PRIVATE_KEY=$KEY_PATH"
    echo "     before running 'npm run tauri build'"
fi
