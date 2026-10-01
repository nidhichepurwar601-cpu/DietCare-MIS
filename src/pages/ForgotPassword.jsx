import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { resetPassword } from "../lib/auth.js";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("admin@example.com");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = (e) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!password || password.length < 6)
      return setError("Use a password with at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    const result = resetPassword(email, password);
    if (!result.ok) return setError(result.message);
    setMessage("Password updated. You can sign in now.");
    setTimeout(() => navigate("/login"), 600);
  };

  return (
    <div className="auth-screen">
      <div className="auth-card" style={{ maxWidth: 480, gridTemplateColumns: "1fr" }}>
        <div className="auth-form">
          <div className="auth-mark" aria-hidden="true">
            D
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Reset password</h1>
          <p className="mt-2 text-sm text-gray-500">
            Update your demo account password.
          </p>
          <form onSubmit={submit} className="mt-6 space-y-4">
            <Field label="Email address" value={email} onChange={setEmail} />
            <Field
              label="New password"
              type="password"
              value={password}
              onChange={setPassword}
            />
            <Field
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={setConfirm}
            />
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">
                {message}
              </div>
            )}
            <button className="auth-submit" type="submit">
              Reset password
            </button>
            <p className="text-center text-sm text-gray-500">
              <Link className="auth-link" to="/login">
                Back to sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
      {label}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="auth-input mt-1"
      />
    </label>
  );
}
