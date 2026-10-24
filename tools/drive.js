// Drives the TV app like a remote. Usage: node drive.js step...
//   up|down|left|right|enter|back[*N]  key press (traced: focused element + route after it)
//   wait:MS   go:#/route   eval:JS   shot:name (PNG into ../shots/)   log (print console since start)
const fs = require('fs');
const KEYS = { left: 37, up: 38, right: 39, down: 40, enter: 13, back: 461 };
const FOCUS = `(function(){var a=document.activeElement,r=a.getBoundingClientRect(),t=(a.getAttribute('title')||a.value||a.textContent||'').replace(/\\s+/g,' ').trim().slice(0,28);
  return location.hash.split('/').slice(0,3).join('/')+' | '+a.tagName.toLowerCase()+(a.id?'#'+a.id:'')+(a.className&&a.className.baseVal===undefined&&a.className?'.'+a.className.split(' ').filter(function(c){return c&&c.indexOf('ng-')}).slice(0,2).join('.'):'')+' "'+t+'" @'+Math.round(r.left)+','+Math.round(r.top)+(r.width?'':' (invisible)')})()`;

(async () => {
  const pages = await (await fetch('http://192.168.15.7:9998/json')).json();
  const ws = new WebSocket(pages.find(p => p.url.includes('com.matheus.stremio')).webSocketDebuggerUrl);
  let id = 0;
  const pending = {};
  const logs = [];
  const send = (method, params = {}) => new Promise(r => { pending[++id] = r; ws.send(JSON.stringify({ id, method, params })); });
  ws.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.id && pending[m.id]) return pending[m.id](m.result || m.error);
    if (m.method === 'Console.messageAdded' && /error|warn/.test(m.params.message.level)) logs.push(m.params.message.text.split('\n')[0].slice(0, 200));
  };
  await new Promise(r => (ws.onopen = r));
  await send('Console.enable');
  logs.length = 0; // drop replayed history
  const evaluate = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.result ? (r.result.value ?? r.result.description) : JSON.stringify(r); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (const step of process.argv.slice(2)) {
    const [name, n = 1] = step.split('*');
    if (KEYS[name]) {
      for (let i = 0; i < n; i++) {
        for (const type of ['rawKeyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, windowsVirtualKeyCode: KEYS[name], nativeVirtualKeyCode: KEYS[name] });
        await sleep(450);
      }
      console.log(`${step.padEnd(9)} → ${await evaluate(FOCUS)}`);
    } else if (step.startsWith('route:')) { // abort unless the hash matches (stops runaway sequences)
      const hash = await evaluate('location.hash');
      if (!new RegExp(step.slice(6)).test(hash)) { console.log(`ABORT: route is ${hash}, expected /${step.slice(6)}/`); break; }
    } else if (step.startsWith('expect:')) { // abort unless the focused element's text matches (guards OK presses)
      const text = await evaluate("document.activeElement===document.body?'<body>':(document.activeElement.textContent||'').replace(/\\s+/g,' ')");
      if (!new RegExp(step.slice(7), 'i').test(text)) { console.log(`ABORT: focus is "${String(text).slice(0, 60)}", expected /${step.slice(7)}/`); break; }
    } else if (step.startsWith('waitfor:')) { // poll a JS condition, up to 60 s
      const t0 = Date.now();
      while (!(await evaluate(`!!(${step.slice(8)})`)) && Date.now() - t0 < 60000) await sleep(500);
      console.log(`waitfor   → ${Math.round((Date.now() - t0) / 1000)}s`);
    } else if (step.startsWith('wait:')) await sleep(+step.slice(5));
    else if (step.startsWith('go:')) { await evaluate(`location.hash=${JSON.stringify(step.slice(3))}`); await sleep(3000); console.log(`go        → ${await evaluate(FOCUS)}`); }
    else if (step.startsWith('eval:')) console.log(`eval      → ${await evaluate(step.slice(5))}`);
    else if (step.startsWith('shot:')) {
      const r = await send('Page.captureScreenshot');
      fs.mkdirSync(`${__dirname}/../shots`, { recursive: true });
      fs.writeFileSync(`${__dirname}/../shots/${step.slice(5)}.png`, Buffer.from(r.data, 'base64'));
      console.log(`shot      → shots/${step.slice(5)}.png`);
    } else if (step === 'log') { console.log([...new Set(logs)].map(l => '  ! ' + l).join('\n') || '  (no errors)'); logs.length = 0; }
  }
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
