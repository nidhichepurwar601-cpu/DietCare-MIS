import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import {
  Users, ClipboardCheck, Clock3, ShieldAlert, UtensilsCrossed,
  Building2, ArrowRight, Activity, TrendingUp, CheckCircle2,
} from "lucide-react";
import {
  getStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import { buildClinicalAlerts } from "../../lib/clinicalAlerts.js";
import HospitalPage, { HospitalCard, StatCard } from "../../components/common/HospitalPage.jsx";

/* ── Inline progress bar ─────────────────────────────────────── */
function ProgressBar({ value, max, color = "var(--hospital-primary)" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="hospital-progress" style={{ marginTop: "var(--space-2)" }}>
      <div className="hospital-progress-fill" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/* ── Meal period card ─────────────────────────────────────────── */
function MealPeriodCard({ meal, total, completed }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div
      style={{
        padding: "var(--space-4)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
        background: "var(--surface)",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "var(--font-h1)", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1 }}>
        {total}
      </div>
      <div style={{ fontSize: "var(--font-body)", fontWeight: 600, color: "var(--text-secondary)", marginTop: "var(--space-2)" }}>
        {meal}
      </div>
      <div style={{ fontSize: "var(--font-label)", color: "var(--text-secondary)", marginTop: "var(--space-1)" }}>
        {completed} completed
      </div>
      <ProgressBar value={completed} max={total} color="var(--hospital-primary)" />
    </div>
  );
}

/* ── Row in a summary list ────────────────────────────────────── */
function SummaryRow({ label, value, valueColor }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "var(--space-3) 0",
      borderBottom: "1px solid var(--border)",
    }}>
      <span style={{ fontSize: "var(--font-body)", color: "var(--text-secondary)", fontWeight: 500 }}>{label}</span>
      <strong style={{ fontSize: "var(--font-body)", color: valueColor || "var(--text-primary)" }}>{value}</strong>
    </div>
  );
}

