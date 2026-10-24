// Patches Stremio's v4 web UI (index.html + blob.css) for webOS TV Lite's Chromium 38.
// Usage: node patch.js <upstream dir> <out dir>
const fs = require('fs');
const path = require('path');
const postcss = require('postcss');
const autoprefixer = require('autoprefixer');

const [up, out] = process.argv.slice(2);

// blob.js (already transpiled to ES5 by build.sh)
let js = fs.readFileSync(path.join(out, 'blob.js'), 'utf8');
const swapJs = (re, to) => {
  if (!re.test(js)) throw new Error(`blob.js: no match for ${re}`);
  js = js.replace(re, to);
};
// hls.js builds its worker from stringified bundle modules, which can't see Babel's top-level helpers (_typeof...)
swapJs(/enableWorker:!0/g, 'enableWorker:!1'); // hls.js default + the player's own config
// for-in over webOS's AudioTrackList also hits non-track props (onchange...) and threw on every digest
swapJs(/for\(i in (\w+)\.audioTracks\)if\(\1\.audioTracks\[i\]\.enabled\)return i;/,
  (m, p) => `for(var i=0;${p}.audioTracks&&i<${p}.audioTracks.length;i++)if(${p}.audioTracks[i].enabled)return i;`);
fs.writeFileSync(path.join(out, 'blob.js'), js);

// index.html (images/ and fonts/ are bundled next to it by build.sh)
let html = fs.readFileSync(path.join(up, 'index.html'), 'utf8');
const swap = (re, to) => {
  if (!re.test(html)) throw new Error(`index.html: no match for ${re}`);
  html = html.replace(re, to);
};
swap(/<link[^>]*href="blob\.css[^"]*"[^>]*>/, ['blob.css', 'tv.css'].map(f => `<link rel="stylesheet" href="${f}">`).join(''));
swap(/<script src="blob\.js[^"]*"><\/script>/, ['polyfill.js', 'blob.js', 'tv.js'].map(f => `<script src="${f}"></script>`).join(''));
// the account button and its menu entries had no tabindex, so the remote could never focus them
swap(/class="user-menu"/, 'tabindex="-1" class="user-menu"');
const a = html.indexOf('<div id="user-panel"');
const b = html.indexOf('<div id="navbar"');
html = html.slice(0, a) + html.slice(a, b).replace(/class="option( link)?"/g, 'tabindex="-1" $&') + html.slice(b);
// grids only reached their filter row when a column happened to line up with a filter; route Up to it
for (const [grid, filters] of [['discover-items', 'discover-filters'], ['library-port', 'libraryFilters'], ['addons-list', 'addon-filters']]) {
  swap(new RegExp(`spatial-nav-section="\\{ id: '${grid}'`), `$&, leaveFor: { up: '@${filters}' }`);
}
// the control row hid while buffering (every seek with converted streams), leaving the remote nothing to focus
swap(/(id="controlbar-top") ng-show="seeking \|\| !buffering"/, '$1');
// player controls and their hover menus had no tabindex either; volume (TV remote has it), cast and stats stay mouse-only
const p0 = html.indexOf('id="playerTpl"');
const p1 = html.indexOf('</script>', p0);
html = html.slice(0, p0) + html.slice(p0, p1).replace(/<(div|li|a|button)\b([^>]*)>/g, (tag, name, attrs) => {
  if (/tabindex=/.test(attrs) || /id="(volumeControl|streamingReport|castingControl)"/.test(attrs)) return tag;
  const focusable = /ng-click=/.test(attrs) || /class="control[\s"]/.test(attrs) || /id="sidebar-handle"/.test(attrs);
  return focusable ? `<${name} tabindex="-1"${attrs}>` : tag;
}) + html.slice(p1);
fs.writeFileSync(path.join(out, 'index.html'), html);

// blob.css: Chromium 38 has no CSS variables (49+), grid (57+) or flexbox gap (84+)
const chromium38 = {
  postcssPlugin: 'chromium38',
  Once(root) {
    const vars = {};
    root.walkDecls(/^--/, d => { vars[d.prop] = d.value; });
    root.walkDecls(d => {
      d.value = d.value.replace(/var\((--[\w-]+)(?:,([^)]*))?\)/g, (m, v, fb) => vars[v] ?? fb?.trim() ?? m);
    });
    root.walkRules(rule => {
      // the UI highlights on mouse hover only; give remote-focused elements the same look
      const hover = rule.selectors.filter(s => s.includes(':hover')).map(s => s.replace(/:hover/g, ':focus'));
      if (hover.length) rule.selectors = [...new Set(rule.selectors.concat(hover))];
      const get = prop => { let v; rule.walkDecls(prop, d => { v = d.value; }); return v; };
      const [rowGap, colGap = rowGap] = (get('gap') || get('grid-gap') || '').split(/\s+/).filter(Boolean);
      const children = (suffix, decls) =>
        rule.after(postcss.rule({ selectors: rule.selectors.map(s => s + suffix) }).append(...[].concat(decls)));
      if (get('display') === 'grid') {
        // ponytail: grid -> wrapping flex rows; repeat(N) gets N equal columns, auto-fill keeps item widths
        rule.walkDecls('display', d => { if (d.value === 'grid') d.value = 'flex'; });
        rule.append({ prop: 'flex-wrap', value: 'wrap' }, { prop: 'align-content', value: 'flex-start' });
        const cols = /repeat\((\d+)/.exec(get('grid-template-columns') || '');
        const decls = [
          { prop: 'flex', value: 'none', important: true },
          { prop: 'margin', value: `0 ${colGap || 0} ${rowGap || 0} 0`, important: true },
        ];
        if (cols) decls.push({ prop: 'width', value: `calc(100% / ${cols[1]} - ${colGap || '0px'})`, important: true });
        children(' > *', decls);
      } else if (rowGap && /flex/.test(get('display') || '')) {
        const column = /column/.test(get('flex-direction') || '');
        children(' > * + *', { prop: column ? 'margin-top' : 'margin-left', value: column ? rowGap : colGap });
      }
    });
  },
};
const css = fs.readFileSync(path.join(up, 'blob.css'), 'utf8');
const result = postcss([chromium38, autoprefixer({ overrideBrowserslist: ['chrome 38'] })]).process(css, { from: undefined });
fs.writeFileSync(path.join(out, 'blob.css'), result.css);
