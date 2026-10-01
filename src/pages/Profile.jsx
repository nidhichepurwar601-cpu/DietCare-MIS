import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppLayout from "../components/layouts/AppLayout.jsx";
import { getSession, updateProfile } from "../lib/auth.js";

import HospitalPage from "../components/common/HospitalPage.jsx";

export default function Profile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    try {
      setUser(getSession());
    } catch {}
  }, []);

  const onSave = () => {
    setError("");
    setSaved("");
    const result = updateProfile(user);
    if (!result.ok) return setError(result.message);
    setUser(result.user);
    setSaved("Profile saved.");
  };

  return (
    <AppLayout>
      <HospitalPage
        title="My Profile"
        description="Manage your account details and preferences."
      >
        <div className="max-w-xl">
          <section className="hospital-card">
            <div className="hospital-card-header">
              <h2 className="hospital-card-title">Profile Settings</h2>
            </div>
            <div className="hospital-card-body">
              {user ? (
                <div className="space-y-4">
                  <div className="hospital-field">
                    <label className="hospital-label" htmlFor="profile-name">
                      Name
                    </label>
                    <input
                      id="profile-name"
                      className="hospital-input"
                      value={user.name}
                      onChange={(e) => setUser((s) => ({ ...s, name: e.target.value }))}
                    />
                  </div>
                  <div className="hospital-field">
                    <label className="hospital-label" htmlFor="profile-email">
                      Email
                    </label>
                    <input
                      id="profile-email"
                      className="hospital-input"
                      value={user.email}
                      onChange={(e) =>
                        setUser((s) => ({ ...s, email: e.target.value }))
                      }
                    />
                  </div>
                  <div className="hospital-field">
                    <label className="hospital-label" htmlFor="profile-role">
                      Role
                    </label>
                    <input
                      id="profile-role"
                      className="hospital-input bg-slate-50 cursor-not-allowed"
                      value={user.role}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                  {error && (
                    <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                      {error}
                    </div>
                  )}
                  {saved && (
                    <div className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status">
                      {saved}
                    </div>
                  )}
                  <div className="flex justify-end gap-2 pt-2 border-t border-border">
                    <button className="hospital-button hospital-button-secondary" type="button" onClick={() => navigate(-1)}>
                      Cancel
                    </button>
                    <button className="hospital-button" type="button" onClick={onSave}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-600">
                  Your session has expired. Please sign in again.
                </div>
              )}
            </div>
          </section>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
