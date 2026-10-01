import React from "react";
import Modal from "./Modal.jsx";
import { AlertTriangle } from "lucide-react";

/**
 * ConfirmDialog — accessible confirmation modal with semantic danger styling.
 */
export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title     = "Confirm Action",
  message   = "Are you sure you want to proceed? This action cannot be undone.",
  confirmLabel = "Confirm",
  cancelLabel  = "Cancel",
  variant   = "danger",   // "danger" | "warning" | "info"
}) {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  const variantMap = {
    danger:  { iconColor: "var(--color-error)",   btnClass: "hospital-button hospital-button-danger" },
    warning: { iconColor: "var(--color-warning)",  btnClass: "hospital-button" },
    info:    { iconColor: "var(--hospital-primary)", btnClass: "hospital-button" },
  };

  const config = variantMap[variant] || variantMap.danger;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="hospital-button hospital-button-secondary"
            onClick={onClose}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={config.btnClass}
            onClick={handleConfirm}
            autoFocus
          >
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="flex items-start gap-4">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 44,
            height: 44,
            borderRadius: "var(--radius)",
            background: variant === "danger"
              ? "var(--color-error-soft)"
              : variant === "warning"
                ? "var(--color-warning-soft)"
                : "var(--hospital-primary-soft)",
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={22} style={{ color: config.iconColor }} />
        </div>
        <p style={{
          margin: 0,
          color: "var(--text-secondary)",
          fontSize: "var(--font-body)",
          lineHeight: 1.6,
          paddingTop: 4,
        }}>
          {message}
        </p>
      </div>
    </Modal>
  );
}
