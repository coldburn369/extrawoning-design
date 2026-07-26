"use client";

import { useEffect } from "react";

export default function LandingClient() {
  useEffect(() => {
    const explorer = document.querySelector<HTMLElement>("[data-example-explorer]");
    const cleanups: Array<() => void> = [];
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;
    const introRoot = document.body;
    const loader = document.querySelector<HTMLElement>("[data-page-loader]");
    const postcode = document.getElementById("pc1") as HTMLInputElement | null;
    let introTimer: number | undefined;
    let loaderRemovalTimer: number | undefined;
    let loadListener: (() => void) | undefined;

    for (const form of document.querySelectorAll<HTMLFormElement>(".addresscheck")) {
      const preventPlaceholderSubmit = (event: SubmitEvent) => event.preventDefault();
      form.addEventListener("submit", preventPlaceholderSubmit);
      cleanups.push(() => form.removeEventListener("submit", preventPlaceholderSubmit));
    }

    const focusPostcode = () => postcode?.focus({ preventScroll: true });
    const startLogoReveal = () => {
      const navLogo = document.querySelector<HTMLElement>("[data-nav-logo]");
      const reveal = document.querySelector<HTMLImageElement>("[data-logo-reveal]");
      const source = reveal?.dataset.src;
      if (!navLogo || !reveal || !source) return;

      const showReveal = () => navLogo.classList.add("is-revealing");
      reveal.addEventListener("load", showReveal, { once: true });
      reveal.src = source;
      cleanups.push(() => reveal.removeEventListener("load", showReveal));
    };
    const revealPage = () => {
      if (!loader || loader.dataset.finished === "true") {
        focusPostcode();
        return;
      }

      loader.dataset.finished = "true";
      startLogoReveal();
      focusPostcode();
      requestAnimationFrame(() => {
        introRoot.classList.add("is-intro-ready");
        loader.classList.add("is-leaving");
      });
      loaderRemovalTimer = window.setTimeout(() => {
        loader.hidden = true;
        loader.setAttribute("aria-hidden", "true");
      }, 850);
    };

    if (loader) {
      introRoot.classList.add("is-intro-pending");
      if (reduce) {
        revealPage();
      } else {
        const releaseAfterLoad = () => {
          const remaining = Math.max(0, 900 - performance.now());
          introTimer = window.setTimeout(revealPage, remaining);
        };
        if (document.readyState === "complete") {
          releaseAfterLoad();
        } else {
          loadListener = releaseAfterLoad;
          window.addEventListener("load", loadListener, { once: true });
        }
      }
    } else if (document.activeElement === document.body) {
      focusPostcode();
    }
    cleanups.push(() => {
      if (introTimer !== undefined) window.clearTimeout(introTimer);
      if (loaderRemovalTimer !== undefined) window.clearTimeout(loaderRemovalTimer);
      if (loadListener) window.removeEventListener("load", loadListener);
    });

    if (!reduce && finePointer) {
      const hero = document.querySelector<HTMLElement>(".hero");
      if (hero) {
        const parallaxProperties = [
          "--hero-back-x", "--hero-back-y",
          "--hero-copy-x", "--hero-copy-y",
          "--hero-house-x", "--hero-house-y",
          "--hero-card-a-x", "--hero-card-a-y",
          "--hero-card-b-x", "--hero-card-b-y",
          "--hero-proof-x", "--hero-proof-y",
        ];
        let frame: number | null = null;
        let pointerX = 0;
        let pointerY = 0;

        const renderParallax = () => {
          const bounds = hero.getBoundingClientRect();
          const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width - 0.5) * 2));
          const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height - 0.5) * 2));

          hero.style.setProperty("--hero-back-x", `${x * -10}px`);
          hero.style.setProperty("--hero-back-y", `${y * -7}px`);
          hero.style.setProperty("--hero-copy-x", `${x * -3}px`);
          hero.style.setProperty("--hero-copy-y", `${y * -2}px`);
          hero.style.setProperty("--hero-house-x", `${x * 6}px`);
          hero.style.setProperty("--hero-house-y", `${y * 4}px`);
          hero.style.setProperty("--hero-card-a-x", `${x * -10}px`);
          hero.style.setProperty("--hero-card-a-y", `${y * -7}px`);
          hero.style.setProperty("--hero-card-b-x", `${x * 13}px`);
          hero.style.setProperty("--hero-card-b-y", `${y * -9}px`);
          hero.style.setProperty("--hero-proof-x", `${x * 3}px`);
          hero.style.setProperty("--hero-proof-y", `${y * 2}px`);
          frame = null;
        };
        const pointerMove = (event: PointerEvent) => {
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (frame === null) frame = requestAnimationFrame(renderParallax);
        };
        const pointerLeave = () => {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null;
          for (const property of parallaxProperties) hero.style.removeProperty(property);
        };

        hero.addEventListener("pointermove", pointerMove);
        hero.addEventListener("pointerleave", pointerLeave);
        cleanups.push(() => {
          hero.removeEventListener("pointermove", pointerMove);
          hero.removeEventListener("pointerleave", pointerLeave);
          if (frame !== null) cancelAnimationFrame(frame);
          for (const property of parallaxProperties) hero.style.removeProperty(property);
        });
      }

      for (const card of document.querySelectorAll<HTMLElement>("[data-cursor-glow]")) {
        let frame: number | null = null;
        let pointerX = 0;
        let pointerY = 0;

        const renderGlow = () => {
          const bounds = card.getBoundingClientRect();
          card.style.setProperty("--glow-x", `${pointerX - bounds.left}px`);
          card.style.setProperty("--glow-y", `${pointerY - bounds.top}px`);
          frame = null;
        };
        const pointerMove = (event: PointerEvent) => {
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (frame === null) frame = requestAnimationFrame(renderGlow);
        };
        const pointerLeave = () => {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null;
          card.style.removeProperty("--glow-x");
          card.style.removeProperty("--glow-y");
        };

        card.addEventListener("pointermove", pointerMove);
        card.addEventListener("pointerleave", pointerLeave);
        cleanups.push(() => {
          card.removeEventListener("pointermove", pointerMove);
          card.removeEventListener("pointerleave", pointerLeave);
          if (frame !== null) cancelAnimationFrame(frame);
          card.style.removeProperty("--glow-x");
          card.style.removeProperty("--glow-y");
        });
      }

      for (const button of document.querySelectorAll<HTMLElement>(".btn")) {
        let frame: number | null = null;
        let pointerX = 0;
        let pointerY = 0;

        const renderButtonLight = () => {
          const bounds = button.getBoundingClientRect();
          const localX = pointerX - bounds.left;
          const localY = pointerY - bounds.top;

          button.style.setProperty("--btn-x", `${localX}px`);
          button.style.setProperty("--btn-y", `${localY}px`);
          frame = null;
        };
        const pointerMove = (event: PointerEvent) => {
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (frame === null) frame = requestAnimationFrame(renderButtonLight);
        };
        const pointerLeave = () => {
          if (frame !== null) cancelAnimationFrame(frame);
          frame = null;
          button.style.removeProperty("--btn-x");
          button.style.removeProperty("--btn-y");
        };

        button.addEventListener("pointermove", pointerMove);
        button.addEventListener("pointerleave", pointerLeave);
        cleanups.push(() => {
          button.removeEventListener("pointermove", pointerMove);
          button.removeEventListener("pointerleave", pointerLeave);
          if (frame !== null) cancelAnimationFrame(frame);
          button.style.removeProperty("--btn-x");
          button.style.removeProperty("--btn-y");
        });
      }
    }

    if (!explorer || explorer.dataset.enhanced === "true") {
      return () => cleanups.forEach((cleanup) => cleanup());
    }

    explorer.dataset.enhanced = "true";
    const tabs = Array.from(explorer.querySelectorAll<HTMLButtonElement>("[data-example-tab]"));
    const panels = Array.from(explorer.querySelectorAll<HTMLElement>("[data-example-panel]"));
    const stage = explorer.querySelector<HTMLElement>("[data-example-stage]");
    const canvas = explorer.querySelector<HTMLElement>("[data-opportunity-canvas]");
    const currentLabel = explorer.querySelector<HTMLElement>("[data-example-current]");
    const announcer = explorer.querySelector<HTMLElement>("[data-example-announcer]");
    const previous = explorer.querySelector<HTMLButtonElement>("[data-example-prev]");
    const next = explorer.querySelector<HTMLButtonElement>("[data-example-next]");
    const count = Math.min(tabs.length, panels.length);

    if (!stage || !count) {
      delete explorer.dataset.enhanced;
      return () => cleanups.forEach((cleanup) => cleanup());
    }

    const explorerRoot = explorer;
    const stageRoot = stage;
    let current = 0;

    const normalise = (index: number) => (index + count) % count;

    function activate(targetIndex: number, announce = true) {
      const target = normalise(targetIndex);

      panels.forEach((panel, index) => {
        panel.classList.toggle("is-active", index === target);
        panel.setAttribute("aria-hidden", String(index !== target));
      });
      tabs.forEach((tab, index) => {
        tab.setAttribute("aria-selected", String(index === target));
        tab.setAttribute("tabindex", index === target ? "0" : "-1");
      });

      stageRoot.dataset.active = String(target);
      current = target;
      if (currentLabel) currentLabel.textContent = String(current + 1).padStart(2, "0");
      explorerRoot.style.setProperty("--opportunity-progress", String((current + 1) / count));

      if (announce && announcer) {
        const title = panels[target].querySelector("h3")?.textContent?.trim() || "Woonkans";
        announcer.textContent = `${title}, woonkans ${current + 1} van ${count}`;
      }
    }

    for (const [index, tab] of tabs.entries()) {
      const click = () => activate(index);
      const keydown = (event: KeyboardEvent) => {
        let target: number;
        if (event.key === "ArrowDown" || event.key === "ArrowRight") target = normalise(index + 1);
        else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = normalise(index - 1);
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = count - 1;
        else return;

        event.preventDefault();
        activate(target);
        tabs[target].focus();
      };
      tab.addEventListener("click", click);
      tab.addEventListener("keydown", keydown);
      cleanups.push(() => {
        tab.removeEventListener("click", click);
        tab.removeEventListener("keydown", keydown);
      });
    }

    if (previous) {
      const click = () => activate(current - 1);
      previous.addEventListener("click", click);
      cleanups.push(() => previous.removeEventListener("click", click));
    }
    if (next) {
      const click = () => activate(current + 1);
      next.addEventListener("click", click);
      cleanups.push(() => next.removeEventListener("click", click));
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        explorerRoot.classList.add("is-map-visible");
        observer.disconnect();
      },
      { threshold: 0.18 },
    );
    observer.observe(explorer);

    let mapFrame: number | null = null;
    let pointerX = 0;
    let pointerY = 0;
    const mapPointerMove = (event: PointerEvent) => {
      if (!canvas) return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (mapFrame !== null) return;
      mapFrame = requestAnimationFrame(() => {
        const bounds = canvas.getBoundingClientRect();
        const x = Math.max(-1, Math.min(1, ((pointerX - bounds.left) / bounds.width - 0.5) * 2));
        const y = Math.max(-1, Math.min(1, ((pointerY - bounds.top) / bounds.height - 0.5) * 2));
        canvas.style.setProperty("--map-x", `${x * 6}px`);
        canvas.style.setProperty("--map-y", `${y * 4}px`);
        canvas.style.setProperty("--map-hotspot-x", `${x * 3}px`);
        canvas.style.setProperty("--map-hotspot-y", `${y * 2}px`);
        mapFrame = null;
      });
    };
    const mapPointerLeave = () => {
      if (!canvas) return;
      if (mapFrame !== null) cancelAnimationFrame(mapFrame);
      mapFrame = null;
      canvas.style.removeProperty("--map-x");
      canvas.style.removeProperty("--map-y");
      canvas.style.removeProperty("--map-hotspot-x");
      canvas.style.removeProperty("--map-hotspot-y");
    };

    if (canvas && finePointer && !reduce) {
      canvas.addEventListener("pointermove", mapPointerMove);
      canvas.addEventListener("pointerleave", mapPointerLeave);
    }

    return () => {
      observer.disconnect();
      if (canvas && finePointer && !reduce) {
        canvas.removeEventListener("pointermove", mapPointerMove);
        canvas.removeEventListener("pointerleave", mapPointerLeave);
      }
      mapPointerLeave();
      explorer.classList.remove("is-map-visible");
      explorer.style.removeProperty("--opportunity-progress");
      panels.forEach((panel, index) => {
        panel.classList.toggle("is-active", index === 0);
        panel.setAttribute("aria-hidden", String(index !== 0));
      });
      tabs.forEach((tab, index) => {
        tab.setAttribute("aria-selected", String(index === 0));
        tab.setAttribute("tabindex", index === 0 ? "0" : "-1");
      });
      if (currentLabel) currentLabel.textContent = "01";
      stage.dataset.active = "0";
      delete explorer.dataset.enhanced;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
