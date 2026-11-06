// Minimal hash-based router for the single-route SPA shell.
// Routes: #/dashboard, #/students, #/students/:id, #/admissions,
//         #/admissions/new, #/admissions/:id, #/settings/:tab, …

"use client";

import { useEffect, useState, useCallback } from "react";

export interface Route {
  segments: string[];
  hash: string;
}

function parseHash(): Route {
  if (typeof window === "undefined") return { segments: [], hash: "" };
  const raw = window.location.hash.replace(/^#\/?/, "");
  const segments = raw.split("/").filter(Boolean).map(decodeURIComponent);
  return { segments, hash: raw };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

export function navigate(path: string) {
  const target = path.startsWith("#") ? path : `#${path.startsWith("/") ? path : `/${path}`}`;
  if (window.location.hash === target) return;
  window.location.hash = target;
}

export function useNavigate() {
  return useCallback((path: string) => navigate(path), []);
}

export function routeKey(route: Route): string {
  return `/${route.segments.join("/")}`;
}
