export function assertApiSuccess(response, label) {
  if (response == null) return response;
  if (
    response.error ||
    response.statusCode >= 400 ||
    response.status >= 400
  ) {
    throw new Error(
      response?.message ||
        response?.error?.message ||
        `The server rejected the ${label} request.`,
    );
  }
  return response;
}

export function extractApiRows(response, predicate = () => true) {
  const candidates = [];
  const seen = new Set();
  const visit = (value, depth = 0) => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return;
      }
    }
    if (!value || typeof value !== "object" || depth > 8 || seen.has(value))
      return;
    seen.add(value);
    if (Array.isArray(value)) {
      const rows = value.filter(
        (row) =>
          row &&
          typeof row === "object" &&
          !Array.isArray(row) &&
          predicate(row),
      );
      if (rows.length) candidates.push(rows);
      value.forEach((row) => visit(row, depth + 1));
      return;
    }
    Object.values(value).forEach((child) => visit(child, depth + 1));
  };
  visit(response);
  return candidates.sort((a, b) => b.length - a.length)[0] || [];
}

export function extractApiId(response) {
  const idKeys = ["id", "kitchenOrderId", "mealDeliveryId", "deliveryId"];
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 6 ||
      visited.has(value)
    )
      return null;
    visited.add(value);
    for (const key of idKeys) {
      if (value[key] != null && String(value[key]).trim() !== "") {
        return value[key];
      }
    }
    for (const child of Object.values(value)) {
      const id = visit(child, depth + 1);
      if (id != null) return id;
    }
    return null;
  };
  return visit(response);
}

export function extractApiRecord(response, predicate) {
  const visited = new Set();
  const visit = (value, depth = 0) => {
    if (typeof value === "string") {
      try {
        value = JSON.parse(value);
      } catch {
        return null;
      }
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      depth > 8 ||
      visited.has(value)
    ) {
      return null;
    }
    visited.add(value);
    if (predicate(value)) return value;
    for (const child of Object.values(value)) {
      const record = visit(child, depth + 1);
      if (record) return record;
    }
    return null;
  };
  return visit(response);
}
