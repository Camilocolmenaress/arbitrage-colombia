#!/bin/bash
# Stops the arbitrage-colombia service without uninstalling it.
LABEL="com.arbitrage-colombia"

launchctl stop "$LABEL"
echo "arbitrage-colombia stopped."
echo "  To start again: bash scripts/start-local.sh"
