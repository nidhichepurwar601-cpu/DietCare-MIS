import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import {
  ClipboardPlus,
  Search,
  Eye,
  Plus,
  Pencil,
  Trash2,
  Download,
  RefreshCw,
  Stethoscope,
  AlertTriangle,
  Activity,
  Baby,
  FileText,
} from "lucide-react";
import MealPlanModal from "../../components/common/MealPlanModal.jsx";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import {
  Modal,
  Toast,
  exportCsv,
  EmptyState,
} from "../../components/common/MvpTools.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";

const PLAN_KEY = "hd_diet_plans";

// Frontend planning rule: new meal plans are prepared one calendar day
// before the meal service date. Existing plans can still be edited without
// changing their dates.
const getTomorrowDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
};
// API-ready clinician allocation helper: Doctor/Dietitian will be populated by the patient API later.
const getAllocatedClinician = (patient) =>
  patient?.allocatedByName ||
  patient?.allocatedBy?.name ||
  patient?.assignedByName ||
  patient?.assignedBy?.name ||
  patient?.dietitian ||
  patient?.doctor ||
  patient?.consultantName ||
  "Not allocated";

const getCurrentMealName = (mealTypes) => {
  const names = [
    "Breakfast",
    "Mid-Morning",
    "Lunch",
    "Evening Snack",
    "Dinner",
    "Bedtime",
  ];
  const active = (mealTypes || [])
    .filter((m) => m.status !== "Inactive" && names.includes(m.name))
    .map((m) => ({
      ...m,
      minutes:
        Number(String(m.time || "00:00").split(":")[0]) * 60 +
        Number(String(m.time || "00:00").split(":")[1] || 0),
    }))
    .sort((a, b) => a.minutes - b.minutes);
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let chosen = active[0]?.name || "Breakfast";
  active.forEach((m) => {
    if (m.minutes <= mins) chosen = m.name;
  });
  return chosen;
};

const blank = {
  patientId: "",
  dietTypeId: "",
  startDate: getTomorrowDate(),
  endDate: "",
  status: "Planning",
  remarks: "",
  planningRemarks: "",
  nursingRemarks: "",
  bedDetails: "",
  planName: "",
  dietTemplateId: "",
  spiceLevel: "Normal",
  foodTemperature: "Warm",
  patientTasteRemark: "",
  allergensText: "",
  specialInstructions: "",
  intestinalDetails: "",
};

