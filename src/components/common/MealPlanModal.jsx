import Modal from "../common/Modal";
import React, { useEffect, useState } from "react";
import { getCurrentRole } from "../../lib/permissions.js";
import { getStore, KEYS, getLocalDateKey } from "../../lib/storage.js";
import { resolveDisplayUnit, resolveQuantity } from "../../lib/storage.js";
import { SEED_FOOD_MASTER } from "../../data/seeds.js";
import { loadTemplateMappings } from "../../lib/masterData.js";

const mealIcons = {
  Breakfast: "🌅",
  "Mid-Morning": "🍎",
  Lunch: "🍛",
  "Evening Snack": "☕",
  Dinner: "🌙",
  Bedtime: "🥛",
};

// Meal-slot time resolution: keep the UI unchanged while resolving the
// selected meal from the Master Data meal schedule, including Mid-Morning.
const MEAL_WINDOWS = [
  { name: "Breakfast", start: 5, end: 10, label: "07:00 - 10:00 AM" },
  { name: "Mid-Morning", start: 10, end: 12, label: "10:00 AM - 12:00 PM" },
  { name: "Lunch", start: 12, end: 15, label: "12:00 - 03:00 PM" },
  { name: "Evening Snack", start: 15, end: 17, label: "03:00 - 05:00 PM" },
  { name: "Dinner", start: 17, end: 21, label: "05:00 - 09:00 PM" },
  { name: "Bedtime", start: 21, end: 24, label: "09:00 PM - 05:00 AM" },
  { name: "Bedtime", start: 0, end: 5, label: "09:00 PM - 05:00 AM" },
];

const normalizeStatus = (status) =>
  status === "Not Eaten" ? "Returned" : status || "Pending";

// Resolve the current slot from Master Data meal times first, with the
// existing time windows as a safe fallback when Master Data is unavailable.
const getCurrentMealName = (hour, minute, mealTypes = []) => {
  const allowed = new Set([
    "Breakfast",
    "Mid-Morning",
    "Lunch",
    "Evening Snack",
    "Dinner",
    "Bedtime",
  ]);
  const masterSlots = (mealTypes || [])
    .filter((meal) => meal?.status === "Active" && allowed.has(meal?.name))
    .map((meal) => {
      const [h, m] = String(meal.time || "")
        .split(":")
        .map(Number);
      return {
        ...meal,
        minutes: Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null,
      };
    })
    .filter((meal) => meal.minutes !== null)
    .sort((a, b) => a.minutes - b.minutes);

  const nowMinutes = hour * 60 + minute;
  if (masterSlots.length) {
    // Bedtime is the overnight slot; all other slots run until the next
    // configured meal time. This keeps slot selection tied to Master Data.
    const bedtime = masterSlots.find((meal) => meal.name === "Bedtime");
    if (
      bedtime &&
      (nowMinutes >= bedtime.minutes ||
        nowMinutes < (masterSlots[0]?.minutes ?? bedtime.minutes))
    ) {
      return "Bedtime";
    }
    for (let i = 0; i < masterSlots.length; i += 1) {
      const current = masterSlots[i];
      const next = masterSlots[i + 1];
      if (
        nowMinutes >= current.minutes &&
        (!next || nowMinutes < next.minutes)
      ) {
        return current.name;
      }
    }
  }

  const slot = MEAL_WINDOWS.find(
    (item) => nowMinutes >= item.start * 60 && nowMinutes < item.end * 60,
  );
  return slot?.name || "Breakfast";
};

const getTodayKey = () => getLocalDateKey();

const ALLERGY_KEYWORDS = {
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
  Nuts: ["nut", "almond", "peanut", "cashew", "pistachio", "walnut"],
  Gluten: ["wheat", "roti", "chapati", "bread", "maida", "pasta", "gluten"],
  Seafood: ["fish", "seafood", "prawn", "shrimp", "crab", "lobster"],
  Eggs: ["egg"],
  Soy: ["soy", "soya", "tofu"],
};

const foodHasAllergy = (food, allergens) => {
  if (!food || !allergens?.length || allergens.includes("None")) return false;
  const source = [food.name, food.category, food.ingredients]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return allergens.some((allergy) =>
    (ALLERGY_KEYWORDS[allergy] || []).some((keyword) =>
      source.includes(keyword),
    ),
  );
};

