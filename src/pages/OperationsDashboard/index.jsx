import React, { useCallback, useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import {
  Users,
  ClipboardCheck,
  Clock3,
  ShieldAlert,
  UtensilsCrossed,
  Building2,
  ArrowRight,
  Activity,
  TrendingUp,
  CheckCircle2,
} from "lucide-react";
import {
  getStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import { buildClinicalAlerts } from "../../lib/clinicalAlerts.js";
import HospitalPage, {
  HospitalCard,
  StatCard,
} from "../../components/common/HospitalPage.jsx";
import dashboardService from "../../services/dashboardService.js";

/* ── Inline progress bar ─────────────────────────────────────── */
function ProgressBar({ value, max, color = "var(--hospital-primary)" }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="hospital-progress" style={{ marginTop: "var(--space-2)" }}>
      <div
        className="hospital-progress-fill"
        style={{ width: `${pct}%`, background: color }}
      />
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
      <div
        style={{
          fontSize: "var(--font-h1)",
          fontWeight: 800,
          color: "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {total}
      </div>
      <div
        style={{
          fontSize: "var(--font-body)",
          fontWeight: 600,
          color: "var(--text-secondary)",
          marginTop: "var(--space-2)",
        }}
      >
        {meal}
      </div>
      <div
        style={{
          fontSize: "var(--font-label)",
          color: "var(--text-secondary)",
          marginTop: "var(--space-1)",
        }}
      >
        {completed} completed
      </div>
      <ProgressBar
        value={completed}
        max={total}
        color="var(--hospital-primary)"
      />
    </div>
  );
}

/* ── Row in a summary list ────────────────────────────────────── */
function SummaryRow({ label, value, valueColor }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "var(--space-3) 0",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span
        style={{
          fontSize: "var(--font-body)",
          color: "var(--text-secondary)",
          fontWeight: 500,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          fontSize: "var(--font-body)",
          color: valueColor || "var(--text-primary)",
        }}
      >
        {value}
      </strong>
    </div>
  );
}

const extractSummary = (res) =>
  res?.data?.data?.dataList?.[0] ??
  res?.data?.dataList?.[0] ??
  res?.dataList?.[0] ??
  null;

export default function DietaryOperationsDashboard() {
  const [, refresh] = useState(0);
  const todayDate = getLocalDateKey();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");

  /* ── Load dashboard from API ──────────────────────────────── */
  const loadDashboard = useCallback(async () => {
    try {
      setError("");
      const res = await dashboardService.getDashboard({
        serviceDate: todayDate,
      });
      setSummary(extractSummary(res));
    } catch (e) {
      setError(e?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [todayDate]);

  /* ── Reactive refresh ─────────────────────────────────────── */
  useEffect(() => {
    loadDashboard();

    const tick = () => {
      refresh((v) => v + 1);
      loadDashboard();
    };
    window.addEventListener("dietcare-store-updated", tick);
    window.addEventListener("storage", tick);
    window.addEventListener("auth-updated", tick);

    return () => {
      window.removeEventListener("dietcare-store-updated", tick);
      window.removeEventListener("storage", tick);
      window.removeEventListener("auth-updated", tick);
    };
  }, [loadDashboard]);

  /* ── Data ─────────────────────────────────────────────────── */
  const patients = getStore(KEYS.PATIENTS) || [];
  const diets = getStore(KEYS.DIET_TYPES) || [];
  const mealStatus = getStore("hd_meal_status", {}) || {};
  const flows = getStore("hd_diet_workflow", []) || [];
  const dietPlans = getStore("hd_diet_plans", []) || [];
  const intakeStatus = getStore("hd_intake_status", {}) || {};

  const mappings = getStore("hd_diet_mapping", []) || [];
  const mealTypes = getStore(KEYS.MEAL_TYPES, []) || [];

  const MEALS = [
    "Early Morning",
    "Breakfast",
    "Mid-Morning",
    "Lunch",
    "Evening Snack",
    "Dinner",
    "Bedtime",
  ];

  const ACTIVE_FLOW_STATUSES = [
    "Planning",
    "Assigned",
    "Approved",
    "Kitchen Assigned",
    "Preparing",
    "Prepared",
    "Delivering",
    "Dispatched",
    "Delivered",
  ];

  const statusForToday = (store, patientId, meal) =>
    store?.[`${todayDate}-${patientId}-${meal}`] ||
    store?.[`${patientId}-${meal}`] ||
    "Pending";

  const mealNameById = (id) =>
    mealTypes.find((m) => Number(m.id) === Number(id))?.name || "";

  /* Same rules as Kitchen Operations: date range, active patient, mapped meals */
  const plannedMeals = flows
    .filter((f) => {
      if (!f.dietTypeId || !ACTIVE_FLOW_STATUSES.includes(f.status))
        return false;
      const plan =
        dietPlans.find((p) => String(p.id) === String(f.planId)) ||
        dietPlans.find((p) => String(p.patientId) === String(f.patientId));
      const start = plan?.startDate || f.startDate;
      const end = plan?.endDate || f.endDate || start;
      if (start && todayDate < String(start)) return false;
      if (end && todayDate > String(end)) return false;
      return true;
    })
    .map((flow) => {
      const patient = patients.find(
        (p) => String(p.id) === String(flow.patientId),
      );
      if (!patient || (patient.status || "Active") !== "Active") return null;
      const plan =
        dietPlans.find((p) => String(p.patientId) === String(patient.id)) || {};
      const dietTypeId = Number(
        flow.dietTypeId || plan.dietTypeId || patient.dietTypeId,
      );
      const templateId = Number(flow.dietTemplateId || plan.dietTemplateId);
      const meals = [
        ...new Set(
          mappings
            .filter(
              (m) =>
                Number(m.dietTypeId) === dietTypeId ||
                Number(m.dietTemplateId) === templateId,
            )
            .map((m) => mealNameById(m.mealTypeId) || m.mealName || "")
            .filter((name) => MEALS.includes(name)),
        ),
      ];
      return meals.length ? { patient, meals } : null;
    })
    .filter(Boolean);

  const active = plannedMeals.map((x) => x.patient);
  const plannedPairs = plannedMeals.flatMap(({ patient, meals }) =>
    meals.map((meal) => ({ patientId: patient.id, meal })),
  );

  const countByStatus = (store, status) =>
    plannedPairs.filter(
      ({ patientId, meal }) =>
        statusForToday(store, patientId, meal) === status,
    ).length;

  /* ── Delivery counts ──────────────────────────────────────── */
  const deliveryCounts = Object.fromEntries(
    ["Delivered", "Prepared", "Delivering", "Preparing", "Pending"].map((s) => [
      s,
      countByStatus(mealStatus, s),
    ]),
  );

  /* ── Intake counts ────────────────────────────────────────── */
  const intakeCounts = Object.fromEntries(
    ["Taken", "Partially Taken", "Not Taken", "Returned", "Pending"].map(
      (s) => [s, countByStatus(intakeStatus, s)],
    ),
  );

  /* ── Per-meal planned / completed (Kitchen "packed" rule) ──── */
  const mealPlanned = Object.fromEntries(MEALS.map((m) => [m, 0]));
  const mealCompleted = Object.fromEntries(MEALS.map((m) => [m, 0]));
  plannedPairs.forEach(({ patientId, meal }) => {
    mealPlanned[meal] += 1;
    if (
      ["Packed", "Delivering", "Delivered"].includes(
        statusForToday(mealStatus, patientId, meal),
      )
    ) {
      mealCompleted[meal] += 1;
    }
  });

  /* ── Clinical alerts ──────────────────────────────────────── */
  const clinicalAlerts = patients.flatMap((patient) => {
    const plan =
      dietPlans.find(
        (p) =>
          String(p.patientId) === String(patient.id) &&
          ["planning", "approved", "active"].includes(
            String(p.status).toLowerCase(),
          ),
      ) || dietPlans.find((p) => String(p.patientId) === String(patient.id));
    const workflow = flows.find(
      (f) => String(f.patientId) === String(patient.id),
    );
    const intake = getStore(`hd_meal_intake_${patient.id}_${todayDate}`, null);
    return buildClinicalAlerts({
      patient,
      plan,
      workflow,
      intake,
      mealStatus,
    }).map((a) => ({ ...a, patient }));
  });

  const patientAlertMap = new Map();
  clinicalAlerts.forEach((a) => {
    const key = String(a.patient.id);
    if (!patientAlertMap.has(key)) patientAlertMap.set(key, []);
    patientAlertMap.get(key).push(a);
  });

  /* ── API stats with local fallback ────────────────────────── */ // ← NEW
  const stats = {
    // ← NEW
    patients: summary?.patientsRequiringMeals ?? active.length,
    prepared: summary?.mealsPrepared ?? deliveryCounts.Prepared,
    delivered: summary?.mealsDelivered ?? deliveryCounts.Delivered,
    pending: summary?.mealsPending ?? deliveryCounts.Pending,
    taken: summary?.mealsTaken ?? intakeCounts.Taken,
    partial: summary?.mealsPartialTaken ?? intakeCounts["Partially Taken"],
    alerts: summary?.alertsCount ?? clinicalAlerts.length,
  };

  /* ── Diet distribution rows ───────────────────────────────── */
  const dietRows = useMemo(() => {
    // NEW: use the API list when it has data
    if (summary?.dietDistribution?.length) {
      return summary.dietDistribution
        .map((d) => ({
          id: d.dietTypeId ?? d.id,
          name: d.name ?? d.dietName,
          count: d.count ?? d.patientCount ?? 0,
        }))
        .slice(0, 10);
    }

    // existing local fallback (unchanged)
    const counts = new Map();
    patients.forEach((patient) => {
      const pid = String(patient.id);
      let dietTypeId = patient.dietTypeId;
      if (!dietTypeId) {
        const wf = flows.find((f) => String(f.patientId) === pid);
        dietTypeId = wf?.dietTypeId || wf?.dietTemplateId || null;
      }
      if (!dietTypeId) {
        const pl = dietPlans.find((p) => String(p.patientId) === pid);
        dietTypeId = pl?.dietTypeId || pl?.dietTemplateId || null;
      }
      if (!dietTypeId) return;
      const diet = diets.find((d) => Number(d.id) === Number(dietTypeId));
      if (!diet) return;
      const key = String(diet.id);
      if (!counts.has(key))
        counts.set(key, { id: diet.id, name: diet.name, count: 0 });
      counts.get(key).count += 1;
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }, [summary, patients, diets, flows, dietPlans]); // ← summary added

  /* ── Ward rows ────────────────────────────────────────────── */
  const wardRows = Object.entries(
    patients.reduce((a, p) => {
      const w = p.ward || "Unassigned";
      a[w] = (a[w] || 0) + 1;
      return a;
    }, {}),
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
        .filter(
          (e) => e.type === "daily_snapshot" && e.serviceDate === todayDate,
        )
        .map((e) => String(e.patientId)),
    );
    flows.forEach((flow) => {
      if (existingSnapshots.has(String(flow.patientId))) return;
      const patient = patients.find(
        (p) => String(p.id) === String(flow.patientId),
      );
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
  const totalMeals = plannedPairs.length;
  const completedMeals = stats.delivered + stats.prepared;
  const progressPct =
    totalMeals > 0 ? Math.round((completedMeals / totalMeals) * 100) : 0;

  if (loading) {
    return (
      <AppLayout>
        <HospitalPage
          eyebrow="Operations"
          title="Dietary Operations Dashboard"
          description="Loading live figures..."
        >
          <div className="app-skeleton">
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "var(--space-4)",
              }}
            >
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="app-skeleton-line xl" />
              ))}
            </div>
            <div className="app-skeleton-line lg" />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-4)",
              }}
            >
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
        {error && (
          <div
            style={{
              padding: "var(--space-3) var(--space-4)",
              border: "1px solid var(--color-error)",
              borderRadius: "var(--radius)",
              color: "var(--color-error)",
            }}
          >
            {error}. Showing locally calculated figures.
          </div>
        )}
        {/* ── Summary stat cards ────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "var(--space-4)",
          }}
        >
          <StatCard
            icon={Users}
            label="Patients Requiring Meals"
            value={stats.patients}
            note="Active in today's meal workflow"
            iconColor="var(--hospital-primary)"
          />
          <StatCard
            icon={ClipboardCheck}
            label="Meals Prepared"
            value={stats.prepared}
            note="Marked prepared today"
            iconColor="var(--color-info)"
          />
          <StatCard
            icon={UtensilsCrossed}
            label="Meals Delivered"
            value={stats.delivered}
            note="Marked delivered today"
            iconColor="var(--color-success)"
          />
          <StatCard
            icon={Clock3}
            label="Meals Pending"
            value={stats.pending}
            note="Still pending this service day"
            iconColor="var(--color-warning)"
          />
          <StatCard
            icon={Activity}
            label="Meals Consumed"
            value={stats.taken + stats.partial}
            note={`${stats.taken} taken · ${stats.partial} partial`}
            iconColor="var(--hospital-accent)"
          />
          <StatCard
            icon={ShieldAlert}
            label="Alerts"
            value={stats.alerts}
            note="Active clinical & dietary alerts"
            iconColor="var(--color-error)"
          />
        </div>

        {/* ── Overall progress bar ─────────────────────────────── */}
        <HospitalCard>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: "var(--space-2)",
            }}
          >
            <span
              style={{
                fontSize: "var(--font-h3)",
                fontWeight: 700,
                color: "var(--text-primary)",
              }}
            >
              Today's Meal Service Progress
            </span>
            <span
              style={{
                fontSize: "var(--font-h2)",
                fontWeight: 800,
                color: "var(--hospital-primary)",
              }}
            >
              {progressPct}%
            </span>
          </div>
          <ProgressBar value={completedMeals} max={totalMeals || 1} />
          <div
            style={{
              display: "flex",
              gap: "var(--space-6)",
              marginTop: "var(--space-4)",
              flexWrap: "wrap",
            }}
          >
            {[
              {
                label: "Prepared",
                value: stats.prepared,
                color: "var(--color-info)",
              },
              {
                label: "Delivered",
                value: stats.delivered,
                color: "var(--color-success)",
              },
              {
                label: "Delivering",
                value: deliveryCounts.Delivering,
                color: "var(--hospital-primary)",
              },
              {
                label: "Pending",
                value: stats.pending,
                color: "var(--color-warning)",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontSize: "var(--font-body)",
                    color: "var(--text-secondary)",
                    fontWeight: 500,
                  }}
                >
                  {label}:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>
                    {value}
                  </strong>
                </span>
              </div>
            ))}
          </div>
        </HospitalCard>

        {/* ── Meal intake + Kitchen progress ───────────────────── */}
        <div
          style={{
            display: "grid",
            gap: "var(--space-5)",
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          }}
        >
          {/* Intake breakdown */}
          <HospitalCard
            title="Meal Intake Today"
            subtitle="Patient intake record for all meal periods"
            actions={
              <Activity
                size={18}
                style={{ color: "var(--hospital-primary)" }}
              />
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "var(--space-3)",
              }}
            >
              {[
                {
                  label: "Taken",
                  value: stats.taken,
                  color: "var(--color-success)",
                },
                {
                  label: "Partially Taken",
                  value: stats.partial,
                  color: "var(--color-warning)",
                },
                {
                  label: "Not Taken",
                  value: intakeCounts["Not Taken"],
                  color: "var(--color-error)",
                },
                {
                  label: "Returned",
                  value: intakeCounts["Returned"],
                  color: "var(--color-warning)",
                },
              ].map(({ label, value, color }) => (
                <div
                  key={label}
                  style={{
                    padding: "var(--space-4)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    background: "var(--bg-secondary)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: "var(--font-h1)",
                      fontWeight: 800,
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-body)",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      marginTop: "var(--space-2)",
                    }}
                  >
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </HospitalCard>

          {/* Kitchen progress */}
          <HospitalCard
            title="Kitchen Progress"
            subtitle="Today's preparation and delivery pipeline"
            actions={
              <TrendingUp
                size={18}
                style={{ color: "var(--hospital-primary)" }}
              />
            }
          >
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                {
                  label: "Prepared",
                  value: stats.prepared,
                  color: "var(--color-info)",
                },
                {
                  label: "Delivering",
                  value: deliveryCounts.Delivering,
                  color: "var(--hospital-primary)",
                },
                {
                  label: "Delivered",
                  value: stats.delivered,
                  color: "var(--color-success)",
                },
                {
                  label: "Pending",
                  value: stats.pending,
                  color: "var(--color-warning)",
                },
              ].map(({ label, value, color }) => (
                <SummaryRow
                  key={label}
                  label={label}
                  value={value}
                  valueColor={color}
                />
              ))}
            </div>
          </HospitalCard>
        </div>

        {/* ── Diet distribution + Ward workload ───────────────── */}
        <div
          style={{
            display: "grid",
            gap: "var(--space-5)",
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          }}
        >
          {/* Diet distribution */}
          <HospitalCard
            title="Diet Distribution"
            subtitle="Patients by assigned diet plan"
            actions={
              <ClipboardCheck
                size={18}
                style={{ color: "var(--hospital-primary)" }}
              />
            }
          >
            {dietRows.length ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-4)",
                }}
              >
                {dietRows.map((r) => {
                  return (
                    <div key={r.name}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "var(--space-2)",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "var(--font-body)",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {r.name}
                        </span>
                        <span
                          style={{
                            fontSize: "var(--font-body)",
                            fontWeight: 500,
                            color: "var(--text-secondary)",
                          }}
                        >
                          {r.count} patients
                        </span>
                      </div>
                      <ProgressBar
                        value={r.count}
                        max={Math.max(patients.length, 1)}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <p
                style={{
                  fontSize: "var(--font-body)",
                  color: "var(--text-secondary)",
                  margin: 0,
                }}
              >
                No diet assignments available.
              </p>
            )}
          </HospitalCard>

          {/* Ward workload */}
          <HospitalCard
            title="Ward-wise Workload"
            subtitle="Patients currently listed by ward"
            actions={
              <Building2
                size={18}
                style={{ color: "var(--hospital-primary)" }}
              />
            }
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
                    <p
                      style={{
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        margin: 0,
                        fontSize: "var(--font-body)",
                      }}
                    >
                      {ward}
                    </p>
                    <p
                      style={{
                        fontSize: "var(--font-caption)",
                        color: "var(--text-secondary)",
                        margin: 0,
                      }}
                    >
                      Dietary service
                    </p>
                  </div>
                  <span className="hospital-record-count">{count}</span>
                </div>
              ))}
              {!wardRows.length && (
                <p
                  style={{
                    padding: "var(--space-5)",
                    color: "var(--text-secondary)",
                    fontSize: "var(--font-body)",
                  }}
                >
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
          actions={
            <UtensilsCrossed
              size={18}
              style={{ color: "var(--hospital-primary)" }}
            />
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "var(--space-4)",
            }}
          >
            {MEALS.map((meal) => (
              <MealPeriodCard
                key={meal}
                meal={meal}
                total={mealPlanned[meal]}
                completed={mealCompleted[meal]}
              />
            ))}
          </div>
        </HospitalCard>

        {/* ── Today's diet orders summary ───────────────────────── */}
        <div
          style={{
            display: "grid",
            gap: "var(--space-5)",
            gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
          }}
        >
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
            <div
              className="hospital-table-wrap"
              style={{ border: "none", boxShadow: "none", borderRadius: 0 }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "var(--bg-secondary)" }}>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-5)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontSize: "var(--font-label)",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        textAlign: "left",
                      }}
                    >
                      Patient
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-5)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontSize: "var(--font-label)",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        textAlign: "left",
                      }}
                    >
                      Ward / Bed
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-5)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontSize: "var(--font-label)",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        textAlign: "left",
                      }}
                    >
                      Issue
                    </th>
                    <th
                      style={{
                        padding: "var(--space-3) var(--space-5)",
                        borderBottom: "1px solid var(--border)",
                        color: "var(--text-secondary)",
                        fontSize: "var(--font-label)",
                        fontWeight: 800,
                        textTransform: "uppercase",
                        textAlign: "left",
                      }}
                    >
                      Current Diet
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {attentionList.length ? (
                    attentionList.map((p) => {
                      const issues = (patientAlertMap.get(String(p.id)) || [])
                        .map((a) => a.message)
                        .slice(0, 2);
                      const diet = diets.find(
                        (d) => Number(d.id) === Number(p.dietTypeId),
                      );
                      return (
                        <tr
                          key={p.id}
                          style={{ borderBottom: "1px solid var(--border)" }}
                        >
                          <td
                            style={{ padding: "var(--space-4) var(--space-5)" }}
                          >
                            <div
                              style={{
                                fontWeight: 600,
                                fontSize: "var(--font-body)",
                                color: "var(--text-primary)",
                              }}
                            >
                              {p.name}
                            </div>
                            <div
                              style={{
                                fontSize: "var(--font-caption)",
                                color: "var(--text-secondary)",
                                marginTop: "2px",
                              }}
                            >
                              ID: {p.id}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "var(--space-4) var(--space-5)",
                              fontSize: "var(--font-body)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {p.ward || "—"} / {p.bedNo || "—"}
                          </td>
                          <td
                            style={{ padding: "var(--space-4) var(--space-5)" }}
                          >
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "4px var(--space-3)",
                                borderRadius: "var(--radius-pill)",
                                background: "var(--color-warning-soft)",
                                color: "var(--color-warning)",
                                fontSize: "var(--font-caption)",
                                fontWeight: 700,
                                border: "1px solid var(--color-warning-border)",
                              }}
                            >
                              {issues.join(" · ") || "Alert"}
                            </span>
                          </td>
                          <td
                            style={{
                              padding: "var(--space-4) var(--space-5)",
                              fontSize: "var(--font-body)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {diet?.name || (
                              <span
                                style={{
                                  fontStyle: "italic",
                                  color: "var(--text-disabled)",
                                }}
                              >
                                Not assigned
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={4}
                        style={{
                          padding: "var(--space-8) var(--space-5)",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: "var(--space-3)",
                          }}
                        >
                          <CheckCircle2
                            size={32}
                            style={{
                              color: "var(--color-success)",
                              opacity: 0.8,
                            }}
                          />
                          <span
                            style={{
                              fontSize: "var(--font-body)",
                              fontWeight: 600,
                              color: "var(--text-primary)",
                            }}
                          >
                            No patients currently require attention
                          </span>
                          <span
                            style={{
                              fontSize: "var(--font-body)",
                              color: "var(--text-secondary)",
                            }}
                          >
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
              <SummaryRow
                label="Patients Requiring Meals"
                value={stats.patients}
              />
              <SummaryRow
                label="Meals Prepared"
                value={stats.prepared}
                valueColor="var(--color-info)"
              />
              <SummaryRow
                label="Meals Delivered"
                value={stats.delivered}
                valueColor="var(--color-success)"
              />
              <SummaryRow
                label="Meals Pending"
                value={stats.pending}
                valueColor="var(--color-warning)"
              />
              <SummaryRow
                label="Consumed / Partial"
                value={`${stats.taken} / ${stats.partial}`}
                valueColor="var(--hospital-primary)"
              />
              <SummaryRow
                label="Alerts"
                value={stats.alerts}
                valueColor={
                  stats.alerts > 0
                    ? "var(--color-error)"
                    : "var(--color-success)"
                }
              />
            </div>
          </HospitalCard>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
