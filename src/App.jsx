import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { seedAuthAccounts, getSession, ensureDevAdminSession } from "./lib/auth.js";
import {
  PERMISSIONS,
  getCurrentRole,
  getRoleHomePath,
  hasPermission,
} from "./lib/permissions.js";
import {
  getStore,
  initStore,
  setStore,
  KEYS,
  normalizeUnit,
  resolveQuantity,
} from "./lib/storage.js";
import {
  SEED_PATIENTS,
  SEED_DIET_TYPES,
  SEED_MEAL_TYPES,
  SEED_FOOD_MASTER,
  SEED_DIET_MAPPING,
} from "./data/seeds.js";
import { normalizeDietType } from "./lib/dietTypeAdapter.js";
import dietTypeService from "./services/dietTypeService.js";
import AccessGuard from "./components/common/AccessGuard.jsx";

const PatientManagement = lazy(() => import("./pages/Dashboard/index.jsx"));
const DietaryOperationsDashboard = lazy(() =>
  import("./pages/OperationsDashboard/index.jsx"),
);
const Master = lazy(() => import("./pages/Master/index.jsx"));
const Reports = lazy(() => import("./pages/Reports/index.jsx"));
const NotFound = lazy(() => import("./pages/NotFound.jsx"));
const Profile = lazy(() => import("./pages/Profile.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
// AUTH SCREENS TEMPORARILY DISABLED — land directly on dashboard.
// const Login = lazy(() => import("./pages/Login.jsx"));
// const Signup = lazy(() => import("./pages/Signup.jsx"));
// const ForgotPassword = lazy(() => import("./pages/ForgotPassword.jsx"));
const DietPlans = lazy(() => import("./pages/DietPlans/index.jsx"));
const KitchenOperations = lazy(() => import("./pages/KitchenOperations/index.jsx"));
const MealDistribution = lazy(() => import("./pages/MealDistribution/index.jsx"));
const ClinicalAlerts = lazy(() => import("./pages/ClinicalAlerts/index.jsx"));
const IntakeUpdate = lazy(() => import("./pages/IntakeUpdate/index.jsx"));

function extractDietRowsForStartup(response) {
  const rowKeys = [
    "name",
    "dietName",
    "dietTypeName",
    "code",
    "dietCode",
    "dietTypeCode",
    "description",
    "targetCalories",
    "calories",
    "kcal",
  ];
  const candidates = [];
  const visited = new Set();

  const parse = (value) => {
    if (typeof value !== "string") return value;
    const text = value.trim();
    if (
      (text.startsWith("{") && text.endsWith("}")) ||
      (text.startsWith("[") && text.endsWith("]"))
    ) {
      try {
        return JSON.parse(text);
      } catch {
        return value;
      }
    }
    return value;
  };

  const walk = (value, depth = 0) => {
    value = parse(value);
    if (!value || typeof value !== "object" || depth > 8) return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      const rows = value.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      );
      if (rows.length) {
        const score = rows.reduce((total, row) => {
          const keys = Object.keys(row).map((key) => key.toLowerCase());
          return (
            total +
            rowKeys.filter((key) => keys.includes(key.toLowerCase())).length
          );
        }, 0);
        candidates.push({ rows, score });
      }
      rows.forEach((row) => walk(row, depth + 1));
      return;
    }

    Object.values(value).forEach((child) => walk(child, depth + 1));
  };

  walk(response);
  candidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0]?.rows || [];
}

function extractTotalForStartup(response) {
  const keys = [
    "totalCount",
    "totalRecords",
    "totalElements",
    "totalItems",
    "recordCount",
    "count",
  ];
  const visited = new Set();
  let found = null;
  const walk = (value, depth = 0) => {
    if (found !== null || !value || typeof value !== "object" || depth > 8)
      return;
    if (visited.has(value)) return;
    visited.add(value);
    for (const key of keys) {
      const n = Number(value?.[key]);
      if (Number.isFinite(n) && n >= 0) {
        found = n;
        return;
      }
    }
    Object.values(value).forEach((child) => walk(child, depth + 1));
  };
  walk(response);
  return found;
}

