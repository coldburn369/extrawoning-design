/* Examples rail — a continuously sliding marquee.
   Markup: sections/examples.html · styles: css/examples.css

   The item set is duplicated once so the loop is seamless: when the rail
   has travelled exactly one set, scrollLeft rewinds by that distance and
   the copy is pixel-identical, so there is no visible jump.
   Touch keeps native momentum scrolling; pointer-drag is added for mouse. */
const rail = document.getElementById('examples-rail');
if (rail) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const count = rail.children.length;
  [...rail.children].forEach((li) => {
    const clone = li.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');   // decorative duplicate
    rail.appendChild(clone);
  });

  // Exact loop distance: where the first clone starts.
  const period = () => rail.children[count].offsetLeft - rail.children[0].offsetLeft;

  /* px per SECOND, not per frame. The old `scrollLeft += 0.35` was both too
     slow to read as motion (≈21px/s — a 16rem card took 12s to pass) and
     frame-rate dependent, so it ran at double speed on a 120Hz display.
     Advancing by elapsed time fixes both. */
  const SPEED = 55;
  let paused = false, dragging = false, rafId = null, resumeTimer, lastT = null;

  const wrap = () => {
    const p = period();
    if (p <= 0) return;
    if (rail.scrollLeft >= p) rail.scrollLeft -= p;
    else if (rail.scrollLeft < 0) rail.scrollLeft += p;
  };

  const tick = (t) => {
    // Clamp the delta: after a tab has been backgrounded, the first frame can
    // report a multi-second gap, which would jump the rail instead of sliding.
    const dt = lastT === null ? 0 : Math.min(t - lastT, 50);
    lastT = t;
    if (!paused && !dragging && !reduce) rail.scrollLeft += SPEED * (dt / 1000);
    wrap();
    rafId = requestAnimationFrame(tick);
  };
  const start = () => { if (rafId === null) { lastT = null; rafId = requestAnimationFrame(tick); } };
  const stop = () => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; lastT = null; } };

  // Only animate while the rail is actually on screen.
  new IntersectionObserver(
    (entries) => (entries[0].isIntersecting ? start() : stop()),
    { threshold: 0 }
  ).observe(rail);

  const hold = (ms = 2500) => {
    paused = true;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => { paused = false; }, ms);
  };

  rail.addEventListener('pointerenter', () => { paused = true; });
  rail.addEventListener('pointerleave', () => { if (!dragging) paused = false; });
  rail.addEventListener('focusin', () => { paused = true; });
  rail.addEventListener('focusout', () => { paused = false; });

  let startX = 0, startScroll = 0;
  rail.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse') return;      // let touch scroll natively
    dragging = true;
    startX = e.clientX;
    startScroll = rail.scrollLeft;
    rail.setPointerCapture(e.pointerId);
    rail.classList.add('is-dragging');
  });
  rail.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    rail.scrollLeft = startScroll - (e.clientX - startX);
    wrap();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    rail.classList.remove('is-dragging');
    try { rail.releasePointerCapture(e.pointerId); } catch (_) {}
    hold();
  };
  rail.addEventListener('pointerup', endDrag);
  rail.addEventListener('pointercancel', endDrag);

  document.querySelectorAll('[data-rail]').forEach((b) => {
    b.addEventListener('click', () => {
      const card = rail.querySelector('.example');
      const step = card ? card.getBoundingClientRect().width + 16 : 240;
      hold();
      rail.scrollBy({ left: b.dataset.rail === 'next' ? step : -step, behavior: 'smooth' });
    });
  });
}

/* Fine-pointer enhancement for the selected glass cards. The Next route has
   the same behavior in LandingClient; this keeps the legacy comparison server
   visually equivalent without introducing an inline script. */
if (
  matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches
) {
  document.querySelectorAll('[data-cursor-glow]').forEach((card) => {
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;

    const render = () => {
      const bounds = card.getBoundingClientRect();
      card.style.setProperty('--glow-x', `${pointerX - bounds.left}px`);
      card.style.setProperty('--glow-y', `${pointerY - bounds.top}px`);
      frame = null;
    };
    card.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame === null) frame = requestAnimationFrame(render);
    });
    card.addEventListener('pointerleave', () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      card.style.removeProperty('--glow-x');
      card.style.removeProperty('--glow-y');
    });
  });

  document.querySelectorAll('.btn').forEach((button) => {
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;

    const render = () => {
      const bounds = button.getBoundingClientRect();
      const localX = pointerX - bounds.left;
      const localY = pointerY - bounds.top;

      button.style.setProperty('--btn-x', `${localX}px`);
      button.style.setProperty('--btn-y', `${localY}px`);
      frame = null;
    };
    button.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame === null) frame = requestAnimationFrame(render);
    });
    button.addEventListener('pointerleave', () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      button.style.removeProperty('--btn-x');
      button.style.removeProperty('--btn-y');
    });
  });
}
