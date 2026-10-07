import patientService from "../services/patientService.js";
import dietTypeService from "../services/dietTypeService.js";
import dietTemplateService from "../services/dietTemplateService.js";
import mealTypeService from "../services/mealTypeService.js";
import foodService from "../services/foodService.js";
import templateItemService from "../services/templateItemService.js";
import { getApiCacheGeneration } from "../services/apiClient.js";
import { normalizePatientApiRow } from "../services/patientAdapter.js";
import { normalizeDietType } from "./dietTypeAdapter.js";
import { getStore, KEYS, normalizeUnit, setStore } from "./storage.js";

const LIST_PAGE = {
  currentPage: 1,
  pageSize: 100,
  dataSorting: {
    byColumn: { field: "name", title: "Name", sortable: true },
    sortingOrder: "ASC",
  },
};
const TEMPLATE_ITEM_CACHE_MS = 10000;
const templateItemReadCache = new Map();
const MASTER_DATA_CACHE_MS = 30000;
let masterDataCache = null;
let pendingMasterData = null;

export function extractRows(response, predicate = () => true) {
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
        (row) =>
          row &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          predicate(row),
      );
      if (rows.length) candidates.push(rows);
      value.forEach((row) => visit(row, depth + 1));
      return;
    }
    Object.values(value).forEach((child) => visit(child, depth + 1));
  };
  visit(response);
  return candidates.sort((a, b) => b.length - a.length)[0] || [];
}

function assertOk(response, label) {
  if (
    !response ||
    response.error ||
    response.statusCode >= 400 ||
    response.status >= 400
  ) {
    throw new Error(
      response?.message ||
        response?.error?.message ||
        `Unable to load ${label} from the server.`,
    );
  }
  return response;
}

const isActiveFlag = (value) =>
  value === true || value === 1 || String(value).toLowerCase() === "active";

const isTemplateRow = (row) => {
  if (
    row.foodId != null ||
    row.food_id != null ||
    row.mealTypeId != null ||
    row.meal_type_id != null
  )
    return false;
  const name = row.name ?? row.dietName ?? row.templateName;
  const code = row.code ?? row.dietCode ?? row.templateCode;
  const id = row.id ?? row.templateId ?? row.dietTemplateId ?? row.dietTemplateID;
  return String(name ?? "").trim() !== "" && String(code ?? "").trim() !== "" && id != null;
};

const inlineItems = (template) =>
  template.items ||
  template.dietTemplateItems ||
  template.templateItems ||
  template.dietTemplateItemList ||
  [];

const isItemRow = (row) =>
  (row.foodId ?? row.food_id) != null &&
  (row.mealTypeId ?? row.meal_type_id) != null;

function readTemplateItems(templateId) {
  const key = String(templateId);
  const cached = templateItemReadCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = templateItemService
    .getItemsByTemplateId(templateId)
    .then((response) => {
      assertOk(response, `items for diet template ${templateId}`);
      return { rows: extractRows(response, isItemRow), error: null };
    })
    .catch((error) => ({ rows: [], error }));
  templateItemReadCache.set(key, {
    expiresAt: Date.now() + TEMPLATE_ITEM_CACHE_MS,
    promise,
  });
  return promise;
}

function mapTemplateItems(template, rows) {
  const byMeal = new Map();
  rows.forEach((row) => {
    const mealTypeId = Number(row.mealTypeId ?? row.meal_type_id);
    const foodId = Number(row.foodId ?? row.food_id);
    if (!Number.isFinite(mealTypeId) || !Number.isFinite(foodId)) return;
    const mapping = byMeal.get(mealTypeId) || {
      dietTemplateId: Number(template.templateId),
      dietTypeId: Number(template.dietTypeId) || null,
      mealTypeId,
      foodItems: [],
      quantities: {},
      quantityTexts: {},
      units: {},
      status: true,
    };
    if (!mapping.foodItems.includes(foodId)) mapping.foodItems.push(foodId);
    const quantity = row.amount ?? row.quantity;
    if (quantity != null && quantity !== "") {
      const numericQuantity = Number(quantity);
      if (Number.isFinite(numericQuantity)) {
        mapping.quantities[foodId] = numericQuantity;
      }
      mapping.quantityTexts[foodId] = String(quantity);
    }
    const unit = normalizeUnit(row.unit);
    if (unit) mapping.units[foodId] = unit;
    byMeal.set(mealTypeId, mapping);
  });
  return [...byMeal.values()];
}

function loadMappings(templates) {
  const mappings = [];
  const mappingWarnings = [];

  for (const template of templates) {
    const embedded = inlineItems(template);
    if (Array.isArray(embedded) && embedded.length) {
      mappings.push(...mapTemplateItems(
        template,
        embedded.filter((row) => row && isItemRow(row)),
      ));
    }
  }

  return { mappings, mappingWarnings };
}

export async function loadTemplateMappings(templateId, dietTypeId = null) {
  if (templateId == null || templateId === "") return [];
  const storedTemplate = (getStore(KEYS.DIET_TEMPLATES, []) || []).find(
    (item) => String(item.templateId ?? item.id) === String(templateId),
  );
  const template = {
    templateId,
    dietTypeId: dietTypeId ?? storedTemplate?.dietTypeId,
  };
  const embedded = inlineItems(storedTemplate || {});
  if (Array.isArray(embedded) && embedded.length) {
    const mappings = mapTemplateItems(
      template,
      embedded.filter((row) => row && isItemRow(row)),
    );
    mergeTemplateMappings(templateId, mappings);
    return mappings;
  }

  const result = await readTemplateItems(templateId);
  if (result.error) {
    console.error(
      `Could not load meal items for diet template ${templateId}.`,
      result.error,
    );
    throw result.error;
  }
  const mappings = mapTemplateItems(template, result.rows);
  mergeTemplateMappings(templateId, mappings);
  return mappings;
}

