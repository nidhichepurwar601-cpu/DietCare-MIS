import {
  LayoutDashboard,
  Database,
  BarChart2,
  ChefHat,
  Users,
  Truck,
} from "lucide-react";
import { PERMISSIONS } from "../lib/permissions.js";

export const PAGE_TITLES = {
  "/": "Operations Dashboard",
  "/patients": "Diet Manager",
  "/diet-plans": "Nutrition Meal Plan",
  "/kitchen-operations": "Kitchen Operations",
  "/meal-delivery": "Meal to Bed",
  "/clinical-alerts": "Clinical Alerts",
  "/master": "Master Data",
  "/reports": "Reports & Analytics",
  "/profile": "Profile",
  "/settings": "Settings",
};

export const NAV_ITEMS = [
  {
    name: "Dashboard",
    to: "/",
    icon: LayoutDashboard,
    group: "OPERATIONS",
    permission: PERMISSIONS.DASHBOARD_VIEW,
    keywords: ["overview", "census", "meals"],
  },
  {
    name: "Diet Manager",
    to: "/patients",
    icon: Users,
    group: "OPERATIONS",
    permission: PERMISSIONS.PATIENT_VIEW,
    keywords: ["patient", "uhid", "ipd", "opd", "diet"],
  },
  {
    name: "Kitchen Operations",
    to: "/kitchen-operations",
    icon: ChefHat,
    group: "KITCHEN",
    permission: PERMISSIONS.KITCHEN_VIEW,
    keywords: ["kitchen", "prepare", "cook"],
  },
  {
    name: "Meal to Bed",
    to: "/meal-delivery",
    icon: Truck,
    group: "DELIVERY",
    permission: PERMISSIONS.DELIVERY_VIEW,
    keywords: ["delivery", "tray", "ward", "intake"],
  },
  {
    name: "Master Data",
    to: "/master",
    icon: Database,
    group: "ADMINISTRATION",
    permission: PERMISSIONS.MASTER_VIEW,
    keywords: ["food", "template", "meal type"],
  },
  {
    name: "Reports",
    to: "/reports",
    icon: BarChart2,
    group: "ADMINISTRATION",
    permission: PERMISSIONS.REPORT_VIEW,
    keywords: ["report", "export", "print"],
  },
];

export const NAV_GROUPS = [
  "OPERATIONS",
  "CLINICAL",
  "KITCHEN",
  "DELIVERY",
  "ADMINISTRATION",
];
