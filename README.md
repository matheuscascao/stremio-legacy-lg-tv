# Stremio on the LG TV

## What this is

The TV has one extra app called **Stremio**, in the app list next to Netflix.

It is Stremio's own older web version (v4), converted so this TV can run it. It is not
a new Stremio: account, add-ons, library and Continue Watching are the real ones, synced
with phone/PC. It's unofficial (Stremio doesn't support it) and was installed through
LG Developer Mode. Everything needed to rebuild or reinstall it is in this folder. The public GitHub copy leaves out
Stremio's own code (`vendor/shell-v4.4/`) and the built `.ipk`: `./build.sh --refresh`
downloads it from app.strem.io.

Why not the official app: the TV is a **2017 LG 55UJ6545** running *webOS TV Lite 3.9.3*
with a **Chromium 38** (2014) browser engine. Current Stremio needs a much newer engine,
and LG doesn't upgrade the OS on this model.

## Daily use

1. **For torrents:** the Mac must be **awake and logged in** (lid open, or "Prevent automatic sleeping
   on power adapter when the display is off"). The Stremio app on the Mac doesn't need to be open:
   the TV opens it (below).
2. Open **Stremio** on the TV.

### Remote

| Where | Keys |
|---|---|
| Anywhere | arrows move, **OK** selects, **Back** closes/goes back (Home: exits the app) |
| Pages | **Up** from content: search box, account button. **Left**: side menu |
| Dropdowns (season, filters, settings) | **OK** opens a list, arrows + **OK** pick, **Back** cancels |
| Player, controls hidden | **OK** pause/resume, **Left/Right** seek 20 s, **Up/Down** show controls |
| Player, controls shown | arrows move between buttons, **OK** on subtitles/speed/settings opens its menu, **Back** closes menu, then hides controls, then leaves the player |
| Player error box ("Network request failed"…) | **OK** or **Back** closes it and leaves the player |
| Player, right-edge arrow (‹) | episode list / info sidebar; **Back** closes it |

Converted streams (most MKV/HEVC files) take **~30–40 s to start**.

## How torrents play: the Mac is the streaming server

```
Internet (other torrent users)
        │  BitTorrent
        ▼
Mac: Stremio app ──► built-in streaming server on port 11470 (converts formats the TV can't play)
        │  plain web video (HTTP/HLS) over home Wi-Fi
        ▼
TV: Stremio app ──► plays http://192.168.15.3:11470/<torrent>/<file>
```

The TV's "streaming server URL" setting points at the Mac (`http://192.168.15.3:11470`).
If the Mac is asleep (or the TV can't find it), playback fails with **"streaming server might be
offline"**. A closed Mac app or a changed Mac IP fix themselves (next sections). Debrid streams skip
the Mac entirely.

### Stremio app closed on the Mac

When Stremio opens on the TV (or you come back to it from Home) and the Mac's server doesn't answer,
the TV knocks on port **11469** of the Mac. macOS (launchd) is listening there and opens the Stremio
app in the background; the TV waits for its server, then reloads once (~20–40 s in all). Nothing
runs on the Mac until a knock arrives. Set up by `stremio-wake.plist`; after reinstalling macOS or
moving to a new Mac:

```bash
cp stremio-wake.plist ~/Library/LaunchAgents/com.matheuscascao.stremio-wake.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.matheuscascao.stremio-wake.plist
curl http://localhost:11469   # prints "stremio-wake" and opens Stremio
# remove: launchctl bootout gui/$(id -u)/com.matheuscascao.stremio-wake && rm ~/Library/LaunchAgents/com.matheuscascao.stremio-wake.plist
```

## When the Mac's IP can change

The router (Vivo, `192.168.15.1`) lends the Mac its address for 4 hours at a time and
renews it while connected. It changes when:

- **macOS rotates its private Wi-Fi address** (network set to *Rotating*, ~every 2 weeks)
- the Mac is **off/away for a long time** and another device takes `.3`
- the **router restarts or is reset**
- the Mac connects **another way** (Ethernet, dock) or to another network

**Fix after a change: automatic.** When Stremio opens on the TV (or you come back to it from
Home) and the saved Mac address doesn't answer, the TV searches `192.168.15.1`–`.254` for the
Mac (its server, or the wake-up port above), saves the new address and reloads once (search: up to
~12 s).
Manual fallback: TV on, Stremio open on it, then here: `node tvctl.js server`

**Prevent it** (reservation in the router, not a manual IP on the Mac):

1. Mac: System Settings → Wi-Fi → **Details…** → **Private Wi-Fi address: Fixed** (not *Off*:
   that exposes the real hardware ID everywhere).
2. Router: `http://192.168.15.1` (user `admin`) → DHCP → **Criar Reserva no DHCP**:
   - Mac: `192.168.15.3` for its "Wi-Fi address" (shown in the Details window from step 1)
   - TV: `192.168.15.7` for the TV's address (in the router's list of connected devices)

Why not a manual IP on the Mac: it's a MacBook and the setting can follow it to other Wi-Fi
networks (connected, no internet); and the router could hand `.3` to another device while
the Mac is away. A router factory reset loses the reservation.

## Picking streams the TV can play

The 2017 hardware decides what plays:

- ✅ 1080p, or 4K **HDR10**, with **AAC / AC3 / EAC3** audio
- ❌ **DV** (Dolby Vision): wrong colors or won't play
- ❌ **TrueHD / DTS / Atmos-TrueHD** audio: no sound

Torrentio lists every 4K (mostly DV) stream before 1080p (Interstellar: 44 of them). To get
TV-friendly streams first, from the Mac browser open `torrentio.strem.fun/configure`, exclude
**4k / DV / HDR** qualities, and reinstall Torrentio; it syncs to the TV.

## Debrid (optional, removes the Mac)

Real-Debrid, TorBox, AllDebrid or Premiumize: streams play straight on the TV (tested: the TV
reaches all four over HTTPS). Setup from the Mac browser: `torrentio.strem.fun/configure` →
add the debrid key → install. It syncs to the TV.

## If the app disappears from the TV

LG removes Developer Mode apps when the dev session expires (1000 h ≈ 41 days). The Mac
renews it weekly (below), but if it's gone anyway, with the TV on:

```bash
./restore-tv.sh   # installs the app, restores the login (saved by `node tvctl.js save-login`) and the Mac server
```

### Developer Mode was reset

If the TV's Developer Mode app shows it's off / expired, `restore-tv.sh` can't connect. Then:

1. TV: open **Developer Mode** app → log in → **Dev Mode Status ON** (TV restarts) → **Key Server ON**.
2. Mac: `ares-novacom --device tv --getkey` and type the passphrase shown on the TV.
3. Mac: `ares-novacom -d tv --run 'cat /var/luna/preferences/devmode_enabled' > ~/.config/lg-devmode-token`
4. Mac: `./restore-tv.sh`

## Keeping the app installed

- `renew-devmode.sh` resets the dev session to 1000 h (talks to LG's server only; the TV can
  be off). A crontab job runs it **every Monday 12:00** (skipped if the Mac is asleep then;
  the next week catches up). Log: `~/Library/Logs/lg-devmode-renew.log`. Remove: `crontab -e`.
- Secrets live outside this folder: `~/.config/lg-devmode-token` (dev session) and
  `~/.config/stremio-tv-session.json` (TV login), both readable only by your Mac user.

## Rebuilding the app

```bash
npm install                 # once
./build.sh                  # from the saved copy in vendor/; --refresh re-downloads Stremio's (needed on a fresh clone)
ares-install -d tv com.matheus.stremio_1.0.0_all.ipk
```

| File | What it does |
|---|---|
| `vendor/shell-v4.4/` | Saved copy of Stremio's v4 web UI (`app.strem.io/shell-v4.4`): HTML, JS, CSS, images, fonts |
| `build.sh` | Transpiles JS to ES5 (Babel → Chrome 38), adds polyfills, patches, bundles assets, packages the `.ipk` |
| `patch.js` | JS fixes (hls.js worker, audio tracks), HTML (focusable menus/player, grid→filter navigation), CSS (variables, grid, gap, prefixes, hover → focus) |
| `tv.js` | Runtime remote support: page focus, dropdown lists, player controls/menus, Back key, top bar/side menu; finds the Mac's server again after its IP changes |
| `tv.css` | Focus rings, dropdown list, player menu sizes, calendar |
| `app/` | TV app manifest (Back key handled by the app) and icon |
| `com.matheus.stremio_1.0.0_all.ipk` | The built app, ready to install |
| `stremio-wake.plist` | Mac: lets the TV open the Stremio app when it's closed |
| `restore-tv.sh` | One-shot reinstall + login + server |
| `tvctl.js` | `server` / `save-login` / `restore-login` |
| `renew-devmode.sh` | Extends the Developer Mode session |
| `tools/drive.js` | Remote-control simulator for testing (below) |
| `tools/check-server-scan.js` | Offline test of the TV's Mac search (`node tools/check-server-scan.js`) |

## Debugging

The app is inspectable while Developer Mode is on: `http://192.168.15.7:9998/json` lists the
page; any Chrome DevTools-protocol client can attach. `tools/drive.js` drives it like a remote
and prints what's focused after each key:

```bash
node tools/drive.js down right enter 'expect:English' shot:menu log
#   up|down|left|right|enter|back[*N]  key presses     expect:REGEX  abort unless focus text matches
#   route:REGEX  abort unless the route matches        wait:MS  waitfor:JS  go:#/route  eval:JS
#   shot:name    screenshot into shots/                log  console errors since start
```

Careful: OK presses act on the real account (Add to Library, Install, playback progress).
`window.__tv` exposes `focusContent`, `nothingFocused`, `onRoute` for poking at focus logic.

## TV facts

| | |
|---|---|
| Model | LG 55UJ6545-SE (2017), firmware 06.10.55 |
| OS / engine | webOS TV Lite 3.9.3, Chromium 38, 32-bit ARM |
| Free app space | ~86 MB (app uses ~8 MB) |
| TV IP / SSH | `192.168.15.7`, port 9922, user `prisoner`, ares device name `tv` |
| Mac IP | `192.168.15.3` (streaming server port 11470) |
