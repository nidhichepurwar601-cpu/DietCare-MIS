import React, { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar.jsx";
import Header from "./Header.jsx";
import CommandPalette from "../common/CommandPalette.jsx";
import { useTheme } from "../../theme/ThemeProvider.jsx";
import { LayoutContext } from "./layoutContext.js";

export default function AppLayout({ children }) {
  const { prefs } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchOpen, setSearchOpen]       = useState(false);

  /* ── Ctrl+K global search shortcut ─────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Close mobile nav on resize to desktop ──────────────────── */
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onResize = () => {
      if (window.innerWidth > 1024) setMobileNavOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [mobileNavOpen]);

  const layoutValue = useMemo(
    () => ({ mobileNavOpen, setMobileNavOpen, searchOpen, setSearchOpen }),
    [mobileNavOpen, searchOpen],
  );

  return (
    <LayoutContext.Provider value={layoutValue}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <div
        className={`app-shell ${prefs.density !== "comfortable" ? "compact-ui" : ""}`}
        style={{ overflow: "hidden" }}
      >
        {/* Desktop sidebar */}
        <Sidebar variant="desktop" />

        {/* Mobile drawer backdrop */}
        {mobileNavOpen && (
          <button
            type="button"
            className="nav-drawer-backdrop print-hide"
            aria-label="Close navigation"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Mobile drawer sidebar */}
        <Sidebar variant="mobile" />

        {/* Main column: header + scrollable content */}
        <div className="flex min-w-0 flex-1 flex-col" style={{ minHeight: 0 }}>
          <Header />
          <main
            id="main-content"
            className="flex-1 overflow-y-auto"
            style={{ padding: "var(--page-padding)" }}
          >
            {children}
          </main>
        </div>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </LayoutContext.Provider>
  );
}
