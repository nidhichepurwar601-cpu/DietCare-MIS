import React, { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert, CheckCircle2, Info } from "lucide-react";
import { getClinicalAlertsForPatient } from "../../lib/clinicalAlerts.js";

export default function DietaryAlerts({ patient, diet }) {
  const [, refresh] = useState(0);

  useEffect(() => {
    const update = () => refresh((v) => v + 1);
    window.addEventListener("dietcare-store-updated", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("dietcare-store-updated", update);
      window.removeEventListener("storage", update);
    };
  }, []);

  if (!patient) return null;
  const alerts = getClinicalAlertsForPatient(patient.id);

  if (alerts.length === 0) {
    return (
      <div className="hospital-alert hospital-alert-success" style={{ borderRadius: "var(--radius)" }}>
        <CheckCircle2 size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: "var(--font-body)" }}>No Dietary Alerts</div>
          <div style={{ fontSize: "var(--font-caption)", marginTop: 2 }}>
            No current allergy, clinical, diet workflow or meal-intake alerts.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
      <h3 style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-2)",
        fontSize: "var(--font-body)",
        fontWeight: 700,
        color: "var(--text-primary)",
        margin: 0,
      }}>
        <ShieldAlert size={16} style={{ color: "var(--color-error)" }} />
        Clinical &amp; Dietary Alerts
      </h3>

      {alerts.map((alert) => {
        const isCritical = alert.severity === "High";
        const isWarning  = alert.severity === "Medium";
        const alertClass = isCritical
          ? "hospital-alert hospital-alert-error"
          : isWarning
            ? "hospital-alert hospital-alert-warning"
            : "hospital-alert hospital-alert-info";

        return (
          <div key={alert.id} className={alertClass} style={{ borderRadius: "var(--radius)" }}>
            {isCritical || isWarning
              ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
              : <Info size={15} style={{ flexShrink: 0, marginTop: 2 }} />
            }
            <div>
              <div style={{ fontWeight: 800, fontSize: "var(--font-label)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {alert.type}
              </div>
              <div style={{ fontSize: "var(--font-body)", marginTop: 3 }}>{alert.message}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
