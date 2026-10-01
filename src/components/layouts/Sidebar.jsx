import React, { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Settings, Stethoscope, UserCircle, LogOut, User, ChevronRight } from "lucide-react";
import { getCurrentRole, hasPermission } from "../../lib/permissions.js";
import { getSession, signOut } from "../../lib/auth.js";
import { NAV_GROUPS, NAV_ITEMS } from "../../config/navigation.js";
import { useAppLayout } from "./layoutContext.js";

export default function Sidebar({ variant = "desktop" }) {
  const isMobile = variant === "mobile";
  const { mobileNavOpen, setMobileNavOpen } = useAppLayout();
  const [expanded, setExpanded]  = useState(isMobile);
  const [pinned, setPinned]      = useState(() => {
    try { return JSON.parse(localStorage.getItem("sidebarPinned")) || false; }
    catch { return false; }
  });
  const [, setPermV]   = useState(0);
  const [popupFor, setPopupFor] = useState(null); // "Profile" | "Settings" | null
  const closeTimer  = useRef(null);
  const popupRef    = useRef(null);
  const navigate    = useNavigate();

  /* ── Persist pin state ─────────────────────────────────────── */
  useEffect(() => {
    try { localStorage.setItem("sidebarPinned", JSON.stringify(pinned)); }
    catch {}
  }, [pinned]);

  useEffect(() => {
    if (!isMobile) setExpanded(!!pinned);
  }, [pinned, isMobile]);

  /* ── Permission refresh ────────────────────────────────────── */
  useEffect(() => {
    const refresh = () => setPermV((v) => v + 1);
    window.addEventListener("permissions-updated", refresh);
    window.addEventListener("auth-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("permissions-updated", refresh);
      window.removeEventListener("auth-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  /* ── Close popup on outside click ─────────────────────────── */
  useEffect(() => {
    const onDoc = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopupFor(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const isVisible = isMobile ? mobileNavOpen : true;
  if (isMobile && !isVisible) return null;

  const role = getCurrentRole();
  const session = (() => {
    try { return getSession(); } catch { return null; }
  })();

  const visibleNav = NAV_ITEMS.filter((item) => {
    const perms = item.permissions || [item.permission];
    return perms.some((p) => hasPermission(role, p));
  });

  const isExpanded = isMobile || expanded || pinned;

  const closeMobile = () => {
    if (isMobile) setMobileNavOpen(false);
  };

  /* ── Popup helpers ─────────────────────────────────────────── */
  const openPopup  = (name) => { clearTimeout(closeTimer.current); setPopupFor(name); };
  const startClose = () => { closeTimer.current = setTimeout(() => setPopupFor(null), 160); };

  /* ── Toggle pin on non-interactive sidebar click ───────────── */
  const handleAsideClick = (e) => {
    if (isMobile) return;
    if (e.target.closest("a,button,input,[role='button']")) return;
    setPinned((p) => { const next = !p; setExpanded(next); return next; });
  };

  /* ── Popup content ─────────────────────────────────────────── */
  const renderPopup = (name) => (
    <div
      onMouseEnter={() => openPopup(name)}
      onMouseLeave={startClose}
      style={{
        position: "absolute",
        left: "calc(100% + 8px)",
        bottom: 0,
        minWidth: 180,
        background: "var(--surface-overlay)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        boxShadow: "var(--shadow-lg)",
        zIndex: "var(--z-overlay)",
        overflow: "hidden",
      }}
      className="animate-fade-in"
    >
      {/* Header */}
      <div style={{
        padding: "var(--space-3) var(--space-4)",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-secondary)",
      }}>
        <div style={{ fontWeight: 700, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>
          {name === "Profile" ? (session?.name || "User") : "Settings"}
        </div>
        {name === "Profile" && (
          <div style={{ fontSize: "var(--font-label)", color: "var(--text-secondary)", marginTop: 2 }}>
            {session?.role || "Staff"}
          </div>
        )}
      </div>

      {name === "Profile" ? (
        <>
          <button
            type="button"
            className="app-dropdown-item"
            onClick={() => { setPopupFor(null); closeMobile(); navigate("/profile"); }}
          >
            <User size={14} /> View Profile
          </button>
          <div style={{ height: 1, background: "var(--border)" }} />
          <button
            type="button"
            className="app-dropdown-item danger"
            onClick={() => { signOut(); setPopupFor(null); closeMobile(); navigate("/login", { replace: true }); }}
          >
            <LogOut size={14} /> Sign out
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="app-dropdown-item"
            onClick={() => { setPopupFor(null); closeMobile(); navigate("/settings"); }}
          >
            <Settings size={14} /> App Preferences
          </button>
          <button
            type="button"
            className="app-dropdown-item"
            onClick={() => { setPopupFor(null); closeMobile(); navigate("/settings"); }}
          >
            <ChevronRight size={14} /> Theme
          </button>
        </>
      )}
    </div>
  );

  const BOTTOM_ITEMS = [
    { name: "Profile",  Icon: UserCircle },
    { name: "Settings", Icon: Settings   },
  ];

  return (
    <aside
      onClick={handleAsideClick}
      onMouseEnter={() => !isMobile && !pinned && setExpanded(true)}
      onMouseLeave={() => !isMobile && !pinned && setExpanded(false)}
      className={`bg-sidebar text-sidebar-foreground flex shrink-0 flex-col print-hide transition-all duration-150 ${
        isMobile
          ? "app-sidebar-mobile fixed inset-y-0 left-0 z-40 w-56 shadow-xl"
          : `app-sidebar-desktop ${isExpanded ? "w-48" : "w-14"}`
      }`}
      style={{ minHeight: "100vh" }}
      aria-label="Primary navigation"
    >
      {/* ── Brand / toggle ───────────────────────────────────── */}
      <div
        className="flex h-[52px] shrink-0 cursor-pointer items-center gap-3 px-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        title={isMobile ? "Close menu" : pinned ? "Unpin sidebar" : "Pin sidebar open"}
        onClick={() => {
          if (isMobile) { setMobileNavOpen(false); return; }
          setPinned((p) => { const next = !p; setExpanded(next); return next; });
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (isMobile) setMobileNavOpen(false);
          }
        }}
      >
        <Stethoscope
          size={22}
          style={{ color: "var(--hospital-primary-light, #5eead4)", flexShrink: 0 }}
        />
        {isExpanded && (
          <span style={{ fontSize: "var(--font-body)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>
            DietCare MIS
          </span>
        )}
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <nav
        className={`flex flex-1 flex-col gap-0.5 overflow-y-auto py-3 ${
          isExpanded ? "items-start px-2" : "items-center"
        }`}
        aria-label="Main navigation"
      >
        {NAV_GROUPS.map((group) => {
          const items = visibleNav.filter((item) => item.group === group);
          if (!items.length) return null;

          return (
            <React.Fragment key={group}>
              {isExpanded && (
                <div className="sidebar-group-label">{group}</div>
              )}
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  title={!isExpanded ? item.name : undefined}
                  onClick={closeMobile}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg cursor-pointer transition-colors ${
                      isExpanded ? "w-full h-10 px-3" : "h-10 w-10 justify-center"
                    } ${
                      isActive
                        ? "bg-sidebar-primary text-white"
                        : "text-sidebar-foreground hover:bg-sidebar-accent"
                    }`
                  }
                  style={({ isActive }) => isActive
                    ? { background: "var(--hospital-primary)", color: "#fff" }
                    : undefined
                  }
                >
                  <item.icon size={18} style={{ flexShrink: 0 }} />
                  {isExpanded && (
                    <span style={{ fontSize: "var(--font-body)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {item.name}
                    </span>
                  )}
                </NavLink>
              ))}
            </React.Fragment>
          );
        })}
      </nav>

      {/* ── Bottom items: Profile + Settings ─────────────────── */}
      <div
        ref={popupRef}
        className={`flex flex-col gap-0.5 pb-3 pt-2 ${
          isExpanded ? "items-start px-2" : "items-center"
        }`}
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        {BOTTOM_ITEMS.map(({ name, Icon }) => (
          <div key={name} className="relative w-full">
            <button
              type="button"
              title={!isExpanded ? name : undefined}
              onMouseEnter={() => openPopup(name)}
              onMouseLeave={startClose}
              onClick={() => setPopupFor((v) => v === name ? null : name)}
              className={`flex items-center gap-3 rounded-lg cursor-pointer transition-colors w-full ${
                isExpanded ? "h-10 px-3 justify-start" : "h-10 w-10 justify-center"
              }`}
              style={{
                background: popupFor === name ? "rgba(255,255,255,0.09)" : "transparent",
                color: "rgba(255,255,255,0.7)",
                border: "none",
              }}
              onFocus={() => openPopup(name)}
            >
              <Icon size={18} style={{ flexShrink: 0 }} />
              {isExpanded && (
                <span style={{ fontSize: "var(--font-body)", whiteSpace: "nowrap" }}>{name}</span>
              )}
            </button>

            {popupFor === name && renderPopup(name)}
          </div>
        ))}
      </div>
    </aside>
  );
}
