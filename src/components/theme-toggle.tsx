"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** Explicit preference; null = follow the OS scheme (no data-theme attribute). */
type Theme = "light" | "dark" | null;
type Resolved = "light" | "dark";

const MEDIA = "(prefers-color-scheme: dark)";

function applyTheme(theme: Theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(null);
  // The theme actually in effect (preference, else the OS scheme). "light" is
  // the token default, so server and first client render agree; the effect
  // below corrects it before paint settles — never read matchMedia in render.
  const [resolved, setResolved] = useState<Resolved>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") as Theme;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      applyTheme(stored);
    }
  }, []);

  useEffect(() => {
    if (theme) {
      setResolved(theme);
      return;
    }
    const media = window.matchMedia(MEDIA);
    const sync = () => setResolved(media.matches ? "dark" : "light");
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [theme]);

  function toggle() {
    const next: Resolved = resolved === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next);
  }

  // One icon, the one that matches the current look (a mirror, not a switch
  // showing the destination): sun for light, moon for dark.
  const Icon = resolved === "dark" ? Moon : Sun;

  return (
    <button type="button" className="btn btn-ghost" onClick={toggle} aria-label="Toggle theme">
      <Icon size={16} aria-hidden />
      Theme
    </button>
  );
}
