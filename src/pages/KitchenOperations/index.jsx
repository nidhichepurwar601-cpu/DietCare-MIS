import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";
import {
  ChefHat,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Truck,
  CheckCircle2,
  Download,
} from "lucide-react";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  syncWorkflowFromMealStatuses,
  getLocalDateKey,
} from "../../lib/storage.js";

const MEALS = [
  "Early Morning",
  "Breakfast",
  "Mid-Morning",
  "Lunch",
  "Evening Snack",
  "Dinner",
  "Bedtime",
];
const FLOW_KEY = "hd_diet_workflow";
const PLAN_KEY = "hd_diet_plans";
const MAPPING_KEY = "hd_diet_mapping";
const MEAL_STATUS_KEY = "hd_meal_status";
const PACKING_STATUS_KEY = "hd_meal_packing_status";
const PREPARATION_ITEM_STATUS_KEY = "hd_kitchen_preparation_item_status";
const PREPARATION_ITEM_STATES = ["Pending", "Preparing", "Prepared", "Packed"];

// MASTER-DATA MEAL CLOCK: kitchen shows only the meal currently scheduled in Meal Master.
const getCurrentMeal = (mealTypes) => {
  const active = mealTypes
    .filter((m) => {
      const status = m.status;
      const active =
        status === undefined ||
        status === null ||
        status === "" ||
        status === true ||
        Number(status) === 0 ||
        String(status).toLowerCase() === "active";
      return active && MEALS.includes(m.name);
    })
    .map((m) => ({
      ...m,
      minutes:
        Number(String(m.time || "00:00").split(":")[0]) * 60 +
        Number(String(m.time || "00:00").split(":")[1] || 0),
    }))
    .sort((a, b) => a.minutes - b.minutes);
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let chosen = active[0]?.name || "Breakfast";
  active.forEach((m) => {
    if (m.minutes <= mins) chosen = m.name;
  });
  return chosen;
};

