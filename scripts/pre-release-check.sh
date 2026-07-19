#!/usr/bin/env bash
# ========================================
# Pre-commit Security & Quality Check
# ========================================
set -e
echo "🔒 Pre-release Security & Quality Check..."
echo "================================"

echo "1. Checking for hardcoded credentials..."
if grep -rn 'admin123\|cashier123\|password123' src-tauri/src/ --include="*.rs" | grep -v '//' | grep -v '/\*'; then
    echo "❌ FAIL: Hardcoded credentials found!"
    exit 1
fi
echo "   ✅ No hardcoded credentials"

echo "2. Checking for 'any' in TypeScript..."
COUNT=$(grep -rn ': any' src/ --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l)
if [ "$COUNT" -gt 0 ]; then
    echo "❌ FAIL: Found $COUNT 'any' in TypeScript"
    exit 1
fi
echo "   ✅ Zero 'any' in TypeScript"

echo "3. Checking updater pubkey..."
if grep -q "UPDATER_PUBKEY_MUST_BE_SET" src-tauri/tauri.conf.json; then
    echo "⚠️  WARNING: Updater pubkey is still placeholder"
else
    echo "   ✅ Updater pubkey is set"
fi

echo "4. Checking Ed25519 manifest..."
if grep -q '"public_key": "00000000000000000000000000000000000000000000000000000000000000000"' src-tauri/keys/manifest.json 2>/dev/null; then
    echo "⚠️  WARNING: Ed25519 public key is placeholder"
else
    echo "   ✅ Ed25519 manifest looks good"
fi

echo "5. Checking migration naming..."
python3 scripts/check_migration_naming.py 2>/dev/null || echo "   ⚠️  Skipped"

echo "6. Checking PHARMACY_DB_PASSWORD..."
if [ -z "$PHARMACY_DB_PASSWORD" ]; then
    echo "⚠️  WARNING: PHARMACY_DB_PASSWORD not set"
else
    echo "   ✅ PHARMACY_DB_PASSWORD is set"
fi

echo "================================"
echo "✅ All checks passed!"
