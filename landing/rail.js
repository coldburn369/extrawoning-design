/* Examples — an interactive opportunity map. One house remains in place while
   the selected architectural zone, hotspot and analysis dossier change. */
const exampleExplorer = document.querySelector('[data-example-explorer]');
if (exampleExplorer && exampleExplorer.dataset.enhanced !== 'true') {
  exampleExplorer.dataset.enhanced = 'true';

  const tabs = [...exampleExplorer.querySelectorAll('[data-example-tab]')];
  const panels = [...exampleExplorer.querySelectorAll('[data-example-panel]')];
  const stage = exampleExplorer.querySelector('[data-example-stage]');
  const canvas = exampleExplorer.querySelector('[data-opportunity-canvas]');
  const currentLabel = exampleExplorer.querySelector('[data-example-current]');
  const announcer = exampleExplorer.querySelector('[data-example-announcer]');
  const previous = exampleExplorer.querySelector('[data-example-prev]');
  const next = exampleExplorer.querySelector('[data-example-next]');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const count = Math.min(tabs.length, panels.length);
  let current = 0;

  const normalise = (index) => (index + count) % count;

  const activate = (targetIndex, announce = true) => {
    if (!count || !stage) return;
    const target = normalise(targetIndex);

    panels.forEach((panel, index) => {
      panel.classList.toggle('is-active', index === target);
      panel.setAttribute('aria-hidden', String(index !== target));
    });
    tabs.forEach((tab, index) => {
      tab.setAttribute('aria-selected', String(index === target));
      tab.setAttribute('tabindex', index === target ? '0' : '-1');
    });

    stage.dataset.active = String(target);
    current = target;
    if (currentLabel) currentLabel.textContent = String(current + 1).padStart(2, '0');
    exampleExplorer.style.setProperty('--opportunity-progress', String((current + 1) / count));

    if (announce && announcer) {
      const title = panels[target].querySelector('h3')?.textContent?.trim() || 'Woonkans';
      announcer.textContent = `${title}, woonkans ${current + 1} van ${count}`;
    }
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activate(index));
    tab.addEventListener('keydown', (event) => {
      let target;
      if (event.key === 'ArrowDown' || event.key === 'ArrowRight') target = normalise(index + 1);
      else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') target = normalise(index - 1);
      else if (event.key === 'Home') target = 0;
      else if (event.key === 'End') target = count - 1;
      else return;

      event.preventDefault();
      activate(target);
      tabs[target].focus();
    });
  });

  previous?.addEventListener('click', () => activate(current - 1));
  next?.addEventListener('click', () => activate(current + 1));

  const revealObserver = new IntersectionObserver(
    ([entry]) => {
      if (!entry?.isIntersecting) return;
      exampleExplorer.classList.add('is-map-visible');
      revealObserver.disconnect();
    },
    { threshold: .18 }
  );
  revealObserver.observe(exampleExplorer);

  if (canvas && finePointer && !reduce) {
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;

    const renderMapParallax = () => {
      const bounds = canvas.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width - .5) * 2));
      const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height - .5) * 2));
      canvas.style.setProperty('--map-x', `${x * 6}px`);
      canvas.style.setProperty('--map-y', `${y * 4}px`);
      canvas.style.setProperty('--map-hotspot-x', `${x * 3}px`);
      canvas.style.setProperty('--map-hotspot-y', `${y * 2}px`);
      frame = null;
    };

    canvas.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame === null) frame = requestAnimationFrame(renderMapParallax);
    });
    canvas.addEventListener('pointerleave', () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      canvas.style.removeProperty('--map-x');
      canvas.style.removeProperty('--map-y');
      canvas.style.removeProperty('--map-hotspot-x');
      canvas.style.removeProperty('--map-hotspot-y');
    });
  }
}

/* Fine-pointer enhancement for the selected glass cards. The Next route has
   the same behavior in LandingClient; this keeps the legacy comparison server
   visually equivalent without introducing an inline script. */
const initialPostcode = document.getElementById('pc1');
const introRoot = document.body;
const pageLoader = document.querySelector('[data-page-loader]');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const focusInitialPostcode = () => initialPostcode?.focus({ preventScroll: true });

const startNavLogoReveal = () => {
  const navLogo = document.querySelector('[data-nav-logo]');
  const reveal = document.querySelector('[data-logo-reveal]');
  const source = reveal?.dataset.src;
  if (!navLogo || !reveal || !source) return;
  reveal.addEventListener('load', () => navLogo.classList.add('is-revealing'), { once: true });
  reveal.src = source;
};

const revealPage = () => {
  if (!pageLoader || pageLoader.dataset.finished === 'true') {
    focusInitialPostcode();
    return;
  }
  pageLoader.dataset.finished = 'true';
  startNavLogoReveal();
  focusInitialPostcode();
  requestAnimationFrame(() => {
    introRoot.classList.add('is-intro-ready');
    pageLoader.classList.add('is-leaving');
  });
  setTimeout(() => {
    pageLoader.hidden = true;
    pageLoader.setAttribute('aria-hidden', 'true');
  }, 850);
};

if (pageLoader) {
  introRoot.classList.add('is-intro-pending');
  if (reduceMotion) {
    revealPage();
  } else {
    const releaseAfterLoad = () => setTimeout(revealPage, Math.max(0, 900 - performance.now()));
    if (document.readyState === 'complete') releaseAfterLoad();
    else window.addEventListener('load', releaseAfterLoad, { once: true });
  }
} else if (document.activeElement === document.body) {
  focusInitialPostcode();
}

if (
  matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !reduceMotion
) {
  const hero = document.querySelector('.hero');
  if (hero) {
    const parallaxProperties = [
      '--hero-back-x', '--hero-back-y',
      '--hero-copy-x', '--hero-copy-y',
      '--hero-house-x', '--hero-house-y',
      '--hero-card-a-x', '--hero-card-a-y',
      '--hero-card-b-x', '--hero-card-b-y',
      '--hero-proof-x', '--hero-proof-y',
    ];
    let frame = null;
    let pointerX = 0;
    let pointerY = 0;

    const render = () => {
      const bounds = hero.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width - 0.5) * 2));
      const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height - 0.5) * 2));

      hero.style.setProperty('--hero-back-x', `${x * -10}px`);
      hero.style.setProperty('--hero-back-y', `${y * -7}px`);
      hero.style.setProperty('--hero-copy-x', `${x * -3}px`);
      hero.style.setProperty('--hero-copy-y', `${y * -2}px`);
      hero.style.setProperty('--hero-house-x', `${x * 6}px`);
      hero.style.setProperty('--hero-house-y', `${y * 4}px`);
      hero.style.setProperty('--hero-card-a-x', `${x * -10}px`);
      hero.style.setProperty('--hero-card-a-y', `${y * -7}px`);
      hero.style.setProperty('--hero-card-b-x', `${x * 13}px`);
      hero.style.setProperty('--hero-card-b-y', `${y * -9}px`);
      hero.style.setProperty('--hero-proof-x', `${x * 3}px`);
      hero.style.setProperty('--hero-proof-y', `${y * 2}px`);
      frame = null;
    };
    hero.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (frame === null) frame = requestAnimationFrame(render);
    });
    hero.addEventListener('pointerleave', () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      parallaxProperties.forEach((property) => hero.style.removeProperty(property));
    });
  }

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
