import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

class FoodService {
  async createFood(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.FOOD.CREATE, payload);
  }

  async getFoodById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.FOOD.GET_BY_ID(id));
  }

  async updateFoodById(id, payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.FOOD.UPDATE_BY_ID(id), payload);
  }

  async getAllFood(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.FOOD.GET_ALL, payload);
  }

  async deleteFood(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.FOOD.DELETE(id));
  }
}

export const foodService = new FoodService();
export default foodService;
