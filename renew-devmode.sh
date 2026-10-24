#!/bin/bash
# Resets the TV's Developer Mode session to 1000 h so LG doesn't wipe sideloaded apps.
# Talks to LG's server only; the TV doesn't need to be on. Token: /var/luna/preferences/devmode_enabled on the TV.
set -euo pipefail
TOKEN=$(cat ~/.config/lg-devmode-token)
echo "$(date '+%F %T') $(curl -fsS -m 30 "https://developer.lge.com/secure/ResetDevModeSession.dev?sessionToken=$TOKEN")"
