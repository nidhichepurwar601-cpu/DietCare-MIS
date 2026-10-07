const parseMaybeJson = (value) => {
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

const PLAN_KEYS = [
  "patientid",
  "diettemplateid",
  "planname",
  "assignmentstatus",
  "startdate",
];

export function extractPlanRows(response) {
  const candidates = [];
  const seen = new Set();
  const walk = (value, depth = 0) => {
    value = parseMaybeJson(value);
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value))
      return;
    seen.add(value);
    if (Array.isArray(value)) {
      const rows = value.filter(
        (row) => row && typeof row === "object" && !Array.isArray(row),
      );
      if (rows.length) {
        const score = rows.reduce((sum, row) => {
          const keys = Object.keys(row).map((key) => key.toLowerCase());
          return (
            sum + PLAN_KEYS.filter((key) => keys.includes(key)).length
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
  candidates.sort(
    (a, b) => b.score - a.score || b.rows.length - a.rows.length,
  );
  return candidates[0]?.rows || [];
}

export function extractPlanId(response) {
  const seen = new Set();
  const walk = (value, depth = 0) => {
    value = parseMaybeJson(value);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 4 ||
      seen.has(value)
    )
      return null;
    seen.add(value);
    if (value.id != null && String(value.id).trim() !== "") return value.id;
    for (const child of [value.data, value.result, value.plan, value.dietManager]) {
      const found = walk(child, depth + 1);
      if (found != null) return found;
    }
    return null;
  };
  return walk(response);
}

const text = (value) => String(value ?? "").trim();

export function toDietPlanApiPayload(
  form,
  { template, isUpdate = false, user = "admin" } = {},
) {
  const calories = Number(
    template?.targetCalories ??
      template?.calories ??
      form.calorieRequirement ??
      0,
  );
  return {
    patientId: Number(form.patientId),
    dietTemplateId: Number(form.dietTemplateId),
    planName: text(form.planName || template?.name),
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    assignmentStatus: form.status || "Planning",
    allergies: text(form.allergensText),
    specialInstructions: text(form.specialInstructions),
    giDetails: text(form.intestinalDetails),
    spiceLevel: form.spiceLevel || "Normal",
    foodTemperature: form.foodTemperature || "Warm",
    patientTaste: text(form.patientTasteRemark),
    bedDetails: text(form.bedDetails),
    planningRemarks: text(form.planningRemarks),
    nursingRemarks: text(form.nursingRemarks),
    generalRemarks: text(form.remarks),
    calorieRequirement: Number.isFinite(calories) ? calories : 0,
    status: true,
    createdBy: user,
    ...(isUpdate ? { updatedBy: user } : {}),
  };
}

export function fromApiRow(row, templates = []) {
  if (!row || typeof row !== "object") return null;
  const templateId =
    row.dietTemplateId ?? row.dietTemplateID ?? row.templateId;
  const template = templates.find(
    (item) => String(item.id) === String(templateId),
  );
  return {
    id: row.id ?? row.dietManagerId ?? row.planId,
    patientId: row.patientId,
    dietTemplateId: templateId != null ? String(templateId) : "",
    dietTypeId: template?.dietTypeId ?? row.dietTypeId ?? "",
    planName: row.planName ?? "",
    startDate: row.startDate ?? "",
    endDate: row.endDate ?? "",
    status: row.assignmentStatus ?? row.status_text ?? "Planning",
    allergensText: row.allergies ?? "",
    specialInstructions: row.specialInstructions ?? "",
    intestinalDetails: row.giDetails ?? "",
    spiceLevel: row.spiceLevel || "Normal",
    foodTemperature: row.foodTemperature || "Warm",
    patientTasteRemark: row.patientTaste ?? "",
    bedDetails: row.bedDetails ?? "",
    planningRemarks: row.planningRemarks ?? "",
    nursingRemarks: row.nursingRemarks ?? "",
    remarks: row.generalRemarks ?? "",
    calorieRequirement: row.calorieRequirement ?? 0,
  };
}
