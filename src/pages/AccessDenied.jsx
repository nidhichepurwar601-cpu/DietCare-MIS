import React from "react";
import { ShieldX } from "lucide-react";

export default function AccessDenied({ title = "Access Restricted" }) {
  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <ShieldX className="mx-auto mb-3 h-10 w-10 text-red-500" />
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        <p className="mt-2 text-sm text-gray-500" role="status">
          Your role does not have permission to open this module. Contact an
          administrator if you need access.
        </p>
      </div>
    </div>
  );
}
