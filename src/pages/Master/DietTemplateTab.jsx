import React, { useEffect, useMemo, useState } from "react";
import {
  Edit,
  Trash2,
  Plus,
  Search,
  X,
  Save,
  UtensilsCrossed,
  Users,
  Calculator,
} from "lucide-react";
import Modal from "../../components/common/Modal.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import {
  getStore,
  setStore,
  addRecord,
  updateRecord,
  deleteRecord,
  KEYS,
  STANDARD_UNITS,
  normalizeUnit,
  positiveQuantity,
  resolveQuantity,
} from "../../lib/storage.js";
import {
  normalizeDietType,
  normalizeDietStatus,
} from "../../lib/dietTypeAdapter.js";
import dietTemplateService from "../../services/dietTemplateService.js";
import templateItemService from "../../services/templateItemService.js";
import foodService from "../../services/foodService.js";
import foodNutritionService from "../../services/foodNutritionService.js";
import { loadTemplateMappings } from "../../lib/masterData.js";


const MEAL_NAMES = [
  "Breakfast",
  "Mid-Morning",
  "Lunch",
  "Evening Snack",
  "Dinner",
  "Bedtime",
];



function normalizeMealFoodUnit(unit) {
  const normalized = normalizeUnit(unit);
  return STANDARD_UNITS.includes(normalized) ? normalized : STANDARD_UNITS[0];
}

const EMPTY = {
  dietTypeId: "",
  code: "",
  name: "",
  planName: "",
  dietType: "",
  description: "",
  targetCalories: 0,
  proteinPercent: 0,
  carbsPercent: 0,
  fatPercent: 0,
  status: true,
  createdBy: "Admin",
  updatedBy: "Admin",
};

const ROW_KEYS = [
  "name",
  "dietName",
  "dietTypeName",
  "code",
  "dietCode",
  "dietTypeCode",
  "description",
  "dietDescription",
  "targetCalories",
  "calories",
  "kcal",
];

function parseMaybeJson(value) {
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
}

function extractRows(response) {
  const candidates = [];
  const visited = new Set();

  const score = (rows) => {
    if (!Array.isArray(rows) || !rows.length) return -1;
    return rows.reduce((sum, row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return sum;
      const keys = Object.keys(row).map((key) => key.toLowerCase());
      return (
        sum + ROW_KEYS.filter((key) => keys.includes(key.toLowerCase())).length
      );
    }, 0);
  };

  const walk = (value, path = "response", depth = 0) => {
    value = parseMaybeJson(value);
    if (!value || typeof value !== "object" || depth > 8) return;
    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      const rows = value.filter(
        (item) => item && typeof item === "object" && !Array.isArray(item),
      );
      if (rows.length) candidates.push({ rows, path, score: score(rows) });
      rows.forEach((row, i) => walk(row, `${path}[${i}]`, depth + 1));
      return;
    }

    Object.entries(value).forEach(([key, child]) =>
      walk(child, `${path}.${key}`, depth + 1),
    );
  };

  walk(response);
  candidates.sort((a, b) => b.score - a.score || b.rows.length - a.rows.length);
  return candidates[0]?.rows || [];
}

