import React, { useState, useMemo } from "react";
import {
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Inbox, ChevronsLeft, ChevronsRight, Search
} from "lucide-react";
import AppSkeleton from "./AppSkeleton.jsx";

export default function DataTable({
  columns,
  data,
  searchable       = false,
  pagination       = 10,
  serverPagination = false,
  totalItems,
  currentPage:     controlledPage = 1,
  onPageChange,
  loading          = false,
  emptyMessage     = "No records found",
  emptyDescription = "Try adjusting your filters or search query.",
  searchPlaceholder = "Search records..."
}) {
  const [sortConfig, setSortConfig]   = useState({ key: null, direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm]   = useState("");
  const activePage = serverPagination ? controlledPage : currentPage;

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return data;
    const term = searchTerm.toLowerCase();
    return data.filter((item) =>
      Object.values(item).some((v) =>
        String(v).toLowerCase().includes(term),
      ),
    );
  }, [data, searchTerm]);

  const sorted = useMemo(() => {
    if (!sortConfig.key) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === "asc" ? 1  : -1;
      return 0;
    });
  }, [filtered, sortConfig]);

  const total      = serverPagination ? (totalItems || 0) : sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pagination));
  const pageData   = serverPagination
    ? sorted
    : sorted.slice((activePage - 1) * pagination, activePage * pagination);

  const changePage = (page) => {
    const p = Math.max(1, Math.min(page, totalPages));
    if (serverPagination) onPageChange?.(p);
    else setCurrentPage(p);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Search */}
      {searchable && (
        <div className="print-hide flex items-center">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="search"
              placeholder={searchPlaceholder}
              className="hospital-input pl-9"
              aria-label="Search table"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (serverPagination) onPageChange?.(1);
                else setCurrentPage(1);
              }}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="hospital-table-wrap">
        {loading ? (
          <div className="p-4">
            <AppSkeleton variant="table" rows={pagination > 8 ? 8 : pagination} />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th
                    key={col.key}
                    scope="col"
                    className={`py-3 px-4 text-xs font-bold uppercase tracking-wider text-gray-500 bg-gray-50/50 border-b border-gray-200 ${col.className || ""}`}
                    style={{
                      cursor: col.sortable !== false ? "pointer" : "default",
                      userSelect: "none",
                    }}
                    onClick={() => col.sortable !== false && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1.5 hover:text-gray-700 transition-colors">
                      {col.label}
                      {col.sortable !== false && sortConfig.key === col.key && (
                        sortConfig.direction === "asc"
                          ? <ChevronUp size={14} className="text-[var(--hospital-primary)]" />
                          : <ChevronDown size={14} className="text-[var(--hospital-primary)]" />
                      )}
                      {col.sortable !== false && sortConfig.key !== col.key && (
                        <ChevronUp size={14} className="opacity-0 group-hover:opacity-30" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageData.length > 0 ? (
                pageData.map((row, i) => (
                  <tr key={row.id ?? i} className="hover:bg-gray-50/50 transition-colors">
                    {columns.map((col) => (
                      <td key={col.key} className={`py-3 px-4 text-sm text-gray-700 ${col.className || ""}`}>
                        {col.render ? col.render(row) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={columns.length} className="py-12 px-4 text-center">
                    <div className="flex flex-col items-center justify-center text-gray-500">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                        <Inbox size={24} className="text-gray-400" />
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-1">{emptyMessage}</h3>
                      {emptyDescription && (
                        <p className="text-sm text-gray-500 max-w-sm">{emptyDescription}</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="print-hide flex items-center justify-between flex-wrap gap-4 pt-1">
          <span className="text-sm text-gray-500 font-medium">
            Showing <strong className="text-gray-900">{Math.min((activePage - 1) * pagination + 1, total)}</strong> to <strong className="text-gray-900">{Math.min(activePage * pagination, total)}</strong> of <strong className="text-gray-900">{total}</strong> results
          </span>
          <div className="flex gap-1 bg-white rounded-lg border shadow-sm p-1">
            {[
              { icon: ChevronsLeft,  action: () => changePage(1),              disabled: activePage === 1,          label: "First page" },
              { icon: ChevronLeft,   action: () => changePage(activePage - 1), disabled: activePage === 1,          label: "Previous page" },
              { icon: ChevronRight,  action: () => changePage(activePage + 1), disabled: activePage === totalPages, label: "Next page" },
              { icon: ChevronsRight, action: () => changePage(totalPages),     disabled: activePage === totalPages, label: "Last page" },
            ].map(({ icon: Icon, action, disabled, label }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                disabled={disabled}
                aria-label={label}
                className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors ${
                  disabled 
                    ? "text-gray-300 cursor-not-allowed" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                <Icon size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
