const text = (value) => String(value ?? "").trim();

const isActive = (status) =>
  status === true ||
  status === 1 ||
  ["true", "1", "active"].includes(String(status ?? "").toLowerCase());

export function normalizePatientApiRow(row) {
  const allergies = Array.isArray(row.allergies)
    ? row.allergies
    : String(row.allergies ?? row.allergens ?? "")
        .split(",")
        .map((allergy) => allergy.trim())
        .filter(Boolean);

  return {
    ...row,
    id: row.id ?? row.patientId,
    patientCode: row.patientCode ?? row.code ?? "",
    name:
      row.name ??
      row.patientName ??
      row.fullName ??
      [row.firstName, row.lastName].filter(Boolean).join(" "),
    ward: row.ward ?? row.wardName ?? "",
    bedNo: row.bedNo ?? row.bedNumber ?? row.bed ?? "",
    bed: row.bed ?? row.bedNo ?? row.bedNumber ?? "",
    doctorName: row.doctorName ?? row.doctor ?? row.consultantName ?? "",
    consultantName: row.consultantName ?? row.doctorName ?? row.doctor ?? "",
    dietitianName: row.dietitianName ?? row.dietitian ?? "",
    dietitian: row.dietitian ?? row.dietitianName ?? "",
    primaryDiagnosis: row.primaryDiagnosis ?? row.diagnosis ?? row.disease ?? "",
    bmi: row.bmi ?? row.BMI ?? "",
    allergens: allergies.length ? allergies : ["None"],
    allergies: allergies.join(", "),
    history: row.history ?? row.pastHistory ?? "",
    pastHistory: row.pastHistory ?? row.history ?? "",
    pastDiet: row.pastDiet ?? row.previousDiet ?? "",
    previousDiet: row.previousDiet ?? row.pastDiet ?? "",
    status: isActive(row.status) ? "Active" : "Inactive",
  };
}

export function toPatientApiPayload(patient, { isUpdate = false } = {}) {
  const allergies = Array.isArray(patient.allergens)
    ? patient.allergens
        .filter((allergy) => allergy && allergy !== "None")
        .join(", ")
    : text(patient.allergies ?? patient.allergens);
  const status = patient.status === undefined ? true : isActive(patient.status);
  const bmiValue =
    patient.bmi === "" || patient.bmi == null ? null : Number(patient.bmi);

  return {
    patientCode: text(patient.patientCode),
    name: text(patient.name),
    ward: text(patient.ward),
    bed: text(patient.bed) || text(patient.bedNo),
    doctorName: text(patient.doctorName) || text(patient.consultantName),
    dietitianName: text(patient.dietitianName) || text(patient.dietitian),
    diagnosis: text(patient.diagnosis) || text(patient.primaryDiagnosis),
    bmi: Number.isFinite(bmiValue) ? bmiValue : null,
    allergies,
    pastHistory: text(patient.pastHistory) || text(patient.history),
    previousDiet: text(patient.previousDiet) || text(patient.pastDiet),
    status,
    createdBy: text(patient.createdBy) || "admin",
    ...(isUpdate ? { updatedBy: text(patient.updatedBy) || "admin" } : {}),
  };
}

export function extractPatientRows(response) {
  const candidates = [];
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return;
      }
    }
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value))
      return;
    seen.add(value);
    if (Array.isArray(value)) {
      const rows = value.filter(
        (row) => row && typeof row === "object" && !Array.isArray(row),
      );
      if (rows.length) candidates.push(rows);
      rows.forEach((row) => visit(row, depth + 1));
      return;
    }
    Object.values(value).forEach((child) => visit(child, depth + 1));
  };
  visit(response);
  return candidates.sort((a, b) => b.length - a.length)[0] || [];
}
