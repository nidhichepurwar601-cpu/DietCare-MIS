export function messageForHttpStatus(status, fallback) {
  const map = {
    400: "The request could not be processed. Check the entered values.",
    401: "You are not authorized to complete this request.",
    403: "You do not have permission for this action.",
    404: "The requested record was not found.",
    409: "This record conflicts with an existing entry.",
    422: "Some fields could not be validated.",
    429: "Too many requests. Please wait and try again.",
    500: "The server reported an error. Try again shortly.",
    502: "The service gateway is unavailable.",
    503: "The dietary service is temporarily unavailable.",
    504: "The request timed out waiting for the server.",
  };
  return map[status] || fallback || `Request failed (${status}).`;
}

export function normalizeApiError(error) {
  if (!error) {
    return { status: 0, message: "Unknown error.", kind: "unknown" };
  }
  if (error.name === "AbortError") {
    return { status: 0, message: "The request timed out.", kind: "timeout" };
  }
  const status = Number(error.status) || 0;
  if (status) {
    return {
      status,
      message: messageForHttpStatus(status, error.message),
      kind: "http",
      data: error.data,
    };
  }
  return {
    status: 0,
    message: error.message || "Network error or server is unreachable.",
    kind: "network",
  };
}
