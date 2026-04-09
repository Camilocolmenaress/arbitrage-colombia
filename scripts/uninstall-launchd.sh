#!/bin/bash
# Stops and removes the arbitrage-colombia launchd service.
set -e

LABEL="com.arbitrage-colombia"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

echo "Uninstalling arbitrage-colombia launchd service..."

if [ -f "$PLIST_PATH" ]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm "$PLIST_PATH"
  echo "Service unloaded and plist removed."
else
  echo "No plist found at $PLIST_PATH — nothing to remove."
fi
