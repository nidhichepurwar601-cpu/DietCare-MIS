import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class ClinicalAlertService {
  createAlert(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.CLINICAL_ALERT.CREATE, payload);
  }

  getAlertById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.CLINICAL_ALERT.GET_BY_ID(id));
  }

  getAllAlerts(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.CLINICAL_ALERT.GET_ALL, payload);
  }

  updateAlertById(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.CLINICAL_ALERT.UPDATE_BY_ID(id),
      payload,
    );
  }

  acknowledgeAlert(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.CLINICAL_ALERT.ACKNOWLEDGE(id),
      payload,
    );
  }

  deleteAlert(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.CLINICAL_ALERT.DELETE(id));
  }
}

export const clinicalAlertService = new ClinicalAlertService();
export default clinicalAlertService;
