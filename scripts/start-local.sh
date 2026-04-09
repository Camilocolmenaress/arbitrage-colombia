#!/bin/bash
# Starts the arbitrage-colombia service (must be installed first).
LABEL="com.arbitrage-colombia"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_PATH="$HOME/Library/Logs/arbitrage-colombia.log"

if [ ! -f "$PLIST_PATH" ]; then
  echo "Service not installed. Run scripts/install-launchd.sh first."
  exit 1
fi

launchctl start "$LABEL"
echo "arbitrage-colombia started."
echo "  View logs: tail -f $LOG_PATH"
