/* ============================================================
   DietCare HIS — Theme Preferences Engine
   Persists user prefs to localStorage, applies CSS variables.
   ============================================================ */

const STORAGE_KEY     = "dietcare-theme-prefs";
const LEGACY_THEME    = "theme";
const LEGACY_COMPACT  = "compactUI";

export const PRIMARY_PRESETS = [
  { id: "teal",  label: "Clinical Teal",   value: "#0f766e" },
  { id: "navy",  label: "Hospital Navy",   value: "#1d4ed8" },
  { id: "slate", label: "Slate Blue",      value: "#334155" },
  { id: "green", label: "Ward Green",      value: "#047857" },
  { id: "indigo",label: "Medical Indigo",  value: "#4338ca" },
  { id: "rose",  label: "Clinical Rose",   value: "#be123c" },
];

export const DEFAULT_PREFS = {
  mode:          "light",     // "light" | "dark" | "system"
  primary:       "#0f766e",
  secondary:     "#155e75",
  accent:        "#0d9488",
  sidebar:       "#102a32",
  header:        "#ffffff",
  cardStyle:     "elevated",  // "elevated" | "outlined" | "flat"
  radius:        "10",        // px string
  density:       "compact",   // "compact" | "comfortable"
  fontScale:     "100",       // percent string
  reducedMotion: false,
};

/* ── Color math ──────────────────────────────────────────────── */

function hexToRgb(hex) {
  const val = String(hex || "").replace("#", "");
  const full = val.length === 3
    ? val.split("").map((c) => c + c).join("")
    : val;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return { r: 15, g: 118, b: 110 };
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function hexToHslParts(hex) {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn: h = (gn - bn) / d + (gn < bn ? 6 : 0); break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

/* Lighten a hex color by mixing toward white */
function lightenHex(hex, amount = 0.92) {
  const { r, g, b } = hexToRgb(hex);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

/* Darken a hex color by mixing toward black */
function darkenHex(hex, amount = 0.15) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - amount))}, ${Math.round(g * (1 - amount))}, ${Math.round(b * (1 - amount))})`;
}

/* ── Mode resolution ─────────────────────────────────────────── */

export function resolveMode(mode) {
  if (mode === "dark")  return "dark";
  if (mode === "light") return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

/* ── Persistence ─────────────────────────────────────────────── */

export function loadPrefs() {
  let prefs = { ...DEFAULT_PREFS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      prefs = { ...prefs, ...JSON.parse(raw) };
    } else {
      // Migrate from legacy keys
      const legacyTheme   = localStorage.getItem(LEGACY_THEME);
      const legacyCompact = localStorage.getItem(LEGACY_COMPACT);
      if (legacyTheme === "dark" || legacyTheme === "light") {
        prefs.mode = legacyTheme;
      }
      if (legacyCompact !== null) {
        prefs.density = legacyCompact === "true" ? "compact" : "comfortable";
      }
    }
  } catch {
    /* use defaults */
  }
  return prefs;
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    // Keep legacy keys in sync for any code that may still read them
    localStorage.setItem(LEGACY_THEME, resolveMode(prefs.mode));
    localStorage.setItem(LEGACY_COMPACT, String(prefs.density !== "comfortable"));
  } catch {
    /* ignore quota errors */
  }
}

/* ── CSS variable application ────────────────────────────────── */

export function applyTheme(prefs) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const resolved = resolveMode(prefs.mode);

  const primary   = prefs.primary   || DEFAULT_PREFS.primary;
  const secondary = prefs.secondary || DEFAULT_PREFS.secondary;
  const accent    = prefs.accent    || DEFAULT_PREFS.accent;
  const sidebar   = prefs.sidebar   || DEFAULT_PREFS.sidebar;
  // In dark mode, a pure-white header becomes the dark surface instead
  const header = resolved === "dark" && (prefs.header === "#ffffff" || !prefs.header)
    ? "#151b22"
    : (prefs.header || DEFAULT_PREFS.header);

  const radius = `${Number(prefs.radius) || 10}px`;

  // ── Data attributes ────────────────────────────────────────
  root.setAttribute("data-theme", resolved);
  root.setAttribute("data-theme-mode", prefs.mode || "light");
  root.setAttribute("data-card-style", prefs.cardStyle || "elevated");
  root.setAttribute("data-density", prefs.density || "compact");

  // ── Computed color scales from primary ────────────────────
  const primarySoft  = resolved === "dark"
    ? `color-mix(in srgb, ${primary} 16%, #182228)`
    : lightenHex(primary, 0.93);
  const primaryDark  = darkenHex(primary, 0.12);
  const primaryLight = lightenHex(primary, 0.25);

  // ── CSS variable writes ────────────────────────────────────
  const set = (prop, val) => root.style.setProperty(prop, val);

  set("--color-primary-hex",    primary);
  set("--color-secondary-hex",  secondary);
  set("--color-accent-hex",     accent);
  set("--color-sidebar-hex",    sidebar);
  set("--color-header-hex",     header);

  // Hospital semantic aliases driven by primary color
  set("--hospital-primary",       primary);
  set("--hospital-primary-dark",  primaryDark);
  set("--hospital-primary-light", primaryLight);
  set("--hospital-primary-soft",  primarySoft);
  set("--hospital-accent",        accent);
  set("--hospital-radius",        radius);

  // Radius token cascade
  set("--radius",    radius);
  set("--radius-sm", `${Math.max(4, Number(prefs.radius) - 3)}px`);
  set("--radius-lg", `${Number(prefs.radius) + 4}px`);
  set("--radius-xl", `${Number(prefs.radius) + 8}px`);

  // Tailwind HSL bridge for primary + sidebar
  set("--primary", hexToHslParts(primary));
  set("--sidebar", hexToHslParts(sidebar));
  set("--sidebar-primary", hexToHslParts(primary));

  // Density adjustments
  if (prefs.density === "comfortable") {
    set("--control-height", "42px");
    set("--page-padding",   "1.5rem");
    set("--header-height",  "56px");
  } else {
    set("--control-height", "38px");
    set("--page-padding",   "1.25rem");
    set("--header-height",  "52px");
  }

  // Font scale
  set("--font-scale", String((Number(prefs.fontScale) || 100) / 100));

  // Reduced motion
  if (prefs.reducedMotion) {
    root.setAttribute("data-reduced-motion", "true");
  } else {
    root.removeAttribute("data-reduced-motion");
  }

  // Compact body class (used by some Tailwind utilities)
  document.body.classList.toggle("compact-ui", prefs.density !== "comfortable");
}

// Apply immediately on module load so there's no flash of unstyled theme
if (typeof document !== "undefined") {
  applyTheme(loadPrefs());
}
