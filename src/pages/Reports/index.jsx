import React, { useState, useEffect } from "react";
import AppLayout from "../../components/layouts/AppLayout.jsx";
import HospitalPage from "../../components/common/HospitalPage.jsx";
import DataTable from "../../components/common/DataTable.jsx";
import StatusBadge from "../../components/common/StatusBadge.jsx";
import {
  Filter,
  Calendar,
  Users,
  Utensils,
  Percent,
  DollarSign,
  ListChecks,
} from "lucide-react";
import { getStore, KEYS } from "../../lib/storage.js";

/* ── Constants ──────────────────────────────────────────────────── */
const WARDS = [
  "Cardiology",
  "Nephrology",
  "General Medicine",
  "Orthopedics",
  "ICU",
  "Oncology",
  "Pediatrics",
];
const REPORT_TYPES = [
  "Patient Diet Summary",
  "Daily Meal Report",
  "Diet Compliance Report",
  "Kitchen Preparation Report",
  "Delivery Report",
  "Meal Intake Report",
  "Activity History",
];
const REPORT_MEALS = [
  "Breakfast",
  "Mid-Morning",
  "Lunch",
  "Evening Snack",
  "Dinner",
  "Bedtime",
];

/* ── SummaryCard ────────────────────────────────────────────────── */
function SummaryCard({ title, value, icon: Icon, color }) {
  const palette = {
    blue: {
      border: "border-l-blue-500",
      bg: "bg-blue-50",
      text: "text-blue-600",
    },
    green: {
      border: "border-l-emerald-500",
      bg: "bg-emerald-50",
      text: "text-emerald-600",
    },
    orange: {
      border: "border-l-orange-500",
      bg: "bg-orange-50",
      text: "text-orange-600",
    },
    red: { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-600" },
  };
  const c = palette[color] ?? palette.blue;
  return (
    <div
      className={`reports-summary-card bg-white rounded-xl shadow-sm border p-4 border-l-4 ${c.border} flex items-center justify-between`}
    >
      <div>
        <p className="text-xs text-gray-500">{title}</p>
        <p className="text-xl font-bold text-gray-900 mt-0.5">{value}</p>
      </div>
      <div className={`p-2.5 rounded-full ${c.bg} ${c.text}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}

/* ── ReportSummaryCards ─────────────────────────────────────────── */
function ReportSummaryCards({ data, type }) {
  if (!data?.length) return null;

  if (type === "Patient Diet Summary") {
    const active = data.filter((d) => d.status === "Active").length;
    const avgCals =
      Math.round(data.reduce((s, d) => s + d.avgCalories, 0) / data.length) ||
      0;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total in Report"
          value={data.length}
          icon={Users}
          color="blue"
        />
        <SummaryCard
          title="Active Diet Plans"
          value={active}
          icon={ListChecks}
          color="green"
        />
        <SummaryCard
          title="Avg Target Calories"
          value={`${avgCals} kcal`}
          icon={Utensils}
          color="orange"
        />
      </div>
    );
  }
  if (type === "Daily Meal Report") {
    const totalMeals = data.reduce((s, d) => s + d.totalPatients, 0);
    const totalCals = data.reduce((s, d) => s + d.totalCalories, 0);
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Total Meals Delivered"
          value={totalMeals}
          icon={Utensils}
          color="blue"
        />
        <SummaryCard
          title="Wards Served"
          value={[...new Set(data.map((d) => d.ward))].length}
          icon={Users}
          color="green"
        />
        <SummaryCard
          title="Total Calories"
          value={`${(totalCals / 1000).toFixed(1)}k`}
          icon={ListChecks}
          color="orange"
        />
      </div>
    );
  }
  if (type === "Diet Compliance Report") {
    const avgComp =
      Math.round(data.reduce((s, d) => s + d.compliance, 0) / data.length) || 0;
    const good = data.filter((d) => d.status === "Good").length;
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <SummaryCard
          title="Avg Compliance"
          value={`${avgComp}%`}
          icon={Percent}
          color={avgComp >= 90 ? "green" : "orange"}
        />
        <SummaryCard title="On Track" value={good} icon={Users} color="blue" />
        <SummaryCard
          title="Needs Review"
          value={data.length - good}
          icon={ListChecks}
          color="red"
        />
      </div>
    );
  }

  return null;
}

/* ── ReportFilters ──────────────────────────────────────────────── */
function ReportFilters({ filters, onChange, onGenerate, onClear, dietTypes }) {
  return (
    <div className="hospital-filter-panel reports-filter-panel">
      <div className="hospital-field" style={{ flex: "1 1 160px" }}>
        <label className="hospital-label">Report Type</label>
        <select
          className="hospital-select"
          value={filters.reportType}
          onChange={(e) => onChange("reportType", e.target.value)}
        >
          {REPORT_TYPES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="hospital-field" style={{ flex: "0 1 150px" }}>
        <label className="hospital-label">From</label>
        <input
          type="date"
          className="hospital-input"
          value={filters.fromDate}
          onChange={(e) => onChange("fromDate", e.target.value)}
        />
      </div>
      <div className="hospital-field" style={{ flex: "0 1 150px" }}>
        <label className="hospital-label">To</label>
        <input
          type="date"
          className="hospital-input"
          value={filters.toDate}
          onChange={(e) => onChange("toDate", e.target.value)}
        />
      </div>
      <div className="hospital-field" style={{ flex: "0 1 150px" }}>
        <label className="hospital-label">Ward</label>
        <select
          className="hospital-select"
          value={filters.ward}
          onChange={(e) => onChange("ward", e.target.value)}
        >
          <option value="">All Wards</option>
          {WARDS.map((w) => (
            <option key={w}>{w}</option>
          ))}
        </select>
      </div>
      <div className="hospital-field" style={{ flex: "1 1 150px" }}>
        <label className="hospital-label">Diet Plan</label>
        <select
          className="hospital-select"
          value={filters.dietType}
          onChange={(e) => onChange("dietType", e.target.value)}
        >
          <option value="">All Diet Plans</option>
          {dietTypes
            .filter((d) => d.status === "Active")
            .map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
        </select>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "var(--space-2)",
          flexShrink: 0,
        }}
      >
        <button type="button" onClick={onGenerate} className="hospital-button">
          Search
        </button>
        <button
          type="button"
          onClick={onClear}
          className="hospital-button hospital-button-secondary"
        >
          Clear
        </button>
      </div>
    </div>
  );
}

/* ── ReportTable ────────────────────────────────────────────────── */
function ReportTable({ data, type }) {
  const columns =
    {
      "Patient Diet Summary": [
        { key: "id", label: "ID" },
        { key: "name", label: "Patient Name" },
        { key: "ward", label: "Ward" },
        { key: "dietType", label: "Diet Plan" },
        { key: "avgCalories", label: "Target Cal" },
        {
          key: "startDate",
          label: "Start Date",
          render: (r) => new Date(r.startDate).toLocaleDateString(),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => <StatusBadge status={r.status} />,
        },
      ],
      "Daily Meal Report": [
        {
          key: "date",
          label: "Date",
          render: (r) => new Date(r.date).toLocaleDateString(),
        },
        { key: "ward", label: "Ward" },
        { key: "mealType", label: "Meal Type" },
        { key: "totalPatients", label: "Patients Served" },
        {
          key: "foodItems",
          label: "Menu Summary",
          render: (r) => <span className="text-xs">{r.foodItems}</span>,
        },
        { key: "totalCalories", label: "Total Calories" },
      ],
      "Kitchen Preparation Report": [
        { key: "mealType", label: "Meal" },
        { key: "foodItem", label: "Food Item" },
        { key: "totalQuantity", label: "Total Quantity" },
        { key: "uom", label: "UOM" },
        { key: "patients", label: "Patients" },
      ],
      "Activity History": [
        { key: "date", label: "Date / Time" },
        { key: "module", label: "Module" },
        { key: "action", label: "Action" },
        { key: "patient", label: "Patient" },
        { key: "meal", label: "Meal" },
        { key: "status", label: "Status" },
      ],
      "Diet Compliance Report": [
        { key: "patient", label: "Patient Name" },
        { key: "dietType", label: "Diet Plan" },
        { key: "prescribedMeals", label: "Prescribed" },
        { key: "actualMeals", label: "Actual" },
        {
          key: "compliance",
          label: "Compliance",
          render: (r) => (
            <div className="flex items-center gap-2">
              <div className="w-20 bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${r.compliance >= 90 ? "bg-emerald-500" : "bg-yellow-500"}`}
                  style={{ width: `${r.compliance}%` }}
                />
              </div>
              <span className="text-xs font-medium">{r.compliance}%</span>
            </div>
          ),
        },
        {
          key: "status",
          label: "Status",
          render: (r) => (
            <span
              className={`text-xs font-medium ${r.status === "Good" ? "text-emerald-600" : "text-yellow-600"}`}
            >
              {r.status}
            </span>
          ),
        },
      ],
      "Delivery Report": [
        { key: "date", label: "Date" },
        { key: "patient", label: "Patient" },
        { key: "ward", label: "Ward" },
        { key: "meal", label: "Meal" },
        { key: "status", label: "Delivery Status" },
      ],
      "Meal Intake Report": [
        { key: "date", label: "Date" },
        { key: "patient", label: "Patient" },
        { key: "ward", label: "Ward" },
        { key: "meal", label: "Meal" },
        { key: "status", label: "Intake Status" },
        { key: "remarks", label: "Remarks" },
      ],
    }[type] ?? [];

  return (
    <>
      <div className="report-screen-table reports-table">
        <DataTable
          columns={columns}
          data={data}
          searchable={false}
          pagination={15}
        />
      </div>
      {/* PRINT REPORT: render the complete list separately so printing is not limited to the screen page. */}
      <div className="report-print-table">
        <table className="w-full text-left text-xs">
          <thead className="border-b">
            <tr>
              {columns.map((column) => (
                <th key={column.key} className="px-2 py-2 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={row.id ?? index} className="border-b">
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-2 align-top">
                    {column.render ? column.render(row) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ── Reports Page ───────────────────────────────────────────────── */
export default function Reports() {
  const today = new Date().toISOString().split("T")[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];

  const [patients, setPatients] = useState([]);
  const [dietTypes, setDietTypes] = useState([]);
  const [mealTypes, setMealTypes] = useState([]);
  const [foods, setFoods] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [filters, setFilters] = useState({
    fromDate: weekAgo,
    toDate: today,
    ward: "",
    dietType: "",
    reportType: REPORT_TYPES[0],
  });
  const [reportData, setReportData] = useState([]);
  const [screenReady, setScreenReady] = useState(false);
  const [screenError, setScreenError] = useState("");

  useEffect(() => {
    const rawPatients = getStore(KEYS.PATIENTS, []) || [];
    const pts = rawPatients.map((p) => ({
      ...p,
      dietTypeId: p.dietTypeId ? Number(p.dietTypeId) : null,
    }));

    const rawFoods = getStore(KEYS.FOOD_MASTER, []) || [];
    const rawMappings = getStore(KEYS.DIET_MAPPING, []) || [];

    setPatients(pts);
    setDietTypes(getStore(KEYS.DIET_TYPES, []) || []);
    setMealTypes(getStore(KEYS.MEAL_TYPES, []) || []);
    setFoods(rawFoods.map((f) => ({ ...f, id: Number(f.id) })));
    setMappings(
      rawMappings.map((m) => ({
        ...m,
        dietTypeId: Number(m.dietTypeId),
        mealTypeId: Number(m.mealTypeId),
        foodItems: Array.isArray(m.foodItems)
          ? m.foodItems.map((fid) => Number(fid))
          : [],
      })),
    );

    if (pts.length) {
      const dates = pts
        .map((p) => new Date(p.admissionDate))
        .filter((d) => !Number.isNaN(d.getTime()));
      if (dates.length) {
        const minDate = new Date(Math.min(...dates.map((d) => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map((d) => d.getTime())));
        setFilters((prev) => ({
          ...prev,
          fromDate: minDate.toISOString().split("T")[0],
          toDate: maxDate.toISOString().split("T")[0],
        }));
      }
    }
  }, []);

  useEffect(() => {
    try {
      setScreenError("");
      generate();
      setScreenReady(true);
    } catch (error) {
      console.error("Report generation failed", error);
      setScreenError("The report could not be generated.");
      setScreenReady(true);
    }
  }, [filters, patients, dietTypes, mealTypes, foods, mappings]);

  const generate = () => {
    const { reportType, ward, dietType, fromDate, toDate } = filters;
    const from = new Date(fromDate);
    const to = new Date(toDate);

    if (reportType === "Patient Diet Summary") {
      setReportData(
        patients
          .filter((p) => {
            if (ward && p.ward !== ward) return false;
            if (dietType && p.dietTypeId !== +dietType) return false;
            const d = new Date(p.admissionDate);
            return d >= from && d <= to;
          })
          .map((p) => {
            const diet = dietTypes.find((d) => d.id === p.dietTypeId);
            return {
              id: p.id,
              name: p.name,
              ward: p.ward,
              dietType: diet?.name ?? "Unassigned",
              avgCalories: diet?.calories ?? 0,
              startDate: p.admissionDate,
              status: p.status,
            };
          }),
      );
      return;
    }

    if (reportType === "Daily Meal Report") {
      const wards = ward ? [ward] : [...new Set(patients.map((p) => p.ward))];
      const active = patients.filter(
        (p) => p.status === "Active" && Number(p.dietTypeId) > 0,
      );
      const rows = [];
      wards.forEach((w) => {
        const wp = active.filter((p) => p.ward === w);
        if (!wp.length) return;
        mealTypes.forEach((meal) => {
          let count = 0,
            cals = 0;
          const items = new Set();
          wp.forEach((p) => {
            const map = mappings.find(
              (m) =>
                Number(m.dietTypeId) === Number(p.dietTypeId) &&
                m.mealTypeId === meal.id,
            );
            if (map) {
              count++;
              map.foodItems.forEach((fid) => {
                const f = foods.find((x) => Number(x.id) === Number(fid));
                if (f) {
                  cals += f.calories;
                  items.add(f.name);
                }
              });
            }
          });
          if (count > 0)
            rows.push({
              date: toDate,
              ward: w,
              mealType: meal.name,
              totalPatients: count,
              foodItems:
                [...items].slice(0, 3).join(", ") + (items.size > 3 ? "…" : ""),
              totalCalories: Math.round(cals),
            });
        });
      });
      setReportData(rows);
      return;
    }

    if (reportType === "Kitchen Preparation Report") {
      const totals = new Map();
      const active = patients.filter(
        (p) => p.status === "Active" && Number(p.dietTypeId) > 0,
      );
      active.forEach((p) => {
        if (ward && p.ward !== ward) return;
        if (dietType && Number(p.dietTypeId) !== Number(dietType)) return;
        mealTypes.forEach((meal) => {
          const map = mappings.find(
            (m) =>
              Number(m.dietTypeId) === Number(p.dietTypeId) &&
              Number(m.mealTypeId) === Number(meal.id),
          );
          if (!map) return;
          (map.foodItems || []).forEach((entry) => {
            const foodId =
              typeof entry === "object" ? (entry.foodId ?? entry.id) : entry;
            const food = foods.find((f) => Number(f.id) === Number(foodId));
            if (!food) return;
            const quantity =
              typeof entry === "object"
                ? entry.quantity
                : (map.quantityTexts?.[foodId] ??
                  map.quantities?.[foodId] ??
                  food.standardQuantity);
            const uom =
              typeof entry === "object"
                ? entry.unit
                : (map.units?.[foodId] ?? food.unit ?? "");
            const numeric = Number(
              String(quantity ?? "").match(/\d+(?:\.\d+)?/)?.[0] || 0,
            );
            const key = `${meal.name}__${food.name}__${uom || "—"}`;
            const current = totals.get(key) || {
              id: key,
              mealType: meal.name,
              foodItem: food.name,
              totalQuantity: 0,
              uom: uom || "—",
              patients: 0,
            };
            current.totalQuantity += numeric;
            current.patients += 1;
            totals.set(key, current);
          });
        });
      });
      setReportData(
        Array.from(totals.values()).map((r) => ({
          ...r,
          totalQuantity: Number.isInteger(r.totalQuantity)
            ? r.totalQuantity
            : Number(r.totalQuantity.toFixed(2)),
        })),
      );
      return;
    }

    if (reportType === "Diet Compliance Report") {
      setReportData(
        patients
          .filter((p) => p.status === "Active" && Number(p.dietTypeId) > 0)
          .map((p) => {
            const diet = dietTypes.find((d) => d.id === Number(p.dietTypeId));
            const prescribed =
              mappings.filter(
                (m) => Number(m.dietTypeId) === Number(p.dietTypeId),
              ).length * 7;
            const intakeStore = getStore("hd_intake_status", {}) || {};
            const patientMeals = Object.entries(intakeStore).filter(
              ([key]) =>
                key.includes(`-${p.id}-`) || key.startsWith(`${p.id}-`),
            );
            const taken = patientMeals.filter(
              ([, status]) => status === "Taken",
            ).length;
            const actual = prescribed ? Math.min(prescribed, taken) : 0;
            const compliance = prescribed
              ? Math.round((actual / prescribed) * 100)
              : 0;
            return {
              patient: p.name,
              dietType: diet?.name ?? "—",
              prescribedMeals: prescribed,
              actualMeals: actual,
              compliance,
              status: compliance >= 90 ? "Good" : "Needs Review",
            };
          }),
      );
      return;
    }

    if (reportType === "Delivery Report") {
      const mealStatus = getStore("hd_meal_status", {}) || {};
      setReportData(
        patients
          .filter((p) => !ward || p.ward === ward)
          .flatMap((p) =>
            REPORT_MEALS.map((meal) => ({
              id: `${toDate}-${p.id}-${meal}`,
              date: toDate,
              patient: p.name,
              ward: p.ward || "—",
              meal,
              status:
                mealStatus[`${toDate}-${p.id}-${meal}`] ||
                mealStatus[`${p.id}-${meal}`] ||
                "Pending",
            })),
          ),
      );
      return;
    }

    if (reportType === "Meal Intake Report") {
      const intakeStatus = getStore("hd_intake_status", {}) || {};
      setReportData(
        patients
          .filter((p) => !ward || p.ward === ward)
          .flatMap((p) => {
            const record = getStore(`hd_meal_intake_${p.id}_${toDate}`, null);
            return REPORT_MEALS.map((meal) => ({
              id: `${toDate}-${p.id}-${meal}`,
              date: toDate,
              patient: p.name,
              ward: p.ward || "—",
              meal,
              status:
                intakeStatus[`${toDate}-${p.id}-${meal}`] ||
                intakeStatus[`${p.id}-${meal}`] ||
                record?.meals?.find((item) => item.meal === meal)?.status ||
                "Pending",
              remarks:
                record?.meals?.find((item) => item.meal === meal)?.remarks ||
                record?.remarks ||
                "—",
            }));
          }),
      );
      return;
    }

    if (reportType === "Activity History") {
      const history = getStore(KEYS.DIET_HISTORY, []) || [];
      setReportData(
        history
          .filter((event) => {
            const date = String(event.serviceDate || "").slice(0, 10);
            if (fromDate && date < fromDate) return false;
            if (toDate && date > toDate) return false;
            if (ward && event.ward && event.ward !== ward) return false;
            return true;
          })
          .slice(0, 500)
          .map((event) => ({
            id: event.id,
            date: event.eventDate
              ? new Date(event.eventDate).toLocaleString()
              : event.serviceDate || "—",
            module: event.module || "—",
            action: event.action || "—",
            patient: event.patientName || event.patientId || "—",
            meal: event.meal || "—",
            status: event.toStatus || "—",
          })),
      );
      return;
    }
  };

  const clearFilters = () => {
    setFilters({
      fromDate: weekAgo,
      toDate: today,
      ward: "",
      dietType: "",
      reportType: REPORT_TYPES[0],
    });
  };

  const exportCSV = () => {
    const csv =
      "data:text/csv;charset=utf-8," +
      reportData.map((r) => Object.values(r).join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute(
      "download",
      `report_${filters.reportType.replace(/\s+/g, "_").toLowerCase()}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printReport = () => {
    // PRINT REPORT: only the generated list is printed; the browser naturally flows long lists to page 2+.
    document.documentElement.classList.add("only-print-report");
    setTimeout(() => {
      window.print();
      setTimeout(
        () => document.documentElement.classList.remove("only-print-report"),
        500,
      );
    }, 100);
  };

  return (
    <AppLayout title="Reports & Analytics">
      <HospitalPage
        title={filters.reportType}
        description="Manage and export report data in a single view."
        className="reports-page"
      >
        <div className="reports-content">
          <div className="report-filters">
            <ReportFilters
              filters={filters}
              onChange={(k, v) => setFilters((p) => ({ ...p, [k]: v }))}
              onGenerate={generate}
              onClear={clearFilters}
              dietTypes={dietTypes}
            />
          </div>

          <div className="reports-summary">
            <ReportSummaryCards data={reportData} type={filters.reportType} />
          </div>

          <div className="report-controls">
            <span className="reports-count">
              Found {reportData.length}{" "}
              {reportData.length === 1 ? "record" : "records"}
            </span>
            <div className="reports-actions">
              <button
                onClick={exportCSV}
                className="hospital-button hospital-button-secondary hospital-button-sm"
              >
                Export CSV
              </button>
              <button
                onClick={printReport}
                className="hospital-button hospital-button-sm"
              >
                Print
              </button>
            </div>
          </div>

          <div className="report-list-panel hospital-card">
            {!screenReady ? (
              <div className="page-loading">
                <div className="app-boot-spinner" />
                <span>Loading report…</span>
              </div>
            ) : screenError ? (
              <div className="hospital-card-body">
                <div className="hospital-alert hospital-alert-error">
                  {screenError}
                  <button
                    type="button"
                    onClick={generate}
                    className="hospital-button hospital-button-danger hospital-button-sm"
                    style={{ marginLeft: "var(--space-3)" }}
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : !reportData.length ? (
              <div className="hospital-empty reports-empty">
                <div className="hospital-empty-icon">
                  <Filter size={22} />
                </div>
                <h3>No report records found</h3>
                <p>
                  Try a wider date range, another ward, or a different report
                  type.
                </p>
              </div>
            ) : (
              <ReportTable data={reportData} type={filters.reportType} />
            )}
          </div>
        </div>
      </HospitalPage>
    </AppLayout>
  );
}