export default function DietPlans({ embedded = false } = {}) {
  const [search, setSearch] = useState("");
  const [plans, setPlans] = useState(() => getStore(PLAN_KEY, []));
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [, setStoreVersion] = useState(0);
  // LIVE STORE SYNC: keep diet-plan rows connected to patient/master/workflow changes.
  useEffect(() => {
    const refresh = () => {
      setStoreVersion((version) => version + 1);
      setPlans(getStore(PLAN_KEY, []));
    };
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dietcare-store-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const patients = getStore(KEYS.PATIENTS);
  const dietTypes = getStore(KEYS.DIET_TYPES);
  const dietTemplates = getStore(KEYS.DIET_TEMPLATES, []);
  const mappings = getStore(KEYS.DIET_MAPPING);
  const mealTypes = getStore(KEYS.MEAL_TYPES);
  const foods = getStore(KEYS.FOOD_MASTER);
  const workflows = getStore("hd_diet_workflow", []);
  const patient = (id) => patients.find((x) => String(x.id) === String(id));
  const dietType = (id) => dietTypes.find((x) => String(x.id) === String(id));
  const diet = (id) => dietTemplates.find((x) => String(x.id) === String(id));
  const selectedPatient = patient(form.patientId);
  // Pregnancy workflow is only applicable to female patients; API data may still contain a stale flag for others.
  const isFemalePatient =
    String(selectedPatient?.gender || "")
      .trim()
      .toLowerCase() === "female";
  const isPregnant =
    isFemalePatient &&
    Boolean(
      selectedPatient?.isPregnant ||
      selectedPatient?.pregnancyStatus === "Pregnant",
    );
  const prescriptionDietId =
    selectedPatient?.prescriptionDietTypeId ||
    selectedPatient?.prescription?.dietTypeId ||
    "";
  const prescriptionDiet = dietTemplates.find(
    (t) => String(t.dietTypeId) === String(prescriptionDietId),
  );
  const selectedDietTemplate = diet(form.dietTemplateId);
  // Show the actual previous diet for this patient, not just any different diet.
  const currentEditingPlan =
    mode === "edit"
      ? plans.find((p) => String(p.id) === String(form.id))
      : null;
  const storedPastDiet =
    currentEditingPlan?.dietHistory?.[
      currentEditingPlan.dietHistory.length - 1
    ];
  const pastDietPlan =
    storedPastDiet ||
    plans
      .filter(
        (p) =>
          String(p.patientId) === String(form.patientId) &&
          String(p.id) !== String(form.id) &&
          String(p.dietTypeId) !== String(form.dietTypeId),
      )
      .sort(
        (a, b) =>
          new Date(b.startDate || 0).getTime() -
          new Date(a.startDate || 0).getTime(),
      )[0];
  const pastDiet = diet(pastDietPlan?.dietTypeId);
  // Display-only allocation: this will be supplied by the Doctor/Dietitian API later.
  const allocatedClinician = getAllocatedClinician(selectedPatient);
  const consultantName =
    selectedPatient?.consultantName ||
    selectedPatient?.consultant ||
    selectedPatient?.dietitian ||
    "Not recorded";
  const consultantSpecialty =
    selectedPatient?.consultantSpecialty || "Not recorded";
  const consultantContact =
    selectedPatient?.consultantContact || "Not recorded";
  const allergies =
    Array.isArray(selectedPatient?.allergens) &&
    selectedPatient.allergens.length
      ? selectedPatient.allergens
      : ["None recorded"];
  const intestinalDetails =
    selectedPatient?.intestinalDetails ||
    selectedPatient?.intestinalDetail ||
    "Not recorded";
  const prescriptionInstructions =
    selectedPatient?.prescriptionInstructions ||
    selectedPatient?.prescription?.instructions ||
    "Not recorded";

  useEffect(() => {
    if (!selectedPatient || !isPregnant) return;
    if (
      prescriptionDietId &&
      String(form.dietTypeId) !== String(prescriptionDietId)
    ) {
      setForm((current) => ({
        ...current,
        dietTypeId: String(prescriptionDietId),
      }));
    }
  }, [form.patientId, isPregnant, prescriptionDietId]);
  const derived = patients
    .filter((p) => p.dietTypeId)
    .map((p) => ({
      id: `auto-${p.id}`,
      patientId: p.id,
      dietTypeId: p.dietTypeId,
      startDate: p.admissionDate || "",
      status: p.status || "Active",
      remarks: p.specialInstructions || "",
      auto: true,
    }));
  const all = [...plans, ...derived];
  const rows = useMemo(
    () =>
      all.filter((x) =>
        [
          patient(x.patientId)?.name,
          String(patient(x.patientId)?.id),
          patient(x.patientId)?.ward,
          diet(x.dietTemplateId)?.name,
          x.status,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      ),
    [all, search],
  );
  const persist = (x) => {
    setPlans(x);
    setStore(PLAN_KEY, x);
  };
  const save = (e) => {
    e.preventDefault();
    if (!form.patientId) {
      setToast("Select a patient first.");
      return;
    }
    if (isPregnant && !prescriptionDietId) {
      setToast(
        "Pregnant patient: a consultant prescription diet is required before creating the diet plan.",
      );
      return;
    }
    if (!form.dietTemplateId) {
      setToast("Select a Diet Plan.");
      return;
    }
    if (isPregnant && String(form.dietTypeId) !== String(prescriptionDietId)) {
      setToast("Pregnant patient diet must match the consultant prescription.");
      return;
    }

    // New plans follow the one-day-ahead planning rule. Editing an existing
    // plan is allowed so current operational plans are not disrupted.
    if (mode === "create" && form.startDate < getTomorrowDate()) {
      setToast("New meal plans must be scheduled at least one day in advance.");
      return;
    }
    const workflowKey = "hd_diet_workflow";
    const existingFlowForPatient = getStore(workflowKey, []).find(
      (x) => String(x.patientId) === String(form.patientId),
    );
    const dietChangedAfterExistingWorkflow =
      mode === "edit" &&
      existingFlowForPatient &&
      Number(existingFlowForPatient.dietTypeId) !== Number(form.dietTypeId);
    const workflowStatus =
      mode === "create"
        ? "Planning"
        : mode === "edit" &&
            existingFlowForPatient &&
            !dietChangedAfterExistingWorkflow &&
            existingFlowForPatient.status &&
            existingFlowForPatient.status !== "Cancelled" &&
            !["Assigned", "Not Assigned", "On Hold", "Completed"].includes(
              form.status,
            )
          ? existingFlowForPatient.status
          : form.status || "Planning";
    const nextForm = {
      ...form,
      dietTemplateId: String(form.dietTemplateId),
      planName: String(
        form.planName || selectedDietTemplate?.name || "",
      ).trim(),
      bedDetails: String(
        form.bedDetails ||
          `${selectedPatient?.ward || ""} / ${selectedPatient?.bedNo || selectedPatient?.bed || ""}`,
      ).trim(),
      status: workflowStatus,
      patientTasteRemark: String(form.patientTasteRemark || "").trim(),
    };
    const existingFlow = getStore(workflowKey, []).find(
      (x) => String(x.patientId) === String(nextForm.patientId),
    );
    const flow = {
      ...(existingFlow || {}),
      id: existingFlow?.id || nextForm.id || Date.now(),
      patientId: Number(nextForm.patientId),
      dietTypeId: Number(nextForm.dietTypeId),
      dietTemplateId: Number(nextForm.dietTemplateId),
      planId: nextForm.id || existingFlow?.planId || null,
      status: workflowStatus,
      endDate: nextForm.endDate || "",
      planName: nextForm.planName,
      startDate: nextForm.startDate,
      bedDetails: nextForm.bedDetails,
      planningRemarks: nextForm.planningRemarks || "",
      nursingRemarks: nextForm.nursingRemarks || "",
      patientTasteRemark: nextForm.patientTasteRemark || "",
      spiceLevel: nextForm.spiceLevel || "Normal",
      foodTemperature: nextForm.foodTemperature || "Warm",
      updatedAt: new Date().toISOString(),
    };
    const existingPlan =
      mode === "edit"
        ? plans.find((x) => String(x.id) === String(form.id))
        : null;
    const dietWasChanged =
      existingPlan &&
      String(existingPlan.dietTypeId) !== String(nextForm.dietTypeId);
    const dietHistory = Array.isArray(existingPlan?.dietHistory)
      ? [...existingPlan.dietHistory]
      : [];
    if (
      dietWasChanged &&
      existingPlan?.dietTypeId &&
      !dietHistory.some(
        (item) =>
          String(item.dietTypeId) === String(existingPlan.dietTypeId) &&
          String(item.startDate || "") === String(existingPlan.startDate || ""),
      )
    ) {
      dietHistory.push({
        dietTypeId: existingPlan.dietTypeId,
        startDate: existingPlan.startDate || "",
        endDate: nextForm.endDate || nextForm.startDate || "",
      });
    }
    const savedPlan =
      mode === "edit"
        ? { ...nextForm, dietHistory }
        : { ...nextForm, id: Date.now() };

    // Keep Patient Master, Diet Manager, Clinical Alerts, Dashboard and Delivery/Intake on the same clinical record.
    const parsedAllergens = String(nextForm.allergensText || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const normalizedAllergens = parsedAllergens.length
      ? parsedAllergens
      : ["None"];
    const currentPatient = selectedPatient || patient(nextForm.patientId);
    if (currentPatient) {
      const updatedPatient = {
        ...currentPatient,
        dietTypeId: Number(nextForm.dietTypeId),
        allergens: normalizedAllergens,
        specialInstructions: String(nextForm.specialInstructions || "").trim(),
        intestinalDetails: String(nextForm.intestinalDetails || "").trim(),
        patientTasteRemark: nextForm.patientTasteRemark || "",
        spiceLevel: nextForm.spiceLevel || "Normal",
        foodTemperature: nextForm.foodTemperature || "Warm",
        pastDiet: dietWasChanged
          ? diet(existingPlan?.dietTemplateId)?.name ||
            currentPatient.pastDiet ||
            "No previous diet recorded"
          : currentPatient.pastDiet || "No previous diet recorded",
      };
      const changedFields = [
        "dietTypeId",
        "allergens",
        "specialInstructions",
        "intestinalDetails",
        "patientTasteRemark",
        "spiceLevel",
        "foodTemperature",
        "pastDiet",
      ].filter(
        (field) =>
          JSON.stringify(currentPatient[field] ?? null) !==
          JSON.stringify(updatedPatient[field] ?? null),
      );
      if (changedFields.length) {
        setStore(
          KEYS.PATIENTS,
          patients.map((item) =>
            String(item.id) === String(currentPatient.id)
              ? updatedPatient
              : item,
          ),
        );
        appendHistoryEvent({
          type: "patient_update",
          module: "Diet Manager",
          action: "Patient Clinical/Diet Details Updated",
          patientId: currentPatient.id,
          patientName: currentPatient.name || "",
          changedFields,
          serviceDate: nextForm.startDate || undefined,
        });
      }
    }

    appendHistoryEvent({
      type: "diet_plan",
      module: "Diet Manager",
      action: mode === "edit" ? "Diet Plan Updated" : "Diet Plan Created",
      patientId: nextForm.patientId,
      patientName: selectedPatient?.name || "",
      planId: savedPlan.id || null,
      dietTypeId: nextForm.dietTypeId || null,
      planName: nextForm.planName || "",
      status: workflowStatus,
      previousDietTypeId: dietWasChanged
        ? existingPlan?.dietTypeId || null
        : null,
      serviceDate: nextForm.startDate || undefined,
    });
    if (mode === "edit") {
      persist(plans.map((x) => (x.id === form.id ? savedPlan : x)));
    } else {
      persist([...plans, savedPlan]);
      flow.planId = savedPlan.id;
    }
    const flowList = getStore(workflowKey, []);
    setStore(
      workflowKey,
      flowList.some((x) => String(x.patientId) === String(flow.patientId))
        ? flowList.map((x) =>
            String(x.patientId) === String(flow.patientId) ? flow : x,
          )
        : [...flowList, flow],
    );
    setMode("");
    setToast(
      workflowStatus === "Assigned"
        ? "Diet plan assigned and ready for preparation."
        : workflowStatus === "Draft"
          ? "Diet plan saved as draft."
          : "Diet plan saved. Update the status to Assigned when it is ready for preparation.",
    );
  };
  // Diet Manager edit support: legacy/auto rows are converted into
  // an editable local plan instead of blocking the Edit action. The API can
  // later replace this local materialization without changing the UI.
  const edit = (x) => {
    if (x.auto) {
      const flow = getStore("hd_diet_workflow", []).find(
        (item) => String(item.patientId) === String(x.patientId),
      );
      const editable = {
        ...x,
        id: null,
        status: flow?.status || "Assigned",
        planName: flow?.planName || diet(x.dietTemplateId)?.name || "",
        dietTemplateId: String(flow?.dietTemplateId || x.dietTemplateId || ""),
        startDate: flow?.startDate || x.startDate || getLocalDateKey(),
        bedDetails:
          flow?.bedDetails ||
          `${patient(x.patientId)?.ward || ""} / ${patient(x.patientId)?.bedNo || patient(x.patientId)?.bed || ""}`.trim(),
        planningRemarks: flow?.planningRemarks || "",
        nursingRemarks: flow?.nursingRemarks || "",
        patientTasteRemark: flow?.patientTasteRemark || "",
        spiceLevel: flow?.spiceLevel || "Normal",
        foodTemperature: flow?.foodTemperature || "Warm",
        allergensText: (patient(x.patientId)?.allergens || [])
          .filter((a) => a && a !== "None")
          .join(", "),
        specialInstructions: patient(x.patientId)?.specialInstructions || "",
        intestinalDetails:
          patient(x.patientId)?.intestinalDetails ||
          patient(x.patientId)?.intestinalDetail ||
          "",
      };
      setForm(editable);
      setMode("edit");
      return;
    }
    const p = patient(x.patientId);
    setForm({
      ...x,
      allergensText: (p?.allergens || [])
        .filter((a) => a && a !== "None")
        .join(", "),
      specialInstructions: p?.specialInstructions || "",
      intestinalDetails: p?.intestinalDetails || p?.intestinalDetail || "",
    });
    setMode("edit");
  };
  const remove = (x) => {
    if (x.auto) {
      setToast(
        "This plan is linked to the patient record and cannot be deleted here.",
      );
      return;
    }
    if (confirm("Delete this diet plan?")) {
      persist(plans.filter((p) => p.id !== x.id));
      setToast("Diet plan deleted.");
    }
  };
  const changeStatus = (x) => {
    if (x.auto) return;
    const current = x.status || "Not Assigned";
    const next = current === "Not Assigned" ? "Planning" : "Not Assigned";
    persist(plans.map((p) => (p.id === x.id ? { ...p, status: next } : p)));
    const p = patient(x.patientId) || {};
    appendHistoryEvent({
      type: "diet_plan",
      module: "Diet Manager",
      action: "Diet Plan Status Changed",
      patientId: x.patientId,
      patientName: p.name || "",
      planId: x.id,
      fromStatus: current,
      toStatus: next,
      serviceDate: x.startDate || "",
    });
    setToast(`Diet plan marked ${next}.`);
  };
  // FRONTEND PLANNING SUMMARY: aggregate planned food quantities for the selected service date.
  const parseQuantityNumber = (value) => {
    const raw = String(value ?? "").trim();
    if (!raw) return null;
    const fraction = raw.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (fraction) {
      const denominator = Number(fraction[2]);
      return denominator ? Number(fraction[1]) / denominator : null;
    }
    const mixed = raw.match(
      /^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/,
    );
    if (mixed) {
      const denominator = Number(mixed[3]);
      return denominator
        ? Number(mixed[1]) + Number(mixed[2]) / denominator
        : null;
    }
    const number = Number(raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(number) ? number : null;
  };

  const planningSummary = useMemo(() => {
    const targetDate = getTomorrowDate();
    const targetRows = rows.filter(
      (row) => String(row.startDate || "") === targetDate,
    );
    const totals = new Map();
    let allergyPlans = 0;

    targetRows.forEach((row) => {
      const p = patient(row.patientId) || {};
      const patientAllergens = Array.isArray(p.allergens)
        ? p.allergens.filter((a) => a && String(a).toLowerCase() !== "none")
        : [];
      if (patientAllergens.length) allergyPlans += 1;

      mealTypes
        .filter((meal) => meal.status !== "Inactive")
        .forEach((meal) => {
          const mapping = mappings.find(
            (m) =>
              Number(m.dietTemplateId) === Number(row.dietTemplateId) &&
              Number(m.mealTypeId) === Number(meal.id),
          );
          (mapping?.foodItems || []).forEach((foodId) => {
            const food = foods.find(
              (item) => Number(item.id) === Number(foodId),
            );
            if (!food) return;
            const quantity =
              mapping?.quantityTexts?.[foodId] ??
              mapping?.quantities?.[foodId] ??
              food.standardQuantity ??
              "";
            const unit = mapping?.units?.[foodId] || food.unit || "Unit";
            const key = `${food.name}|||${unit}`;
            const numeric = parseQuantityNumber(quantity);
            const current = totals.get(key) || {
              name: food.name,
              unit,
              numeric: 0,
              hasNumeric: true,
              raw: [],
            };
            if (numeric == null) current.hasNumeric = false;
            else current.numeric += numeric;
            current.raw.push(String(quantity || "—"));
            totals.set(key, current);
          });
        });
    });

    return {
      date: targetDate,
      patients: targetRows.length,
      allergyPlans,
      items: Array.from(totals.values()).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    };
  }, [rows, mealTypes, mappings, foods]);

  const content = (
    <>
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="diet-plans-page space-y-4">
        {/* ── Filter bar ─────────────────────────────────────── */}
        <div className="hospital-filter-panel">
          <div className="hospital-field" style={{ flex: "2 1 280px" }}>
            <label className="hospital-label">Search</label>
            <div style={{ position: "relative" }}>
              <Search size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by patient, ID, ward, diet or status"
                className="hospital-input"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </div>
          <button onClick={() => setSearch("")} className="hospital-button hospital-button-secondary hospital-button-sm">
            <RefreshCw size={14} /> Reset
          </button>
          <button
            onClick={() => exportCsv("diet-plans.csv", rows.map((x) => ({ Patient: patient(x.patientId)?.name, ID: patient(x.patientId)?.id, Ward: patient(x.patientId)?.ward, Diet: diet(x.dietTemplateId)?.name, PlanName: x.planName, Status: x.status, StartDate: x.startDate, PlanningRemarks: x.planningRemarks, NursingRemarks: x.nursingRemarks, BedDetails: x.bedDetails, Remarks: x.remarks, SpiceLevel: x.spiceLevel, FoodTemperature: x.foodTemperature, PatientTasteRemark: x.patientTasteRemark })))}
            className="hospital-button hospital-button-secondary hospital-button-sm"
          >
            <Download size={14} /> Export
          </button>
        </div>
        {/* NUTRITION MEAL PLAN: quick view of the currently scheduled meal and its allocated foods. */}
        {/*{(() => {
          const currentMeal = getCurrentMealName(mealTypes);
          const currentMealType = mealTypes.find((m) => String(m.name).toLowerCase() === currentMeal.toLowerCase());
          const allocations = rows.map((x) => {
            const map = mappings.find((m) => Number(m.dietTemplateId) === Number(x.dietTemplateId) && Number(m.mealTypeId) === Number(currentMealType?.id));
            const items = (map?.foodItems || []).map((id) => { const f = foods.find((food) => Number(food.id) === Number(id)); return f ? { name: f.name, quantity: map?.quantityTexts?.[id] ?? map?.quantities?.[id] ?? f.standardQuantity, unit: map?.units?.[id] || f.unit } : null; }).filter(Boolean);
            return { patient: patient(x.patientId)?.name, plan: x.planName || diet(x.dietTemplateId)?.name, items };
          }).filter((x) => x.items.length);
          return <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Current Meal</div><div className="text-lg font-bold text-slate-900">{currentMeal}</div></div><div className="text-right text-xs text-slate-600">{currentMealType?.time || "Scheduled in Master Data"}<div className="font-semibold text-emerald-800">{allocations.length} patient plan(s) with food allocation</div></div></div><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{allocations.slice(0,6).map((a,i) => <div key={`${a.patient}-${i}`} className="rounded-lg border bg-white p-3"><div className="font-semibold text-slate-800">{a.patient || "Patient"}</div><div className="text-xs text-slate-500">{a.plan}</div><div className="mt-2 text-xs text-slate-700">{a.items.map((item) => `${item.name} · ${item.quantity} ${item.unit}`).join(" • ")}</div></div>)}{!allocations.length && <div className="text-sm text-slate-500">No allocated food found for the current meal.</div>}</div></div>;
        })()}*/}

        <section className="hospital-card border-info bg-info-soft mb-0">
          <div className="hospital-card-header bg-transparent border-info">
            <div>
              <p className="hospital-page-eyebrow text-info mb-1">
                Tomorrow's Planning Summary
              </p>
              <h2 className="hospital-section-title">
                {planningSummary.date}
              </h2>
              <p className="hospital-section-subtitle">
                Aggregated quantities from active food mappings for the next service day.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="hospital-record-count">{planningSummary.patients} patient plans</span>
              <span className="hospital-record-count bg-warning-soft text-warning">{planningSummary.allergyPlans} with allergies</span>
              <span className="hospital-record-count bg-secondary text-secondary">{planningSummary.items.length} food items</span>
            </div>
          </div>
          <div className="hospital-card-body">
            {planningSummary.items.length ? (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {planningSummary.items.slice(0, 12).map((item) => (
                  <div key={`${item.name}-${item.unit}`} className="rounded-sm border border-info bg-surface px-3 py-2">
                    <div className="font-semibold text-body text-primary">{item.name}</div>
                    <div className="text-caption text-secondary">
                      {item.hasNumeric ? `${Number(item.numeric.toFixed(2))} ${item.unit}` : `${item.raw.join(" + ")} ${item.unit}`}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-sm border border-dashed border-border bg-surface p-3 text-body text-secondary">
                No food quantities are mapped for tomorrow yet.
              </div>
            )}
          </div>
        </section>

        <div className="hospital-card mb-0">
          <div className="hospital-card-header">
            <h3 className="hospital-card-title">
              Active Patient Diet Plans{" "}
              <span className="hospital-record-count ml-2">{rows.length}</span>
            </h3>
          </div>
          <DataTable
            columns={[
              {
                key: "patient",
                label: "ID / Patient",
                render: (row) => {
                  const p = patient(row.patientId) || {};
                  return (
                    <div>
                      <div className="font-semibold text-body text-primary">{p.name}</div>
                      <div className="text-caption text-secondary">ID: {p.id}</div>
                      {Array.isArray(p.allergens) && p.allergens.some((a) => a && String(a).toLowerCase() !== "none") && (
                        <span className="hospital-status hospital-status-danger mt-1">
                          <AlertTriangle size={10} /> ALLERGY
                        </span>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "wardBed",
                label: "Ward / Bed",
                render: (row) => {
                  const p = patient(row.patientId) || {};
                  return (
                    <div>
                      <div className="text-body text-primary">{p.ward}</div>
                      <div className="text-caption text-secondary">{p.bedNo || p.bed}</div>
                    </div>
                  );
                },
              },
              {
                key: "dietPlan",
                label: "Diet Plan",
                render: (row) => {
                  const d = diet(row.dietTemplateId) || {};
                  return (
                    <div>
                      <div className="font-semibold text-body text-primary">{d.name}</div>
                      <div className="text-caption text-secondary">{row.planName || "Plan name not set"}</div>
                    </div>
                  );
                },
              },
              {
                key: "plannedFor",
                label: "Planned For",
                render: (row) => (
                  <div>
                    <div className="font-semibold text-body text-primary">{row.startDate || "—"}</div>
                    {row.startDate === getTomorrowDate() && (
                      <span className="hospital-status hospital-status-info mt-1">NEXT DAY</span>
                    )}
                  </div>
                ),
              },
              {
                key: "nutrition",
                label: "Nutrition Target",
                render: (row) => {
                  const d = diet(row.dietTemplateId) || {};
                  return (
                    <details>
                      <summary className="cursor-pointer font-semibold text-body text-primary list-none">
                        {d.calories || "—"} kcal/day
                      </summary>
                      <div className="text-caption text-secondary mt-1">
                        P {d.proteinPct || 0}% · C {d.carbsPct || 0}% · F {d.fatPct || 0}%
                      </div>
                    </details>
                  );
                },
              },
              {
                key: "tracker",
                label: "Tracker",
                render: (row) => {
                  const tracker = workflows.find((flow) => String(flow.patientId) === String(row.patientId))?.status || (row.status === "Active" ? "Assigned" : row.status);
                  return (
                    <span className={`hospital-status ${tracker === "Delivered" ? "hospital-status-completed" : tracker === "Prepared" ? "hospital-status-info" : tracker === "Preparing" ? "hospital-status-pending" : "hospital-status-planning"}`}>
                      {tracker}
                    </span>
                  );
                },
              },
              {
                key: "status",
                label: "Status",
                render: (row) => (
                  <button
                    onClick={() => changeStatus(row)}
                    title="Click to change status"
                    className={`hospital-status border-none cursor-pointer bg-transparent ${row.status === "Planning" || row.status === "Active" ? "hospital-status-active" : row.status === "Completed" ? "hospital-status-inactive" : "hospital-status-pending"}`}
                  >
                    {row.status === "Active" ? "Planning" : row.status || "Not Assigned"}
                  </button>
                ),
              },
              {
                key: "actions",
                label: "",
                sortable: false,
                className: "text-right",
                render: (row) => (
                  <div className="flex justify-end gap-2">
                    <button type="button" title="View meal plan" onClick={(e) => { e.preventDefault(); setSelected({ ...row, dietTypeId: Number(row.dietTypeId) }); setMode("view"); }} className="icon-btn min-w-[30px] min-h-[30px]">
                      <Eye size={14} />
                    </button>
                    <button type="button" title="Edit" onClick={() => edit(row)} className="icon-btn min-w-[30px] min-h-[30px] text-info">
                      <Pencil size={14} />
                    </button>
                    <button type="button" title="Delete" onClick={() => remove(row)} className="icon-btn min-w-[30px] min-h-[30px] text-error">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ),
              },
            ]}
            data={rows}
            pagination={10}
            emptyMessage="No diet plans found."
            emptyDescription="Adjust filters or add a new plan."
          />
        </div>
      </div>
      {mode === "create" || mode === "edit" ? (
        <Modal
          title={mode === "edit" ? "Edit Diet Plan" : "Create Diet Plan"}
          onClose={() => setMode("")}
          wide
          noScroll
        >
          <form onSubmit={save} className="space-y-3">
            <div className="grid gap-4 lg:grid-cols-[0.92fr_1.35fr]">
              {/* LEFT: patient context only */}
              <aside className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                    Patient Context
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Clinical information is read-only in Diet Manager.
                  </div>
                </div>

                {mode === "create" ? (
                  <label className="mb-3 block text-sm font-medium">
                    Patient
                    <select
                      value={form.patientId}
                      onChange={(e) => {
                        const nextPatient = patient(e.target.value);
                        setForm({
                          ...form,
                          patientId: e.target.value,
                          allergensText: (nextPatient?.allergens || [])
                            .filter((a) => a && a !== "None")
                            .join(", "),
                          specialInstructions:
                            nextPatient?.specialInstructions || "",
                          intestinalDetails:
                            nextPatient?.intestinalDetails ||
                            nextPatient?.intestinalDetail ||
                            "",
                        });
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
                    >
                      <option value="">Select patient</option>
                      {patients.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · ID {p.id}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <div className="mb-3 rounded-lg border border-blue-200 bg-white p-3">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Patient
                    </div>
                    <div className="mt-1 text-base font-bold text-slate-900">
                      {selectedPatient?.name || "—"}
                    </div>
                    <div className="text-xs text-slate-500">
                      Patient ID: {selectedPatient?.id || "—"}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5">
                  <Info
                    l="Ward / Bed"
                    v={`${selectedPatient?.ward || "—"} / ${selectedPatient?.bedNo || selectedPatient?.bed || "—"}`}
                  />
                  <Info l="Diagnosis" v={selectedPatient?.primaryDiagnosis} />
                  <Info l="Doctor / Dietitian" v={allocatedClinician} />
                  <Info
                    l="BMI"
                    v={selectedPatient?.bmi || selectedPatient?.BMI || "—"}
                  />
                </div>

                <div
                  className={`mt-3 rounded-lg border p-3 ${
                    allergies.some(
                      (a) => a && String(a).toLowerCase() !== "none recorded",
                    )
                      ? "border-rose-300 bg-rose-50"
                      : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Allergies
                  </div>
                  <div
                    className={`mt-1 flex items-start gap-1 text-sm font-semibold ${
                      allergies.some(
                        (a) => a && String(a).toLowerCase() !== "none recorded",
                      )
                        ? "text-rose-800"
                        : "text-slate-800"
                    }`}
                  >
                    {allergies.some(
                      (a) => a && String(a).toLowerCase() !== "none recorded",
                    ) && (
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    )}
                    <span>{allergies.join(", ") || "None recorded"}</span>
                  </div>
                </div>

                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      Past History
                    </div>
                    <span className="text-[10px] font-semibold text-slate-400">
                      Read only
                    </span>
                  </div>
                  <p className="mt-1.5 line-clamp-4 text-xs leading-5 text-slate-700">
                    {selectedPatient?.history || "No past history recorded."}
                  </p>
                </div>

                <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                    Past Diet / Diet History
                  </div>
                  {pastDiet ? (
                    <div className="mt-1.5">
                      <div className="text-sm font-bold text-slate-900">
                        {pastDiet.name}
                      </div>
                      {pastDietPlan?.startDate && (
                        <div className="text-[11px] text-slate-500">
                          {pastDietPlan.startDate}
                          {pastDietPlan.endDate
                            ? ` – ${pastDietPlan.endDate}`
                            : ""}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1.5 text-xs text-slate-500">
                      No previous diet recorded.
                    </div>
                  )}
                </div>
              </aside>

              {/* RIGHT: editable diet plan only */}
              <section className="min-w-0">
                <div className="mb-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
                  <div className="text-sm font-bold text-blue-900">
                    Diet Plan Assignment
                  </div>
                  <div className="mt-0.5 text-xs text-blue-700">
                    {mode === "create"
                      ? "New meal plans are scheduled for the next service day."
                      : "Update the patient-specific diet plan without changing Patient Master data."}
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-sm font-medium">
                    {isPregnant ? "Prescription Diet Plan" : "Diet Template"}
                    {isPregnant ? (
                      <div className="mt-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
                        {prescriptionDiet?.name ||
                          "No prescription diet recorded"}
                      </div>
                    ) : (
                      <select
                        value={form.dietTemplateId}
                        onChange={(e) => {
                          const dietTemplateId = e.target.value;
                          const template = diet(dietTemplateId);
                          setForm({
                            ...form,
                            dietTemplateId,
                            dietTypeId: template?.dietTypeId || "",
                          });
                        }}
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      >
                        <option value="">Select diet</option>
                        {dietTemplates
                          .filter((d) => d.status !== "Inactive")
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.name}
                            </option>
                          ))}
                      </select>
                    )}
                  </label>

                  <label className="text-sm font-medium">
                    Plan Name
                    <input
                      value={form.planName || selectedDietTemplate?.name || ""}
                      onChange={(e) =>
                        setForm({ ...form, planName: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      placeholder="e.g. Cardiac Diet - Low Sodium"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Planned Service Date
                    <input
                      type="date"
                      min={mode === "create" ? getTomorrowDate() : undefined}
                      value={form.startDate}
                      onChange={(e) =>
                        setForm({ ...form, startDate: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    End Date
                    <input
                      type="date"
                      value={form.endDate || ""}
                      min={form.startDate || undefined}
                      onChange={(e) =>
                        setForm({ ...form, endDate: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                    />
                  </label>

                  <label className="text-sm font-medium">
                    Assignment Status
                    <select
                      value={form.status}
                      onChange={(e) =>
                        setForm({ ...form, status: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                    >
                      <option>Planning</option>
                      <option>Draft</option>
                      <option>On Hold</option>
                      <option>Completed</option>
                    </select>
                  </label>
                </div>

                <section className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5">
                  <div className="mb-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Clinical Safety
                    </h3>
                    <p className="text-[11px] text-slate-600">
                      Edit plan-level safety instructions only.
                    </p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium">
                      Allergies
                      <input
                        value={form.allergensText || ""}
                        onChange={(e) =>
                          setForm({ ...form, allergensText: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
                        placeholder="Dairy, Nuts"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Special Instructions
                      <input
                        value={form.specialInstructions || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            specialInstructions: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
                        placeholder="Dietary safety instruction"
                      />
                    </label>
                    <label className="text-sm font-medium md:col-span-2">
                      Intestinal / GI Details
                      <textarea
                        value={form.intestinalDetails || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            intestinalDetails: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2.5"
                        rows={1}
                        placeholder="Constipation, diarrhoea, swallowing or other GI details"
                      />
                    </label>
                  </div>
                </section>

                <section className="mt-3 rounded-xl border border-slate-200 bg-white p-3.5">
                  <h3 className="mb-2 text-sm font-bold text-slate-900">
                    Preferences & Remarks
                  </h3>
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="text-sm font-medium">
                      Spice Level
                      <select
                        value={form.spiceLevel || "Normal"}
                        onChange={(e) =>
                          setForm({ ...form, spiceLevel: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      >
                        <option>Normal</option>
                        <option>Less Spicy</option>
                        <option>No Spice</option>
                        <option>Spicy</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium">
                      Food Temperature
                      <select
                        value={form.foodTemperature || "Warm"}
                        onChange={(e) =>
                          setForm({ ...form, foodTemperature: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      >
                        <option>Hot</option>
                        <option>Warm</option>
                        <option>Room Temperature</option>
                        <option>Chilled</option>
                        <option>Cold</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium md:col-span-2">
                      Patient Taste / Food Preference
                      <input
                        value={form.patientTasteRemark || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            patientTasteRemark: e.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                        placeholder="Patient preference"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Bed Details
                      <input
                        value={
                          form.bedDetails ||
                          `${selectedPatient?.ward || ""} / ${selectedPatient?.bedNo || selectedPatient?.bed || ""}`
                        }
                        onChange={(e) =>
                          setForm({ ...form, bedDetails: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                        placeholder="Ward / Bed"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Planning Remarks
                      <input
                        value={form.planningRemarks || ""}
                        onChange={(e) =>
                          setForm({ ...form, planningRemarks: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      Nursing Remarks
                      <input
                        value={form.nursingRemarks || ""}
                        onChange={(e) =>
                          setForm({ ...form, nursingRemarks: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    </label>
                    <label className="text-sm font-medium">
                      General Remarks
                      <input
                        value={form.remarks || ""}
                        onChange={(e) =>
                          setForm({ ...form, remarks: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 p-2.5"
                      />
                    </label>
                  </div>
                </section>
              </section>
            </div>

            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: "var(--border)" }}>
              <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
                Patient clinical context is read-only. Changes apply to this Diet Plan.
              </div>
              <div className="flex shrink-0 gap-2">
                <button type="button" onClick={() => setMode("")} className="hospital-button hospital-button-secondary">Cancel</button>
                <button className="hospital-button">{mode === "edit" ? "Update Plan" : "Save Plan"}</button>
              </div>
            </div>
          </form>
        </Modal>
      ) : null}
      {/* Show meal plan template when viewing a plan (patient details removed) */}
      {mode === "view" && selected && (
        <MealPlanModal
          isOpen={true}
          onClose={() => setMode("")}
          diet={diet(selected.dietTemplateId)}
          mappings={mappings}
          mealTypes={mealTypes}
          foods={foods}
          allergens={patient(selected.patientId)?.allergens || ["None"]}
          patientId={selected.patientId || null}
        />
      )}
    </>
  );

  if (embedded) return content;
  return (
    <AppLayout title="Patient Meal Plans">
      <HospitalPage
        title="Nutrition Meal Plan"
        description="Comprehensive view and management of all patient diet assignments."
      >
        {content}
      </HospitalPage>
    </AppLayout>
  );
}
const Info = ({ l, v }) => (
  <div>
    <div style={{ fontSize: "var(--font-label)", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--text-secondary)" }}>{l}</div>
    <div style={{ marginTop: "var(--space-1)", fontWeight: 600, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>{v || "—"}</div>
  </div>
);
