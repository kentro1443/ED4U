"use client";

import { useEffect } from "react";

const REVEAL_SELECTOR = "[data-landing] [data-reveal]";
const PARALLAX_SELECTOR = "[data-landing] [data-parallax]";

export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing]");
    if (!root) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const revealElements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));

    if (reducedMotion.matches) {
      revealElements.forEach((element) => element.setAttribute("data-visible", ""));
      return;
    }

    root.setAttribute("data-motion-ready", "");

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.setAttribute("data-visible", "");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );

    revealElements.forEach((element) => observer.observe(element));

    const parallaxElements = Array.from(document.querySelectorAll<HTMLElement>(PARALLAX_SELECTOR));
    let frameId: number | null = null;

    const updateParallax = () => {
      const viewportHeight = window.innerHeight;
      parallaxElements.forEach((element) => {
        const rect = element.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > viewportHeight) return;
        const progress = (viewportHeight - rect.top) / (viewportHeight + rect.height) - 0.5;
        const speed = Number(element.dataset.parallax ?? "0.18");
        const offset = Math.max(-48, Math.min(48, progress * speed * 140));
        element.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
      });
      frameId = null;
    };

    const requestParallaxUpdate = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateParallax);
    };

    updateParallax();
    window.addEventListener("scroll", requestParallaxUpdate, { passive: true });
    window.addEventListener("resize", requestParallaxUpdate);

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", requestParallaxUpdate);
      window.removeEventListener("resize", requestParallaxUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      parallaxElements.forEach((element) => element.style.removeProperty("transform"));
      root.removeAttribute("data-motion-ready");
    };
  }, []);

  return null;
}
