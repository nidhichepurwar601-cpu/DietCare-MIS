import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, Menu, Moon, Search, Sun, UserRound, ChevronDown, LogOut, Settings, User } from "lucide-react";
import { getStore, KEYS } from "../../lib/storage.js";
import { getSession, signOut } from "../../lib/auth.js";
import { PAGE_TITLES } from "../../config/navigation.js";
import { useTheme } from "../../theme/ThemeProvider.jsx";
import { useAppLayout } from "./layoutContext.js";

export default function Header() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { setMobileNavOpen, setSearchOpen } = useAppLayout();
  const { updatePrefs, resolvedMode } = useTheme();
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef  = useRef(null);
  const notifRef = useRef(null);
  const session  = getSession();

  /* ── Alerts from patient data ─────────────────────────────── */
  const patients = getStore(KEYS.PATIENTS) || [];
  const alerts = [
    ...patients
      .filter((p) => (p.allergens || []).some((a) => a && a !== "None"))
      .slice(0, 2)
      .map((p) => ({ text: `Allergy recorded — ${p.name}`, level: "warning" })),
    ...patients
      .filter((p) => !p.dietTypeId)
      .slice(0, 2)
      .map((p) => ({ text: `Diet assignment pending — ${p.name}`, level: "info" })),
  ];

  /* ── Close dropdowns on outside click ─────────────────────── */
  useEffect(() => {
    const onDoc = (e) => {
      if (menuRef.current  && !menuRef.current.contains(e.target))  setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  /* ── Page title ────────────────────────────────────────────── */
  const title =
    PAGE_TITLES[pathname] ||
    Object.entries(PAGE_TITLES).find(
      ([path]) => pathname.startsWith(path) && path !== "/",
    )?.[1] ||
    "DietCare MIS";

  /* ── User initials ─────────────────────────────────────────── */
  const initials = (session?.name || "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="app-header print-hide">
      {/* ── Left: hamburger + brand + page title ──────────────── */}
      <div className="app-header-title">
        <button
          type="button"
          className="icon-btn lg:hidden"
          aria-label="Open navigation menu"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu size={18} />
        </button>

        <div className="app-brand">
          <svg className="app-brand-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path d="M12 2a10 10 0 1 0 10 10"/>
            <path d="M12 6v6l4 2"/>
            <circle cx="19" cy="5" r="3" fill="currentColor" stroke="none"/>
          </svg>
          DietCare
        </div>

        <div className="app-page-label hidden md:block">
          <div className="app-page-title">{title}</div>
          <div className="app-page-subtitle">Hospital Dietary Management System</div>
        </div>
      </div>

      {/* ── Right: search + actions ─────────────────────────────── */}
      <div className="app-header-actions">
        {/* Search trigger — desktop */}
        <button
          type="button"
          className="app-search-trigger hidden sm:inline-flex"
          onClick={() => setSearchOpen(true)}
          aria-label="Open global search"
        >
          <Search size={13} />
          <span>Search</span>
          <kbd className="kbd">Ctrl K</kbd>
        </button>

        {/* Search icon — mobile only */}
        <button
          type="button"
          className="icon-btn sm:hidden"
          aria-label="Open search"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} />
        </button>

        {/* Dark / Light toggle */}
        <button
          type="button"
          className="icon-btn"
          aria-label={resolvedMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          onClick={() => updatePrefs({ mode: resolvedMode === "dark" ? "light" : "dark" })}
        >
          {resolvedMode === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Notifications ────────────────────────────────────────── */}
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            aria-label={`Notifications${alerts.length ? ` — ${alerts.length} active` : ""}`}
            aria-expanded={notifOpen}
            onClick={() => { setNotifOpen((v) => !v); setMenuOpen(false); }}
            className="icon-btn relative"
          >
            <Bell size={18} />
            {alerts.length > 0 && (
              <span className="notif-dot" aria-hidden="true" />
            )}
          </button>

          {notifOpen && (
            <div
              className="app-dropdown animate-fade-in"
              style={{ minWidth: 320, right: 0, top: "calc(100% + 6px)" }}
              role="dialog"
              aria-label="Notifications"
            >
              {/* Dropdown header */}
              <div className="app-dropdown-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>
                  Notifications
                </span>
                <span
                  style={{
                    fontSize: "var(--font-label)",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-pill)",
                    background: alerts.length > 0 ? "var(--color-error-soft)" : "var(--bg-secondary)",
                    color: alerts.length > 0 ? "var(--color-error)" : "var(--text-secondary)",
                    fontWeight: 700,
                  }}
                >
                  {alerts.length} active
                </span>
              </div>

              {/* Alert items */}
              {alerts.length ? (
                <>
                  {alerts.map((a, i) => (
                    <button
                      key={i}
                      type="button"
                      className="notif-item"
                      onClick={() => { nav("/clinical-alerts"); setNotifOpen(false); }}
                    >
                      <Bell
                        size={15}
                        style={{
                          color: a.level === "warning" ? "var(--color-warning)" : "var(--color-info)",
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      />
                      <span style={{ fontSize: "var(--font-body)" }}>{a.text}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="app-dropdown-item"
                    style={{ justifyContent: "center", fontWeight: 700, color: "var(--hospital-primary)", fontSize: "var(--font-caption)" }}
                    onClick={() => { nav("/clinical-alerts"); setNotifOpen(false); }}
                  >
                    View all clinical alerts →
                  </button>
                </>
              ) : (
                <div
                  style={{
                    padding: "var(--space-6) var(--space-4)",
                    textAlign: "center",
                    color: "var(--text-secondary)",
                    fontSize: "var(--font-body)",
                  }}
                >
                  No new notifications
                </div>
              )}
            </div>
          )}
        </div>

        {/* User menu ─────────────────────────────────────────────── */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors"
            style={{ background: "transparent" }}
            onMouseEnter={(e) => e.currentTarget.style.background = "var(--surface-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
            onClick={() => { setMenuOpen((v) => !v); setNotifOpen(false); }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            <div className="app-avatar">{initials}</div>
            <span className="hidden sm:block text-left">
              <span
                style={{
                  display: "block",
                  fontSize: "var(--font-caption)",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  whiteSpace: "nowrap",
                  maxWidth: 120,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {session?.name || "User"}
              </span>
              <span
                style={{
                  display: "block",
                  fontSize: "var(--font-label)",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                }}
              >
                {session?.role || "Staff"}
              </span>
            </span>
            <ChevronDown size={13} style={{ color: "var(--text-secondary)", flexShrink: 0 }} className="hidden sm:block" />
          </button>

          {menuOpen && (
            <div
              className="app-dropdown animate-fade-in"
              style={{ minWidth: 180, right: 0, top: "calc(100% + 6px)" }}
              role="menu"
            >
              {/* User info */}
              <div className="app-dropdown-header">
                <div style={{ fontWeight: 700, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>
                  {session?.name || "User"}
                </div>
                <div style={{ fontSize: "var(--font-label)", color: "var(--text-secondary)", marginTop: 2 }}>
                  {session?.role || "Staff"}
                </div>
              </div>

              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); nav("/profile"); }}
              >
                <User size={15} />
                Profile
              </button>

              <button
                type="button"
                className="app-dropdown-item"
                role="menuitem"
                onClick={() => { setMenuOpen(false); nav("/settings"); }}
              >
                <Settings size={15} />
                Settings
              </button>

              <div style={{ height: 1, background: "var(--border)", margin: "var(--space-1) 0" }} />

              <button
                type="button"
                className="app-dropdown-item danger"
                role="menuitem"
                onClick={() => { signOut(); nav("/login", { replace: true }); }}
              >
                <LogOut size={15} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
