import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, LayoutGrid } from "lucide-react";
import { NAV_ITEMS } from "../../config/navigation.js";
import {
  getCurrentRole,
  hasPermission,
} from "../../lib/permissions.js";
import { getStore, KEYS } from "../../lib/storage.js";

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setActive(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(id);
  }, [open]);

  const results = useMemo(() => {
    const role = getCurrentRole();
    const q = query.trim().toLowerCase();
    const modules = NAV_ITEMS.filter((item) =>
      hasPermission(role, item.permission),
    )
      .filter((item) => {
        if (!q) return true;
        const hay = [item.name, item.to, ...(item.keywords || [])]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .map((item) => ({
        id: `mod-${item.to}`,
        group: "Modules",
        label: item.name,
        hint: item.to,
        icon: LayoutGrid,
        to: item.to,
      }));

    const patients = (getStore(KEYS.PATIENTS) || [])
      .filter((patient) => {
        if (!q) return false;
        const hay = [
          patient.name,
          patient.id,
          patient.uhid,
          patient.ipdNo,
          patient.opdNo,
          patient.ward,
          patient.bedNo,
          patient.primaryDiagnosis,
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 8)
      .map((patient) => ({
        id: `pat-${patient.id}`,
        group: "Patients",
        label: patient.name || `Patient ${patient.id}`,
        hint: `${patient.ward || "-"} / ${patient.bedNo || "-"} · ID ${patient.id}`,
        icon: Users,
        to: "/patients",
      }));

    return [...modules, ...patients];
  }, [query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (item) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(results.length - 1, value + 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(0, value - 1));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      go(results[active]);
    }
  };

  let lastGroup = "";

  return (
    <div className="command-palette-overlay print-hide" onClick={onClose}>
      <div
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search patients, UHID, wards, modules…"
          aria-label="Search DietCare"
        />
        <div className="command-palette-list" role="listbox">
          {results.length === 0 ? (
            <div
              style={{
                padding: "var(--space-8) var(--space-4)",
                textAlign: "center",
                fontSize: "var(--font-body)",
                color: "var(--text-secondary)",
              }}
            >
              No matching patients or modules.
            </div>
          ) : (
            results.map((item, index) => {
              const showGroup = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon = item.icon || Search;
              return (
                <React.Fragment key={item.id}>
                  {showGroup ? (
                    <div className="command-palette-group">{item.group}</div>
                  ) : null}
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className="command-palette-item"
                    onMouseEnter={() => setActive(index)}
                    onClick={() => go(item)}
                  >
                    <Icon size={16} />
                    <span className="min-w-0 flex-1">
                      <span style={{ display: "block", fontSize: "var(--font-body)", fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</span>
                      <span style={{ display: "block", fontSize: "var(--font-caption)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.hint}
                      </span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
