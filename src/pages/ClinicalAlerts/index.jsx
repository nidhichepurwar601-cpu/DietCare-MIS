import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import {
  ShieldAlert,
  Search,
  AlertTriangle,
  CheckCircle,
  Eye,
  Download,
} from "lucide-react";
import { getStore, setStore, KEYS, getLocalDateKey } from "../../lib/storage.js";
import { buildClinicalAlerts } from "../../lib/clinicalAlerts.js";
import {
  Modal,
  Toast,
  exportCsv,
  EmptyState,
} from "../../components/common/MvpTools.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";

const ACK = "hd_ack_alerts";
export default function ClinicalAlerts({ embedded = false } = {}) {
  const [search, setSearch] = useState(""),
    [severity, setSeverity] = useState("All"),
    [ack, setAck] = useState(() => getStore(ACK, [])),
    [showAcknowledged, setShowAcknowledged] = useState(false),
    [storeVersion, setStoreVersion] = useState(0),
    [selected, setSelected] = useState(null),
    [toast, setToast] = useState("");
  // LIVE STORE SYNC: clinical alerts regenerate when patient information changes.
  useEffect(() => {
    const refresh = () => setStoreVersion((version) => version + 1);
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => { window.removeEventListener("dietcare-store-updated", refresh); window.removeEventListener("storage", refresh); };
  }, []);
  const patients = getStore(KEYS.PATIENTS, []);
  const plans = getStore("hd_diet_plans", []);
  const workflows = getStore("hd_diet_workflow", []);
  const mealStatus = getStore("hd_meal_status", {});
  const today = getLocalDateKey();
  const alerts = useMemo(
    () =>
      patients.flatMap((patient) => {
        const plan = plans.find((p) => String(p.patientId) === String(patient.id) && String(p.status).toLowerCase() === "approved") || plans.find((p) => String(p.patientId) === String(patient.id));
        const workflow = workflows.find((f) => String(f.patientId) === String(patient.id));
        const intake = getStore(`hd_meal_intake_${patient.id}_${today}`, null);
        return buildClinicalAlerts({ patient, plan, workflow, intake, mealStatus }).map((alert) => ({ ...alert, patient }));
      }),
    [patients, plans, workflows, mealStatus, today, storeVersion],
  );
  const rows = alerts.filter(
    (a) =>
      (severity === "All" || a.severity === severity) &&
      (showAcknowledged || !ack.includes(a.id)) &&
      [a.patient.name, String(a.patient.id), a.message, a.type]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const high = alerts.filter(
    (a) => a.severity === "High" && !ack.includes(a.id),
  ).length;
  const toggle = (a) => {
    const n = ack.includes(a.id)
      ? ack.filter((x) => x !== a.id)
      : [...ack, a.id];
    setAck(n);
    setStore(ACK, n);
    setToast(ack.includes(a.id) ? "Alert reopened." : "Alert acknowledged.");
  };
  const content = (
    <>
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="clinical-alerts-page space-y-5">
        {/* ── Summary stat cards ─────────────────────────────── */}
        <section className="grid gap-4 sm:grid-cols-3">
          <div className="hospital-stat-card">
            <div>
              <p className="hospital-stat-label">Total Alerts</p>
              <p className="hospital-stat-value">{alerts.length}</p>
            </div>
            <div className="hospital-stat-icon"><ShieldAlert size={20} /></div>
          </div>
          <div className="hospital-stat-card" style={{ "--stat-icon-color": "var(--color-error)" }}>
            <div>
              <p className="hospital-stat-label">High Priority</p>
              <p className="hospital-stat-value" style={{ color: high > 0 ? "var(--color-error)" : undefined }}>{high}</p>
            </div>
            <div className="hospital-stat-icon" style={{ background: "var(--color-error-soft)", color: "var(--color-error)" }}><AlertTriangle size={20} /></div>
          </div>
          <div className="hospital-stat-card">
            <div>
              <p className="hospital-stat-label">Acknowledged</p>
              <p className="hospital-stat-value" style={{ color: "var(--color-success)" }}>{ack.length}</p>
            </div>
            <div className="hospital-stat-icon" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}><CheckCircle size={20} /></div>
          </div>
        </section>

        {/* ── Alerts table ───────────────────────────────────── */}
        <section className="hospital-card">
          <div className="hospital-card-header">
            <div>
              <h3 className="hospital-card-title">Active Clinical Alerts</h3>
              <p className="hospital-card-subtitle">Patient dietary safety information.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-[10px] top-1/2 -translate-y-1/2 text-secondary pointer-events-none" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="hospital-input pl-8 w-[220px]" placeholder="Search patient, ID or alert" />
              </div>
              <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="hospital-select w-auto">
                <option>All</option>
                <option>High</option>
                <option>Medium</option>
              </select>
              <label className="inline-flex items-center gap-2 text-caption text-secondary cursor-pointer px-2">
                <input type="checkbox" checked={showAcknowledged} onChange={(e) => setShowAcknowledged(e.target.checked)} />
                Show acknowledged
              </label>
              <button onClick={() => exportCsv("clinical-alerts.csv", rows.map((a) => ({ Priority: a.severity, Type: a.type, Patient: a.patient.name, ID: a.patient.id, Ward: a.patient.ward, Information: a.message, Acknowledged: ack.includes(a.id) ? "Yes" : "No" })))} className="hospital-button hospital-button-secondary hospital-button-sm">
                <Download size={14} /> Export
              </button>
            </div>
          </div>
          <DataTable
            columns={[
              {
                key: "priority",
                label: "Priority",
                render: (a) => (
                  <span className={`hospital-status ${a.severity === "High" ? "hospital-status-danger" : "hospital-status-pending"}`}>
                    {a.severity}
                  </span>
                ),
              },
              {
                key: "type",
                label: "Alert Type",
                render: (a) => <div className="font-semibold text-body text-primary">{a.type}</div>,
              },
              {
                key: "patient",
                label: "Patient",
                render: (a) => (
                  <div>
                    <div className="font-semibold text-body text-primary">{a.patient.name}</div>
                    <div className="text-caption text-secondary">ID: {a.patient.id}</div>
                  </div>
                ),
              },
              {
                key: "wardBed",
                label: "Ward / Bed",
                render: (a) => <div className="text-body text-secondary">{a.patient.ward || "—"} / {a.patient.bedNo || a.patient.bed || "—"}</div>,
              },
              {
                key: "info",
                label: "Clinical Information",
                render: (a) => <div className="text-body text-primary">{a.message}</div>,
              },
              {
                key: "actions",
                label: "",
                sortable: false,
                className: "text-right",
                render: (a) => (
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setSelected(a)} className="icon-btn min-w-[30px] min-h-[30px]"><Eye size={14} /></button>
                    <button
                      onClick={() => toggle(a)}
                      className={`hospital-button hospital-button-sm ${ack.includes(a.id) ? "hospital-button-secondary" : "hospital-button-outline-primary"}`}
                    >
                      {ack.includes(a.id) ? "Reopen" : "Acknowledge"}
                    </button>
                  </div>
                ),
              },
            ]}
            data={rows}
            pagination={10}
            emptyMessage="No alerts match the selected filters."
            emptyDescription="You can adjust your search criteria or acknowledge status."
          />
        </section>
      </div>
      {selected && (
        <Modal title="Clinical Alert Details" onClose={() => setSelected(null)}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", fontSize: "var(--font-body)", color: "var(--text-primary)" }}>
            <div><strong>Patient:</strong> {selected.patient.name} (ID: {selected.patient.id})</div>
            <div><strong>Alert:</strong> {selected.type}</div>
            <div><strong>Priority:</strong> {selected.severity}</div>
            <div><strong>Ward / Bed:</strong> {selected.patient.ward} / {selected.patient.bedNo || selected.patient.bed}</div>
            <div>
              <strong>Clinical Information:</strong>
              <p style={{ marginTop: "var(--space-2)", background: "var(--bg-secondary)", borderRadius: "var(--radius-sm)", padding: "var(--space-3)", color: "var(--text-secondary)" }}>{selected.message}</p>
            </div>
          </div>
        </Modal>
      )}
    </>
  );

  if (embedded) return content;
  return (
    <AppLayout title="Clinical Alerts">
      <HospitalPage
        title="Clinical Alerts"
        description="Monitor and manage patient dietary safety information and alerts."
      >
        {content}
      </HospitalPage>
    </AppLayout>
  );
}
