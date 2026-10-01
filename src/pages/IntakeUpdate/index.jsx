import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import {
  getStore,
  setStore,
  KEYS,
  appendHistoryEvent,
  getLocalDateKey,
} from "../../lib/storage.js";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  Save,
  UserRound,
  Utensils,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import "./styles.css";

const MEALS = [
  { name: "Breakfast", time: "08:00" },
  { name: "Mid-Morning", time: "10:30" },
  { name: "Lunch", time: "13:00" },
  { name: "Evening Snack", time: "16:00" },
  { name: "Dinner", time: "19:00" },
  { name: "Bedtime", time: "21:00" },
];
const FOOD_STATUS = [
  "Pending",
  "Eaten",
  "Partially Eaten",
  "Not Eaten",
  "Returned",
];
const INTAKE_OPTIONS = ["Pending", "Taken", "Not Taken"];
const REASONS = [
  "Select reason",
  "Poor appetite",
  "Nausea",
  "Vomiting",
  "Swallowing difficulty",
  "Pain / discomfort",
  "Patient refused meal",
  "Taste preference",
  "Other",
];
const OBSERVATIONS = [
  "Nausea",
  "Vomiting",
  "Swallowing difficulty",
  "Pain",
  "Refused meal",
  "Poor appetite",
  "Bowel / intestinal concern",
  "Food returned",
  "Other",
];

const statusForIntake = (value) => value;
const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString();
};
const allergyText = (allergens) =>
  !Array.isArray(allergens) || allergens.length === 0
    ? "None recorded"
    : allergens.join(", ");
const intakeKey = (patientId, date) => `hd_meal_intake_${patientId}_${date}`;
const legacyIntakeKey = (patientId) => `hd_meal_intake_${patientId}`;

const mealStatusFromFoods = (items) => {
  const meaningful = items.filter(
    (x) => x.foodStatus && x.foodStatus !== "Pending",
  );
  if (!meaningful.length) return "Pending";
  if (meaningful.some((x) => x.foodStatus === "Returned")) return "Returned";
  if (meaningful.every((x) => ["Eaten", "Taken"].includes(x.foodStatus)))
    return "Taken";
  if (
    meaningful.some((x) =>
      ["Not Eaten", "Not Taken", "Partially Eaten"].includes(x.foodStatus),
    )
  )
    return "Not Taken";
  return "Pending";
};

