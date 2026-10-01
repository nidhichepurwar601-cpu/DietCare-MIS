import React from "react";

/**
 * HospitalPage — standard page wrapper used by every HIS page.
 *
 * Usage:
 *   <HospitalPage
 *     eyebrow="Operations"
 *     title="Kitchen Operations"
 *     description="Manage daily meal preparation and kitchen workflow."
 *     actions={<button>Export</button>}
 *   >
 *     ...content
 *   </HospitalPage>
 */
export default function HospitalPage({
  eyebrow,
  title,
  description,
  actions,
  children,
  noPadding = false,
  className = "",
}) {
  return (
    <div className={`hospital-page ${className}`}>
      {(eyebrow || title || description || actions) && (
        <div className="hospital-page-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            {eyebrow && (
              <p className="hospital-page-eyebrow">{eyebrow}</p>
            )}
            {title && (
              <h1 className="hospital-page-title">{title}</h1>
            )}
            {description && (
              <p className="hospital-page-description">{description}</p>
            )}
          </div>
          {actions && (
            <div className="hospital-page-header-actions">{actions}</div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * HospitalCard — standard content card.
 */
export function HospitalCard({
  title,
  subtitle,
  actions,
  children,
  noPadding = false,
  className = "",
}) {
  return (
    <div className={`hospital-card ${className}`}>
      {(title || subtitle || actions) && (
        <div className="hospital-card-header">
          <div style={{ minWidth: 0, flex: 1 }}>
            {title && <h3 className="hospital-card-title">{title}</h3>}
            {subtitle && <p className="hospital-card-subtitle">{subtitle}</p>}
          </div>
          {actions && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      {!noPadding ? (
        <div className="hospital-card-body">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * StatCard — summary metric card for dashboards.
 */
export function StatCard({ icon: Icon, label, value, note, iconColor, accent }) {
  return (
    <div className="hospital-stat-card">
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="hospital-stat-label">{label}</p>
        <p className="hospital-stat-value">{value}</p>
        {note && <p className="hospital-stat-note">{note}</p>}
      </div>
      {Icon && (
        <div
          className="hospital-stat-icon"
          style={iconColor ? {
            background: `color-mix(in srgb, ${iconColor} 14%, var(--surface))`,
            color: iconColor,
          } : undefined}
        >
          <Icon size={20} />
        </div>
      )}
    </div>
  );
}

/**
 * EmptyState — consistent empty state for tables and sections.
 */
export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="hospital-empty">
      {Icon && (
        <div className="hospital-empty-icon">
          <Icon size={26} />
        </div>
      )}
      <h3>{title || "No data available"}</h3>
      {description && <p>{description}</p>}
      {action && <div style={{ marginTop: "var(--space-4)" }}>{action}</div>}
    </div>
  );
}

/**
 * SectionHeader — compact header row above a content section.
 */
export function SectionHeader({ title, subtitle, actions, className = "" }) {
  return (
    <div className={`hospital-section-header ${className}`}>
      <div style={{ minWidth: 0 }}>
        {title && <h3 className="hospital-section-title">{title}</h3>}
        {subtitle && <p className="hospital-section-subtitle">{subtitle}</p>}
      </div>
      {actions && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
