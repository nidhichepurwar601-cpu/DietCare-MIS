import React, { useState } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import MealTypesTab from "./MealTypesTab.jsx";
import FoodMasterTab from "./FoodMasterTab.jsx";
import DietTemplateTab from "./DietTemplateTab.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";

const TABS = [
  { id: "dietTemplate", label: "Diet Templates" }, // pick one name and use it everywhere
  { id: "mealTypes",    label: "Meal Types" },
  { id: "foodMaster",   label: "Food Master" },
];

export default function Master() {
  const [active, setActive] = useState("dietTemplate");

  return (
    <AppLayout>
      <HospitalPage
        eyebrow="Administration"
        title="Master Data"
        description="Configure diet plans, meal schedules and food items."
      >
        <div className="hospital-card" style={{ marginBottom: 0, padding: 0 }}>
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

          <div style={{ padding: "var(--space-4)" }}>
            {active === "dietTemplate" && <DietTemplateTab />}
            {active === "mealTypes"    && <MealTypesTab />}
            {active === "foodMaster"   && <FoodMasterTab />}
          </div>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}