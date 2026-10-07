export const ROLES = {
  ADMIN: "ADMIN",
  DIETITIAN: "DIETITIAN",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  KITCHEN_MANAGER: "KITCHEN_MANAGER",
  MEAL_DELIVERY: "MEAL_DELIVERY",
  CAREGIVER: "CAREGIVER",
  MANAGEMENT: "MANAGEMENT",
  VIEWER: "VIEWER",
};

export const PERMISSIONS = {
  DASHBOARD_VIEW: "DASHBOARD_VIEW",
  PATIENT_VIEW: "PATIENT_VIEW",
  PATIENT_EDIT: "PATIENT_EDIT",
  DIET_PLAN_VIEW: "DIET_PLAN_VIEW",
  DIET_PLAN_CREATE: "DIET_PLAN_CREATE",
  MASTER_VIEW: "MASTER_VIEW",
  MASTER_EDIT: "MASTER_EDIT",
  REPORT_VIEW: "REPORT_VIEW",
  SETTINGS_VIEW: "SETTINGS_VIEW",
  KITCHEN_VIEW: "KITCHEN_VIEW",
  KITCHEN_MANAGE: "KITCHEN_MANAGE",
  DELIVERY_VIEW: "DELIVERY_VIEW",
  DELIVERY_MANAGE: "DELIVERY_MANAGE",
  INTAKE_VIEW: "INTAKE_VIEW",
  INTAKE_MANAGE: "INTAKE_MANAGE",
  ALERTS_VIEW: "ALERTS_VIEW",
  ENTERPRISE_VIEW: "ENTERPRISE_VIEW",
};

export const ROLE_PERMISSIONS = {
  ADMIN: Object.values(PERMISSIONS),
  // Dietitians work in Diet Manager / patient diet planning. They should not
  // see Kitchen, Delivery, Reports or Administration in the operational UI.
  DIETITIAN: [
    PERMISSIONS.PATIENT_VIEW,
    PERMISSIONS.PATIENT_EDIT,
    PERMISSIONS.DIET_PLAN_VIEW,
    PERMISSIONS.DIET_PLAN_CREATE,
    PERMISSIONS.ALERTS_VIEW,
  ],
  DOCTOR: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENT_VIEW,
    PERMISSIONS.PATIENT_EDIT,
    PERMISSIONS.DIET_PLAN_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.ALERTS_VIEW,
  ],
  NURSE: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PATIENT_VIEW,
    PERMISSIONS.DIET_PLAN_VIEW,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.INTAKE_VIEW,
    PERMISSIONS.INTAKE_MANAGE,
    PERMISSIONS.ALERTS_VIEW,
  ],
  // Kitchen Staff / Cook: Kitchen only.
  KITCHEN_MANAGER: [
    PERMISSIONS.KITCHEN_VIEW,
    PERMISSIONS.KITCHEN_MANAGE,
  ],
  // Meal Delivery Staff must only see/use the delivery workflows.
  // Dashboard and Diet Plan access is intentionally not included here.
  MEAL_DELIVERY: [
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.DELIVERY_MANAGE,
  ],
  // Caregivers use Meal to Bed to record item-wise food intake after the nurse confirms the meal is finished.
  CAREGIVER: [
    PERMISSIONS.DELIVERY_VIEW,
    PERMISSIONS.INTAKE_VIEW,
    PERMISSIONS.INTAKE_MANAGE,
  ],
  MANAGEMENT: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
  VIEWER: [
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.DIET_PLAN_VIEW,
    PERMISSIONS.REPORT_VIEW,
  ],
};

const CUSTOM_ROLE_NAMES = {
  "System Admin": "ADMIN",
  "Admin": "ADMIN",
  "Dietitian": "DIETITIAN",
  "Dietician": "DIETITIAN",
  "Doctor": "DOCTOR",
  "Nurse": "NURSE",
  "Kitchen Manager": "KITCHEN_MANAGER",
  "Kitchen Staff": "KITCHEN_MANAGER",
  "Kitchen": "KITCHEN_MANAGER",
  "Cook": "KITCHEN_MANAGER",
  "Chef": "KITCHEN_MANAGER",
  "Meal Delivery Staff": "MEAL_DELIVERY",
  "Meal Delivery": "MEAL_DELIVERY",
  "Delivery": "MEAL_DELIVERY",
  "Delivery Staff": "MEAL_DELIVERY",
  "Delivery Person": "MEAL_DELIVERY",
  "Caregiver": "CAREGIVER",
  "Management": "MANAGEMENT",
  "Viewer": "VIEWER",
};