export default function MealPlanModal({
  isOpen,
  onClose,
  diet,
  mappings = [],
  mealTypes = [],
  foods = [],
  onEditTemplate,
  allergens = ["None"],
  patientId = null,
}) {
  const [mealStatus, setMealStatus] = useState({});
  const [consumedQuantities, setConsumedQuantities] = useState({});
  const [todayKey, setTodayKey] = useState(getTodayKey);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [showFullPlan, setShowFullPlan] = useState(true);
  const [serviceStatus, setServiceStatus] = useState({});
  const [, setStoreVersion] = useState(0);
  const [templateMappings, setTemplateMappings] = useState([]);
  const [templateMappingError, setTemplateMappingError] = useState("");

  useEffect(() => {
    const templateId = diet?.templateId ?? diet?.id;
    if (!isOpen || templateId == null || templateId === "") {
      setTemplateMappings([]);
      setTemplateMappingError("");
      return undefined;
    }

    let active = true;
    loadTemplateMappings(templateId, diet?.dietTypeId ?? diet?.id)
      .then((loadedMappings) => {
        if (active) {
          setTemplateMappings(loadedMappings);
          setTemplateMappingError("");
        }
      })
      .catch((error) => {
        if (active) {
          setTemplateMappings([]);
          setTemplateMappingError(
            error?.message || "Unable to load this template's meal items.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [isOpen, diet?.templateId, diet?.id, diet?.dietTypeId]);

  useEffect(() => {
    const refresh = () => setStoreVersion((version) => version + 1);
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dietcare-store-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const day = getTodayKey();
    setTodayKey(day);
    try {
      const sharedMealStatus = getStore("hd_meal_status", {}) || {};
      const dayStatuses = {};
      Object.entries(sharedMealStatus).forEach(([key, value]) => {
        const prefix = `${day}-${patientId}-`;
        if (String(key).startsWith(prefix))
          dayStatuses[String(key).slice(prefix.length)] = value;
      });
      setServiceStatus(dayStatuses);
      const intake = patientId
        ? getStore(`hd_meal_intake_${patientId}_${day}`, null)
        : null;
      const syncedStatuses = {};
      const syncedConsumed = {};
      (intake?.foodItems || []).forEach((item) => {
        const mapping = mappings.find(
          (m) =>
            Number(m.dietTypeId) === Number(diet?.id) &&
            String(m.mealName || "").toLowerCase() ===
              String(item.meal || "").toLowerCase(),
        );
        const mealType = mealTypes.find(
          (m) =>
            String(m.name || "").toLowerCase() ===
            String(item.meal || "").toLowerCase(),
        );
        const mapRecord =
          mapping ||
          mappings.find(
            (m) =>
              Number(m.dietTypeId) === Number(diet?.id) &&
              Number(m.mealTypeId) === Number(mealType?.id),
          );
        const mealId = mapRecord?.id;
        const key = `${patientId || "diet"}-${mealId}-${item.foodId}`;
        syncedStatuses[key] =
          item.foodStatus === "Eaten"
            ? "Full Eaten"
            : item.foodStatus === "Partially Eaten"
              ? "Half Eaten"
              : item.foodStatus === "Returned" ||
                  item.foodStatus === "Not Eaten"
                ? "Returned"
                : syncedStatuses[key];
      });
      setMealStatus(syncedStatuses);
      setConsumedQuantities(syncedConsumed);
    } catch {
      setMealStatus({});
      setConsumedQuantities({});
    }
  }, [patientId, diet?.id, todayKey]);

  useEffect(() => {
    const refreshSharedStatus = () => {
      const day = getTodayKey();
      const shared = getStore("hd_meal_status", {}) || {};
      const next = {};
      Object.entries(shared).forEach(([key, value]) => {
        const prefix = `${day}-${patientId}-`;
        if (String(key).startsWith(prefix))
          next[String(key).slice(prefix.length)] = value;
      });
      setServiceStatus(next);
    };
    window.addEventListener("dietcare-store-updated", refreshSharedStatus);
    window.addEventListener("storage", refreshSharedStatus);
    return () => {
      window.removeEventListener("dietcare-store-updated", refreshSharedStatus);
      window.removeEventListener("storage", refreshSharedStatus);
    };
  }, [patientId, todayKey]);

  useEffect(() => {
    const timer = setInterval(() => {
      const day = getTodayKey();
      if (day !== todayKey) setTodayKey(day);
    }, 60000);
    return () => clearInterval(timer);
  }, [todayKey]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const approvedPlan = patientId
    ? (getStore("hd_diet_plans", []) || []).find(
        (plan) =>
          String(plan.patientId) === String(patientId) &&
          Number(plan.dietTypeId) === Number(diet?.id) &&
          String(plan.status).toLowerCase() === "approved",
      ) ||
      (getStore("hd_diet_plans", []) || []).find(
        (plan) =>
          String(plan.patientId) === String(patientId) &&
          Number(plan.dietTypeId) === Number(diet?.id),
      )
    : null;
  const patient = patientId
    ? (getStore(KEYS.PATIENTS) || []).find(
        (item) => String(item.id) === String(patientId),
      )
    : null;
  const todayIntake = patientId
    ? getStore(`hd_meal_intake_${patientId}_${getTodayKey()}`, null)
    : null;

  if (!diet) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Meal Plan">
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Meal plan details are not available because the selected diet template
          is missing from Master Data.
        </div>
      </Modal>
    );
  }

  const currentMealName = getCurrentMealName(
    currentTime.getHours(),
    currentTime.getMinutes(),
    mealTypes,
  );
  const currentRole = getCurrentRole();
  const isDietitian = ["DIETITIAN", "ADMIN"].includes(currentRole);

  // TEMPLATE RESOLUTION: tolerate mappings created by either the Master Template editor
  // or older saved records (numeric IDs, string IDs, or embedded food objects).
  const selectedTemplateId = diet.templateId ?? diet.id;
  const availableMappings = [
    ...mappings.filter(
      (mapping) =>
        mapping.dietTemplateId == null ||
        Number(mapping.dietTemplateId) !== Number(selectedTemplateId),
    ),
    ...templateMappings,
  ];
  const mealPlan = availableMappings
    .filter((mapping) =>
      mapping.dietTemplateId != null
        ? Number(mapping.dietTemplateId) === Number(selectedTemplateId)
        : Number(mapping.dietTypeId) === Number(diet.dietTypeId ?? diet.id),
    )
    .map((mapping) => {
      const mealType =
        mealTypes.find(
          (item) => Number(item.id) === Number(mapping.mealTypeId),
        ) ||
        mealTypes.find(
          (item) =>
            String(item.name || "").toLowerCase() ===
            String(mapping.mealName || "").toLowerCase(),
        );
      const rawFoodItems = Array.isArray(mapping.foodItems)
        ? mapping.foodItems
        : [];
      const foodItems = rawFoodItems
        .map((entry) => {
          const foodId =
            typeof entry === "object" ? (entry?.foodId ?? entry?.id) : entry;
          const food = foods.find((item) => Number(item.id) === Number(foodId));
          if (!food) return null;
          const quantity =
            (typeof entry === "object" ? entry?.quantity : null) ??
            mapping.quantityTexts?.[foodId] ??
            mapping.quantities?.[foodId] ??
            food.standardQuantity ??
            "";
          const unit =
            (typeof entry === "object" ? entry?.unit : null) ||
            mapping.units?.[foodId] ||
            food.unit ||
            "";
          return {
            foodId: Number(food.id),
            food,
            quantity,
            unit,
            allergyConflict: foodHasAllergy(food, allergens),
          };
        })
        .filter(Boolean);
      return {
        ...mapping,
        mealTypeId: Number(mapping.mealTypeId || mealType?.id || 0),
        mealType,
        foodItems,
      };
    })
    .filter((meal) => meal.mealType?.name || meal.foodItems.length)
    .sort((a, b) => Number(a.mealTypeId) - Number(b.mealTypeId));

  const mealHistory = mealPlan.map((meal) => {
    const mealType =
      meal.mealType ||
      mealTypes.find((m) => Number(m.id) === Number(meal.mealTypeId));
    const items = (meal.foodItems || []).map((allocated) => {
      const key = `${patientId || "diet"}-${meal.id}-${allocated.foodId}`;
      return {
        food: allocated.food,
        quantity: allocated.quantity,
        unit: allocated.unit,
        allergyConflict: allocated.allergyConflict,
        status: normalizeStatus(mealStatus[key]),
      };
    });

    const counts = items.reduce(
      (acc, item) => {
        if (item.status === "Full Eaten") acc.full += 1;
        else if (item.status === "Half Eaten") acc.half += 1;
        else if (item.status === "Returned") acc.returned += 1;
        else acc.pending += 1;
        return acc;
      },
      { full: 0, half: 0, returned: 0, pending: 0 },
    );

    const summary = items.length
      ? counts.full === items.length
        ? "Full Eaten"
        : counts.returned > 0
          ? "Returned"
          : counts.half > 0
            ? "Partially Eaten"
            : "Pending"
      : "No items";

    return {
      ...meal,
      mealType,
      items,
      counts,
      summary,
    };
  });

  const currentMealHistory = mealHistory.find(
    (meal) => meal.mealType?.name === currentMealName,
  );

  const visibleMeals =
    showFullPlan || !currentMealHistory || currentMealHistory.items.length === 0
      ? mealPlan
      : mealPlan.filter(
          (meal) =>
            mealTypes.find((m) => m.id === meal.mealTypeId)?.name ===
            currentMealName,
        );

  const mealHistoryTotals = mealHistory.reduce(
    (acc, meal) => ({
      full: acc.full + meal.counts.full,
      half: acc.half + meal.counts.half,
      returned: acc.returned + meal.counts.returned,
      pending: acc.pending + meal.counts.pending,
    }),
    { full: 0, half: 0, returned: 0, pending: 0 },
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="xl"
      title={`${diet.name} Meal Plan`}
      footer={
        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="rounded-md border px-4 py-2 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {templateMappingError && (
          <div
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
          >
            {templateMappingError}
          </div>
        )}
        <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-lg font-bold text-blue-700">{diet.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{diet.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowFullPlan((current) => !current)}
                className="rounded-md border border-blue-200 bg-white px-4 py-2 text-sm text-blue-700 hover:bg-blue-50"
              >
                {showFullPlan ? "Show Current Slot" : "Show Full Plan"}
              </button>
              {isDietitian && onEditTemplate && (
                <button
                  type="button"
                  onClick={() => onEditTemplate(diet.id)}
                  className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 hover:bg-yellow-100"
                >
                  Review Template
                </button>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-600 mt-1">
            This view surfaces the current meal slot and the latest consumption
            history for the selected diet template.
          </p>
        </div>

        {patientId && (
          <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-emerald-700">Diet Plan</p>
                <p className="font-semibold text-slate-900">
                  {approvedPlan?.planName || diet.name}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">Patient Taste</p>
                <p className="font-semibold text-slate-900">
                  {approvedPlan?.patientTasteRemark || "No preference recorded"}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">Spice / Temperature</p>
                <p className="font-semibold text-slate-900">
                  {approvedPlan?.spiceLevel || "Normal"} •{" "}
                  {approvedPlan?.foodTemperature || "Warm"}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">Allergies</p>
                <p className="font-semibold text-slate-900">
                  {patient?.allergens?.join(", ") || "None recorded"}
                </p>
              </div>
              <div>
                <p className="text-xs text-emerald-700">Meal Service</p>
                <p className="font-semibold text-slate-900">
                  {serviceStatus[currentMealName] || "Pending"}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-xs text-emerald-700">
                  Latest Caregiver / Intake Remark
                </p>
                <p className="font-semibold text-slate-900">
                  {todayIntake?.remarks || "No intake remark recorded today"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [
              "Full Eaten",
              currentMealHistory?.counts.full || 0,
              "bg-emerald-100 text-emerald-700",
            ],
            [
              "Half Eaten",
              currentMealHistory?.counts.half || 0,
              "bg-amber-100 text-amber-700",
            ],
            [
              "Returned",
              currentMealHistory?.counts.returned || 0,
              "bg-rose-100 text-rose-700",
            ],
            [
              "Pending",
              currentMealHistory?.counts.pending || 0,
              "bg-slate-100 text-slate-700",
            ],
          ].map(([label, value, badgeClass]) => (
            <div
              key={label}
              className="rounded-lg border border-slate-200 bg-white p-3"
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">
                {label}
              </p>
              <p className={`mt-2 text-2xl font-semibold ${badgeClass}`}>
                {value}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">
                Meal History Summary
              </p>
              <p className="mt-1 text-sm text-slate-700">
                Showing consumption totals for all meal slots in this diet plan.
              </p>
            </div>
            <div className="text-right text-xs text-slate-600">
              Current slot:{" "}
              <span className="font-semibold">{currentMealName}</span>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {mealHistory.map((meal) => (
              <div
                key={meal.id}
                className="rounded-lg border border-slate-200 bg-white p-3"
              >
                <p className="text-sm font-semibold text-slate-900">
                  {meal.mealType?.name || "Unknown"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{meal.summary}</p>
                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
                  <span className="rounded-full bg-emerald-100 px-2 py-1">
                    Full {meal.counts.full}
                  </span>
                  <span className="rounded-full bg-amber-100 px-2 py-1">
                    Half {meal.counts.half}
                  </span>
                  <span className="rounded-full bg-rose-100 px-2 py-1">
                    Returned {meal.counts.returned}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-1">
                    Pending {meal.counts.pending}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {!showFullPlan && !currentMealHistory?.items.length && (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-sm text-orange-700">
            No mapping found for the current meal slot ({currentMealName}).
            Showing the full diet plan below.
          </div>
        )}

        {visibleMeals.map((meal) => {
          const mealType =
            meal.mealType ||
            mealTypes.find((m) => Number(m.id) === Number(meal.mealTypeId));

          return (
            <div key={meal.id} className="rounded-lg border p-4">
              <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <span>{mealIcons[mealType?.name] || "🍽️"}</span>

                {mealType?.name}
              </h4>

              <div className="hidden grid-cols-10 gap-4 rounded-md bg-gray-100 px-4 py-2 text-xs font-semibold uppercase text-gray-600 sm:grid">
                <div className="col-span-3">Food Item</div>
                <div className="col-span-2">Planned Quantity</div>
                <div className="col-span-2">Unit</div>
                <div className="col-span-3 text-center">Intake Status</div>
                {/*  <div className="col-span-2">Remarks</div> */}
              </div>

              <div className="space-y-2">
                {meal.foodItems?.length ? (
                  meal.foodItems.map((allocated) => {
                    const food = allocated.food;
                    const foodId = allocated.foodId;
                    const key = `${patientId || "diet"}-${meal.id}-${foodId}`;
                    const qty = resolveQuantity(
                      allocated.quantity,
                      food?.standardQuantity,
                    );
                    const seedFood = SEED_FOOD_MASTER.find(
                      (item) => Number(item.id) === Number(foodId),
                    );
                    const displayUnit = resolveDisplayUnit(
                      allocated.unit,
                      food?.unit,
                      seedFood?.unit,
                      qty,
                      seedFood?.standardQuantity,
                    );
                    const consumed = consumedQuantities[key] ?? "";
                    return (
                      <div
                        key={foodId}
                        className={`grid grid-cols-1 items-start gap-3 rounded-lg border px-4 py-3 shadow-sm sm:grid-cols-10 sm:items-center sm:gap-4 ${allocated.allergyConflict ? "border-rose-300 bg-rose-50" : "border-gray-200 bg-white"}`}
                      >
                        <div className="sm:col-span-3">
                          <p className="font-medium text-gray-800">
                            {food?.name}
                          </p>
                          {allocated.allergyConflict && (
                            <p className="text-xs font-semibold text-rose-600">
                              Allergy conflict — do not serve
                            </p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-gray-700 font-medium">
                            {qty ?? "Not Configured"}
                          </span>
                        </div>
                        <div className="sm:col-span-2 text-gray-700">
                          {displayUnit || "Not Configured"}
                        </div>
                        <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                          {["Full Eaten", "Half Eaten", "Returned"].map(
                            (value) => {
                              const saved = mealStatus[key];
                              const selectedStatus =
                                saved === "Not Eaten" ? "Returned" : saved;
                              return (
                                <label
                                  key={value}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <input
                                    type="radio"
                                    name={key}
                                    value={value}
                                    checked={selectedStatus === value}
                                    onChange={() =>
                                      setMealStatus({
                                        ...mealStatus,
                                        [key]: value,
                                      })
                                    }
                                  />
                                  {value}
                                </label>
                              );
                            },
                          )}
                        </div>
                        <div className="sm:col-span-10 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>Consumed:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={consumed}
                            disabled={!qty}
                            onChange={(event) =>
                              setConsumedQuantities({
                                ...consumedQuantities,
                                [key]: event.target.value,
                              })
                            }
                            className="w-20 rounded border px-2 py-1 text-right disabled:bg-slate-100"
                          />
                          {allocated.quantity && (
                            <span>
                              of {allocated.quantity} {displayUnit}
                            </span>
                          )}
                          {(() => {
                            const record = todayIntake?.foodItems?.find(
                              (item) =>
                                item.meal === (mealType?.name || "") &&
                                Number(item.foodId) === Number(foodId),
                            );
                            return record ? (
                              <span className="ml-2 font-semibold text-slate-700">
                                Status: {record.foodStatus}
                                {record.foodRemark
                                  ? ` · ${record.foodRemark}`
                                  : ""}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-gray-400">No food assigned</div>
                )}
              </div>

              {meal.instructions && (
                <div className="mt-3 text-sm text-blue-700">
                  <strong>Instructions:</strong> {meal.instructions}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
