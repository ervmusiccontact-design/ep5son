/* Lecteur musique : la liste des morceaux est dans playlist.js */
(function () {
  var $ = function (s) { return document.querySelector(s); };
  var CONFIG = window.PLAYLIST;
  if (!CONFIG || !CONFIG.morceaux || !CONFIG.morceaux.length) {
    document.body.innerHTML = '<p style="padding:40px;font:16px sans-serif">playlist.js est introuvable ou vide. Vérifie qu’il est dans le même dossier que index.html.</p>';
    return;
  }
  var a = $('#a');
  var tracks = [], cur = -1, lines = [], lineEls = [], activeIdx = -1, repeat = false, seeking = false;

  function path(file) {
    return CONFIG.dossier + '/' + String(file).split('/').map(encodeURIComponent).join('/');
  }
  var coverUrl = path(CONFIG.pochette);

  /* ---------- Notes (enregistrées dans le navigateur du visiteur) ---------- */
  function getR(k) { try { return +localStorage.getItem('note:' + k) || 0; } catch (e) { return 0; } }
  function setR(k, v) { try { v ? localStorage.setItem('note:' + k, v) : localStorage.removeItem('note:' + k); } catch (e) {} }

  function stars(container, t, onChange) {
    container.innerHTML = '';
    var r = getR(t.key);
    for (var i = 1; i <= 5; i++) {
      (function (i) {
        var b = document.createElement('button');
        b.textContent = '★';
        b.setAttribute('aria-label', i + ' étoile' + (i > 1 ? 's' : ''));
        if (i <= r) b.className = 'on';
        b.onclick = function (e) {
          e.stopPropagation();
          setR(t.key, getR(t.key) === i ? 0 : i);
          onChange();
        };
        container.appendChild(b);
      })(i);
    }
  }
  function refreshStars() {
    if (cur >= 0) stars($('#mainStars'), tracks[cur], refreshStars);
    renderList();
  }

  /* ---------- Playlist (depuis playlist.js) ---------- */
  tracks = CONFIG.morceaux.map(function (m) {
    var mp3 = m.mp3 || '';
    return {
      key: mp3,
      title: m.titre || mp3.replace(/\.[^.]+$/, ''),
      artist: m.artiste || CONFIG.artiste || '',
      url: path(mp3),
      srtFile: m.srt || m.paroles || ''
    };
  });

  /* ---------- Paroles : SRT / VTT / LRC ---------- */
  // On repère chaque ligne d'horaire "00:00:10,269 --> 00:00:11,949" ; le texte d'une réplique
  // est tout ce qui se trouve jusqu'à l'horaire suivant (les lignes vides ne sont pas nécessaires).
  function parseSrt(txt) {
    txt = txt.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '');
    var re = /(?:(\d+):)?(\d+):(\d+)(?:[,.](\d+))?[ \t]*-->[ \t]*(?:\d+:)?\d+:\d+(?:[,.]\d+)?(?:[ \t]+[A-Za-z]+:\S+)*/g;
    var cues = [], m;
    while ((m = re.exec(txt))) cues.push({ m: m, start: m.index, end: re.lastIndex });
    var out = [];
    cues.forEach(function (c, i) {
      var last = i + 1 >= cues.length;
      var seg = txt.slice(c.end, last ? txt.length : cues[i + 1].start);
      if (!last) {
        // retire le numéro de la réplique suivante (sur sa propre ligne)
        var cut = seg.replace(/\n[ \t]*\d+[ \t]*\n?[ \t]*$/, '');
        if (cut === seg && seg.trim().indexOf('\n') < 0) {
          // fichier sur une seule ligne : numéro collé en fin de texte
          var mm = seg.match(/\s(\d+)\s*$/);
          if (mm && +mm[1] === i + 2) cut = seg.slice(0, mm.index);
        }
        seg = cut;
      }
      var t = (+c.m[1] || 0) * 3600 + +c.m[2] * 60 + +c.m[3] + (c.m[4] ? +('0.' + c.m[4]) : 0);
      var tx = seg.replace(/<[^>]+>/g, '').replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
      if (tx) out.push({ t: t, text: tx });
    });
    return out.sort(function (x, y) { return x.t - y.t; });
  }
  function parseLrc(txt) {
    var out = [];
    txt.replace(/\r\n?/g, '\n').replace(/^\uFEFF/, '').split('\n').forEach(function (row) {
      var tags = row.match(/\[\d+:\d+(?:[.,]\d+)?\]/g);
      if (!tags) return;
      var tx = row.replace(/\[[^\]]*\]/g, '').trim();
      if (!tx) return;
      tags.forEach(function (g) {
        var m = g.match(/\[(\d+):(\d+(?:[.,]\d+)?)\]/);
        out.push({ t: +m[1] * 60 + parseFloat(m[2].replace(',', '.')), text: tx });
      });
    });
    return out.sort(function (x, y) { return x.t - y.t; });
  }
  function parseLyrics(txt) { return txt.indexOf('-->') > -1 ? parseSrt(txt) : parseLrc(txt); }

  // UTF-8, UTF-16 (Bloc-notes « Unicode ») ou Windows-1252
  function decode(buf) {
    var u = new Uint8Array(buf);
    if (u[0] === 0xFF && u[1] === 0xFE) return new TextDecoder('utf-16le').decode(buf);
    if (u[0] === 0xFE && u[1] === 0xFF) return new TextDecoder('utf-16be').decode(buf);
    var s = new TextDecoder('utf-8').decode(buf);
    if (s.indexOf('\uFFFD') > -1) s = new TextDecoder('windows-1252').decode(buf);
    return s;
  }

  function fetchLyrics(t) {
    if (!t.srtFile) return Promise.reject({ none: true });
    var names = [t.srtFile, t.srtFile.normalize('NFC'), t.srtFile.normalize('NFD')]
      .filter(function (v, i, r) { return r.indexOf(v) === i; });
    var tried = [];
    function step(i) {
      if (i >= names.length) return Promise.reject({ tried: tried });
      var u = path(names[i]);
      return fetch(u).then(function (r) {
        if (!r.ok) { tried.push(u + ' → erreur ' + r.status); return step(i + 1); }
        return r.arrayBuffer().then(decode);
      }, function () { tried.push(u + ' → bloqué'); return step(i + 1); });
    }
    return step(0);
  }

  function showNoLyr(msg) {
    var n = $('#nolyr');
    n.textContent = msg;
    n.style.display = 'flex';
  }

  /* ---------- Couleurs du fond depuis la pochette ---------- */
  function palette(url) {
    var im = new Image();
    im.onload = function () {
      try {
        var c = document.createElement('canvas'); c.width = c.height = 24;
        var x = c.getContext('2d'); x.drawImage(im, 0, 0, 24, 24);
        var d = x.getImageData(0, 0, 24, 24).data, px = [];
        for (var i = 0; i < d.length; i += 4) {
          var r = d[i], g = d[i + 1], b = d[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          px.push({ r: r, g: g, b: b, s: (mx - mn) * (mx > 40 ? 1 : .2) + mx * .1 });
        }
        px.sort(function (p, q) { return q.s - p.s; });
        var pick = [px[0]];
        for (var j = 1; j < px.length && pick.length < 3; j++) {
          var p = px[j];
          var ok = pick.every(function (q) { return Math.abs(p.r - q.r) + Math.abs(p.g - q.g) + Math.abs(p.b - q.b) > 150; });
          if (ok) pick.push(p);
        }
        while (pick.length < 3) pick.push(pick[0]);
        var s = document.documentElement.style;
        pick.forEach(function (p, k) {
          s.setProperty('--c' + (k + 1), 'rgb(' + Math.round(p.r * .85) + ',' + Math.round(p.g * .85) + ',' + Math.round(p.b * .85) + ')');
        });
      } catch (e) { /* couleurs par défaut */ }
    };
    im.src = url;
  }

  /* ---------- Chargement d’un morceau ---------- */
  function load(i, play) {
    if (i < 0 || i >= tracks.length) return;
    cur = i;
    var t = tracks[i];
    a.src = t.url;
    $('#title').textContent = t.title;
    $('#artist').textContent = (t.artist || '') + (t.artist && CONFIG.album ? ' — ' : '') + (CONFIG.album || '');
    document.title = t.title + (CONFIG.album ? ' · ' + CONFIG.album : '');
    refreshStars();
    setLyrics([]);
    fetchLyrics(t).then(function (tx) {
      if (cur !== i) return;
      var ls = parseLyrics(tx);
      if (ls.length) setLyrics(ls);
      else {
        console.warn('Paroles lues mais aucune ligne reconnue :', t.srtFile, tx.slice(0, 200));
        showNoLyr('Fichier de paroles trouvé (' + t.srtFile + ') mais aucune ligne n’a pu être lue.\nFormat attendu : 00:00:01,000 --> 00:00:03,000 (SRT) ou [00:01.00] (LRC).');
      }
    }).catch(function (err) {
      if (cur !== i) return;
      console.warn('Paroles non chargées :', err);
      if (err && err.none) showNoLyr('Aucun fichier de paroles indiqué pour ce morceau dans playlist.js.');
      else if (location.protocol === 'file:') showNoLyr('Le navigateur bloque la lecture des paroles quand la page est ouverte en double-cliquant sur le fichier.\nOuvre-la depuis GitHub Pages, ou avec un serveur local : python -m http.server');
      else showNoLyr('Paroles introuvables.\n' + ((err && err.tried && err.tried[0]) || decodeURIComponent(path(t.srtFile))));
    });
    if (play) a.play().catch(function () {});
  }
  function setLyrics(ls) {
    lines = ls; lineEls = []; activeIdx = -1;
    var box = $('#lyrics');
    box.innerHTML = ''; box.scrollTop = 0;
    $('#nolyr').textContent = 'Chargement des paroles…';
    $('#nolyr').style.display = ls.length ? 'none' : 'flex';
    ls.forEach(function (l) {
      var d = document.createElement('div');
      d.className = 'l'; d.textContent = l.text;
      d.onclick = function () { a.currentTime = l.t; a.play().catch(function () {}); };
      box.appendChild(d); lineEls.push(d);
    });
    sync(true);
  }
  function sync(force) {
    if (!lines.length) return;
    var t = a.currentTime, k = -1;
    for (var i = 0; i < lines.length; i++) { if (lines[i].t <= t) k = i; else break; }
    if (k === activeIdx && !force) return;
    activeIdx = k;
    lineEls.forEach(function (el, i) {
      el.classList.toggle('cur', i === k);
      el.style.setProperty('--b', k < 0 ? '0px' : Math.min(Math.abs(i - k) * .7, 3) + 'px');
    });
    var el = lineEls[Math.max(k, 0)], box = $('#lyrics');
    if (el && k >= 0) box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, behavior: force ? 'auto' : 'smooth' });
  }

  /* ---------- Liste des morceaux ---------- */
  function renderList() {
    var L = $('#list'); L.innerHTML = '';
    tracks.forEach(function (t, i) {
      var it = document.createElement('div'); it.className = 'it' + (i === cur ? ' cur' : '');
      var n = document.createElement('div'); n.className = 'n'; n.textContent = i + 1;
      var tt = document.createElement('div'); tt.className = 't';
      tt.innerHTML = '<b></b><span></span>';
      tt.firstChild.textContent = t.title;
      tt.lastChild.textContent = t.artist;
      tt.onclick = function () { load(i, true); };
      var st = document.createElement('div'); st.className = 'stars';
      stars(st, t, refreshStars);
      it.appendChild(n); it.appendChild(tt); it.appendChild(st);
      L.appendChild(it);
    });
  }

  /* ---------- Contrôles ---------- */
  function fmt(s) { if (!isFinite(s)) s = 0; s = Math.max(0, s); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }
  function toggle() { if (cur < 0) return; a.paused ? a.play().catch(function () {}) : a.pause(); }
  function next() { if (tracks.length) load((cur + 1) % tracks.length, true); }
  function prev() {
    if (!tracks.length) return;
    if (a.currentTime > 3) a.currentTime = 0;
    else load((cur - 1 + tracks.length) % tracks.length, true);
  }
  $('#pp').onclick = toggle;
  $('#next').onclick = next;
  $('#prev').onclick = prev;
  $('#stop').onclick = function () { a.currentTime = 0; };
  $('#rep').onclick = function () { repeat = !repeat; this.classList.toggle('act', repeat); };

  a.addEventListener('play', function () {
    document.body.classList.remove('paused');
    $('#ppi').innerHTML = '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>';
  });
  a.addEventListener('pause', function () {
    document.body.classList.add('paused');
    $('#ppi').innerHTML = '<path d="M8 5v14l11-7z"/>';
  });
  a.addEventListener('ended', function () {
    if (cur < tracks.length - 1) next();
    else if (repeat) load(0, true);
  });
  a.addEventListener('timeupdate', function () {
    var d = a.duration || 0, t = a.currentTime;
    if (!seeking) {
      var p = d ? t / d * 1000 : 0;
      $('#seek').value = p;
      $('#seek').style.setProperty('--p', (p / 10) + '%');
    }
    $('#tc').textContent = fmt(t);
    $('#tr').textContent = '-' + fmt(d - t);
    sync();
  });
  setInterval(function () { if (!a.paused) sync(); }, 120);

  var sk = $('#seek');
  sk.addEventListener('input', function () {
    seeking = true;
    sk.style.setProperty('--p', (sk.value / 10) + '%');
    if (a.duration) a.currentTime = sk.value / 1000 * a.duration;
  });
  sk.addEventListener('change', function () { seeking = false; });

  var vl = $('#vl');
  function setVol() { a.volume = vl.value / 100; vl.style.setProperty('--p', vl.value + '%'); }
  vl.addEventListener('input', setVol); setVol();

  $('#plBtn').onclick = function () { $('#pl').classList.toggle('open'); };
  $('#plClose').onclick = function () { $('#pl').classList.remove('open'); };

  window.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.code === 'ArrowRight' && e.shiftKey) next();
    else if (e.code === 'ArrowLeft' && e.shiftKey) prev();
    else if (e.code === 'ArrowRight') a.currentTime += 5;
    else if (e.code === 'ArrowLeft') a.currentTime -= 5;
    else if (e.key >= '1' && e.key <= '5' && cur >= 0) {
      var n = +e.key;
      setR(tracks[cur].key, getR(tracks[cur].key) === n ? 0 : n);
      refreshStars();
    }
  });

  /* ---------- Démarrage ---------- */
  $('#cover').style.backgroundImage = 'url("' + coverUrl + '")';
  palette(coverUrl);
  renderList();
  load(0, false);
})();
