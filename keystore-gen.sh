#!/bin/bash
# Run this ONCE after Android Studio / JDK is installed.
# Generates your release signing keystore. Keep tank-royale-release.keystore PRIVATE — never commit it.

set -e

KEYSTORE="tank-royale-release.keystore"
ALIAS="tank-royale"

echo "Generating release keystore..."
keytool -genkey -v \
  -keystore "$KEYSTORE" \
  -alias "$ALIAS" \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=Tank Royale, OU=Games, O=Michael Woo, L=, S=, C=US"

echo ""
echo "Done: $KEYSTORE"
echo ""
echo "Next — encode for GitHub Actions CI:"
echo "  base64 -w 0 $KEYSTORE"
echo ""
echo "Add these GitHub repo secrets (Settings > Secrets > Actions):"
echo "  KEYSTORE_BASE64  = output of base64 command above"
echo "  KEYSTORE_PASSWORD = password you set above"
echo "  KEY_ALIAS        = $ALIAS"
echo "  KEY_PASSWORD     = key password you set above"
