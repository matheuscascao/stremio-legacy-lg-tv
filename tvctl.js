#!/usr/bin/env node
// Talks to the Stremio app on the TV over its inspector (Developer Mode). The app must be open on the TV.
//   node tvctl.js server          point the TV at this Mac's streaming server (after the Mac's IP changes)
//   node tvctl.js save-login      save the TV's Stremio login to ~/.config/stremio-tv-session.json
//   node tvctl.js restore-login   put that login back (after a reinstall) and reload the app
// TV IP override: TV_IP=192.168.15.x
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

const TV = process.env.TV_IP || '192.168.15.7';
const SESSION = `${os.homedir()}/.config/stremio-tv-session.json`;

async function evaluate(expression) {
  const pages = await (await fetch(`http://${TV}:9998/json`)).json();
  const page = pages.find(p => p.url.includes('com.matheus.stremio'));
  if (!page) throw new Error('the Stremio app is not open on the TV');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  return new Promise(resolve => {
    ws.onmessage = ({ data }) => {
      const m = JSON.parse(data);
      if (m.id !== 1) return;
      resolve(m.result.result.value);
      ws.close();
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
  });
}

const commands = {
  async server() {
    const url = JSON.stringify(`http://${execSync('ipconfig getifaddr en0').toString().trim()}:11470`);
    return evaluate(`localStorage.getItem("streamingServerUrl") === ${url} ? "already " + ${url} :
      (localStorage.setItem("streamingServerOverride", "true"), localStorage.setItem("streamingServerUrl", ${url}),
       setTimeout(function () { location.reload(); }, 100), "set to " + ${url})`);
  },
  async 'save-login'() {
    const session = await evaluate('JSON.stringify({ authKey: localStorage.getItem("authKey"), user: localStorage.getItem("user") })');
    if (JSON.parse(session).authKey === 'null') throw new Error('the TV app is not logged in');
    fs.writeFileSync(SESSION, session, { mode: 0o600 });
    return `saved to ${SESSION}`;
  },
  async 'restore-login'() {
    const session = fs.readFileSync(SESSION, 'utf8');
    return evaluate(`(function (s) {
      localStorage.setItem("authKey", s.authKey);
      localStorage.setItem("user", s.user);
      setTimeout(function () { location.reload(); }, 100);
      return "login restored";
    })(${session})`);
  },
};

const command = commands[process.argv[2]];
if (!command) {
  console.error(`usage: node tvctl.js ${Object.keys(commands).join('|')}`);
  process.exit(1);
}
command().then(console.log, e => {
  console.error(`Could not reach the Stremio app on the TV (is it on, with Stremio open?): ${e.message}`);
  process.exit(1);
});
