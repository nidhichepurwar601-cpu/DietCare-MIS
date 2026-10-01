import React, { useEffect, useMemo, useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import {
  ClipboardPlus,
  Search,
  Eye,
  Plus,
  Pencil,
  Download,
  RefreshCw,
  Stethoscope,
  AlertTriangle,
  Activity,
  Baby,
  FileText,
  X,
  CalendarDays,
} from "lucide-react";
import MealPlanModal from "../../components/common/MealPlanModal.jsx";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import { getClinicalAlertsForPatient } from "../../lib/clinicalAlerts.js";
import {
  Toast,
  exportCsv,
  EmptyState,
} from "../../components/common/MvpTools.jsx";

const PLAN_KEY = "hd_diet_plans";
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

const getHistoryFlow = (history = "") => {
  const paragraphs = String(history)
    .split(/\n\s*\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  const titles = [
    "Medical Background",
    "Previous Treatment & Symptoms",
    "Follow-up & Investigations",
    "Lifestyle & Adherence",
    "Functional & Social History",
    "Previous Advice",
    "Additional History",
  ];

  return paragraphs.map((text, index) => ({
    title: titles[index] || `Clinical History ${index + 1}`,
    text,
  }));
};

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
  startDate: getLocalDateKey(),
  endDate: "",
  status: "Not Assigned",
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

export default function DietManagerReference({ embedded = false } = {}) {
  const [search, setSearch] = useState("");
  const [wardFilter, setWardFilter] = useState("All Wards");
  const [dietFilter, setDietFilter] = useState("All Diet Plans");
  const [statusFilter, setStatusFilter] = useState("All Status");
  const [plans, setPlans] = useState(() => getStore(PLAN_KEY, []));
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
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
  const storedPastDiet = Array.isArray(currentEditingPlan?.dietHistory)
    ? currentEditingPlan.dietHistory[currentEditingPlan.dietHistory.length - 1]
    : null;
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
  // Diet Manager is assignment-first: a patient can exist without an assigned
  // Diet Plan. Patient.dietTypeId remains useful as clinical/master context,
  // but it must not silently turn the Diet Manager row into an assignment.
  const rows = useMemo(() => {
    const activePatients = patients.filter(
      (p) => String(p.status || "Active").toLowerCase() !== "discharged",
    );
    return activePatients
      .map((p) => {
        const patientPlans = plans
          .filter((x) => String(x.patientId) === String(p.id))
          .sort(
            (a, b) =>
              new Date(b.updatedAt || b.startDate || 0).getTime() -
              new Date(a.updatedAt || a.startDate || 0).getTime(),
          );
        const plan = patientPlans[0];
        const flow = workflows.find(
          (x) => String(x.patientId) === String(p.id),
        );
        const assigned =
          !!plan ||
          [
            "Assigned",
            "Approved",
            "Preparing",
            "Prepared",
            "Delivering",
            "Delivered",
          ].includes(flow?.status);
        return {
          ...(plan || {
            id: `patient-${p.id}`,
            patientId: p.id,
            dietTypeId: p.dietTypeId || "",
            dietTemplateId: "",
            startDate: "",
            endDate: "",
            planName: "",
          }),
          patientId: p.id,
          assignmentStatus: assigned ? "Assigned" : "Not Assigned",
          status: assigned ? "Assigned" : "Not Assigned",
          workflowStatus: flow?.status || "Not Assigned",
          auto: !plan,
        };
      })
      .filter((x) =>
        [
          patient(x.patientId)?.name,
          String(patient(x.patientId)?.id),
          patient(x.patientId)?.ward,
          dietType(x.dietTypeId)?.name,
          x.assignmentStatus,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search.toLowerCase()),
      )
      .filter(
        (x) =>
          wardFilter === "All Wards" ||
          patient(x.patientId)?.ward === wardFilter,
      )
      .filter(
        (x) =>
          dietFilter === "All Diet Plans" ||
          dietType(x.dietTypeId)?.name === dietFilter,
      )
      .filter(
        (x) =>
          statusFilter === "All Status" || x.assignmentStatus === statusFilter,
      );
  }, [
    patients,
    plans,
    workflows,
    search,
    wardFilter,
    dietFilter,
    statusFilter,
  ]);
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
    const workflowKey = "hd_diet_workflow";
    const existingFlowForPatient = getStore(workflowKey, []).find(
      (x) => String(x.patientId) === String(form.patientId),
    );
    // Step 1 has only two assignment states. Saving a plan always makes it
    // available to Kitchen Operations as Assigned; operational meal statuses
    // are tracked separately by the kitchen/delivery modules.
    const workflowStatus = "Assigned";
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

  const content = (
    <>
      <Toast message={toast} onClose={() => setToast("")} />
      <div className="space-y-4">
        <div className="hospital-card" data-card-style="outlined">
          <div className="hospital-card-header">
            <div>
              <h2 className="hospital-card-title">
                Patient Diet Overview
              </h2>
              <p className="hospital-card-subtitle">
                View and manage diet assignment status for all patients.
              </p>
            </div>
          </div>
          <div className="hospital-card-body">
            {/*<button
              type="button"
              onClick={() => {
                const first = rows.find((x) => x.assignmentStatus === "Not Assigned") || rows[0];
                if (first) {
                  const p = patient(first.patientId);
                  setForm({
                    ...blank,
                    patientId: String(first.patientId),
                    dietTypeId: String(p?.dietTypeId || ""),
                    dietTemplateId: String(dietTemplates.find((t) => Number(t.dietTypeId) === Number(p?.dietTypeId))?.id || ""),
                    allergensText: (p?.allergens || []).filter((a) => a && a !== "None").join(", "),
                    specialInstructions: p?.specialInstructions || "",
                    intestinalDetails: p?.intestinalDetails || p?.intestinalDetail || "",
                    bedDetails: `${p?.ward || ""} / ${p?.bedNo || p?.bed || ""}`.trim(),
                  });
                  setMode("create");
                }
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              <Plus size={17} /> Assign Diet Plan
            </button>*/}
          </div>
          <div className="hospital-filter-panel mb-4">
            <label className="hospital-field">
              <span>Ward</span>
              <select
                value={wardFilter}
                onChange={(e) => setWardFilter(e.target.value)}
                className="hospital-select"
              >
                <option>All Wards</option>
                {[...new Set(patients.map((p) => p.ward).filter(Boolean))].map(
                  (ward) => (
                    <option key={ward}>{ward}</option>
                  ),
                )}
              </select>
            </label>
            <label className="hospital-field">
              <span>Diet Plan</span>
              <select
                value={dietFilter}
                onChange={(e) => setDietFilter(e.target.value)}
                className="hospital-select"
              >
                <option>All Diet Plans</option>
                {[...new Set(dietTypes.map((d) => d.name).filter(Boolean))].map(
                  (name) => (
                    <option key={name}>{name}</option>
                  ),
                )}
              </select>
            </label>
            <label className="hospital-field">
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="hospital-select"
              >
                <option>All Status</option>
                <option>Assigned</option>
                <option>Not Assigned</option>
              </select>
            </label>
            <div className="hospital-field" style={{ minWidth: 240, position: "relative" }}>
              <Search
                className="absolute left-3 top-[50%] -translate-y-1/2 text-gray-400"
                size={17}
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient or ID..."
                className="hospital-input pl-10"
              />
            </div>
          </div>
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

        <DataTable
          columns={[
            {
              key: "patientId",
              label: "Patient ID",
              render: (row) => <span className="font-medium">{row.patientId}</span>,
            },
            {
              key: "patientName",
              label: "Patient",
              render: (row) => <span className="font-semibold">{patient(row.patientId)?.name}</span>,
            },
            {
              key: "wardBed",
              label: "Ward / Bed",
              render: (row) => {
                const p = patient(row.patientId);
                return (
                  <div>
                    {p?.ward || "—"}
                    <div className="text-xs text-gray-500">{p?.bedNo || p?.bed || "—"}</div>
                  </div>
                );
              },
            },
            {
              key: "dietPlan",
              label: "Diet Plan",
              render: (row) => dietType(row.dietTypeId)?.name || "Not Selected",
            },
            {
              key: "dietitian",
              label: "Dietitian / Doctor",
              render: (row) => getAllocatedClinician(patient(row.patientId)),
            },
            {
              key: "assignmentStatus",
              label: "Assignment Status",
              render: (row) => (
                <span
                  className={`hospital-status ${
                    row.assignmentStatus === "Assigned"
                      ? "hospital-status-active"
                      : "hospital-status-inactive"
                  }`}
                >
                  {row.assignmentStatus}
                </span>
              ),
            },
            {
              key: "startDate",
              label: "Plan Start Date",
              render: (row) => row.startDate || "—",
            },
            {
              key: "endDate",
              label: "Plan End Date",
              render: (row) => row.endDate || "—",
            },
            {
              key: "actions",
              label: "Actions",
              sortable: false,
              className: "text-right",
              render: (row) => (
                <div className="flex justify-end gap-2">
                  <button
                    title="View meal plan"
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setSelected({
                        ...row,
                        dietTypeId: Number(row.dietTypeId),
                        dietTemplateId:
                          row.dietTemplateId ||
                          dietTemplates.find(
                            (t) => Number(t.dietTypeId) === Number(row.dietTypeId),
                          )?.id ||
                          "",
                      });
                      setMode("view");
                    }}
                    className="icon-btn"
                  >
                    <Eye size={16} />
                  </button>
                  <button
                    title={
                      row.assignmentStatus === "Assigned"
                        ? "Edit"
                        : "Create / Assign Diet Plan"
                    }
                    onClick={() => {
                      if (row.auto) {
                        const p = patient(row.patientId);
                        setForm({
                          ...blank,
                          patientId: String(row.patientId),
                          dietTypeId: String(p?.dietTypeId || ""),
                          dietTemplateId: String(
                            dietTemplates.find(
                              (t) => Number(t.dietTypeId) === Number(p?.dietTypeId),
                            )?.id || "",
                          ),
                          allergensText: (p?.allergens || [])
                            .filter((a) => a && a !== "None")
                            .join(", "),
                          specialInstructions: p?.specialInstructions || "",
                          intestinalDetails:
                            p?.intestinalDetails || p?.intestinalDetail || "",
                          bedDetails: `${p?.ward || ""} / ${p?.bedNo || p?.bed || ""}`.trim(),
                        });
                        setMode("create");
                      } else {
                        edit(row);
                      }
                    }}
                    className="icon-btn text-[var(--hospital-primary)]"
                  >
                    <Pencil size={16} />
                  </button>
                </div>
              ),
            },
          ]}
          data={rows}
          pagination={10}
          emptyMessage="No patients found"
          emptyDescription="Adjust filters or check patient records."
        />
      </div>
      {mode === "create" || mode === "edit" ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-2 sm:p-3"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMode("");
          }}
        >
          <div
            className="flex h-[88vh] w-full max-w-[1250px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* =========================================================
          HEADER
      ========================================================== */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900">
                    {mode === "edit" ? "Edit Diet Plan" : "Assign Diet Plan"}
                  </h2>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      mode === "edit"
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {mode === "edit" ? "ASSIGNED" : "NEW ASSIGNMENT"}
                  </span>
                </div>

                <div className="mt-1 h-0.5 w-10 bg-emerald-600" />
              </div>

              <button
                type="button"
                onClick={() => setMode("")}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={21} />
              </button>
            </div>

            {/* =========================================================
          MAIN CONTENT
          No nested scrolling on normal desktop screens
      ========================================================== */}
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[31%_69%]">
              {/* =======================================================
            LEFT — PATIENT CONTEXT
        ======================================================== */}
              <div className="min-h-0 border-b border-slate-200 bg-slate-50 lg:border-b-0 lg:border-r">
                <div className="h-full p-4">
                  {/* Patient heading */}
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        Patient Context
                      </h3>

                      <p className="text-[11px] text-slate-500">
                        Clinical information is read-only.
                      </p>
                    </div>

                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-slate-500">
                      READ ONLY
                    </span>
                  </div>

                  {/* ===================================================
                BASIC PATIENT INFORMATION
            ==================================================== */}
                  <section className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-2 gap-x-5 gap-y-3">
                      <Info
                        l="PATIENT"
                        v={selectedPatient?.name || "Not selected"}
                      />

                      <Info l="ID" v={selectedPatient?.id || "—"} />

                      <Info
                        l="WARD / BED"
                        v={
                          selectedPatient
                            ? `${selectedPatient.ward || "—"} / ${
                                selectedPatient.bedNo ||
                                selectedPatient.bed ||
                                "—"
                              }`
                            : "—"
                        }
                      />

                      <Info l="DOCTOR / DIETITIAN" v={allocatedClinician} />

                      <Info
                        l="DIAGNOSIS"
                        v={
                          selectedPatient?.primaryDiagnosis ||
                          selectedPatient?.diagnosis ||
                          "Not recorded"
                        }
                      />

                      <Info
                        l="BMI"
                        v={selectedPatient?.bmi || "Not recorded"}
                      />
                    </div>

                    {/* Allergies */}
                    <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-red-700">
                        ALLERGIES
                      </div>

                      <div className="mt-0.5 text-sm font-semibold text-red-900">
                        {allergies.join(", ")}
                      </div>
                    </div>
                  </section>

                  {/* ===================================================
                CLINICAL SUMMARY
            ==================================================== */}
                  <section className="mt-3 grid grid-cols-2 gap-3">
                    {/* Past history */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <div className="mb-1.5 flex items-center justify-between">
                        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          Past History
                        </h3>

                        <span className="text-[9px] text-slate-400">
                          Clinical record
                        </span>
                      </div>

                      <div className="line-clamp-6 whitespace-pre-line text-xs leading-5 text-slate-600">
                        {selectedPatient?.history ||
                          selectedPatient?.pastHistory ||
                          "No past history recorded."}
                      </div>

                      {(selectedPatient?.history ||
                        selectedPatient?.pastHistory) && (
                        <button
                          type="button"
                          onClick={() => setHistoryOpen(true)}
                          className="mt-2 text-xs font-semibold text-blue-700 hover:text-blue-800"
                        >
                          View Full History →
                        </button>
                      )}
                    </div>

                    {/* Previous diet */}
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-600">
                        Previous Diet
                      </h3>

                      <div className="mt-2 text-sm font-semibold text-emerald-700">
                        {selectedPatient?.pastDiet ||
                          pastDiet?.name ||
                          "No previous diet recorded"}
                      </div>

                      <div className="mt-3 space-y-2">
                        <Info
                          l="PRESCRIPTION"
                          v={prescriptionDiet?.name || "Not recorded"}
                        />

                        <Info
                          l="CALORIE REQUIREMENT"
                          v={
                            selectedPatient?.calorieRequirement
                              ? `${selectedPatient.calorieRequirement} kcal/day`
                              : selectedDietTemplate?.calories
                                ? `${selectedDietTemplate.calories} kcal/day`
                                : "Not recorded"
                          }
                        />
                      </div>
                    </div>
                  </section>

                  {/* ===================================================
                CLINICAL ALERTS
            ==================================================== */}
                  <section className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-[10px] font-bold uppercase tracking-wide text-amber-800">
                        Clinical Alerts
                      </h3>

                      <AlertTriangle size={15} className="text-amber-600" />
                    </div>

                    <div className="space-y-1.5">
                      {selectedPatient &&
                      getClinicalAlertsForPatient(selectedPatient.id).length ? (
                        getClinicalAlertsForPatient(selectedPatient.id)
                          .slice(0, 3)
                          .map((alert) => (
                            <div
                              key={alert.id}
                              className="text-[11px] leading-4 text-slate-700"
                            >
                              <span className="font-bold">
                                {alert.severity}:
                              </span>{" "}
                              {alert.message}
                            </div>
                          ))
                      ) : (
                        <div className="text-[11px] text-slate-500">
                          No active clinical alerts.
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              </div>

              {/* =======================================================
            RIGHT — DIET PLAN FORM
        ======================================================== */}
              <div className="min-h-0 overflow-hidden">
                <form onSubmit={save} className="flex h-full flex-col">
                  {/* Form header */}
                  <div className="shrink-0 border-b border-slate-200 px-5 py-3">
                    <h3 className="text-sm font-bold text-emerald-700">
                      Diet Plan Details
                    </h3>

                    <p className="text-[11px] text-slate-500">
                      Configure the diet plan and dietary instructions.
                    </p>
                  </div>

                  {/* =================================================
                FORM BODY
            ================================================== */}
                  <div className="min-h-0 flex-1 px-5 py-3">
                    {/* =================================================
                  PLAN DETAILS
              ================================================== */}
                    <section className="border-b border-slate-200 pb-3">
                      <div className="grid grid-cols-12 gap-3">
                        {/* Diet Template */}
                        <label className="col-span-7 text-xs font-semibold text-slate-700">
                          Diet Template
                          {isPregnant ? (
                            <div className="mt-1 flex h-[38px] items-center rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900">
                              {prescriptionDiet?.name ||
                                "No prescription diet recorded"}
                            </div>
                          ) : (
                            <select
                              value={form.dietTemplateId || ""}
                              onChange={(e) => {
                                const dietTemplateId = e.target.value;
                                const template = diet(dietTemplateId);

                                setForm((current) => ({
                                  ...current,
                                  dietTemplateId,
                                  dietTypeId: template?.dietTypeId
                                    ? String(template.dietTypeId)
                                    : "",
                                  planName: template?.name || "",
                                }));
                              }}
                              className="mt-1 h-[38px] w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-normal outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="">Select diet template</option>

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

                        {/* Plan Name — automatically linked to Diet Template */}
                        <div className="col-span-5 text-xs font-semibold text-slate-700">
                          Plan Name
                          <div className="mt-1 flex h-[38px] items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
                            {selectedDietTemplate?.name ||
                              prescriptionDiet?.name ||
                              "Select a diet template"}
                          </div>
                          <p className="mt-1 text-[10px] font-normal text-slate-400">
                            Automatically taken from the selected diet template.
                          </p>
                        </div>

                        {/* Plan name */}
                        {/*  <label className="col-span-4 text-xs font-semibold text-slate-700">
                          Plan Name
                          <input
                            value={
                              form.planName || selectedDietTemplate?.name || ""
                            }
                            onChange={(e) =>
                              setForm({
                                ...form,
                                planName: e.target.value,
                              })
                            }
                            className="mt-1 h-[38px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            placeholder="Enter plan name"
                          />
                        </label> */}

                        {/* Start */}
                        <label className="col-span-3 text-xs font-semibold text-slate-700">
                          Start Date
                          <input
                            type="date"
                            value={form.startDate || ""}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                startDate: e.target.value,
                              })
                            }
                            className="mt-1 h-[38px] w-full rounded-md border border-slate-300 px-2 text-xs font-normal outline-none focus:border-emerald-500"
                          />
                        </label>

                        {/* End */}
                        <label className="col-span-3 text-xs font-semibold text-slate-700">
                          End Date
                          <input
                            type="date"
                            value={form.endDate || ""}
                            min={form.startDate || undefined}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                endDate: e.target.value,
                              })
                            }
                            className="mt-1 h-[38px] w-full rounded-md border border-slate-300 px-2 text-xs font-normal outline-none focus:border-emerald-500"
                          />
                        </label>

                        {/* Status */}
                        <div className="col-span-4 text-xs font-semibold text-slate-700">
                          Assignment Status
                          <div className="mt-1 flex h-[38px] items-center rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-800">
                            ASSIGNED
                          </div>
                        </div>

                        {/* Empty spacer */}
                        <div className="col-span-5" />
                      </div>
                    </section>

                    {/* =================================================
                  SAFETY + PREFERENCES
              ================================================== */}
                    <div className="grid grid-cols-2 gap-4 border-b border-slate-200 py-3">
                      {/* Clinical safety */}
                      <section>
                        <div className="mb-2 flex items-center justify-between">
                          <h3 className="text-xs font-bold text-amber-700">
                            Clinical Safety
                          </h3>

                          <span className="text-[10px] font-semibold text-amber-600">
                            Safety first
                          </span>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Allergies
                            <input
                              value={form.allergensText || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  allergensText: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500"
                              placeholder="Seafood, Gluten"
                            />
                          </label>

                          <label className="block text-xs font-semibold text-slate-700">
                            Special Instructions
                            <input
                              value={form.specialInstructions || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  specialInstructions: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500"
                              placeholder="Dietary safety instruction"
                            />
                          </label>

                          <label className="block text-xs font-semibold text-slate-700">
                            Intestinal / GI Details
                            <input
                              value={form.intestinalDetails || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  intestinalDetails: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500"
                              placeholder="GI details"
                            />
                          </label>
                        </div>
                      </section>

                      {/* Preferences */}
                      <section>
                        <h3 className="mb-2 text-xs font-bold text-purple-700">
                          Preferences
                        </h3>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-slate-700">
                            Spice Level
                            <select
                              value={form.spiceLevel || "Normal"}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  spiceLevel: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-normal outline-none focus:border-emerald-500"
                            >
                              <option>Normal</option>
                              <option>Less Spicy</option>
                              <option>No Spice</option>
                              <option>Spicy</option>
                            </select>
                          </label>

                          <label className="block text-xs font-semibold text-slate-700">
                            Food Temperature
                            <select
                              value={form.foodTemperature || "Warm"}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  foodTemperature: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 bg-white px-3 text-xs font-normal outline-none focus:border-emerald-500"
                            >
                              <option>Hot</option>
                              <option>Warm</option>
                              <option>Room Temperature</option>
                              <option>Chilled</option>
                              <option>Cold</option>
                            </select>
                          </label>

                          <label className="block text-xs font-semibold text-slate-700">
                            Patient Taste / Food Preference
                            <input
                              value={form.patientTasteRemark || ""}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  patientTasteRemark: e.target.value,
                                })
                              }
                              className="mt-1 h-[36px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500"
                              placeholder="Food preferences / dislikes"
                            />
                          </label>
                        </div>
                      </section>
                    </div>

                    {/* =================================================
                  REMARKS
              ================================================== */}
                    <section className="py-3">
                      <h3 className="mb-2 text-xs font-bold text-blue-700">
                        Remarks
                      </h3>

                      <div className="grid grid-cols-4 gap-3">
                        <label className="text-xs font-semibold text-slate-700">
                          Bed Details
                          <input
                            value={
                              form.bedDetails ||
                              `${selectedPatient?.ward || ""} / ${
                                selectedPatient?.bedNo ||
                                selectedPatient?.bed ||
                                ""
                              }`
                            }
                            onChange={(e) =>
                              setForm({
                                ...form,
                                bedDetails: e.target.value,
                              })
                            }
                            className="mt-1 h-[36px] w-full rounded-md border border-slate-300 px-3 text-xs font-normal outline-none focus:border-emerald-500"
                            placeholder="Ward / Bed"
                          />
                        </label>

                        <label className="text-xs font-semibold text-slate-700">
                          Planning Remarks
                          <textarea
                            value={form.planningRemarks || ""}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                planningRemarks: e.target.value,
                              })
                            }
                            className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500"
                            rows={2}
                          />
                        </label>

                        <label className="text-xs font-semibold text-slate-700">
                          Nursing Remarks
                          <textarea
                            value={form.nursingRemarks || ""}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                nursingRemarks: e.target.value,
                              })
                            }
                            className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500"
                            rows={2}
                          />
                        </label>

                        <label className="text-xs font-semibold text-slate-700">
                          General Remarks
                          <textarea
                            value={form.remarks || ""}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                remarks: e.target.value,
                              })
                            }
                            className="mt-1 w-full resize-none rounded-md border border-slate-300 px-3 py-2 text-xs font-normal outline-none focus:border-emerald-500"
                            rows={2}
                          />
                        </label>
                      </div>
                    </section>
                  </div>

                  {/* =================================================
                FOOTER
            ================================================== */}
                  <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
                    <p className="text-[10px] text-slate-400">
                      Patient clinical context and previous diet are read-only.
                    </p>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setMode("")}
                        className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Cancel
                      </button>

                      <button
                        type="submit"
                        className="rounded-md bg-blue-700 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-800"
                      >
                        {mode === "edit" ? "Update Plan" : "Assign Diet Plan"}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
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

      {historyOpen && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-slate-900/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setHistoryOpen(false);
            }
          }}
        >
          <div
            className="w-full max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Clinical History Timeline
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {selectedPatient?.name || "Patient"} · Clinical Record
                </p>
              </div>

              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X size={20} />
              </button>
            </div>

            {/* Clinical history flow */}
            <div className="max-h-[70vh] overflow-y-auto bg-slate-50 px-5 py-5">
              {(() => {
                const history =
                  selectedPatient?.history ||
                  selectedPatient?.pastHistory ||
                  "";

                const historyFlow = getHistoryFlow(history);

                if (!historyFlow.length) {
                  return (
                    <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
                      No past history recorded.
                    </div>
                  );
                }

                return (
                  <div className="relative">
                    {/* Vertical timeline */}
                    <div className="absolute left-[15px] top-4 bottom-4 w-px bg-slate-300" />

                    <div className="space-y-5">
                      {historyFlow.map((item, index) => (
                        <div
                          key={`${item.title}-${index}`}
                          className="relative flex gap-4"
                        >
                          {/* Timeline number */}
                          <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-blue-600 text-[10px] font-bold text-white shadow-sm">
                            {String(index + 1).padStart(2, "0")}
                          </div>

                          {/* History card */}
                          <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="mb-2 flex items-center justify-between gap-3">
                              <h3 className="text-sm font-bold text-slate-900">
                                {item.title}
                              </h3>

                              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                                Clinical Record
                              </span>
                            </div>

                            <p className="whitespace-pre-line text-sm leading-6 text-slate-600">
                              {item.text}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-slate-200 px-5 py-3">
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) return content;
  return <AppLayout title="Diet Manager">{content}</AppLayout>;
}
const Info = ({ l, v }) => (
  <div>
    <div className="text-xs uppercase text-gray-500">{l}</div>
    <div className="mt-1 font-medium">{v || "—"}</div>
  </div>
);
