import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signUp } from "../lib/auth.js";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    setError("");
    if (!form.name || !form.email || !form.password)
      return setError("Please complete all fields.");
    if (form.password !== form.confirm)
      return setError("Passwords do not match.");
    if (form.password.length < 6)
      return setError("Password must be at least 6 characters.");
    const result = signUp(form);
    if (!result.ok) return setError(result.message);
    navigate("/");
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-visual">
          <div>
            <div className="text-2xl font-bold">DietCare MIS</div>
            <p className="mt-2 text-sm text-white/85">
              Create a workspace account for dietitians, kitchen and delivery
              staff.
            </p>
          </div>
        </div>
        <div className="auth-form">
          <div className="auth-mark" aria-hidden="true">
            D
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Create account</h1>
          <p className="mt-2 text-sm text-gray-500">
            Set up a DietCare MIS account to continue.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field
              label="Full name"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              placeholder="Dr. Jane Smith"
            />
            <Field
              label="Email address"
              type="email"
              value={form.email}
              onChange={(v) => setForm({ ...form, email: v })}
              placeholder="name@example.com"
            />
            <Field
              label="Password"
              type="password"
              value={form.password}
              onChange={(v) => setForm({ ...form, password: v })}
              placeholder="Minimum 6 characters"
            />
            <Field
              label="Confirm password"
              type="password"
              value={form.confirm}
              onChange={(v) => setForm({ ...form, confirm: v })}
              placeholder="Repeat your password"
            />
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
            <button className="auth-submit" type="submit">
              Create account
            </button>
            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link className="auth-link" to="/login">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, placeholder }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="auth-input mt-1"
      />
    </label>
  );
}
