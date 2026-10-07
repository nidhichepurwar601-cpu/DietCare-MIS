import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class PatientService {
  get endpoint() {
    return API_CONFIG.ENDPOINTS.PATIENT_DETAILS;
  }

  createPatient(payload) {
    return apiClient.post(this.endpoint.CREATE, payload);
  }

  getPatientById(id) {
    return apiClient.get(this.endpoint.GET_BY_ID(id));
  }

  getAllPatients(payload = {}) {
    return apiClient.post(this.endpoint.GET_ALL, {
      patientCode: "",
      name: "",
      ward: "",
      status: true,
      ...payload,
      paginationInfo: {
        currentPage: 0,
        pageSize: 100,
        ...(payload.paginationInfo || {}),
      },
    });
  }

  updatePatientById(id, payload) {
    return apiClient.put(this.endpoint.UPDATE_BY_ID(id), payload);
  }

  deletePatient(id) {
    return apiClient.delete(this.endpoint.DELETE(id));
  }
}

export const patientService = new PatientService();
export default patientService;
