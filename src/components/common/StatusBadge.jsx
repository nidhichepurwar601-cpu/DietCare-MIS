import React from "react";

/**
 * StatusBadge — semantic status chip used across all HIS tables.
 * Maps status strings to design-system color tokens.
 */

const STATUS_MAP = {
  // ── Active / Good ──
  Active:           { cls: "hospital-status-active",   dot: true },
  Completed:        { cls: "hospital-status-completed", dot: true },
  Delivered:        { cls: "hospital-status-delivered", dot: true },
  Taken:            { cls: "hospital-status-taken",     dot: true },
  Approved:         { cls: "hospital-status-completed", dot: true },
  Packed:           { cls: "hospital-status-completed", dot: true },
  Good:             { cls: "hospital-status-completed", dot: true },
  Reviewed:         { cls: "hospital-status-completed", dot: true },

  // ── Warning / In-progress ──
  Pending:          { cls: "hospital-status-pending",  dot: true },
  Preparing:        { cls: "hospital-status-preparing", dot: true },
  "In Progress":    { cls: "hospital-status-preparing", dot: true },
  Scheduled:        { cls: "hospital-status-scheduled", dot: true },
  "Due Soon":       { cls: "hospital-status-pending",  dot: true },
  "Due Today":      { cls: "hospital-status-pending",  dot: true },
  "Partially Taken":{ cls: "hospital-status-pending",  dot: true },
  Delivering:       { cls: "hospital-status-preparing", dot: true },
  Planning:         { cls: "hospital-status-planning",  dot: true },
  Assigned:         { cls: "hospital-status-assigned",  dot: true },

  // ── Info ──
  Dispatched:       { cls: "hospital-status-info",     dot: true },
  "Not Scheduled":  { cls: "hospital-status-info",     dot: false },

  // ── Danger / Alert ──
  Critical:         { cls: "hospital-status-critical", dot: true },
  Alert:            { cls: "hospital-status-alert",    dot: true },
  Overdue:          { cls: "hospital-status-overdue",  dot: true },
  "Not Taken":      { cls: "hospital-status-danger",   dot: true },
  Returned:         { cls: "hospital-status-danger",   dot: true },
  "Needs Review":   { cls: "hospital-status-danger",   dot: false },

  // ── Neutral ──
  Inactive:         { cls: "hospital-status-inactive", dot: false },
  Cancelled:        { cls: "hospital-status-cancelled",dot: false },
  "On Hold":        { cls: "hospital-status-hold",     dot: false },
  Discharged:       { cls: "hospital-status-inactive", dot: false },
  Prepared:         { cls: "hospital-status-info",     dot: true },
};

export default function StatusBadge({ status, className = "" }) {
  const s = String(status || "");
  const config = STATUS_MAP[s] || { cls: "hospital-status-inactive", dot: false };

  return (
    <span className={`hospital-status ${config.cls} ${className}`}>
      {config.dot && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {s || "—"}
    </span>
  );
}