const ROLE_ALIASES = {
  ADMIN: "ADMIN",
  SYSTEM_ADMIN: "ADMIN",
  DIETITIAN: "DIETITIAN",
  DIETICIAN: "DIETITIAN",
  DOCTOR: "DOCTOR",
  NURSE: "NURSE",
  KITCHEN_MANAGER: "KITCHEN_MANAGER",
  KITCHEN_STAFF: "KITCHEN_MANAGER",
  KITCHEN: "KITCHEN_MANAGER",
  COOK: "KITCHEN_MANAGER",
  CHEF: "KITCHEN_MANAGER",
  MEAL_DELIVERY: "MEAL_DELIVERY",
  CAREGIVER: "CAREGIVER",
  MEAL_DELIVERY_STAFF: "MEAL_DELIVERY",
  DELIVERY: "MEAL_DELIVERY",
  DELIVERY_STAFF: "MEAL_DELIVERY",
  DELIVERY_PERSON: "MEAL_DELIVERY",
  CAREGIVER: "CAREGIVER",
  DELIVERY_TEAM: "MEAL_DELIVERY",
  MANAGEMENT: "MANAGEMENT",
  VIEWER: "VIEWER",
};

export function normalizeRole(role = "VIEWER") {
  const raw = String(role || "").trim();
  if (CUSTOM_ROLE_NAMES[raw]) return CUSTOM_ROLE_NAMES[raw];
  const value = raw.toUpperCase().replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[value] || "VIEWER";
}

export function getCurrentRole() {
  try {
    for (const storage of [sessionStorage, localStorage]) {
      const raw = storage.getItem("app_user");
      if (!raw) continue;
      const session = JSON.parse(raw);
      if (session?.role) return normalizeRole(session.role);
    }
    return normalizeRole("Dietitian");
  } catch {
    return "DIETITIAN";
  }
}

export function getRoleHomePath(role = getCurrentRole()) {
  switch (normalizeRole(role)) {
    case "MEAL_DELIVERY":
    case "CAREGIVER":
      return "/meal-delivery";
    case "KITCHEN_MANAGER":
      return "/kitchen-operations";
    case "DIETITIAN":
    case "DOCTOR":
    case "NURSE":
      return "/patients";
    case "MANAGEMENT":
      return "/reports";
    default:
      return "/";
  }
}

const permissionModuleMap = {
  DASHBOARD_VIEW: "Dashboard",
  PATIENT_VIEW: "Patient Diet Management",
  DIET_PLAN_VIEW: "Diet Plans",
  MASTER_VIEW: "Master Data",
  KITCHEN_VIEW: "Kitchen Operations",
  DELIVERY_VIEW: "Meal Delivery",
  INTAKE_VIEW: "Meal Delivery",
  ALERTS_VIEW: "Clinical Alerts",
  REPORT_VIEW: "Reports",
};

export function hasPermission(role, permission) {
  const normalizedRole = normalizeRole(role);

  // These operational roles have fixed access. A stale/custom permission map
  // must never accidentally expose another module.
  const strictOperationalRoles = ["DIETITIAN", "KITCHEN_MANAGER", "MEAL_DELIVERY", "CAREGIVER"];
  if (strictOperationalRoles.includes(normalizedRole)) {
    return (ROLE_PERMISSIONS[normalizedRole] || []).includes(permission);
  }

  // System administrators always have access to every module.
  // Explicit role/module restrictions must not override the ADMIN role.
  if (normalizedRole === ROLES.ADMIN) return true;

  const moduleName = permissionModuleMap[permission];

  // The Roles & Permissions screen stores explicit module limitations.
  // When present, use them for navigation/module access.
  try {
    const custom = JSON.parse(localStorage.getItem("hd_role_permissions"));
    if (custom && moduleName) {
      const displayRole =
        Object.keys(CUSTOM_ROLE_NAMES).find(
          (name) => CUSTOM_ROLE_NAMES[name] === normalizedRole,
        ) || "Viewer";
      if (custom[displayRole] && typeof custom[displayRole][moduleName] === "boolean") {
        // Delivery & Intake are operational workflows and must remain available
        // to the staff roles that are responsible for them. Older saved
        // permission maps did not contain these modules, so a stale false
        // value must not hide the workflow from the correct staff role.
        const operationalRoles = ["DIETITIAN", "NURSE", "KITCHEN_MANAGER", "MEAL_DELIVERY", "CAREGIVER"];
        if (operationalRoles.includes(normalizedRole) &&
          ["Meal Delivery"].includes(moduleName)) {
          return true;
        }
        return custom[displayRole][moduleName];
      }
    }
  } catch {
    // Fall back to role defaults.
  }

  return (ROLE_PERMISSIONS[normalizedRole] || []).includes(permission);
}
