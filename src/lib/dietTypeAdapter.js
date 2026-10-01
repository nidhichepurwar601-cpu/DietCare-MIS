/**
 * Diet type adapter.
 *
 * The backend and the original LocalStorage seed use different field names.
 * Keep one canonical shape in the UI so API integration cannot break
 * Patient Diet Management, Kitchen Operations or Meal Plans.
 */
export function normalizeDietStatus(value, fallback = true) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const v = String(value).trim().toLowerCase();
  if (["true", "1", "active", "enabled", "yes", "y"].includes(v)) return true;
  if (["false", "0", "inactive", "disabled", "no", "n"].includes(v)) return false;
  return fallback;
}

export function normalizeDietType(item, index = 0) {
  if (!item || typeof item !== "object") return null;

  const calories = Number(
    item.calories ??
      item.targetCalories ??
      item.kcal ??
      item.targetKcal ??
      0,
  );

  const proteinPct = Number(
    item.proteinPct ??
      item.proteinPercent ??
      item.proteinPercentage ??
      item.protein ??
      0,
  );

  const carbsPct = Number(
    item.carbsPct ??
      item.carbsPercent ??
      item.carbohydratePercent ??
      item.carbohydrates ??
      0,
  );

  const fatPct = Number(
    item.fatPct ??
      item.fatPercent ??
      item.fatPercentage ??
      item.fat ??
      0,
  );

  return {
    ...item,
    id:
      item.id ??
      item.dietTypeId ??
      item.dietId ??
      item.dietTypeID ??
      `backend-diet-${index}`,
    name: item.name ?? item.dietName ?? item.dietTypeName ?? "",
    code: item.code ?? item.dietCode ?? item.dietTypeCode ?? "",
    description: item.description ?? item.dietDescription ?? "",
    calories: Number.isFinite(calories) ? calories : 0,
    targetCalories: Number.isFinite(calories) ? calories : 0,
    proteinPct: Number.isFinite(proteinPct) ? proteinPct : 0,
    proteinPercent: Number.isFinite(proteinPct) ? proteinPct : 0,
    carbsPct: Number.isFinite(carbsPct) ? carbsPct : 0,
    carbsPercent: Number.isFinite(carbsPct) ? carbsPct : 0,
    fatPct: Number.isFinite(fatPct) ? fatPct : 0,
    fatPercent: Number.isFinite(fatPct) ? fatPct : 0,
    status: normalizeDietStatus(
      item.status ?? item.active ?? item.isActive ?? item.enabled,
      true,
    ),
  };
}

export function isActiveDietType(item) {
  return Boolean(normalizeDietType(item)?.status);
}
