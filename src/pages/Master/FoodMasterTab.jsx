import React, { useState, useEffect, useCallback } from "react";
import { Edit, Trash2, Plus } from "lucide-react";
import DataTable from "../../components/common/DataTable.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Modal from "../../components/common/Modal.jsx";
import "./food-master.css";
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
} from "../../lib/storage.js";
import foodService from "../../services/foodService.js";
import foodNutritionService from "../../services/foodNutritionService.js";

const CATEGORIES = [
  "Grains",
  "Proteins",
  "Dairy",
  "Vegetables",
  "Fruits",
  "Beverages",
  "Soups",
];
const UNITS = STANDARD_UNITS;
const EMPTY = {
  name: "",
  category: CATEGORIES[0],
  calories: "0",
  protein: "0",
  carbs: "0",
  fat: "0",
  fiber: "0",
  standardQuantity: "0",
  unit: UNITS[0],
  status: "Active",
};
//const BLOCKED_KEYS = ["-", "+", "e", "E"];

export default function FoodMasterTab() {
  const [data, setData] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  const closeModal = useCallback(() => setIsOpen(false), []);
  const closeDelete = useCallback(() => setDeleting(null), []);

  // Props for positive-only number fields (plain function, not a component,
  // so it does not cause the input to lose focus).
  const numberProps = (key) => ({
    type: "number",
    inputMode: "decimal",
    value: form[key] ?? "",
    onFocus: () => {
      // clear the 0 so the user can type directly
      if (form[key] !== "" && Number(form[key]) === 0) {
        setForm((f) => ({ ...f, [key]: "" }));
      }
    },
    onBlur: () => {
      // put 0 back if the field is left empty
      if (form[key] === "") {
        setForm((f) => ({ ...f, [key]: "0" }));
      }
    },
    onKeyDown: (e) => {
      if (BLOCKED_KEYS.includes(e.key)) e.preventDefault();
    },
    onWheel: (e) => e.currentTarget.blur(),
    onPaste: (e) => {
      if (/[-+eE]/.test(e.clipboardData.getData("text"))) e.preventDefault();
    },
    onChange: (e) => {
      const v = e.target.value;
      if (v !== "" && Number(v) < 0) return;
      setForm((f) => ({ ...f, [key]: v }));
    },
  });

  const extractRows = (response) => {
    const candidates = [];
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 6) return;
      if (Array.isArray(value)) {
        const rows = value.filter(
          (item) => item && typeof item === "object" && !Array.isArray(item),
        );
        if (rows.length) candidates.push(rows);
        rows.forEach((row) => visit(row, depth + 1));
        return;
      }
      Object.values(value).forEach((child) => visit(child, depth + 1));
    };
    visit(response);
    return candidates.sort((a, b) => b.length - a.length)[0] || [];
  };

  const load = async () => {
    try {
      const response = await foodService.getAllFood({
        code: "",
        name: "",
        category: "",
        status: null,
        paginationInfo: {
          currentPage: 1,
          pageSize: 100,
          dataSorting: {
            byColumn: { field: "name", title: "Name", sortable: true },
            sortingOrder: "ASC",
          },
        },
      });
      const apiRows = extractRows(response)
        .map((item) => ({
          ...item,
          id: item.id ?? item.foodId ?? item.food_id,
          backendFoodId: item.id ?? item.foodId ?? item.food_id,
          name: item.name ?? "",
          category: item.category ?? CATEGORIES[0],
          unit: normalizeUnit(item.unit) || UNITS[0],
          description: item.description ?? "",
          status:
            item.status === true ||
            item.status === 1 ||
            String(item.status).toLowerCase() === "active"
              ? "Active"
              : "Inactive",
        }))
        .filter((row) => row.id != null);

      if (apiRows.length) {
        const existing = getStore(KEYS.FOOD_MASTER, []) || [];
        const merged = await Promise.all(
          apiRows.map(async (row) => {
            const old = existing.find(
              (item) =>
                Number(item.backendFoodId ?? item.id) ===
                  Number(row.backendFoodId) ||
                String(item.code || "").toLowerCase() ===
                  String(row.code || "").toLowerCase(),
            );
            const hasNutrition =
              old?.nutritionLoaded ||
              old?.nutritionId != null ||
              ["calories", "protein", "carbs", "fat", "fiber"].some(
                (key) => Number(old?.[key]) > 0,
              );
            let nutrition = old
              ? {
                  calories: old.calories,
                  protein: old.protein,
                  carbohydrates: old.carbs,
                  fat: old.fat,
                  fiber: old.fiber,
                  id: old.nutritionId,
                }
              : {};
            let nutritionLoaded = Boolean(hasNutrition);
            if (!hasNutrition) {
              try {
                const nutritionResponse =
                  await foodNutritionService.getNutritionById(
                    row.backendFoodId,
                  );
                nutrition =
                  extractRows(nutritionResponse)[0] ||
                  nutritionResponse?.data ||
                  nutritionResponse?.result ||
                  nutritionResponse ||
                  {};
                nutritionLoaded = true;
              } catch (error) {
                if (error?.status === 404) {
                  nutritionLoaded = true;
                } else {
                  console.warn(
                    `Unable to load nutrition for food ${row.backendFoodId}.`,
                    error,
                  );
                }
              }
            }
            return {
              ...old,
              ...row,
              nutritionLoaded,
              id: old?.id ?? row.id,
              backendFoodId: Number(row.backendFoodId),
              calories: Number(nutrition.calories ?? old?.calories ?? 0),
              protein: Number(nutrition.protein ?? old?.protein ?? 0),
              carbs: Number(
                nutrition.carbohydrates ?? nutrition.carbs ?? old?.carbs ?? 0,
              ),
              fat: Number(nutrition.fat ?? old?.fat ?? 0),
              fiber: Number(nutrition.fiber ?? old?.fiber ?? 0),
              ...(nutrition.id != null
                ? { nutritionId: Number(nutrition.id) }
                : {}),
            };
          }),
        );
        setStore(KEYS.FOOD_MASTER, merged);
        setData(merged);
        return;
      }
    } catch (error) {
      console.warn(
        "Food API unavailable; using current-session data only.",
        error,
      );
    }
    setData(getStore(KEYS.FOOD_MASTER, []) || []);
  };
  useEffect(() => {
    load();
  }, []);

  const openModal = (r = null) => {
    setEditing(r);
    setForm(r ? { ...r, unit: normalizeUnit(r.unit) } : EMPTY);
    setError("");
    setIsOpen(true);
  };

  // ============================================================
  // API: CREATE FOOD + SAVE FOOD NUTRITION
  // ============================================================
  const save = async () => {
    const standardQuantity = positiveQuantity(form.standardQuantity);
    const unit = normalizeUnit(form.unit);

    if (form.status === "Active" && !standardQuantity) {
      setError("Active food items must have a quantity greater than 0.");
      return;
    }

    if (!unit) {
      setError("Select a valid unit.");
      return;
    }

    // Safety checks: no negative values
    const numericFields = ["calories", "protein", "carbs", "fat", "fiber"];
    if (numericFields.some((k) => Number(form[k] || 0) < 0)) {
      setError("Nutrition values cannot be negative.");
      return;
    }
    if (form.standardQuantity !== "" && Number(form.standardQuantity) < 0) {
      setError("Standard quantity cannot be negative.");
      return;
    }

    const commonFoodPayload = {
      code: String(form.code || form.name || "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_"),
      name: String(form.name || "").trim(),
      category: String(form.category || "").trim(),
      unit,
      description: String(form.description || "").trim(),
      status: form.status === "Active",
    };

    try {
      // --------------------------------------------------------
      // SAVE FOOD
      // --------------------------------------------------------
      let foodResponse;
      if (editing) {
        foodResponse = await foodService.updateFoodById(
          editing.backendFoodId ?? editing.id,
          { ...commonFoodPayload, updatedBy: "Admin" },
        );
      } else {
        foodResponse = await foodService.createFood({
          ...commonFoodPayload,
          createdBy: "Admin",
        });
      }

      if (
        !foodResponse ||
        foodResponse.error ||
        foodResponse.statusCode >= 400 ||
        foodResponse.status >= 400
      ) {
        throw new Error(
          foodResponse?.message ||
            foodResponse?.error?.message ||
            "Failed to save food item",
        );
      }

      const foodRecord =
        extractRows(foodResponse)[0] ||
        foodResponse?.data ||
        foodResponse?.result ||
        foodResponse ||
        {};
      const foodId = Number(
        foodRecord?.id ??
          foodRecord?.foodId ??
          foodRecord?.food_id ??
          editing?.backendFoodId ??
          editing?.id,
      );

      // --------------------------------------------------------
      // SAVE / UPDATE NUTRITION
      // --------------------------------------------------------
      let nutritionId = editing?.nutritionId;
      if (Number.isFinite(foodId) && foodId > 0) {
        const nutritionPayload = {
          foodId,
          calories: Number(form.calories || 0),
          protein: Number(form.protein || 0),
          carbohydrates: Number(form.carbs || 0),
          fat: Number(form.fat || 0),
          fiber: Number(form.fiber || 0),
        };

        if (nutritionId) {
          await foodNutritionService.updateNutritionById(
            nutritionId,
            nutritionPayload,
          );
        } else {
          try {
            const nutritionResponse =
              await foodNutritionService.saveNutrition(nutritionPayload);
            const nutritionRecord =
              extractRows(nutritionResponse)[0] ||
              nutritionResponse?.data ||
              nutritionResponse?.result ||
              nutritionResponse ||
              {};
            nutritionId = nutritionRecord?.id ?? nutritionId;
          } catch (nutritionError) {
            const existingNutrition =
              await foodNutritionService.getNutritionById(foodId);
            const nutritionRecord =
              extractRows(existingNutrition)[0] ||
              existingNutrition?.data ||
              existingNutrition?.result ||
              existingNutrition ||
              {};
            if (nutritionRecord?.id) {
              nutritionId = nutritionRecord.id;
              await foodNutritionService.updateNutritionById(
                nutritionId,
                nutritionPayload,
              );
            } else {
              throw nutritionError;
            }
          }
        }
      }

      // --------------------------------------------------------
      // EXISTING LOCAL STORAGE
      // --------------------------------------------------------
      const d = {
        ...form,
        ...(Number.isFinite(foodId) && foodId > 0
          ? { backendFoodId: Number(foodId) }
          : {}),
        ...(nutritionId ? { nutritionId: Number(nutritionId) } : {}),
        calories: Number(form.calories || 0),
        protein: Number(form.protein || 0),
        carbs: Number(form.carbs || 0),
        fat: Number(form.fat || 0),
        fiber: Number(form.fiber || 0),
        standardQuantity,
        unit,
      };

      editing
        ? updateRecord(KEYS.FOOD_MASTER, editing.id, d)
        : addRecord(KEYS.FOOD_MASTER, d);

      setIsOpen(false);
      setData(getStore(KEYS.FOOD_MASTER, []) || []);
    } catch (error) {
      console.error("Food API Error:", error);

      // Do not break existing UI/local functionality
      const d = {
        ...form,
        calories: Number(form.calories || 0),
        protein: Number(form.protein || 0),
        carbs: Number(form.carbs || 0),
        fat: Number(form.fat || 0),
        fiber: Number(form.fiber || 0),
        standardQuantity,
        unit,
      };

      editing
        ? updateRecord(KEYS.FOOD_MASTER, editing.id, d)
        : addRecord(KEYS.FOOD_MASTER, d);

      setIsOpen(false);
      setData(getStore(KEYS.FOOD_MASTER, []) || []);
      alert(
        `Food item was saved locally because the server request failed: ${error?.message || "Unknown API error."}`,
      );
    }
  };

  const columns = [
    { key: "name", label: "Item Name" },
    { key: "category", label: "Category" },
    {
      key: "standardQuantity",
      label: "Std Qty",
      render: (r) => (
        <span
          style={{
            fontSize: "var(--font-body)",
            fontWeight: 600,
            color: "var(--text-primary)",
          }}
        >
          {r.standardQuantity ?? ""} {normalizeUnit(r.unit)}
        </span>
      ),
    },
    {
      key: "calories",
      label: "Nutrition (per unit)",
      render: (r) => (
        <div>
          <div
            style={{
              fontWeight: 600,
              fontSize: "var(--font-body)",
              color: "var(--text-primary)",
            }}
          >
            {r.calories} kcal / {r.unit}
          </div>
          <div
            style={{
              fontSize: "var(--font-caption)",
              color: "var(--text-secondary)",
            }}
          >
            P:{r.protein}g · C:{r.carbs}g · F:{r.fat}g
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => <StatusBadge status={r.status} />,
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (r) => (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--space-2)",
          }}
        >
          <button
            type="button"
            onClick={() => openModal(r)}
            className="icon-btn"
            title="Edit"
            style={{ minWidth: 32, minHeight: 32 }}
          >
            <Edit size={15} style={{ color: "var(--color-info)" }} />
          </button>
          <button
            type="button"
            onClick={() => setDeleting(r)}
            className="icon-btn"
            title="Delete"
            style={{ minWidth: 32, minHeight: 32 }}
          >
            <Trash2 size={15} style={{ color: "var(--color-error)" }} />
          </button>
        </div>
      ),
    },
  ];

  const modalFooter = (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: "var(--space-3)",
      }}
    >
      <button
        type="button"
        onClick={closeModal}
        className="hospital-button hospital-button-secondary"
      >
        Cancel
      </button>
      <button type="button" onClick={save} className="hospital-button">
        Save
      </button>
    </div>
  );

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "var(--space-4)",
        }}
      >
        <h2
          style={{
            fontSize: "var(--font-h3)",
            fontWeight: 700,
            color: "var(--text-primary)",
            margin: 0,
          }}
        >
          Food Master
        </h2>
        <button
          type="button"
          onClick={() => openModal()}
          className="hospital-button hospital-button-sm"
        >
          <Plus size={14} /> Add Food Item
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchable
        emptyMessage="No food items found"
        emptyDescription="Add food items to build meal templates."
      />

      <Modal
        isOpen={isOpen}
        onClose={closeModal}
        title={editing ? "Edit Food Item" : "Add Food Item"}
        size="lg"
        className="food-master-modal"
        footer={modalFooter}
      >
        <div className="food-form">
          <div className="food-form__identity">
            <div className="food-field food-field--name">
              <label className="food-field__label">Item Name</label>
              <input
                className="food-input"
                placeholder="Enter food item name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="food-field">
              <label className="food-field__label">Category</label>
              <select
                className="food-input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="food-field">
              <label className="food-field__label">Standard Serving</label>
              <div className="food-quantity">
                <input
                  {...numberProps("standardQuantity")}
                  min="0.01"
                  step="0.01"
                  className="food-quantity__value"
                  aria-label="Standard quantity"
                />
                <select
                  className="food-quantity__unit"
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  aria-label="Serving unit"
                >
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="food-field">
              <label className="food-field__label">Status</label>
              <select
                className="food-input"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
              >
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          <section className="food-nutrition">
            <div className="food-section-heading">
              <div>
                <h3>Nutrition values</h3>
                <p>Enter values for one standard serving.</p>
              </div>
            </div>
            <div className="food-nutrition__grid">
              {[
                ["Calories", "calories", "kcal"],
                ["Protein", "protein", "g"],
                ["Carbohydrates", "carbs", "g"],
                ["Fat", "fat", "g"],
                ["Fiber", "fiber", "g"],
              ].map(([label, key, unit]) => (
                <div className="food-nutrition__item" key={key}>
                  <label className="food-field__label">{label}</label>
                  <div className="food-nutrition__input">
                    <input
                      {...numberProps(key)}
                      min="0"
                      step="0.1"
                      placeholder="0"
                      aria-label={`${label} per standard serving`}
                    />
                    <span>{unit}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {error && (
            <div
              className="hospital-alert hospital-alert-error"
              style={{ marginTop: "var(--space-3)" }}
            >
              {error}
            </div>
          )}
        </div>
      </Modal>

      {deleting && (
        <ConfirmDialog
          isOpen={true}
          onClose={closeDelete}
          onConfirm={async () => {
            try {
              const backendId = deleting.backendFoodId ?? deleting.id;
              // Nutrition has a unique food_id relationship, so resolve and
              // remove the nutrition row before deleting the parent Food row.
              let nutritionId = deleting.nutritionId;
              if (!nutritionId && !deleting.nutritionLoaded) {
                try {
                  const nutritionResponse =
                    await foodNutritionService.getNutritionById(backendId);
                  const nutritionRecord =
                    extractRows(nutritionResponse)[0] ||
                    nutritionResponse?.data ||
                    nutritionResponse?.result ||
                    nutritionResponse ||
                    {};
                  nutritionId = nutritionRecord?.id;
                } catch (error) {
                  if (error?.status !== 404) throw error;
                }
              }

              if (nutritionId) {
                const nutritionResponse =
                  await foodNutritionService.deleteNutrition(nutritionId);
                if (
                  nutritionResponse?.error ||
                  nutritionResponse?.statusCode >= 400 ||
                  nutritionResponse?.status >= 400
                ) {
                  throw new Error(
                    nutritionResponse?.message ||
                      nutritionResponse?.error?.message ||
                      "Failed to delete food nutrition.",
                  );
                }
              }

              const response = await foodService.deleteFood(backendId);
              if (
                response?.error ||
                response?.statusCode >= 400 ||
                response?.status >= 400
              ) {
                throw new Error(
                  response?.message ||
                    response?.error?.message ||
                    "Failed to delete food item",
                );
              }
              deleteRecord(KEYS.FOOD_MASTER, deleting.id);
              setDeleting(null);
              setData(getStore(KEYS.FOOD_MASTER, []) || []);
            } catch (error) {
              console.error("Food delete API Error:", error);
              alert(error?.message || "Unable to delete Food Item.");
            }
          }}
          title="Delete Food Item"
          message={`Delete "${deleting.name}"?`}
        />
      )}
    </div>
  );
}
