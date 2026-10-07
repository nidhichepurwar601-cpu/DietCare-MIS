import React, { useState, useEffect } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import DietPlans from "../DietPlans/index.jsx";
import DietManagerReference from "./DietManagerReference.jsx";
import ClinicalAlerts from "../ClinicalAlerts/index.jsx";
import {
  getCurrentRole,
  hasPermission,
  PERMISSIONS,
} from "../../lib/permissions.js";
import DataTable from "../../components/common/DataTable.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Modal from "../../components/common/Modal.jsx";
import MealPlanModal from "../../components/common/MealPlanModal";
import HospitalPage from "../../components/common/HospitalPage.jsx";
import {
  getStore,
  setStore,
  addRecord,
  updateRecord,
  deleteRecord,
  KEYS,
  normalizeUnit,
  positiveQuantity,
  resolveQuantity,
  appendHistoryEvent,
} from "../../lib/storage.js";
import {
  normalizeDietType,
  isActiveDietType,
} from "../../lib/dietTypeAdapter.js";
import patientService from "../../services/patientService.js";
import {
  extractPatientRows,
  normalizePatientApiRow,
  toPatientApiPayload,
} from "../../services/patientAdapter.js";
import {
  Users,
  Info,
  Edit,
  Trash2,
  RefreshCw,
  Sunrise,
  Coffee,
  Soup,
  Moon,
  BedDouble,
  CheckCircle2,
  Clock,
  ClipboardList,
  History,
  Stethoscope,
  AlertTriangle,
  Activity,
  Baby,
  FileText,
} from "lucide-react";

/* ── Local constants ───────────────────────────────────────────── */
const WARDS = [
  "Cardiology",
  "Nephrology",
  "General Medicine",
  "Orthopedics",
  "ICU",
  "Oncology",
  "Pediatrics",
];

const ALLERGENS = ["None", "Nuts", "Dairy", "Gluten", "Seafood", "Eggs", "Soy"];

// API-ready allocation display: Doctor/Dietitian assignment is read-only here.
// The patient API can later populate allocatedByName / allocatedBy without changing this UI.
const getAllocatedClinician = (patient) =>
  patient?.allocatedByName ||
  patient?.allocatedBy?.name ||
  patient?.assignedByName ||
  patient?.assignedBy?.name ||
  patient?.dietitian ||
  patient?.doctor ||
  patient?.consultantName ||
  "Not allocated";

const EMPTY_FORM = {
  name: "",
  age: "",
  gender: "Male",
  admissionDate: new Date().toISOString().slice(0, 10),
  ward: WARDS[0],
  bedNo: "",
  primaryDiagnosis: "",
  dietTypeId: "",
  dietStartDate: "",
  reviewDate: "",
  fluid: "",
  sodium: "",
  dietitian: "",
  consultantName: "",
  consultantSpecialty: "",
  consultantContact: "",
  specialInstructions: "",
  intestinalDetails: "",
  isPregnant: false,
  prescriptionDietTypeId: "",
  prescriptionInstructions: "",
  prescriptionDate: "",
  allergens: ["None"],
  status: "Active",
  id: null,
};

const parseDateValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getReviewStatus = (patient) => {
  const reviewDate = parseDateValue(patient.reviewDate);
  const reviewedAt = parseDateValue(patient.reviewedAt);

  if (!reviewDate) {
    return reviewedAt ? "Reviewed" : "Not Scheduled";
  }

  if (reviewedAt && reviewedAt >= reviewDate) return "Reviewed";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  reviewDate.setHours(0, 0, 0, 0);

  const daysDiff = Math.round((reviewDate - today) / (1000 * 60 * 60 * 24));

  if (daysDiff < 0) return "Overdue";
  if (daysDiff === 0) return "Due Today";
  if (daysDiff <= 7) return "Due Soon";
  return "Scheduled";
};

