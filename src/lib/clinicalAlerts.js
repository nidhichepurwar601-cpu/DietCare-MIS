import { getStore, KEYS } from "./storage.js";

const normalizeAllergens = (patient) =>
  (Array.isArray(patient?.allergens) ? patient.allergens : []).filter((x) => x && x !== "None");

export function buildClinicalAlerts({ patient, plan, workflow, intake, mealStatus = {} } = {}) {
  if (!patient) return [];
  const alerts = [];
  const allergens = normalizeAllergens(patient);

  if (allergens.length) {
    alerts.push({
      id: `allergy-${patient.id}-${allergens.join("-")}`,
      type: "Allergy Alert",
      severity: "High",
      message: `Allergies recorded: ${allergens.join(", ")}`,
    });
  }

  const dietStatus = workflow?.status || patient?.dietStatus || "Not Assigned";
  if (!plan && !patient.dietTypeId) {
    alerts.push({
      id: `diet-${patient.id}`,
      type: "Diet Assignment",
      severity: "High",
      message: "No active diet plan has been assigned.",
    });
  }

  if (dietStatus === "Draft") {
    alerts.push({
      id: `review-${patient.id}-${dietStatus}`,
      type: "Diet Review",
      severity: "Medium",
      message: `Diet plan is currently ${dietStatus}.`,
    });
  }

  if (patient.specialInstructions?.trim()) {
    alerts.push({
      id: `instruction-${patient.id}-${patient.specialInstructions.trim()}`,
      type: "Special Instruction",
      severity: "Medium",
      message: patient.specialInstructions.trim(),
    });
  }

  const isFemale = String(patient.gender || "").trim().toLowerCase() === "female";
  if (
    isFemale &&
    (patient.isPregnant || patient.pregnancyStatus === "Pregnant") &&
    !patient.prescriptionDietTypeId &&
    !patient.prescription?.dietTypeId
  ) {
    alerts.push({
      id: `pregnancy-${patient.id}`,
      type: "Pregnancy Diet Alert",
      severity: "High",
      message: "Pregnancy recorded without a consultant-prescribed diet.",
    });
  }

  if (patient.intestinalDetails || patient.intestinalDetail) {
    alerts.push({
      id: `gi-${patient.id}-${patient.intestinalDetails || patient.intestinalDetail}`,
      type: "GI / Intestinal Alert",
      severity: "Medium",
      message: patient.intestinalDetails || patient.intestinalDetail,
    });
  }

  if (["NPO", "On Hold"].includes(patient.dietStatus)) {
    alerts.push({
      id: `hold-${patient.id}-${patient.dietStatus}`,
      type: "Meal Service Hold",
      severity: "High",
      message: `Patient diet status is ${patient.dietStatus}; kitchen should not serve the regular meal plan.`,
    });
  }

  if (plan?.reviewDate) {
    const review = new Date(plan.reviewDate);
    if (!Number.isNaN(review.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      review.setHours(0, 0, 0, 0);
      if (review < today && !patient.reviewedAt) {
        alerts.push({
          id: `review-date-${patient.id}-${plan.reviewDate}`,
          type: "Diet Review Overdue",
          severity: "High",
          message: `Diet review date ${plan.reviewDate} has passed without a recorded review.`,
        });
      }
    }
  }

  if (workflow?.status === "Cancelled") {
    alerts.push({
      id: `cancelled-${patient.id}`,
      type: "Diet Plan Cancelled",
      severity: "High",
      message: "The current diet workflow is cancelled and requires a new plan before meal service.",
    });
  }

  if (intake?.overallStatus === "Returned" || intake?.overallStatus === "Not Taken") {
    alerts.push({
      id: `intake-${patient.id}-${intake.serviceDate}-${intake.overallStatus}`,
      type: "Meal Intake Alert",
      severity: "Medium",
      message: `Latest meal intake is ${intake.overallStatus}${intake.remarks ? `: ${intake.remarks}` : "."}`,
    });
  }

  if (intake?.observations?.length) {
    alerts.push({
      id: `observation-${patient.id}-${intake.serviceDate}-${intake.observations.join("-")}`,
      type: "Intake Observation",
      severity: intake.observations.some((x) => ["Vomiting", "Swallowing difficulty", "Bowel / intestinal concern"].includes(x)) ? "High" : "Medium",
      message: `Intake observations: ${intake.observations.join(", ")}`,
    });
  }

  if (intake?.intestinalDetail?.trim()) {
    alerts.push({
      id: `intake-gi-${patient.id}-${intake.serviceDate}-${intake.intestinalDetail.trim()}`,
      type: "Intake GI Detail",
      severity: "Medium",
      message: intake.intestinalDetail.trim(),
    });
  }

  const activeMealAlerts = Object.entries(mealStatus || {})
    .filter(([key, value]) => key.includes(`${patient.id}-`) && ["Returned", "Not Taken"].includes(value))
    .slice(0, 3);
  if (activeMealAlerts.length && !intake?.overallStatus) {
    alerts.push({
      id: `meal-status-${patient.id}`,
      type: "Meal Service Alert",
      severity: "Medium",
      message: "One or more meals were returned or not taken.",
    });
  }

  return alerts;
}

export function getClinicalAlertsForPatient(patientId, serviceDate = new Date().toISOString().slice(0, 10)) {
  const patients = getStore(KEYS.PATIENTS, []);
  const patient = patients.find((p) => String(p.id) === String(patientId));
  if (!patient) return [];
  const plans = getStore("hd_diet_plans", []);
  const workflows = getStore("hd_diet_workflow", []);
  const plan = plans.find((p) => String(p.patientId) === String(patientId) && String(p.status).toLowerCase() === "approved") || plans.find((p) => String(p.patientId) === String(patientId));
  const workflow = workflows.find((f) => String(f.patientId) === String(patientId));
  const intake = getStore(`hd_meal_intake_${patientId}_${serviceDate}`, null);
  const mealStatus = getStore("hd_meal_status", {});
  return buildClinicalAlerts({ patient, plan, workflow, intake, mealStatus });
}
