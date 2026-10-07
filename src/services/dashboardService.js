import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

export const buildDashboardPayload = (overrides = {}) => {
  const { paginationInfo = {}, ...rest } = overrides;
  const { dataSorting = {}, ...pagingRest } = paginationInfo;

  return {
    ...rest,
    paginationInfo: {
      currentPage: 1,
      pageSize: 10,
      ...pagingRest,
      dataSorting: {
        byColumn: {
          field: "dt.name",
          title: "Name",
          sortable: true,
        },
        sortingOrder: "ASC",
        ...dataSorting,
      },
    },
  };
};

class DashboardService {
  getDashboard(overrides = {}) {
    return apiClient.post(
      API_CONFIG.ENDPOINTS.DASHBOARD.POST,
      buildDashboardPayload(overrides),
    );
  }
}

export const dashboardService = new DashboardService();
export default dashboardService;
