import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const SIZE_MAP = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  "2xl": "max-w-5xl",
  "3xl": "max-w-6xl",
  "4xl": "max-w-7xl",
};

export default function Modal({
  isOpen,
  onClose,
  title,
  size = "md",
  children,
  footer,
  preventClose = false,
  zIndex = 50,
  className = "",
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const preventCloseRef = useRef(preventClose);

  // Always keep the latest values without re-running the main effect
  useEffect(() => {
    onCloseRef.current = onClose;
    preventCloseRef.current = preventClose;
  });

  useEffect(() => {
    if (!isOpen) return;

    const handle = (e) => {
      if (e.key === "Escape" && !preventCloseRef.current) onCloseRef.current();
    };

    document.addEventListener("keydown", handle);
    document.body.style.overflow = "hidden";

    // Focus the dialog only if focus isn't already inside it
    const t = setTimeout(() => {
      if (!dialogRef.current?.contains(document.activeElement)) {
        dialogRef.current?.focus();
      }
    }, 10);

    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", handle);
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClass = SIZE_MAP[size] ?? SIZE_MAP.md;

  return createPortal(
    <div
      className="modal-overlay"
      style={{ zIndex }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !preventClose) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={`relative w-full ${sizeClass} max-h-[90vh] flex flex-col outline-none`}
        style={{
          background: "var(--surface-overlay)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-xl)",
          color: "var(--text-primary)",
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-secondary)",
            borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          }}
        >
          <h2
            id="app-modal-title"
            className="text-base font-bold"
            style={{ color: "var(--text-primary)", margin: 0 }}
          >
            {title}
          </h2>
          {!preventClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="icon-btn"
              style={{ minWidth: 32, minHeight: 32 }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Body */}
        <div className={`p-6 overflow-y-auto flex-1 ${className}`}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div
            className="px-6 py-4 shrink-0"
            style={{
              borderTop: "1px solid var(--border)",
              background: "var(--bg-secondary)",
              borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
