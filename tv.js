// Runtime fixes for Stremio's v4 web UI on webOS TV Lite (Chromium 38). Loaded after blob.js; must stay ES5.
// The UI was built for mouse + keyboard; this adds what a TV remote needs.
(function () {
  // KeyboardEvent.key arrived in Chrome 51; the search box's on-keydown-key="ArrowDown" needs it
  var KEYS = { 8: 'Backspace', 9: 'Tab', 13: 'Enter', 27: 'Escape', 32: ' ', 37: 'ArrowLeft', 38: 'ArrowUp', 39: 'ArrowRight', 40: 'ArrowDown', 46: 'Delete' };
  if (!('key' in KeyboardEvent.prototype)) {
    Object.defineProperty(KeyboardEvent.prototype, 'key', {
      get: function () {
        var c = this.keyCode;
        return KEYS[c] || ((c >= 48 && c <= 57) || (c >= 65 && c <= 90) ? String.fromCharCode(c).toLowerCase() : 'Unidentified');
      }
    });
  }

  var DIRS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  var ENTER = 13;
  var BACK = 461; // webOS remote; appinfo.json sets disableBackHistoryAPI so the app gets it

  function injector() { return angular.element(document.body).injector(); }
  function root() { return injector().get('$rootScope'); }
  function state() { return injector().get('$state'); }
  function apply(scope, fn) { if (scope.$$phase || scope.$root.$$phase) fn(); else scope.$apply(fn); }

  // --- Navigation sections the desktop UI never had (mouse and gamepad bumpers covered these)
  SpatialNavigation.add({
    id: 'topbar',
    selector: '#topbar .back .button, #global-search-field, #window-controls .user-menu, #user-panel [tabindex]',
    enterTo: 'last-focused',
    defaultElement: '#global-search-field'
  });
  SpatialNavigation.add({ id: 'navbar', selector: '#navbar .tab', enterTo: 'default-element', defaultElement: '#navbar .tab.selected' });
  SpatialNavigation.add({
    id: 'player-controls',
    selector: '#controlbar [tabindex]:not(input), #sidebar-handle, #player .buttons .button',
    restrict: 'self-only',
    enterTo: 'last-focused'
  });
  SpatialNavigation.add({ id: 'player-sidebar', selector: '#player .sidebar.shown [tabindex]:not(input)', restrict: 'self-only' });
  SpatialNavigation.add({ id: 'picker', selector: '#tv-picker .tv-picker-item', restrict: 'self-only' });

  // Pages open with nothing focused, and SpatialNavigation.focus() then falls back to the first section
  // registered (our top bar). Focus the page's own content section instead, filters last.
  // old pages stay in the DOM when you leave them, so focus can also be stuck on a hidden page's element
  function sectionActive(el) {
    var expr = el.getAttribute('spatial-nav-section-active');
    var scope = angular.element(el).scope(); // undefined until Angular has compiled that part of the page
    return !expr || !!(scope && scope.$eval(expr));
  }
  function nothingFocused() {
    var el = document.activeElement;
    if (!el || el === document.body) return true;
    if ($(el).closest('#topbar, #navbar, #player, #tv-picker').length) return false;
    var section = $(el).closest('[spatial-nav-section]')[0];
    return !!section && !sectionActive(section);
  }
  // the detail page's default (first episode/stream) loads after its genre links and buttons; wait for it there.
  // Elsewhere the default is the last-selected item, which may not exist yet, so the first item is fine.
  var WAIT_FOR_DEFAULT = { detail: true };
  function focusContent(waitForDefault) {
    var sections = $('[spatial-nav-section]').filter(':visible').map(function () {
      if (!sectionActive(this)) return null;
      var cfg = this.getAttribute('spatial-nav-section');
      var id = /id:\s*'([^']+)'/.exec(cfg);
      var def = /defaultElement:\s*'([^']+)'/.exec(cfg);
      return id && id[1] !== 'searchForm' ? { id: id[1], el: this, def: def && def[1] } : null;
    }).get();
    sections.sort(function (a, b) { return /filter/i.test(a.id) - /filter/i.test(b.id); });
    var active = document.activeElement;
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i];
      // the library takes the first match even when hidden (the detail page's "Get tickets" button)
      // and then falls back to the section's last-focused element; pick the first visible one ourselves
      var def = s.def && $(s.def).filter(':visible')[0];
      if (def && (def === active || SpatialNavigation.focus(def))) return true;
      if (waitForDefault && WAIT_FOR_DEFAULT[s.id]) continue;
      if ($.contains(s.el, active)) return true;
      var first = $(s.el).find('[tabindex]').filter(':visible')[0];
      if (first && SpatialNavigation.focus(first)) return true;
    }
    return false;
  }
  // the app focuses whatever exists first (a genre link, "Add to Library"), sometimes after us; move to
  // the page's default element (first episode/stream) once it renders and hold it there for ~2 s,
  // unless the user has started navigating
  function onRoute() {
    var tries = 0;
    var held = 0;
    keysSinceRoute = 0;
    (function retry() {
      if (picker || inPlayer() || keysSinceRoute) return;
      if (focusContent(true) && ++held > 6) return; // default element focused, and held
      if (++tries > 26) { // no default after ~8 s (cold start, streams that never load): anything on the page
        if (!nothingFocused() || tries > 70) return;
        focusContent(false);
      }
      setTimeout(retry, 300);
    })();
  }
  window.__tv = { focusContent: focusContent, nothingFocused: nothingFocused, onRoute: onRoute }; // for debugging over the inspector
  (function whenBootstrapped() { // jQuery's ready fires before Angular's, so wait for the injector
    if (!angular.element(document.body).injector()) return setTimeout(whenBootstrapped, 100);
    root().$on('$stateChangeSuccess', onRoute);
    onRoute(); // the first page loaded before we were listening
  })();

  // Content sections are straightOnly, so Up/Left at their edge found nothing; fall back to the bars
  document.addEventListener('sn:navigatefailed', function (e) {
    var el = $(e.target);
    if (el.closest('[spatial-nav-section*="self-only"], #player, #tv-picker').length) return; // modals, player, pickers keep focus
    if (e.detail.direction === 'up' && !el.closest('#topbar').length) SpatialNavigation.focus('topbar');
    else if (e.detail.direction === 'left' && !el.closest('#navbar').length) SpatialNavigation.focus('navbar');
  });

  // Left/Right inside the search box only moved the caret, trapping focus; leave it at the text edges
  $(document).on('keydown', '#global-search-field', function (e) {
    var input = e.target;
    var left = e.keyCode === 37 && input.selectionStart === 0;
    var right = e.keyCode === 39 && input.selectionEnd === input.value.length;
    if (!left && !right) return;
    e.preventDefault();
    if (!SpatialNavigation.move(left ? 'left' : 'right') && left) SpatialNavigation.focus('navbar');
  });

  // The account menu only closed on mouse clicks elsewhere; close it when focus leaves it
  $(document).on('focus', '*', function (e) {
    if ($(e.target).closest('#window-controls').length) return;
    var r = root();
    if (r.userMenuOpen) r.$evalAsync(function () { r.userMenuOpen = false; });
  });

  // --- Dropdowns: a native <select> traps the remote (arrows change the value), so OK opens our own list
  var picker = null;
  function openPicker(select) {
    var list = $('<div id="tv-picker"></div>');
    $.each(select.options, function (i, o) {
      $('<div tabindex="-1" class="tv-picker-item"></div>').text(o.text).attr('data-i', i)
        .toggleClass('selected', i === select.selectedIndex).appendTo(list);
    });
    picker = { select: select, returnTo: document.activeElement };
    $('body').append(list);
    SpatialNavigation.focus(list.children('.selected')[0] || list.children()[0]);
  }
  function closePicker(index) {
    var p = picker;
    picker = null;
    $('#tv-picker').remove();
    if (index !== undefined && index !== p.select.selectedIndex) {
      p.select.selectedIndex = index;
      $(p.select).trigger('change'); // ng-model listens for change
    }
    if (p.returnTo && p.returnTo !== p.select) p.returnTo.focus();
  }
  function pickerKey(dir, code) {
    if (dir) SpatialNavigation.move(dir);
    else if (code === ENTER) closePicker(+$(document.activeElement).attr('data-i'));
    else if (code === BACK) closePicker();
    return true;
  }
  // OK on a dropdown (or the custom-select wrapper around one) opens the list instead of focusing the <select>
  function selectFor(el) {
    if (el.tagName === 'SELECT') return el;
    return $(el).attr('ng-click') ? null : $(el).children('select')[0];
  }

  // --- Player: the control bar is mouse-driven (hover menus, auto-hide on mouse idle)
  function inPlayer() { return state().current.name === 'player' && $('#player').length > 0; }
  function playerScope() { return angular.element(document.getElementById('player')).scope(); }
  function closeMenus() { $('#player .control').removeClass('active'); $('#controlbar').removeClass('progress-hidden'); }
  function hideControls() {
    closeMenus();
    $('.hidable').addClass('hidden');
    if (document.activeElement) document.activeElement.blur();
  }
  // menus (subtitles, speed, audio, settings) opened on mouse hover; on the TV, OK opens one and moves into it.
  // The app's own hover code would close it again after 600 ms, so we drive the "active" class ourselves.
  function openMenu(ctrl) {
    closeMenus();
    ctrl.addClass('active');
    $('#controlbar').addClass('progress-hidden');
    var items = ctrl.find('.popup [tabindex]:not(input)').filter(':visible');
    SpatialNavigation.focus(items.filter('.selected')[0] || items[0]);
  }
  // moving off an open menu (to another control, or out of the bar) closes it
  // (e.target, not this: delegated handlers also run for focusable ancestors such as #controlbar)
  $(document).on('focus', '#player [tabindex]', function (e) {
    var open = $('#player .control.active');
    if (open.length && !$(e.target).closest(open).length) closeMenus();
  });
  function focusPlayPause(tries) { // the controls row is hidden while buffering, so retry briefly
    var el = $('#controlbar .control[ng-click*="player.paused"]').filter(':visible')[0];
    if (el) SpatialNavigation.focus(el);
    else if ((tries || 0) < 16) setTimeout(function () { focusPlayPause((tries || 0) + 1); }, 300);
  }
  // the bar auto-hides 4 s after the last "mouse move", closing a menu mid-read; keep it up while one is open
  setInterval(function () {
    if (!picker && inPlayer() && $('#player .control.active').length && $(document.activeElement).closest('#controlbar').length) {
      var sc = playerScope();
      if (sc.showHidable) sc.showHidable();
    }
  }, 2000);
  function playerKey(dir, code) {
    var el = document.activeElement;
    var sc = playerScope();
    if ($(el).closest('#player .sidebar').length) {
      if (dir) { SpatialNavigation.move(dir); return true; }
      return false; // OK: ng-click via the app's keyboard handler
    }
    var wasHidden = $('#controlbar').hasClass('hidden');
    if (sc.showHidable) sc.showHidable(); // keeps the bar up for another 4 s
    if ($(el).closest('#controlbar, #sidebar-handle, #player .buttons').length && !wasHidden) {
      if (dir) {
        if (!SpatialNavigation.move(dir) && dir === 'up' && !$('#player .control.active').length) hideControls();
        return true;
      }
      if (code === ENTER && el.id === 'sidebar-handle') {
        $(el).trigger('click');
        setTimeout(function () { SpatialNavigation.focus('player-sidebar'); }, 300);
        return true;
      }
      var ctrl = $(el).closest('.control');
      if (code === ENTER && el === ctrl[0] && ctrl.find('.popup').length) { openMenu(ctrl); return true; }
      return false; // OK on play/pause, a menu item...: ng-click via the app's keyboard handler
    }
    // controls hidden: Up/Down bring them up, OK pauses (landing on play/pause so OK again resumes),
    // Left/Right fall through to the app's seek
    if (dir === 'up' || dir === 'down') { focusPlayPause(); return true; }
    if (code === ENTER) {
      apply(sc, function () { sc.player.paused = !sc.player.paused; });
      setTimeout(focusPlayPause, 0); // after the digest swaps the play/pause buttons
      return true;
    }
    return false;
  }

  // --- Back: close the innermost thing; tabs go Home; Home exits like other webOS apps
  function back() {
    var r = root();
    if (inPlayer()) {
      var active = $('#player .control.active');
      if ($('#player .sidebar.shown').length) { $('#player .sidebar').removeClass('shown'); hideControls(); }
      else if (active.length) { closeMenus(); active.focus(); }
      else if (!$('#controlbar').hasClass('hidden')) hideControls(); // bar up (e.g. after pausing): hide it first
      else { var ps = playerScope(); apply(ps, function () { ps.playerGoBack(); }); }
      return;
    }
    if (r.userMenuOpen || r.searchOpened || $(document.activeElement).closest('#topbar').length) {
      apply(r, function () { r.userMenuOpen = false; r.searchOpened = false; });
      document.activeElement.blur();
      focusContent(false); // back down to the page
      return;
    }
    var name = state().current.name;
    var isTab = r.tabs && r.tabs.some(function (t) { return name.indexOf(t.route) === 0; });
    if (name === 'board') { if (window.PalmSystem) window.PalmSystem.platformBack(); return; }
    if (isTab) { state().go('board'); return; }
    var before = location.hash;
    apply(r, function () { r.goBack(); }); // history.back()
    setTimeout(function () { if (location.hash === before) state().go('board'); }, 500); // nothing to go back to
  }

  // One capture-phase handler runs before the app's keyboard, shortcut and spatial-nav listeners
  var keysSinceRoute = 0;
  window.addEventListener('keydown', function (e) {
    var dir = DIRS[e.keyCode];
    var code = e.keyCode;
    var handled = false;
    keysSinceRoute++;
    if (picker) handled = pickerKey(dir, code);
    else if (code === BACK) { back(); handled = true; }
    else if (code === ENTER && selectFor(document.activeElement)) { openPicker(selectFor(document.activeElement)); handled = true; }
    else if (inPlayer()) handled = playerKey(dir, code);
    else if (dir && nothingFocused()) handled = focusContent();
    if (handled) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);

  // --- Streaming server: the saved one is the Mac's IP, which changes now and then (DHCP, Wi-Fi address),
  // and the Stremio app on the Mac may be closed. When the saved server doesn't answer, find the Mac on the
  // same network: its server answers on 11470, or its wake-up port 11469 (stremio-wake.plist) does and opens
  // the app. Then wait for the server, save it and reload.
  // ponytail: assumes a /24 home network around the saved IP; the TV's own IP (luna connectionmanager) would cover others
  function get(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url);
    xhr.timeout = 1500;
    xhr.onload = function () { cb(xhr.status === 200 ? xhr.responseText : ''); };
    xhr.onerror = xhr.ontimeout = function () { cb(''); };
    xhr.send();
  }
  function isServer(url, cb) { get(url + '/settings', function (body) { cb(body.indexOf('"serverVersion"') > -1); }); }
  function isMac(host, cb) {
    var left = 2;
    var done = false;
    function answer(yes) { if (!done && (yes || !--left)) { done = true; cb(yes); } }
    isServer('http://' + host + ':11470', answer);
    get('http://' + host + ':11469', function (body) { answer(body === 'stremio-wake'); });
  }
  function findMac(hosts, cb) {
    var found = false;
    (function batch() { // 32 hosts at a time: addresses with no device hold a connection until the timeout
      if (!hosts.length) return cb(null);
      var group = hosts.splice(0, 32);
      var left = group.length;
      group.forEach(function (host) {
        isMac(host, function (yes) {
          if (yes && !found) { found = true; cb(host); }
          if (!--left && !found) batch();
        });
      });
    })();
  }
  function reloadWhenIdle() { // the app reads the server URL at startup; don't cut off a video playing meanwhile
    if (injector() && inPlayer()) return setTimeout(reloadWhenIdle, 2000);
    location.reload();
  }
  function useMac(host) {
    var url = 'http://' + host + ':11470';
    var tries = 0;
    (function wait() { // a freshly opened Stremio app takes a few seconds to start its server
      isServer(url, function (yes) {
        if (yes) {
          localStorage.setItem('streamingServerOverride', 'true');
          localStorage.setItem('streamingServerUrl', url);
          reloadWhenIdle();
        } else if (++tries < 30) setTimeout(wait, 2000);
        else scanning = false;
      });
    })();
  }
  var scanning = false;
  function checkServer() {
    var lan = /^http:\/\/((\d+\.\d+\.\d+)\.\d+):11470\/?$/.exec(localStorage.getItem('streamingServerUrl') || '');
    if (scanning || !lan) return;
    scanning = true;
    isServer('http://' + lan[1] + ':11470', function (yes) {
      if (yes) { scanning = false; return; }
      var hosts = [lan[1]]; // the saved address first: usually the Mac is still there, with the app closed
      for (var i = 1; i <= 254; i++) if (lan[2] + '.' + i !== lan[1]) hosts.push(lan[2] + '.' + i);
      findMac(hosts, function (host) { if (host) useMac(host); else scanning = false; });
    });
  }
  window.__tv.checkServer = checkServer;
  checkServer();
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkServer(); }); // back from Home
})();
