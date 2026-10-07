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

  getAllPlans(payload = {}) {
    return apiClient.post(this.endpoint.GET_ALL, payload);
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
}

export const patientDietPlanService = new PatientDietPlanService();
export default patientDietPlanService;
