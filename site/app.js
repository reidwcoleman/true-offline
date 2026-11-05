(() => {
  'use strict';
  const P = window.TO_PRODUCTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const money = n => '$' + n.toFixed(2);
  const src = (p, side, colour, small) =>
    `img/${p.img}${colour ? '-' + colour : ''}-${side}${small ? '-s' : ''}.webp`;
  const firstColour = p => (p.colours ? p.colours[0].key : '');

  /* A garment "turning": cross-dissolve the two views while the width dips, so it reads as a
     rotation without ever showing a paper-thin edge. t: 0 = front, 1 = back. */
  function setTurn(front, back, t) {
    const dip = 1 - 0.2 * Math.sin(Math.PI * t);
    const fade = clamp((t - 0.42) / 0.16);
    front.style.opacity = 1 - fade;
    back.style.opacity = fade;
    front.style.transform = `scaleX(${dip})`;
    back.style.transform = `scaleX(${dip})`;
  }

  /* ---------- night sky ---------- */
  function sky() {
    const c = $('.sky'), g = c.getContext('2d');
    const star = new Path2D('M135 0 137 74 332 60 147 114 150 195 87 147 17 199 57 127 0 82 90 78Z');
    let W, H, D, stars = [], meteor = null, next = 1400, last = 0, live = true;
    const size = () => {
      D = Math.min(devicePixelRatio || 1, 2);
      W = c.clientWidth; H = c.clientHeight;
      c.width = W * D; c.height = H * D;
      const n = Math.round(W * H / 9000);
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * W, y: Math.random() * H * .8,
        r: Math.random() < .08 ? 1.3 : .7, a: .2 + Math.random() * .55,
        s: Math.random() * 6.28, v: .3 + Math.random() * .9,
      }));
    };
    const draw = now => {
      if (!live) return;
      const dt = Math.min(50, now - last); last = now;
      g.setTransform(D, 0, 0, D, 0, 0);
      g.clearRect(0, 0, W, H);
      g.fillStyle = '#F6F6F2';
      for (const s of stars) {
        g.globalAlpha = calm ? s.a : s.a * (.65 + .35 * Math.sin(s.s + now * .001 * s.v));
        g.fillRect(s.x, s.y, s.r, s.r);
      }
      g.globalAlpha = 1;
      if (!calm) {
        next -= dt;
        if (next <= 0 && !meteor) {
          meteor = { x: W * (.75 + Math.random() * .35), y: H * (.04 + Math.random() * .22), t: 0 };
          next = 6000 + Math.random() * 6000;
        }
        if (meteor) {
          meteor.t += dt;
          const k = meteor.t / 1500, e = 1 - Math.pow(1 - clamp(k), 2.4);
          const x = meteor.x - e * W * .85, y = meteor.y + e * W * .85 * .09;
          const len = Math.min(W * .3, 420) * Math.sin(Math.PI * clamp(k)) + 40;
          const ang = Math.atan(.09), tx = x + Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
          const al = Math.sin(Math.PI * clamp(k));
          const gr = g.createLinearGradient(x, y, tx, ty);
          gr.addColorStop(0, `rgba(246,246,242,${.9 * al})`);
          gr.addColorStop(.25, `rgba(10,53,240,${.7 * al})`);
          gr.addColorStop(1, 'rgba(10,53,240,0)');
          g.strokeStyle = gr; g.lineWidth = 2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke();
          g.save(); g.translate(x - 9, y - 8); g.scale(.075, .075); g.globalAlpha = al; g.fill(star); g.restore();
          if (k >= 1) meteor = null;
        }
      }
      requestAnimationFrame(draw);
    };
    size();
    addEventListener('resize', size);
    new IntersectionObserver(([e]) => {
      const was = live; live = e.isIntersecting;
      if (live && !was) { last = performance.now(); requestAnimationFrame(draw); }
    }).observe(c);
    requestAnimationFrame(t => { last = t; draw(t); });
  }

  /* ---------- hero parallax ---------- */
  function heroMotion() {
    if (calm) return;
    const piece = $('.hero-piece');
    let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
    const paint = () => {
      px += (tx - px) * .08; py += (ty - py) * .08;
      const s = scrollY;
      piece.style.transform = `translate3d(${px}px,${py - s * .12}px,0)`;
      raf = Math.abs(tx - px) + Math.abs(ty - py) > .1 ? requestAnimationFrame(paint) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    piece.addEventListener('animationend', () => { piece.style.animation = 'none'; kick(); }, { once: true });
    if (matchMedia('(pointer:fine)').matches) {
      addEventListener('pointermove', e => {
        tx = (e.clientX / innerWidth - .5) * -16;
        ty = (e.clientY / innerHeight - .5) * -10;
        kick();
      }, { passive: true });
    }
    addEventListener('scroll', () => { if (scrollY < innerHeight * 1.2) kick(); }, { passive: true });
  }

  /* ---------- the back is the point ---------- */
  function turnSection() {
    const picks = ['graphic-ripped-boxy-hoodie', 'deep-red-logo-zip-hoodie', '2018-wc-faded-hoodie', 'dirty-faded-flare-zip-hoodie']
      .map(s => P.find(p => p.slug === s));
    const stage = $('[data-turn-stage]'), copy = $('[data-turn-copy]'), sec = $('#turn');
    const idx = $('[data-turn-i]');
    $('[data-turn-n]').textContent = picks.length;
    const gs = picks.map(p => {
      const d = document.createElement('div');
      d.className = 'turn-g';
      d.innerHTML = `<img class="f" src="${src(p, 'front')}" alt="" loading="lazy"><img class="b" src="${src(p, 'back')}" alt="Back of the ${p.name}" loading="lazy">`;
      stage.append(d);
      return { el: d, f: $('.f', d), b: $('.b', d) };
    });
    let shown = -1;
    const show = i => {
      if (i === shown) return;
      shown = i;
      const p = picks[i];
      idx.textContent = i + 1;
      copy.innerHTML = `<p class="turn-name">${p.name}</p><p class="turn-note">${p.note}</p><a class="turn-link" href="#/${p.slug}">View, ${money(p.price)}</a>`;
    };
    const paint = () => {
      const r = sec.getBoundingClientRect();
      const span = r.height - innerHeight;
      if (r.top > innerHeight || r.bottom < 0) return;
      const pos = clamp(-r.top / span) * picks.length;
      const cur = Math.min(picks.length - 1, Math.floor(pos));
      show(cur);
      gs.forEach((g, i) => {
        const local = pos - i;               // 0..1 while this garment is on stage
        const on = local > -.12 && local < 1.12;
        g.el.style.visibility = on ? 'visible' : 'hidden';
        if (!on) return;
        const enter = i === 0 ? 1 : clamp((local + .12) / .24);
        const leave = i === picks.length - 1 ? 1 : 1 - clamp((local - .88) / .24);
        g.el.style.opacity = Math.min(enter, leave);
        const y = (1 - enter) * 60 - (1 - leave) * 60;
        g.el.style.transform = `translate3d(0,${y}px,0)`;
        setTurn(g.f, g.b, calm ? 1 : clamp((local - .14) / .46));
      });
    };
    let tick = false;
    addEventListener('scroll', () => {
      if (tick) return; tick = true;
      requestAnimationFrame(() => { tick = false; paint(); });
    }, { passive: true });
    addEventListener('resize', paint);
    paint();
    show(0);
  }

  /* ---------- shop grid ---------- */
  function shop() {
    const grid = $('[data-grid]'), chips = $('[data-chips]');
    grid.innerHTML = P.map(p => {
      const c = firstColour(p);
      return `<li class="tile" data-cat="${p.cat}"><a href="#/${p.slug}">
        <div class="tile-img">
          <img class="f" src="${src(p, 'front', c, true)}" width="640" height="800" alt="${p.name}" loading="lazy">
          <img class="b" src="${src(p, 'back', c, true)}" width="640" height="800" alt="" loading="lazy">
        </div>
        <div class="tile-meta"><span class="tile-name">${p.name}</span><span class="tile-price">${money(p.price)}</span></div>
      </a></li>`;
    }).join('');
    const cats = ['All', ...new Set(P.map(p => p.cat))];
    chips.innerHTML = cats.map((c, i) => {
      const n = c === 'All' ? P.length : P.filter(p => p.cat === c).length;
      return `<button type="button" data-c="${c}" aria-pressed="${i === 0}">${c}<sup>${n}</sup></button>`;
    }).join('');
    chips.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', chips).forEach(x => x.setAttribute('aria-pressed', x === b));
      const c = b.dataset.c;
      const apply = () => $$('.tile', grid).forEach(t => { t.hidden = c !== 'All' && t.dataset.cat !== c; });
      if (document.startViewTransition && !calm) document.startViewTransition(apply); else apply();
    });
  }

  /* ---------- product sheet ---------- */
  function sheet() {
    const el = $('[data-sheet]'), stage = $('[data-sheet-stage]');
    const f = $('[data-sf]'), b = $('[data-sb]');
    const sideBtns = $$('[data-side]');
    const buy = $('[data-s-buy]');
    let cur = null, colour = '', size = null, unit = 'inch', t = 0, anim = 0, opener = null;

    const setT = v => {
      t = clamp(v);
      setTurn(f, b, t);
      stage.setAttribute('aria-valuenow', Math.round(t * 100));
      stage.setAttribute('aria-valuetext', t > .5 ? 'Back' : 'Front');
      sideBtns.forEach((x, i) => x.setAttribute('aria-pressed', (t > .5) === (i === 1)));
    };
    const tween = to => {
      cancelAnimationFrame(anim);
      if (calm) return setT(to);
      const from = t, t0 = performance.now(), d = 420;
      const step = n => {
        const k = clamp((n - t0) / d), e = 1 - Math.pow(1 - k, 3);
        setT(from + (to - from) * e);
        if (k < 1) anim = requestAnimationFrame(step);
      };
      anim = requestAnimationFrame(step);
    };

    // drag to turn; a tap flips
    let drag = null;
    stage.addEventListener('pointerdown', e => {
      cancelAnimationFrame(anim);
      drag = { x: e.clientX, t, moved: false };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) setT(drag.t + Math.abs(dx) / (stage.clientWidth * .55) * (drag.t > .5 ? -1 : 1));
    });
    const up = () => {
      if (!drag) return;
      const moved = drag.moved, was = drag.t; drag = null;
      tween(moved ? (t > .5 ? 1 : 0) : (was > .5 ? 0 : 1));
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tween(t > .5 ? 0 : 1); }
    });
    sideBtns.forEach((x, i) => x.addEventListener('click', () => tween(i)));

    const images = () => {
      const fall = (img, side) => { img.onerror = () => { img.onerror = null; img.src = src(cur, side, colour, true); }; };
      fall(f, 'front'); fall(b, 'back');
      f.src = src(cur, 'front', colour); b.src = src(cur, 'back', colour);
      f.alt = `${cur.name}, front`; b.alt = `${cur.name}, back`;
    };

    const table = () => {
      const tb = $('[data-s-table]');
      const fmt = v => unit === 'inch' ? v.toFixed(1) : (Number.isInteger(v) ? v : v.toFixed(1));
      tb.innerHTML = `<thead><tr><th scope="col"><span class="sr">Measure</span></th>${cur.sizes.map(s => `<th scope="col" class="${s === size ? 'on' : ''}">${s}</th>`).join('')}</tr></thead>
        <tbody>${cur.rows.map(r => `<tr><th scope="row">${r.name}</th>${r[unit].map((v, i) => `<td class="${cur.sizes[i] === size ? 'on' : ''}">${fmt(v)}</td>`).join('')}</tr>`).join('')}</tbody>`;
    };

    const sizes = () => {
      const box = $('[data-s-sizes]');
      box.innerHTML = cur.sizes.map(s => `<button type="button" data-z="${s}" aria-pressed="${s === size}">${s}</button>`).join('');
    };
    $('[data-s-sizes]').addEventListener('click', e => {
      const x = e.target.closest('button'); if (!x) return;
      size = size === x.dataset.z ? null : x.dataset.z;
      sizes(); table();
    });
    $$('[data-unit]').forEach(x => x.addEventListener('click', () => {
      unit = x.dataset.unit;
      $$('[data-unit]').forEach(y => y.setAttribute('aria-pressed', y === x));
      table();
    }));
    $('[data-s-colour-pills]').addEventListener('click', e => {
      const x = e.target.closest('button'); if (!x) return;
      colour = x.dataset.k;
      $$('button', e.currentTarget).forEach(y => y.setAttribute('aria-pressed', y === x));
      images();
    });

    const buyState = () => {
      const on = navigator.onLine;
      buy.setAttribute('aria-disabled', !on);
      buy.tabIndex = on ? 0 : -1;
      if (cur) buy.innerHTML = on ? `<span>Buy on Etsy</span><span>${money(cur.price)}</span>` : '<span>Reconnect to buy</span>';
      $('[data-s-buy-note]').textContent = on
        ? "You'll pick your size on Etsy. Free shipping, about two weeks to the US."
        : 'You are offline, which is the idea. Checkout needs a signal.';
    };
    addEventListener('online', buyState); addEventListener('offline', buyState);

    function open(p) {
      if (el.hidden) opener = document.activeElement;
      cur = p; colour = firstColour(p); size = null;
      $('[data-s-cat]').textContent = p.cat;
      $('[data-s-name]').textContent = p.name;
      $('[data-s-price]').textContent = money(p.price);
      $('[data-s-note]').textContent = p.note;
      buy.href = p.etsy;
      const cBox = $('[data-s-colours]');
      cBox.hidden = !p.colours;
      if (p.colours) $('[data-s-colour-pills]').innerHTML = p.colours.map((c, i) => `<button type="button" data-k="${c.key}" aria-pressed="${i === 0}">${c.name}</button>`).join('');
      $('[data-s-spec]').innerHTML = [['Fabric', p.fabric], ['Weight', p.gsm + ' gsm'], ['Fit', p.fit], ['Finish', p.finish]]
        .map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
      const rv = $('[data-s-review]');
      rv.hidden = !p.review;
      if (p.review) rv.innerHTML = `${p.review}<cite>5 stars on Etsy</cite>`;
      images(); sizes(); table(); buyState();
      cancelAnimationFrame(anim); setT(0);
      el.hidden = false;
      document.body.classList.add('locked');
      $('.sheet-info').scrollTop = 0; el.scrollTop = 0;
      document.title = `${p.name} / True Offline`;
      $('[data-close]').focus({ preventScroll: true });
    }
    function close() {
      if (el.hidden) return;
      el.hidden = true; cur = null;
      document.body.classList.remove('locked');
      document.title = 'True Offline';
      if (opener) opener.focus({ preventScroll: true });
    }
    const go = d => {
      const i = P.indexOf(cur);
      location.hash = '/' + P[(i + d + P.length) % P.length].slug;
    };
    const dismiss = () => {
      history.pushState('', '', location.pathname + location.search);
      close();
    };
    $('[data-close]').addEventListener('click', dismiss);
    $('[data-prev]').addEventListener('click', () => go(-1));
    $('[data-next]').addEventListener('click', () => go(1));
    addEventListener('keydown', e => {
      if (el.hidden) return;
      if (e.key === 'Escape') dismiss();
      if (e.key === 'ArrowRight' && e.target.tagName !== 'INPUT') go(1);
      if (e.key === 'ArrowLeft' && e.target.tagName !== 'INPUT') go(-1);
      if (e.key === 'Tab') {
        const items = $$('a[href],button,[tabindex="0"]', el).filter(x => x.offsetParent !== null && x.tabIndex >= 0);
        const a = items[0], z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    const route = () => {
      const m = location.hash.match(/^#\/(.+)$/);
      const p = m && P.find(x => x.slug === m[1]);
      if (p) open(p); else close();
    };
    addEventListener('hashchange', route);
    route();
  }

  /* ---------- offline ---------- */
  function offline() {
    const labels = $$('[data-net-label]');
    const title = $('[data-off-title]'), sub = $('[data-off-sub]'), line = $('[data-hero-line]');
    const saved = $('[data-saved]');
    const on = {
      title: title.textContent, sub: sub.textContent, line: line.textContent,
    };
    const net = () => {
      const up = navigator.onLine;
      document.body.classList.toggle('is-offline', !up);
      labels.forEach(l => { l.textContent = up ? 'Online' : 'Offline'; });
      title.textContent = up ? on.title : 'There you go.';
      sub.textContent = up ? on.sub : 'No signal, and the whole line is still here. Checkout will need you back online. No rush.';
      line.textContent = up ? on.line : 'No signal. You are doing it right.';
    };
    addEventListener('online', net); addEventListener('offline', net); net();

    const count = async () => {
      if (!('caches' in window)) { saved.textContent = 'Not available here'; return; }
      const keys = await caches.keys();
      let n = 0;
      for (const k of keys) n += (await (await caches.open(k)).keys()).length;
      saved.textContent = n ? `${n} files` : 'Saving';
    };
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => {
        count();
        navigator.serviceWorker.addEventListener('message', count);
      }).catch(() => { saved.textContent = 'Not available here'; });
      setTimeout(count, 2500);
    } else saved.textContent = 'Not available here';
  }

  /* ---------- top bar tone ---------- */
  function barTone() {
    const bar = $('.bar'), over = new Set();
    const io = new IntersectionObserver(es => {
      es.forEach(e => (e.isIntersecting ? over.add(e.target) : over.delete(e.target)));
      bar.classList.toggle('on-paper', over.size > 0);
    }, { rootMargin: '-24px 0px -96% 0px' });
    $$('.shop,.facts').forEach(s => io.observe(s));
    // Tuck away while reading down the page, back on any scroll up.
    let y = scrollY;
    addEventListener('scroll', () => {
      const n = scrollY;
      if (Math.abs(n - y) < 6) return;
      bar.classList.toggle('tuck', n > y && n > innerHeight * .5);
      y = n;
    }, { passive: true });
    bar.addEventListener('focusin', () => bar.classList.remove('tuck'));
  }

  sky();
  barTone();
  heroMotion();
  turnSection();
  shop();
  sheet();
  offline();
})();
