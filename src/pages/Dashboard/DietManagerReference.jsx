import React, { useCallback, useEffect, useMemo, useState } from "react";
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
//import MealPlanModal from "../../components/common/MealPlanModal.jsx";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import { getClinicalAlertsForPatient } from "../../lib/clinicalAlerts.js";
import { loadMasterData, loadTemplateMappings } from "../../lib/masterData.js";
import patientDietPlanService from "../../services/patientDietPlanService.js";
import {
  extractPlanId,
  extractPlanRows,
  fromApiRow,
  toDietPlanApiPayload,
} from "../../services/dietPlanAdapter.js";
import {
  Toast,
  exportCsv,
  EmptyState,
} from "../../components/common/MvpTools.jsx";
import Modal from "../../components/common/Modal.jsx";

const PLAN_KEY = "hd_diet_plans";
const currentUserId = () => Number(sessionStorage.getItem("UserId")) || 0;
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
  status: "Unassigned",
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
  const [patients, setPatients] = useState(() => getStore(KEYS.PATIENTS, []));
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(blank);
  const [mode, setMode] = useState("");
  const [selected, setSelected] = useState(null);
  const [toast, setToastRaw] = useState("");
  const [toastType, setToastType] = useState("success");
  const setToast = (message, type) => {
    setToastType(
      type ||
        (/unable|could not|not |select|must|reject|fail|before|required|invalid|error/i.test(
          String(message),
        )
          ? "error"
          : "success"),
    );
    setToastRaw(message);
  };
  const [historyOpen, setHistoryOpen] = useState(false);
  const [, setStoreVersion] = useState(0);
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    ward: "All Wards",
    diet: "All Diet Plans",
    status: "All Status",
  });
  const [summary, setSummary] = useState(null);

  const handleView = () =>
    setAppliedFilters({
      search: search.trim(),
      ward: wardFilter,
      diet: dietFilter,
      status: statusFilter,
    });
  // LIVE STORE SYNC: keep diet-plan rows connected to patient/master/workflow changes.
  useEffect(() => {
    const refresh = () => {
      setStoreVersion((version) => version + 1);
      setPlans(getStore(PLAN_KEY, []));
      setPatients(getStore(KEYS.PATIENTS, []));
    };
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dietcare-store-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [master, planResponse] = await Promise.all([
        loadMasterData({ withMappings: false }),
        patientDietPlanService.getAllPlans(),
      ]);
      if (
        !planResponse ||
        planResponse.error ||
        planResponse.statusCode >= 400 ||
        planResponse.status >= 400
      ) {
        throw new Error(
          planResponse?.message ||
            planResponse?.error?.message ||
            "Could not load diet plans from the server.",
        );
      }

      const cachedPatients = getStore(KEYS.PATIENTS, []) || [];
      const patientsFromApi = master.patients.map((apiPatient) => ({
        ...cachedPatients.find(
          (cached) => String(cached.id) === String(apiPatient.id),
        ),
        ...apiPatient,
      }));
      const cachedPlans = getStore(PLAN_KEY, []) || [];
      const planRows = extractPlanRows(planResponse)
        .map((row) => fromApiRow(row, master.dietTemplates))
        .filter((row) => row && row.id != null)
        .map((row) => ({
          ...row,
          dietHistory:
            cachedPlans.find((cached) => String(cached.id) === String(row.id))
              ?.dietHistory || [],
        }));

      setPatients(patientsFromApi);
      setStore(KEYS.PATIENTS, patientsFromApi);
      setStore(KEYS.DIET_TYPES, master.dietTypes);
      setStore(KEYS.DIET_TEMPLATES, master.dietTemplates);
      setStore(KEYS.MEAL_TYPES, master.mealTypes);
      setStore(KEYS.FOOD_MASTER, master.foods);
      //setStore(KEYS.DIET_MAPPING, master.mappings);
      setPlans(planRows);
      setStore(PLAN_KEY, planRows);
      return planRows;
    } catch (error) {
      console.error("Failed to load Diet Manager data", error);
      setLoadError(
        error?.message || "Could not load Diet Manager data from the server.",
      );
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const loadSummary = useCallback(async (filters) => {
    try {
      const res = await patientDietPlanService.getSummary({
        assignmentStatus:
          filters.status === "All Status"
            ? ""
            : filters.status === "Unassigned"
              ? "UNASSIGN"
              : filters.status,
        searchText: filters.search,
      });
      setSummary(res);
    } catch (error) {
      console.error("Diet Manager summary failed", error);
      setSummary(null);
    }
  }, []);

  useEffect(() => {
    loadSummary(appliedFilters);
  }, [appliedFilters.status, appliedFilters.search, loadSummary]);

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
  // Read-only status shown in the Edit modal. It follows the table row.
  // Single rule used everywhere: a diet template selected = Assigned,
  // no diet template = Unassigned.
  const formIsAssigned = Boolean(form.dietTemplateId);
  const statusLabel = formIsAssigned ? "ASSIGNED" : "UNASSIGNED";
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
        // Same lookup as the Edit popup: saved template id, otherwise the
        // template that matches the plan's diet type.
        const planTemplateId = plan
          ? plan.dietTemplateId ||
            dietTemplates.find(
              (t) =>
                String(t.dietTypeId) === String(plan.dietTypeId) &&
                t.status !== false &&
                t.status !== "Inactive",
            )?.id ||
            ""
          : "";
        const assigned = plan
          ? Boolean(planTemplateId)
          : [
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
          dietTemplateId: planTemplateId ? String(planTemplateId) : "",
          assignmentStatus: assigned ? "Assigned" : "Unassigned",
          status: assigned ? "Assigned" : "Unassigned",
          workflowStatus: flow?.status || "Unassigned",
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
          .includes(appliedFilters.search.toLowerCase()),
      )
      .filter(
        (x) =>
          appliedFilters.ward === "All Wards" ||
          patient(x.patientId)?.ward === appliedFilters.ward,
      )
      .filter(
        (x) =>
          appliedFilters.diet === "All Diet Plans" ||
          dietType(x.dietTypeId)?.name === appliedFilters.diet,
      )
      .filter(
        (x) =>
          appliedFilters.status === "All Status" ||
          x.assignmentStatus === appliedFilters.status,
      );
  }, [patients, plans, workflows, appliedFilters, dietTemplates]);
  const persist = (x) => {
    setPlans(x);
    setStore(PLAN_KEY, x);
  };
  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
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
    if (form.endDate && form.startDate && form.endDate < form.startDate) {
      setToast("End date cannot be before the start date.");
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
    // Keep an unassigned plan unassigned. The status is changed only from the table.
    // A diet template is required to save, so a saved plan is assigned.
    const hasTemplate = Boolean(form.dietTemplateId);
    const workflowStatus = hasTemplate ? "Assigned" : "Unassigned"; // local/UI value
    const apiStatus = hasTemplate ? "ASSIGN" : "UNASSIGN"; // value the backend expects
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
    let savedPlan =
      mode === "edit"
        ? { ...nextForm, dietHistory }
        : { ...nextForm, id: Date.now() };

    const isUpdate = mode === "edit" && form.id != null && form.id !== "";
    setSaving(true);
    try {
      const response = isUpdate
        ? await patientDietPlanService.updatePlanById(
            form.id,
            toDietPlanApiPayload(
              {
                ...nextForm,
                status: apiStatus,
                dietitianPractId:
                  Number(nextForm.dietitianPractId) || currentUserId(),
              },
              { template: selectedDietTemplate, isUpdate: true },
            ),
          )
        : await patientDietPlanService.createPlan(
            toDietPlanApiPayload(
              {
                ...nextForm,
                status: apiStatus,
                dietitianPractId:
                  Number(nextForm.dietitianPractId) || currentUserId(),
              },
              { template: selectedDietTemplate },
            ),
          );
      if (
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "The server rejected the diet plan.",
        );
      }

      const savedId = isUpdate ? form.id : extractPlanId(response);
      const loadedPlans = await loadData();
      if (!loadedPlans) {
        throw new Error("The plan was saved, but the list could not refresh.");
      }
      loadSummary(appliedFilters);
      let loadedPlan = loadedPlans.find(
        (plan) => String(plan.id) === String(savedId),
      );
      if (!loadedPlan && !isUpdate) {
        loadedPlan = loadedPlans
          .filter(
            (plan) =>
              String(plan.patientId) === String(nextForm.patientId) &&
              String(plan.dietTemplateId) === String(nextForm.dietTemplateId) &&
              String(plan.startDate) === String(nextForm.startDate),
          )
          .sort((a, b) => Number(b.id) - Number(a.id))[0];
      }
      if (!loadedPlan) {
        throw new Error(
          "The plan was saved, but it was not returned by the server.",
        );
      }
      savedPlan = { ...loadedPlan, dietHistory };
    } catch (error) {
      console.error("Diet plan save failed", error);
      setToast(error?.message || "Unable to save the diet plan to the server.");
      return;
    } finally {
      setSaving(false);
    }

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
    const currentPlans = getStore(PLAN_KEY, []) || [];
    if (mode === "edit") {
      persist(
        currentPlans.map((x) =>
          String(x.id) === String(form.id) ? savedPlan : x,
        ),
      );
    } else {
      persist([
        ...currentPlans.filter((x) => String(x.id) !== String(savedPlan.id)),
        savedPlan,
      ]);
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
    const templateId =
      x.dietTemplateId ||
      dietTemplates.find((t) => String(t.dietTypeId) === String(x.dietTypeId))
        ?.id ||
      "";
    setForm({
      ...x,
      dietTemplateId: templateId ? String(templateId) : "",
      planName: x.planName || diet(templateId)?.name || "",
      allergensText: (p?.allergens || [])
        .filter((a) => a && a !== "None")
        .join(", "),
      specialInstructions: p?.specialInstructions || "",
      intestinalDetails: p?.intestinalDetails || p?.intestinalDetail || "",
    });
    setMode("edit");
  };
  const remove = async (x) => {
    if (x.auto) {
      setToast(
        "This plan is linked to the patient record and cannot be deleted here.",
      );
      return;
    }
    if (confirm("Delete this diet plan?")) {
      try {
        const response = await patientDietPlanService.deletePlan(x.id);
        if (
          response?.error ||
          response?.statusCode >= 400 ||
          response?.status >= 400
        ) {
          throw new Error(
            response?.message ||
              response?.error?.message ||
              "The server rejected the diet plan deletion.",
          );
        }
        const loadedPlans = await loadData();
        if (!loadedPlans) {
          throw new Error(
            "The plan was deleted, but the list could not refresh.",
          );
        }
        loadSummary(appliedFilters);
        setToast("Diet plan deleted.");
      } catch (error) {
        console.error("Diet plan delete failed", error);
        setToast(error?.message || "Unable to delete the diet plan.");
      }
    }
  };

  const openAssignForm = (row) => {
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
      intestinalDetails: p?.intestinalDetails || p?.intestinalDetail || "",
      bedDetails: `${p?.ward || ""} / ${p?.bedNo || p?.bed || ""}`.trim(),
    });
    setMode("create");
  };

  const toggleAssignment = async (x) => {
    if (x.auto || x.id == null || saving) return;
    const makeAssigned = x.assignmentStatus !== "Assigned";
    if (!makeAssigned && !confirm("Unassign this diet plan?")) return;

    // Assign needs a real dietitian/practitioner id; unassign sends 0.
    const practId = Number(x.dietitianPractId) || currentUserId();
    if (makeAssigned && !practId) {
      setToast(
        "No dietitian is linked to this plan. Select a dietitian first.",
      );
      return;
    }

    setSaving(true);
    try {
      const response = await patientDietPlanService.updateAssignment(x.id, {
        dietTypeId: Number(x.dietTypeId),
        dietitianPractId: makeAssigned ? practId : 0,
        assignmentStatus: makeAssigned ? "ASSIGN" : "UNASSIGN",
      });
      if (
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "The server rejected the status change.",
        );
      }
      const loadedPlans = await loadData();
      if (!loadedPlans)
        throw new Error("Status updated, but the list could not refresh.");
      loadSummary(appliedFilters);
      const flows = getStore("hd_diet_workflow", []) || [];
      setStore(
        "hd_diet_workflow",
        flows.map((f) =>
          String(f.patientId) === String(x.patientId)
            ? {
                ...f,
                status: makeAssigned ? "Assigned" : "Unassigned",
                updatedAt: new Date().toISOString(),
              }
            : f,
        ),
      );
      appendHistoryEvent({
        type: "diet_plan",
        module: "Diet Manager",
        action: makeAssigned ? "Diet Plan Assigned" : "Diet Plan Unassigned",
        patientId: x.patientId,
        patientName: patient(x.patientId)?.name || "",
        planId: x.id,
        dietTypeId: x.dietTypeId || null,
      });
      setToast(makeAssigned ? "Diet plan assigned." : "Diet plan unassigned.");
    } catch (error) {
      console.error("Assignment status change failed", error);
      setToast(error?.message || "Unable to change the assignment status.");
    } finally {
      setSaving(false);
    }
  };

  const viewPastDietPlan = (() => {
    if (!selected) return null;
    const stored = Array.isArray(selected.dietHistory)
      ? selected.dietHistory[selected.dietHistory.length - 1]
      : null;
    return (
      stored ||
      plans
        .filter(
          (p) =>
            String(p.patientId) === String(selected.patientId) &&
            String(p.id) !== String(selected.id) &&
            String(p.dietTypeId) !== String(selected.dietTypeId),
        )
        .sort(
          (a, b) =>
            new Date(b.startDate || 0).getTime() -
            new Date(a.startDate || 0).getTime(),
        )[0] ||
      null
    );
  })();
  const viewPastDietName = diet(viewPastDietPlan?.dietTypeId)?.name || "";

  const content = (
    <>
      <Toast message={toast} type={toastType} onClose={() => setToastRaw("")} />
      <div className="space-y-4">
        {loadError && (
          <div
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
            role="alert"
          >
            <span>{loadError}</span>
            <button
              type="button"
              onClick={loadData}
              className="rounded-md border border-red-300 px-3 py-1.5 font-medium hover:bg-red-100"
            >
              Retry
            </button>
          </div>
        )}
        {loading && (
          <p className="text-sm text-slate-500" role="status">
            Loading Diet Manager data…
          </p>
        )}
        {summary && (
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(summary?.data ?? summary)
              .filter(([, value]) => typeof value === "number")
              .map(([key, backendValue]) => {
                // Keep the cards in sync with the table: Total / Assigned /
                // Unassigned are counted from the rows being displayed.
                // (Planning keeps the backend value.)
                const k = key.toLowerCase();
                const value = k.includes("unassign")
                  ? rows.filter((r) => r.assignmentStatus === "Unassigned")
                      .length
                  : k.includes("assign")
                    ? rows.filter((r) => r.assignmentStatus === "Assigned")
                        .length
                    : k.includes("total")
                      ? rows.length
                      : backendValue;
                return (
                  <div key={key} className="hospital-stat-card">
                    <div>
                      <p className="hospital-stat-label">
                        {key.replace(/([a-z])([A-Z])/g, "$1 $2")}
                      </p>
                      <p className="hospital-stat-value">{value}</p>
                    </div>
                  </div>
                );
              })}
          </section>
        )}
        <div className="hospital-card" data-card-style="outlined">
          <div className="hospital-card-header">
            <div>
              <h2 className="hospital-card-title">Patient Diet Overview</h2>
              <p className="hospital-card-subtitle">
                View and manage diet assignment status for all patients.
              </p>
            </div>
          </div>
          <div className="hospital-card-body">
            {/*<button
              type="button"
              onClick={() => {
                const first = rows.find((x) => x.assignmentStatus === "Unassigned") || rows[0];
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
                <option>Unassigned</option>
              </select>
            </label>
            <div
              className="hospital-field"
              style={{
                flex: "1 1 320px",
                minWidth: 0,
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  className="absolute left-3 top-[50%] -translate-y-1/2 text-gray-400"
                  size={17}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleView()}
                  placeholder="Search patient or ID..."
                  className="hospital-input pl-10"
                />
              </div>
              <button
                type="button"
                onClick={handleView}
                disabled={loading}
                className="hospital-button"
              >
                <Eye size={15} /> View
              </button>
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
            // {
            //   key: "patientId",
            //   label: "Patient ID",
            //   render: (row) => <span className="font-medium">{row.patientId}</span>,
            // },
            {
              key: "patientName",
              label: "Patient",
              render: (row) => (
                <span className="font-semibold">
                  {patient(row.patientId)?.name}
                </span>
              ),
            },
            {
              key: "wardBed",
              label: "Ward / Bed",
              render: (row) => {
                const p = patient(row.patientId);
                return (
                  <div>
                    {p?.ward || "—"}
                    <div className="text-xs text-gray-500">
                      {p?.bedNo || p?.bed || "—"}
                    </div>
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
              render: (row) => {
                const assigned = row.assignmentStatus === "Assigned";
                return (
                  <button
                    type="button"
                    title={assigned ? "Click to unassign" : "Click to assign"}
                    disabled={saving}
                    onClick={() =>
                      row.auto ? openAssignForm(row) : toggleAssignment(row)
                    }
                    className={`hospital-status cursor-pointer transition hover:opacity-80 ${
                      assigned
                        ? "hospital-status-active"
                        : "hospital-status-inactive"
                    }`}
                  >
                    {row.assignmentStatus}
                  </button>
                );
              },
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
                      if (row.auto) {
                        setToast(
                          "No diet plan created yet. Use the pencil button to create one.",
                        );
                        return;
                      }
                      setSelected(row);
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
                              (t) =>
                                Number(t.dietTypeId) === Number(p?.dietTypeId),
                            )?.id || "",
                          ),
                          allergensText: (p?.allergens || [])
                            .filter((a) => a && a !== "None")
                            .join(", "),
                          specialInstructions: p?.specialInstructions || "",
                          intestinalDetails:
                            p?.intestinalDetails || p?.intestinalDetail || "",
                          bedDetails:
                            `${p?.ward || ""} / ${p?.bedNo || p?.bed || ""}`.trim(),
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
                      mode === "edit" && formIsAssigned
                        ? "bg-emerald-100 text-emerald-800"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {mode === "edit" ? statusLabel : "NEW ASSIGNMENT"}
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
                          <div
                            className={`mt-1 flex h-[38px] items-center rounded-md border px-3 text-xs font-bold ${
                              formIsAssigned
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            {statusLabel}
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
        <DietPlanViewModal
          planId={selected.id}
          row={selected}
          patientRecord={patient(selected.patientId)}
          template={diet(selected.dietTemplateId)}
          pastDietName={viewPastDietName}
          dietTemplates={dietTemplates}
          mealTypes={mealTypes}
          foods={foods}
          onClose={() => setMode("")}
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
const VIEW_STATUS = {
  ASSIGN: { label: "Assigned", cls: "hospital-status-assigned" },
  PLANNING: { label: "Planning", cls: "hospital-status-planning" },
  UNASSIGN: { label: "Unassigned", cls: "hospital-status-inactive" },
};
const vNum = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const vDash = (v) => (v === null || v === undefined || v === "" ? "—" : v);
const vDate = (s) => {
  if (!s) return "—";
  const d = new Date(`${s}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
};

const ViewRow = ({ label, value }) => (
  <div style={{ minWidth: 0 }}>
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        color: "var(--text-secondary)",
      }}
    >
      {label}
    </div>
    <div
      style={{
        marginTop: 2,
        fontWeight: 500,
        color: "var(--text-primary)",
        overflowWrap: "anywhere",
      }}
    >
      {vDash(value)}
    </div>
  </div>
);

const ViewSection = ({ title, children }) => (
  <section
    style={{
      border: "1px solid var(--border)",
      borderRadius: "var(--radius)",
      background: "var(--hospital-card)",
      padding: 16,
    }}
  >
    <h3 style={{ margin: "0 0 8px", fontWeight: 700 }}>{title}</h3>
    {children}
  </section>
);

const ViewMacro = ({ label, grams, percent, kcal, color }) => (
  <div style={{ flex: 1, minWidth: 110 }}>
    <div style={{ color: "var(--text-secondary)" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700 }}>
      {Math.round(vNum(grams))} g
    </div>
    <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
      {vNum(percent)}% · {Math.round(vNum(kcal))} kcal
    </div>
    <div
      aria-hidden
      style={{
        height: 4,
        borderRadius: 2,
        background: color,
        marginTop: 6,
        width: `${Math.min(100, vNum(percent))}%`,
      }}
    />
  </div>
);

function DietPlanViewModal({
  planId,
  row,
  patientRecord,
  template,
  pastDietName,
  dietTemplates = [],
  mealTypes = [],
  foods = [],
  onClose,
}) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fallback, setFallback] = useState({ template: null, meals: [] });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    patientDietPlanService
      .getPlanById(planId)
      .then((res) => {
        if (!active) return;
        if (!res?.data)
          throw new Error(res?.message || "Plan details were not returned.");
        setPlan(res.data);
      })
      .catch(
        (e) => active && setError(e?.message || "Could not load plan details."),
      )
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [planId]);

  useEffect(() => {
    if (!plan) return undefined;
    if (Array.isArray(plan.meals) && plan.meals.length) {
      setFallback({ template: null, meals: [] });
      return undefined;
    }
    const template =
      dietTemplates.find((t) => String(t.id) === String(plan.dietTemplateId)) ||
      dietTemplates.find(
        (t) =>
          Number(t.dietTypeId) === Number(plan.dietTypeId) &&
          t.status !== false &&
          t.status !== "Inactive",
      );
    if (!template) return undefined;

    let active = true;
    loadTemplateMappings(
      template.templateId ?? template.id,
      template.dietTypeId,
    )
      .then((mappings) => {
        if (!active) return;
        const meals = mappings
          .map((m) => {
            const mealType =
              mealTypes.find((t) => Number(t.id) === Number(m.mealTypeId)) ||
              mealTypes.find(
                (t) =>
                  String(t.name || "").toLowerCase() ===
                  String(m.mealName || "").toLowerCase(),
              );
            const items = (Array.isArray(m.foodItems) ? m.foodItems : [])
              .map((entry) => {
                const foodId =
                  typeof entry === "object"
                    ? (entry?.foodId ?? entry?.id)
                    : entry;
                const food = foods.find((f) => Number(f.id) === Number(foodId));
                if (!food) return null;
                return {
                  id: food.id,
                  name: food.name,
                  quantity:
                    (typeof entry === "object" ? entry?.quantity : null) ??
                    m.quantityTexts?.[foodId] ??
                    m.quantities?.[foodId] ??
                    food.standardQuantity ??
                    "",
                  unit:
                    (typeof entry === "object" ? entry?.unit : null) ||
                    m.units?.[foodId] ||
                    food.unit ||
                    "",
                };
              })
              .filter(Boolean);
            return {
              id: m.id ?? m.mealTypeId,
              name: mealType?.name || m.mealName || "Meal",
              time: mealType?.time || "",
              sort: Number(m.mealTypeId || mealType?.id || 0),
              items,
            };
          })
          .filter((m) => m.items.length)
          .sort((a, b) => a.sort - b.sort);
        setFallback({ template, meals });
      })
      .catch(() => active && setFallback({ template: null, meals: [] }));
    return () => {
      active = false;
    };
  }, [plan]);

  // Same rules as the Edit popup.
  const hasTemplate = Boolean(row?.dietTemplateId || plan?.dietTemplateId);
  const isAssignedRow = hasTemplate || Boolean(fallback.template);
  const status = isAssignedRow ? VIEW_STATUS.ASSIGN : VIEW_STATUS.UNASSIGN;
  const pastHistoryText =
    patientRecord?.history || patientRecord?.pastHistory || "";
  const previousDietText = patientRecord?.pastDiet || pastDietName || "";
  const calorieValue = patientRecord?.calorieRequirement || template?.calories;
  const backendMeals = Array.isArray(plan?.meals)
    ? plan.meals.map((meal, i) => ({
        id: meal.id ?? i,
        name:
          meal.mealName ?? meal.mealTypeName ?? meal.name ?? `Meal ${i + 1}`,
        time: meal.mealTime ?? meal.time ?? "",
        items: (meal.items ?? meal.foods ?? meal.foodItems ?? []).map(
          (it, j) => ({
            id: it.id ?? j,
            name: it.foodName ?? it.name,
            quantity: it.quantity ?? "",
            unit: it.unit ?? "",
          }),
        ),
      }))
    : [];
  const shownMeals = backendMeals.length ? backendMeals : fallback.meals;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-2 sm:p-3"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-[1250px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                Diet Plan Details
              </h2>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  isAssignedRow
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-slate-100 text-slate-700"
                }`}
              >
                {status.label.toUpperCase()}
              </span>
            </div>
            <div className="mt-1 h-0.5 w-10 bg-emerald-600" />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <X size={21} />
          </button>
        </div>

        {/* BODY */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
          {loading && (
            <p className="text-sm text-slate-500">Loading plan details…</p>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {error}
            </div>
          )}
          {plan && (
            <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
              {/* LEFT COLUMN */}
              <div className="space-y-3">
                {/* Patient */}
                <section className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-bold text-slate-900">
                        {plan.patientName}
                      </div>
                      <div className="text-xs text-slate-500">
                        {plan.patientCode} · {plan.wardBed}
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      {vDate(plan.startDate)} to {vDate(plan.endDate)}
                    </div>
                  </div>
                </section>

                {/* Plan details */}
                <section className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="mb-3 text-sm font-bold text-emerald-700">
                    Plan Details
                  </h3>
                  <div className="grid grid-cols-2 gap-x-5 gap-y-3 md:grid-cols-4">
                    <Info l="DOCTOR" v={plan.doctorName} />
                    <Info
                      l="DIETITIAN"
                      v={plan.dietitianName || "Not assigned"}
                    />
                    <Info l="DIAGNOSIS" v={plan.diagnosis} />
                    <Info l="DIET TYPE" v={plan.dietTypeName} />
                    <Info
                      l="PAST HISTORY"
                      v={pastHistoryText || "No past history recorded."}
                    />
                    <Info
                      l="PAST DIET"
                      v={previousDietText || "No previous diet recorded"}
                    />
                    <Info
                      l="CALORIE REQUIREMENT"
                      v={
                        calorieValue
                          ? `${Math.round(vNum(calorieValue))} kcal/day`
                          : "Not recorded"
                      }
                    />
                  </div>
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-red-700">
                      ALLERGIES
                    </div>
                    <div className="mt-0.5 text-sm font-semibold text-red-900">
                      {plan.patientAllergies || "None"}
                    </div>
                  </div>
                </section>
              </div>

              {/* RIGHT COLUMN */}
              <div className="space-y-3">
                {/* Meal plan */}
                <section className="rounded-lg border border-slate-200 bg-white p-3">
                  <h3 className="text-sm font-bold text-emerald-700">
                    Meal Plan
                  </h3>
                  {fallback.template && !backendMeals.length && (
                    <p className="mb-3 text-[11px] text-slate-500">
                      Diet template: {fallback.template.name}
                    </p>
                  )}
                  {shownMeals.length ? (
                    <div className="mt-3 grid grid-cols-1 gap-3">
                      {shownMeals.map((meal) => (
                        <div
                          key={meal.id}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-1.5">
                            <span className="text-sm font-bold text-slate-900">
                              {meal.name}
                            </span>
                            {meal.time && (
                              <span className="text-[11px] text-slate-500">
                                {String(meal.time).replace(
                                  /^(\d{2}:\d{2}):\d{2}$/,
                                  "$1",
                                )}
                              </span>
                            )}
                          </div>
                          {meal.items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between gap-3 py-1.5 text-xs text-slate-600"
                            >
                              <span className="min-w-0 flex-1 break-words">
                                {item.name}
                              </span>
                              <span className="whitespace-nowrap font-semibold text-slate-800 tabular-nums">
                                {item.quantity} {item.unit}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                      <span>
                        {plan.mealPlanNote ||
                          "No meals are configured for this plan yet."}
                      </span>
                    </div>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        {/* <div className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-5 py-3">
          <p className="text-[10px] text-slate-400">This view is read-only.</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div> */}
      </div>
    </div>
  );
}
