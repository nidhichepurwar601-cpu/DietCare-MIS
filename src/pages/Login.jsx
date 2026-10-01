import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Stethoscope, ArrowRight } from "lucide-react";
import { signIn } from "../lib/auth.js";

export default function Login() {
  const nav = useNavigate();
  const [form, setForm]       = useState({ email: "", password: "", remember: true });
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const onChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((p) => ({ ...p, [name]: type === "checkbox" ? checked : value }));
    setError("");
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email.trim() || !form.password) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = signIn(form.email, form.password, form.remember);
      if (result.ok) {
        nav("/", { replace: true });
      } else {
        setError(result.message || "Sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        {/* ── Visual panel (desktop only) ─────────────────────── */}
        <div className="auth-visual" aria-hidden="true">
          <div style={{ marginBottom: "auto" }}>
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              background: "rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
              padding: "10px 16px",
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.2)",
            }}>
              <Stethoscope size={20} style={{ color: "#5eead4" }} />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>DietCare MIS</span>
            </div>
          </div>
          <div>
            <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 8 }}>
              Hospital Dietary Management
            </p>
            <h2 style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.2, margin: "0 0 12px", color: "#fff" }}>
              Nutrition-driven<br />patient care
            </h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.75)", lineHeight: 1.6, margin: 0 }}>
              A complete dietary workflow system for clinical teams — from diet planning and kitchen operations to bedside meal delivery.
            </p>
          </div>
        </div>

        {/* ── Form panel ──────────────────────────────────────── */}
        <div className="auth-form">
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
            <div className="auth-mark">
              <Stethoscope size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--text-primary)" }}>DietCare MIS</div>
              <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>Hospital Dietary Management</div>
            </div>
          </div>

          <h1 style={{ fontSize: 22, fontWeight: 800, color: "var(--text-primary)", margin: "0 0 4px" }}>
            Sign in to your account
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "0 0 28px" }}>
            Enter your credentials to access the dietary management system.
          </p>

          {/* Error banner */}
          {error && (
            <div
              className="hospital-alert hospital-alert-error"
              style={{ marginBottom: 20, borderRadius: "var(--radius-sm)" }}
              role="alert"
            >
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} noValidate style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                style={{ display: "block", fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)", marginBottom: 6 }}
              >
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                name="email"
                value={form.email}
                onChange={onChange}
                placeholder="admin@hospital.com"
                className="auth-input"
                autoComplete="email"
                required
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <label
                  htmlFor="login-password"
                  style={{ fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-secondary)" }}
                >
                  Password
                </label>
                <Link to="/forgot-password" className="auth-link" style={{ fontSize: 12 }}>
                  Forgot password?
                </Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPw ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={onChange}
                  placeholder="••••••••"
                  className="auth-input"
                  autoComplete="current-password"
                  required
                  style={{ paddingRight: 44 }}
                />
                <button
                  type="button"
                  aria-label={showPw ? "Hide password" : "Show password"}
                  onClick={() => setShowPw((v) => !v)}
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                name="remember"
                checked={form.remember}
                onChange={onChange}
                style={{ accentColor: "var(--hospital-primary)", width: 15, height: 15 }}
              />
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>Keep me signed in</span>
            </label>

            {/* Submit */}
            <button
              type="submit"
              className="auth-submit"
              disabled={loading}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}
            >
              {loading ? (
                <>
                  <div className="app-boot-spinner" style={{ width: 16, height: 16 }} />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* Demo credentials hint */}
          <div
            style={{
              marginTop: 28,
              padding: "12px 14px",
              borderRadius: "var(--radius-sm)",
              background: "var(--hospital-primary-soft)",
              border: "1px solid var(--color-info-border)",
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--hospital-primary)", marginBottom: 6 }}>
              Demo credentials
            </p>
            {[
              { label: "Admin",   email: "admin@example.com",    pw: "admin123" },
              { label: "Kitchen", email: "kitchen@example.com",   pw: "kitchen123" },
              { label: "Delivery",email: "delivery@example.com",  pw: "delivery123" },
            ].map(({ label, email, pw }) => (
              <button
                key={email}
                type="button"
                onClick={() => { setForm({ email, password: pw, remember: true }); setError(""); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "4px 0",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                <strong style={{ color: "var(--text-primary)" }}>{label}:</strong>{" "}
                {email}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
