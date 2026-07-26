"use client";

import { useEffect } from "react";

const SPEED = 55;

export default function LandingClient() {
  useEffect(() => {
    const rail = document.getElementById("examples-rail");
    const cleanups: Array<() => void> = [];

    for (const form of document.querySelectorAll<HTMLFormElement>(".addresscheck")) {
      const preventPlaceholderSubmit = (event: SubmitEvent) => event.preventDefault();
      form.addEventListener("submit", preventPlaceholderSubmit);
      cleanups.push(() => form.removeEventListener("submit", preventPlaceholderSubmit));
    }

    if (!rail || rail.dataset.enhanced === "true") {
      return () => cleanups.forEach((cleanup) => cleanup());
    }

    rail.dataset.enhanced = "true";
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const originals = Array.from(rail.children);
    const count = originals.length;

    for (const item of originals) {
      const clone = item.cloneNode(true) as HTMLElement;
      clone.setAttribute("aria-hidden", "true");
      rail.appendChild(clone);
    }

    const period = () => {
      const clone = rail.children[count] as HTMLElement | undefined;
      const first = rail.children[0] as HTMLElement | undefined;
      return clone && first ? clone.offsetLeft - first.offsetLeft : 0;
    };

    const wrap = () => {
      const distance = period();
      if (distance <= 0) return;
      if (rail.scrollLeft >= distance) rail.scrollLeft -= distance;
      else if (rail.scrollLeft < 0) rail.scrollLeft += distance;
    };

    let paused = false;
    let dragging = false;
    let frame: number | null = null;
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTime: number | null = null;
    let startX = 0;
    let startScroll = 0;

    const tick = (time: number) => {
      const elapsed = lastTime === null ? 0 : Math.min(time - lastTime, 50);
      lastTime = time;
      if (!paused && !dragging && !reduce) {
        rail.scrollLeft += SPEED * (elapsed / 1000);
      }
      wrap();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      if (frame !== null) return;
      lastTime = null;
      frame = requestAnimationFrame(tick);
    };

    const stop = () => {
      if (frame === null) return;
      cancelAnimationFrame(frame);
      frame = null;
      lastTime = null;
    };

    const observer = new IntersectionObserver(
      ([entry]) => (entry?.isIntersecting ? start() : stop()),
      { threshold: 0 },
    );
    observer.observe(rail);

    const hold = (milliseconds = 2500) => {
      paused = true;
      clearTimeout(resumeTimer);
      resumeTimer = setTimeout(() => {
        paused = false;
      }, milliseconds);
    };

    const pointerEnter = () => {
      paused = true;
    };
    const pointerLeave = () => {
      if (!dragging) paused = false;
    };
    const focusIn = () => {
      paused = true;
    };
    const focusOut = () => {
      paused = false;
    };
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") return;
      dragging = true;
      startX = event.clientX;
      startScroll = rail.scrollLeft;
      rail.setPointerCapture(event.pointerId);
      rail.classList.add("is-dragging");
    };
    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      rail.scrollLeft = startScroll - (event.clientX - startX);
      wrap();
    };
    const endDrag = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      rail.classList.remove("is-dragging");
      try {
        rail.releasePointerCapture(event.pointerId);
      } catch {
        // The capture can already be gone after pointercancel.
      }
      hold();
    };

    rail.addEventListener("pointerenter", pointerEnter);
    rail.addEventListener("pointerleave", pointerLeave);
    rail.addEventListener("focusin", focusIn);
    rail.addEventListener("focusout", focusOut);
    rail.addEventListener("pointerdown", pointerDown);
    rail.addEventListener("pointermove", pointerMove);
    rail.addEventListener("pointerup", endDrag);
    rail.addEventListener("pointercancel", endDrag);

    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-rail]")) {
      const click = () => {
        const card = rail.querySelector<HTMLElement>(".example");
        const step = card ? card.getBoundingClientRect().width + 16 : 240;
        hold();
        rail.scrollBy({
          left: button.dataset.rail === "next" ? step : -step,
          behavior: "smooth",
        });
      };
      button.addEventListener("click", click);
      cleanups.push(() => button.removeEventListener("click", click));
    }

    return () => {
      observer.disconnect();
      stop();
      clearTimeout(resumeTimer);
      rail.removeEventListener("pointerenter", pointerEnter);
      rail.removeEventListener("pointerleave", pointerLeave);
      rail.removeEventListener("focusin", focusIn);
      rail.removeEventListener("focusout", focusOut);
      rail.removeEventListener("pointerdown", pointerDown);
      rail.removeEventListener("pointermove", pointerMove);
      rail.removeEventListener("pointerup", endDrag);
      rail.removeEventListener("pointercancel", endDrag);
      for (const clone of Array.from(rail.querySelectorAll('[aria-hidden="true"]'))) {
        clone.remove();
      }
      delete rail.dataset.enhanced;
      cleanups.forEach((cleanup) => cleanup());
    };
  }, []);

  return null;
}
