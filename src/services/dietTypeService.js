import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

class DietTypeService {
  async createType(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.DIET_TYPE.CREATE, payload);
  }

  async getTypeById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.DIET_TYPE.GET_BY_ID(id));
  }

  async updateTypeById(id, payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.DIET_TYPE.UPDATE_BY_ID(id), payload);
  }

  async getAllTypes(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.DIET_TYPE.GET_ALL, payload);
  }

  async deleteType(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.DIET_TYPE.DELETE(id));
  }
}

export const dietTypeService = new DietTypeService();
export default dietTypeService;
