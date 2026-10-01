import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

class TemplateItemService {
  async createItem(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.TEMPLATE_ITEM.CREATE, payload);
  }

  async getItemById(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.TEMPLATE_ITEM.GET_BY_ID(id));
  }

  async updateItemById(id, payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.TEMPLATE_ITEM.UPDATE_BY_ID(id), payload);
  }

  async getItemsByTemplateId(id) {
    return apiClient.get(API_CONFIG.ENDPOINTS.TEMPLATE_ITEM.GET_BY_TEMPLATE_ID(id));
  }

  async deleteItem(id) {
    return apiClient.delete(API_CONFIG.ENDPOINTS.TEMPLATE_ITEM.DELETE(id));
  }
}

export const templateItemService = new TemplateItemService();
export default templateItemService;
