import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

class MealTypeService {
  async createMealType(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.MEAL_TYPE.CREATE, payload);
  }

  async getMealTypeById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.MEAL_TYPE.GET_BY_ID(id));
  }

  async getAllMealTypes(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.MEAL_TYPE.GET_ALL, payload);
  }

  async updateMealTypeById(id, payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.MEAL_TYPE.UPDATE_BY_ID(id), payload);
  }

  async deleteMealType(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.MEAL_TYPE.DELETE(id));
  }
}

export const mealTypeService = new MealTypeService();
export default mealTypeService;
