import React from "react";
import { getCurrentRole, hasPermission } from "../../lib/permissions.js";

export default function AccessGuard({ permission, children, fallback=null }) {
  return hasPermission(getCurrentRole(), permission) ? children : fallback;
}
