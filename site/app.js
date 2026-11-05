(() => {
  'use strict';
  const P = window.TO_PRODUCTS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(pointer:fine)').matches;
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const money = n => '$' + n.toFixed(2);
  const bySlug = s => P.find(p => p.slug === s);
  const src = (p, side, colour, small) =>
    `img/${p.img}${colour ? '-' + colour : ''}-${side}${small ? '-s' : ''}.webp`;
  const firstColour = p => (p.colours ? p.colours[0].key : '');
  const canMorph = !!document.startViewTransition && !calm;

  /* One scroll loop for everything scrubbed, so a frame only ever pays for one layout read pass. */
  const scrubs = [];
  let ticking = false;
  const runScrubs = () => { ticking = false; for (const f of scrubs) f(); };
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(runScrubs);
  }, { passive: true });
  addEventListener('resize', runScrubs);

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
    let W, H, D, stars = [], meteor = null, next = 2600, last = 0, live = true;
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

  /* ---------- hero depth ---------- */
  function heroMotion() {
    if (calm) return;
    const piece = $('.hero-piece'), wm = $('.wm');
    let px = 0, py = 0, tx = 0, ty = 0, raf = 0;
    const paint = () => {
      px += (tx - px) * .08; py += (ty - py) * .08;
      const s = scrollY;
      piece.style.transform = `translate3d(${px}px,${py - s * .14}px,0)`;
      wm.style.transform = `translate3d(${px * -.25}px,${s * .1 + py * -.25}px,0)`;
      raf = Math.abs(tx - px) + Math.abs(ty - py) > .1 ? requestAnimationFrame(paint) : 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(paint); };
    piece.addEventListener('animationend', () => { piece.style.animation = 'none'; kick(); }, { once: true });
    if (fine) {
      addEventListener('pointermove', e => {
        tx = (e.clientX / innerWidth - .5) * -18;
        ty = (e.clientY / innerHeight - .5) * -11;
        kick();
      }, { passive: true });
    }
    scrubs.push(() => { if (scrollY < innerHeight * 1.2) kick(); });
  }

  /* ---------- the back is the point ---------- */
  function turnSection() {
    const picks = [
      ['graphic-ripped-boxy-hoodie', 'Pagoda', '#D6246E'],
      ['deep-red-logo-zip-hoodie', 'Globe', '#B23A63'],
      ['2018-wc-faded-hoodie', 'Rooster', '#E2521C'],
      ['dirty-faded-flare-zip-hoodie', 'Dreamer', '#E9D3B0'],
    ].map(([s, word, tint]) => ({ p: bySlug(s), word, tint }));
    const stage = $('[data-turn-stage]'), copy = $('[data-turn-copy]'), sec = $('#turn');
    const words = $('[data-turn-words]'), ticks = $('[data-ticks]');
    ticks.innerHTML = picks.map(() => '<i><b></b></i>').join('');
    const bars = $$('b', ticks);
    const gs = picks.map(({ p, word, tint }) => {
      const d = document.createElement('div');
      d.className = 'turn-g';
      d.style.setProperty('--tint', tint);
      d.innerHTML = `<img class="f" src="${src(p, 'front')}" alt="" loading="lazy"><img class="b" src="${src(p, 'back')}" alt="Back of the ${p.name}" loading="lazy">`;
      stage.append(d);
      const w = document.createElement('span');
      w.textContent = word;
      w.style.setProperty('--tint', tint);
      words.append(w);
      return { el: d, f: $('.f', d), b: $('.b', d), w };
    });
    let shown = -1;
    const show = i => {
      if (i === shown) return;
      shown = i;
      const { p } = picks[i];
      copy.innerHTML = `<p class="turn-name">${p.name}</p><p class="turn-note">${p.note}</p><a class="turn-link ul" href="#/${p.slug}">View piece, ${money(p.price)}</a>`;
    };
    const paint = () => {
      const r = sec.getBoundingClientRect();
      if (r.top > innerHeight || r.bottom < 0) return;
      const span = r.height - innerHeight;
      const pos = clamp(-r.top / span) * picks.length;
      show(Math.min(picks.length - 1, Math.floor(pos)));
      gs.forEach((g, i) => {
        const local = pos - i;               // 0..1 while this garment is on stage
        bars[i].style.transform = `scaleX(${clamp(local)})`;
        const on = local > -.12 && local < 1.12;
        g.el.style.visibility = on ? 'visible' : 'hidden';
        g.w.style.visibility = on ? 'visible' : 'hidden';
        if (!on) return;
        const enter = i === 0 ? 1 : clamp((local + .12) / .24);
        const leave = i === picks.length - 1 ? 1 : 1 - clamp((local - .88) / .24);
        const vis = Math.min(enter, leave);
        g.el.style.opacity = vis;
        g.el.style.transform = `translate3d(0,${(1 - enter) * 60 - (1 - leave) * 60}px,0)`;
        setTurn(g.f, g.b, calm ? 1 : clamp((local - .14) / .46));
        // The word appears as the back comes round, and drifts against the garment.
        g.w.style.opacity = vis * clamp((local - .2) / .3) * .34;
        g.w.style.transform = `translate(calc(-50% + ${(.5 - local) * 9}vw),-50%)`;
      });
    };
    scrubs.push(paint);
    paint();
    show(0);
  }

  /* ---------- up close ---------- */
  function closeUp() {
    const items = [
      ['pagoda', 'graphic-ripped-boxy-hoodie', 'Pagoda'],
      ['redglobe', 'deep-red-logo-zip-hoodie', 'Quality garments'],
      ['fury', 'fury-logo-straight-sweatpants', 'Flame star'],
      ['starfish', 'starfish-fleece-faded-shorts', 'Starfish'],
      ['hibiscus', 'hibiscus-ivory-hoodie', 'Hibiscus'],
      ['japan', 'japan-jersey-sweatshirt', 'Mie Prefecture'],
    ];
    const box = $('[data-bento]');
    box.innerHTML = items.map(([img, slug, label], i) => {
      const p = bySlug(slug);
      return `<li style="--d:${(i % 3) * 70}ms"><a class="macro" href="#/${slug}" data-cursor="View" aria-label="${label}, ${p.name}">
        <img src="img/macro-${img}.webp" alt="Close-up of the ${label} print on the ${p.name}" loading="lazy">
        <span class="macro-tag">${label}<small>${money(p.price)}</small></span>
      </a></li>`;
    }).join('');
    if (calm) return;
    const imgs = $$('img', box);
    scrubs.push(() => {
      const h = innerHeight;
      for (const im of imgs) {
        const r = im.parentNode.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h) continue;
        const k = (r.top + r.height / 2 - h / 2) / h;
        im.style.transform = `translate3d(0,${(k * -6).toFixed(2)}%,0)`;
      }
    });
  }

  /* ---------- shop grid ---------- */
  // Four bands of five: one feature tile, back print first, with four smalls mixed by type.
  const ORDER = [
    ['dirty-faded-flare-zip-hoodie', 1], 'graphic-ripped-boxy-hoodie', 'fury-logo-straight-sweatpants', 'logo-wash-jorts', 'japan-jersey-sweatshirt',
    'sunfaded-hoodie', 'earth-barrel-leg-sweatpants', ['hibiscus-ivory-hoodie', 1], 'starfish-fleece-faded-shorts', 'autumn-waffle-knit',
    ['2018-wc-faded-hoodie', 1], 'blossom-baggy-zip-hoodie', 'signature-straight-sweatpants', 'fleeced-sweatshirt', 'vintage-wash-denim-shorts',
    'logo-grey-washed-box-hoodie', 'waistband-barrel-sweatpants', ['deep-red-logo-zip-hoodie', 1], 'logo-compression-shirt', 'darks-barrel-fleece-sweatpants',
  ];
  function shop() {
    const grid = $('[data-grid]'), chips = $('[data-chips]');
    grid.innerHTML = ORDER.map((o, i) => {
      const big = Array.isArray(o), p = bySlug(big ? o[0] : o), c = firstColour(p);
      const a = big ? 'back' : 'front', z = big ? 'front' : 'back';
      return `<li class="tile${big ? ' big' : ''}" data-cat="${p.cat}" data-slug="${p.slug}" style="--d:${(i % 4) * 60}ms"><a href="#/${p.slug}" data-cursor="View" data-open-side="${big ? 1 : 0}">
        <div class="tile-img">
          <img class="f" src="${src(p, a, c, !big)}" width="720" height="900" alt="${p.name}" loading="lazy">
          <img class="b" src="${src(p, z, c, !big)}" width="720" height="900" alt="" loading="lazy">
        </div>
        <div class="tile-meta"><span class="tile-name">${p.name}</span><span class="tile-price">${money(p.price)}</span></div>
      </a></li>`;
    }).join('');

    const cats = ['All', ...new Set(P.map(p => p.cat))];
    chips.innerHTML = '<i class="chip-ind"></i>' + cats.map((c, i) => {
      const n = c === 'All' ? P.length : P.filter(p => p.cat === c).length;
      return `<button type="button" data-c="${c}" aria-pressed="${i === 0}">${c}<sup>${n}</sup></button>`;
    }).join('');
    const ind = $('.chip-ind', chips);
    const place = () => {
      const b = $('[aria-pressed=true]', chips);
      ind.style.width = b.offsetWidth + 'px';
      ind.style.transform = `translate(${b.offsetLeft}px,${b.offsetTop}px)`;
    };
    place();
    addEventListener('resize', place);
    document.fonts && document.fonts.ready.then(place);

    chips.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      $$('button', chips).forEach(x => x.setAttribute('aria-pressed', x === b));
      place();
      const c = b.dataset.c;
      const tiles = $$('.tile', grid);
      const apply = () => {
        grid.classList.toggle('filtered', c !== 'All');
        tiles.forEach(t => {
          t.hidden = c !== 'All' && t.dataset.cat !== c;
          t.classList.add('in');
        });
      };
      if (!canMorph) return apply();
      // Each tile gets a name for the length of the transition, so the grid reflows instead of cutting.
      tiles.forEach((t, i) => { t.style.viewTransitionName = 'tile-' + i; });
      document.startViewTransition(apply).finished.finally(() => {
        tiles.forEach(t => { t.style.viewTransitionName = ''; });
      });
    });
  }

  /* ---------- product sheet ---------- */
  function sheet() {
    const el = $('[data-sheet]'), stage = $('[data-sheet-stage]');
    const f = $('[data-sf]'), b = $('[data-sb]');
    const sideBtns = $$('[data-side]');
    const segInd = $('[data-seg-ind]');
    const buy = $('[data-s-buy]');
    let cur = null, colour = '', size = null, unit = 'inch', t = 0, anim = 0, opener = null;
    let pending = null;                      // the tile image that was just clicked, for the morph

    const setT = v => {
      t = clamp(v);
      setTurn(f, b, t);
      stage.setAttribute('aria-valuenow', Math.round(t * 100));
      stage.setAttribute('aria-valuetext', t > .5 ? 'Back' : 'Front');
      sideBtns.forEach((x, i) => x.setAttribute('aria-pressed', (t > .5) === (i === 1)));
      segInd.style.transform = `translateX(${t > .5 ? 100 : 0}%)`;
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
      $(`[data-z="${x.dataset.z}"]`).focus({ preventScroll: true });
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

    const nextOf = d => P[(P.indexOf(cur) + d + P.length) % P.length];

    function fill(p, side) {
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
      const nx = nextOf(1);
      $('[data-next-name]').textContent = nx.name;
      $('[data-next-img]').src = src(nx, 'front', firstColour(nx), true);
      buy.innerHTML = `<span>Buy on Etsy</span><span>${money(p.price)}</span>`;
      images(); sizes(); table();
      cancelAnimationFrame(anim); setT(side);
      document.title = `${p.name} / True Offline`;
    }
    const reveal = () => {
      el.hidden = false;
      document.body.classList.add('locked');
      $('.sheet-info').scrollTop = 0; el.scrollTop = 0;
      $('[data-close]').focus({ preventScroll: true });
    };
    const decoded = img => Promise.race([img.decode().catch(() => {}), new Promise(r => setTimeout(r, 260))]);

    function open(p) {
      const side = pending ? pending.side : 0, from = pending && pending.img;
      pending = null;
      if (!el.hidden) {                       // moving between pieces
        if (!canMorph) return fill(p, 0);
        document.startViewTransition(() => { fill(p, 0); $('.sheet-info').scrollTop = 0; el.scrollTop = 0; });
        return;
      }
      opener = document.activeElement;
      fill(p, side);
      const target = side ? b : f;
      if (!canMorph || !from) return reveal();
      from.style.viewTransitionName = 'garment';
      document.startViewTransition(async () => {
        from.style.viewTransitionName = '';
        await decoded(target);
        target.style.viewTransitionName = 'garment';
        reveal();
      }).finished.finally(() => { target.style.viewTransitionName = ''; });
    }

    function hide() {
      el.hidden = true; cur = null;
      document.body.classList.remove('locked');
      document.title = 'True Offline';
      if (opener) opener.focus({ preventScroll: true });
    }
    function close() {
      if (el.hidden) return;
      const slug = cur.slug;
      const tile = $(`.tile[data-slug="${slug}"]`);
      const r = tile && !tile.hidden && tile.getBoundingClientRect();
      const inView = r && r.bottom > 0 && r.top < innerHeight;
      if (!canMorph || !inView) return hide();
      const big = tile.classList.contains('big');   // feature tiles lead with the back
      const back = t > .5;
      const shown = $(big === back ? '.f' : '.b', tile);
      const live = back ? b : f;
      live.style.viewTransitionName = 'garment';
      document.startViewTransition(() => {
        live.style.viewTransitionName = '';
        // Show the same side the sheet was on, for the length of the morph.
        const other = shown.matches('.f') ? $('.b', tile) : $('.f', tile);
        if (shown.matches('.b')) { shown.style.opacity = 1; shown.style.transform = 'none'; other.style.opacity = 0; }
        shown.style.viewTransitionName = 'garment';
        hide();
      }).finished.finally(() => {
        shown.style.viewTransitionName = '';
        shown.style.opacity = ''; shown.style.transform = '';
        $$('img', tile).forEach(i => { i.style.opacity = ''; });
      });
    }
    const dismiss = () => {
      history.pushState('', '', location.pathname + location.search);
      close();
    };
    const go = d => { location.hash = '/' + nextOf(d).slug; };

    // Remember what was clicked so the garment can travel from the grid into the sheet.
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-open-side]');
      if (!a) return;
      const side = +a.dataset.openSide;
      const flipped = matchMedia('(hover:hover)').matches && a.matches(':hover');
      pending = { side: flipped ? 1 - side : side, img: $(flipped ? '.b' : '.f', a) };
    }, true);

    $('[data-close]').addEventListener('click', dismiss);
    $('[data-prev]').addEventListener('click', () => go(-1));
    $('[data-next]').addEventListener('click', () => go(1));
    addEventListener('keydown', e => {
      if (el.hidden) return;
      if (e.key === 'Escape') dismiss();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'Tab') {
        const items = $$('a[href],button,[tabindex="0"]', el).filter(x => x.offsetParent !== null && x.tabIndex >= 0);
        const a = items[0], z = items[items.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    });
    const route = () => {
      const m = location.hash.match(/^#\/(.+)$/);
      const p = m && bySlug(m[1]);
      if (p) open(p); else close();
    };
    addEventListener('hashchange', route);
    route();
  }

  /* ---------- top bar ---------- */
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

  /* ---------- reveals and scrubbed type ---------- */
  function reveals() {
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: .01 });
    $$('.rv,.mask,.tile').forEach(e => io.observe(e));
    // Bento tiles start fully clipped, and a fully clipped element never reports as intersecting,
    // so these are checked by position instead.
    const lis = $$('.bento li');
    const sweep = () => {
      const h = innerHeight * .94;
      for (const li of lis) {
        if (li.classList.contains('in')) continue;
        if (li.getBoundingClientRect().top < h) li.classList.add('in');
      }
    };
    scrubs.push(sweep);
    sweep();

    if (calm) return;
    // Variable width: headline type stretches out to full width as it arrives.
    const items = $$('[data-stretch]');
    scrubs.push(() => {
      const h = innerHeight;
      const left = document.documentElement.scrollHeight - h - scrollY;
      for (const e of items) {
        const r = e.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h) continue;
        // The footer can never rise far up the screen, so it finishes on reaching the page end.
        const k = e.dataset.stretch === 'end' ? clamp(1 - left / (h * .4)) : clamp((h - r.top) / (h * .42));
        e.style.fontStretch = (62 + 63 * (1 - Math.pow(1 - k, 3))).toFixed(1) + '%';
      }
    });
  }

  /* ---------- cursor label ---------- */
  function cursor() {
    if (!fine || calm) return;
    const c = $('[data-cur]');
    let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
    const paint = () => {
      cx += (x - cx) * .22; cy += (y - cy) * .22;
      c.style.transform = `translate3d(${cx + 14}px,${cy + 14}px,0)`;
      raf = Math.abs(x - cx) + Math.abs(y - cy) > .2 ? requestAnimationFrame(paint) : 0;
    };
    addEventListener('pointermove', e => {
      x = e.clientX; y = e.clientY;
      const t = e.target.closest && e.target.closest('[data-cursor]');
      if (t) { if (!c.classList.contains('on')) { cx = x; cy = y; } c.textContent = t.dataset.cursor; }
      c.classList.toggle('on', !!t);
      if (!raf) raf = requestAnimationFrame(paint);
    }, { passive: true });
    document.addEventListener('pointerleave', () => c.classList.remove('on'));
  }

  /* The 3D hero lives in hero.js. If WebGL or that file fails, the flat hero takes over. */
  const flatHero = () => { sky(); heroMotion(); };
  if (document.documentElement.classList.contains('gl')) {
    window.TO_heroFail = () => {
      window.TO_heroFail = null;
      document.documentElement.classList.remove('gl');
      flatHero();
    };
  } else flatHero();
  barTone();
  turnSection();
  closeUp();
  shop();
  sheet();
  reveals();
  cursor();
  runScrubs();
})();
