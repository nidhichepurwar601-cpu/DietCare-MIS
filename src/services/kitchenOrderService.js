import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class KitchenOrderService {
  createOrder(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.KITCHEN_ORDER.CREATE, payload);
  }

  getOrderById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.KITCHEN_ORDER.GET_BY_ID(id));
  }

  getAllOrders(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.KITCHEN_ORDER.GET_ALL, payload);
  }

  updateOrderById(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.KITCHEN_ORDER.UPDATE_BY_ID(id),
      payload,
    );
  }

  updateOrderStatus(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.KITCHEN_ORDER.ORDER_STATUS(id),
      payload,
    );
  }

  deleteOrder(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.KITCHEN_ORDER.DELETE(id));
  }

  updateOrderItemStatus(itemId, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.ORDER_ITEM.ORDER_ITEM_STATUS(itemId),
      payload,
    );
  }

  getSummaryByDate(date) {
    return apiClient.get(API_CONFIG.ENDPOINTS.KITCHEN_SUMMARY.GET_BY_DATE(date));
  }
}

export const kitchenOrderService = new KitchenOrderService();
export default kitchenOrderService;
