import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

class FoodNutritionService {
  async saveNutrition(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.FOOD_NUTRITION.SAVE, payload);
  }

  async getNutritionById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.FOOD_NUTRITION.GET_BY_ID(id));
  }

  async deleteNutrition(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.FOOD_NUTRITION.DELETE(id));
  }

  async calculateNutrition(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.FOOD_NUTRITION.CALCULATE, payload);
  }

  async updateNutritionById(id, payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.FOOD_NUTRITION.UPDATE_BY_ID(id), payload);
  }
}

export const foodNutritionService = new FoodNutritionService();
export default foodNutritionService;
