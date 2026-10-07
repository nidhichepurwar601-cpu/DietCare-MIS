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
  setStore,
  KEYS,
} from "../../lib/storage.js";
import dietTypeService from "../../services/dietTypeService.js";

const EMPTY = {
  code: "",
  name: "",
  description: "",
  targetCalories: 2000,
  proteinPercent: 15,
  carbsPercent: 55,
  fatPercent: 30,
  status: true,
  createdBy: "Admin", // or logged-in username
  updatedBy: "Admin",
};

const DIET_ROW_KEYS = [
  "name",
  "dietName",
  "dietTypeName",
  "dietType",
  "code",
  "dietCode",
  "dietTypeCode",
  "description",
  "dietDescription",
  "targetCalories",
  "calories",
  "kcal",
  "proteinPercent",
  "proteinPct",
  "carbsPercent",
  "carbsPct",
  "fatPercent",
  "fatPct",
];

const extractDietRows = (response) => {
  console.log("RAW API RESPONSE:", response);

  const parseValue = (value) => {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    if (!trimmed) return value;

    if (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    ) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return value;
      }
    }

    return value;
  };

  const scoreRows = (rows) => {
    if (!Array.isArray(rows) || rows.length === 0) return -1;

    return rows.reduce((score, row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        return score;
      }

      const keys = Object.keys(row).map((key) => key.toLowerCase());
      const matchedKeys = DIET_ROW_KEYS.filter((key) =>
        keys.includes(key.toLowerCase()),
      ).length;

      return score + matchedKeys;
    }, 0);
  };

  const candidates = [];
  const visited = new Set();

  const collectArrays = (value, path = "response", depth = 0) => {
    value = parseValue(value);

    if (!value || typeof value !== "object" || depth > 8) return;

    if (visited.has(value)) return;
    visited.add(value);

    if (Array.isArray(value)) {
      const rows = value.filter(
        (item) =>
          item !== null && typeof item === "object" && !Array.isArray(item),
      );

      if (rows.length > 0) {
        candidates.push({
          rows,
          path,
          score: scoreRows(rows),
        });
      }

      rows.forEach((row, index) => {
        collectArrays(row, `${path}[${index}]`, depth + 1);
      });
      return;
    }

    Object.entries(value).forEach(([key, child]) => {
      collectArrays(child, `${path}.${key}`, depth + 1);
    });
  };

  collectArrays(response);

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.rows.length - a.rows.length;
  });

  const best = candidates[0];

  if (best) {
    console.log("DIET DATA ARRAY PATH:", best.path);
    console.log("DIET DATA ROW COUNT:", best.rows.length);
    return best.rows;
  }

  console.warn("No diet-type array found in backend response.");
  return [];
};

const normalizeStatus = (value, defaultValue = true) => {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }

  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;

  const normalized = String(value).trim().toLowerCase();

  if (["true", "1", "active", "enabled", "yes", "y"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "inactive", "disabled", "no", "n"].includes(normalized)) {
    return false;
  }

  return defaultValue;
};

const normalizeDietType = (item, index = 0) => {
  if (!item || typeof item !== "object") return null;

  const statusValue =
    item.status ?? item.active ?? item.isActive ?? item.enabled ?? true;

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
    targetCalories: Number(
      item.targetCalories ?? item.calories ?? item.kcal ?? item.targetKcal ?? 0,
    ),
    proteinPercent: Number(
      item.proteinPercent ??
        item.proteinPct ??
        item.proteinPercentage ??
        item.protein ??
        0,
    ),
    carbsPercent: Number(
      item.carbsPercent ??
        item.carbsPct ??
        item.carbohydratePercent ??
        item.carbohydrates ??
        0,
    ),
    fatPercent: Number(
      item.fatPercent ?? item.fatPct ?? item.fatPercentage ?? item.fat ?? 0,
    ),
    status: normalizeStatus(statusValue, true),
  };
};

const extractDietTotal = (response, rows = []) => {
  const totalKeys = [
    "totalCount",
    "totalRecords",
    "totalElements",
    "totalItems",
    "recordCount",
    "count",
  ];

  const paginationKeys = [
    "paginationInfo",
    "pagination",
    "pageInfo",
    "pageDetails",
  ];

  const visited = new Set();
  let foundTotal = null;

  const findTotal = (value, depth = 0) => {
    if (foundTotal !== null || !value || depth > 8) return;
    if (typeof value !== "object") return;
    if (visited.has(value)) return;
    visited.add(value);

    for (const key of totalKeys) {
      const candidate = Number(value?.[key]);
      if (Number.isFinite(candidate) && candidate >= 0) {
        foundTotal = candidate;
        return;
      }
    }

    for (const key of paginationKeys) {
      if (value?.[key]) {
        findTotal(value[key], depth + 1);
        if (foundTotal !== null) return;
      }
    }

    Object.values(value).forEach((child) => {
      if (foundTotal === null) findTotal(child, depth + 1);
    });
  };

  findTotal(response);

  return foundTotal ?? rows.length;
};

