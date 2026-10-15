import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class PatientDietPlanService {
  get endpoint() {
    return API_CONFIG.ENDPOINTS.DIET_MANAGER;
  }

  createPlan(payload) {
    return apiClient.post(this.endpoint.CREATE, payload);
  }

  getPlanById(id) {
    return apiClient.get(this.endpoint.GET_BY_ID(id));
  }

  // Dashboard list: defaults match the API contract, callers pass overrides only.
  getAllPlans(payload = {}) {
    const paging = payload.paginationInfo || {};
    return apiClient.post(this.endpoint.GET_ALL, {
      ward: "",
      dietPlan: "",
      assignmentStatus: "",
      searchText: "",
      ...payload,
      paginationInfo: {
        currentPage: 1,
        pageSize: 100,
        ...paging,
        dataSorting: {
          byColumn: { field: "p.name" },
          sortingOrder: "ASC",
          ...(paging.dataSorting || {}),
        },
      },
    });
  }

  // Summary cards
  getSummary(payload = {}) {
    return apiClient.post(this.endpoint.SUMMARY, {
      assignmentStatus: "",
      searchText: "",
      ...payload,
    });
  }

  updatePlanById(id, payload) {
    return apiClient.put(this.endpoint.UPDATE_BY_ID(id), payload);
  }

  deletePlan(id) {
    return apiClient.delete(this.endpoint.DELETE(id));
  }

  updateAssignmentStatus(id, payload) {
    return apiClient.put(this.endpoint.UPDATE_STATUS(id), payload);
  }
  updateAssignment(id, { dietTypeId, dietitionPractId = 0, assignmentStatus }) {
    return apiClient.put(this.endpoint.UPDATE_BY_ID(id), {
      dietTypeId: Number(dietTypeId),
      dietitionPractId,
      assignmentStatus,
    });
  }
}

export const patientDietPlanService = new PatientDietPlanService();
export default patientDietPlanService;