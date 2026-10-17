import React, { useState, useEffect } from "react";
import { Edit, Trash2, Plus } from "lucide-react";
import DataTable from "../../components/common/DataTable.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import ConfirmDialog from "../../components/common/ConfirmDialog.jsx";
import Modal from "../../components/common/Modal.jsx";
import {
  getStore,
  setStore,
  addRecord,
  updateRecord,
  deleteRecord,
  KEYS,
} from "../../lib/storage.js";
import mealTypeService from "../../services/mealTypeService.js";

const EMPTY = {
  code: "",
  name: "",
  time: "08:00",
  description: "",
  status: "Active",
};

export default function MealTypesTab() {
  const [data, setData] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY);

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

  const normalizeApiMealType = (item) => ({
    ...item,
    id: item.id ?? item.mealTypeId ?? item.meal_type_id,
    backendMealTypeId: item.id ?? item.mealTypeId ?? item.meal_type_id,
    code: item.code ?? "",
    name: item.name ?? "",
    time: item.time ?? item.scheduledTime ?? item.scheduled_time ?? "08:00",
    description: item.description ?? "",
    status:
      item.status === true ||
      item.status === 1 ||
      String(item.status).toLowerCase() === "active"
        ? "Active"
        : "Inactive",
  });

  const load = async () => {
    try {
      const response = await mealTypeService.getAllMealTypes({
        code: "",
        name: "",
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

      const list = Array.isArray(response?.data?.dataList)
        ? response.data.dataList
        : [];
      const rows = list
        .map(normalizeApiMealType)
        .filter((row) => row.id != null);

      setStore(KEYS.MEAL_TYPES, rows); // other pages read this key
      setData(rows);
    } catch (error) {
      console.error("Meal Type load failed:", error);
      alert(error?.message || "Unable to load meal types from the server.");
    }
  };
  useEffect(() => {
    load();
  }, []);

  const openModal = (r = null) => {
    setEditing(r);
    setForm(r ? { ...r } : EMPTY);
    setIsOpen(true);
  };
  const save = async () => {
    const code = String(form.code || "").trim();
    const name = String(form.name || "").trim();

    // 1. Validate first. Nothing is sent and nothing is saved if this fails.
    if (!code || !name) {
      alert("Meal type code and name are required.");
      return;
    }

    // 2. The time input gives "08:00". The backend expects "08:00:00".
    const time =
      form.time && form.time.length === 5
        ? `${form.time}:00`
        : form.time || "08:00:00";

    const commonPayload = {
      code,
      name,
      scheduledTime: time,
      description: String(form.description || "").trim(),
      status: form.status === "Active",
    };

    try {
      // 3. Send to the server (update or create).
      const response = editing
        ? await mealTypeService.updateMealTypeById(
            editing.backendMealTypeId ?? editing.id,
            { ...commonPayload, updatedBy: "Admin" },
          )
        : await mealTypeService.createMealType({
            ...commonPayload,
            createdBy: "Admin",
          });

      if (!response || response.error || response.statusCode >= 400) {
        throw new Error(
          response?.message ||
            response?.error?.message ||
            "Failed to save meal type",
        );
      }

      // 4. Success: close the modal and reload from the database.
      setIsOpen(false);
      await load();
    } catch (error) {
      // 5. Failure: show the error and keep the modal open. No local copy is saved.
      console.error("Meal Type API Error:", error);
      alert(error?.message || "Failed to save meal type.");
    }
  };
  const columns = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "time", label: "Scheduled Time" },
    { key: "description", label: "Description" },
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
        onClick={() => setIsOpen(false)}
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
          Meal Types
        </h2>
        <button
          type="button"
          onClick={() => openModal()}
          className="hospital-button hospital-button-sm"
        >
          <Plus size={14} /> Add Meal Type
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchable
        emptyMessage="No meal types found"
        emptyDescription="Add meal types to schedule daily hospital meals."
      />

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={editing ? "Edit Meal Type" : "Add Meal Type"}
        footer={modalFooter}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--space-4)",
          }}
        >
          {[
            ["Code", "code", "text"],
            ["Name", "name", "text"],
            ["Scheduled Time", "time", "time"],
          ].map(([l, k, t]) => (
            <div key={k}>
              <label
                className="hospital-label"
                style={{ display: "block", marginBottom: "var(--space-1)" }}
              >
                {l}
              </label>
              <input
                type={t}
                className="hospital-input"
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </div>
          ))}
          <div>
            <label
              className="hospital-label"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Status
            </label>
            <select
              className="hospital-select"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              <option>Active</option>
              <option>Inactive</option>
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label
              className="hospital-label"
              style={{ display: "block", marginBottom: "var(--space-1)" }}
            >
              Description
            </label>
            <textarea
              className="hospital-textarea"
              rows={2}
              value={form.description}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            const response = await mealTypeService.deleteMealType(deleting.id);
            if (response?.error || response?.statusCode >= 400) {
              throw new Error(
                response?.message ||
                  response?.error?.message ||
                  "Failed to delete meal type",
              );
            }
            setDeleting(null);
            await load();
          } catch (error) {
            console.error("Meal Type delete API Error:", error);
            alert(error?.message || "Unable to delete Meal Type.");
          }
        }}
        title="Delete Meal Type"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  );
}
