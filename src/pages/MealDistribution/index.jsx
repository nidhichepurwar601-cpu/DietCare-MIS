import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  Search,
  Truck,
  X,
  Bell,
  Utensils,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  syncWorkflowFromMealStatuses,
  getLocalDateKey,
} from "../../lib/storage.js";
import {
  getCurrentRole,
  hasPermission,
  PERMISSIONS,
} from "../../lib/permissions.js";

const MEALS = [
  "Breakfast",
  "Mid-Morning",
  "Lunch",
  "Evening Snack",
  "Dinner",
  "Bedtime",
];
const DELIVERY_STATUSES = ["Pending", "Prepared", "Delivering", "Delivered"];
const INTAKE_OPTIONS = ["Pending", "Taken", "Not Taken"];
const CARE_STATUSES = [
  "Waiting for Nurse",
  "Meal Finished",
  "Intake Pending",
  "Intake Completed",
];
const MEAL_STATUS_KEY = "hd_meal_status";
const CARE_STATUS_KEY = "hd_meal_care_status";
const INTAKE_KEY = (patientId, date) => `hd_meal_intake_${patientId}_${date}`;

const serviceStatusFor = (map, patientId, meal, date) =>
  map?.[`${date}-${patientId}-${meal}`] ||
  map?.[`${patientId}-${meal}`] ||
  "Pending";

const deliveryStatusFor = (map, patientId, meal, date) => {
  const raw = serviceStatusFor(map, patientId, meal, date);
  return DELIVERY_STATUSES.includes(raw) ? raw : "Prepared";
};

const careStatusFor = (map, patientId, meal, date, delivery) => {
  const stored = serviceStatusFor(map, patientId, meal, date);
  if (CARE_STATUSES.includes(stored)) return stored;
  if (delivery === "Delivered") return "Waiting for Nurse";
  return "Waiting for Nurse";
};

const allergyTags = (patient) => {
  const allergies = Array.isArray(patient?.allergens)
    ? patient.allergens.filter((x) => x && x !== "None")
    : [];
  return allergies.map((x) => `NO ${String(x).toUpperCase()}`);
};

const mealTags = (patient, plan, diet) => {
  const tags = [];
  const source =
    `${diet?.name || ""} ${plan?.specialInstructions || ""} ${plan?.planningRemarks || ""}`.toLowerCase();
  if (source.includes("diabet")) tags.push("DIABETIC");
  if (source.includes("low salt") || source.includes("low sodium"))
    tags.push("LOW SALT");
  if (source.includes("soft")) tags.push("SOFT DIET");
  if (source.includes("liquid")) tags.push("LIQUID DIET");
  if (source.includes("puree") || source.includes("pureed"))
    tags.push("PUREED");
  if (source.includes("high protein")) tags.push("HIGH PROTEIN");
  return [...new Set(tags)];
};

