import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { getSession, ensureDevAdminSession } from "./lib/auth.js";
import {
  PERMISSIONS,
  getCurrentRole,
  getRoleHomePath,
  hasPermission,
} from "./lib/permissions.js";
import {
  setStore,
  clearLegacyAppStorage,
  KEYS,
} from "./lib/storage.js";
import patientDietPlanService from "./services/patientDietPlanService.js";
import { loadMasterData } from "./lib/masterData.js";
import { extractPlanRows, fromApiRow } from "./services/dietPlanAdapter.js";
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

async function syncApplicationDataFromBackend() {
  try {
    const [master, planResponse] = await Promise.all([
      loadMasterData(),
      patientDietPlanService.getAllPlans({
        ward: "",
        dietPlan: "",
        assignmentStatus: "",
        searchText: "",
        paginationInfo: { currentPage: 0, pageSize: 100 },
      }),
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

    const plans = extractPlanRows(planResponse)
      .map((row) => fromApiRow(row, master.dietTemplates))
      .filter((row) => row && row.id != null);

    setStore(KEYS.PATIENTS, master.patients);
    setStore(KEYS.DIET_TYPES, master.dietTypes);
    setStore(KEYS.DIET_TEMPLATES, master.dietTemplates);
    setStore(KEYS.MEAL_TYPES, master.mealTypes);
    setStore(KEYS.FOOD_MASTER, master.foods);
    setStore(KEYS.DIET_MAPPING, master.mappings);
    const workflows = master.patients.flatMap((patient) => {
      const plan = plans.find(
        (row) => String(row.patientId) === String(patient.id),
      );
      const dietTypeId = plan?.dietTypeId ?? patient.dietTypeId;
      if (dietTypeId == null || dietTypeId === "") return [];

      const candidateStatus = String(plan?.status || "Planning");
      const status = [
        "Planning",
        "Assigned",
        "Approved",
        "Preparing",
        "Prepared",
        "Delivering",
        "Delivered",
      ].includes(candidateStatus)
        ? candidateStatus
        : "Planning";

      return [
        {
          id: plan?.id ?? patient.id,
          patientId: patient.id,
          planId: plan?.id ?? null,
          dietTypeId: Number(dietTypeId),
          dietTemplateId: plan?.dietTemplateId ?? null,
          planName: plan?.planName || "",
          status,
          startDate: plan?.startDate || patient.admissionDate || "",
          endDate: plan?.endDate || "",
          patientTasteRemark:
            plan?.patientTasteRemark || patient.patientTasteRemark || "",
          spiceLevel: plan?.spiceLevel || patient.spiceLevel || "Normal",
          foodTemperature:
            plan?.foodTemperature || patient.foodTemperature || "Warm",
        },
      ];
    });
    setStore("hd_diet_plans", plans);
    setStore("hd_diet_workflow", workflows);
    window.dispatchEvent(new Event("diet-types-synced"));
    return {
      synced: true,
      mappingWarnings: master.mappingWarnings,
      patientCount: master.patients.length,
      planCount: plans.length,
    };
  } catch (error) {
    console.error("Could not initialize DietCare data from the API.", error);
    return { synced: false, error };
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
  const [startupError, setStartupError] = useState("");

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      clearLegacyAppStorage();
      ensureDevAdminSession();

      Object.values(KEYS).forEach((key) => setStore(key, []));
      setStore("hd_diet_plans", []);
      setStore("hd_diet_workflow", []);
      setStore("hd_meal_status", {});
      setStore("hd_meal_care_status", {});
      setStore("hd_intake_status", {});

      const result = await syncApplicationDataFromBackend();
      if (!result.synced && active) {
        setStartupError(
          "Server data could not be loaded. Check the API connection and refresh to try again.",
        );
      } else if (active) {
        const notices = [];
        if (result.patientCount === 0 && result.planCount === 0) {
          notices.push(
            "API is connected, but the server returned no patient or diet-plan records. Restore/import them in the backend to show meal data.",
          );
        }
        if (result.mappingWarnings?.length) {
          const failedTemplates = result.mappingWarnings
            .map((warning) => warning.templateId)
            .join(", ");
          notices.push(
            `Meal items could not be loaded for diet template(s): ${failedTemplates}.`,
          );
        }
        setStartupError(notices.join(" "));
      }
      if (active) setReady(true);
    };

    initialize();
    return () => {
      active = false;
    };
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
      {startupError && (
        <div
          role="alert"
          style={{
            background: "#fff7ed",
            borderBottom: "1px solid #fed7aa",
            color: "#9a3412",
            padding: "10px 16px",
            textAlign: "center",
          }}
        >
          {startupError}
        </div>
      )}
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
