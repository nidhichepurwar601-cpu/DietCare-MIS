import React from "react";

/**
 * AppSkeleton — shimmer placeholder used during loading states.
 * Usage:
 *   <AppSkeleton lines={3} />
 *   <AppSkeleton variant="card" />
 *   <AppSkeleton variant="table" rows={6} />
 *   <AppSkeleton variant="stat" count={4} />
 */
export default function AppSkeleton({
  variant = "lines",
  lines   = 3,
  rows    = 5,
  count   = 4,
  className = "",
}) {
  if (variant === "stat") {
    return (
      <div className={`grid gap-4 ${className}`}
        style={{ gridTemplateColumns: `repeat(${Math.min(count, 4)}, 1fr)` }}>
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            className="hospital-card"
            style={{ padding: "var(--space-5)" }}
          >
            <SkeletonLine width="40%" height={10} />
            <SkeletonLine width="60%" height={32} style={{ marginTop: "var(--space-3)" }} />
            <SkeletonLine width="55%" height={10} style={{ marginTop: "var(--space-2)" }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div className={`hospital-table-wrap ${className}`}>
        {/* Header */}
        <div style={{ padding: "var(--space-3) var(--space-4)", background: "var(--bg-secondary)", display: "flex", gap: "var(--space-4)" }}>
          {[30, 20, 15, 20, 15].map((w, i) => (
            <SkeletonLine key={i} width={`${w}%`} height={10} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              padding: "var(--space-3) var(--space-4)",
              display: "flex",
              gap: "var(--space-4)",
              borderTop: "1px solid var(--border)",
            }}
          >
            {[30, 20, 15, 20, 15].map((w, j) => (
              <SkeletonLine key={j} width={`${w}%`} height={12} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div className={`hospital-card ${className}`} style={{ padding: "var(--space-5)" }}>
        <SkeletonLine width="55%" height={14} />
        <SkeletonLine width="100%" height={10} style={{ marginTop: "var(--space-3)" }} />
        <SkeletonLine width="85%" height={10} style={{ marginTop: "var(--space-2)" }} />
        <SkeletonLine width="70%" height={10} style={{ marginTop: "var(--space-2)" }} />
      </div>
    );
  }

  // Default: lines
  return (
    <div className={`app-skeleton ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine
          key={i}
          width={i === lines - 1 ? "65%" : "100%"}
          height={12}
        />
      ))}
    </div>
  );
}

function SkeletonLine({ width = "100%", height = 12, style = {} }) {
  return (
    <div
      className="app-skeleton-line"
      style={{ width, height, borderRadius: 6, ...style }}
    />
  );
}

/** Page-level loading state — full-height centered spinner */
export function PageLoader({ message = "Loading…" }) {
  return (
    <div className="page-loading">
      <div className="app-boot-spinner" />
      <span style={{ color: "var(--text-secondary)", fontSize: "var(--font-body)" }}>
        {message}
      </span>
    </div>
  );
}

/** Inline error state for sections */
export function SectionError({ message = "Something went wrong.", onRetry }) {
  return (
    <div
      className="hospital-alert hospital-alert-error"
      style={{ margin: "var(--space-4) 0" }}
    >
      <span style={{ flex: 1 }}>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="hospital-button hospital-button-sm hospital-button-danger"
        >
          Retry
        </button>
      )}
    </div>
  );
}