function mergeTemplateMappings(templateId, mappings) {
  const existing = getStore(KEYS.DIET_MAPPING, []) || [];
  const remaining = existing.filter(
    (mapping) => String(mapping.dietTemplateId) !== String(templateId),
  );
  const mergedMappings = [...remaining, ...mappings];
  setStore(KEYS.DIET_MAPPING, mergedMappings);
  if (masterDataCache) {
    masterDataCache.data = {
      ...masterDataCache.data,
      mappings: mergedMappings,
    };
  }
}

async function loadMasterDataFromApi() {
  const [patientResponse, typeResponse, templateResponse, mealResponse, foodResponse] =
    await Promise.all([
      patientService.getAllPatients({
        patientCode: "",
        name: "",
        ward: "",
        status: true,
        paginationInfo: { currentPage: 0, pageSize: 100 },
      }),
      dietTypeService.getAllTypes({
        paginationInfo: {
          pageSize: 100,
          currentPage: 1,
          dataSorting: {
            sortingOrder: null,
            byColumn: { label: "", field: "" },
          },
        },
        name: "",
      }),
      dietTemplateService.getAllTemplates({
        code: "",
        name: "",
        dietTypeId: null,
        status: null,
        paginationInfo: LIST_PAGE,
      }),
      mealTypeService.getAllMealTypes({
        code: "",
        name: "",
        status: null,
        paginationInfo: LIST_PAGE,
      }),
      foodService.getAllFood({
        code: "",
        name: "",
        category: "",
        status: null,
        paginationInfo: LIST_PAGE,
      }),
    ]);

  assertOk(patientResponse, "patients");
  assertOk(typeResponse, "diet types");
  assertOk(templateResponse, "diet templates");
  assertOk(mealResponse, "meal types");
  assertOk(foodResponse, "foods");

  const patients = extractRows(
    patientResponse,
    (row) => (row.id ?? row.patientId) != null,
  )
    .map(normalizePatientApiRow)
    .filter((patient) => patient.id != null);

  const dietTypes = extractRows(
    typeResponse,
    (row) =>
      (row.id ?? row.dietTypeId ?? row.dietId) != null &&
      (row.name ?? row.dietName ?? row.dietTypeName) &&
      row.foodId == null &&
      row.mealTypeId == null,
  )
    .map((item, index) => normalizeDietType(item, index))
    .filter(Boolean);

  const dietTemplates = extractRows(templateResponse, isTemplateRow).map(
    (item, index) => {
      const templateId =
        item.id ??
        item.templateId ??
        item.dietTemplateId ??
        item.dietTemplateID;
      return {
        ...normalizeDietType({ ...item, id: templateId }, index),
        templateId,
        hasBackendTemplateId: true,
      };
    },
  );

  const mealTypes = extractRows(
    mealResponse,
    (row) => (row.id ?? row.mealTypeId ?? row.meal_type_id) != null,
  ).map((item) => ({
    ...item,
    id: item.id ?? item.mealTypeId ?? item.meal_type_id,
    backendMealTypeId: item.id ?? item.mealTypeId ?? item.meal_type_id,
    name: item.name ?? "",
    time: item.time ?? item.scheduledTime ?? item.scheduled_time ?? "08:00",
    status: isActiveFlag(item.status) ? "Active" : "Inactive",
  }));

  const cachedFoods = getStore(KEYS.FOOD_MASTER, []) || [];
  const foods = extractRows(
    foodResponse,
    (row) => (row.id ?? row.foodId ?? row.food_id) != null,
  ).map((item) => {
    const id = item.id ?? item.foodId ?? item.food_id;
    const cached = cachedFoods.find(
      (food) =>
        food.backendFoodId != null &&
        Number(food.backendFoodId) === Number(id),
    );
    return {
      ...(cached
        ? {
            standardQuantity: cached.standardQuantity,
            calories: cached.calories,
            protein: cached.protein,
            carbs: cached.carbs,
            fat: cached.fat,
            fiber: cached.fiber,
          }
        : {}),
      ...item,
      id,
      backendFoodId: id,
      name: item.name ?? "",
      unit: normalizeUnit(item.unit) || item.unit || "",
      status: isActiveFlag(item.status) ? "Active" : "Inactive",
    };
  });

  const { mappings, mappingWarnings } = await loadMappings(dietTemplates);
  return {
    patients,
    dietTypes,
    dietTemplates,
    mealTypes,
    foods,
    mappings,
    mappingWarnings,
  };
}

export function loadMasterData() {
  const generation = getApiCacheGeneration();
  if (
    masterDataCache &&
    masterDataCache.generation === generation &&
    masterDataCache.expiresAt > Date.now()
  ) {
    return Promise.resolve(masterDataCache.data);
  }
  if (pendingMasterData?.generation === generation) {
    return pendingMasterData.promise;
  }

  const promise = loadMasterDataFromApi()
    .then((data) => {
      if (getApiCacheGeneration() === generation) {
        masterDataCache = {
          data,
          generation,
          expiresAt: Date.now() + MASTER_DATA_CACHE_MS,
        };
      }
      return data;
    })
    .finally(() => {
      if (pendingMasterData?.promise === promise) {
        pendingMasterData = null;
      }
    });
  pendingMasterData = { generation, promise };
  return promise;
}