export default function DietTypesTab() {
  const [data, setData] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);

  const loadInMemoryDietTypes = (currentPage = 1, pageSize = 10) => {
    const stored = getStore(KEYS.DIET_TYPES) || [];
    const start = (currentPage - 1) * pageSize;
    const pageData = stored.slice(start, start + pageSize);

    setData(pageData);
    setTotalItems(stored.length);
    setIsOnline(false);

    console.log("OFFLINE MODE: Current-session diet types displayed.");
    console.log("SESSION RECORD COUNT:", stored.length);
  };

  useEffect(() => {
    getPaginatedDietTypesFromApi(1, 10, "");
  }, []);

  const openModal = (r = null) => {
    setEditing(r);

    if (r) {
      setForm({ ...r });
    } else {
      setForm({ ...EMPTY });
    }

    setIsOpen(true);
  };

  const getPaginatedDietTypesFromApi = async (
    currentPage = 1,
    pageSize = 10,
    name = "",
  ) => {
    setLoading(true);

    try {
      const payload = {
        code: "",
        name: String(name || ""),
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

      console.log("========================================");
      console.log("DIET TYPES: BACKEND REQUEST");
      console.log("URL:", "configured DIET_TYPE.GET_ALL endpoint");
      console.log("PAYLOAD:", payload);

      const response = await dietTypeService.getAllTypes(payload);

      console.log("BACKEND RESPONSE:", response);

      if (!response) {
        throw new Error("Backend returned an empty response.");
      }

      const rawRows = extractDietRows(response);
      const rows = rawRows
        .map((item, index) => normalizeDietType(item, index))
        .filter(Boolean);
      const total = extractDietTotal(response, rows);

      console.log("BACKEND ROWS:", rows);
      console.log("BACKEND ROW COUNT:", rows.length);
      console.log("BACKEND TOTAL:", total);

      /*
       * A successful HTTP/API response is ONLINE mode.
       * An empty backend result is valid and must NOT
       * automatically be replaced by a stale session cache.
       */
      setData(rows);
      setTotalItems(total);
      setPage(currentPage);
      setIsOnline(true);

      /*
       * Keep the current-session cache complete across backend pages.
       */
      if (rows.length > 0) {
        const existing = getStore(KEYS.DIET_TYPES) || [];
        const merged = [...existing];

        rows.forEach((row) => {
          const rowId = row.id;
          const existingIndex = merged.findIndex(
            (item) => String(item?.id) === String(rowId),
          );

          if (existingIndex >= 0) {
            merged[existingIndex] = row;
          } else {
            merged.push(row);
          }
        });

        setStore(KEYS.DIET_TYPES, merged);

        console.log("Current-session diet type cache updated.");
      }

      console.log("ONLINE MODE: Backend database data displayed.");
    } catch (error) {
      console.warn("Backend unavailable; using current-session data only.", error);

      loadInMemoryDietTypes(currentPage, pageSize);
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    const commonPayload = {
      name: form.name?.trim() || "",
      code: form.code?.trim() || "",
      description: form.description?.trim() || "",
      targetCalories: Number(form.targetCalories),
      proteinPercent: Number(form.proteinPercent),
      carbsPercent: Number(form.carbsPercent),
      fatPercent: Number(form.fatPercent),
      status: Boolean(form.status),
    };

    const payload = editing?.id
      ? { ...commonPayload, createdBy: form.createdBy || "Admin", updatedBy: "Admin" }
      : { ...commonPayload, createdBy: form.createdBy || "Admin" };

    if (!payload.name || !payload.code) {
      alert("Name and Code are required.");
      return;
    }

    try {
      const response = editing?.id
        ? await dietTypeService.updateTypeById(editing.id, payload)
        : await dietTypeService.createType(payload);

      if (response && !response.error) {
        alert(
          editing
            ? "Diet Plan updated successfully."
            : "Diet Plan added successfully.",
        );

        setForm(EMPTY);
        setEditing(null);
        setIsOpen(false);
        setPage(1);

        await getPaginatedDietTypesFromApi(1, 10, "");
        return;
      }

      alert(response?.message || "Backend rejected the Diet Plan request.");
    } catch (error) {
      console.warn("Backend unavailable. Saving Diet Plan locally.", error);

      const offlineRecord = {
        ...payload,
        id: crypto.randomUUID(),
        offline: true,
        syncStatus: "PENDING",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      addRecord(KEYS.DIET_TYPES, offlineRecord);

      alert("Backend unavailable. Diet Plan saved locally for offline use.");

      setForm(EMPTY);
      setEditing(null);
      setIsOpen(false);
      setPage(1);
      loadInMemoryDietTypes(1, 10);
    }
  };

  const columns = [
    { key: "name", label: "Name" },
    { key: "code", label: "Code" },
    { key: "description", label: "Description" },
    {
      key: "targetCalories",
      label: "Targets",
      render: (r) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--font-body)", color: "var(--text-primary)" }}>
            {r.targetCalories} kcal
          </div>
          <div style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>
            P:{r.proteinPercent}% · C:{r.carbsPercent}% · F:{r.fatPercent}%
          </div>
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => {
        const isActive = normalizeStatus(r.status, true);
        return <StatusBadge status={isActive ? "Active" : "Inactive"} />;
      },
    },
    {
      key: "actions",
      label: "",
      sortable: false,
      render: (r) => (
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--space-2)" }}>
          <button type="button" onClick={() => openModal(r)} className="icon-btn" title="Edit" style={{ minWidth: 32, minHeight: 32 }}>
            <Edit size={15} style={{ color: "var(--color-info)" }} />
          </button>
          <button type="button" onClick={() => setDeleting(r)} className="icon-btn" title="Delete" style={{ minWidth: 32, minHeight: 32 }}>
            <Trash2 size={15} style={{ color: "var(--color-error)" }} />
          </button>
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
        <div>
          <h2 style={{ fontSize: "var(--font-h3)", fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Diet Plans</h2>
          {loading && <span style={{ fontSize: "var(--font-caption)", color: "var(--text-secondary)" }}>Loading…</span>}
        </div>
        <button type="button" onClick={() => openModal()} className="hospital-button hospital-button-sm">
          <Plus size={14} /> Add Diet Plan
        </button>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchable
        pagination={10}
        serverPagination={isOnline}
        currentPage={page}
        totalItems={totalItems}
        onPageChange={(newPage) => {
          setPage(newPage);
          if (isOnline) getPaginatedDietTypesFromApi(newPage, 10, "");
          else loadInMemoryDietTypes(newPage, 10);
        }}
        emptyMessage="No diet plans found"
        emptyDescription="Add a diet plan to get started."
      />

      <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title={editing ? "Edit Diet Plan" : "Add Diet Plan"} footer={modalFooter}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-4)" }}>
          {[["Name", "name"], ["Code", "code"]].map(([l, k]) => (
            <div key={k}>
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>{l}</label>
              <input className="hospital-input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Description</label>
            <textarea className="hospital-textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {[["Target Calories (kcal)", "targetCalories"], ["Protein %", "proteinPercent"], ["Carbs %", "carbsPercent"], ["Fat %", "fatPercent"]].map(([l, k]) => (
            <div key={k}>
              <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>{l}</label>
              <input type="number" className="hospital-input" value={form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
            </div>
          ))}
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="hospital-label" style={{ display: "block", marginBottom: "var(--space-1)" }}>Status</label>
            <select className="hospital-select" value={form.status ? "true" : "false"} onChange={(e) => setForm({ ...form, status: e.target.value === "true" })}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            const response = await dietTypeService.deleteType(
              deleting.backendDietTypeId ?? deleting.id,
            );
            if (
              response?.error ||
              response?.statusCode >= 400 ||
              response?.status >= 400
            ) {
              throw new Error(
                response?.message ||
                  response?.error?.message ||
                  "The server rejected the diet type deletion.",
              );
            }
            deleteRecord(KEYS.DIET_TYPES, deleting.id);
            setDeleting(null);
            if (isOnline) {
              await getPaginatedDietTypesFromApi(page, 10, "");
            } else {
              loadInMemoryDietTypes(page, 10);
            }
          } catch (error) {
            console.error("Diet Type deletion failed", error);
            alert(error?.message || "Unable to delete Diet Type.");
          }
        }}
        title="Delete Diet Plan"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
      />
    </div>
  );
}
