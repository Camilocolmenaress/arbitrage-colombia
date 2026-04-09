#!/bin/bash
# Installs arbitrage-colombia as a macOS launchd service.
# Runs on login and restarts automatically if it crashes.
set -e

LABEL="com.arbitrage-colombia"
PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_PATH="$(which node)"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
LOG_PATH="$HOME/Library/Logs/arbitrage-colombia.log"

echo "Installing arbitrage-colombia as a macOS launchd service..."
echo "  Project : $PROJECT_DIR"
echo "  Node    : $NODE_PATH"
echo "  Plist   : $PLIST_PATH"
echo "  Logs    : $LOG_PATH"

# Verify .env exists before installing
if [ ! -f "$PROJECT_DIR/.env" ]; then
  echo ""
  echo "ERROR: .env not found at $PROJECT_DIR/.env"
  echo "Copy .env.example and fill in your credentials first."
  exit 1
fi

# Create directories
mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

# Write the plist (node path and project dir are resolved now, at install time)
cat > "$PLIST_PATH" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${NODE_PATH}</string>
    <string>${PROJECT_DIR}/cron/scheduler.js</string>
  </array>

  <!-- dotenv reads .env from the working directory -->
  <key>WorkingDirectory</key>
  <string>${PROJECT_DIR}</string>

  <!-- Start on login and after crashes -->
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>

  <!-- Both stdout and stderr go to the same log file -->
  <key>StandardOutPath</key>
  <string>${LOG_PATH}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_PATH}</string>
</dict>
</plist>
PLIST

# Unload silently if already loaded, then reload
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

echo ""
echo "Service installed and started."
echo ""
echo "  View logs : tail -f $LOG_PATH"
echo "  Stop      : bash $PROJECT_DIR/scripts/stop-local.sh"
echo "  Start     : bash $PROJECT_DIR/scripts/start-local.sh"
echo "  Uninstall : bash $PROJECT_DIR/scripts/uninstall-launchd.sh"