function extractTotal(response, fallback) {
  // Prefer pagination totals from the response/root containers. Do not use a
  // nested generic `count` first because meal/food objects may also contain a
  // count field (which can make 22 backend records look like 21 in the UI).
  const preferredKeys = [
    "totalCount",
    "totalRecords",
    "totalElements",
    "totalItems",
    "recordCount",
  ];
  const visited = new Set();

  const findPreferred = (value, depth = 0) => {
    if (!value || typeof value !== "object" || depth > 4) return null;
    if (visited.has(value)) return null;
    visited.add(value);

    for (const key of preferredKeys) {
      const raw = value?.[key];
      const n = Number(raw);
      if (raw !== null && raw !== undefined && Number.isFinite(n) && n >= 0) {
        return n;
      }
    }

    // Search common pagination/data containers before scanning arbitrary
    // nested objects.
    const priorityChildren = [
      value.paginationInfo,
      value.pagination,
      value.pageInfo,
      value.meta,
      value.metadata,
      value.data,
      value.result,
      value.response,
    ];

    for (const child of priorityChildren) {
      const found = findPreferred(child, depth + 1);
      if (found !== null) return found;
    }

    return null;
  };

  const preferred = findPreferred(response);
  if (preferred !== null) return preferred;

  // Only use a generic `count` as a last resort, and only at shallow/common
  // response containers. This avoids accidentally reading a row-level count.
  const countContainers = [
    response,
    response?.data,
    response?.result,
    response?.paginationInfo,
    response?.pagination,
    response?.pageInfo,
    response?.meta,
  ];

  for (const container of countContainers) {
    if (!container || typeof container !== "object") continue;
    const n = Number(container.count);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  return fallback;
}
function numericQuantity(value) {
  const direct = Number(value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(value ?? "").match(/[0-9]+(?:\.[0-9]+)?/);
  const parsed = match ? Number(match[0]) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function foodNutrition(food, quantity, unit) {
  const qty = numericQuantity(quantity);
  if (!food || !qty) {
    return { calories: 0, protein: 0, carbs: 0, fat: 0 };
  }

  const stdQty = numericQuantity(food.standardQuantity) || 1;
  const sameUnit = normalizeUnit(unit) === normalizeUnit(food.unit);
  const servings = sameUnit ? qty / stdQty : qty;

  return {
    calories: Number(food.calories || 0) * servings,
    protein: Number(food.protein || 0) * servings,
    carbs: Number(food.carbs || 0) * servings,
    fat: Number(food.fat || 0) * servings,
  };
}

function hydrateMappingsFromTemplateRows(templateRows) {
  const current = getStore(KEYS.DIET_MAPPING, []) || [];
  const next = [...current];
  let changed = false;

  for (const template of templateRows || []) {
    if (!template?.hasBackendTemplateId || template.templateId == null)
      continue;
    const rawItems =
      template.items ||
      template.dietTemplateItems ||
      template.templateItems ||
      template.dietTemplateItemList ||
      [];
    if (!Array.isArray(rawItems) || !rawItems.length) continue;

    for (const raw of rawItems) {
      const mealTypeId = raw?.mealTypeId ?? raw?.meal_type_id;
      const foodId = raw?.foodId ?? raw?.food_id;
      if (mealTypeId == null || foodId == null) continue;

      const existingIndex = next.findIndex(
        (m) =>
          Number(m.dietTemplateId) === Number(template.templateId) &&
          Number(m.mealTypeId) === Number(mealTypeId),
      );
      const existing = existingIndex >= 0 ? next[existingIndex] : null;
      const foodItems = Array.isArray(existing?.foodItems)
        ? [...existing.foodItems]
        : [];
      if (!foodItems.some((id) => Number(id) === Number(foodId))) {
        foodItems.push(Number(foodId));
      }

      const quantity = raw?.amount ?? raw?.quantity;
      const unit = raw?.unit;
      const record = {
        ...(existing || {}),
        id: existing?.id ?? raw?.id ?? undefined,
        dietTemplateId: Number(template.templateId),
        dietTypeId: Number(template.dietTypeId) || null,
        mealTypeId: Number(mealTypeId),
        foodItems,
        quantities: {
          ...(existing?.quantities || {}),
          ...(quantity != null ? { [foodId]: Number(quantity) } : {}),
        },
        quantityTexts: {
          ...(existing?.quantityTexts || {}),
          ...(quantity != null ? { [foodId]: String(quantity) } : {}),
        },
        units: {
          ...(existing?.units || {}),
          ...(unit ? { [foodId]: normalizeUnit(unit) } : {}),
        },
        status: raw?.status ?? true,
      };

      if (existingIndex >= 0) next[existingIndex] = record;
      else next.push(record);
      changed = true;
    }
  }

  if (changed) setStore(KEYS.DIET_MAPPING, next);
  return next;
}

function migrateLegacyMappingsToTemplateIds(templateRows) {
  const mappings = getStore(KEYS.DIET_MAPPING) || [];
  if (
    !Array.isArray(mappings) ||
    !mappings.length ||
    !Array.isArray(templateRows) ||
    !templateRows.length
  ) {
    return mappings;
  }

  const templates = templateRows.filter(
    (t) => t?.hasBackendTemplateId && t?.templateId != null,
  );
  let changed = false;
  const migrated = mappings.map((mapping) => {
    const existingTemplateId = mapping?.dietTemplateId;
    const hasRealTemplate =
      existingTemplateId != null &&
      templates.some(
        (t) => String(t.templateId) === String(existingTemplateId),
      );
    if (hasRealTemplate) return mapping;

    const legacyDietTypeId = mapping?.dietTypeId;
    if (legacyDietTypeId == null || legacyDietTypeId === "") return mapping;

    // A legacy mapping can only be migrated safely when that Diet Type has
    // exactly one Diet Template. If there are multiple templates for the same
    // Diet Type, do not guess which template owns the item.
    const matches = templates.filter(
      (t) => String(t.dietTypeId) === String(legacyDietTypeId),
    );
    if (matches.length !== 1) return mapping;

    changed = true;
    return {
      ...mapping,
      dietTemplateId: matches[0].templateId,
    };
  });

  if (changed) setStore(KEYS.DIET_MAPPING, migrated);
  return migrated;
}

function buildDraft(dietId, dietTypeId, mappings, mealTypes, foods) {
  // Only render meal types that are actually mapped to this template.
  // A brand-new template starts with no meal rows; the user explicitly adds
  // Breakfast/Lunch/etc. from the Meal Type selector below.
  const relevantMappings = (mappings || []).filter((item) => {
    const sameTemplate =
      dietId != null &&
      dietId !== "" &&
      Number(item.dietTemplateId) === Number(dietId);
    const legacyDietTypeMatch =
      item.dietTemplateId == null &&
      dietTypeId != null &&
      dietTypeId !== "" &&
      Number(item.dietTypeId) === Number(dietTypeId);
    return sameTemplate || legacyDietTypeMatch;
  });

  const seenMealTypes = new Set();

  return relevantMappings
    .filter((mapping) => {
      const mealTypeId = mapping?.mealTypeId;
      if (mealTypeId == null || mealTypeId === "") return false;
      const key = String(mealTypeId);
      if (seenMealTypes.has(key)) return false;
      seenMealTypes.add(key);
      return true;
    })
    .map((mapping) => {
      const meal = mealTypes.find(
        (item) => Number(item.id) === Number(mapping.mealTypeId),
      );
      const mealName =
        meal?.name || mapping.mealTypeName || `Meal ${mapping.mealTypeId}`;

      const foodItems = (mapping.foodItems || [])
        .map((foodId) => {
          const id = Number(foodId);
          const food = foods.find((item) => Number(item.id) === id);
          if (!food) return null;
          return {
            foodId: id,
            quantity:
              mapping.quantityTexts?.[foodId] ??
              resolveQuantity(
                mapping.quantities?.[foodId],
                food.standardQuantity,
              ) ??
              food.standardQuantity,
            unit: normalizeMealFoodUnit(mapping.units?.[foodId] || food.unit),
          };
        })
        .filter(Boolean);

      return {
        ...mapping,
        mealName,
        foodItems,
        quantities: { ...(mapping.quantities || {}) },
        units: { ...(mapping.units || {}) },
        addOns: Array.isArray(mapping.addOns) ? mapping.addOns : [],
      };
    });
}

export default function DietTemplateTab() {
  const [data, setData] = useState([]);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const loadLocal = (currentPage = 1, pageSize = 10) => {
    const all = (getStore(KEYS.DIET_TEMPLATES, []) || [])
      .map((x, i) => normalizeTemplateRecord(x, i))
      .filter(Boolean);
    const filtered = search.trim()
      ? all.filter((x) =>
          `${x.name} ${x.code} ${x.description}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
      : all;
    const start = (currentPage - 1) * pageSize;
    setData(filtered.slice(start, start + pageSize));
    setTotalItems(filtered.length);
    setOnline(false);
  };

  // IMPORTANT: a Diet Template has its own primary key. `dietTypeId` is the
  // parent/reference diet type and must NEVER be used as the template id.
  // This distinction is especially important on CREATE: POST must let the
  // backend generate a brand-new template id. PUT is the only operation that
  // receives an existing template id in the URL.
  const getTemplateId = (value) => {
    value = parseMaybeJson(value);
    if (!value || typeof value !== "object") return null;

    // A Diet Template Item has its own `id`, while `dietTemplateId` points
    // to the parent Diet Template. Never mistake the item id for the
    // template id when the backend returns an item-shaped object.
    const isTemplateItem =
      value.foodId != null ||
      value.food_id != null ||
      value.mealTypeId != null ||
      value.meal_type_id != null;

    const directCandidates = isTemplateItem
      ? [value.dietTemplateId, value.dietTemplateID, value.templateId, value.id]
      : [
          value.id,
          value.templateId,
          value.dietTemplateId,
          value.dietTemplateID,
        ];

    for (const candidate of directCandidates) {
      if (
        candidate !== null &&
        candidate !== undefined &&
        String(candidate).trim() !== ""
      ) {
        return candidate;
      }
    }

    const nestedCandidates = [
      value.data,
      value.result,
      value.template,
      value.dietTemplate,
    ];

    for (const child of nestedCandidates) {
      const id = getTemplateId(child);
      if (id !== null && id !== undefined) return id;
    }

    return null;
  };

  const normalizeTemplateRecord = (item, index = 0) => {
    if (!item || typeof item !== "object") return null;

    const templateId = getTemplateId(item);
    if (templateId === null || templateId === undefined) {
      // Do not silently convert dietTypeId into a template id. If the backend
      // does not expose the template primary key, this row cannot safely be
      // edited/deleted through /template/update/{id} or /template/delete/{id}.
      return {
        ...normalizeDietType(
          { ...item, id: `backend-template-missing-id-${index}` },
          index,
        ),
        templateId: null,
        hasBackendTemplateId: false,
      };
    }

    return {
      ...normalizeDietType({ ...item, id: templateId }, index),
      templateId,
      hasBackendTemplateId: true,
    };
  };

  // The backend exposes the template/diet list through /diet/type/get.
  // This is a POST list endpoint (with pagination), not the template CREATE
  // endpoint. Keeping the list request separate prevents accidental POST/create
  // calls while loading the table.
  const fetchBackendTemplates = async (
    currentPage = 1,
    pageSize = 10,
    name = "",
  ) => {
    const payload = {
      code: "",
      name: String(name || ""),
      dietTypeId: null,
      status: null,
      paginationInfo: {
        currentPage,
        pageSize,
        dataSorting: {
          byColumn: {
            field: "name",
            title: "Name",
            sortable: true,
          },
          sortingOrder: "ASC",
        },
      },
    };

    const response = await dietTemplateService.getAllTemplates(payload);

    if (
      !response ||
      response.error ||
      response.statusCode >= 400 ||
      response.status >= 400
    ) {
      throw new Error(
        response?.message ||
          response?.error?.message ||
          "Unable to load Diet Templates from the backend.",
      );
    }

    const rows = extractRows(response)
      .map((item, index) => normalizeTemplateRecord(item, index))
      .filter(Boolean);

    return {
      rows,
      total: extractTotal(response, rows.length),
    };
  };

  const loadApi = async (currentPage = 1, pageSize = 10, name = search) => {
    setLoading(true);
    try {
      const { rows, total } = await fetchBackendTemplates(
        currentPage,
        pageSize,
        name,
      );

      // Migrate older frontend-only mappings that were stored with
      // dietTypeId. The backend relationship is DIET_TEMPLATE.id ->
      // DIET_TEMPLATE_ITEM.diet_template_id. Only migrate when the Diet Plan
      // has exactly one template so we never attach food to the wrong template.
      hydrateMappingsFromTemplateRows(rows);
      migrateLegacyMappingsToTemplateIds(rows);

      setData(rows);
      setTotalItems(total);
      setPage(currentPage);
      setOnline(true);

      // Keep the local cache synchronized with the backend.
      if (rows.length) {
        const existing = getStore(KEYS.DIET_TEMPLATES, []) || [];
        const merged = [...existing];
        rows.forEach((row) => {
          const index = merged.findIndex(
            (item) => String(item?.id) === String(row.id),
          );
          if (index >= 0) merged[index] = row;
          else merged.push(row);
        });
        setStore(KEYS.DIET_TEMPLATES, merged);
      }
    } catch (error) {
      console.warn(
        "Diet Template API unavailable; using current-session data only.",
        error,
      );
      loadLocal(currentPage, pageSize);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Backend is the source of truth whenever the application starts online.
    // Session data is used only if the API request fails.
    loadApi(1, 10, "");
    // Initial load only. Search is submitted explicitly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openEditor = (diet = null) => {
    setEditing(diet ? normalizeDietType(diet) : { ...EMPTY });
  };

  const buildDietTemplatePayload = (form, items = [], isEdit = false) => {
    const rawDietTypeId = form.dietTypeId || form.dietType;
    const dietTypeId =
      rawDietTypeId !== undefined &&
      rawDietTypeId !== null &&
      rawDietTypeId !== ""
        ? Number(rawDietTypeId)
        : null;

    return {
      dietTypeId, // null when the screen doesn't collect a diet type — never 0
      code: String(form.code || "").trim(),
      name: String(form.name || "").trim(),
      description: String(form.description || "").trim(),
      targetCalories: Number(form.targetCalories || 0),
      status:
        typeof form.status === "boolean"
          ? form.status
            ? 1
            : 0
          : form.status === "Active"
            ? 1
            : 0,
      ...(isEdit
        ? { updatedBy: "Admin" }
        : { createdBy: form.createdBy || "Admin" }),
      items: Array.isArray(items) ? items : [],
    };
  };

  const getApiRecord = (response) => {
    if (!response || response.error) return null;

    const visited = new Set();
    const walk = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 6) return null;
      if (visited.has(value)) return null;
      visited.add(value);

      const id = getTemplateId(value);
      if (id !== null && id !== undefined) return value;

      for (const child of Object.values(value)) {
        const found = walk(child, depth + 1);
        if (found) return found;
      }
      return null;
    };

    return walk(response) || (typeof response === "object" ? response : null);
  };

  // Resolve the REAL backend FOOD.id before creating a Diet Template Item.
  // UI IDs are not guaranteed to match the
  // backend FOOD.id (for example, Plain Curd can be local id 15 while the
  // backend id is 7). If a backend id is not already cached, first look for
  // the food in existing backend template items; if it does not exist there,
  // create the food once and cache the returned backend id.
  const resolveBackendFoodId = async (food) => {
    if (!food) return null;

    const cached =
      food.backendFoodId ?? food.backendId ?? food.apiFoodId ?? food.foodId;
    if (
      cached !== null &&
      cached !== undefined &&
      String(cached).trim() !== ""
    ) {
      return Number(cached);
    }

    const normalizeText = (value) =>
      String(value ?? "")
        .trim()
        .toLowerCase();
    const targetName = normalizeText(food.name);
    const targetCode = normalizeText(
      food.code ||
        String(food.name || "")
          .trim()
          .toUpperCase()
          .replace(/\s+/g, "_"),
    );

    // Reuse a backend food id already present in template-item responses.
    try {
      const result = await fetchBackendTemplates(1, 100, "");
      const visited = new Set();
      let foundId = null;

      const walk = (value, depth = 0) => {
        if (
          foundId !== null ||
          !value ||
          typeof value !== "object" ||
          depth > 8
        )
          return;
        if (visited.has(value)) return;
        visited.add(value);

        if (Array.isArray(value)) {
          value.forEach((item) => walk(item, depth + 1));
          return;
        }

        const itemFoodId = value.foodId ?? value.food_id;
        const itemName = normalizeText(
          value.foodName ?? value.food_name ?? value.name,
        );
        const itemCode = normalizeText(
          value.foodCode ?? value.food_code ?? value.code,
        );

        if (
          itemFoodId != null &&
          ((targetName && itemName === targetName) ||
            (targetCode && itemCode === targetCode))
        ) {
          const n = Number(itemFoodId);
          if (Number.isFinite(n) && n > 0) {
            foundId = n;
            return;
          }
        }

        Object.values(value).forEach((child) => walk(child, depth + 1));
      };

      walk(result.rows);

      if (foundId !== null) {
        return foundId;
      }
    } catch (error) {
      console.warn(
        "Unable to resolve backend food from existing template items:",
        error,
      );
    }

    // The food is present only in session data. Create it in the backend so
    // the subsequent Diet Template Item request cannot fail with "Food not found".
    const foodPayload = {
      code: String(food.code || food.name || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_"),
      name: String(food.name || "").trim(),
      category: String(food.category || "").trim(),
      unit: normalizeUnit(food.unit),
      description: String(food.description || "").trim(),
      status: food.status === true || food.status === "Active",
      createdBy: food.createdBy || "Admin",
      updatedBy: "Admin",
    };

    const foodResponse = await foodService.createFood(foodPayload);

    if (
      !foodResponse ||
      foodResponse.error ||
      foodResponse.statusCode >= 400 ||
      foodResponse.status >= 400
    ) {
      throw new Error(
        foodResponse?.message ||
          foodResponse?.error?.message ||
          `Unable to create backend food "${food.name}".`,
      );
    }

    const createdFood =
      foodResponse?.data && typeof foodResponse.data === "object"
        ? foodResponse.data
        : foodResponse;
    const backendFoodId =
      createdFood?.id ??
      createdFood?.foodId ??
      createdFood?.data?.id ??
      createdFood?.data?.foodId;

    if (backendFoodId == null || !Number.isFinite(Number(backendFoodId))) {
      throw new Error(
        `Backend created food "${food.name}" but did not return its ID.`,
      );
    }

    const nutritionResponse = await foodNutritionService.saveNutrition({
      foodId: Number(backendFoodId),
      calories: Number(food.calories || 0),
      protein: Number(food.protein || 0),
      carbohydrates: Number(food.carbs ?? food.carbohydrates ?? 0),
      fat: Number(food.fat || 0),
      fiber: Number(food.fiber || 0),
    });

    if (
      nutritionResponse &&
      (nutritionResponse.error ||
        nutritionResponse.statusCode >= 400 ||
        nutritionResponse.status >= 400)
    ) {
      console.warn(
        "Food was created but nutrition save failed:",
        nutritionResponse,
      );
    }

    // Preserve the backend id without replacing the UI id used by
    // the existing UI. This keeps the current table/mapping IDs untouched.
    try {
      const currentFoods = getStore(KEYS.FOOD_MASTER, []) || [];
      const index = currentFoods.findIndex(
        (item) => String(item.id) === String(food.id),
      );
      if (index >= 0) {
        currentFoods[index] = {
          ...currentFoods[index],
          backendFoodId: Number(backendFoodId),
        };
        setStore(KEYS.FOOD_MASTER, currentFoods);
      }
    } catch {}

    return Number(backendFoodId);
  };

  const saveTemplateItems = async (templateId, draft, isEdit) => {
    if (!templateId) return [];

    const failures = [];
    const foods = getStore(KEYS.FOOD_MASTER, []) || [];
    const mealTypes = getStore(KEYS.MEAL_TYPES, []) || [];

    const desired = [];
    for (const meal of draft || []) {
      if (!meal.mealTypeId || !Array.isArray(meal.foodItems)) continue;

      const mealType = mealTypes.find(
        (item) => Number(item.id) === Number(meal.mealTypeId),
      );
      const backendMealTypeId =
        mealType?.backendMealTypeId ?? mealType?.id ?? meal.mealTypeId;
      if (!backendMealTypeId) continue;

      for (const item of meal.foodItems) {
        const quantity = numericQuantity(item.quantity);
        if (!item.foodId || quantity === null) continue;

        const localFood = foods.find(
          (food) => Number(food.id) === Number(item.foodId),
        );

        try {
          const backendFoodId = await resolveBackendFoodId(localFood);
          if (!backendFoodId) {
            throw new Error(
              `Backend food ID could not be resolved for ${localFood?.name || item.foodId}.`,
            );
          }

          desired.push({
            mealTypeId: Number(backendMealTypeId),
            foodId: Number(backendFoodId),
            amount: quantity,
            unit: normalizeMealFoodUnit(item.unit),
          });
        } catch (error) {
          failures.push(
            `${meal.mealName}: ${error?.message || "food ID could not be resolved"}`,
          );
        }
      }
    }

    let existingItems = [];
    if (isEdit) {
      try {
        const response = await templateItemService.getItemsByTemplateId(
          Number(templateId),
        );
        existingItems = extractRows(response);
      } catch (error) {
        failures.push(
          `Unable to load existing template items: ${error?.message || "request failed"}`,
        );
      }
    }

    const usedExistingIds = new Set();

    for (const item of desired) {
      const existing = existingItems.find(
        (row) =>
          Number(row.mealTypeId ?? row.meal_type_id) ===
            Number(item.mealTypeId) &&
          Number(row.foodId ?? row.food_id) === Number(item.foodId),
      );

      try {
        if (existing?.id != null) {
          usedExistingIds.add(String(existing.id));
          await templateItemService.updateItemById(existing.id, {
            mealTypeId: item.mealTypeId,
            foodId: item.foodId,
            amount: item.amount,
            unit: item.unit,
          });
        } else {
          await templateItemService.createItem({
            dietTemplateId: Number(templateId),
            mealTypeId: item.mealTypeId,
            foodId: item.foodId,
            amount: item.amount,
            unit: item.unit,
          });
        }
      } catch (error) {
        failures.push(
          `Meal ${item.mealTypeId}, Food ${item.foodId}: ${error?.message || "backend rejected the item"}`,
        );
      }
    }

    // On EDIT, remove backend items that are no longer present in the editor.
    if (isEdit) {
      for (const existing of existingItems) {
        if (existing?.id == null || usedExistingIds.has(String(existing.id)))
          continue;
        try {
          await templateItemService.deleteItem(existing.id);
        } catch (error) {
          failures.push(
            `Unable to delete template item ${existing.id}: ${error?.message || "request failed"}`,
          );
        }
      }
    }

    return failures;
  };

  const getNextSequentialTemplateId = (rows = []) => {
    const numericIds = (rows || [])
      .map((row) => getTemplateId(row))
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id >= 0);

    if (!numericIds.length) return null;
    return Math.max(...numericIds) + 1;
  };

  const saveDiet = async (form, draft, editMode = false) => {
    // Template items are synchronized through the dedicated Template Item APIs
    // below. Keep the parent payload structurally aligned with the documented
    // contract while avoiding duplicate child creation.
    const payload = buildDietTemplatePayload(form, [], Boolean(editMode));

    if (!payload.name) {
      alert("Diet Template Name is required.");
      return null;
    }
    if (!payload.code) {
      alert("Diet Template Code is required.");
      return null;
    }
    if (
      !Number.isFinite(payload.targetCalories) ||
      payload.targetCalories < 0
    ) {
      alert("Target kcal cannot be negative.");
      return null;
    }

    // The mode is decided by the actual editor state, not by an id accidentally
    // present in the form. A NEW template always uses POST and never sends an
    // existing template id. Only EDIT uses PUT /update/{existingId}.
    const existingTemplateId = editMode ? getTemplateId(form) : null;
    if (
      editMode &&
      (existingTemplateId === null || existingTemplateId === undefined)
    ) {
      alert(
        "Cannot update the template because its backend template ID is missing.",
      );
      return null;
    }

    const isEdit = Boolean(editMode);

    // Snapshot IDs before CREATE. A newly created template MUST have an id that
    // did not already exist. Never use dietTypeId as a substitute.
    const existingIds = new Set(
      (getStore(KEYS.DIET_TEMPLATES, []) || [])
        .map((item) => getTemplateId(item))
        .filter((id) => id !== null && id !== undefined)
        .map((id) => String(id)),
    );

    // The create API in this project may successfully create the row but
    // return only a success message instead of the generated template id.
    // Capture the next sequential numeric template id before CREATE so the
    // frontend can still continue with the newly-created template and its
    // meal items without ever confusing dietTypeId with dietTemplateId.
    let expectedNewTemplateId = null;
    if (!isEdit) {
      try {
        const beforeCreate = await fetchBackendTemplates(1, 100, "");
        expectedNewTemplateId = getNextSequentialTemplateId(beforeCreate.rows);
        (beforeCreate.rows || []).forEach((row) => {
          const id = getTemplateId(row);
          if (id !== null && id !== undefined) existingIds.add(String(id));
        });
      } catch (error) {
        console.warn(
          "Unable to calculate the next Diet Template ID before CREATE; the backend response will be used if it returns an ID.",
          error,
        );
      }
    }

    try {
      const response = isEdit
        ? await dietTemplateService.updateTemplateById(
            existingTemplateId,
            payload,
          )
        : await dietTemplateService.createTemplate(payload);

      if (
        !response ||
        response.error ||
        response.statusCode >= 400 ||
        response.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            response?.error?.cause ||
            `Backend rejected the Diet Template request.`,
        );
      }

      let responseData = getApiRecord(response);
      let generatedTemplateId = isEdit
        ? existingTemplateId
        : getTemplateId(responseData);

      // CREATE must receive a NEW backend-generated id. If the POST response is
      // empty, look the record up again by unique code/name. Never accept an id
      // that was already present before the POST.
      if (
        !isEdit &&
        generatedTemplateId !== null &&
        existingIds.has(String(generatedTemplateId))
      ) {
        generatedTemplateId = null;
      }

      if (!isEdit && !generatedTemplateId) {
        const lookupNames = [payload.code, payload.name]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());

        for (
          let attempt = 0;
          attempt < 4 && !generatedTemplateId;
          attempt += 1
        ) {
          const { rows } = await fetchBackendTemplates(1, 100, "");
          const matches = rows.filter((row) => {
            const code = String(row.code || "")
              .trim()
              .toLowerCase();
            const name = String(row.name || "")
              .trim()
              .toLowerCase();
            return lookupNames.includes(code) || lookupNames.includes(name);
          });

          const freshMatch = matches.find(
            (row) =>
              row.hasBackendTemplateId &&
              row.templateId !== null &&
              !existingIds.has(String(row.templateId)),
          );

          if (freshMatch) {
            generatedTemplateId = freshMatch.templateId;
            responseData = freshMatch;
            break;
          }

          if (attempt < 3) {
            await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      }

      // Some backend CREATE responses contain no template id even though the
      // database row was created successfully. In that case use the next
      // sequential numeric template id captured immediately before CREATE.
      // This is deliberately NOT dietTypeId. The two IDs remain distinct.
      if (!isEdit && !generatedTemplateId && expectedNewTemplateId != null) {
        generatedTemplateId = expectedNewTemplateId;
      }

      if (!generatedTemplateId) {
        throw new Error(
          isEdit
            ? "The backend update succeeded but no template ID was returned."
            : "The backend created the template, but no new Diet Template ID could be determined. Please check the create API response or backend template list.",
        );
      }

      if (!isEdit && existingIds.has(String(generatedTemplateId))) {
        throw new Error(
          `Backend returned existing template ID ${generatedTemplateId} for a CREATE request. CREATE must generate a new ID; PUT is only for updates.`,
        );
      }

      const candidate = normalizeTemplateRecord(
        {
          ...form,
          ...payload,
          ...(responseData && typeof responseData === "object"
            ? responseData
            : {}),
          id: generatedTemplateId,
          templateId: generatedTemplateId,
        },
        Date.now(),
      );

      if (!candidate?.id || !candidate?.hasBackendTemplateId) {
        throw new Error(
          "A valid backend template ID is required before saving meal items.",
        );
      }

      const mealItemFailures = await saveTemplateItems(
        candidate.id,
        draft,
        isEdit,
      );

      // The backend is authoritative after CREATE/PUT. Reload the list instead
      // of manually incrementing/replacing the frontend count. This prevents
      // stale session data from hiding records and guarantees that the
      // displayed total comes from the same API response as the table rows.
      const refreshed = await fetchBackendTemplates(1, 10, "");
      setData(refreshed.rows);
      setTotalItems(refreshed.total);
      setPage(1);
      setOnline(true);

      const cached = getStore(KEYS.DIET_TEMPLATES, []) || [];
      const cacheIndex = cached.findIndex(
        (item) => String(getTemplateId(item)) === String(candidate.id),
      );
      if (cacheIndex >= 0) cached[cacheIndex] = candidate;
      else cached.push(candidate);
      setStore(KEYS.DIET_TEMPLATES, cached);

      if (mealItemFailures.length) {
        alert(
          `Diet Template saved, but ${mealItemFailures.length} meal item(s) were rejected by the backend.\
\
${mealItemFailures.join(
  "\
",
)}`,
        );
      }

      return candidate;
    } catch (error) {
      console.error("Diet Template API Error:", error);
      alert(error?.message || "Unable to save Diet Template to the backend.");
      return null;
    }
  };

  const removeTemplate = async () => {
    if (!deleting?.id) return;

    try {
      const response = await dietTemplateService.deleteTemplate(deleting.id);

      if (
        response === null ||
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "Backend rejected the Diet Template delete request.",
        );
      }

      deleteRecord(KEYS.DIET_TEMPLATES, deleting.id);
      setStore(
        KEYS.DIET_MAPPING,
        (getStore(KEYS.DIET_MAPPING) || []).filter(
          (item) => String(item.dietTemplateId) !== String(deleting.id),
        ),
      );
      setDeleting(null);

      // Re-read the backend after DELETE so the table and total count exactly
      // match the database.
      await loadApi(1, 10, search);
    } catch (error) {
      console.error("Diet Template Delete API Error:", error);
      alert(
        error?.message || "Unable to delete Diet Template from the backend.",
      );
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2
            style={{
              fontSize: "var(--font-h3)",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Diet Templates
          </h2>
          <p
            style={{
              fontSize: "var(--font-caption)",
              color: "var(--text-secondary)",
            }}
          >
            Diet type + meal mapping + Food Master portions in one template.
          </p>
        </div>
        <button
          type="button"
          onClick={() => openEditor()}
          className="hospital-button hospital-button-sm"
        >
          <Plus size={15} /> Add Diet Template
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative">
          <Search
            size={15}
            className="absolute left-2.5 top-2.5 text-gray-400"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                online ? loadApi(1, 10, search) : loadLocal(1, 10);
              }
            }}
            placeholder="Search diet template..."
            className="hospital-input"
            style={{ paddingLeft: 32, width: 256 }}
          />
        </div>
        <button
          type="button"
          onClick={() => {
            setPage(1);
            loadApi(1, 10, search);
          }}
          className="hospital-button hospital-button-secondary"
        >
          Search
        </button>
        {loading && (
          <span
            style={{
              fontSize: "var(--font-caption)",
              color: "var(--text-secondary)",
            }}
          >
            Loading...
          </span>
        )}
      </div>

      <div className="hospital-table-wrap">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-3 py-2.5">Diet Template</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="px-3 py-2.5">Meals</th>
              <th className="px-3 py-2.5">Calculated Nutrition</th>
              <th className="px-3 py-2.5">With Meal Plan</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5 text-right"></th>
            </tr>
          </thead>
          <tbody>
            {data.map((diet) => (
              <TemplateRow
                key={diet.id}
                diet={diet}
                onEdit={() => openEditor(diet)}
                onDelete={() => setDeleting(diet)}
              />
            ))}
            {!data.length && (
              <tr>
                <td
                  colSpan={7}
                  className="px-4 py-10 text-center text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {loading
                    ? "Loading diet templates..."
                    : "No diet templates found."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        style={{
          marginTop: "var(--space-3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "var(--font-caption)",
          color: "var(--text-secondary)",
        }}
      >
        <span>
          Showing {data.length ? (page - 1) * 10 + 1 : 0}–
          {(page - 1) * 10 + data.length} of {totalItems}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => {
              const next = page - 1;
              setPage(next);
              online ? loadApi(next, 10, search) : loadLocal(next, 10);
            }}
            className="hospital-button hospital-button-secondary hospital-button-sm"
          >
            ‹
          </button>
          <button
            type="button"
            disabled={page * 10 >= totalItems || loading}
            onClick={() => {
              const next = page + 1;
              setPage(next);
              online ? loadApi(next, 10, search) : loadLocal(next, 10);
            }}
            className="hospital-button hospital-button-secondary hospital-button-sm"
          >
            ›
          </button>
        </div>
      </div>

      {editing && (
        <DietTemplateEditor
          diet={editing}
          onClose={() => setEditing(null)}
          onSave={async (form, draft) => {
            const saved = await saveDiet(form, draft, Boolean(editing?.id));
            if (!saved) return;

            const dietId = saved.id;

            // Keep the meal mapping cache in sync with the same template id.
            draft.forEach((meal) => {
              if (!meal.mealTypeId) return;
              const record = {
                ...meal,
                dietTemplateId: dietId,
                dietTypeId:
                  Number(form.dietTypeId || saved.dietTypeId || 0) || null,
                foodItems: meal.foodItems.map((item) => item.foodId),
                quantities: Object.fromEntries(
                  meal.foodItems
                    .map((item) => [
                      item.foodId,
                      numericQuantity(item.quantity),
                    ])
                    .filter(([, value]) => value !== null),
                ),
                quantityTexts: Object.fromEntries(
                  meal.foodItems.map((item) => [
                    item.foodId,
                    String(item.quantity ?? ""),
                  ]),
                ),
                units: Object.fromEntries(
                  meal.foodItems.map((item) => [
                    item.foodId,
                    normalizeUnit(item.unit),
                  ]),
                ),
              };
              if (record.id) {
                updateRecord(KEYS.DIET_MAPPING, record.id, record);
              } else {
                addRecord(KEYS.DIET_MAPPING, {
                  ...record,
                  id: undefined,
                });
              }
            });

            setEditing(null);
            // Always refresh from the backend after create/update so the table
            // shows the database record rather than only the optimistic local row.
            await loadApi(1, 10, "");
          }}
        />
      )}

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={removeTemplate}
        title="Delete Diet Template"
        message={`Delete "${deleting?.name}" from the backend? This will also remove its local meal mappings.`}
      />
    </div>
  );
}

function TemplateRow({ diet, onEdit, onDelete }) {
  const mappings = getStore(KEYS.DIET_MAPPING) || [];
  const mealTypes = getStore(KEYS.MEAL_TYPES) || [];
  const foods = getStore(KEYS.FOOD_MASTER) || [];
  const patients = getStore(KEYS.PATIENTS) || [];
  const dietPlans = getStore("hd_diet_plans", []) || [];
  const assignedPatients = patients.filter(
    (p) => Number(p.dietTypeId) === Number(diet.id),
  );
  const patientsWithoutMealPlan = assignedPatients.filter(
    (p) =>
      !dietPlans.some(
        (plan) =>
          String(plan.patientId) === String(p.id) &&
          Number(plan.dietTypeId) === Number(diet.id) &&
          ["Active", "Approved", "Assigned"].includes(
            String(plan.status || "Active"),
          ),
      ),
  );

  const meals = mappings
    .filter(
      (m) =>
        Number(m.dietTemplateId) === Number(diet.id) ||
        (m.dietTemplateId == null &&
          diet.dietTypeId != null &&
          Number(m.dietTypeId) === Number(diet.dietTypeId)),
    )
    .map((m) => {
      const meal = mealTypes.find((x) => Number(x.id) === Number(m.mealTypeId));
      return {
        name: m.mealTypeName || meal?.name || "Meal",
        count: Array.isArray(m.foodItems) ? m.foodItems.length : 0,
      };
    })
    .filter((m) => m.count > 0);

  const nutrition = meals.reduce((total, meal) => total, {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });

  // Calculate from actual mapped quantities, not the diet target.
  mappings
    .filter(
      (m) =>
        Number(m.dietTemplateId) === Number(diet.id) ||
        (m.dietTemplateId == null &&
          diet.dietTypeId != null &&
          Number(m.dietTypeId) === Number(diet.dietTypeId)),
    )
    .forEach((mapping) => {
      (mapping.foodItems || []).forEach((foodId) => {
        const food = foods.find((f) => Number(f.id) === Number(foodId));
        const quantity = resolveQuantity(
          mapping.quantities?.[foodId],
          food?.standardQuantity,
        );
        const n = foodNutrition(food, quantity);
        nutrition.calories += n.calories;
        nutrition.protein += n.protein;
        nutrition.carbs += n.carbs;
        nutrition.fat += n.fat;
      });
    });

  return (
    <tr style={{ borderTop: "1px solid var(--border)" }}>
      <td className="px-3 py-2.5">
        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
          {diet.name}
        </div>
        <div
          style={{
            fontSize: "var(--font-label)",
            color: "var(--text-secondary)",
          }}
        >
          {diet.code}
        </div>
      </td>
      <td
        className="max-w-[360px] truncate px-3 py-2.5"
        style={{ color: "var(--text-secondary)" }}
        title={diet.description}
      >
        {diet.description || "—"}
      </td>
      <td className="px-3 py-2.5">
        {meals.length ? (
          <div className="flex flex-wrap gap-1">
            {meals.map((m) => (
              <span
                key={m.name}
                className="hospital-status hospital-status-info"
              >
                <UtensilsCrossed size={11} />
                {m.name} ({m.count})
              </span>
            ))}
          </div>
        ) : (
          <span
            style={{
              fontSize: "var(--font-caption)",
              color: "var(--text-secondary)",
            }}
          >
            No meals configured
          </span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="text-xs">
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {Math.round(nutrition.calories)} kcal
          </div>
          <div
            style={{
              fontSize: "var(--font-label)",
              color: "var(--text-secondary)",
            }}
          >
            P:{nutrition.protein.toFixed(1)}g · C:{nutrition.carbs.toFixed(1)}g
            · F:{nutrition.fat.toFixed(1)}g
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${patientsWithoutMealPlan.length ? "hospital-status hospital-status-pending" : "hospital-status hospital-status-active"}`}
        >
          <Users size={12} /> {patientsWithoutMealPlan.length}
        </span>
        {patientsWithoutMealPlan.length > 0 && (
          <div
            style={{
              marginTop: 2,
              fontSize: "var(--font-label)",
              color: "var(--text-secondary)",
            }}
          >
            {patientsWithoutMealPlan
              .slice(0, 2)
              .map((p) => p.name)
              .join(", ")}
            {patientsWithoutMealPlan.length > 2 ? "…" : ""}
          </div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <StatusBadge status={diet.status ? "Active" : "Inactive"} />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="icon-btn"
            style={{ minWidth: 32, minHeight: 32, color: "var(--color-info)" }}
          >
            <Edit size={15} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="icon-btn"
            style={{ minWidth: 32, minHeight: 32, color: "var(--color-error)" }}
          >
            <Trash2 size={15} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DietTemplateEditor({ diet, onClose, onSave }) {
  const foods = getStore(KEYS.FOOD_MASTER) || [];
  const mealTypes = getStore(KEYS.MEAL_TYPES) || [];
  const mappings = getStore(KEYS.DIET_MAPPING) || [];
  const patients = getStore(KEYS.PATIENTS) || [];
  const normalized = normalizeDietType(diet) || EMPTY;
  const assignedPatientCount = patients.filter(
    (p) => Number(p.dietTypeId) === Number(normalized?.id || diet?.id),
  ).length;

  const isNewTemplate = !diet?.id;

  const [form, setForm] = useState({
    ...EMPTY,
    ...normalized,
    dietTypeId: normalized.dietTypeId ?? normalized.dietTypeID ?? "",
    targetCalories: isNewTemplate
      ? 0
      : (normalized.targetCalories ?? normalized.calories ?? 0),
    proteinPercent: isNewTemplate
      ? 0
      : (normalized.proteinPercent ?? normalized.proteinPct ?? 0),
    carbsPercent: isNewTemplate
      ? 0
      : (normalized.carbsPercent ?? normalized.carbsPct ?? 0),
    fatPercent: isNewTemplate
      ? 0
      : (normalized.fatPercent ?? normalized.fatPct ?? 0),
  });
  const [draft, setDraft] = useState(() =>
    buildDraft(
      normalized.id,
      normalized.dietTypeId,
      mappings,
      mealTypes,
      foods,
    ),
  );
  const [selectedFood, setSelectedFood] = useState({});
  const [selectedMealType, setSelectedMealType] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingTemplateItems, setLoadingTemplateItems] =
    useState(!isNewTemplate);
  const [templateItemLoadError, setTemplateItemLoadError] = useState("");

  useEffect(() => {
    if (isNewTemplate) return undefined;
    let active = true;
    const templateId = normalized.templateId ?? normalized.id;
    loadTemplateMappings(templateId, normalized.dietTypeId)
      .then((templateRows) => {
        if (!active) return;
        const existingMappings = getStore(KEYS.DIET_MAPPING, []) || [];
        const otherMappings = existingMappings.filter(
          (mapping) => Number(mapping.dietTemplateId) !== Number(templateId),
        );
        setDraft(
          buildDraft(
            templateId,
            normalized.dietTypeId,
            [...otherMappings, ...templateRows],
            mealTypes,
            foods,
          ),
        );
        setTemplateItemLoadError("");
      })
      .catch((error) => {
        if (active) {
          setTemplateItemLoadError(
            error?.message || "Unable to load this template's existing items.",
          );
        }
      })
      .finally(() => {
        if (active) setLoadingTemplateItems(false);
      });

    return () => {
      active = false;
    };
  }, [
    isNewTemplate,
    normalized.templateId,
    normalized.id,
    normalized.dietTypeId,
  ]);

  const totals = useMemo(
    () =>
      draft.reduce(
        (total, meal) =>
          meal.foodItems.reduce((sum, item) => {
            const n = foodNutrition(
              foods.find((f) => Number(f.id) === Number(item.foodId)),
              item.quantity,
            );
            return {
              calories: sum.calories + n.calories,
              protein: sum.protein + n.protein,
              carbs: sum.carbs + n.carbs,
              fat: sum.fat + n.fat,
            };
          }, total),
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      ),
    [draft, foods],
  );

  const updateMeal = (mealName, patcher) =>
    setDraft((current) =>
      current.map((meal) =>
        meal.mealName === mealName ? patcher(meal) : meal,
      ),
    );

  const addMeal = () => {
    if (!selectedMealType) return;

    const meal = mealTypes.find(
      (item) => String(item.id) === String(selectedMealType),
    );
    if (!meal) return;

    setDraft((current) => {
      if (current.some((item) => Number(item.mealTypeId) === Number(meal.id))) {
        return current;
      }

      return [
        ...current,
        {
          id: null,
          dietTemplateId: normalized.id ?? null,
          dietTypeId: form.dietTypeId ? Number(form.dietTypeId) : null,
          mealTypeId: Number(meal.id),
          mealName: meal.name,
          foodItems: [],
          quantities: {},
          units: {},
          instructions: "",
          addOns: [],
        },
      ];
    });

    setSelectedMealType("");
  };

  const addFood = (mealName) => {
    const id = Number(selectedFood[mealName]);
    const food = foods.find((f) => Number(f.id) === id);
    if (!food) return;

    updateMeal(mealName, (meal) => {
      if (meal.foodItems.some((x) => Number(x.foodId) === id)) return meal;
      return {
        ...meal,
        foodItems: [
          ...meal.foodItems,
          {
            foodId: id,
            quantity: 1,
            unit: "piece",
          },
        ],
      };
    });
    setSelectedFood((x) => ({ ...x, [mealName]: "" }));
  };

  const removeFood = (mealName, foodId) =>
    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.filter(
        (item) => Number(item.foodId) !== Number(foodId),
      ),
    }));

  const changeQuantity = (mealName, foodId, value) => {
    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.map((item) =>
        Number(item.foodId) === Number(foodId)
          ? {
              ...item,
              quantity: value,
            }
          : item,
      ),
    }));
  };

  const changeUnit = (mealName, foodId, value) => {
    if (!STANDARD_UNITS.includes(value)) return;
    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.map((item) =>
        Number(item.foodId) === Number(foodId)
          ? {
              ...item,
              unit: value,
            }
          : item,
      ),
    }));
  };

  const submit = async () => {
    console.log("---", form);
    if (loadingTemplateItems || templateItemLoadError) return;

    /*     if (!form.name.trim() || !form.code.trim()) {
      alert("Diet Template Name and Code are required.");
      return;
    } */
    setSaving(true);
    try {
      await onSave(form, draft);
    } finally {
      setSaving(false);
    }
  };

  const nutritionTarget = {
    calories: Number(form.targetCalories || 0),
    protein:
      (Number(form.targetCalories || 0) * Number(form.proteinPercent || 0)) /
      400,
    carbs:
      (Number(form.targetCalories || 0) * Number(form.carbsPercent || 0)) / 400,
    fat:
      (Number(form.targetCalories || 0) * Number(form.fatPercent || 0)) / 900,
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={diet?.id ? "Edit Diet Template" : "Add Diet Template"}
      size="xl"
      footer={
        <div className="flex items-center justify-between">
          <div
            style={{
              fontSize: "var(--font-caption)",
              color: "var(--text-secondary)",
            }}
          >
            Target: {Math.round(form.targetCalories || 0)} kcal | Meals:{" "}
            {Math.round(totals.calories)} kcal | Remaining:{" "}
            {Math.max(
              0,
              Math.round((form.targetCalories || 0) - totals.calories),
            )}{" "}
            kcal
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="hospital-button hospital-button-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={
                saving || loadingTemplateItems || Boolean(templateItemLoadError)
              }
              className="hospital-button"
            >
              <Save size={15} />{" "}
              {saving
                ? "Saving..."
                : loadingTemplateItems
                  ? "Loading items..."
                  : "Save Template"}
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {templateItemLoadError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {templateItemLoadError}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-b pb-3 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label className="hospital-label">
              Diet Template
              <input
                type="text"
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Example: Renal Diet"
                className="hospital-input"
                style={{ marginTop: "var(--space-1)" }}
              />
            </label>
          </div>
          <div>
            <label
              className="hospital-label"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Code
            </label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              className="hospital-input"
            />
          </div>
          <div>
            <label
              className="hospital-label"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Target kcal
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={
                form.targetCalories === 0 || form.targetCalories === "0"
                  ? ""
                  : form.targetCalories
              }
              onChange={(e) => {
                const cleaned = e.target.value
                  .replace(/\D/g, "") // digits only (no minus, e, dot)
                  .replace(/^0+(?=\d)/, ""); // strip leading zeros: "05" -> "5"
                setForm({ ...form, targetCalories: cleaned });
              }}
              className="hospital-input"
            />
          </div>
          {/* <div>
            <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>
              Plan Name
            </label>
            <input
              value={form.planName || ""}
              onChange={(e) => setForm({ ...form, planName: e.target.value })}
              className="hospital-input"
              placeholder="e.g. Low Sodium Cardiac Plan"
            />
          </div>*/}
          <div>
            <label
              className="hospital-label"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Status
            </label>
            <select
              value={form.status ? "true" : "false"}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value === "true" })
              }
              className="hospital-select"
            >
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        <div>
          <label
            className="hospital-label"
            style={{ display: "block", marginBottom: "var(--space-1)" }}
          >
            Description
          </label>
          <textarea
            rows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className="hospital-textarea"
          />
        </div>

        {/* <div
          className="hospital-alert hospital-alert-info"
          style={{ marginBottom: 0, fontSize: "var(--font-caption)" }}
        >
          Target from diet plan: {Math.round(nutritionTarget.calories)} kcal · P{" "}
          {Math.round(nutritionTarget.protein)}g · C{" "}
          {Math.round(nutritionTarget.carbs)}g · F{" "}
          {Math.round(nutritionTarget.fat)}g
        </div> */}

        <div
          style={{
            borderRadius: "var(--radius)",
            border: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "var(--space-3)",
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <div
                className="text-xs font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Meal Template
              </div>
              <div
                style={{
                  fontSize: "var(--font-label)",
                  color: "var(--text-secondary)",
                }}
              >
                Add meal timing and choose food directly from Food Master.
              </div>
            </div>
            <div className="flex items-center gap-1">
              <select
                value={selectedMealType}
                onChange={(e) => setSelectedMealType(e.target.value)}
                className="hospital-select"
                style={{ width: 160 }}
              >
                <option value="">Select meal</option>
                {mealTypes
                  .filter(
                    (item) =>
                      !draft.some(
                        (meal) => Number(meal.mealTypeId) === Number(item.id),
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                onClick={addMeal}
                disabled={!selectedMealType}
                className="hospital-button hospital-button-secondary hospital-button-sm"
              >
                <Plus size={13} /> Add Meal
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {draft.map((meal) => (
            <MealEditor
              key={meal.mealName}
              meal={meal}
              foods={foods}
              selectedFood={selectedFood[meal.mealName] || ""}
              onSelect={(value) =>
                setSelectedFood((x) => ({ ...x, [meal.mealName]: value }))
              }
              onAdd={() => addFood(meal.mealName)}
              onRemove={(foodId) => removeFood(meal.mealName, foodId)}
              onQuantity={(foodId, value) =>
                changeQuantity(meal.mealName, foodId, value)
              }
              onUnit={(foodId, value) =>
                changeUnit(meal.mealName, foodId, value)
              }
              patientCount={assignedPatientCount}
            />
          ))}
          {!draft.length && (
            <div
              style={{
                borderRadius: "var(--radius-sm)",
                border: "1px dashed var(--border)",
                padding: "var(--space-3)",
                textAlign: "center",
                fontSize: "var(--font-label)",
                color: "var(--text-secondary)",
              }}
            >
              No meal selected. Choose a meal type above to add Breakfast,
              Lunch, Dinner, etc.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MealEditor({
  meal,
  foods,
  selectedFood,
  onSelect,
  onAdd,
  onRemove,
  onQuantity,
  onUnit,
  patientCount = 0,
}) {
  const mealNutrition = meal.foodItems.reduce(
    (sum, item) => {
      const n = foodNutrition(
        foods.find((f) => Number(f.id) === Number(item.foodId)),
        item.quantity,
        item.unit,
      );
      return {
        calories: sum.calories + n.calories,
        protein: sum.protein + n.protein,
        carbs: sum.carbs + n.carbs,
        fat: sum.fat + n.fat,
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return (
    <section
      style={{
        borderBottom: "1px solid var(--border)",
        paddingBottom: "var(--space-2)",
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <div
            style={{
              fontSize: "var(--font-body)",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {meal.mealName}
          </div>
          <div
            style={{
              fontSize: "var(--font-label)",
              color: "var(--text-secondary)",
            }}
          >
            {Math.round(mealNutrition.calories)} kcal · P{" "}
            {mealNutrition.protein.toFixed(1)}g · C{" "}
            {mealNutrition.carbs.toFixed(1)}g · F {mealNutrition.fat.toFixed(1)}
            g
          </div>
        </div>
        <div className="flex items-center gap-1">
          <select
            value={selectedFood}
            onChange={(e) => onSelect(e.target.value)}
            className="hospital-select"
            style={{ width: 176 }}
          >
            <option value="">Food Master...</option>
            {foods.map((food) => (
              <option key={food.id} value={food.id}>
                {food.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onAdd}
            disabled={!selectedFood}
            className="hospital-button hospital-button-secondary hospital-button-sm"
          >
            <Plus size={13} /> Add
          </button>
        </div>
      </div>

      <div className="mt-1 space-y-1">
        {meal.foodItems.length ? (
          meal.foodItems.map((item) => {
            const food = foods.find(
              (f) => Number(f.id) === Number(item.foodId),
            );
            if (!food) return null;
            return (
              <div
                key={item.foodId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border)",
                  background: "var(--surface)",
                  padding: "var(--space-2) var(--space-3)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div
                    className="truncate"
                    style={{
                      fontWeight: 600,
                      fontSize: "var(--font-body)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {food.name}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-label)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {food.category} · {food.calories} kcal · P {food.protein}g ·
                    C {food.carbs}g · F {food.fat}g
                  </div>
                  <div
                    style={{
                      fontSize: "var(--font-label)",
                      color: "var(--hospital-primary)",
                    }}
                  >
                    Quantity for {patientCount || 0} patient
                    {patientCount === 1 ? "" : "s"}:{" "}
                    {numericQuantity(item.quantity) !== null
                      ? `${(numericQuantity(item.quantity) * Math.max(patientCount, 1)).toFixed(2)} ${item.unit}`
                      : `${item.quantity || "—"} ${item.unit}`}
                  </div>
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={item.quantity}
                  onChange={(e) => onQuantity(item.foodId, e.target.value)}
                  className="hospital-input"
                  style={{ width: 80, minHeight: "unset", padding: "3px 6px" }}
                />
                <select
                  value={normalizeMealFoodUnit(item.unit)}
                  onChange={(e) => onUnit(item.foodId, e.target.value)}
                  className="hospital-select"
                  style={{ width: 80, minHeight: "unset", padding: "3px 6px" }}
                  aria-label={`Unit for ${food.name}`}
                >
                  {STANDARD_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRemove(item.foodId)}
                  className="icon-btn"
                  style={{
                    minWidth: 28,
                    minHeight: 28,
                    color: "var(--color-error)",
                  }}
                  title="Remove food"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })
        ) : (
          <div
            style={{
              fontSize: "var(--font-label)",
              color: "var(--text-secondary)",
              padding: "var(--space-1) 0",
            }}
          >
            No food items configured.
          </div>
        )}
      </div>
    </section>
  );
}
