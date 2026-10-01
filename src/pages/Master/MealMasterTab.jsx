import React, { useState, useEffect } from "react";
import { Edit, Trash2, Plus } from "lucide-react";
import DataTable from "../../components/common/DataTable.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Modal from "../../components/common/Modal.jsx";
import {
  getStore,
  addRecord,
  updateRecord,
  deleteRecord,
  KEYS,
  normalizeUnit,
  positiveQuantity,
  resolveQuantity,
} from "../../lib/storage.js";
import templateItemService from "../../services/templateItemService.js";

const UNIT_OPTIONS = ["g", "kg", "ml", "L", "piece", "slice", "cup", "bowl"];

const EMPTY = {
  dietTemplateId: "",
  mealTypeId: "",
  foodItems: [],
  quantities: {},
  instructions: "",
  status: "Active",
  selectedFoodItems: [],
};

export default function MealMasterTab() {
  const [data, setData] = useState([]);
  const [dietTemplates, setDietTemplates] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [selectedFoodId, setSelectedFoodId] = useState("");
  const [error, setError] = useState("");

  const extractRows = (response) => {
    const candidates = [];
    const visit = (value, depth = 0) => {
      if (!value || typeof value !== "object" || depth > 8) return;
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

  const load = () => {
    setData(getStore(KEYS.DIET_MAPPING));
    setDietTemplates(getStore(KEYS.DIET_TEMPLATES, []));
    setMealTypes(getStore(KEYS.MEAL_TYPES));
    setFoods(getStore(KEYS.FOOD_MASTER));
  };
  useEffect(load, []);

  const buildSelectedFoodItems = (mapping) => {
    const ids = Array.isArray(mapping?.foodItems) ? mapping.foodItems : [];
    return ids.map((foodId) => {
      const food = foods.find((item) => item.id === Number(foodId));
      const quantity = resolveQuantity(mapping?.quantities?.[foodId], food?.standardQuantity);
      return {
        foodId: Number(foodId),
        backendFoodId: Number(food?.backendFoodId ?? foodId),
        quantity,
        unit: normalizeUnit(food?.unit),
      };
    });
  };

  const openModal = (r = null) => {
    setEditing(r);
    setForm(r ? { ...r, dietTemplateId: r.dietTemplateId ?? "", selectedFoodItems: buildSelectedFoodItems(r) } : { ...EMPTY, selectedFoodItems: [] });
    setSelectedFoodId("");
    setError("");
    setIsOpen(true);
  };

  const addFoodItem = () => {
    if (!selectedFoodId) return;
    const food = foods.find((item) => item.id === Number(selectedFoodId));
    setForm((prev) => ({
      ...prev,
      selectedFoodItems: prev.selectedFoodItems.some((item) => item.foodId === Number(selectedFoodId))
        ? prev.selectedFoodItems
        : [...prev.selectedFoodItems, {
            foodId: Number(selectedFoodId),
            backendFoodId: Number(food?.backendFoodId ?? selectedFoodId),
            quantity: positiveQuantity(food?.standardQuantity),
            unit: normalizeUnit(food?.unit),
          }],
    }));
    setSelectedFoodId("");
  };

  const updateFoodItem = (foodId, patch) => {
    setForm((prev) => ({
      ...prev,
      selectedFoodItems: prev.selectedFoodItems.map((item) => item.foodId === foodId ? { ...item, ...patch } : item),
    }));
  };

  const removeFoodItem = (foodId) => {
    setForm((prev) => ({ ...prev, selectedFoodItems: prev.selectedFoodItems.filter((item) => item.foodId !== foodId) }));
  };

  const save = async () => {
    if (!form.dietTemplateId || !form.mealTypeId) { setError("Select a Diet Template and Meal Type."); return; }
    const selectedFoodItems = (form.selectedFoodItems || []).filter((item) => item.foodId);
    const invalidItem = selectedFoodItems.find((item) => !positiveQuantity(item.quantity) || !normalizeUnit(item.unit));
    if (invalidItem) { setError("Every food item needs a quantity greater than 0 and a unit."); return; }

    const d = {
      ...form,
      dietTemplateId: +form.dietTemplateId,
      mealTypeId: +form.mealTypeId,
      foodItems: selectedFoodItems.map((item) => item.foodId),
      quantities: Object.fromEntries(selectedFoodItems.map((item) => [item.foodId, positiveQuantity(item.quantity)])),
      units: Object.fromEntries(selectedFoodItems.map((item) => [item.foodId, normalizeUnit(item.unit)])),
    };

    const templateId = Number(form.dietTemplateId);
    const mealTypeId = Number(form.mealTypeId);

    let existingItems = [];
    try {
      const response = await templateItemService.getItemsByTemplateId(templateId);
      existingItems = extractRows(response).filter((row) => Number(row?.mealTypeId ?? row?.meal_type_id) === mealTypeId);
    } catch (error) {
      if (editing) throw new Error(error?.message || "Unable to load existing Diet Template Items.");
    }

    const usedExistingIds = new Set();
    for (const item of selectedFoodItems) {
      const itemPayload = {
        mealTypeId,
        foodId: Number(item.backendFoodId ?? foods.find((food) => Number(food.id) === Number(item.foodId))?.backendFoodId ?? item.foodId),
        amount: Number(positiveQuantity(item.quantity)),
        unit: normalizeUnit(item.unit),
      };
      const existing = existingItems.find((row) => Number(row?.foodId ?? row?.food_id) === Number(item.backendFoodId ?? foods.find((food) => Number(food.id) === Number(item.foodId))?.backendFoodId ?? item.foodId));
      if (existing?.id != null) {
        usedExistingIds.add(String(existing.id));
        const response = await templateItemService.updateItemById(existing.id, itemPayload);
        if (!response || response.error || response.statusCode >= 400 || response.status >= 400) throw new Error(response?.message || response?.error?.message || "Failed to update a Diet Template Item.");
      } else {
        const response = await templateItemService.createItem({ dietTemplateId: templateId, ...itemPayload });
        if (!response || response.error || response.statusCode >= 400 || response.status >= 400) throw new Error(response?.message || response?.error?.message || "Failed to create a Diet Template Item.");
      }
    }

    for (const existing of existingItems) {
      if (existing?.id == null || usedExistingIds.has(String(existing.id))) continue;
      const response = await templateItemService.deleteItem(existing.id);
      if (response?.error || response?.statusCode >= 400 || response?.status >= 400) throw new Error(response?.message || response?.error?.message || "Failed to delete a Diet Template Item.");
    }

    delete d.selectedFoodItems;
    editing ? updateRecord(KEYS.DIET_MAPPING, editing.id, d) : addRecord(KEYS.DIET_MAPPING, d);
    setIsOpen(false);
    load();
  };

  const columns = [
    {
      key: "dietTemplateId",
      label: "Diet Template",
      render: (r) => {
        const d = dietTemplates.find((x) => Number(x.id) === Number(r.dietTemplateId));
        return <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{d?.name ?? "—"}</span>;
      },
    },
    {
      key: "mealTypeId",
      label: "Meal Type",
      render: (r) => {
        const m = mealTypes.find((x) => x.id === r.mealTypeId);
        return m?.name ?? "—";
      },
    },
    {
      key: "foodItems",
      label: "Items",
      render: (r) => {
        const names = (r.foodItems || []).map((foodId) => foods.find((item) => item.id === Number(foodId))?.name).filter(Boolean).slice(0, 3);
        return (
          <div style={{ maxWidth: 220 }}>
            {names.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-1)" }}>
                {names.map((name) => <span key={name} className="hospital-status hospital-status-info">{name}</span>)}
              </div>
            ) : (
              <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>No food assigned</span>
            )}
          </div>
        );
      },
    },
    {
      key: "instructions",
      label: "Instructions",
      render: (r) => (
        <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180, display: "block" }} title={r.instructions}>
          {r.instructions || "—"}
        </span>
      ),
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", label: "", sortable: false,
      render: (r) => (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button type="button" onClick={() => openModal(r)} className="icon-btn" style={{ color: "var(--color-info)" }}><Edit size={15} /></button>
          <button type="button" onClick={() => setDeleting(r)} className="icon-btn" style={{ color: "var(--color-error)" }}><Trash2 size={15} /></button>
        </div>
      ),
    },
  ];

  const modalFooter = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-3)" }}>
      <button type="button" onClick={() => setIsOpen(false)} className="hospital-button hospital-button-secondary">Cancel</button>
      <button type="button" onClick={save} className="hospital-button">Save</button>
    </div>
  );

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "var(--font-h3)", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Diet Mappings</h2>
        <button type="button" onClick={() => openModal()} className="hospital-button hospital-button-sm"><Plus size={14} /> Add Mapping</button>
      </div>

      <DataTable columns={columns} data={data} searchable emptyMessage="No diet mappings found" emptyDescription="Map a diet template to meal types and food items." />

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editing ? "Edit Diet Mapping" : "Add Diet Mapping"} size="lg" footer={modalFooter}>
        <div className="space-y-5">
          {error && <div className="hospital-alert hospital-alert-error">{error}</div>}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Diet Plan</label>
              <select className="hospital-select" value={form.dietTemplateId} onChange={(e) => setForm({ ...form, dietTemplateId: e.target.value })}>
                <option value="">-- Select Diet --</option>
                {dietTemplates.filter((d) => d.status === "Active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Meal Type</label>
              <select className="hospital-select" value={form.mealTypeId} onChange={(e) => setForm({ ...form, mealTypeId: e.target.value })}>
                <option value="">-- Select Meal --</option>
                {mealTypes.filter((m) => m.status === "Active").map((m) => <option key={m.id} value={m.id}>{m.name} ({m.time})</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Instructions</label>
              <textarea className="hospital-textarea" rows={2} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Serve warm, no added salt…" />
            </div>
            <div className="col-span-2">
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Status</label>
              <select className="hospital-select" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option>Active</option>
                <option>Inactive</option>
              </select>
            </div>
          </div>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "var(--space-4)" }}>
            <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-3)" }}>Assign Food Items for this Meal</label>
            <div style={{ background: "var(--bg-secondary)", borderRadius: "var(--radius)", border: "1px solid var(--border)", padding: "var(--space-3)", display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div className="grid gap-3 md:grid-cols-[1.5fr_100px_auto]">
                <div>
                  <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Food Item</label>
                  <select className="hospital-select" value={selectedFoodId} onChange={(e) => setSelectedFoodId(e.target.value)}>
                    <option value="">-- Select food --</option>
                    {foods.filter((item) => item.status === "Active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Qty</label>
                  <button type="button" onClick={addFoodItem} className="hospital-button hospital-button-secondary" style={{ width: "100%" }}>
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {(form.selectedFoodItems || []).length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  {(form.selectedFoodItems || []).map((item) => {
                    const food = foods.find((entry) => entry.id === item.foodId);
                    return (
                      <div key={item.foodId} className="grid gap-2 md:grid-cols-[1.4fr_90px_110px_auto]" style={{ borderRadius: "var(--radius-sm)", border: "1px solid var(--border)", background: "var(--surface)", padding: "var(--space-2)" }}>
                        <div>
                          <div style={{ fontSize: "var(--font-body)", fontWeight: 500, color: "var(--text-primary)" }}>{food?.name || "Food item"}</div>
                          <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>{food?.category || "—"}</div>
                        </div>
                        <div>
                          <label className="hospital-label" style={{ display: "block" }}>Qty</label>
                          <input type="number" min="0.01" step="0.01" className="hospital-input" value={item.quantity} onChange={(e) => updateFoodItem(item.foodId, { quantity: e.target.value })} />
                        </div>
                        <div>
                          <label className="hospital-label" style={{ display: "block" }}>Unit</label>
                          <select className="hospital-select" value={item.unit} onChange={(e) => updateFoodItem(item.foodId, { unit: e.target.value })}>
                            {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end" }}>
                          <button type="button" onClick={() => removeFoodItem(item.foodId)} className="icon-btn" style={{ color: "var(--color-error)" }}><Trash2 size={15} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p style={{ fontSize: "var(--font-body)", color: "var(--text-secondary)", margin: 0 }}>No food items assigned yet. Add one to start building the meal.</p>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            const templateId = Number(deleting?.dietTemplateId);
            const mealTypeId = Number(deleting?.mealTypeId);
            if (Number.isFinite(templateId) && Number.isFinite(mealTypeId)) {
              const response = await templateItemService.getItemsByTemplateId(templateId);
              const items = extractRows(response).filter((row) => Number(row?.mealTypeId ?? row?.meal_type_id) === mealTypeId);
              for (const item of items) {
                if (item?.id == null) continue;
                const deleteResponse = await templateItemService.deleteItem(item.id);
                if (deleteResponse?.error || deleteResponse?.statusCode >= 400 || deleteResponse?.status >= 400) throw new Error(deleteResponse?.message || deleteResponse?.error?.message || "Failed to delete a Diet Template Item.");
              }
            }
            deleteRecord(KEYS.DIET_MAPPING, deleting.id);
            setDeleting(null);
            load();
          } catch (error) {
            console.error("Diet Template Item delete API Error:", error);
            alert(error?.message || "Unable to delete Diet Mapping.");
          }
        }}
        title="Delete Mapping"
        message="Delete this diet mapping? This cannot be undone."
      />
    </div>
  );
}