const quantityNumber = (value) => {
  const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const foodItemsFor = (patient, mealName, plans, mappings, foods, mealTypes) => {
  const plan = plans.find(
    (p) =>
      String(p.patientId) === String(patient.id) &&
      (!p.endDate || String(p.endDate) >= getLocalDateKey()),
  );
  const dietId = plan?.dietTypeId || patient.dietTypeId;
  const templateId = plan?.dietTemplateId;
  const mealType = mealTypes.find(
    (m) => String(m.name).toLowerCase() === String(mealName).toLowerCase(),
  );
  const mapping = mappings.find(
    (m) =>
      (Number(m.dietTypeId) === Number(dietId) ||
        Number(m.dietTemplateId) === Number(templateId)) &&
      (Number(m.mealTypeId) === Number(mealType?.id) ||
        String(m.mealName || "").toLowerCase() ===
          String(mealName).toLowerCase()),
  );
  return (mapping?.foodItems || [])
    .map((entry) => {
      const foodId =
        typeof entry === "object" ? (entry?.foodId ?? entry?.id) : entry;
      const food = foods.find((f) => Number(f.id) === Number(foodId));
      if (!food) return null;
      const quantity =
        (typeof entry === "object" ? entry?.quantity : null) ??
        mapping?.quantityTexts?.[foodId] ??
        mapping?.quantities?.[foodId] ??
        food.standardQuantity ??
        "";
      const unit =
        (typeof entry === "object" ? entry?.unit : null) ||
        mapping?.units?.[foodId] ||
        food.unit ||
        "";
      return {
        foodId: food.id,
        name: food.name,
        category: food.category || "Food Item",
        quantity,
        unit,
      };
    })
    .filter(Boolean);
};

export default function MealDistribution() {
  const role = getCurrentRole();
  const canDeliver = hasPermission(role, PERMISSIONS.DELIVERY_MANAGE);
  const canNurseFinish = role === "ADMIN" || role === "NURSE";
  const canRecordIntake = role === "ADMIN" || role === "CAREGIVER";
  const [serviceDate, setServiceDate] = useState(() => getLocalDateKey());
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("All Wards");
  const [mealFilter, setMealFilter] = useState("All Meals");
  const [deliveryFilter, setDeliveryFilter] = useState("All Status");
  const [mealStatus, setMealStatus] = useState(
    () => getStore(MEAL_STATUS_KEY, {}) || {},
  );
  const [careStatus, setCareStatus] = useState(
    () => getStore(CARE_STATUS_KEY, {}) || {},
  );
  const [patients, setPatients] = useState(
    () => getStore(KEYS.PATIENTS, []) || [],
  );
  const [plans, setPlans] = useState(() => getStore("hd_diet_plans", []) || []);
  const [mappings, setMappings] = useState(
    () => getStore(KEYS.DIET_MAPPING, []) || [],
  );
  const [foods, setFoods] = useState(
    () => getStore(KEYS.FOOD_MASTER, []) || [],
  );
  const [diets, setDiets] = useState(() => getStore(KEYS.DIET_TYPES, []) || []);
  const [mealTypes, setMealTypes] = useState(
    () => getStore(KEYS.MEAL_TYPES, []) || [],
  );
  const [selected, setSelected] = useState(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [intakeItems, setIntakeItems] = useState([]);
  const [intakeRemark, setIntakeRemark] = useState("");
  const [issue, setIssue] = useState("");

  useEffect(() => {
    const refresh = () => {
      setMealStatus(getStore(MEAL_STATUS_KEY, {}) || {});
      setCareStatus(getStore(CARE_STATUS_KEY, {}) || {});
      setPatients(getStore(KEYS.PATIENTS, []) || []);
      setPlans(getStore("hd_diet_plans", []) || []);
      setMappings(getStore(KEYS.DIET_MAPPING, []) || []);
      setFoods(getStore(KEYS.FOOD_MASTER, []) || []);
      setDiets(getStore(KEYS.DIET_TYPES, []) || []);
      setMealTypes(getStore(KEYS.MEAL_TYPES, []) || []);
    };
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dietcare-store-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const currentMeal = useMemo(() => {
    const configured = mealTypes
      .filter(
        (m) => m.status !== "Inactive" && MEALS.includes(m.name) && m.time,
      )
      .map((m) => {
        const [h, min] = String(m.time).split(":").map(Number);
        return { name: m.name, minutes: (h || 0) * 60 + (min || 0) };
      })
      .sort((a, b) => a.minutes - b.minutes);
    if (!configured.length) return "Breakfast";
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    let chosen = configured[0].name;
    configured.forEach((m) => {
      if (m.minutes <= mins) chosen = m.name;
    });
    return chosen;
  }, [mealTypes]);

  const activeMeal = mealFilter === "All Meals" ? currentMeal : mealFilter;
  const wards = useMemo(
    () => [...new Set(patients.map((p) => p.ward).filter(Boolean))],
    [patients],
  );

  const activeRows = useMemo(
    () =>
      patients
        .filter((p) => {
          const plan = plans.find(
            (x) =>
              String(x.patientId) === String(p.id) &&
              [
                "Planning",
                "Assigned",
                "Approved",
                "Active",
                "assigned",
                "approved",
                "planning",
                "active",
              ].includes(String(x.status || "")) &&
              (!x.startDate || serviceDate >= String(x.startDate)) &&
              (!x.endDate || serviceDate <= String(x.endDate)),
          );
          const flow = (getStore("hd_diet_workflow", []) || []).find(
            (x) => String(x.patientId) === String(p.id),
          );
          return (
            (p.status || "Active") === "Active" &&
            (plan || flow?.dietTypeId) &&
            !["On Hold", "Discontinued", "NPO"].includes(p.dietStatus || "")
          );
        })
        .filter((p) => {
          const q = search.toLowerCase();
          return `${p.id} ${p.name || ""} ${p.ward || ""} ${p.bedNo || p.bed || ""}`
            .toLowerCase()
            .includes(q);
        }),
    [patients, plans, serviceDate, search],
  );

  const rows = useMemo(
    () =>
      activeRows
        .map((p) => {
          const plan = plans.find(
            (x) =>
              String(x.patientId) === String(p.id) &&
              (!x.endDate || serviceDate <= String(x.endDate)),
          );
          const diet = diets.find(
            (d) => Number(d.id) === Number(plan?.dietTypeId || p.dietTypeId),
          );
          const delivery = deliveryStatusFor(
            mealStatus,
            p.id,
            activeMeal,
            serviceDate,
          );
          const care = careStatusFor(
            careStatus,
            p.id,
            activeMeal,
            serviceDate,
            delivery,
          );
          const intakeRecord = getStore(INTAKE_KEY(p.id, serviceDate), null);
          const mealRecord = intakeRecord?.meals?.find(
            (m) => m.meal === activeMeal,
          );
          const items = foodItemsFor(
            p,
            activeMeal,
            plans,
            mappings,
            foods,
            mealTypes,
          );
          return { patient: p, plan, diet, delivery, care, items, mealRecord };
        })
        .filter(
          (r) =>
            (wardFilter === "All Wards" || r.patient.ward === wardFilter) &&
            (deliveryFilter === "All Status" || r.delivery === deliveryFilter),
        ),
    [
      activeRows,
      plans,
      diets,
      mealStatus,
      careStatus,
      activeMeal,
      serviceDate,
      mappings,
      foods,
      mealTypes,
      wardFilter,
      deliveryFilter,
    ],
  );

  const counts = useMemo(
    () => ({
      total: rows.length,
      packed: rows.filter((r) => r.delivery === "Prepared").length,
      delivered: rows.filter((r) => r.delivery === "Delivered").length,
      nurse: rows.filter(
        (r) => r.delivery === "Delivered" && r.care === "Waiting for Nurse",
      ).length,
      intake: rows.filter((r) => r.care === "Intake Pending").length,
      completed: rows.filter((r) => r.care === "Intake Completed").length,
    }),
    [rows],
  );

  const setDelivery = (row, next) => {
    const key = `${serviceDate}-${row.patient.id}-${activeMeal}`;
    const previous = deliveryStatusFor(
      mealStatus,
      row.patient.id,
      activeMeal,
      serviceDate,
    );
    if (next === "Delivering" && !["Prepared", "Delivering"].includes(previous))
      return;
    if (next === "Delivered" && !["Prepared", "Delivering"].includes(previous))
      return;
    const updated = { ...mealStatus, [key]: next };
    setMealStatus(updated);
    setStore(MEAL_STATUS_KEY, updated);
    if (next === "Delivered") {
      const careKey = key;
      const careUpdated = { ...careStatus, [careKey]: "Waiting for Nurse" };
      setCareStatus(careUpdated);
      setStore(CARE_STATUS_KEY, careUpdated);
    }
    appendHistoryEvent({
      type: "meal",
      module: "Meal to Bed",
      action: "Delivery Status Changed",
      patientId: row.patient.id,
      patientName: row.patient.name || "",
      meal: activeMeal,
      fromStatus: previous,
      toStatus: next,
      serviceDate,
    });
    syncWorkflowFromMealStatuses(
      row.patient.id,
      serviceDate,
      updated,
      "Meal Delivery",
    );
  };

  const markMealFinished = (row) => {
    if (row.delivery !== "Delivered") return;
    const key = `${serviceDate}-${row.patient.id}-${activeMeal}`;
    const updated = { ...careStatus, [key]: "Intake Pending" };
    setCareStatus(updated);
    setStore(CARE_STATUS_KEY, updated);
    appendHistoryEvent({
      type: "meal",
      module: "Meal to Bed",
      action: "Nurse Marked Meal Finished",
      patientId: row.patient.id,
      patientName: row.patient.name || "",
      meal: activeMeal,
      fromStatus: "Waiting for Nurse",
      toStatus: "Intake Pending",
      serviceDate,
    });
  };

  const openIntake = (row) => {
    if (row.care !== "Intake Pending" && row.care !== "Intake Completed")
      return;
    const existing = row.mealRecord?.foodItems || [];
    const items = row.items.map((item) => {
      const saved = existing.find(
        (x) => Number(x.foodId) === Number(item.foodId),
      );
      return {
        ...item,
        intakePercent:
          saved?.intakePercent === "100%" || saved?.foodStatus === "Eaten"
            ? "Taken"
            : saved?.intakePercent && saved.intakePercent !== "Pending"
              ? "Not Taken"
              : "Pending",
        foodStatus: saved?.foodStatus || "Pending",
        consumedQuantity: saved?.consumedQuantity ?? "",
        foodRemark: saved?.foodRemark || "",
      };
    });
    setSelected(row);
    setIntakeItems(items);
    setIntakeRemark(row.mealRecord?.remarks || "");
    setIssue(row.mealRecord?.issue || "");
    setIntakeOpen(true);
  };

  const updateIntakeItem = (foodId, patch) =>
    setIntakeItems((current) =>
      current.map((item) => {
        if (Number(item.foodId) !== Number(foodId)) return item;
        const next = { ...item, ...patch };
        if (patch.intakePercent) {
          if (patch.intakePercent === "Taken") next.foodStatus = "Eaten";
          else if (patch.intakePercent === "Not Taken")
            next.foodStatus = "Not Eaten";
          else next.foodStatus = "Pending";
          next.consumedQuantity = "";
        }
        return next;
      }),
    );

  const saveIntake = () => {
    if (!selected) return;
    if (
      !intakeItems.length ||
      intakeItems.some((x) => x.intakePercent === "Pending")
    )
      return;
    const key = INTAKE_KEY(selected.patient.id, serviceDate);
    const existing = getStore(key, {
      patientId: selected.patient.id,
      serviceDate,
      meals: [],
      foodItems: [],
    }) || {
      patientId: selected.patient.id,
      serviceDate,
      meals: [],
      foodItems: [],
    };
    const foodStatuses = intakeItems.map((item) => item.foodStatus);
    const mealResult = foodStatuses.every((status) => status === "Eaten")
      ? "Taken"
      : "Not Taken";
    const mealRecord = {
      meal: activeMeal,
      status: mealResult,
      overallStatus: mealResult,
      intake: mealResult,
      foodItems: intakeItems.map((x) => ({
        foodId: x.foodId,
        name: x.name,
        quantity: x.quantity,
        unit: x.unit,
        intakePercent: x.intakePercent,
        consumedQuantity: x.consumedQuantity,
        foodStatus: x.foodStatus,
        foodRemark: x.foodRemark,
        meal: activeMeal,
      })),
      remarks: intakeRemark,
      issue,
      updatedAt: new Date().toISOString(),
    };
    const meals = [
      ...(existing.meals || []).filter((m) => m.meal !== activeMeal),
      mealRecord,
    ];
    const foodItems = [
      ...(existing.foodItems || []).filter((x) => x.meal !== activeMeal),
      ...mealRecord.foodItems,
    ];
    setStore(key, {
      ...existing,
      patientId: selected.patient.id,
      serviceDate,
      meals,
      foodItems,
      overallStatus: mealResult,
      remarks: intakeRemark,
      issue,
      updatedAt: new Date().toISOString(),
    });
    const careKey = `${serviceDate}-${selected.patient.id}-${activeMeal}`;
    const nextCare = { ...careStatus, [careKey]: "Intake Completed" };
    setCareStatus(nextCare);
    setStore(CARE_STATUS_KEY, nextCare);
    const intakeMap = getStore("hd_intake_status", {}) || {};
    const nextIntake = {
      ...intakeMap,
      [careKey]: mealResult,
    };
    setStore("hd_intake_status", nextIntake);
    appendHistoryEvent({
      type: "meal",
      module: "Meal to Bed",
      action: "Item-wise Intake Recorded",
      patientId: selected.patient.id,
      patientName: selected.patient.name || "",
      meal: activeMeal,
      toStatus: "Intake Completed",
      serviceDate,
      intake: mealRecord.intake,
    });
    setIntakeOpen(false);
  };

  return (
    <AppLayout title="Meal to Bed">
      <HospitalPage
        title="Meal Distribution"
        description="Track meal delivery, nursing confirmations, and caregiver intake recording."
        noPadding={true}
      >
        <div className="space-y-4 p-4">
          {counts.nurse > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <Bell className="mt-0.5 text-amber-600" size={20} />
              <div>
                <h2 className="font-bold text-amber-900">Nurse Notification</h2>
                <p className="text-sm text-amber-800">
                  {counts.nurse} delivered meal
                  {counts.nurse === 1 ? " is" : "s are"} waiting for the nurse
                  to confirm that the patient has finished the meal.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Today's Meals",    value: counts.total,     color: "var(--text-primary)" },
            { label: "Packed",           value: counts.packed,    color: "var(--color-info)" },
            { label: "Delivered",        value: counts.delivered, color: "var(--hospital-primary)" },
            { label: "Waiting Nurse",    value: counts.nurse,     color: "var(--color-warning)" },
            { label: "Intake Pending",   value: counts.intake,    color: "var(--color-warning)" },
            { label: "Intake Completed", value: counts.completed, color: "var(--color-success)" },
          ].map(({ label, value, color }) => (
            <div key={label} className="hospital-stat-card" style={{ padding: "var(--space-4)" }}>
              <div>
                <p className="hospital-stat-label">{label}</p>
                <p style={{ fontSize: "1.75rem", fontWeight: 800, color, lineHeight: 1, margin: "var(--space-2) 0 0" }}>{value}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="hospital-filter-panel">
          <div className="hospital-field">
            <label className="hospital-label">Service Date</label>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "0 var(--space-3)", background: "var(--surface)", minHeight: "var(--control-height)" }}>
              <CalendarDays size={15} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
              <input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} style={{ border: 0, background: "transparent", color: "var(--text-primary)", fontSize: "var(--font-body)", outline: "none" }} />
            </div>
          </div>
          <div className="hospital-field" style={{ flex: "2 1 220px" }}>
            <label className="hospital-label">Search</label>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search ward or bed..." className="hospital-input" style={{ paddingLeft: 32 }} />
            </div>
          </div>
          <div className="hospital-field">
            <label className="hospital-label">Ward</label>
            <select value={wardFilter} onChange={(e) => setWardFilter(e.target.value)} className="hospital-select">
              <option>All Wards</option>
              {wards.map((w) => <option key={w}>{w}</option>)}
            </select>
          </div>
          <div className="hospital-field">
            <label className="hospital-label">Meal</label>
            <select value={mealFilter} onChange={(e) => setMealFilter(e.target.value)} className="hospital-select">
              <option>All Meals</option>
              {MEALS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div className="hospital-field">
            <label className="hospital-label">Delivery Status</label>
            <select value={deliveryFilter} onChange={(e) => setDeliveryFilter(e.target.value)} className="hospital-select">
              <option>All Status</option>
              <option>Pending</option>
              <option>Prepared</option>
              <option>Delivering</option>
              <option>Delivered</option>
            </select>
          </div>
        </section>

        <section className="hospital-card" style={{ marginBottom: 0 }}>
          <div className="hospital-card-header">
            <div>
              <h3 className="hospital-card-title">Meal Delivery Workflow</h3>
              <p className="hospital-card-subtitle">Packed → Delivered → Nurse confirms → Caregiver records every food item.</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ward</th>
                  <th className="px-4 py-3">Bed</th>
                  <th className="px-4 py-3">Meal</th>
                  <th className="px-4 py-3">Meal Items</th>
                  <th className="px-4 py-3">Allergy / Meal Tags</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Nurse</th>
                  <th className="px-4 py-3">Intake</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tags = [
                    ...allergyTags(row.patient),
                    ...mealTags(row.patient, row.plan, row.diet),
                  ];
                  const isIntakeOpen =
                    intakeOpen && selected?.patient?.id === row.patient.id;
                  return (
                    <React.Fragment key={`${row.patient.id}-${activeMeal}`}>
                      <tr className="border-t align-top">
                        <td className="px-4 py-3 font-semibold">
                          {row.patient.ward || "—"}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {row.patient.bedNo || row.patient.bed || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold">{activeMeal}</div>
                          <div className="text-[11px] text-slate-500">
                            {row.diet?.name || "Diet not assigned"}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="min-w-[260px] max-w-[360px] space-y-1">
                            {row.items.length ? (
                              row.items.map((item) => (
                                <div
                                  key={item.foodId}
                                  className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5"
                                >
                                  <span className="font-semibold text-slate-800">
                                    {item.name}
                                  </span>
                                  <span className="whitespace-nowrap text-xs font-bold text-slate-600">
                                    {item.quantity || "—"} {item.unit || ""}
                                  </span>
                                </div>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">
                                No meal items configured
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex max-w-[280px] flex-wrap gap-1">
                            {tags.length ? (
                              tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`rounded-full px-2 py-1 text-[10px] font-bold ${tag.startsWith("NO ") ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                                >
                                  {tag}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-slate-400">
                                No special tag
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (!canDeliver) return;
                              if (row.delivery === "Prepared")
                                setDelivery(row, "Delivering");
                              else if (row.delivery === "Delivering")
                                setDelivery(row, "Delivered");
                            }}
                            disabled={
                              !canDeliver ||
                              !["Prepared", "Delivering"].includes(row.delivery)
                            }
                            className="cursor-pointer disabled:cursor-default disabled:opacity-100"
                          >
                            <Status text={row.delivery} />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                !canNurseFinish ||
                                row.delivery !== "Delivered" ||
                                row.care !== "Waiting for Nurse"
                              )
                                return;
                              markMealFinished(row);
                            }}
                            disabled={
                              !canNurseFinish ||
                              row.delivery !== "Delivered" ||
                              row.care !== "Waiting for Nurse"
                            }
                            className="cursor-pointer disabled:cursor-default disabled:opacity-100"
                          >
                            <Status
                              text={
                                row.delivery !== "Delivered"
                                  ? "—"
                                  : row.care === "Waiting for Nurse"
                                    ? "Waiting"
                                    : "Finished"
                              }
                            />
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                row.care !== "Intake Pending" &&
                                row.care !== "Intake Completed"
                              )
                                return;
                              isIntakeOpen
                                ? setIntakeOpen(false)
                                : openIntake(row);
                            }}
                            disabled={false}
                            className="inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <Status
                              text={
                                row.care === "Intake Completed"
                                  ? "Completed"
                                  : row.care === "Intake Pending"
                                    ? "Pending"
                                    : "—"
                              }
                            />
                            {(row.care === "Intake Pending" ||
                              row.care === "Intake Completed") &&
                              (isIntakeOpen ? (
                                <ChevronUp size={14} />
                              ) : (
                                <ChevronDown size={14} />
                              ))}
                          </button>
                        </td>
                      </tr>
                      {isIntakeOpen && (
                        <tr className="border-t bg-slate-50">
                          <td colSpan={8} className="p-4">
                            <div className="rounded-xl border bg-white p-4 shadow-sm">
                              <div className="mb-3 flex items-center justify-between">
                                <div>
                                  <h3 className="font-bold text-slate-900">
                                    Item-wise Food Intake
                                  </h3>
                                  <p className="text-xs text-slate-500">
                                    {row.patient.ward || "—"} • Bed{" "}
                                    {row.patient.bedNo ||
                                      row.patient.bed ||
                                      "—"}{" "}
                                    • {activeMeal}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setIntakeOpen(false)}
                                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                              <div className="mb-3 flex flex-wrap gap-2">
                                {tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${tag.startsWith("NO ") ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                              <div className="overflow-x-auto rounded-lg border">
                                <table className="w-full min-w-[760px] text-sm">
                                  <thead className="bg-slate-50 text-xs text-slate-500">
                                    <tr>
                                      <th className="px-3 py-2 text-left">
                                        Food Item
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Served
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Intake
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Consumed
                                      </th>
                                      <th className="px-3 py-2 text-left">
                                        Remark
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {intakeItems.map((item) => (
                                      <tr
                                        key={item.foodId}
                                        className="border-t align-top"
                                      >
                                        <td className="px-3 py-2 font-semibold">
                                          {item.name}
                                          <div className="text-[10px] font-normal text-slate-500">
                                            {item.category}
                                          </div>
                                        </td>
                                        <td className="px-3 py-2">
                                          {item.quantity} {item.unit}
                                        </td>
                                        <td className="px-3 py-2">
                                          <select
                                            value={item.intakePercent}
                                            onChange={(e) =>
                                              updateIntakeItem(item.foodId, {
                                                intakePercent: e.target.value,
                                              })
                                            }
                                            className="rounded-lg border px-2 py-1.5 text-xs font-semibold"
                                          >
                                            {INTAKE_OPTIONS.map((x) => (
                                              <option key={x}>{x}</option>
                                            ))}
                                          </select>
                                        </td>
                                        <td className="px-3 py-2 font-semibold">
                                          {item.intakePercent === "Not Served"
                                            ? "—"
                                            : item.consumedQuantity
                                              ? `${item.consumedQuantity} ${item.unit}`
                                              : "—"}
                                        </td>
                                        <td className="px-3 py-2">
                                          <input
                                            value={item.foodRemark}
                                            onChange={(e) =>
                                              updateIntakeItem(item.foodId, {
                                                foodRemark: e.target.value,
                                              })
                                            }
                                            placeholder="Optional"
                                            className="w-full min-w-[130px] rounded-lg border px-2 py-1.5 text-xs"
                                          />
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {intakeItems.some(
                                (x) => x.intakePercent === "Pending",
                              ) && (
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                                  Every food item must be recorded before the
                                  intake can be completed.
                                </div>
                              )}
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <label className="text-xs font-semibold text-slate-600">
                                  Meal remark
                                  <textarea
                                    value={intakeRemark}
                                    onChange={(e) =>
                                      setIntakeRemark(e.target.value)
                                    }
                                    className="mt-1 min-h-16 w-full rounded-lg border p-2 text-sm font-normal"
                                    placeholder="Optional caregiver remark"
                                  />
                                </label>
                                <label className="text-xs font-semibold text-slate-600">
                                  Meal / tray issue
                                  <select
                                    value={issue}
                                    onChange={(e) => setIssue(e.target.value)}
                                    className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-normal"
                                  >
                                    <option value="">No issue</option>
                                    <option>Wrong diet</option>
                                    <option>Missing item</option>
                                    <option>Wrong ward / bed</option>
                                    <option>Food spilled</option>
                                    <option>Food cold</option>
                                    <option>Quantity incorrect</option>
                                    <option>Other</option>
                                  </select>
                                </label>
                              </div>
                              <div className="mt-3 flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setIntakeOpen(false)}
                                  className="rounded-lg border px-4 py-2 text-sm font-semibold"
                                >
                                  Close
                                </button>
                                <button
                                  type="button"
                                  disabled={
                                    !canRecordIntake ||
                                    !intakeItems.length ||
                                    intakeItems.some(
                                      (x) => x.intakePercent === "Pending",
                                    )
                                  }
                                  onClick={saveIntake}
                                  className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                                >
                                  Save Intake
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} style={{ padding: "var(--space-8) var(--space-4)", textAlign: "center", fontSize: "var(--font-body)", color: "var(--text-secondary)" }}>
                      No meals found for the selected date and filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}

function Status({ text }) {
  const cls =
    text === "Delivered" || text === "Finished" || text === "Completed" ? "hospital-status-completed" :
    text === "Waiting" || text === "Pending" ? "hospital-status-pending" :
    text === "Prepared" ? "hospital-status-info" :
    text === "Delivering" ? "hospital-status-planning" :
    "hospital-status-inactive";
  return <span className={`hospital-status ${cls}`}>{text}</span>;
}
