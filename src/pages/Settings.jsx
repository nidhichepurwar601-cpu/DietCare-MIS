import React from "react";
import AppLayout from "../components/layouts/AppLayout.jsx";
import { PRIMARY_PRESETS } from "../theme/themePrefs.js";
import { useTheme } from "../theme/ThemeProvider.jsx";
import HospitalPage, { HospitalCard } from "../components/common/HospitalPage.jsx";
import { Settings as SettingsIcon, Palette, LayoutTemplate, Accessibility, RotateCcw } from "lucide-react";

export default function Settings() {
  const { prefs, updatePrefs, resetPrefs } = useTheme();

  return (
    <AppLayout>
      <HospitalPage
        eyebrow="System Configuration"
        title="Theme Settings"
        description="Theme and layout preferences apply across DietCare without changing clinical workflows."
      >
        <div className="grid gap-5 md:grid-cols-2 max-w-5xl">
          {/* ── Theme & Appearance ───────────────────────────────── */}
          <div className="space-y-5">
            <HospitalCard 
              title="Appearance" 
              subtitle="Base color mode for the application interface"
              actions={<Palette size={18} className="text-[var(--hospital-primary)]" />}
            >
              <div className="flex flex-wrap gap-3">
                {["light", "dark", "system"].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={`flex-1 rounded-lg border px-4 py-3 text-sm font-semibold capitalize transition-all ${
                      prefs.mode === mode 
                        ? "border-[var(--hospital-primary)] bg-[var(--hospital-primary-soft)] text-[var(--hospital-primary-dark)] shadow-sm" 
                        : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => updatePrefs({ mode })}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </HospitalCard>

            <HospitalCard 
              title="Brand Colors" 
              subtitle="Primary color palettes and interface accents"
            >
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-semibold text-gray-700 mb-2 block">Primary Identity</label>
                  <div className="flex flex-wrap items-center gap-3">
                    {PRIMARY_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${
                          prefs.primary === preset.value ? "border-gray-800 scale-110 shadow-md" : "border-transparent"
                        }`}
                        style={{ background: preset.value }}
                        aria-label={preset.label}
                        aria-pressed={prefs.primary === preset.value}
                        onClick={() => updatePrefs({ primary: preset.value })}
                        title={preset.label}
                      />
                    ))}
                    <div className="w-px h-6 bg-gray-200 mx-1"></div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-600 cursor-pointer hover:text-gray-900">
                      <input
                        type="color"
                        className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                        value={prefs.primary}
                        onChange={(e) => updatePrefs({ primary: e.target.value })}
                        title="Custom Color"
                      />
                      Custom
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 pt-2">
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Secondary Color</span>
                    <input
                      type="color"
                      className="block h-10 w-full rounded border border-gray-200 cursor-pointer"
                      value={prefs.secondary}
                      onChange={(e) => updatePrefs({ secondary: e.target.value })}
                    />
                  </label>
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Accent Color</span>
                    <input
                      type="color"
                      className="block h-10 w-full rounded border border-gray-200 cursor-pointer"
                      value={prefs.accent}
                      onChange={(e) => updatePrefs({ accent: e.target.value })}
                    />
                  </label>
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Sidebar Background</span>
                    <input
                      type="color"
                      className="block h-10 w-full rounded border border-gray-200 cursor-pointer"
                      value={prefs.sidebar}
                      onChange={(e) => updatePrefs({ sidebar: e.target.value })}
                    />
                  </label>
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Header Background</span>
                    <input
                      type="color"
                      className="block h-10 w-full rounded border border-gray-200 cursor-pointer"
                      value={prefs.header}
                      onChange={(e) => updatePrefs({ header: e.target.value })}
                    />
                  </label>
                </div>
              </div>
            </HospitalCard>
          </div>

          {/* ── Layout & Accessibility ───────────────────────────── */}
          <div className="space-y-5">
            <HospitalCard 
              title="Layout & Density" 
              subtitle="Control component sizing and spacing"
              actions={<LayoutTemplate size={18} className="text-[var(--hospital-primary)]" />}
            >
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Density</span>
                    <select
                      className="hospital-input"
                      value={prefs.density}
                      onChange={(e) => updatePrefs({ density: e.target.value })}
                    >
                      <option value="compact">Compact (Clinical)</option>
                      <option value="comfortable">Comfortable (Spaced)</option>
                    </select>
                  </label>
                  
                  <label className="text-sm font-semibold text-gray-700 block">
                    <span className="block mb-1.5">Card Style</span>
                    <select
                      className="hospital-input"
                      value={prefs.cardStyle}
                      onChange={(e) => updatePrefs({ cardStyle: e.target.value })}
                    >
                      <option value="elevated">Elevated (Shadow)</option>
                      <option value="outlined">Outlined (Border)</option>
                      <option value="flat">Flat (Subtle)</option>
                    </select>
                  </label>
                </div>

                <label className="text-sm font-semibold text-gray-700 block pt-2">
                  <div className="flex justify-between mb-2">
                    <span>Border Radius</span>
                    <span className="text-[var(--hospital-primary)] font-bold">{prefs.radius}px</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="20"
                    step="2"
                    className="w-full accent-[var(--hospital-primary)]"
                    value={prefs.radius}
                    onChange={(e) => updatePrefs({ radius: e.target.value })}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Square (4px)</span>
                    <span>Round (20px)</span>
                  </div>
                </label>
              </div>
            </HospitalCard>

            <HospitalCard 
              title="Accessibility" 
              subtitle="Adjust reading and motion preferences"
              actions={<Accessibility size={18} className="text-[var(--hospital-primary)]" />}
            >
              <div className="space-y-5">
                <label className="text-sm font-semibold text-gray-700 block">
                  <div className="flex justify-between mb-2">
                    <span>Global Font Scale</span>
                    <span className="text-[var(--hospital-primary)] font-bold">{prefs.fontScale}%</span>
                  </div>
                  <input
                    type="range"
                    min="90"
                    max="120"
                    step="5"
                    className="w-full accent-[var(--hospital-primary)]"
                    value={prefs.fontScale}
                    onChange={(e) => updatePrefs({ fontScale: e.target.value })}
                  />
                  <div className="flex justify-between text-xs text-gray-400 mt-1">
                    <span>Smaller</span>
                    <span>Default</span>
                    <span>Larger</span>
                  </div>
                </label>
                
                <label className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer">
                  <div>
                    <span className="text-sm font-semibold text-gray-900 block">Reduced Motion</span>
                    <span className="text-xs text-gray-500">Minimize animations and transitions</span>
                  </div>
                  <input
                    type="checkbox"
                    className="w-4 h-4 text-[var(--hospital-primary)] rounded border-gray-300 focus:ring-[var(--hospital-primary)]"
                    checked={!!prefs.reducedMotion}
                    onChange={(e) => updatePrefs({ reducedMotion: e.target.checked })}
                  />
                </label>
              </div>
            </HospitalCard>

            <div className="flex justify-end pt-2">
              <button 
                type="button" 
                className="hospital-btn hospital-btn-secondary" 
                onClick={resetPrefs}
              >
                <RotateCcw size={16} />
                Reset to hospital defaults
              </button>
            </div>
          </div>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