async function syncDietTypesFromBackend() {
  try {
    const payload = {
      paginationInfo: {
        pageSize: 100,
        currentPage: 1,
        dataSorting: {
          sortingOrder: null,
          byColumn: { label: "", field: "" },
        },
      },
      name: "",
    };

    const response = await dietTypeService.getAllTypes(payload);

    if (!response) return;

    const rows = extractDietRowsForStartup(response)
      .map((item, index) => normalizeDietType(item, index))
      .filter(Boolean);

    // A valid backend response is authoritative, including zero records.
    // If the response contains no identifiable rows, leave the existing cache
    // untouched rather than risking data loss from an unknown response shape.
    const total = extractTotalForStartup(response);
    if (rows.length > 0 || total === 0) {
      setStore(KEYS.DIET_TYPES, rows);
      window.dispatchEvent(new Event("diet-types-synced"));
    }
  } catch (error) {
    console.warn(
      "Diet Type backend sync unavailable; using LocalStorage.",
      error,
    );
  }
}

const RequireAuth = ({ children }) => {
  // Login is commented out: keep a working admin session so the app can open.
  if (!getSession()) ensureDevAdminSession();
  return children;
};

const Guarded = ({ permission, children }) => (
  <RequireAuth>
    <AccessGuard
      permission={permission}
      fallback={<Navigate to={getRoleHomePath(getCurrentRole())} replace />}
    >
      {children}
    </AccessGuard>
  </RequireAuth>
);

const GuardedAny = ({ permissions, children }) => (
  <RequireAuth>
    {permissions.some((permission) =>
      hasPermission(getCurrentRole(), permission),
    ) ? (
      children
    ) : (
      <Navigate to={getRoleHomePath(getCurrentRole())} replace />
    )}
  </RequireAuth>
);

const RoleAwareHome = () => {
  if (!getSession()) ensureDevAdminSession();
  return <DietaryOperationsDashboard />;
};