// KITCHEN OPERATIONS: intentionally compact. Only planned patient meals are shown here.
// The kitchen prepares the current scheduled meal; delivery staff handle delivery.
export default function KitchenOperations() {
  const location = useLocation();
  const deliveryMode = location.pathname === "/meal-delivery";
  const [serviceDate, setServiceDate] = useState(() => getLocalDateKey());
  const [mealFilter, setMealFilter] = useState("Breakfast");
  const [openRows, setOpenRows] = useState(() => new Set());
  const [selectedPatients, setSelectedPatients] = useState(() => new Set());
  const [mealStatus, setMealStatus] = useState(
    () => getStore(MEAL_STATUS_KEY, {}) || {},
  );
  const [packingStatus, setPackingStatus] = useState(
    () => getStore(PACKING_STATUS_KEY, {}) || {},
  );
  // Item-level kitchen status. Unlike the patient meal status, this tracks
  // each aggregated food item shown in the preparation table.
  const [preparationItemStatus, setPreparationItemStatus] = useState(
    () => getStore(PREPARATION_ITEM_STATUS_KEY, {}) || {},
  );
  const [, refresh] = useState(0);
  const [screenReady, setScreenReady] = useState(false);
  const [screenError, setScreenError] = useState("");

  useEffect(() => {
    const update = () => {
      try {
        setScreenError("");
        setMealStatus(getStore(MEAL_STATUS_KEY, {}) || {});
        setPackingStatus(getStore(PACKING_STATUS_KEY, {}) || {});
        setPreparationItemStatus(
          getStore(PREPARATION_ITEM_STATUS_KEY, {}) || {},
        );
        refresh((v) => v + 1);
        setScreenReady(true);
      } catch (error) {
        console.error("Kitchen screen refresh failed", error);
        setScreenError("Kitchen data could not be loaded.");
        setScreenReady(true);
      }
    };
    update();
    window.addEventListener("dietcare-store-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("dietcare-store-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  const patients = getStore(KEYS.PATIENTS) || [];
  const diets = getStore(KEYS.DIET_TYPES) || [];
  const foods = getStore(KEYS.FOOD_MASTER) || [];
  const mappings = getStore(MAPPING_KEY, []) || [];
  const flows = getStore(FLOW_KEY, []) || [];
  const plans = getStore(PLAN_KEY, []) || [];
  const mealTypes = getStore(KEYS.MEAL_TYPES) || [];
  const currentMeal = getCurrentMeal(mealTypes);
  useEffect(() => {
    setMealFilter(currentMeal);
  }, [currentMeal]);

  const mealName = (id) =>
    mealTypes.find((m) => Number(m.id) === Number(id))?.name || "";
  const dietName = (id) =>
    diets.find((d) => Number(d.id) === Number(id))?.name || "Diet Not Assigned";
  const allergyText = (patient) => {
    const values = Array.isArray(patient?.allergens)
      ? patient.allergens.filter((x) => x && x !== "None")
      : [];
    return values.length ? values.join(", ") : "None";
  };

  // Frontend-only quantity normalization. Master/API values are left untouched;
  // this simply lets the kitchen calculate totals when a quantity arrives as
  // "2", "2 pieces", "150 g", "1.5", or "1/2".
  const toNumericQuantity = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = String(value ?? "").trim();
    if (!text) return 0;

    const fraction = text.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      return denominator ? numerator / denominator : 0;
    }

    const number = text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
    return number ? Number(number[0]) : 0;
  };

  const formatQuantity = (value) => {
    const number = Number(value || 0);
    return Number.isInteger(number)
      ? String(number)
      : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };

  const formatQuantityBreakdown = (items = []) => {
    const grouped = items.reduce((acc, item) => {
      const unit = String(item.unit || "unit").trim() || "unit";
      const quantity = toNumericQuantity(item.quantity);
      acc[unit] = (acc[unit] || 0) + quantity;
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([unit, quantity]) => `${formatQuantity(quantity)} ${unit}`)
      .join(" • ");
  };

  const approved = useMemo(
    () =>
      flows.filter((f) => {
        if (!f.dietTypeId) return false;
        if (
          ![
            "Planning",
            "Assigned",
            "Approved",
            "Preparing",
            "Prepared",
            "Delivering",
            "Delivered",
          ].includes(f.status)
        ) {
          return false;
        }
        const plan =
          plans.find((p) => String(p.id) === String(f.planId)) ||
          plans.find((p) => String(p.patientId) === String(f.patientId));
        const start = plan?.startDate || f.startDate;
        const end = plan?.endDate || f.endDate || start;
        if (start && serviceDate < String(start)) return false;
        if (end && serviceDate > String(end)) return false;
        return true;
      }),
    [flows, plans, serviceDate],
  );

  const rows = useMemo(
    () =>
      approved
        .map((flow) => {
          const patient = patients.find(
            (p) => String(p.id) === String(flow.patientId),
          );
          if (!patient || (patient.status || "Active") !== "Active")
            return null;
          const plan =
            plans.find((p) => String(p.patientId) === String(patient.id)) || {};
          const dietTypeId = Number(
            flow.dietTypeId || plan.dietTypeId || patient.dietTypeId,
          );
          const planName =
            flow.planName || plan.planName || dietName(dietTypeId);
          const mealRows = mappings
            .filter(
              (m) =>
                Number(m.dietTypeId) === dietTypeId ||
                Number(m.dietTemplateId) ===
                Number(flow.dietTemplateId || plan.dietTemplateId),
            )
            .map((mapping) => {
              const meal =
                mealName(mapping.mealTypeId) || mapping.mealName || "";
              if (!meal || !MEALS.includes(meal)) return null;
              const items = (mapping.foodItems || [])
                .map((entry) => {
                  const foodId =
                    typeof entry === "object"
                      ? (entry?.foodId ?? entry?.id)
                      : entry;
                  const food = foods.find(
                    (f) => Number(f.id) === Number(foodId),
                  );
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
                  return { name: food.name, quantity, unit };
                })
                .filter(Boolean);
              return {
                meal,
                items,
                remark:
                  mapping.instructions ||
                  plan.planningRemarks ||
                  plan.patientTasteRemark ||
                  flow.patientTasteRemark ||
                  patient.patientTasteRemark ||
                  "",
              };
            })
            .filter(Boolean);
          return {
            patient,
            flow,
            plan,
            dietTypeId,
            planName,
            mealRows,
            taste:
              flow.patientTasteRemark ||
              plan.patientTasteRemark ||
              patient.patientTasteRemark ||
              "",
            spice:
              flow.spiceLevel ||
              plan.spiceLevel ||
              patient.spiceLevel ||
              "Normal",
            temperature:
              flow.foodTemperature ||
              plan.foodTemperature ||
              patient.foodTemperature ||
              "Warm",
          };
        })
        .filter(Boolean),
    [approved, patients, plans, mappings, foods, mealTypes, diets],
  );

  const getStatus = (patientId, meal) =>
    mealStatus[`${serviceDate}-${patientId}-${meal}`] ||
    mealStatus[`${patientId}-${meal}`] ||
    "Pending";

  const kitchenPreparationSummary = React.useMemo(() => {
    const meal = mealFilter;
    if (!meal) {
      return {
        meal: "",
        meals: 0,
        items: 0,
        pending: 0,
        preparing: 0,
        prepared: 0,
        packed: 0,
        quantities: [],
      };
    }

    const mealRows = rows.filter((row) =>
      row.mealRows?.some((m) => m.meal === meal),
    );

    const counts = {
      pending: 0,
      preparing: 0,
      prepared: 0,
      packed: 0,
    };

    mealRows.forEach((row) => {
      const status = getStatus(row.patient.id, meal);
      if (status === "Pending") counts.pending += 1;
      else if (status === "Preparing") counts.preparing += 1;
      else if (status === "Prepared") counts.prepared += 1;
      else if (status === "Packed") counts.packed += 1;
    });

    const quantityMap = {};
    mealRows.forEach((row) => {
      const mealRow = row.mealRows?.find((m) => m.meal === meal);
      const items =
        mealRow?.items || mealRow?.foodItems || mealRow?.mealItems || [];
      if (!Array.isArray(items)) return;

      items.forEach((item) => {
        const name = item?.name || item?.itemName || item?.foodName;
        if (!name) return;
        const qty = Number(item?.quantity ?? item?.qty ?? item?.amount ?? 0);
        const uom = String(
          item?.uom ?? item?.unit ?? item?.unitOfMeasure ?? "",
        ).trim();
        const key = `${name}__${uom}`;
        if (!quantityMap[key]) quantityMap[key] = { name, quantity: 0, uom };
        if (Number.isFinite(qty)) quantityMap[key].quantity += qty;
      });
    });

    return {
      meal,
      meals: mealRows.length,
      items: Object.keys(quantityMap).length,
      ...counts,
      quantities: Object.values(quantityMap),
    };
  }, [rows, mealFilter, mealStatus, packingStatus]);

  const getPackingStatus = (patientId, meal) =>
    packingStatus[`${serviceDate}-${patientId}-${meal}`] ||
    packingStatus[`${patientId}-${meal}`] ||
    "Pending";

  const preparationItemKey = (meal, item) =>
    `${serviceDate}-${meal}-${item.name}-${item.unit || ""}`;

  const getPreparationItemStatus = (meal, item) => {
    const key = preparationItemKey(meal, item);
    const storedStatus = preparationItemStatus[key];

    // If Pack All Orders has packed this item,
    // always show Packed.
    if (storedStatus === "Packed") {
      return "Packed";
    }

    // If an item already has a saved status,
    // use that status.
    if (storedStatus) {
      return storedStatus;
    }

    // If any patient for this meal is currently preparing,
    // show the item as Preparing.
    const hasPreparing = rows.some(
      (row) =>
        row.mealRows.some((m) => m.meal === meal) &&
        getStatus(row.patient.id, meal) === "Preparing",
    );

    if (hasPreparing) {
      return "Preparing";
    }

    // If any patient meal is Prepared / Packed / Delivering / Delivered,
    // the food item is at least Prepared.
    const hasPrepared = rows.some(
      (row) =>
        row.mealRows.some((m) => m.meal === meal) &&
        ["Prepared", "Packed", "Delivering", "Delivered"].includes(
          getStatus(row.patient.id, meal),
        ),
    );

    if (hasPrepared) {
      return "Prepared";
    }

    return "Pending";
  };

  const statusClass = (status) => {
    if (status === "Preparing")
      return "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100";
    if (status === "Prepared")
      return "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100";
    if (status === "Packed")
      return "border-green-200 bg-green-50 text-green-700 hover:bg-green-100";
    return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
  };

  const nextPreparationItemStatus = (status) => {
    const index = PREPARATION_ITEM_STATES.indexOf(status);
    return index >= 0 && index < PREPARATION_ITEM_STATES.length - 1
      ? PREPARATION_ITEM_STATES[index + 1]
      : status;
  };

  const advancePreparationItem = (meal, item) => {
    const current = getPreparationItemStatus(meal, item);

    // Packed is deliberately not advanced automatically. It can only be
    // corrected backwards through the explicit confirmation below.
    if (current === "Packed") {
      resetPackedPreparationItem(meal, item);
      return;
    }

    const next = nextPreparationItemStatus(current);
    if (next === current) return;

    const key = preparationItemKey(meal, item);
    const nextItemStatus = { ...preparationItemStatus, [key]: next };

    setPreparationItemStatus(nextItemStatus);
    setStore(PREPARATION_ITEM_STATUS_KEY, nextItemStatus);

    // Starting any kitchen item means this meal has entered preparation.
    // Keep the patient-level meal status in sync with the item-level UI.
    if (next === "Preparing" && current === "Pending") {
      let nextMealStatus = { ...mealStatus };
      rows.forEach((row) => {
        if (!row.mealRows.some((m) => m.meal === meal)) return;
        const mealKey = `${serviceDate}-${row.patient.id}-${meal}`;
        const previous =
          nextMealStatus[mealKey] ||
          nextMealStatus[`${row.patient.id}-${meal}`] ||
          "Pending";
        if (["Pending", "Assigned", "Planning"].includes(previous)) {
          nextMealStatus[mealKey] = "Preparing";
        }
      });
      persistMealStatuses(nextMealStatus);
      rows.forEach((row) => {
        if (row.mealRows.some((m) => m.meal === meal)) {
          syncFlow(row.patient.id, nextMealStatus);
        }
      });
    }

    appendHistoryEvent({
      type: "kitchen",
      module: "Kitchen Operations",
      action: "Food Item Status Changed",
      meal,
      foodItem: item.name,
      fromStatus: current,
      toStatus: next,
      serviceDate,
    });

    const group = preparationGroups.find((g) => g.meal === meal);
    const getNextGroupStatus = (groupItem) =>
      nextItemStatus[preparationItemKey(meal, groupItem)] ||
      getPreparationItemStatus(meal, groupItem);

    const allItemsPrepared =
      group?.items?.length > 0 &&
      group.items.every(
        (groupItem) => getNextGroupStatus(groupItem) === "Prepared",
      );

    const allItemsPacked =
      group?.items?.length > 0 &&
      group.items.every(
        (groupItem) => getNextGroupStatus(groupItem) === "Packed",
      );

    if (allItemsPrepared) {
      markMealPrepared(meal, nextItemStatus);
    }

    if (allItemsPacked) {
      markMealPacked(meal, nextItemStatus);
    }
  };

  const visibleRows = rows
    .map((row) => ({
      ...row,
      mealRows: row.mealRows.filter(
        (m) => mealFilter === "All Meals" || m.meal === mealFilter,
      ),
    }))
    .map((row) => ({
      ...row,
      mealRows: deliveryMode
        ? row.mealRows.filter((m) =>
          ["Packed", "Delivering", "Delivered"].includes(
            getStatus(row.patient.id, m.meal),
          ),
        )
        : row.mealRows,
    }))
    .filter((row) => row.mealRows.length);

  // Primary kitchen output: item-wise totals across all planned patients,
  // grouped by every meal type from the Meal Types master and then by food item.
  const preparationTotals = useMemo(() => {
    const totals = new Map();
    rows.forEach((row) => {
      row.mealRows.forEach((mealRow) => {
        if (!MEALS.includes(mealRow.meal)) return;
        mealRow.items.forEach((item) => {
          const numericQuantity = toNumericQuantity(item.quantity);
          const key = `${mealRow.meal}__${item.name}__${item.unit || ""}`;
          const current = totals.get(key) || {
            meal: mealRow.meal,
            name: item.name,
            unit: item.unit || "",
            quantity: 0,
            perMeal: numericQuantity,
            patients: 0,
          };
          current.quantity += numericQuantity;
          current.patients += 1;
          totals.set(key, current);
        });
      });
    });
    return Array.from(totals.values()).sort(
      (a, b) => a.meal.localeCompare(b.meal) || a.name.localeCompare(b.name),
    );
  }, [rows]);

  const preparationMealCounts = useMemo(() => {
    const counts = Object.fromEntries(MEALS.map((meal) => [meal, new Set()]));
    rows.forEach((row) => {
      row.mealRows.forEach((mealRow) => {
        if (counts[mealRow.meal])
          counts[mealRow.meal].add(String(row.patient.id));
      });
    });
    return Object.fromEntries(MEALS.map((meal) => [meal, counts[meal].size]));
  }, [rows]);

  const preparationGroups = useMemo(
    () =>
      MEALS.map((meal) => ({
        meal,
        count: preparationMealCounts[meal] || 0,
        items: preparationTotals.filter((item) => item.meal === meal),
      })),
    [preparationMealCounts, preparationTotals],
  );

  const persistMealStatuses = (next) => {
    setMealStatus(next);
    setStore(MEAL_STATUS_KEY, next);
  };

  const persistPackingStatuses = (next) => {
    setPackingStatus(next);
    setStore(PACKING_STATUS_KEY, next);
  };

  const moveToNextPlannedMeal = (meal) => {
    const currentIndex = MEALS.indexOf(meal);
    const nextMeal = MEALS.slice(currentIndex + 1).find(
      (nextMealType) => (preparationMealCounts[nextMealType] || 0) > 0,
    );
    if (nextMeal) setMealFilter(nextMeal);
  };

  const markMealPreparing = (meal) => {
    let next = { ...mealStatus };
    let changed = 0;

    rows.forEach((row) => {
      const mealRow = row.mealRows.find((m) => m.meal === meal);
      if (!mealRow) return;

      const key = `${serviceDate}-${row.patient.id}-${meal}`;
      const previous =
        next[key] || next[`${row.patient.id}-${meal}`] || "Pending";

      if (!["Pending", "Assigned", "Planning"].includes(previous)) return;

      next[key] = "Preparing";
      changed += 1;
    });

    if (!changed) return;

    const group = preparationGroups.find((g) => g.meal === meal);
    const nextItemStatus = { ...preparationItemStatus };

    (group?.items || []).forEach((item) => {
      const key = preparationItemKey(meal, item);
      if (nextItemStatus[key] !== "Packed") {
        nextItemStatus[key] = "Preparing";
      }
    });

    setPreparationItemStatus(nextItemStatus);
    setStore(PREPARATION_ITEM_STATUS_KEY, nextItemStatus);
    persistMealStatuses(next);

    rows.forEach((row) => {
      if (row.mealRows.some((m) => m.meal === meal)) {
        syncFlow(row.patient.id, next);
      }
    });
  };

  // Mark the meal as Prepared only after every food item has reached Prepared.
  // IMPORTANT: this does not pack the meal.
  const markMealPrepared = (
    meal,
    itemStatusOverride = preparationItemStatus,
  ) => {
    const group = preparationGroups.find((g) => g.meal === meal);
    if (!group?.items?.length) return;

    const allItemsPrepared = group.items.every(
      (item) =>
        (itemStatusOverride[preparationItemKey(meal, item)] ||
          getPreparationItemStatus(meal, item)) === "Prepared",
    );
    if (!allItemsPrepared) return;

    let next = { ...mealStatus };
    let changed = 0;

    rows.forEach((row) => {
      const mealRow = row.mealRows.find((m) => m.meal === meal);
      if (!mealRow) return;

      const key = `${serviceDate}-${row.patient.id}-${meal}`;
      const previous =
        next[key] || next[`${row.patient.id}-${meal}`] || "Pending";

      if (previous !== "Preparing") return;

      next[key] = "Prepared";
      changed += 1;
    });

    if (!changed) return;

    persistMealStatuses(next);

    rows.forEach((row) => {
      if (row.mealRows.some((m) => m.meal === meal)) {
        syncFlow(row.patient.id, next);
      }
    });
  };

  // Pack only after all aggregated food items have reached Prepared.
  // Once packed, the kitchen automatically advances to the next planned meal.
  // Pack all orders only after every food item is Prepared.
  const markMealPacked = (meal) => {
    const group = preparationGroups.find((g) => g.meal === meal);

    if (!group?.items?.length) return;

    // Check that every food item is Prepared.
    const allItemsPrepared = group.items.every(
      (item) => getPreparationItemStatus(meal, item) === "Prepared",
    );

    if (!allItemsPrepared) return;

    // =====================================================
    // 1. Change every food item: Prepared -> Packed
    // =====================================================
    const nextItemStatus = { ...preparationItemStatus };

    group.items.forEach((item) => {
      const key = preparationItemKey(meal, item);
      nextItemStatus[key] = "Packed";
    });

    setPreparationItemStatus(nextItemStatus);
    setStore(PREPARATION_ITEM_STATUS_KEY, nextItemStatus);

    // =====================================================
    // 2. Change every patient meal: Prepared -> Packed
    // =====================================================
    const nextMealStatus = { ...mealStatus };
    const nextPackingStatus = { ...packingStatus };

    rows.forEach((row) => {
      const mealRow = row.mealRows.find((m) => m.meal === meal);

      if (!mealRow) return;

      // Don't modify discharged patients
      if (String(row.patient?.status || "").toLowerCase() === "discharged") {
        return;
      }

      const key = `${serviceDate}-${row.patient.id}-${meal}`;

      const previousStatus =
        nextMealStatus[key] ||
        nextMealStatus[`${row.patient.id}-${meal}`] ||
        "Pending";

      // Pack the patient's meal
      if (previousStatus === "Prepared" || previousStatus === "Packed") {
        nextMealStatus[key] = "Packed";
        nextPackingStatus[key] = "Packed";
      }
    });

    // =====================================================
    // 3. Save both statuses
    // =====================================================
    persistMealStatuses(nextMealStatus);
    persistPackingStatuses(nextPackingStatus);

    // =====================================================
    // 4. Update Tracker
    // =====================================================
    rows.forEach((row) => {
      if (row.mealRows.some((m) => m.meal === meal)) {
        syncFlow(row.patient.id, nextMealStatus);
      }
    });

    // =====================================================
    // 5. History
    // =====================================================
    appendHistoryEvent({
      type: "kitchen",
      module: "Kitchen Operations",
      action: "Meal Packed",
      meal,
      fromStatus: "Prepared",
      toStatus: "Packed",
      serviceDate,
    });

    // =====================================================
    // 6. Move to next meal
    // =====================================================
    moveToNextPlannedMeal(meal);
  };

  const resetPackedPreparationItem = (meal, item) => {
    const key = preparationItemKey(meal, item);
    const current = getPreparationItemStatus(meal, item);

    if (current !== "Packed") return;

    const confirmed = window.confirm(
      `${item.name} is already Packed. Move it back to Prepared?`,
    );
    if (!confirmed) return;

    const nextItemStatus = {
      ...preparationItemStatus,
      [key]: "Prepared",
    };

    setPreparationItemStatus(nextItemStatus);
    setStore(PREPARATION_ITEM_STATUS_KEY, nextItemStatus);

    // A correction means the meal is no longer fully packed.
    let next = { ...mealStatus };
    let nextPacking = { ...packingStatus };

    rows.forEach((row) => {
      const mealRow = row.mealRows.find((m) => m.meal === meal);
      if (!mealRow) return;

      const mealKey = `${serviceDate}-${row.patient.id}-${meal}`;
      if (next[mealKey] === "Packed") {
        next[mealKey] = "Prepared";
        delete nextPacking[mealKey];
      }
    });

    persistMealStatuses(next);
    persistPackingStatuses(nextPacking);

    appendHistoryEvent({
      type: "kitchen",
      module: "Kitchen Operations",
      action: "Food Item Packing Corrected",
      meal,
      foodItem: item.name,
      fromStatus: "Packed",
      toStatus: "Prepared",
      serviceDate,
    });
  };

  const updateStatus = (patientId, meal, status) => {
    const key = `${serviceDate}-${patientId}-${meal}`;
    const previousStatus =
      mealStatus[key] || mealStatus[`${patientId}-${meal}`] || "Pending";
    const next = { ...mealStatus, [key]: status };
    setMealStatus(next);
    setStore(MEAL_STATUS_KEY, next);
    if (previousStatus !== status) {
      const patient = patients.find((p) => String(p.id) === String(patientId));
      appendHistoryEvent({
        type: "meal",
        module: deliveryMode ? "Meal Delivery" : "Kitchen Operations",
        action: "Meal Status Changed",
        patientId,
        patientName: patient?.name || "",
        meal,
        fromStatus: previousStatus,
        toStatus: status,
        serviceDate,
      });
    }
    syncFlow(patientId, next);
  };

  // TRACKER SYNC: kitchen actions move the read-only Tracker from Planning to Preparing.
  // KITCHEN WORKFLOW ACTIONS: keep each meal actionable without exposing a large edit form.
  const syncFlow = (patientId, statusMap) => {
    const patient = patients.find((p) => String(p.id) === String(patientId));
    // Never mutate a discharged patient's historical tracker.
    if (String(patient?.status || "").toLowerCase() === "discharged") return;
    const flow = syncWorkflowFromMealStatuses(
      patientId,
      serviceDate,
      statusMap,
      deliveryMode ? "Meal Delivery" : "Kitchen Operations",
    );
    if (flow) {
      const patient = patients.find((p) => String(p.id) === String(patientId));
      appendHistoryEvent({
        type: "workflow",
        module: deliveryMode ? "Meal Delivery" : "Kitchen Operations",
        action: "Tracker Status Changed",
        patientId,
        patientName: patient?.name || "",
        toStatus: flow.status,
        serviceDate,
      });
    }
  };

  const statusForRow = (row) => {
    const statuses = MEALS.map((meal) => getStatus(row.patient.id, meal));
    if (statuses.length && statuses.every((s) => s === "Delivered"))
      return "Delivered";
    if (statuses.some((s) => ["Dispatched", "Delivering"].includes(s)))
      return "Delivering";
    if (statuses.some((s) => ["Packed", "Prepared", "Ready"].includes(s)))
      return "Packed";
    if (statuses.some((s) => s === "Preparing")) return "Preparing";
    return "Planning";
  };

  // BULK KITCHEN ACTIONS: the header buttons operate on the selected patients
  // for the currently scheduled meal. Previously these buttons referenced
  // bulkUpdate() without defining it, so clicking them caused a runtime error.
  const bulkUpdate = (nextStatus) => {
    if (!selectedPatients.size) return;

    const meal = mealFilter;
    let next = { ...mealStatus };
    const changedPatients = [];

    visibleRows.forEach((row) => {
      const patientId = String(row.patient.id);
      if (!selectedPatients.has(patientId)) return;

      // A discharged patient's historical tracker must remain untouched.
      if (String(row.patient?.status || "").toLowerCase() === "discharged")
        return;

      const key = `${serviceDate}-${patientId}-${meal}`;
      const previousStatus =
        next[key] || next[`${patientId}-${meal}`] || "Pending";

      // Keep the same workflow rules as the individual action buttons.
      const allowed =
        (nextStatus === "Preparing" &&
          ["Pending", "Assigned", "Planning"].includes(previousStatus)) ||
        (nextStatus === "Prepared" && previousStatus === "Preparing") ||
        (nextStatus === "Delivering" &&
          ["Prepared", "Ready"].includes(previousStatus)) ||
        (nextStatus === "Delivered" && previousStatus === "Delivering");

      if (!allowed) return;

      next[key] = nextStatus;
      changedPatients.push({
        patientId: row.patient.id,
        patientName: row.patient.name,
        meal,
        previousStatus,
      });
    });

    if (!changedPatients.length) return;

    setMealStatus(next);
    setStore(MEAL_STATUS_KEY, next);

    changedPatients.forEach(
      ({ patientId, patientName, meal: changedMeal, previousStatus }) => {
        appendHistoryEvent({
          type: "meal",
          module: deliveryMode ? "Meal Delivery" : "Kitchen Operations",
          action: "Bulk Meal Status Changed",
          patientId,
          patientName: patientName || "",
          meal: changedMeal,
          fromStatus: previousStatus,
          toStatus: nextStatus,
          serviceDate,
        });
        syncFlow(patientId, next);
      },
    );
  };

  // KITCHEN ACTIONS: context-sensitive buttons prevent staff from skipping workflow steps.
  const getMealActions = (status) => {
    if (deliveryMode) {
      if (status === "Packed")
        return [{ label: "Start Delivery", next: "Delivering", icon: "🚚" }];
      if (status === "Delivering")
        return [{ label: "Mark Delivered", next: "Delivered", icon: "✓" }];
      return [];
    }

    if (["Pending", "Assigned", "Planning"].includes(status))
      return [{ label: "Start Preparing", next: "Preparing", icon: "🍳" }];

    if (status === "Preparing")
      return [{ label: "Mark Prepared", next: "Prepared", icon: "✓" }];

    if (status === "Prepared")
      return [{ label: "Pack Order", next: "Packed", icon: "📦" }];

    if (status === "Packed")
      return [{ label: "Correct Packing", next: "Prepared", icon: "↩" }];

    return [];
  };

  const selectedPreparationGroup =
    preparationGroups.find((group) => group.meal === mealFilter) ||
    preparationGroups[0];
  const preparedMealsFor = (meal) => {
    const group = preparationGroups.find((g) => g.meal === meal);
    const planned = preparationMealCounts[meal] || 0;
    if (group?.items?.length) {
      const allItemsPacked = group.items.every(
        (item) => getPreparationItemStatus(meal, item) === "Packed",
      );
      if (allItemsPacked && planned > 0) return planned;
    }
    return rows.filter((row) =>
      row.mealRows.some(
        (m) =>
          m.meal === meal &&
          ["Packed", "Delivering", "Delivered"].includes(
            getStatus(row.patient.id, meal),
          ),
      ),
    ).length;
  };
  const totalPlannedMeals = Object.values(preparationMealCounts).reduce(
    (sum, count) => sum + Number(count || 0),
    0,
  );
  const totalPreparedMeals = MEALS.reduce(
    (sum, meal) => sum + preparedMealsFor(meal),
    0,
  );
  const totalInProgressMeals = MEALS.reduce(
    (sum, meal) =>
      sum +
      rows.filter((row) =>
        row.mealRows.some(
          (m) =>
            m.meal === meal && getStatus(row.patient.id, meal) === "Preparing",
        ),
      ).length,
    0,
  );
  const totalRemainingMeals = Math.max(
    0,
    totalPlannedMeals - totalPreparedMeals,
  );
  const overallProgress =
    totalPlannedMeals > 0
      ? Math.round((totalPreparedMeals / totalPlannedMeals) * 100)
      : 0;

  const mealClock = (mealName) => {
    const configured = mealTypes.find(
      (m) => String(m.name).toLowerCase() === String(mealName).toLowerCase(),
    );
    return configured?.time || "";
  };
  const isMealDelayed = (mealName, packedCount = 0, plannedCount = 0) => {
    if (!plannedCount || packedCount >= plannedCount) return false;
    const time = mealClock(mealName);
    if (!time) return false;
    const [h, m] = String(time).split(":").map(Number);
    const target = new Date(serviceDate);
    target.setHours(Number(h) || 0, Number(m) || 0, 0, 0);
    return serviceDate === getLocalDateKey() && Date.now() > target.getTime();
  };

  return (
    <AppLayout title={deliveryMode ? "Meal Delivery" : "Meal Preparation"}>
      {!screenReady ? (
        <div className="flex items-center justify-center p-10 text-sm text-slate-500">
          Loading kitchen operations...
        </div>
      ) : screenError ? (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <div className="font-semibold text-red-800">{screenError}</div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : deliveryMode ? (
        <HospitalPage
          title="Meal Delivery"
          description="Deliver prepared meals to the correct ward and bed."
          actions={
            <label className="hospital-field !flex-row !items-center bg-white px-3 py-1.5 rounded-md text-sm border shadow-sm">
              <CalendarDays size={16} className="text-gray-500" />
              <input
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                className="border-0 bg-transparent p-0 outline-none w-32"
              />
            </label>
          }
        >
          <div className="space-y-4">
            <section className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    Kitchen Preparation Summary
                  </p>
                  <h2 className="text-base font-bold text-slate-900">
                    {kitchenPreparationSummary.meal || "Select a meal"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    {kitchenPreparationSummary.meals} Meals
                  </span>
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">
                    {kitchenPreparationSummary.items} Items
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-4">
                <div className="rounded-lg bg-amber-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-amber-700">
                    Pending
                  </p>
                  <p className="text-lg font-bold text-amber-900">
                    {kitchenPreparationSummary.pending}
                  </p>
                </div>
                <div className="rounded-lg bg-blue-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-blue-700">
                    Preparing
                  </p>
                  <p className="text-lg font-bold text-blue-900">
                    {kitchenPreparationSummary.preparing}
                  </p>
                </div>
                <div className="rounded-lg bg-violet-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-violet-700">
                    Prepared
                  </p>
                  <p className="text-lg font-bold text-violet-900">
                    {kitchenPreparationSummary.prepared}
                  </p>
                </div>
                <div className="rounded-lg bg-emerald-50 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-emerald-700">
                    Packed
                  </p>
                  <p className="text-lg font-bold text-emerald-900">
                    {kitchenPreparationSummary.packed}
                  </p>
                </div>
              </div>

              {kitchenPreparationSummary.quantities.length > 0 && (
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Required Quantities
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {kitchenPreparationSummary.quantities.map((item) => (
                      <span
                        key={`${item.name}-${item.uom}`}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700"
                      >
                        {item.name}: {item.quantity}
                        {item.uom ? ` ${item.uom}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <section className="hospital-card">
              <div className="hospital-table-wrap">
                <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Ward</th>
                    <th className="px-4 py-3">Bed Number</th>
                    <th className="px-4 py-3">Meal</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) =>
                    row.mealRows.map((mealRow) => {
                      const status = getStatus(
                        row.patient.id,
                        mealRow.meal,
                      );
                      return (
                        <tr
                          key={`${row.patient.id}-${mealRow.meal}`}
                          className="border-t"
                        >
                          <td className="px-4 py-3 font-semibold">
                            {row.patient.ward || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {row.patient.bedNo || row.patient.bed || "—"}
                          </td>
                          <td className="px-4 py-3">{mealRow.meal}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                              {status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() =>
                                updateStatus(
                                  row.patient.id,
                                  mealRow.meal,
                                  status === "Packed"
                                    ? "Delivering"
                                    : "Delivered",
                                )
                              }
                              className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700"
                            >
                              {status === "Packed"
                                ? "Start Delivery"
                                : "Mark Delivered"}
                            </button>
                          </td>
                        </tr>
                      );
                    }),
                  )}
                  {!visibleRows.length && (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        No prepared meals found for this date.
                      </td>
                    </tr>
                  )}
                </tbody>
                </table>
              </div>
            </section>
          </div>
        </HospitalPage>
  ) : (
    <HospitalPage
      title="Kitchen Operations"
      description="Manage and track food preparation for all scheduled meals."
      noPadding={true}
    >
      <div className="h-full min-h-0 p-4">
        <div className="flex h-full min-h-0 flex-col gap-2">
          {/* Compact dashboard-style kitchen overview */}
          <section className="shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[150px_minmax(135px,1fr)_repeat(7,minmax(90px,1fr))] gap-2 p-2">
              <label className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">
                Preparation Date
                <div className="mt-1 flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-2 text-xs font-normal text-slate-800">
                  <CalendarDays size={13} />
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="w-full border-0 p-0 text-[11px] outline-none"
                  />
                </div>
              </label>

              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500">
                  Total Planned
                </div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-2xl font-bold leading-none text-emerald-600">
                    {totalPlannedMeals}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    meals
                  </span>
                </div>
                <div className="mt-1 text-[9px] text-slate-500">
                  {overallProgress}% packed
                </div>
              </div>

              {[
                [
                  "Early Morning",
                  preparationMealCounts["Early Morning"],
                  "text-slate-700",
                ],
                [
                  "Breakfast",
                  preparationMealCounts.Breakfast,
                  "text-blue-700",
                ],
                [
                  "Mid-Morning",
                  preparationMealCounts["Mid-Morning"],
                  "text-emerald-700",
                ],
                [
                  "Lunch",
                  preparationMealCounts.Lunch,
                  "text-emerald-700",
                ],
                [
                  "Evening Snack",
                  preparationMealCounts["Evening Snack"],
                  "text-amber-700",
                ],
                [
                  "Dinner",
                  preparationMealCounts.Dinner,
                  "text-orange-600",
                ],
                [
                  "Bedtime",
                  preparationMealCounts.Bedtime,
                  "text-indigo-700",
                ],
              ].map(([meal, count, cls]) => {
                const planned = Number(count || 0);
                const packed = preparedMealsFor(meal);
                const percent = planned
                  ? Math.round((packed / planned) * 100)
                  : 0;
                return (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => setMealFilter(meal)}
                    className={`min-w-0 rounded-lg border px-2 py-1.5 text-left transition ${mealFilter === meal
                        ? "border-emerald-300 bg-emerald-50/70 shadow-sm"
                        : "border-slate-200 bg-white hover:bg-slate-50"
                      }`}
                  >
                    <div
                      className={`truncate text-[10px] font-semibold ${cls}`}
                      title={meal}
                    >
                      {meal}
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-1">
                      <span className="text-xl font-bold leading-none text-slate-900">
                        {planned}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        meals
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-4 border-t bg-slate-50">
              {[
                ["Packed", totalPreparedMeals, "text-emerald-700"],
                ["In Progress", totalInProgressMeals, "text-amber-700"],
                ["Remaining", totalRemainingMeals, "text-slate-900"],
                ["Progress", `${overallProgress}%`, "text-emerald-700"],
              ].map(([label, value, cls], index) => (
                <div
                  key={label}
                  className={`px-3 py-1.5 ${index ? "border-l border-slate-200" : ""}`}
                >
                  <div className="text-[9px] uppercase tracking-wide text-slate-500">
                    {label}
                  </div>
                  <div className={`text-base font-bold ${cls}`}>
                    {value}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Dashboard-style meal distribution + current kitchen action */}
          <section className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Meal Distribution
                </h2>
                <p className="text-[10px] text-slate-500">
                  Select a meal to prepare. Empty meal periods are skipped
                  by the workflow.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={!selectedPreparationGroup?.count}
                  onClick={() => {
                    const meal = selectedPreparationGroup.meal;
                    const group = selectedPreparationGroup;
                    const hasPreparing = group.items.some(
                      (item) =>
                        getPreparationItemStatus(meal, item) ===
                        "Preparing",
                    );
                    if (hasPreparing) {
                      const nextItemStatus = { ...preparationItemStatus };
                      group.items.forEach((item) => {
                        const key = preparationItemKey(meal, item);
                        if (nextItemStatus[key] === "Preparing") {
                          nextItemStatus[key] = "Prepared";
                        }
                      });
                      setPreparationItemStatus(nextItemStatus);
                      setStore(
                        PREPARATION_ITEM_STATUS_KEY,
                        nextItemStatus,
                      );
                      markMealPrepared(meal, nextItemStatus);
                    } else {
                      markMealPreparing(meal);
                    }
                  }}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-semibold text-amber-800 disabled:opacity-40"
                >
                  🍳{" "}
                  {selectedPreparationGroup?.items.some(
                    (item) =>
                      getPreparationItemStatus(
                        selectedPreparationGroup.meal,
                        item,
                      ) === "Preparing",
                  )
                    ? "Mark Prepared All"
                    : "Start Preparing All"}
                </button>
                <button
                  type="button"
                  disabled={
                    !selectedPreparationGroup?.count ||
                    !selectedPreparationGroup.items.length ||
                    !selectedPreparationGroup.items.every(
                      (item) =>
                        getPreparationItemStatus(
                          selectedPreparationGroup.meal,
                          item,
                        ) === "Prepared",
                    )
                  }
                  onClick={() =>
                    markMealPacked(selectedPreparationGroup.meal)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
                >
                  <CheckCircle2 size={14} /> Pack All Orders
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {MEALS.map((meal) => {
                const planned = preparationMealCounts[meal] || 0;
                const packed = preparedMealsFor(meal);
                const percent = planned
                  ? Math.round((packed / planned) * 100)
                  : 0;
                return (
                  <button
                    key={meal}
                    type="button"
                    onClick={() => setMealFilter(meal)}
                    className={`min-w-0 rounded-lg border px-2 py-1.5 text-left ${mealFilter === meal
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-slate-50/40 hover:bg-white"
                      }`}
                  >
                    <div
                      className="truncate text-[10px] font-semibold text-slate-700"
                      title={meal}
                    >
                      {meal}
                    </div>
                    <div className="mt-0.5 flex items-baseline justify-between gap-1">
                      <span className="text-sm font-bold text-slate-900">
                        {planned}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {packed} packed
                      </span>
                      {isMealDelayed(meal, packed, planned) && (
                        <span className="ml-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[8px] font-bold text-red-700">
                          Delayed
                        </span>
                      )}
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Actual kitchen work stays here; only the presentation is dashboard-like. */}
          <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 border-b px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-bold text-slate-900">
                      Food Items to Prepare for{" "}
                      {selectedPreparationGroup?.meal}
                    </h2>
                    <p className="text-[10px] text-slate-500">
                      {selectedPreparationGroup?.count || 0} meals planned
                      · {selectedPreparationGroup?.items.length || 0} food
                      items
                    </p>
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-slate-600">
                        Kitchen Requirement:
                      </span>
                      <span
                        className="truncate font-bold text-emerald-700"
                        title={formatQuantityBreakdown(
                          selectedPreparationGroup?.items || [],
                        )}
                      >
                        {formatQuantityBreakdown(
                          selectedPreparationGroup?.items || [],
                        ) || "No quantity calculated"}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <select
                      value={mealFilter}
                      onChange={(e) => setMealFilter(e.target.value)}
                      className="w-44 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none focus:border-emerald-500"
                      aria-label="Select meal type"
                    >
                      {MEALS.map((meal) => (
                        <option key={meal} value={meal}>
                          {meal} ({preparationMealCounts[meal] || 0})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        const csv = [
                          "Food Item,Food Type,Quantity Per Meal,UOM,Total Required",
                        ];
                        (selectedPreparationGroup?.items || []).forEach(
                          (i) =>
                            csv.push(
                              `${i.name},${foods.find((f) => f.name === i.name)?.category || "Food Item"},${i.perMeal || ""},${i.unit || ""},${formatQuantity(i.quantity)}`,
                            ),
                        );
                        const blob = new Blob([csv.join("\n")], {
                          type: "text/csv",
                        });
                        const a = document.createElement("a");
                        a.href = URL.createObjectURL(blob);
                        a.download = `meal-preparation-${selectedPreparationGroup?.meal || "meal"}.csv`;
                        a.click();
                        URL.revokeObjectURL(a.href);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold"
                    >
                      <Download size={13} /> Export
                    </button>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[10px] text-slate-500">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Food Item</th>
                      <th className="px-3 py-2">Food Type</th>
                      <th className="px-3 py-2 text-center">
                        Qty / Meal
                      </th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2 text-center">
                        Total Required
                      </th>
                      <th className="px-3 py-2">UOM</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPreparationGroup?.items || []).map(
                      (item, index) => {
                        const food = foods.find(
                          (f) => f.name === item.name,
                        );
                        const itemStatus = getPreparationItemStatus(
                          selectedPreparationGroup.meal,
                          item,
                        );
                        return (
                          <tr
                            key={`${item.name}-${item.unit}`}
                            className="border-t"
                          >
                            <td className="px-3 py-2">{index + 1}</td>
                            <td className="px-3 py-2 font-semibold">
                              {item.name}
                            </td>
                            <td className="px-3 py-2">
                              {food?.category || "Food Item"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {item.perMeal ??
                                food?.standardQuantity ??
                                "—"}
                            </td>
                            <td className="px-3 py-2">
                              {item.unit || "—"}
                            </td>
                            <td className="px-3 py-2 text-center font-bold">
                              {formatQuantity(item.quantity)}
                            </td>
                            <td className="px-3 py-2">
                              {item.unit || "—"}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  advancePreparationItem(
                                    selectedPreparationGroup.meal,
                                    item,
                                  )
                                }
                                title={
                                  itemStatus === "Packed"
                                    ? "Click to correct an accidental packing"
                                    : `Click to move from ${itemStatus} to ${nextPreparationItemStatus(itemStatus)}`
                                }
                                className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold transition ${statusClass(
                                  itemStatus,
                                )} cursor-pointer`}
                              >
                                {itemStatus}
                              </button>
                            </td>
                          </tr>
                        );
                      },
                    )}
                    {!(selectedPreparationGroup?.items || []).length && (
                      <tr>
                        <td
                          colSpan={8}
                          className="px-4 py-8 text-center text-xs text-slate-500"
                        >
                          No planned food items for this meal.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="shrink-0 grid grid-cols-3 border-t bg-slate-50">
                <div className="px-3 py-1.5">
                  <div className="text-[9px] text-slate-500">
                    Total Food Items
                  </div>
                  <div className="text-base font-bold text-emerald-600">
                    {selectedPreparationGroup?.items.length || 0}
                  </div>
                </div>
                <div className="border-x px-3 py-1.5">
                  <div className="text-[9px] text-slate-500">
                    Total Meals
                  </div>
                  <div className="text-base font-bold text-emerald-600">
                    {selectedPreparationGroup?.count || 0}
                  </div>
                </div>
                <div className="px-3 py-1.5">
                  <div className="text-[9px] text-slate-500">
                    Total Items / Quantity
                  </div>
                  <div className="truncate text-base font-bold text-emerald-600">
                    {formatQuantityBreakdown(
                      selectedPreparationGroup?.items || [],
                    ) || "—"}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      </HospitalPage>
    )
  }
    </AppLayout>
  );
}
function Summary({ label, value }) {
  return (
    <div className="rounded-xl border bg-white px-4 py-3 shadow-sm">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
