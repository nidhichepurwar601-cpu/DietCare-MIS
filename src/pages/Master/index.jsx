import React, { useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import MealTypesTab from "./MealTypesTab.jsx";
import FoodMasterTab from "./FoodMasterTab.jsx";
import DietTemplateTab from "./DietTemplateTab.jsx";
import DietTypesTab from "./DietTypesTab.jsx";
import HospitalPage, { HospitalCard } from "../../components/common/HospitalPage.jsx";

const TABS = [
  { id: "dietTypes",    label: "Diet Plans" },
  { id: "dietTemplate", label: "Diet Template" },
  { id: "mealTypes",   label: "Meal Types" },
  { id: "foodMaster",  label: "Food Master" },
];

export default function Master() {
  const [active, setActive] = useState("dietTypes");

  return (
    <AppLayout>
      <HospitalPage
        eyebrow="Administration"
        title="Master Data"
        description="Configure diet plans, meal schedules, food items and diet templates."
      >
        <div className="hospital-card" style={{ marginBottom: 0, padding: 0 }}>
          {/* Tab bar */}
          <div className="hospital-tabs" style={{ padding: "var(--space-2) var(--space-4) 0 var(--space-4)" }}>
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active === t.id}
                onClick={() => setActive(t.id)}
                className={`hospital-tab ${active === t.id ? "active" : ""}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ padding: "var(--space-4)" }}>
            {active === "dietTypes"    && <DietTypesTab />}
            {active === "dietTemplate" && <DietTemplateTab />}
            {active === "mealTypes"    && <MealTypesTab />}
            {active === "foodMaster"   && <FoodMasterTab />}
          </div>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
