/**
 * Demo authentication helpers. Account records stay in memory; only the active
 * session is persisted until the authentication API is connected.
 */
const SESSION_KEY = "app_user";

const DEFAULT_ACCOUNTS = [
  {
    id: 1,
    name: "Dr. Admin",
    email: "admin@example.com",
    password: "admin123",
    role: "System Admin",
  },
  {
    id: 2,
    name: "Kitchen Staff",
    email: "kitchen@example.com",
    password: "kitchen123",
    role: "Kitchen Staff",
  },
  {
    id: 3,
    name: "Delivery Staff",
    email: "delivery@example.com",
    password: "delivery123",
    role: "Delivery Staff",
  },
];

let accounts = DEFAULT_ACCOUNTS.map((account) => ({ ...account }));

function readAccounts() {
  return accounts.map((account) => ({ ...account }));
}

function writeAccounts(nextAccounts) {
  accounts = nextAccounts.map((account) => ({ ...account }));
}

function isSession(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      value.id !== undefined &&
      String(value.name || "").trim() &&
      String(value.email || "").trim() &&
      String(value.role || "").trim(),
  );
}

export function getSession() {
  try {
    for (const storage of [localStorage, sessionStorage]) {
      const raw = storage.getItem(SESSION_KEY);
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (isSession(session)) return session;
      storage.removeItem(SESSION_KEY);
    }
  } catch {}
  return null;
}

function saveSession(session, remember = true) {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  (remember ? localStorage : sessionStorage).setItem(
    SESSION_KEY,
    JSON.stringify(session),
  );
  window.dispatchEvent(new CustomEvent("auth-updated", { detail: session }));
}

/** Temporary bypass while Login/Signup screens are commented out. */
export function ensureDevAdminSession() {
  if (getSession()) return getSession();
  seedAuthAccounts();
  return signIn("admin@example.com", "admin123", true).user || null;
}

export function seedAuthAccounts() {
  const knownEmails = new Set(
    accounts.map((account) => String(account.email).toLowerCase()),
  );
  accounts = [
    ...accounts,
    ...DEFAULT_ACCOUNTS.filter(
      (account) => !knownEmails.has(String(account.email).toLowerCase()),
    ).map((account) => ({ ...account })),
  ];
}

export function signIn(email, password, remember = true) {
  const normalized = String(email || "").trim().toLowerCase();
  const account = readAccounts().find(
    (item) => String(item.email).toLowerCase() === normalized,
  );
  if (!account) return { ok: false, message: "Account not found. Please sign up first." };
  if (String(account.password) !== String(password)) {
    return { ok: false, message: "Incorrect password." };
  }
  const session = { id: account.id, name: account.name, email: account.email, role: account.role };
  saveSession(session, remember);
  return { ok: true, user: session };
}

export function signUp({ name, email, password, role = "Dietitian" }) {
  const normalized = String(email || "").trim().toLowerCase();
  const accounts = readAccounts();
  if (accounts.some((item) => String(item.email).toLowerCase() === normalized)) {
    return { ok: false, message: "An account with this email already exists." };
  }
  const account = {
    id: Date.now(),
    name: String(name || "DietCare User").trim(),
    email: normalized,
    password: String(password),
    role,
  };
  writeAccounts([...accounts, account]);
  return signIn(account.email, account.password);
}

export function resetPassword(email, newPassword) {
  const normalized = String(email || "").trim().toLowerCase();
  const accounts = readAccounts();
  const index = accounts.findIndex((item) => String(item.email).toLowerCase() === normalized);
  if (index === -1) return { ok: false, message: "No account was found for this email." };
  accounts[index] = { ...accounts[index], password: String(newPassword) };
  writeAccounts(accounts);
  return { ok: true };
}

export function signOut() {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  ["AUTHTOKEN", "UserId", "ClinicId", "ZONEID"].forEach((key) =>
    sessionStorage.removeItem(key),
  );
  window.dispatchEvent(new CustomEvent("auth-updated"));
}

export function updateProfile({ name, email } = {}) {
  const current = getSession();
  if (!current) return { ok: false, message: "Your session has expired. Please sign in again." };

  const nextName = String(name || "").trim();
  const nextEmail = String(email || "").trim().toLowerCase();
  if (!nextName) return { ok: false, message: "Name is required." };
  if (!/^\S+@\S+\.\S+$/.test(nextEmail)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const accounts = readAccounts();
  const duplicate = accounts.find(
    (account) =>
      String(account.email).toLowerCase() === nextEmail &&
      String(account.id) !== String(current.id),
  );
  if (duplicate) return { ok: false, message: "That email is already in use." };

  const updatedAccount = accounts.find(
    (account) => String(account.id) === String(current.id),
  );
  if (!updatedAccount) return { ok: false, message: "Account not found." };

  writeAccounts(
    accounts.map((account) =>
      String(account.id) === String(current.id)
        ? { ...account, name: nextName, email: nextEmail }
        : account,
    ),
  );
  const nextSession = { ...current, name: nextName, email: nextEmail };
  const remembered = Boolean(localStorage.getItem(SESSION_KEY));
  saveSession(nextSession, remembered);
  return { ok: true, user: nextSession };
}