export default function DietaryOperationsDashboard() {
  const [, refresh]     = useState(0);
  const todayDate       = getLocalDateKey();
  const [loading, setLoading] = useState(true);

  /* ── Reactive refresh ─────────────────────────────────────── */
  useEffect(() => {
    const tick = () => refresh((v) => v + 1);
    window.addEventListener("dietcare-store-updated", tick);
    window.addEventListener("storage", tick);
    window.addEventListener("auth-updated", tick);
    
    // Simulate short load for skeleton demonstration
    const t = setTimeout(() => setLoading(false), 400);

    return () => {
      window.removeEventListener("dietcare-store-updated", tick);
      window.removeEventListener("storage", tick);
      window.removeEventListener("auth-updated", tick);
      clearTimeout(t);
    };
  }, []);

  /* ── Data ─────────────────────────────────────────────────── */
  const patients   = getStore(KEYS.PATIENTS) || [];
  const diets      = getStore(KEYS.DIET_TYPES) || [];
  const mealStatus = getStore("hd_meal_status", {}) || {};
  const flows      = getStore("hd_diet_workflow", []) || [];
  const dietPlans  = getStore("hd_diet_plans", []) || [];
  const intakeStatus = getStore("hd_intake_status", {}) || {};

  const plannedIds = new Set(
    flows
      .filter((f) => [
        "Planning", "Assigned", "Approved", "Kitchen Assigned",
        "Preparing", "Prepared", "Delivering", "Dispatched", "Delivered",
      ].includes(f.status))
      .map((f) => String(f.patientId)),
  );

  const active = patients.filter(
    (p) => (p.status || "Active") === "Active" && plannedIds.has(String(p.id)),
  );

  const statusForToday = (store, patientId, meal) =>
    store?.[`${todayDate}-${patientId}-${meal}`] || "Pending";

  const MEALS = ["Breakfast", "Mid-Morning", "Lunch", "Evening Snack", "Dinner", "Bedtime"];

  /* ── Delivery counts ──────────────────────────────────────── */
  const deliveryCounts = ["Delivered", "Prepared", "Delivering", "Preparing", "Pending"].reduce((a, s) => {
    a[s] = active.reduce(
      (n, p) => n + MEALS.filter((m) => statusForToday(mealStatus, p.id, m) === s).length,
      0,
    );
    return a;
  }, {});

  /* ── Intake counts ────────────────────────────────────────── */
  const intakeCounts = ["Taken", "Partially Taken", "Not Taken", "Returned", "Pending"].reduce((a, s) => {
    a[s] = active.reduce(
      (n, p) => n + MEALS.filter((m) => statusForToday(intakeStatus, p.id, m) === s).length,
      0,
    );
    return a;
  }, {});

  /* ── Clinical alerts ──────────────────────────────────────── */
  const clinicalAlerts = patients.flatMap((patient) => {
    const plan = dietPlans.find(
      (p) => String(p.patientId) === String(patient.id) &&
        ["planning", "approved", "active"].includes(String(p.status).toLowerCase()),
    ) || dietPlans.find((p) => String(p.patientId) === String(patient.id));
    const workflow = flows.find((f) => String(f.patientId) === String(patient.id));
    const intake   = getStore(`hd_meal_intake_${patient.id}_${todayDate}`, null);
    return buildClinicalAlerts({ patient, plan, workflow, intake, mealStatus }).map((a) => ({ ...a, patient }));
  });

  const patientAlertMap = new Map();
  clinicalAlerts.forEach((a) => {
    const key = String(a.patient.id);
    if (!patientAlertMap.has(key)) patientAlertMap.set(key, []);
    patientAlertMap.get(key).push(a);
  });

  /* ── Diet distribution rows ───────────────────────────────── */
  const dietRows = useMemo(() => {
    const counts = new Map();
    patients.forEach((patient) => {
      const pid = String(patient.id);
      let dietTypeId = patient.dietTypeId;
      if (!dietTypeId) {
        const wf  = flows.find((f) => String(f.patientId) === pid);
        dietTypeId = wf?.dietTypeId || wf?.dietTemplateId || null;
      }
      if (!dietTypeId) {
        const pl  = dietPlans.find((p) => String(p.patientId) === pid);
        dietTypeId = pl?.dietTypeId || pl?.dietTemplateId || null;
      }
      if (!dietTypeId) return;
      const diet = diets.find((d) => Number(d.id) === Number(dietTypeId));
      if (!diet) return;
      const key = String(diet.id);
      if (!counts.has(key)) counts.set(key, { id: diet.id, name: diet.name, count: 0 });
      counts.get(key).count += 1;
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 6);
  }, [patients, diets, flows, dietPlans]);

  /* ── Ward rows ────────────────────────────────────────────── */
  const wardRows = Object.entries(
    patients.reduce((a, p) => { const w = p.ward || "Unassigned"; a[w] = (a[w] || 0) + 1; return a; }, {}),
  ).slice(0, 6);

  /* ── Attention list ───────────────────────────────────────── */
  const attentionList = patients
    .filter((p) => patientAlertMap.has(String(p.id)))
    .slice(0, 6);

  /* ── Daily snapshot ───────────────────────────────────────── */
  useEffect(() => {
    const existing = getStore(KEYS.DIET_HISTORY, []);
    const existingSnapshots = new Set(
      existing
        .filter((e) => e.type === "daily_snapshot" && e.serviceDate === todayDate)
        .map((e) => String(e.patientId)),
    );
    flows.forEach((flow) => {
      if (existingSnapshots.has(String(flow.patientId))) return;
      const patient = patients.find((p) => String(p.id) === String(flow.patientId));
      if (!patient) return;
      appendHistoryEvent({
        type: "daily_snapshot",
        module: "Dashboard",
        action: "Daily Workflow Snapshot",
        patientId: flow.patientId,
        patientName: patient.name || "",
        dietTypeId: flow.dietTypeId || patient.dietTypeId || null,
        status: flow.status || "Pending Approval",
        serviceDate: todayDate,
      });
    });
  }, [flows.length, patients.length, todayDate]);

  /* ── Progress percentage ──────────────────────────────────── */
  const totalMeals     = active.length * MEALS.length;
  const completedMeals = deliveryCounts.Delivered + deliveryCounts.Prepared;
  const progressPct    = totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

  if (loading) {
    return (
      <AppLayout>
        <HospitalPage
          eyebrow="Operations"
          title="Dietary Operations Dashboard"
          description="Loading live figures..."
        >
          <div className="app-skeleton">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "var(--space-4)" }}>
              {[1, 2, 3, 4, 5, 6].map(i => <div key={i} className="app-skeleton-line xl" />)}
            </div>
            <div className="app-skeleton-line lg" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
              <div className="app-skeleton-line" style={{ height: "300px" }} />
              <div className="app-skeleton-line" style={{ height: "300px" }} />
            </div>
          </div>
        </HospitalPage>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <HospitalPage
        eyebrow="Operations"
        title="Dietary Operations Dashboard"
        description="Live figures from today's meal workflow, kitchen status and intake records."
      >
        {/* ── Summary stat cards ────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "var(--space-4)" }}>
          <StatCard icon={Users}          label="Patients Requiring Meals"   value={active.length}                                          note="Active in today's meal workflow"            iconColor="var(--hospital-primary)" />
          <StatCard icon={ClipboardCheck} label="Meals Prepared"             value={deliveryCounts.Prepared}                                note="Marked prepared today"                     iconColor="var(--color-info)" />
          <StatCard icon={UtensilsCrossed}label="Meals Delivered"            value={deliveryCounts.Delivered}                               note="Marked delivered today"                    iconColor="var(--color-success)" />
          <StatCard icon={Clock3}         label="Meals Pending"              value={deliveryCounts.Pending}                                 note="Still pending this service day"            iconColor="var(--color-warning)" />
          <StatCard icon={Activity}       label="Meals Consumed"             value={intakeCounts.Taken + intakeCounts["Partially Taken"]}   note={`${intakeCounts.Taken} taken · ${intakeCounts["Partially Taken"]} partial`} iconColor="var(--hospital-accent)" />
          <StatCard icon={ShieldAlert}    label="Alerts"                     value={clinicalAlerts.length}                                  note="Active clinical & dietary alerts"          iconColor="var(--color-error)" />
        </div>

        {/* ── Overall progress bar ─────────────────────────────── */}
        <HospitalCard>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
            <span style={{ fontSize: "var(--font-h3)", fontWeight: 700, color: "var(--text-primary)" }}>
              Today's Meal Service Progress
            </span>
            <span style={{ fontSize: "var(--font-h2)", fontWeight: 800, color: "var(--hospital-primary)" }}>
              {progressPct}%
            </span>
          </div>
          <ProgressBar value={completedMeals} max={totalMeals || 1} />
          <div style={{ display: "flex", gap: "var(--space-6)", marginTop: "var(--space-4)", flexWrap: "wrap" }}>
            {[
              { label: "Prepared",  value: deliveryCounts.Prepared,  color: "var(--color-info)" },
              { label: "Delivered", value: deliveryCounts.Delivered, color: "var(--color-success)" },
              { label: "Delivering",value: deliveryCounts.Delivering,color: "var(--hospital-primary)" },
              { label: "Pending",   value: deliveryCounts.Pending,   color: "var(--color-warning)" },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <span style={{ fontSize: "var(--font-body)", color: "var(--text-secondary)", fontWeight: 500 }}>
                  {label}: <strong style={{ color: "var(--text-primary)" }}>{value}</strong>
                </span>
              </div>
            ))}
          </div>
        </HospitalCard>

        {/* ── Meal intake + Kitchen progress ───────────────────── */}
        <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
          {/* Intake breakdown */}
          <HospitalCard 
            title="Meal Intake Today" 
            subtitle="Patient intake record for all meal periods"
            actions={<Activity size={18} style={{ color: "var(--hospital-primary)" }} />}
          >
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              {[
                { label: "Taken",          value: intakeCounts.Taken,                 color: "var(--color-success)" },
                { label: "Partially Taken",value: intakeCounts["Partially Taken"],     color: "var(--color-warning)" },
                { label: "Not Taken",      value: intakeCounts["Not Taken"],           color: "var(--color-error)" },
                { label: "Returned",       value: intakeCounts.Returned,               color: "var(--color-warning)" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{
                  padding: "var(--space-4)",
                  borderRadius: "var(--radius)",
                  border: "1px solid var(--border)",
                  background: "var(--bg-secondary)",
                  textAlign: "center",
                }}>
                  <div style={{ fontSize: "var(--font-h1)", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                  <div style={{ fontSize: "var(--font-body)", fontWeight: 500, color: "var(--text-secondary)", marginTop: "var(--space-2)" }}>{label}</div>
                </div>
              ))}
            </div>
          </HospitalCard>

          {/* Kitchen progress */}
          <HospitalCard
            title="Kitchen Progress"
            subtitle="Today's preparation and delivery pipeline"
            actions={<TrendingUp size={18} style={{ color: "var(--hospital-primary)" }} />}
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { label: "Prepared",   value: deliveryCounts.Prepared,   color: "var(--color-info)" },
                { label: "Delivering", value: deliveryCounts.Delivering,  color: "var(--hospital-primary)" },
                { label: "Delivered",  value: deliveryCounts.Delivered,   color: "var(--color-success)" },
                { label: "Pending",    value: deliveryCounts.Pending,     color: "var(--color-warning)" },
              ].map(({ label, value, color }) => (
                <SummaryRow key={label} label={label} value={value} valueColor={color} />
              ))}
            </div>
          </HospitalCard>
        </div>

        {/* ── Diet distribution + Ward workload ───────────────── */}
        <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
          {/* Diet distribution */}
          <HospitalCard
            title="Diet Distribution"
            subtitle="Patients by assigned diet plan"
            actions={<ClipboardCheck size={18} style={{ color: "var(--hospital-primary)" }} />}
          >
            {dietRows.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
                {dietRows.map((r) => {
                  return (
                    <div key={r.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--space-2)" }}>
                        <span style={{ fontSize: "var(--font-body)", fontWeight: 600, color: "var(--text-primary)" }}>{r.name}</span>
                        <span style={{ fontSize: "var(--font-body)", fontWeight: 500, color: "var(--text-secondary)" }}>{r.count} patients</span>
                      </div>
                      <ProgressBar value={r.count} max={Math.max(patients.length, 1)} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ fontSize: "var(--font-body)", color: "var(--text-secondary)", margin: 0 }}>
                No diet assignments available.
              </p>
            )}
          </HospitalCard>

          {/* Ward workload */}
          <HospitalCard
            title="Ward-wise Workload"
            subtitle="Patients currently listed by ward"
            actions={<Building2 size={18} style={{ color: "var(--hospital-primary)" }} />}
            noPadding={true}
          >
            <div style={{ overflow: "hidden" }}>
              {wardRows.map(([ward, count], i) => (
                <div
                  key={ward}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "var(--space-4) var(--space-5)",
                    borderTop: i === 0 ? "none" : "1px solid var(--border)",
                  }}
                >
                  <div>
                    <p style={{ fontWeight: 600, color: "var(--text-primary)", margin: 0, fontSize: "var(--font-body)" }}>{ward}</p>
                    <p style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)", margin: 0 }}>Dietary service</p>
                  </div>
                  <span className="hospital-record-count">{count}</span>
                </div>
              ))}
              {!wardRows.length && (
                <p style={{ padding: "var(--space-5)", color: "var(--text-secondary)", fontSize: "var(--font-body)" }}>
                  No ward data available.
                </p>
              )}
            </div>
          </HospitalCard>
        </div>

        {/* ── Meal period breakdown ─────────────────────────────── */}
        <HospitalCard
          title="Meal Distribution by Period"
          subtitle="Estimated service load across today's meal schedule"
          actions={<UtensilsCrossed size={18} style={{ color: "var(--hospital-primary)" }} />}
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "var(--space-4)" }}>
            {MEALS.map((meal) => {
              const completed = active.filter((p) => {
                const delivery = statusForToday(mealStatus,    p.id, meal);
                const intake   = statusForToday(intakeStatus,  p.id, meal);
                return delivery === "Delivered" || intake === "Taken";
              }).length;
              return (
                <MealPeriodCard
                  key={meal}
                  meal={meal}
                  total={active.length}
                  completed={completed}
                />
              );
            })}
          </div>
        </HospitalCard>

        {/* ── Today's diet orders summary ───────────────────────── */}
        <div style={{ display: "grid", gap: "var(--space-5)", gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))" }}>
          {/* Patients requiring attention */}
          <HospitalCard
            title="Patients Requiring Attention"
            subtitle="Live clinical and dietary alerts"
            noPadding={true}
            actions={
              <a
                href="/patients"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  fontSize: "var(--font-body)",
                  fontWeight: 700,
                  color: "var(--hospital-primary)",
                  textDecoration: "none",
                }}
              >
                Open Diet Manager <ArrowRight size={16} />
              </a>
            }
          >
            <div className="hospital-table-wrap" style={{ border: "none", boxShadow: "none", borderRadius: 0 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    <th style={{ padding: "var(--space-3) var(--space-5)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", textAlign: "left" }}>Patient</th>
                    <th style={{ padding: "var(--space-3) var(--space-5)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", textAlign: "left" }}>Ward / Bed</th>
                    <th style={{ padding: "var(--space-3) var(--space-5)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", textAlign: "left" }}>Issue</th>
                    <th style={{ padding: "var(--space-3) var(--space-5)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", fontSize: "var(--font-label)", fontWeight: 800, textTransform: "uppercase", textAlign: "left" }}>Current Diet</th>
                  </tr>
                </thead>
                <tbody>
                  {attentionList.length ? (
                    attentionList.map((p) => {
                      const issues = (patientAlertMap.get(String(p.id)) || []).map((a) => a.message).slice(0, 2);
                      const diet   = diets.find((d) => Number(d.id) === Number(p.dietTypeId));
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "var(--space-4) var(--space-5)" }}>
                            <div style={{ fontWeight: 600, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>{p.name}</div>
                            <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)", marginTop: "2px" }}>ID: {p.id}</div>
                          </td>
                          <td style={{ padding: "var(--space-4) var(--space-5)", fontSize: "var(--font-body)", color: "var(--text-secondary)" }}>
                            {p.ward || "—"} / {p.bedNo || "—"}
                          </td>
                          <td style={{ padding: "var(--space-4) var(--space-5)" }}>
                            <span style={{
                              display: "inline-flex",
                              padding: "4px var(--space-3)",
                              borderRadius: "var(--radius-pill)",
                              background: "var(--color-warning-soft)",
                              color: "var(--color-warning)",
                              fontSize: "var(--font-caption)",
                              fontWeight: 700,
                              border: "1px solid var(--color-warning-border)",
                            }}>
                              {issues.join(" · ") || "Alert"}
                            </span>
                          </td>
                          <td style={{ padding: "var(--space-4) var(--space-5)", fontSize: "var(--font-body)", color: "var(--text-secondary)" }}>
                            {diet?.name || <span style={{ fontStyle: "italic", color: "var(--text-disabled)" }}>Not assigned</span>}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} style={{ padding: "var(--space-8) var(--space-5)", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)" }}>
                          <CheckCircle2 size={32} style={{ color: "var(--color-success)", opacity: 0.8 }} />
                          <span style={{ fontSize: "var(--font-body)", fontWeight: 600, color: "var(--text-primary)" }}>
                            No patients currently require attention
                          </span>
                          <span style={{ fontSize: "var(--font-body)", color: "var(--text-secondary)" }}>
                            All dietary alerts are clear for this service day.
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </HospitalCard>

          {/* Diet order summary */}
          <HospitalCard title="Today's Diet Orders">
            <div style={{ display: "flex", flexDirection: "column" }}>
              <SummaryRow label="Patients Requiring Meals" value={active.length} />
              <SummaryRow label="Meals Prepared"           value={deliveryCounts.Prepared}   valueColor="var(--color-info)" />
              <SummaryRow label="Meals Delivered"          value={deliveryCounts.Delivered}  valueColor="var(--color-success)" />
              <SummaryRow label="Meals Pending"            value={deliveryCounts.Pending}    valueColor="var(--color-warning)" />
              <SummaryRow
                label="Consumed / Partial"
                value={`${intakeCounts.Taken} / ${intakeCounts["Partially Taken"]}`}
                valueColor="var(--hospital-primary)"
              />
              <SummaryRow label="Alerts" value={clinicalAlerts.length} valueColor={clinicalAlerts.length > 0 ? "var(--color-error)" : "var(--color-success)"} />
            </div>
          </HospitalCard>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
