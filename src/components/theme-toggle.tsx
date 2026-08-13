"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | null;

function applyTheme(theme: Theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("theme") as Theme;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
      applyTheme(stored);
    }
  }, []);

  function toggle() {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const current = theme ?? (prefersDark ? "dark" : "light");
    const next: Theme = current === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    window.localStorage.setItem("theme", next ?? "");
  }

  return (
    <button type="button" className="btn btn-ghost" onClick={toggle} aria-label="Toggle theme">
      <Sun size={16} aria-hidden data-theme-icon="light" />
      <Moon size={16} aria-hidden data-theme-icon="dark" />
      Theme
    </button>
  );
}
