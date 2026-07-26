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
    const currentLabel = explorer.querySelector<HTMLElement>("[data-example-current]");
    const announcer = explorer.querySelector<HTMLElement>("[data-example-announcer]");
    const previous = explorer.querySelector<HTMLButtonElement>("[data-example-prev]");
    const next = explorer.querySelector<HTMLButtonElement>("[data-example-next]");
    const toggle = explorer.querySelector<HTMLButtonElement>("[data-example-toggle]");
    const count = Math.min(tabs.length, panels.length);

    if (!stage || !count) {
      delete explorer.dataset.enhanced;
      return () => cleanups.forEach((cleanup) => cleanup());
    }

    const explorerRoot = explorer;
    const stageRoot = stage;
    let current = 0;
    let manualPaused = reduce;
    let temporaryPaused = false;
    let inView = false;
    let autoplayTimer: number | undefined;
    let leavingTimer: number | undefined;
    let focusPauseTimer: number | undefined;

    const normalise = (index: number) => (index + count) % count;
    const canPlay = () => inView && !manualPaused && !temporaryPaused && !reduce;

    function schedule() {
      if (autoplayTimer !== undefined) window.clearTimeout(autoplayTimer);
      autoplayTimer = undefined;
      if (!canPlay()) return;
      autoplayTimer = window.setTimeout(() => activate(current + 1, "next"), 8000);
    }

    function syncPlayback() {
      const playing = canPlay();
      explorerRoot.classList.toggle("is-playing", playing);
      explorerRoot.classList.toggle("is-temporarily-paused", temporaryPaused);
      toggle?.setAttribute("aria-pressed", String(manualPaused));
      toggle?.setAttribute(
        "aria-label",
        manualPaused ? "Automatisch afspelen hervatten" : "Automatisch afspelen pauzeren",
      );
      schedule();
    }

    function activate(targetIndex: number, direction: "next" | "prev" = "next", announce = true) {
      const target = normalise(targetIndex);
      if (target === current) {
        syncPlayback();
        return;
      }

      const outgoing = panels[current];
      const incoming = panels[target];
      if (leavingTimer !== undefined) window.clearTimeout(leavingTimer);
      for (const panel of panels) panel.classList.remove("is-leaving");

      stageRoot.dataset.direction = direction;
      outgoing.classList.remove("is-active");
      outgoing.classList.add("is-leaving");
      outgoing.setAttribute("aria-hidden", "true");
      incoming.classList.add("is-active");
      incoming.setAttribute("aria-hidden", "false");

      tabs[current].setAttribute("aria-selected", "false");
      tabs[current].setAttribute("tabindex", "-1");
      tabs[target].setAttribute("aria-selected", "true");
      tabs[target].setAttribute("tabindex", "0");

      current = target;
      if (currentLabel) currentLabel.textContent = String(current + 1).padStart(2, "0");
      explorerRoot.style.setProperty("--example-progress", String((current + 1) / count));

      if (announce && announcer) {
        const title = incoming.querySelector("h3")?.textContent?.trim() || "Scenario";
        announcer.textContent = `${title}, scenario ${current + 1} van ${count}`;
      }

      leavingTimer = window.setTimeout(() => outgoing.classList.remove("is-leaving"), 760);
      syncPlayback();
    }

    const selectManually = (target: number, direction: "next" | "prev") => {
      manualPaused = true;
      activate(target, direction);
    };

    for (const [index, tab] of tabs.entries()) {
      const click = () => selectManually(index, index < current ? "prev" : "next");
      const keydown = (event: KeyboardEvent) => {
        let target: number;
        if (event.key === "ArrowDown" || event.key === "ArrowRight") target = normalise(index + 1);
        else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = normalise(index - 1);
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = count - 1;
        else return;

        event.preventDefault();
        manualPaused = true;
        activate(target, target < current ? "prev" : "next");
        tabs[target].focus();
        tabs[target].scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
      };
      tab.addEventListener("click", click);
      tab.addEventListener("keydown", keydown);
      cleanups.push(() => {
        tab.removeEventListener("click", click);
        tab.removeEventListener("keydown", keydown);
      });
    }

    if (previous) {
      const click = () => selectManually(current - 1, "prev");
      previous.addEventListener("click", click);
      cleanups.push(() => previous.removeEventListener("click", click));
    }
    if (next) {
      const click = () => selectManually(current + 1, "next");
      next.addEventListener("click", click);
      cleanups.push(() => next.removeEventListener("click", click));
    }
    if (toggle) {
      const click = () => {
        manualPaused = !manualPaused;
        syncPlayback();
      };
      toggle.addEventListener("click", click);
      cleanups.push(() => toggle.removeEventListener("click", click));
    }

    const setTemporaryPause = (paused: boolean) => {
      temporaryPaused = paused;
      syncPlayback();
    };
    const pointerEnter = () => setTemporaryPause(true);
    const pointerLeave = () => setTemporaryPause(false);
    const focusIn = () => setTemporaryPause(true);
    const focusOut = () => {
      if (focusPauseTimer !== undefined) window.clearTimeout(focusPauseTimer);
      focusPauseTimer = window.setTimeout(
        () => setTemporaryPause(explorer.contains(document.activeElement)),
        0,
      );
    };

    if (finePointer) {
      explorer.addEventListener("pointerenter", pointerEnter);
      explorer.addEventListener("pointerleave", pointerLeave);
    }
    explorer.addEventListener("focusin", focusIn);
    explorer.addEventListener("focusout", focusOut);

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting);
        syncPlayback();
      },
      { threshold: 0.2 },
    );
    observer.observe(explorer);
    syncPlayback();

    return () => {
      observer.disconnect();
      if (autoplayTimer !== undefined) window.clearTimeout(autoplayTimer);
      if (leavingTimer !== undefined) window.clearTimeout(leavingTimer);
      if (focusPauseTimer !== undefined) window.clearTimeout(focusPauseTimer);
      if (finePointer) {
        explorer.removeEventListener("pointerenter", pointerEnter);
        explorer.removeEventListener("pointerleave", pointerLeave);
      }
      explorer.removeEventListener("focusin", focusIn);
      explorer.removeEventListener("focusout", focusOut);
      explorer.classList.remove("is-playing", "is-temporarily-paused");
      explorer.style.removeProperty("--example-progress");
      panels.forEach((panel, index) => {
        panel.classList.toggle("is-active", index === 0);
        panel.classList.remove("is-leaving");
        panel.setAttribute("aria-hidden", String(index !== 0));
      });
      tabs.forEach((tab, index) => {
        tab.setAttribute("aria-selected", String(index === 0));
        tab.setAttribute("tabindex", index === 0 ? "0" : "-1");
      });
      if (currentLabel) currentLabel.textContent = "01";
      stage.dataset.direction = "next";
      delete explorer.dataset.enhanced;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
