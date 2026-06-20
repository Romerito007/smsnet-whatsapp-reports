"use client";

import { useState, useEffect } from "react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState("dark");

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") || "dark");
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("theme", next); } catch {}
    setTheme(next);
  }

  return (
    <button
      className="btn-ghost"
      onClick={toggle}
      aria-label="Alternar tema"
      title={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
      style={{ fontSize: 16, padding: "6px 10px", lineHeight: 1 }}
    >
      {theme === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
