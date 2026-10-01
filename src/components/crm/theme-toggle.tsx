"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

/** CRM-only dark mode. Stored per browser. */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const stored = localStorage.getItem("crm-theme");
    const isDark = stored === "dark";
    setDark(isDark);
    document.getElementById("crm-root")?.setAttribute("data-theme", isDark ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("crm-theme", next ? "dark" : "light");
    document.getElementById("crm-root")?.setAttribute("data-theme", next ? "dark" : "light");
  };
  return (
    <button
      type="button"
      onClick={toggle}
      className="text-muted hover:bg-sunken hover:text-fg rounded-md p-2"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