export default function IntakeUpdate() {
  const navigate = useNavigate();
  const { patientId } = useParams();
  const [searchParams] = useSearchParams();
  const serviceDate = searchParams.get("date") || getLocalDateKey();
  const patients = getStore(KEYS.PATIENTS) || [];
  const diets = getStore(KEYS.DIET_TYPES) || [];
  const mappings = getStore(KEYS.DIET_MAPPING) || [];
  const mealTypes = getStore(KEYS.MEAL_TYPES) || [];
  const foods = getStore(KEYS.FOOD_MASTER) || [];
  const plans = getStore("hd_diet_plans", []) || [];
  const patient = patients.find(
    (item) => String(item.id) === String(patientId),
  );
  const plan = plans.find(
    (item) =>
      String(item.patientId) === String(patientId) &&
      String(item.startDate || "") <= serviceDate,
  );
  const diet = diets.find(
    (item) =>
      Number(item.id) === Number(plan?.dietTypeId || patient?.dietTypeId),
  );
  const dietName = diet?.name || patient?.dietType || "Diet Not Assigned";
  const saved = patient
    ? getStore(
        intakeKey(patient.id, serviceDate),
        getStore(legacyIntakeKey(patient.id), null),
      )
    : null;

  const buildAllocated = () => {
    if (!patient) return [];
    return MEALS.map((meal) => {
      const mealType = mealTypes.find(
        (m) => String(m.name).toLowerCase() === meal.name.toLowerCase(),
      );
      const mapping = mappings.find(
        (m) =>
          (Number(m.dietTypeId) ===
            Number(plan?.dietTypeId || patient?.dietTypeId) ||
            Number(m.dietTemplateId) === Number(plan?.dietTemplateId)) &&
          (Number(m.mealTypeId) === Number(mealType?.id) ||
            String(m.mealName || "").toLowerCase() ===
              String(meal.name).toLowerCase()),
      );
      const savedMeal = saved?.meals?.find((x) => x.meal === meal.name);
      const savedFoodMap = saved?.foodItems || [];

      const intakeStatusStore = getStore("hd_intake_status", {}) || {};
      const currentIntakeKey = `${serviceDate}-${patient.id}-${meal.name}`;
      const legacyIntakeKeyForMeal = `${patient.id}-${meal.name}`;

      const hasCurrentIntakeStatus = Object.prototype.hasOwnProperty.call(
        intakeStatusStore,
        currentIntakeKey,
      );

      const hasLegacyIntakeStatus = Object.prototype.hasOwnProperty.call(
        intakeStatusStore,
        legacyIntakeKeyForMeal,
      );

      const currentIntakeStatus = hasCurrentIntakeStatus
        ? intakeStatusStore[currentIntakeKey]
        : hasLegacyIntakeStatus
          ? intakeStatusStore[legacyIntakeKeyForMeal]
          : null;
      const foodItems = (mapping?.foodItems || [])
        .map((entry) => {
          const foodId =
            typeof entry === "object" ? (entry?.foodId ?? entry?.id) : entry;
          const food = foods.find((f) => Number(f.id) === Number(foodId));
          if (!food) return null;
          const quantity =
            (typeof entry === "object" ? entry?.quantity : null) ??
            mapping?.quantityTexts?.[foodId] ??
            mapping?.quantities?.[foodId] ??
            food.standardQuantity;
          const existing = savedFoodMap.find(
            (x) => x.meal === meal.name && Number(x.foodId) === Number(food.id),
          );
          return {
            foodId: food.id,
            name: food.name,
            category: food.category,
            quantity,
            unit:
              (typeof entry === "object" ? entry?.unit : null) ||
              mapping?.units?.[foodId] ||
              food.unit,
            foodStatus: existing?.foodStatus || "Pending",
            foodRemark: existing?.foodRemark || "",
          };
        })
        .filter(Boolean);
      const validIntakeStatuses = ["Pending", "Taken", "Not Taken", "Returned"];

      const resolvedStatus = validIntakeStatuses.includes(currentIntakeStatus)
        ? currentIntakeStatus
        : validIntakeStatuses.includes(savedMeal?.status)
          ? savedMeal.status
          : mealStatusFromFoods(foodItems);

      return {
        ...meal,
        intake: savedMeal?.intake || "Pending",
        status: resolvedStatus,
        foodItems,
      };
    });
  };

  const [meals, setMeals] = useState(buildAllocated);
  const [screenReady, setScreenReady] = useState(false);
  const [screenError, setScreenError] = useState("");

  // LIVE CURRENT-MEAL SELECTION: keep Intake on the same time-based meal slot used by
  // Meal Distribution and the Meal Plan modal. The screen automatically advances as
  // the hospital meal schedule changes, without changing the stored historical data.
  const [currentTime, setCurrentTime] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const currentMealName = useMemo(() => {
    // Always return a string. The previous fallback used MEALS[0] (an object),
    // which caused React to crash with "Objects are not valid as a React child"
    // when the configured meal master did not contain usable time values.
    const configured = (mealTypes || [])
      .filter((m) => m.status !== "Inactive")
      .map((m) => {
        const configuredName = String(m.name || "").trim();
        const fixed = MEALS.find(
          (meal) => meal.name.toLowerCase() === configuredName.toLowerCase(),
        );
        if (!fixed) return null;
        const rawTime = String(m.time || fixed.time);
        const [hours, minutes] = rawTime.split(":").map(Number);
        const totalMinutes =
          Number.isFinite(hours) && Number.isFinite(minutes)
            ? hours * 60 + minutes
            : Number(fixed.time.split(":")[0]) * 60 +
              Number(fixed.time.split(":")[1]);
        return { name: fixed.name, minutes: totalMinutes };
      })
      .filter(Boolean)
      .sort((a, b) => a.minutes - b.minutes);

    // Fall back to the application's standard meal schedule when Master Data
    // is empty or incomplete. This keeps Intake working and time-based.
    const schedule = configured.length
      ? configured
      : MEALS.map((meal) => {
          const [hours, minutes] = meal.time.split(":").map(Number);
          return { name: meal.name, minutes: hours * 60 + minutes };
        });

    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    let chosen = schedule[0].name;
    schedule.forEach((meal) => {
      if (meal.minutes <= nowMinutes) chosen = meal.name;
    });
    return chosen;
  }, [mealTypes, currentTime]);

  const currentMeals = useMemo(
    () => meals.filter((meal) => meal.name === currentMealName),
    [meals, currentMealName],
  );

  const [reason, setReason] = useState(saved?.reason || "Select reason");
  const [remark, setRemark] = useState(
    saved?.remarks || saved?.nursingRemark || "",
  );
  const [assistance, setAssistance] = useState(
    saved?.assistance || "Independent",
  );
  const [observations, setObservations] = useState(saved?.observations || []);
  const [intestinalDetail, setIntestinalDetail] = useState(
    saved?.intestinalDetail || "",
  );
  const [savedMessage, setSavedMessage] = useState("");
  const [, setStoreVersion] = useState(0);

  useEffect(() => {
    const refresh = () => {
      try {
        setScreenError("");
        setMeals(buildAllocated());
        setStoreVersion((version) => version + 1);
        setScreenReady(true);
      } catch (error) {
        console.error("Intake screen refresh failed", error);
        setScreenError("Intake data could not be loaded.");
        setScreenReady(true);
      }
    };
    refresh();
    window.addEventListener("dietcare-store-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("dietcare-store-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const overallStatus = useMemo(() => {
    const statuses = meals.map((m) => m.status).filter((s) => s !== "Pending");
    if (!statuses.length) return "Pending";
    if (statuses.every((s) => s === "Taken")) return "Taken";
    if (statuses.some((s) => s === "Returned")) return "Returned";
    if (statuses.some((s) => s === "Not Taken")) return "Not Taken";
    return "Pending";
  }, [meals]);
  const completedCount = meals.filter(
    (meal) => meal.status !== "Pending",
  ).length;
  const averageIntake = useMemo(() => {
    const values = meals
      .map((m) => Number.parseInt(m.intake, 10))
      .filter(Number.isFinite);
    return values.length
      ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
      : 0;
  }, [meals]);

  const updateMeal = (mealName, patch) => {
    setMeals((current) =>
      current.map((meal) => {
        if (meal.name !== mealName) return meal;
        let next = { ...meal, ...patch };
        if (patch.intake !== undefined) {
          next.status = statusForIntake(patch.intake);
          const foodStatus =
            patch.intake === "Taken"
              ? "Eaten"
              : patch.intake === "Not Taken"
                ? "Not Eaten"
                : "Pending";
          next.foodItems = meal.foodItems.map((item) => ({
            ...item,
            foodStatus,
          }));
        }
        if (patch.foodItems !== undefined)
          next.status = mealStatusFromFoods(patch.foodItems);
        return next;
      }),
    );
    setSavedMessage("");
  };
  const updateFood = (mealName, foodId, patch) =>
    setMeals((current) =>
      current.map((meal) => {
        if (meal.name !== mealName) return meal;
        const foodItems = meal.foodItems.map((item) =>
          Number(item.foodId) === Number(foodId) ? { ...item, ...patch } : item,
        );
        const intake = foodItems.every((item) => item.foodStatus === "Eaten")
          ? "Taken"
          : foodItems.some((item) => item.foodStatus !== "Pending")
            ? "Not Taken"
            : "Pending";
        return {
          ...meal,
          foodItems,
          intake,
          status: mealStatusFromFoods(foodItems),
        };
      }),
    );
  const toggleObservation = (item) => {
    setObservations((current) =>
      current.includes(item)
        ? current.filter((v) => v !== item)
        : [...current, item],
    );
    setSavedMessage("");
  };

  const handleSave = () => {
    if (!patient) return;
    const mealServiceStatus = getStore("hd_meal_status", {}) || {};
    const notDelivered = meals.filter(
      (meal) =>
        meal.status !== "Pending" &&
        (mealServiceStatus[`${serviceDate}-${patient.id}-${meal.name}`] ||
          mealServiceStatus[`${patient.id}-${meal.name}`] ||
          "Pending") !== "Delivered",
    );
    if (notDelivered.length) {
      setSavedMessage(
        `Intake cannot be saved yet. ${notDelivered.map((meal) => meal.name).join(", ")} must be marked Delivered first.`,
      );
      return;
    }
    const intakeStatus = getStore("hd_intake_status", {}) || {};

    meals.forEach((meal) => {
      const currentKey = `${serviceDate}-${patient.id}-${meal.name}`;
      const legacyKey = `${patient.id}-${meal.name}`;

      intakeStatus[currentKey] = meal.status;
      intakeStatus[legacyKey] = meal.status;
    });
    const foodItems = meals.flatMap((meal) =>
      meal.foodItems.map((item) => ({
        meal: meal.name,
        foodId: item.foodId,
        foodName: item.name,
        servedQuantity: item.quantity,
        unit: item.unit,
        foodStatus: item.foodStatus,
        foodRemark: item.foodRemark || "",
      })),
    );
    const payload = {
      patientId: patient.id,
      patientName: patient.name,
      serviceDate,
      planId: plan?.id || null,
      dietTypeId: plan?.dietTypeId || patient.dietTypeId || null,
      planName: plan?.planName || dietName,
      meals: meals.map(({ name, time, intake, status }) => ({
        meal: name,
        time,
        intake,
        status,
      })),
      foodItems,
      reason,
      remarks: remark.trim(),
      nursingRemark: remark.trim(),
      assistance,
      observations,
      intestinalDetail: intestinalDetail.trim(),
      overallStatus,
      averageIntake,
      updatedAt: new Date().toISOString(),
    };
    setStore(intakeKey(patient.id, serviceDate), payload);
    setStore("hd_intake_status", intakeStatus);
    appendHistoryEvent({
      type: "intake",
      module: "Meal Intake",
      action: "Meal Intake Saved",
      patientId: patient.id,
      patientName: patient.name || "",
      planId: plan?.id || null,
      dietTypeId: plan?.dietTypeId || patient.dietTypeId || null,
      planName: plan?.planName || dietName,
      overallStatus,
      averageIntake,
      serviceDate,
      remarks: remark.trim(),
    });
    setSavedMessage(
      "Meal intake, food-level return status and remarks saved successfully. Meal to Bed will update automatically.",
    );
  };

  if (!patient)
    return (
      <AppLayout title="Intake Update">
        <div className="intake-empty">
          <ClipboardList size={32} />
          <h2>Patient not found</h2>
          <p>The selected patient is no longer available.</p>
          <button
            type="button"
            onClick={() => navigate("/meal-delivery")}
            className="intake-primary-button"
          >
            Back to Meal to Bed
          </button>
        </div>
      </AppLayout>
    );

  return (
    <AppLayout title="Intake Update">
      {!screenReady ? (
        <div className="flex items-center justify-center p-10 text-sm text-slate-500">
          Loading intake...
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
      ) : !patient ? (
        <div className="m-4 rounded-xl border bg-white p-10 text-center shadow-sm">
          <div className="text-sm font-semibold text-slate-800">
            Patient not found
          </div>
          <div className="mt-1 text-xs text-slate-500">
            The selected patient is no longer available for intake.
          </div>
          <button
            type="button"
            onClick={() => navigate("/meal-delivery")}
            className="mt-4 rounded-lg border px-3 py-1.5 text-xs font-semibold"
          >
            Back to Meal Delivery
          </button>
        </div>
      ) : (
        <div className="intake-page">
          <section className="intake-hero">
            <div className="intake-hero__top">
              <div>
                <button
                  type="button"
                  onClick={() => navigate(`/meal-delivery`)}
                  className="intake-back-button"
                >
                  <ArrowLeft size={15} /> Back to Meal to Bed
                </button>
                <div className="intake-title-row">
                  <div className="intake-title-icon">
                    <Utensils size={20} />
                  </div>
                  <div>
                    <h1>Meal Delivery & Intake</h1>
                    <p>
                      Record what was eaten, not eaten or returned when the
                      plate is collected.
                    </p>
                  </div>
                </div>
              </div>
              <div className="intake-overall">
                <span
                  className={`intake-status ${overallStatus === "Taken" ? "intake-status--taken" : "intake-status--pending"}`}
                >
                  Overall: {overallStatus}
                </span>
                <span className="intake-progress">{serviceDate}</span>
              </div>
            </div>
            <div className="patient-summary-grid">
              <Info
                icon={<UserRound size={15} />}
                label="Patient"
                value={patient.name}
                sub={`ID: ${patient.id} • ${patient.age || "-"} yrs • ${patient.gender || "-"}`}
              />
              <Info
                icon={<ClipboardList size={15} />}
                label="Ward / Bed"
                value={patient.ward || "Unassigned"}
                sub={`Bed ${patient.bedNo || patient.bed || "-"}`}
              />
              <Info
                icon={<Utensils size={15} />}
                label="Diet Plan"
                value={dietName}
                sub={plan?.planName || "No diet plan"}
              />
              <Info
                icon={<AlertTriangle size={15} />}
                label="Allergies"
                value={allergyText(patient.allergens)}
                sub={
                  patient.allergens?.includes("None")
                    ? "No food allergy recorded"
                    : "Review before serving"
                }
                alert={!patient.allergens?.includes("None")}
              />
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <Info
                label="Patient Taste Preference"
                value={plan?.patientTasteRemark || "No preference recorded"}
                sub={`${plan?.spiceLevel || "Normal"} • ${plan?.foodTemperature || "Warm"}`}
              />
              <Info
                label="Planning Remarks"
                value={plan?.planningRemarks || "None"}
              />
              <Info
                label="Nursing Remarks"
                value={plan?.nursingRemarks || "None"}
              />
            </div>
          </section>

          <section className="intake-kpi-grid">
            <Kpi
              label="Current meal"
              value={currentMealName}
              helper="Automatically selected from meal time"
            />
            <Kpi
              label="Meal status"
              value={currentMeals[0]?.status || "Pending"}
              helper="Current scheduled meal"
            />
            <Kpi
              label="Current intake"
              value={currentMeals[0]?.intake || "Pending"}
              helper="Update after delivery"
            />
            <Kpi
              label="Last update"
              value={
                saved?.updatedAt
                  ? new Date(saved.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Not saved"
              }
              helper={
                saved?.updatedAt
                  ? formatDate(saved.updatedAt)
                  : "Save to create timestamp"
              }
            />
          </section>

          <section className="intake-card">
            <div className="intake-card__header">
              <div>
                <h2>Current Meal & Food Intake</h2>
                <p>
                  Showing <strong>{currentMealName}</strong> based on the
                  current hospital meal time. Record intake for each food item
                  separately; the overall meal result is calculated from those
                  item-level results. The screen changes automatically to the
                  next scheduled meal.
                </p>
              </div>
              <span className="intake-current-slot">
                <Clock3 size={14} /> {currentMeals[0]?.time || "Scheduled time"}
              </span>
            </div>
            <div className="space-y-3 p-4">
              {currentMeals.map((meal) => (
                <article
                  key={meal.name}
                  className="rounded-xl border bg-white p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">
                        {meal.name}
                      </h3>
                      <span className="text-xs text-slate-500">
                        {meal.time}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="intake-status intake-status--pending">
                        Meal Result: {meal.status}
                      </span>
                      <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-600">
                        Derived from food items
                      </span>
                    </div>
                  </div>
                  {meal.foodItems.length ? (
                    <>
                      <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                        <strong>Item-level intake:</strong> mark each food item
                        as Taken or Not Taken. The meal status above is derived
                        automatically from these individual results.
                      </div>
                      <div className="mt-3 overflow-x-auto">
                        <table className="w-full min-w-[800px] text-left text-xs">
                          <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                            <tr>
                              <th className="p-2">Allocated Food</th>
                              <th className="p-2">Served Quantity</th>
                              <th className="p-2">Food Intake Status</th>
                              <th className="p-2">Food Remark</th>
                            </tr>
                          </thead>
                          <tbody>
                            {meal.foodItems.map((item) => (
                              <tr
                                key={`${meal.name}-${item.foodId}`}
                                className="border-t"
                              >
                                <td className="p-2 font-semibold">
                                  {item.name}
                                  <div className="text-[10px] font-normal text-slate-500">
                                    {item.category || "Food Master"}
                                  </div>
                                </td>
                                <td className="p-2">
                                  {item.quantity} {item.unit}
                                </td>
                                <td className="p-2">
                                  <select
                                    value={item.foodStatus}
                                    onChange={(e) =>
                                      updateFood(meal.name, item.foodId, {
                                        foodStatus: e.target.value,
                                      })
                                    }
                                    className="rounded-lg border px-2 py-1.5 font-semibold"
                                  >
                                    <option>Pending</option>
                                    <option>Eaten</option>
                                    <option>Taken</option>
                                    <option>Not Taken</option>
                                  </select>
                                </td>
                                <td className="p-2">
                                  <input
                                    value={item.foodRemark}
                                    onChange={(e) =>
                                      updateFood(meal.name, item.foodId, {
                                        foodRemark: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-lg border px-2 py-1.5"
                                    placeholder="e.g. too spicy, too hot, patient liked it, sent back"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <div className="mt-3 rounded-lg border border-dashed p-3 text-xs text-slate-500">
                      No food items are allocated for this meal in the diet plan
                      template.
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>

          <div className="intake-two-column">
            <section className="intake-card">
              <div className="intake-card__header">
                <div>
                  <h2>Caregiver / Nursing Intake Remark</h2>
                  <p>
                    Record the reason and patient response after the plate is
                    collected.
                  </p>
                </div>
                <FileText size={19} />
              </div>
              <div className="intake-form-grid">
                <Field label="Reason">
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="field-control"
                  >
                    {REASONS.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Patient Assistance">
                  <select
                    value={assistance}
                    onChange={(e) => setAssistance(e.target.value)}
                    className="field-control"
                  >
                    <option>Independent</option>
                    <option>Assisted</option>
                    <option>Fully assisted</option>
                  </select>
                </Field>
              </div>
              <Field label="Caregiver / Nursing Remark">
                <textarea
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  rows={4}
                  placeholder="e.g. Patient ate rice and dal, returned vegetables, said food was too spicy..."
                  className="field-control field-textarea"
                />
              </Field>
              <Field label="Observations">
                <div className="observation-list">
                  {OBSERVATIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => toggleObservation(item)}
                      className={`observation-chip ${observations.includes(item) ? "observation-chip--selected" : ""}`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </Field>
            </section>
            <section className="intake-card">
              <div className="intake-card__header">
                <div>
                  <h2>Clinical / Intestinal Details</h2>
                  <p>Additional context for the dietitian and care team.</p>
                </div>
                <ClipboardList size={19} />
              </div>
              <Field label="Intestinal / GI Detail">
                <textarea
                  value={intestinalDetail}
                  onChange={(e) => setIntestinalDetail(e.target.value)}
                  rows={5}
                  placeholder="e.g. abdominal discomfort, diarrhoea, constipation or other dietary observation..."
                  className="field-control field-textarea"
                />
              </Field>
              <div className="clinical-note">
                <strong>Diagnosis</strong>
                <span>{patient.primaryDiagnosis || "Not recorded"}</span>
              </div>
              <div className="clinical-note clinical-note--alert">
                <strong>Allergy check</strong>
                <span>{allergyText(patient.allergens)}</span>
              </div>
              {Array.isArray(patient.allergens) &&
                patient.allergens.filter((x) => x && x !== "None").length >
                  0 && (
                  <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                    ⚠ Verify every food item against the patient's allergy list
                    before recording intake.
                  </div>
                )}
            </section>
          </div>
          <section className="intake-actions">
            <div className="intake-last-update">
              <Clock3 size={15} />
              <div>
                <span>Last saved</span>
                <strong>
                  {saved?.updatedAt
                    ? new Date(saved.updatedAt).toLocaleString()
                    : "Not saved yet"}
                </strong>
              </div>
            </div>
            <div className="intake-action-buttons">
              <button
                type="button"
                onClick={() => navigate("/meal-delivery")}
                className="intake-secondary-button"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="intake-primary-button"
              >
                <Save size={15} /> Save Intake Update
              </button>
            </div>
          </section>
          {savedMessage && (
            <div className="intake-success">
              <CheckCircle2 size={17} /> {savedMessage}
            </div>
          )}
        </div>
      )}
    </AppLayout>
  );
}

function Info({ icon, label, value, sub, alert }) {
  return (
    <div className={`patient-info ${alert ? "patient-info--alert" : ""}`}>
      <div className="patient-info__label">
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}
function Kpi({ label, value, helper }) {
  return (
    <div className="intake-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="intake-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
