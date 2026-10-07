import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class MealDeliveryService {
  createDelivery(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.MEAL_DELIVERY.CREATE, payload);
  }

  getDeliveryById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.MEAL_DELIVERY.GET_BY_ID(id));
  }

  getAllDeliveries(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.MEAL_DELIVERY.GET_ALL, payload);
  }

  updateDeliveryById(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.MEAL_DELIVERY.UPDATE_BY_ID(id),
      payload,
    );
  }

  updateDeliveryStatus(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.MEAL_DELIVERY.UPDATE_STATUS(id),
      payload,
    );
  }

  saveIntake(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.MEAL_DELIVERY.SAVE_INTAKE(id),
      payload,
    );
  }

  deleteDelivery(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.MEAL_DELIVERY.DELETE(id));
  }

  updateDeliveryItemStatus(itemId, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.MEAL_DELIVERY_ITEM.UPDATE_STATUS(itemId),
      payload,
    );
  }

  getSummaryByDate(date) {
    return apiClient.get(
      API_CONFIG.ENDPOINTS.MEAL_DELIVERY_SUMMARY.GET_BY_DATE(date),
    );
  }
}

export const mealDeliveryService = new MealDeliveryService();
export default mealDeliveryService;
