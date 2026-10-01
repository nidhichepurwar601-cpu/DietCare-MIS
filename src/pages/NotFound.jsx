import React from "react";
import { Link } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import AppLayout from "../components/layouts/AppLayout.jsx";

export default function NotFound() {
  return (
    <AppLayout>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-3">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="w-10 h-10" />
        </div>
        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>
        <h2 className="text-xl font-medium text-gray-700 mb-4">
          Page Not Found
        </h2>
        <p className="text-gray-500 max-w-md mb-8">
          The page you are looking for doesn't exist or has been moved.
        </p>
        <Link
                        to="/"
          className="px-6 py-2.5 bg-teal-700 text-white rounded-lg font-medium hover:bg-teal-800 transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </AppLayout>
  );
}
