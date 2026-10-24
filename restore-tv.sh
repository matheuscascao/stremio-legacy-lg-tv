#!/bin/bash
# Puts Stremio back on the TV after LG removed it: install, open, restore the login and the Mac streaming server.
# Needs Developer Mode on (if it was reset, see README "Developer Mode was reset").
set -euo pipefail
cd "$(dirname "$0")"
ares-install -d tv com.matheus.stremio_1.0.0_all.ipk
ares-launch -d tv com.matheus.stremio
sleep 15 # app start
node tvctl.js restore-login
sleep 15 # reload + add-on sync
node tvctl.js server
