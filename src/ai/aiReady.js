/**
 * Frontend extension points for future clinical AI services.
 * These hooks do not call a model and must not be presented as live AI.
 */
export const AI_CAPABILITIES = {
  PATIENT_SUMMARY: "patient_summary",
  CLINICAL_NOTES: "clinical_notes",
  DASHBOARD_INSIGHTS: "dashboard_insights",
  REVENUE_INSIGHTS: "revenue_insights",
  APPOINTMENT_PREDICTION: "appointment_prediction",
  BED_OCCUPANCY: "bed_occupancy_forecast",
  ALERT_DETECTION: "alert_detection",
  REPORT_SUMMARY: "report_summarization",
  CODING_ASSISTANT: "coding_assistant",
  SEARCH_ASSISTANT: "search_assistant",
};

export function isAiConfigured() {
  return false;
}

export async function requestAiCapability(capability, payload = {}) {
  return {
    ok: false,
    configured: false,
    capability,
    payload,
    reason: "AI services are not connected. This is a reserved frontend contract.",
  };
}

export function useAiCapability(capability) {
  return {
    capability,
    available: isAiConfigured(),
    run: (payload) => requestAiCapability(capability, payload),
  };
}
