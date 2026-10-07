import apiClient from "./apiClient.js";
import { API_CONFIG } from "../config/api.config.js";

class NotificationService {
  createNotification(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.NOTIFICATION.CREATE, payload);
  }

  getNotificationById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.NOTIFICATION.GET_BY_ID(id));
  }

  getAllNotifications(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.NOTIFICATION.GET_ALL, payload);
  }

  async getUnreadCount() {
    const response = await this.getAllNotifications({
      readFlag: false,
      paginationInfo: { currentPage: 0, pageSize: 1 },
    });
    const countKeys = [
      "unreadCount",
      "totalRecords",
      "totalElements",
      "totalItems",
      "count",
    ];
    const seen = new Set();
    const findCount = (value, depth = 0) => {
      if (typeof value === "string") {
        try {
          value = JSON.parse(value);
        } catch {
          return null;
        }
      }
      if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) {
        return null;
      }
      seen.add(value);
      for (const key of countKeys) {
        const count = Number(value[key]);
        if (Number.isFinite(count) && count >= 0) return count;
      }
      for (const child of Object.values(value)) {
        const count = findCount(child, depth + 1);
        if (count != null) return count;
      }
      return null;
    };
    const count = findCount(response);
    if (count == null) {
      throw new Error(
        "The notification response does not include an unread count.",
      );
    }
    return count;
  }

  updateStatus(id, payload) {
    return apiClient.put(
      API_CONFIG.ENDPOINTS.NOTIFICATION.STATUS_UPDATE(id),
      payload,
    );
  }

  deleteNotification(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.NOTIFICATION.DELETE(id));
  }
}

export const notificationService = new NotificationService();
export default notificationService;