function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    seedAuthAccounts();
    ensureDevAdminSession();

    // Role access is controlled by the normalized role defaults in permissions.js.
    // No startup permission migration is applied here, so a role cannot inherit stale access.

    initStore(KEYS.PATIENTS, SEED_PATIENTS);
    const seededPatients = getStore(KEYS.PATIENTS).map((patient) => {
      const seed = SEED_PATIENTS.find((item) => item.id === patient.id);
      return seed
        ? {
            ...patient,
            history: seed.history || patient.history,
            pastDiet: patient.pastDiet || seed.pastDiet,
          }
        : patient;
    });
    setStore(KEYS.PATIENTS, seededPatients);
    initStore(KEYS.DIET_TYPES, SEED_DIET_TYPES);
    initStore(KEYS.DIET_TEMPLATES, []);
    initStore(KEYS.MEAL_TYPES, SEED_MEAL_TYPES);
    initStore(KEYS.FOOD_MASTER, SEED_FOOD_MASTER);
    initStore(KEYS.DIET_MAPPING, SEED_DIET_MAPPING);

    const seedMissingDietMappings = () => {
      try {
        const existing = getStore(KEYS.DIET_MAPPING) || [];
        const missing = SEED_DIET_MAPPING.filter(
          (seed) =>
            !existing.some(
              (record) =>
                Number(record.dietTypeId) === Number(seed.dietTypeId) &&
                Number(record.mealTypeId) === Number(seed.mealTypeId),
            ),
        );

        if (missing.length > 0) {
          setStore(KEYS.DIET_MAPPING, [...existing, ...missing]);
        }
      } catch (e) {
        // ignore seed merge failures
      }
    };

    seedMissingDietMappings();

    // Migration: ensure existing DIET_MAPPING records have quantities and units
    const migrateMappings = () => {
      try {
        const foods = (getStore(KEYS.FOOD_MASTER) || []).map((food) => {
          const seed = SEED_FOOD_MASTER.find((item) => item.id === food.id);
          const currentQuantity = Number(food.standardQuantity);
          const seedQuantity = Number(seed?.standardQuantity);
          const hasLegacyDefaultQuantity =
            currentQuantity === 1 && seedQuantity > 1;
          const hasSeedServing =
            Number.isFinite(currentQuantity) &&
            currentQuantity === seedQuantity;
          return {
            ...food,
            standardQuantity: hasLegacyDefaultQuantity
              ? seed.standardQuantity
              : (food.standardQuantity ?? seed?.standardQuantity ?? null),
            unit: normalizeUnit(
              hasLegacyDefaultQuantity || hasSeedServing
                ? seed.unit
                : food.unit || seed?.unit,
            ),
          };
        });
        setStore(KEYS.FOOD_MASTER, foods);
        const mappings = getStore(KEYS.DIET_MAPPING) || [];

        const updated = mappings.map((m) => {
          const seedMapping = SEED_DIET_MAPPING.find(
            (seed) =>
              Number(seed.dietTypeId) === Number(m.dietTypeId) &&
              Number(seed.mealTypeId) === Number(m.mealTypeId),
          );
          const existingFoodItems = Array.isArray(m.foodItems)
            ? m.foodItems
                .map((entry) =>
                  typeof entry === "object"
                    ? Number(entry.foodId ?? entry.id)
                    : Number(entry),
                )
                .filter(Number.isFinite)
            : [];
          // Repair stale localStorage templates only when the saved mapping has no food items.
          const foodItems = existingFoodItems.length
            ? existingFoodItems
            : Array.isArray(seedMapping?.foodItems)
              ? seedMapping.foodItems
                  .map((entry) => Number(entry))
                  .filter(Number.isFinite)
              : [];
          const quantities = { ...(m.quantities || {}) };
          const units = { ...(m.units || {}) };

          foodItems.forEach((fid) => {
            const f = foods.find((x) => Number(x.id) === Number(fid));
            const seedFood = SEED_FOOD_MASTER.find(
              (item) => Number(item.id) === Number(fid),
            );
            const mappingQuantity = Number(quantities[fid]);
            const seedQuantity = Number(seedFood?.standardQuantity);
            const useSeedQuantity = mappingQuantity === 1 && seedQuantity > 1;
            const quantity = resolveQuantity(
              useSeedQuantity ? null : quantities[fid],
              f?.standardQuantity,
            );
            if (quantity === null) delete quantities[fid];
            else quantities[fid] = quantity;

            const mappingUnit = normalizeUnit(units[fid]);
            const foodUnit = normalizeUnit(f?.unit);
            const inheritedFoodQuantity =
              quantity !== null && quantity === Number(f?.standardQuantity);
            units[fid] =
              foodUnit && inheritedFoodQuantity && mappingUnit !== foodUnit
                ? foodUnit
                : mappingUnit || foodUnit;
          });

          return {
            ...m,
            dietTypeId: Number(m.dietTypeId),
            mealTypeId: Number(m.mealTypeId),
            foodItems,
            quantities,
            units,
            instructions: m.instructions || seedMapping?.instructions || "",
            status: m.status || seedMapping?.status || "Active",
          };
        });

        setStore(KEYS.DIET_MAPPING, updated);
      } catch (e) {
        // ignore migration errors; non-fatal
        // console.warn('Migration failed', e);
      }
    };

    migrateMappings();

    // Migration: patients with an existing diet assignment are treated as
    // approved legacy assignments so they continue to appear in the kitchen
    // and dashboard after the approval-to-kitchen workflow is introduced.
    try {
      const workflowKey = "hd_diet_workflow";
      const planKey = "hd_diet_plans";
      const patientsNow = getStore(KEYS.PATIENTS) || [];
      const workflows = getStore(workflowKey, []);
      const plans = getStore(planKey, []);
      const nextFlows = workflows.map((flow) =>
        ["Approved", "Pending Approval"].includes(flow.status)
          ? { ...flow, status: "Planning" }
          : flow,
      );
      const nextPlans = plans.map((plan) =>
        plan.status === "Approved" ? { ...plan, status: "Planning" } : plan,
      );
      patientsNow.forEach((patient) => {
        if (!patient.dietTypeId) return;
        let flow = nextFlows.find(
          (x) => String(x.patientId) === String(patient.id),
        );
        if (!flow) {
          flow = {
            id: patient.id,
            patientId: patient.id,
            dietTypeId: Number(patient.dietTypeId),
            status: "Planning",
            patientTasteRemark: patient.patientTasteRemark || "",
            spiceLevel: patient.spiceLevel || "Normal",
            foodTemperature: patient.foodTemperature || "Warm",
            updatedAt: new Date().toISOString(),
          };
          nextFlows.push(flow);
        }
        if (
          ["Approved", "Pending Approval"].includes(flow.status) &&
          !nextPlans.some(
            (plan) =>
              String(plan.patientId) === String(patient.id) &&
              Number(plan.dietTypeId) === Number(patient.dietTypeId),
          )
        ) {
          const diet = getStore(KEYS.DIET_TYPES).find(
            (d) => Number(d.id) === Number(patient.dietTypeId),
          );
          nextPlans.push({
            id: Date.now() + Number(patient.id),
            patientId: patient.id,
            dietTypeId: Number(patient.dietTypeId),
            dietTemplateId: Number(patient.dietTypeId),
            planName: diet?.name || "Diet Plan",
            status: "Planning",
            startDate:
              patient.admissionDate || new Date().toISOString().slice(0, 10),
            bedDetails:
              `${patient.ward || ""} / ${patient.bedNo || patient.bed || ""}`.trim(),
            planningRemarks: "",
            nursingRemarks: "",
          });
        }
      });
      setStore(workflowKey, nextFlows);
      setStore(planKey, nextPlans);
    } catch (e) {
      // Non-fatal migration.
    }

    setReady(true);

    // Online-first diet type sync. This runs in the background so the existing
    // offline LocalStorage experience is never blocked by the API.
    syncDietTypesFromBackend();
  }, []);

  if (!ready) {
    return (
      <div className="app-boot">
        <div className="app-boot-card">
          <div className="app-boot-mark">D</div>
          <div>Loading DietCare MIS…</div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Suspense
        fallback={
          <div className="app-boot">
            <div className="app-boot-card">
              <div className="app-boot-mark">D</div>
              <div>Loading module…</div>
            </div>
          </div>
        }
      >
      <Routes>
        <Route path="/" element={<RoleAwareHome />} />
        <Route
          path="/patients"
          element={
            <Guarded permission={PERMISSIONS.PATIENT_VIEW}>
              <PatientManagement />
            </Guarded>
          }
        />
        <Route
          path="/master"
          element={
            <Guarded permission={PERMISSIONS.MASTER_VIEW}>
              <Master />
            </Guarded>
          }
        />
        <Route
          path="/diet-plans"
          element={
            <Guarded permission={PERMISSIONS.DIET_PLAN_VIEW}>
              <DietPlans />
            </Guarded>
          }
        />
        <Route
          path="/kitchen-operations"
          element={
            <Guarded permission={PERMISSIONS.KITCHEN_VIEW}>
              <KitchenOperations />
            </Guarded>
          }
        />
        <Route
          path="/meal-delivery"
          element={
            <Guarded permission={PERMISSIONS.DELIVERY_VIEW}>
              <MealDistribution />
            </Guarded>
          }
        />
        <Route
          path="/intake-update/:patientId"
          element={
            <Guarded permission={PERMISSIONS.INTAKE_VIEW}>
              <IntakeUpdate />
            </Guarded>
          }
        />
        <Route
          path="/clinical-alerts"
          element={
            <Guarded permission={PERMISSIONS.ALERTS_VIEW}>
              <ClinicalAlerts />
            </Guarded>
          }
        />
        <Route
          path="/reports"
          element={
            <Guarded permission={PERMISSIONS.REPORT_VIEW}>
              <Reports />
            </Guarded>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        {/* AUTH SCREENS TEMPORARILY DISABLED
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        */}
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="/signup" element={<Navigate to="/" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
