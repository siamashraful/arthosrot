"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/icons/Icon";

/** Explicit preference; null = follow the OS scheme (no data-theme attribute). */
type Theme = "light" | "dark" | null;
type Resolved = "light" | "dark";

const MEDIA = "(prefers-color-scheme: dark)";

function applyTheme(theme: Theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

/** The stored preference, as the root layout's pre-hydration script applied it. */
function appliedTheme(): Theme {
  const t = document.documentElement.getAttribute("data-theme");
  return t === "light" || t === "dark" ? t : null;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(null);
  // The theme actually in effect (preference, else the OS scheme). "light" is
  // the token default, so server and first client render agree; the effect
  // below corrects it before paint settles — never read matchMedia in render.
  const [resolved, setResolved] = useState<Resolved>("light");

  useEffect(() => {
    setTheme(appliedTheme());
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
    try {
      window.localStorage.setItem("theme", next);
    } catch {
      // Storage unavailable (private mode): applies to this page only.
    }
  }

  // Icon and word mirror the current look (not the destination): sun +
  // "Light", moon + "Dark". The accessible name carries the setting too —
  // "Theme: Light" — so the control announces its state, not just an action.
  const glyph = resolved === "dark" ? "moon" : "sun";

  return (
    <button type="button" className="ar-btn ar-btn--secondary ar-btn--compact" onClick={toggle}>
      <Icon name={glyph} size={16} />
      <span className="sr-only">Theme: </span>
      {resolved === "dark" ? "Dark" : "Light"}
    </button>
  );
}
