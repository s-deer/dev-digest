/* useReducedMotion — tracks `prefers-reduced-motion: reduce`. Guarded for
   environments without `matchMedia` (jsdom) and for server rendering. */
"use client";

import React from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener?.("change", onChange);
  return () => mq.removeEventListener?.("change", onChange);
}

function getSnapshot(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(QUERY).matches
    : false;
}

export function useReducedMotion(): boolean {
  return React.useSyncExternalStore(subscribe, getSnapshot, () => false);
}
