#!/usr/bin/env node
// Offline check of tv.js's "Streaming server" section (finding the Mac) against a fake network. No TV needed.
//   node tools/check-server-scan.js
const assert = require('assert');
const src = require('fs').readFileSync(`${__dirname}/../tv.js`, 'utf8');
const section = src.slice(src.indexOf('  // --- Streaming server'), src.lastIndexOf('})();'));

// macAt: the Mac's address; server: its Stremio server is running; wake: the wake-up port is installed
function run(saved, { macAt, server, wake }) {
  const store = { streamingServerUrl: saved };
  let reloads = 0;
  let serverUp = server;
  const g = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    location: { reload: () => reloads++ },
    window: { __tv: {} },
    document: { addEventListener() {}, hidden: false },
    injector: () => undefined,
    inPlayer: () => false,
    setTimeout: fn => setImmediate(fn), // no real waiting between server polls
    XMLHttpRequest: function () {
      this.open = (m, url) => { this.url = url; };
      this.send = () => setImmediate(() => {
        const host = macAt && `http://${macAt}:`;
        if (serverUp && this.url === `${host}11470/settings`) {
          this.status = 200; this.responseText = '{"values":{"serverVersion":"4.20.16"}}'; this.onload();
        } else if (wake && this.url === `${host}11469`) {
          this.status = 200; this.responseText = 'stremio-wake'; this.onload();
          serverUp = true; // the knock opens the app
        } else if (this.url.startsWith('http://192.168.15.9:')) { // some other device's web page
          this.status = 200; this.responseText = '<html>router</html>'; this.onload();
        } else this.ontimeout();
      });
    },
  };
  new Function(...Object.keys(g), section)(...Object.values(g));
  return new Promise(r => setTimeout(() => r({ url: store.streamingServerUrl, reloads }), 300));
}

(async () => {
  const MAC = 'http://192.168.15.3:11470';
  const OLD = 'http://192.168.15.5:11470';
  assert.deepStrictEqual(await run(MAC, { macAt: '192.168.15.3', server: true }), { url: MAC, reloads: 0 }, 'saved server answers');
  assert.deepStrictEqual(await run(OLD, { macAt: '192.168.15.3', server: true }), { url: MAC, reloads: 1 }, 'Mac moved');
  assert.deepStrictEqual(await run(MAC, { macAt: '192.168.15.3', wake: true }), { url: MAC, reloads: 1 }, 'app closed');
  assert.deepStrictEqual(await run(OLD, { macAt: '192.168.15.200', wake: true }), { url: 'http://192.168.15.200:11470', reloads: 1 }, 'app closed and Mac moved');
  assert.deepStrictEqual(await run(OLD, {}), { url: OLD, reloads: 0 }, 'no Mac on the network');
  assert.deepStrictEqual(await run(null, { macAt: '192.168.15.3', server: true }), { url: null, reloads: 0 }, 'no saved server');
  console.log('ok: server scan');
})();