const getReviewBadgeClass = (status) => {
  switch (status) {
    case "Overdue":
      return "bg-red-100 text-red-800";
    case "Due Today":
      return "bg-orange-100 text-orange-800";
    case "Due Soon":
      return "bg-yellow-100 text-yellow-800";
    case "Scheduled":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
};

const allergyKeywords = {
  Nuts: [
    "nut",
    "nuts",
    "almond",
    "peanut",
    "cashew",
    "pistachio",
    "walnut",
    "hazelnut",
  ],

  Dairy: [
    "milk",
    "cheese",
    "curd",
    "dairy",
    "paneer",
    "butter",
    "ghee",
    "cream",
    "yogurt",
    "yoghurt",
  ],

  Gluten: ["wheat", "roti", "chapati", "bread", "maida", "pasta", "gluten"],

  Seafood: ["fish", "seafood", "prawn", "shrimp", "crab", "lobster"],

  Eggs: ["egg", "eggs"],

  Soy: ["soy", "soya", "tofu"],
};

function foodAllergens(food, allergens) {
  if (!food || !allergens?.length || allergens.includes("None")) {
    return [];
  }

  const source = [
    food.name,
    food.category,
    food.ingredients,
    food.description,
    food.remarks,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return allergens.filter((allergen) =>
    (allergyKeywords[allergen] || []).some((keyword) =>
      source.includes(keyword),
    ),
  );
}

function nutritionBase(food) {
  return (
    positiveQuantity(food?.standardQuantity) ||
    (["piece", "slice", "cup", "bowl"].includes(normalizeUnit(food?.unit))
      ? 1
      : 100)
  );
}

function DietTemplateModal({
  diet,
  mappings,
  mealTypes,
  foods,
  allergens,
  onClose,
  onSave,
  zIndex,
  patientId = null,
  readOnly = false,
}) {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  const meals = [
    "Breakfast",
    "Mid-Morning",
    "Lunch",
    "Evening Snack",
    "Dinner",
    "Bedtime",
  ];
  const [draft, setDraft] = useState(() => {
    const existing = mappings.filter(
      (mapping) => Number(mapping.dietTypeId) === Number(diet.id),
    );

    return meals.map((mealName, index) => {
      const meal =
        mealTypes.find(
          (item) => item.name.toLowerCase() === mealName.toLowerCase(),
        ) || mealTypes[index + 1];

      const mapping = existing.find((item) => item.mealTypeId === meal?.id) || {
        id: `draft-${diet.id}-${index}`,
        dietTypeId: diet.id,
        mealTypeId: meal?.id,
        foodItems: [],
        quantities: {},
        addOns: "",
        instructions: "",
      };

      const normalizedFoodItems = (mapping.foodItems || []).map((foodId) => {
        const numericFoodId = Number(foodId);
        const food = foods.find((item) => item.id === numericFoodId);
        const quantity = resolveQuantity(
          mapping.quantities?.[foodId],
          food?.standardQuantity,
        );

        return {
          foodId: numericFoodId,
          quantity,
          unit: normalizeUnit(mapping.units?.[foodId] || food?.unit),
        };
      });

      return {
        ...mapping,
        mealName,

        // Keep all original foods
        foodItems: normalizedFoodItems,
      };
    });
  });
  const [selectedAllergies, setSelectedAllergies] = useState(allergens || []);

  // Keep the allergy selector synchronized with the patient record when the
  // template modal is opened for a different patient.
  useEffect(() => {
    setSelectedAllergies(
      Array.isArray(allergens) && allergens.length ? allergens : ["None"],
    );
  }, [allergens]);
  /*  useEffect(() => {
    if (readOnly) return;

    setDraft((current) =>
      current.map((meal) => ({
        ...meal,
        foodItems: meal.foodItems.filter((item) => {
          const food = foods.find((f) => f.id === item.foodId);

          return food && foodAllergens(food, selectedAllergies).length === 0;
        }),
      })),
    );
  }, [selectedAllergies, foods, readOnly]); */
  const [foodPicker, setFoodPicker] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [kitchenNotes, setKitchenNotes] = useState("");
  const [dietitianNotes, setDietitianNotes] = useState("");
  const [addOnSearch, setAddOnSearch] = useState("");
  const [selectedAddOns, setSelectedAddOns] = useState([]);

  const getFood = (foodId) => foods.find((food) => food.id === foodId);
  const updateMeal = (mealName, updater) =>
    setDraft((current) =>
      current.map((meal) =>
        meal.mealName === mealName ? updater(meal) : meal,
      ),
    );
  const updateQuantity = (mealName, foodId, change) =>
    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.map((item) =>
        item.foodId === foodId
          ? {
              ...item,
              quantity: positiveQuantity(
                (positiveQuantity(item.quantity) || 0) + change,
              ),
            }
          : item,
      ),
    }));

  const setQuantity = (mealName, foodId, value) => {
    const quantity = value === "" ? "" : positiveQuantity(value) || "";

    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.map((item) =>
        item.foodId === foodId ? { ...item, quantity } : item,
      ),
    }));
  };

  const addFood = (food) => {
    if (!foodPicker) return;
    updateMeal(foodPicker, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.some((item) => item.foodId === food.id)
        ? meal.foodItems
        : [
            ...meal.foodItems,
            {
              foodId: food.id,
              quantity: positiveQuantity(food.standardQuantity),
              unit: normalizeUnit(food.unit),
            },
          ],
    }));
    setFoodPicker(null);
  };
  const safeFoods = foods.filter(
    (food) => foodAllergens(food, selectedAllergies).length === 0,
  );
  const replaceFood = (food) => {
    if (!replaceTarget) return;
    updateMeal(replaceTarget.mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.map((item) =>
        item.foodId === replaceTarget.foodId
          ? {
              ...item,
              foodId: food.id,
              quantity: positiveQuantity(food.standardQuantity),
              unit: normalizeUnit(food.unit),
            }
          : item,
      ),
    }));
    setReplaceTarget(null);
  };
  const removeFood = (mealName, foodId) =>
    updateMeal(mealName, (meal) => ({
      ...meal,
      foodItems: meal.foodItems.filter((item) => item.foodId !== foodId),
    }));
  const getNutrition = (food, quantity) => {
    if (!food || !positiveQuantity(quantity)) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    }
    const factor = quantity / nutritionBase(food);
    return {
      calories: food.calories * factor,
      protein: food.protein * factor,
      carbs: food.carbs * factor,
      fat: food.fat * factor,
    };
  };
  const totals = draft.reduce(
    (total, meal) =>
      meal.foodItems.reduce((sum, item) => {
        const nutrition = getNutrition(getFood(item.foodId), item.quantity);
        return {
          calories: sum.calories + nutrition.calories,
          protein: sum.protein + nutrition.protein,
          carbs: sum.carbs + nutrition.carbs,
          fat: sum.fat + nutrition.fat,
        };
      }, total),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const targets = {
    calories: diet.calories,
    protein: (diet.calories * diet.proteinPct) / 100 / 4,
    carbs: (diet.calories * diet.carbsPct) / 100 / 4,
    fat: (diet.calories * diet.fatPct) / 100 / 9,
  };
  const statusFor = (value, target) =>
    value > target * 1.05
      ? "Exceeding"
      : value >= target * 0.95
        ? "Meeting"
        : "Below";
  const save = () =>
    onSave(
      draft
        .filter((meal) => meal.mealTypeId)
        .map((meal) => ({
          ...meal,
          foodItems: meal.foodItems.map((item) => item.foodId),

          quantities: Object.fromEntries(
            meal.foodItems.map((item) => [
              item.foodId,
              positiveQuantity(item.quantity),
            ]),
          ),
          units: Object.fromEntries(
            meal.foodItems.map((item) => [
              item.foodId,
              normalizeUnit(item.unit),
            ]),
          ),

          addOns: selectedAddOns.map((food) => food.id),

          instructions: `${meal.instructions || ""}${
            kitchenNotes ? ` ${kitchenNotes}` : ""
          }`,

          allergies: selectedAllergies,
        })),
      selectedAllergies,
      patientId,
    );
  const reset = () =>
    setDraft((current) =>
      current.map((meal) => ({ ...meal, foodItems: [], addOns: "" })),
    );
  const printChart = () => window.print();
  const nutritionRows = [
    { label: "Calories", key: "calories", unit: "kcal", color: "bg-blue-600" },
    { label: "Protein", key: "protein", unit: "g", color: "bg-green-600" },
    { label: "Carbs", key: "carbs", unit: "g", color: "bg-amber-500" },
    { label: "Fat", key: "fat", unit: "g", color: "bg-red-500" },
  ];

  const getCurrentMeal = () => {
    const hour = currentTime.getHours();

    if (hour >= 5 && hour < 11) {
      return "Breakfast";
    }

    if (hour >= 11 && hour < 15) {
      return "Lunch";
    }

    if (hour >= 15 && hour < 17) {
      return "Evening Snack";
    }

    if (hour >= 17 && hour < 21) {
      return "Dinner";
    }

    return "Bedtime";
  };

  const currentMeal = getCurrentMeal();

  const allocatedFoods = draft
    .filter((meal) => meal.mealName === currentMeal)
    .flatMap((meal) =>
      meal.foodItems
        .map((item) => ({
          mealName: meal.mealName,
          food: getFood(item.foodId),
          quantity: item.quantity,
        }))
        .filter(
          (item) =>
            item.food &&
            foodAllergens(item.food, selectedAllergies).length === 0,
        ),
    );

  const foodPickerOverlay = foodPicker && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Add Food to {foodPicker}</h3>

          <button
            onClick={() => setFoodPicker(null)}
            className="text-gray-500 hover:text-red-600"
          >
            ✕
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto space-y-2">
          {safeFoods.map((food) => (
            <button
              key={food.id}
              onClick={() => addFood(food)}
              className="w-full rounded border p-3 text-left hover:bg-blue-50"
            >
              <div className="font-semibold">{food.name}</div>

              <div className="text-xs text-gray-500">
                {food.calories} kcal • {food.protein} g Protein
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {foodPickerOverlay}
      <Modal
        isOpen
        onClose={onClose}
        zIndex={zIndex}
        title={`Diet Template · ${diet?.name || "Diet"}`}
        size="xl"
        footer={
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                save();
                onClose();
              }}
              className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Save Changes
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border bg-gray-50 p-4 sm:grid-cols-4">
            <div>
              <p className="text-xs text-gray-500">Code</p>
              <p className="font-semibold">{diet?.code || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Diet Name</p>
              <p className="font-semibold">{diet?.name || "—"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Calories</p>
              <p className="font-semibold">{diet?.calories || 0} kcal</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Status</p>
              <p className="font-semibold text-green-600">Active</p>
            </div>
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
              Allergy Filter
            </p>
            <p className="mt-1 text-sm text-red-700">
              {selectedAllergies.includes("None")
                ? "No allergy restrictions selected."
                : `Filtered to avoid: ${selectedAllergies.join(", ")}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Calories", `${Math.round(totals.calories)} kcal`],
              ["Protein", `${totals.protein.toFixed(1)} g`],
              ["Carbs", `${totals.carbs.toFixed(1)} g`],
              ["Fat", `${totals.fat.toFixed(1)} g`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-3 text-center">
                <p className="text-xs text-gray-500">{label}</p>
                <p className="mt-1 font-semibold text-gray-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="mb-3 font-semibold text-red-700">
              Patient Allergies
            </h3>

            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((allergy) => (
                <button
                  key={allergy}
                  type="button"
                  disabled={readOnly}
                  onClick={() => {
                    if (readOnly) return;

                    setSelectedAllergies((prev) => {
                      if (allergy === "None") {
                        return ["None"];
                      }

                      const withoutNone = prev.filter((a) => a !== "None");

                      return withoutNone.includes(allergy)
                        ? withoutNone.filter((a) => a !== allergy)
                        : [...withoutNone, allergy];
                    });
                  }}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    selectedAllergies.includes(allergy)
                      ? "bg-red-600 text-white"
                      : "bg-white"
                  }`}
                >
                  {allergy}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm font-semibold text-blue-800">
              Allocated Food Items · {currentMeal}
            </p>

            {allocatedFoods.length > 0 ? (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {allocatedFoods.map((item, index) => (
                  <div
                    key={`${item.mealName}-${item.food.id}-${index}`}
                    className="rounded-md border border-blue-100 bg-white px-3 py-2"
                  >
                    <p className="mb-2 text-sm font-semibold text-gray-800">
                      {item.food.name}
                    </p>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={item.quantity}
                        disabled={readOnly}
                        onChange={(event) =>
                          !readOnly &&
                          setQuantity(
                            item.mealName,
                            item.food.id,
                            event.target.value,
                          )
                        }
                        className="w-20 rounded border px-2 py-1 text-right text-xs font-medium disabled:bg-gray-100 disabled:text-gray-500"
                      />
                      <span className="text-xs text-gray-500">
                        {normalizeUnit(item.food.unit) || "Not Configured"}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-gray-500">
                      {item.mealName} · {item.food.calories} kcal
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">
                No food items have been allocated to this diet yet.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-green-100 bg-green-50 p-4">
            <p className="text-sm font-semibold text-green-700">Meal Add-ons</p>

            {/* Search Add-on Food */}
            <input
              type="search"
              disabled={readOnly}
              value={addOnSearch}
              onChange={(e) => setAddOnSearch(e.target.value)}
              placeholder="Example: Fruit Bowl, Juice, Salad, Curd..."
              className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />

            {/* Search Results */}
            {addOnSearch.trim() && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border bg-white">
                {foods
                  .filter(
                    (food) =>
                      foodAllergens(food, selectedAllergies).length === 0 &&
                      food.name
                        .toLowerCase()
                        .includes(addOnSearch.toLowerCase()),
                  )
                  .map((food) => (
                    <button
                      key={food.id}
                      type="button"
                      disabled={readOnly}
                      onClick={() => {
                        if (
                          !selectedAddOns.some((item) => item.id === food.id)
                        ) {
                          setSelectedAddOns((prev) => [...prev, food]);
                        }

                        setAddOnSearch("");
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-green-100"
                    >
                      <span className="font-medium">{food.name}</span>

                      <span className="ml-2 text-xs text-gray-500">
                        {food.calories} kcal · {food.unit}
                      </span>
                    </button>
                  ))}

                {foods.filter(
                  (food) =>
                    foodAllergens(food, selectedAllergies).length === 0 &&
                    food.name.toLowerCase().includes(addOnSearch.toLowerCase()),
                ).length === 0 && (
                  <p className="px-3 py-2 text-sm text-gray-400">
                    No matching food found.
                  </p>
                )}
              </div>
            )}

            {/* Selected Add-ons */}
            {selectedAddOns.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAddOns.map((food) => (
                  <div
                    key={food.id}
                    className="flex items-center gap-2 rounded-full border border-green-200 bg-white px-3 py-1 text-xs"
                  >
                    <span>{food.name}</span>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedAddOns((prev) =>
                            prev.filter((item) => item.id !== food.id),
                          )
                        }
                        className="font-bold text-red-500 hover:text-red-700"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-semibold text-red-700">
              Restricted Foods
            </p>
            <p className="mt-1 text-sm text-gray-700">
              Excess sugar, fried foods, soft drinks, processed foods, and foods
              not suitable for this diet.
            </p>
          </div>

          <div className="rounded-lg border p-4">
            <p className="text-xs font-semibold text-gray-600">
              Description / Notes
            </p>
            <p className="mt-1 text-sm text-gray-700">
              {diet?.description || "No diet description available."}
            </p>
          </div>
        </div>
      </Modal>
    </>
  );
}
/* ── DietForm (shared by Create & Edit modals) ──────────────────── */
function DietForm({
  formData,
  onChange,
  dietTypes,
  onDietSelect,
  onAllergenToggle,
  readOnlyPatient = false,
  patientHistory,
  onHistoryReadMore,
}) {
  const fieldClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm";
  const [dietSearch, setDietSearch] = useState("");
  // Pregnancy UI is only relevant for female patients; keep this rule centralized for the patient form.
  const normalizedGender = String(formData.gender || "")
    .trim()
    .toLowerCase();
  const isFemalePatient =
    normalizedGender === "female" || normalizedGender === "f";

  const savedValue = (label, name, extraClass = "") => (
    <div className={extraClass}>
      <div className="mb-1 text-xs font-medium text-gray-500">{label}</div>
      <div className="px-1 py-0.5 text-sm text-gray-800">
        {formData[name] || "Not recorded"}
      </div>
    </div>
  );
  const patientDetails = readOnlyPatient ? (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
      {savedValue("Patient Name", "name")}
      {savedValue("Age", "age")}
      {savedValue("Gender", "gender")}
      {savedValue("Admission Date", "admissionDate")}
      {savedValue("Ward", "ward")}
      {savedValue("Bed No", "bedNo")}
      {savedValue("Primary Diagnosis", "primaryDiagnosis")}
      {savedValue("Past Diet", "pastDiet")}
      <div>
        <div className="mb-1 text-xs font-medium text-gray-500">
          Allocated Doctor / Dietitian
        </div>
        <div className="px-1 py-0.5 text-sm font-semibold text-slate-800">
          {getAllocatedClinician(formData)}
        </div>
        <div className="text-[10px] text-slate-400">
          Assigned by clinical workflow / API
        </div>
      </div>
      {savedValue("Consultant", "consultantName")}
      {savedValue("Consultant Specialty", "consultantSpecialty")}
      {savedValue("Consultant Contact", "consultantContact")}
      {/* Consultant and Doctor/Dietitian are maintained once in Patient Information. */}
      {isFemalePatient && (
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium text-gray-500">
            Pregnancy Status
          </div>
          <div className="px-1 py-0.5 text-sm text-gray-800">
            {formData.isPregnant ? "Pregnant" : "Not pregnant"}
          </div>
        </div>
      )}
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="md:col-span-2">
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Patient Name
        </label>
        <input
          className={fieldClass}
          name="name"
          value={formData.name}
          onChange={onChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Age
        </label>
        <input
          type="number"
          className={fieldClass}
          name="age"
          value={formData.age}
          onChange={onChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Gender
        </label>
        <select
          className={fieldClass}
          name="gender"
          value={formData.gender}
          onChange={onChange}
        >
          {["Male", "Female", "Other"].map((gender) => (
            <option key={gender}>{gender}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Admission Date
        </label>
        <input
          type="date"
          className={fieldClass}
          name="admissionDate"
          value={formData.admissionDate}
          onChange={onChange}
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Ward
        </label>
        <select
          className={fieldClass}
          name="ward"
          value={formData.ward}
          onChange={onChange}
        >
          {WARDS.map((ward) => (
            <option key={ward}>{ward}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Bed No
        </label>
        <input
          className={fieldClass}
          name="bedNo"
          value={formData.bedNo}
          onChange={onChange}
        />
      </div>
      <div className="md:col-span-3">
        <label className="mb-1 block text-xs font-medium text-gray-700">
          Primary Diagnosis
        </label>
        <input
          className={fieldClass}
          name="primaryDiagnosis"
          value={formData.primaryDiagnosis}
          onChange={onChange}
        />
      </div>
    </div>
  );
  const historyText =
    patientHistory?.history ||
    patientHistory?.primaryDiagnosis ||
    "No medical history recorded.";
  const historyWords = historyText.trim().split(/\s+/).filter(Boolean).length;
  const historyPanel = readOnlyPatient ? (
    <aside className="mt-2 rounded-lg border border-gray-300 bg-gray-50 p-4">
      <div className="mb-2 flex items-center gap-1 text-sm font-semibold text-gray-800">
        <History className="h-4 w-4 text-blue-700" />
        Past Patient Record
      </div>

      <div>
        <div className="mb-2 text-xs font-medium uppercase text-gray-400">
          Past Medical History
        </div>

        <div className="max-h-[450px] overflow-y-auto rounded-md border border-gray-200 bg-white p-3">
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
            {historyText}
          </p>
        </div>
      </div>

      {/* High-visibility pregnancy history: staff can review it without opening another screen. */}
      {isFemalePatient && (
        <div
          className={`mt-3 rounded-lg border p-3 ${formData.isPregnant ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}
        >
          <div
            className={`mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${formData.isPregnant ? "text-amber-900" : "text-slate-500"}`}
          >
            <Baby className="h-4 w-4" />
            Pregnancy & Prescription History
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <span className="text-[11px] text-slate-500">Status</span>
              <div className="text-sm font-semibold text-slate-900">
                {formData.isPregnant ? "Pregnant" : "Not pregnant"}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">
                Prescribed Diet
              </span>
              <div className="text-sm font-semibold text-slate-900">
                {formData.prescriptionDietTypeId
                  ? dietTypes.find(
                      (d) =>
                        Number(d.id) ===
                        Number(formData.prescriptionDietTypeId),
                    )?.name || "Prescription recorded"
                  : "Not recorded"}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">
                Prescription Date
              </span>
              <div className="text-sm text-slate-800">
                {formData.prescriptionDate || "Not recorded"}
              </div>
            </div>
            <div className="sm:col-span-2">
              <span className="text-[11px] text-slate-500">
                Prescription Instructions
              </span>
              <div className="text-sm text-slate-800">
                {formData.prescriptionInstructions ||
                  "No prescription instructions recorded."}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  ) : null;

  const selectedDiet = dietTypes.find(
    (diet) => diet.id === Number(formData.dietTypeId),
  );

  const nutrition = selectedDiet
    ? {
        calories: selectedDiet.calories,
        protein: Math.round(
          (selectedDiet.calories * selectedDiet.proteinPct) / 400,
        ),
        carbs: Math.round(
          (selectedDiet.calories * selectedDiet.carbsPct) / 400,
        ),
        fat: Math.round((selectedDiet.calories * selectedDiet.fatPct) / 900),
      }
    : { calories: "", protein: "", carbs: "", fat: "" };

  const dietaryAssignment = (
    <div>
      <h3 className="mb-3 border-b pb-1 text-sm font-semibold text-gray-900">
        Dietary Assignment
      </h3>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Assigned Diet <span className="text-red-500">*</span>
          </label>

          <input
            type="search"
            value={dietSearch}
            onChange={(event) => setDietSearch(event.target.value)}
            placeholder={
              selectedDiet
                ? `Current diet: ${selectedDiet.name} — search to change`
                : "Search diet, for example Diabetic"
            }
            className={fieldClass}
          />

          {dietSearch.trim() && (
            <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-md border bg-white p-1">
              {dietTypes
                .filter((diet) =>
                  `${diet.name} ${diet.code}`
                    .toLowerCase()
                    .includes(dietSearch.toLowerCase()),
                )
                .map((diet) => (
                  <button
                    key={diet.id}
                    type="button"
                    onClick={() => {
                      onChange({
                        target: {
                          name: "dietTypeId",
                          value: String(diet.id),
                        },
                      });

                      setDietSearch("");

                      // Opens the selected diet template popup
                      onDietSelect(diet.id);
                    }}
                    className={`w-full rounded px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                      Number(formData.dietTypeId) === diet.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700"
                    }`}
                  >
                    <span className="font-semibold">{diet.name}</span>
                    <span className="ml-2 text-xs text-gray-400">
                      {diet.code}
                    </span>
                  </button>
                ))}

              {dietTypes.filter((diet) =>
                `${diet.name} ${diet.code}`
                  .toLowerCase()
                  .includes(dietSearch.toLowerCase()),
              ).length === 0 && (
                <p className="px-3 py-2 text-sm text-gray-400">
                  No diet found.
                </p>
              )}
            </div>
          )}

          {selectedDiet && (
            <p className="mt-2 text-xs font-medium text-green-700">
              Selected: {selectedDiet.name}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Diet Start Date
            </label>
            <input
              type="date"
              name="dietStartDate"
              value={formData.dietStartDate || formData.admissionDate || ""}
              onChange={onChange}
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Review Date
            </label>
            <input
              type="date"
              name="reviewDate"
              value={formData.reviewDate || ""}
              onChange={onChange}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            ["Calories (kcal)", nutrition.calories],
            ["Protein (g)", nutrition.protein],
            ["Carbs (g)", nutrition.carbs],
            ["Fat (g)", nutrition.fat],
          ].map(([label, value]) => (
            <div key={label}>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {label}
              </label>
              <input
                value={value}
                readOnly
                className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
              />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Fluid (ml)
            </label>
            <input
              name="fluid"
              value={formData.fluid || ""}
              onChange={onChange}
              className={fieldClass}
              placeholder="1500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Sodium (mg)
            </label>
            <input
              name="sodium"
              value={formData.sodium || ""}
              onChange={onChange}
              className={fieldClass}
              placeholder="1500"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Meal Plan
          </label>

          <input
            value={
              selectedDiet
                ? `${selectedDiet.name} Meal Plan`
                : "Select an assigned diet first"
            }
            readOnly
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700"
          />

          <p className="mt-1 text-[11px] text-gray-400">
            The meal plan is automatically linked to the assigned diet.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Clinical Notes
          </label>
          <textarea
            name="specialInstructions"
            value={formData.specialInstructions || ""}
            onChange={onChange}
            rows="3"
            maxLength="300"
            className={fieldClass}
            placeholder="Enter clinical notes"
          />
          <p className="mt-1 text-right text-[10px] text-gray-400">
            {(formData.specialInstructions || "").length}/300
          </p>
        </div>

        <div>
          <label className="mb-2 block text-xs font-medium text-gray-700">
            Allergies
          </label>
          {readOnlyPatient ? (
            <div className="flex flex-wrap gap-2">
              {(formData.allergens || ["None"]).map((allergen) => (
                <span
                  key={allergen}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-700"
                >
                  {allergen}
                </span>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {ALLERGENS.map((allergen) => (
                <button
                  key={allergen}
                  type="button"
                  onClick={() => onAllergenToggle(allergen)}
                  className={`rounded-full border px-3 py-1 text-xs ${
                    formData.allergens?.includes(allergen)
                      ? "border-red-200 bg-red-50 text-red-700"
                      : "border-gray-200 bg-white text-gray-600"
                  }`}
                >
                  {allergen}
                </button>
              ))}
            </div>
          )}
        </div>

        {isFemalePatient && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
              <Baby className="h-4 w-4" /> Pregnancy Prescription
            </div>
            <p className="mb-3 text-xs text-amber-800">
              For a pregnant patient, the diet plan must follow the consultant
              prescription.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  Prescribed Diet
                </label>
                <select
                  name="prescriptionDietTypeId"
                  value={formData.prescriptionDietTypeId || ""}
                  onChange={onChange}
                  disabled={readOnlyPatient}
                  className={fieldClass}
                >
                  <option value="">Select prescribed diet</option>
                  {dietTypes.map((diet) => (
                    <option key={diet.id} value={diet.id}>
                      {diet.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-amber-900">
                  Prescription Date
                </label>
                <input
                  type="date"
                  name="prescriptionDate"
                  value={formData.prescriptionDate || ""}
                  onChange={onChange}
                  disabled={readOnlyPatient}
                  className={fieldClass}
                />
              </div>
            </div>
            <textarea
              name="prescriptionInstructions"
              value={formData.prescriptionInstructions || ""}
              onChange={onChange}
              disabled={readOnlyPatient}
              rows="2"
              className={`${fieldClass} mt-3`}
              placeholder="Consultant prescription / dietary instructions"
            />
          </div>
        )}

        {/*<div>
          <label className="mb-1 block text-xs font-medium text-gray-700">
            Intestinal / GI Details
          </label>
          <textarea
            name="intestinalDetails"
            value={formData.intestinalDetails || ""}
            onChange={onChange}
            disabled={readOnlyPatient}
            rows="3"
            className={fieldClass}
            placeholder="Constipation, diarrhoea, abdominal discomfort, bowel pattern, swallowing or other GI details"
          />
        </div>*/}
      </div>
    </div>
  );

  return readOnlyPatient ? (
    <div className="space-y-2">
      <section>
        <h3 className="mb-2 border-b pb-1 text-sm font-semibold text-gray-900">
          Patient Information
        </h3>
        {patientDetails}
      </section>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-red-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-red-800">
            <AlertTriangle className="h-4 w-4" /> Allergies
          </div>
          <div className="text-sm font-semibold text-gray-900">
            {(formData.allergens || ["None"]).join(", ")}
          </div>
        </div>
        <div className="rounded-lg border bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Activity className="h-4 w-4" /> Intestinal / GI Details
          </div>
          <div className="text-sm text-gray-800">
            {formData.intestinalDetails || "Not recorded"}
          </div>
        </div>
        {isFemalePatient && (
          <div
            className={`rounded-lg border p-3 ${formData.isPregnant ? "border-amber-300 bg-amber-50" : "bg-slate-50"}`}
          >
            <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-900">
              <Baby className="h-4 w-4" /> Pregnancy / Prescription
            </div>
            <div className="text-sm font-semibold text-gray-900">
              {formData.isPregnant
                ? "Pregnant — prescription required"
                : "Not pregnant"}
            </div>
            {formData.isPregnant && (
              <div className="text-xs text-gray-700">
                {formData.prescriptionInstructions ||
                  "No prescription instructions recorded"}
              </div>
            )}
          </div>
        )}
      </section>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[34%_minmax(0,1fr)]">
        <section>{historyPanel}</section>
        <section>{dietaryAssignment}</section>
      </div>
    </div>
  ) : (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 border-b pb-1 text-sm font-semibold text-gray-900">
          Patient Information
        </h3>
        {patientDetails}
      </section>
      <section>{dietaryAssignment}</section>
    </div>
  );
}
/* ── DietTracker: read-only workflow inside Diet Management ─────── */
const DIET_TRACKER_STAGES = ["Planning", "Preparing", "Delivery", "Intake"];

const TRACKER_MEALS = [
  "Breakfast",
  "Mid-Morning",
  "Lunch",
  "Evening Snack",
  "Dinner",
  "Bedtime",
];

const getTrackerDateKey = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

function dietTrackerStage(status) {
  switch (String(status || "")) {
    case "Assigned":
    case "Planning":
    case "Approved":
      return 0;
    case "Kitchen Assigned":
    case "Preparing":
    case "Prepared":
      return 1;
    case "Dispatched":
    case "Delivering":
      return 2;
    case "Delivered":
      return 3;
    case "Not Assigned":
    case "Draft":
    case "Cancelled":
    default:
      return -1;
  }
}

function DietTracker({ patient }) {
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Re-evaluate against the actual local date/time while the Diet Manager
  // remains open. No visual/layout changes are made to the tracker.
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const serviceDate = getTrackerDateKey(currentTime);
  const isDischarged =
    String(patient?.status || "").toLowerCase() === "discharged";

  const flows = getStore("hd_diet_workflow", []) || [];
  const flow = flows.find(
    (item) => String(item.patientId) === String(patient.id),
  );

  // IMPORTANT: a discharged patient's existing tracker is frozen. Daily
  // meal/time logic must never change their historical tracker.
  if (isDischarged) {
    const status = flow?.status || patient?.dietStatus || "Not Assigned";
    const activeStage = dietTrackerStage(status);

    return (
      <div
        className="min-w-[220px] max-w-[250px] py-1"
        title={`Tracker status: ${status}`}
      >
        <div className="flex items-start gap-1">
          {DIET_TRACKER_STAGES.map((stage, index) => {
            const complete = activeStage >= index;
            return (
              <React.Fragment key={stage}>
                <div className="flex min-w-0 flex-1 flex-col items-center">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${complete ? "bg-blue-600" : "bg-slate-200"}`}
                  />
                  <span
                    className={`mt-1 whitespace-nowrap text-[10px] ${complete ? "font-medium text-blue-700" : "text-slate-400"}`}
                  >
                    {stage}
                  </span>
                </div>
                {index < DIET_TRACKER_STAGES.length - 1 && (
                  <span
                    className={`mt-1 h-0.5 flex-1 ${activeStage > index ? "bg-blue-600" : "bg-slate-200"}`}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  }

  // Use the same configured meal times as Meal Distribution. If Master Data
  // is incomplete, use the application's normal hospital meal schedule.
  const mealTypes = getStore(KEYS.MEAL_TYPES, []) || [];
  const fallbackTimes = {
    Breakfast: "08:00",
    "Mid-Morning": "10:30",
    Lunch: "13:00",
    "Evening Snack": "16:30",
    Dinner: "19:30",
    Bedtime: "22:00",
  };

  const schedule = TRACKER_MEALS.map((name) => {
    const configured = mealTypes.find(
      (item) =>
        String(item.name || "").toLowerCase() === name.toLowerCase() &&
        item.status !== "Inactive" &&
        item.time,
    );
    const time = configured?.time || fallbackTimes[name];
    const [hours, minutes] = String(time).split(":").map(Number);
    return {
      name,
      minutes: (hours || 0) * 60 + (minutes || 0),
    };
  }).sort((a, b) => a.minutes - b.minutes);

  const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Current scheduled meal: the last meal whose configured start time has
  // arrived today. This naturally rolls over when the calendar date changes.
  let currentMeal = null;
  schedule.forEach((meal) => {
    if (meal.minutes <= nowMinutes) currentMeal = meal.name;
  });

  // Before the first meal of the day, keep the tracker at Planning.
  const mealStatusMap = getStore("hd_meal_status", {}) || {};
  const mealStatus = currentMeal
    ? mealStatusMap[`${serviceDate}-${patient.id}-${currentMeal}`] || "Pending"
    : "Pending";
  const intakeStatusMap = getStore("hd_intake_status", {}) || {};
  const intakeStatus = currentMeal
    ? intakeStatusMap[`${serviceDate}-${patient.id}-${currentMeal}`] ||
      intakeStatusMap[`${patient.id}-${currentMeal}`] ||
      "Pending"
    : "Pending";

  const activeStage = dietTrackerStage(
    intakeStatus === "Taken" || intakeStatus === "Not Taken"
      ? "Intake"
      : mealStatus === "Pending"
        ? "Planning"
        : mealStatus,
  );

  return (
    <div
      className="min-w-[220px] max-w-[250px] py-1"
      title={`Tracker status: ${currentMeal ? `${currentMeal} · ${intakeStatus === "Taken" || intakeStatus === "Not Taken" ? "Intake" : mealStatus === "Pending" ? "Planning" : mealStatus} · ${serviceDate}` : `Planning · ${serviceDate}`}`}
    >
      <div className="flex items-start gap-1">
        {DIET_TRACKER_STAGES.map((stage, index) => {
          const complete = activeStage >= index;
          return (
            <React.Fragment key={stage}>
              <div className="flex min-w-0 flex-1 flex-col items-center">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${complete ? "bg-blue-600" : "bg-slate-200"}`}
                />
                <span
                  className={`mt-1 whitespace-nowrap text-[10px] ${complete ? "font-medium text-blue-700" : "text-slate-400"}`}
                >
                  {stage}
                </span>
              </div>
              {index < DIET_TRACKER_STAGES.length - 1 && (
                <span
                  className={`mt-1 h-0.5 flex-1 ${activeStage > index ? "bg-blue-600" : "bg-slate-200"}`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

/* ── PatientTable ───────────────────────────────────────────────── */
function PatientTable({
  patients,
  dietTypes,
  onView,
  onEdit,
  onDelete,
  onOpenMealPlan,
  onOpenTemplate,
}) {
  const columns = [
    { key: "id", label: "ID", sortable: true },
    {
      key: "name",
      label: "Patient",
      sortable: true,
      render: (r) => (
        <div>
          <div className="font-medium text-gray-900">{r.name}</div>
          <div className="text-xs text-gray-400">
            {r.age} yrs · {r.gender}
          </div>
        </div>
      ),
    },
    {
      key: "ward",
      label: "Location",
      sortable: false,
      render: (r) => (
        <div>
          <div className="text-gray-800">{r.ward}</div>
          <div className="text-xs text-gray-400">Bed: {r.bedNo}</div>
        </div>
      ),
    },
    {
      key: "dietTypeId",
      label: "Diet Plan",
      sortable: true,
      render: (r) => {
        const diet = dietTypes.find(
          (d) => Number(d.id) === Number(r.dietTypeId),
        );

        if (!diet) {
          return (
            <span className="italic text-xs text-gray-400">Not Assigned</span>
          );
        }

        return (
          <button
            onClick={() => onOpenMealPlan(r)}
            className="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100"
          >
            {diet.name}
          </button>
        );
      },
    },
    {
      key: "dietitian",
      label: "Dietitian",
      sortable: true,
      className: "whitespace-nowrap",
    },
    // DIET MANAGEMENT TRACKER: read-only workflow is shown here before Status.
    // It reads the same hd_diet_workflow data used by the operational workflow, so this
    // column reflects approval/kitchen/prepared/delivery progress without edit controls.
    {
      key: "tracker",
      label: "Tracker",
      sortable: false,
      render: (r) => <DietTracker patient={r} />,
      className: "diet-tracker-column",
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "admissionDate",
      label: "Admitted",
      sortable: true,
      render: (r) => new Date(r.admissionDate).toLocaleDateString(),
    },
    {
      key: "template",
      label: "Template",
      sortable: false,
      render: (r) => {
        const diet = dietTypes.find(
          (d) => Number(d.id) === Number(r.dietTypeId),
        );
        if (!diet) return <span className="text-xs text-gray-400">-</span>;
        return (
          <button
            type="button"
            onClick={() => onOpenTemplate(r)}
            className="whitespace-nowrap rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-100"
            title={`Open ${diet.name} template`}
          >
            {diet.name} Template
          </button>
        );
      },
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (r) => (
        <div className="flex justify-end gap-2">
          <button
            type="button"
            title="View patient"
            onClick={() => onView(r)}
            className="p-1.5 text-gray-600 hover:bg-gray-100 rounded transition-colors"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Edit diet plan"
            onClick={() => onEdit(r)}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <Edit className="w-4 h-4" />
          </button>

          <button
            type="button"
            title="Delete patient diet record"
            onClick={() => onDelete(r)}
            className="p-1.5 text-red-600  hover:bg-red-50  rounded transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={patients}
      searchable={false}
      pagination={10}
    />
  );
}

/* ── Dashboard Page ─────────────────────────────────────────────── */
const DIET_MANAGER_TABS = [
  {
    key: "patients",
    label: "Diet Manager",
    permission: PERMISSIONS.PATIENT_VIEW,
  },
  {
    key: "meal-plan",
    label: "Nutrition Meal Plan",
    permission: PERMISSIONS.DIET_PLAN_VIEW,
  },
  {
    key: "clinical-alerts",
    label: "Clinical Alerts",
    permission: PERMISSIONS.ALERTS_VIEW,
  },
];

export default function Dashboard() {
  const currentRole = getCurrentRole();
  const visibleTabs = DIET_MANAGER_TABS.filter((tab) =>
    hasPermission(currentRole, tab.permission),
  );
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.key || "patients");
  const [patients, setPatients] = useState([]);
  const [dietTypes, setDietTypes] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [templateDietId, setTemplateDietId] = useState(null);
  const [templatePatientId, setTemplatePatientId] = useState(null);
  const [fullHistory, setFullHistory] = useState(null);
  const [mealPlanDietId, setMealPlanDietId] = useState(null);
  const [mealPlanPatient, setMealPlanPatient] = useState(null);
  const [filters, setFilters] = useState({
    search: "",
    id: "",
    ward: "",
    dietType: "",
    status: "",
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [deletingPatient, setDeletingPatient] = useState(null);
  const [createForm, setCreateForm] = useState({ ...EMPTY_FORM });
  const [viewingPatient, setViewingPatient] = useState(null);

  const viewingDiet = viewingPatient
    ? dietTypes.find((d) => Number(d.id) === Number(viewingPatient.dietTypeId))
    : null;

  const viewingNutrition = viewingDiet
    ? {
        calories: viewingDiet.calories,
        protein: Math.round(
          (viewingDiet.calories * viewingDiet.proteinPct) / 400,
        ),
        carbs: Math.round((viewingDiet.calories * viewingDiet.carbsPct) / 400),
        fat: Math.round((viewingDiet.calories * viewingDiet.fatPct) / 900),
      }
    : null;

  const viewingReviewStatus = viewingPatient
    ? getReviewStatus(viewingPatient)
    : "Not Scheduled";

  const reload = () => {
    setPatients(getStore(KEYS.PATIENTS));
    const rawDietTypes = getStore(KEYS.DIET_TYPES) || [];
    const normalizedDietTypes = rawDietTypes
      .map((diet, index) => normalizeDietType(diet, index))
      .filter(Boolean);

    // API diet records may use status=true and targetCalories/proteinPercent.
    // Normalize them before Diet Manager consumes them.
    setDietTypes(normalizedDietTypes.filter((d) => isActiveDietType(d)));

    // Keep the canonical in-memory shape so all modules use the same
    // field names even when the backend is temporarily unavailable.
    if (
      normalizedDietTypes.length &&
      JSON.stringify(rawDietTypes) !== JSON.stringify(normalizedDietTypes)
    ) {
      setStore(KEYS.DIET_TYPES, normalizedDietTypes);
    }
    // load foods first so we can fill missing mapping quantities/units
    const rawFoods = getStore(KEYS.FOOD_MASTER);
    setFoods(rawFoods);
    setMealTypes(getStore(KEYS.MEAL_TYPES));

    const rawMappings = getStore(KEYS.DIET_MAPPING);
    const normalized = (rawMappings || []).map((m) => {
      const foodItems = Array.isArray(m.foodItems)
        ? m.foodItems.map((f) => Number(f))
        : [];

      const quantities = { ...(m.quantities || {}) };
      const units = { ...m.units } || {};

      foodItems.forEach((fid) => {
        if (quantities[fid] === undefined) {
          const f = rawFoods.find((x) => Number(x.id) === Number(fid));
          const quantity = resolveQuantity(
            quantities[fid],
            f?.standardQuantity,
          );
          if (quantity === null) delete quantities[fid];
          else quantities[fid] = quantity;
        }
        if (units[fid] === undefined) {
          const f = rawFoods.find((x) => Number(x.id) === Number(fid));
          units[fid] = normalizeUnit((m.units && m.units[fid]) || f?.unit);
        }
      });

      return {
        ...m,
        dietTypeId: Number(m.dietTypeId),
        mealTypeId: Number(m.mealTypeId),
        foodItems,
        quantities,
        units,
      };
    });

    setMappings(normalized);
  };

  const reloadPatientsFromApi = async () => {
    const response = await patientService.getAllPatients({
      patientCode: "",
      name: "",
      ward: "",
      status: true,
      paginationInfo: { currentPage: 0, pageSize: 100 },
    });
    if (
      response?.error ||
      response?.statusCode >= 400 ||
      response?.status >= 400
    ) {
      throw new Error(
        response?.message ||
          response?.error?.message ||
          "Could not load patients from the server.",
      );
    }
    const existingPatients = getStore(KEYS.PATIENTS, []) || [];
    const rows = extractPatientRows(response)
      .map(normalizePatientApiRow)
      .filter((patient) => patient.id != null)
      .map((patient) => ({
        ...existingPatients.find(
          (existing) => String(existing.id) === String(patient.id),
        ),
        ...patient,
      }));
    setStore(KEYS.PATIENTS, rows);
    setPatients(rows);
    return rows;
  };

  useEffect(reload, []);

  useEffect(() => {
    const refreshFromBackend = () => reload();
    const refreshFromStore = () => reload();
    window.addEventListener("diet-types-synced", refreshFromBackend);
    window.addEventListener("dietcare-store-updated", refreshFromStore);
    window.addEventListener("storage", refreshFromStore);
    return () => {
      window.removeEventListener("diet-types-synced", refreshFromBackend);
      window.removeEventListener("dietcare-store-updated", refreshFromStore);
      window.removeEventListener("storage", refreshFromStore);
    };
  }, []);

  /* generic field change handler for any form state setter */
  const makeChangeHandler = (setter) => (e) =>
    setter((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  /* allergen toggle for any form state setter */
  const makeAllergenToggle = (setter) => (a) =>
    setter((prev) => {
      if (a === "None") return { ...prev, allergens: ["None"] };
      const base = prev.allergens.filter((x) => x !== "None");
      return {
        ...prev,
        allergens: base.includes(a)
          ? base.filter((x) => x !== a)
          : [...base, a],
      };
    });

  const chooseDiet = (setter) => (dietTypeId) => {
    setter((prev) => ({ ...prev, dietTypeId }));
    setTemplateDietId(dietTypeId);
    setTemplatePatientId(editingPatient?.id || null);
  };

  const saveTemplate = (
    templates,
    patientAllergies = null,
    savedForPatientId = null,
  ) => {
    // The Patient Allergies selector in the template editor is a patient-level
    // clinical value, not only a template filter. Persist it to the same
    // patient record so Clinical Alerts, Dashboard, Delivery and Intake all
    // read the updated value.
    const targetPatientId = savedForPatientId || templatePatientId;
    if (targetPatientId && Array.isArray(patientAllergies)) {
      const normalizedAllergies = patientAllergies.length
        ? patientAllergies
        : ["None"];
      const currentPatient = (getStore(KEYS.PATIENTS, []) || []).find(
        (patient) => String(patient.id) === String(targetPatientId),
      );
      if (currentPatient) {
        const previousAllergies = Array.isArray(currentPatient.allergens)
          ? currentPatient.allergens
          : ["None"];
        if (
          JSON.stringify(previousAllergies) !==
          JSON.stringify(normalizedAllergies)
        ) {
          updateRecord(KEYS.PATIENTS, currentPatient.id, {
            allergens: normalizedAllergies,
          });
          appendHistoryEvent({
            type: "patient_update",
            module: "Diet Template",
            action: "Patient Allergy Updated",
            patientId: currentPatient.id,
            patientName: currentPatient.name || "",
            changedFields: ["allergens"],
            serviceDate: new Date().toISOString().slice(0, 10),
          });
        }
      }
    }

    templates.forEach((template) => {
      const patch = {
        dietTypeId: Number(template.dietTypeId),
        mealTypeId: Number(template.mealTypeId),
        foodItems: template.foodItems,
        quantities: template.quantities,
        units: template.units,
        addOns: template.addOns,
        instructions: template.instructions,
        allergies: template.allergies,
      };

      // Existing mappings are updated; newly configured meals are inserted.
      const existing = (getStore(KEYS.DIET_MAPPING) || []).find(
        (record) => String(record.id) === String(template.id),
      );

      if (existing) {
        updateRecord(KEYS.DIET_MAPPING, existing.id, patch);
      } else {
        addRecord(KEYS.DIET_MAPPING, patch);
      }
    });
    reload();
  };
  const syncDietWorkflow = (patient) => {
    if (!patient?.dietTypeId) return;
    const key = "hd_diet_workflow";
    const flows = getStore(key, []) || [];
    const existing = flows.find(
      (flow) => String(flow.patientId) === String(patient.id),
    );
    const flow = {
      ...(existing || {}),
      id: existing?.id || patient.id,
      patientId: patient.id,
      dietTypeId: Number(patient.dietTypeId),
      dietTemplateId: Number(patient.dietTypeId),
      status:
        existing &&
        Number(existing.dietTypeId) === Number(patient.dietTypeId) &&
        existing.status &&
        existing.status !== "Cancelled" &&
        !["Pending Approval", "Approved"].includes(existing.status)
          ? existing.status
          : "Planning",
      patientTasteRemark:
        patient.patientTasteRemark || existing?.patientTasteRemark || "",
      spiceLevel: patient.spiceLevel || existing?.spiceLevel || "Normal",
      foodTemperature:
        patient.foodTemperature || existing?.foodTemperature || "Warm",
      updatedAt: new Date().toISOString(),
    };
    setStore(
      key,
      existing
        ? flows.map((item) => (item.id === existing.id ? flow : item))
        : [...flows, flow],
    );
  };

  const handleCreate = async () => {
    if (!String(createForm.patientCode || "").trim()) {
      window.alert("Patient Code is required.");
      return;
    }
    if (!String(createForm.name || "").trim()) {
      window.alert("Patient Name is required.");
      return;
    }
    const patientData = {
      ...createForm,
      age: parseInt(createForm.age),
      dietTypeId: createForm.dietTypeId
        ? parseInt(createForm.dietTypeId)
        : null,
      dietStatus: createForm.dietTypeId ? "Assigned" : "Not Assigned",
      dietPlanStatus: createForm.dietTypeId ? "Planning" : "Not Assigned",
    };
    try {
      const response = await patientService.createPatient(
        toPatientApiPayload(patientData),
      );
      if (
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "The server rejected the patient.",
        );
      }
      const rows = await reloadPatientsFromApi();
      const newPatient = rows.find(
        (patient) =>
          String(patient.patientCode).toLowerCase() ===
          String(patientData.patientCode).trim().toLowerCase(),
      );
      if (newPatient) syncDietWorkflow(newPatient);
    } catch (error) {
      console.error("Patient create failed", error);
      window.alert(
        error?.message ||
          "Patient could not be saved. Please check the server and try again.",
      );
      return;
    }
    setIsCreateOpen(false);
    setCreateForm({ ...EMPTY_FORM });
    reload();
  };

  const handleEdit = (patient) => {
    const dietHistory = Array.isArray(patient.dietHistory)
      ? patient.dietHistory
      : [];
    const previousDietId =
      dietHistory[dietHistory.length - 1]?.dietTypeId ||
      patient.previousDietTypeId ||
      "";
    const previousDiet = dietTypes.find(
      (diet) => Number(diet.id) === Number(previousDietId),
    );
    setEditingPatient({
      ...patient,
      originalDietTypeId: patient.dietTypeId || null,
      pastDiet:
        patient.pastDiet || previousDiet?.name || "No previous diet recorded",
    });
  };
  const handleUpdate = async () => {
    const isFemale =
      String(editingPatient.gender || "")
        .trim()
        .toLowerCase() === "female";
    // Preserve the old diet whenever the patient's current diet is changed.
    const previousDietHistory = Array.isArray(editingPatient.dietHistory)
      ? [...editingPatient.dietHistory]
      : [];
    const originalDietId = editingPatient.originalDietTypeId
      ? Number(editingPatient.originalDietTypeId)
      : null;
    const newDietId = editingPatient.dietTypeId
      ? Number(editingPatient.dietTypeId)
      : null;
    if (
      originalDietId &&
      newDietId &&
      originalDietId !== newDietId &&
      !previousDietHistory.some(
        (item) => Number(item.dietTypeId) === originalDietId,
      )
    ) {
      previousDietHistory.push({
        dietTypeId: originalDietId,
        endDate: new Date().toISOString().slice(0, 10),
      });
    }
    // PREGNANCY SAFETY: never persist pregnancy fields for a male patient.
    const { originalDietTypeId, ...patientData } = editingPatient;
    const changedDietName =
      originalDietId && originalDietId !== newDietId
        ? dietTypes.find((diet) => Number(diet.id) === originalDietId)?.name
        : editingPatient.pastDiet;
    const updatedPatient = {
      ...patientData,
      age: parseInt(editingPatient.age),
      dietTypeId: newDietId,
      dietHistory: previousDietHistory,
      pastDiet: changedDietName || "No previous diet recorded",
      isPregnant: isFemale ? Boolean(editingPatient.isPregnant) : false,
      ...(isFemale
        ? {}
        : {
            prescriptionDietTypeId: "",
            prescriptionDate: "",
            prescriptionInstructions: "",
          }),
    };
    try {
      const response = await patientService.updatePatientById(
        editingPatient.id,
        toPatientApiPayload(updatedPatient, { isUpdate: true }),
      );
      if (
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "The server rejected the patient update.",
        );
      }
    } catch (error) {
      console.error("Patient update failed", error);
      window.alert(
        error?.message ||
          "Patient could not be updated. Please check the server and try again.",
      );
      return;
    }
    updateRecord(KEYS.PATIENTS, editingPatient.id, updatedPatient);
    try {
      await reloadPatientsFromApi();
    } catch (error) {
      console.error("Patient refresh after update failed", error);
      window.alert(
        error?.message ||
          "Patient was updated, but the patient list could not be refreshed.",
      );
    }
    const trackedPatientFields = [
      "allergens",
      "specialInstructions",
      "intestinalDetails",
      "isPregnant",
      "prescriptionDietTypeId",
      "prescriptionDate",
      "prescriptionInstructions",
      "dietTypeId",
      "patientTasteRemark",
      "spiceLevel",
      "foodTemperature",
    ];
    const changedClinicalFields = trackedPatientFields.filter((field) => {
      const before = JSON.stringify(editingPatient?.[field] ?? null);
      const after = JSON.stringify(updatedPatient?.[field] ?? null);
      return before !== after;
    });
    if (changedClinicalFields.length) {
      appendHistoryEvent({
        type: "patient_update",
        module: "Diet Manager",
        action: "Patient Clinical/Diet Details Updated",
        patientId: editingPatient.id,
        patientName: editingPatient.name || "",
        changedFields: changedClinicalFields,
        serviceDate: new Date().toISOString().slice(0, 10),
      });
    }
    if (originalDietId !== newDietId) {
      appendHistoryEvent({
        type: "diet_plan",
        module: "Patient Management",
        action: "Patient Diet Changed",
        patientId: editingPatient.id,
        patientName: editingPatient.name || "",
        previousDietTypeId: originalDietId,
        dietTypeId: newDietId,
        previousDietName: originalDietId
          ? dietTypes.find((diet) => Number(diet.id) === originalDietId)
              ?.name || ""
          : "",
        dietName: newDietId
          ? dietTypes.find((diet) => Number(diet.id) === newDietId)?.name || ""
          : "",
        actionDate: new Date().toISOString(),
      });
    }
    if (updatedPatient.dietTypeId) syncDietWorkflow(updatedPatient);
    setEditingPatient(null);
    reload();
  };

  const markReviewComplete = () => {
    if (!viewingPatient) return;

    const today = new Date().toISOString().slice(0, 10);
    updateRecord(KEYS.PATIENTS, viewingPatient.id, {
      reviewDate: viewingPatient.reviewDate || today,
      reviewedAt: today,
    });
    setViewingPatient({
      ...viewingPatient,
      reviewDate: viewingPatient.reviewDate || today,
      reviewedAt: today,
    });
    reload();
  };

  const handleDelete = async () => {
    try {
      const response = await patientService.deletePatient(deletingPatient.id);
      if (
        response?.error ||
        response?.statusCode >= 400 ||
        response?.status >= 400
      ) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "The server rejected the patient deletion.",
        );
      }
      deleteRecord(KEYS.PATIENTS, deletingPatient.id);
      setDeletingPatient(null);
      reload();
    } catch (error) {
      console.error("Patient delete failed", error);
      window.alert(
        error?.message ||
          "Patient could not be deleted. Please check the server and try again.",
      );
    }
  };

  const filtered = patients.filter((p) => {
    // Search by name or ID
    if (filters.search) {
      const q = filters.search.toLowerCase();
      if (
        !(
          `${p.name}`.toLowerCase().includes(q) ||
          `${p.id || ""}`.toLowerCase().includes(q)
        )
      )
        return false;
    }

    // Ward filter
    if (filters.ward && p.ward !== filters.ward) return false;

    // Diet type special token: 'HAS_DIET' means any assigned diet
    if (filters.dietType) {
      if (filters.dietType === "HAS_DIET") {
        if (!p.dietTypeId) return false;
      } else if (p.dietTypeId !== Number(filters.dietType)) return false;
    }

    // Diet status (custom field `dietStatus` if present, fall back to patient.status)
    if (filters.dietStatus && (p.dietStatus || p.status) !== filters.dietStatus)
      return false;

    // Review status
    if (filters.reviewStatus) {
      const status = getReviewStatus(p);
      if (filters.reviewStatus === "DueToday") {
        if (status !== "Due Today") return false;
      } else if (filters.reviewStatus === "DueSoon") {
        if (status !== "Due Soon") return false;
      } else if (filters.reviewStatus === "Overdue") {
        if (status !== "Overdue") return false;
      } else if (filters.reviewStatus === "Reviewed") {
        if (status !== "Reviewed") return false;
      }
    }

    // Status (patient-level)
    if (filters.status && p.status !== filters.status) return false;

    return true;
  });

  const hasFilters = Object.values(filters).some(Boolean);

  // Compact summary counts used by clickable summary cards
  const activePatientsCount = patients.filter(
    (p) => (p.status || "Active") === "Active",
  ).length;
  const dietAssignedCount = patients.filter((p) => !!p.dietTypeId).length;
  const onHoldCount = patients.filter(
    (p) => (p.dietStatus || "") === "On Hold",
  ).length;
  const noDietCount = patients.filter((p) => !p.dietTypeId).length;
  const reviewDueCount = patients.filter((p) => {
    if (!p.reviewDate) return false;
    const rd = new Date(p.reviewDate);
    const today = new Date();
    return rd <= today;
  }).length;

  const modalFooter = (onSave, onCancel, label) => (
    <div className="flex justify-end gap-3">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        className="px-4 py-2 text-sm bg-blue-700 text-white rounded-md hover:bg-blue-800"
      >
        {label}
      </button>
    </div>
  );

  const todayDate = new Date().toISOString().slice(0, 10);
  const activePlans = getStore("hd_diet_plans", []) || [];
  const viewingPlan = viewingPatient
    ? activePlans.find(
        (plan) =>
          String(plan.patientId) === String(viewingPatient.id) &&
          ["planning", "approved", "active"].includes(
            String(plan.status).toLowerCase(),
          ) &&
          String(plan.startDate || "") <= todayDate,
      )
    : null;
  const todayMealPlan = [
    ["Breakfast", "07:30 AM", Sunrise],
    ["Mid-Morning", "10:30 AM", Coffee],
    ["Lunch", "01:00 PM", Soup],
    ["Evening Snack", "04:30 PM", Coffee],
    ["Dinner", "07:00 PM", Moon],
    ["Bedtime", "09:30 PM", BedDouble],
  ].map(([name, time, icon]) => {
    const mealType = mealTypes.find(
      (m) => String(m.name).toLowerCase() === name.toLowerCase(),
    );
    const mapping = mappings.find(
      (m) =>
        Number(m.dietTypeId) ===
          Number(viewingPlan?.dietTypeId || viewingPatient?.dietTypeId) &&
        Number(m.mealTypeId) === Number(mealType?.id),
    );
    const allocatedFoods = (mapping?.foodItems || [])
      .map((foodId) => {
        const food = foods.find((f) => Number(f.id) === Number(foodId));
        if (!food) return null;
        return {
          name: food.name,
          quantity:
            mapping?.quantityTexts?.[foodId] ??
            mapping?.quantities?.[foodId] ??
            food.standardQuantity,
          unit: mapping?.units?.[foodId] || food.unit,
        };
      })
      .filter(Boolean);
    const intake = viewingPatient
      ? getStore(`hd_meal_intake_${viewingPatient.id}_${todayDate}`, null)
      : null;
    const mealRecord = intake?.meals?.find((item) => item.meal === name);
    return {
      name,
      time,
      icon,
      completed: mealRecord?.status === "Taken",
      status: mealRecord?.status || "Pending",
      foods: allocatedFoods,
    };
  });

  return (
    <AppLayout title="Diet Manager">
      <HospitalPage
        title="Diet Manager"
        description="Comprehensive view of patient dietary requirements, meal plans, and clinical alerts."
        noPadding={true}
      >
        <div className="space-y-4 p-4">
          {/* ── Diet Manager tabs: Patients / Nutrition Meal Plan / Clinical Alerts ── */}
          {visibleTabs.length > 1 && (
            <div className="hospital-tabs mb-4 px-4 pt-2">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`hospital-tab ${activeTab === tab.key ? "active" : ""}`}
                  aria-selected={activeTab === tab.key}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          <div className="px-4 pb-4">
            {activeTab === "meal-plan" && <DietPlans embedded />}
            {activeTab === "clinical-alerts" && <ClinicalAlerts embedded />}
            {activeTab === "patients" && <DietManagerReference embedded />}
          </div>
        </div>
      </HospitalPage>

      {/* Create Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Diet Plan"
        size="xl"
        footer={modalFooter(
          handleCreate,
          () => setIsCreateOpen(false),
          "Save Diet Plan",
        )}
      >
        <DietForm
          formData={createForm}
          dietTypes={dietTypes}
          onChange={makeChangeHandler(setCreateForm)}
          onAllergenToggle={makeAllergenToggle(setCreateForm)}
          onDietSelect={chooseDiet(setCreateForm)}
        />
      </Modal>

      {/* View Patient Modal */}
      {viewingPatient && (
        <Modal
          isOpen={!!viewingPatient}
          onClose={() => setViewingPatient(null)}
          title="Patient Details"
          size="xl"
          footer={
            <div className="flex justify-between items-center gap-3">
              {viewingReviewStatus !== "Reviewed" && (
                <button
                  onClick={markReviewComplete}
                  className="px-4 py-2 text-sm bg-green-700 text-white rounded-md hover:bg-green-800"
                >
                  Mark Review Complete
                </button>
              )}
              <button
                onClick={() => setViewingPatient(null)}
                className="px-4 py-2 text-sm border rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          }
        >
          <div className="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500">Patient Name</p>
              <p className="font-semibold">{viewingPatient.name}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Age / Gender</p>
              <p className="font-semibold">
                {viewingPatient.age} yrs · {viewingPatient.gender}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Ward / Bed</p>
              <p className="font-semibold">
                {viewingPatient.ward} · Bed {viewingPatient.bedNo}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Admission Date</p>
              <p className="font-semibold">
                {new Date(viewingPatient.admissionDate).toLocaleDateString()}
              </p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Dietitian</p>
              <p className="font-semibold">{viewingPatient.dietitian}</p>
            </div>

            <div>
              <p className="text-xs text-gray-500">Review Status</p>
              <span
                className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getReviewBadgeClass(
                  viewingReviewStatus,
                )}`}
              >
                {viewingReviewStatus}
              </span>
            </div>

            <div>
              <p className="text-xs text-gray-500">Status</p>
              <StatusBadge status={viewingPatient.status} />
            </div>

            <div>
              <p className="text-xs text-gray-500">Allergies</p>
              <p className="font-semibold">
                {(viewingPatient.allergens || ["None"]).join(", ")}
              </p>
            </div>

            {/* Dietary Alerts */}
            <div className="md:col-span-2">
              <DietaryAlerts patient={viewingPatient} diet={viewingDiet} />
            </div>

            {/* Current Diet Plan */}
            <div className="md:col-span-2 mt-2 rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
                    Current Diet Plan
                  </p>

                  <p className="mt-1 text-lg font-bold text-gray-900">
                    {dietTypes.find(
                      (diet) =>
                        Number(diet.id) === Number(viewingPatient.dietTypeId),
                    )?.name || "No Diet Assigned"}
                  </p>
                </div>

                <div className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                  {viewingPatient.status || "Active"}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-gray-500">Diet Start Date</p>
                  <p className="mt-1 text-sm font-medium text-gray-800">
                    {viewingPatient.dietStartDate
                      ? new Date(
                          viewingPatient.dietStartDate,
                        ).toLocaleDateString()
                      : "Not recorded"}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Meal Plan</p>

                  <p className="mt-1 text-sm font-medium text-gray-800">
                    {viewingDiet
                      ? `${viewingDiet.name} Meal Plan`
                      : "Not assigned"}
                  </p>
                </div>
              </div>
            </div>

            {/* Nutrition Summary */}
            {viewingNutrition && (
              <div className="md:col-span-2 mt-2">
                <div className="mb-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Daily Nutrition Target
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <p className="text-xs text-gray-500">Calories</p>
                    <p className="mt-1 text-lg font-bold text-blue-700">
                      {viewingNutrition.calories}
                      <span className="ml-1 text-xs font-normal">kcal</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                    <p className="text-xs text-gray-500">Protein</p>
                    <p className="mt-1 text-lg font-bold text-green-700">
                      {viewingNutrition.protein}
                      <span className="ml-1 text-xs font-normal">g</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-amber-100 bg-amber-50 p-3">
                    <p className="text-xs text-gray-500">Carbs</p>
                    <p className="mt-1 text-lg font-bold text-amber-700">
                      {viewingNutrition.carbs}
                      <span className="ml-1 text-xs font-normal">g</span>
                    </p>
                  </div>

                  <div className="rounded-lg border border-red-100 bg-red-50 p-3">
                    <p className="text-xs text-gray-500">Fat</p>
                    <p className="mt-1 text-lg font-bold text-red-700">
                      {viewingNutrition.fat}
                      <span className="ml-1 text-xs font-normal">g</span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="md:col-span-2">
              <p className="text-xs text-gray-500">Primary Diagnosis</p>
              <p className="font-semibold">
                {viewingPatient.primaryDiagnosis || "Not recorded"}
              </p>
            </div>

            <div className="md:col-span-2">
              <p className="text-xs text-gray-500">Special Instructions</p>
              <p>{viewingPatient.specialInstructions || "None"}</p>
            </div>
          </div>

          {/* Add this here: Meal Plan for Today */}
          <div className="mt-6 overflow-hidden rounded-xl border border-purple-100 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-purple-100 bg-purple-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-bold text-purple-700">
                <ClipboardList className="h-5 w-5" />
                MEAL PLAN FOR TODAY
              </div>

              {viewingPatient.dietTypeId && (
                <button
                  type="button"
                  onClick={() => {
                    setMealPlanPatient(viewingPatient);
                    setMealPlanDietId(viewingPatient.dietTypeId);
                  }}
                  className="rounded-md border border-purple-200 bg-white px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
                >
                  View Full Meal Plan
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 divide-x-0 divide-y sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6 lg:divide-x">
              {todayMealPlan.map((meal) => {
                const MealIcon = meal.icon;

                return (
                  <div
                    key={meal.name}
                    className="flex flex-col items-center px-3 py-5 text-center"
                  >
                    <MealIcon
                      className={`mb-2 h-6 w-6 ${
                        meal.completed ? "text-green-600" : "text-orange-500"
                      }`}
                    />

                    <p className="text-sm font-semibold text-gray-700">
                      {meal.name}
                    </p>

                    <p className="mt-1 text-xs font-medium text-gray-500">
                      {meal.time}
                    </p>

                    <div className="mt-3 w-full text-left">
                      {meal.foods.length ? (
                        <div className="space-y-1">
                          {meal.foods.map((food) => (
                            <div
                              key={food.name}
                              className="rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600"
                            >
                              <span className="font-semibold text-slate-700">
                                {food.name}
                              </span>{" "}
                              · {food.quantity} {food.unit}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[11px] text-slate-400">
                          No food allocated
                        </div>
                      )}
                      <div
                        className={`mt-3 flex items-center gap-1 text-xs font-semibold ${meal.completed ? "text-green-600" : meal.status === "Returned" ? "text-orange-600" : "text-slate-500"}`}
                      >
                        {meal.completed ? (
                          <>
                            <CheckCircle2 className="h-4 w-4" /> Taken
                          </>
                        ) : meal.status === "Pending" ? (
                          <>
                            <Clock className="h-4 w-4" /> Pending
                          </>
                        ) : (
                          <>
                            <Clock className="h-4 w-4" /> {meal.status}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editingPatient && (
        <Modal
          isOpen={!!editingPatient}
          onClose={() => setEditingPatient(null)}
          title="Edit Diet Plan"
          size="xl"
          footer={modalFooter(
            handleUpdate,
            () => setEditingPatient(null),
            "Update Diet Plan",
          )}
        >
          <DietForm
            formData={editingPatient}
            dietTypes={dietTypes}
            onChange={makeChangeHandler(setEditingPatient)}
            onAllergenToggle={makeAllergenToggle(setEditingPatient)}
            onDietSelect={chooseDiet(setEditingPatient)}
            readOnlyPatient
            patientHistory={{
              history: editingPatient.history,
              primaryDiagnosis: editingPatient.primaryDiagnosis,
              pastDiet: editingPatient.pastDiet || "No previous diet recorded",
            }}
            onHistoryReadMore={setFullHistory}
          />
        </Modal>
      )}

      {templateDietId && (
        <DietTemplateModal
          zIndex={60}
          diet={dietTypes.find((diet) => diet.id === Number(templateDietId))}
          mappings={mappings}
          mealTypes={mealTypes}
          foods={foods}
          allergens={
            patients.find(
              (patient) => String(patient.id) === String(templatePatientId),
            )?.allergens ||
            (editingPatient || createForm).allergens || ["None"]
          }
          patientId={templatePatientId}
          onClose={() => {
            setTemplateDietId(null);
            setTemplatePatientId(null);
          }}
          readOnly={false}
          onSave={saveTemplate}
        />
      )}
      <Modal
        isOpen={!!fullHistory}
        onClose={() => setFullHistory(null)}
        title="Past Medical History"
        size="lg"
      >
        <div className="space-y-4 text-sm leading-6 text-gray-700">
          <div className="whitespace-pre-wrap">{fullHistory?.history}</div>
          <div className="border-t pt-3">
            <div className="mb-1 text-xs font-semibold uppercase text-gray-400">
              Past diet
            </div>
            <div className="font-medium">
              {fullHistory?.pastDiet || "No previous diet recorded."}
            </div>
          </div>
        </div>
      </Modal>

      <MealPlanModal
        isOpen={!!mealPlanDietId}
        onClose={() => {
          setMealPlanDietId(null);
          setMealPlanPatient(null);
        }}
        diet={dietTypes.find((d) => Number(d.id) === Number(mealPlanDietId))}
        mappings={mappings}
        mealTypes={mealTypes}
        foods={foods}
        allergens={mealPlanPatient?.allergens || ["None"]}
        patientId={mealPlanPatient?.id || null}
      />

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deletingPatient}
        onClose={() => setDeletingPatient(null)}
        onConfirm={handleDelete}
        title="Delete Patient Record"
        message={`Delete record for ${deletingPatient?.name} (ID: ${deletingPatient?.id})? This cannot be undone.`}
      />
    </AppLayout>
  );
}
