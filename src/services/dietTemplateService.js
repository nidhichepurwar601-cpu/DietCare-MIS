import apiClient from './apiClient';
import { API_CONFIG } from '../config/api.config';

/**
 * Service for Diet Template API operations.
 */
class DietTemplateService {
  /**
   * Create a new diet template
   * @param {Object} payload 
   * @returns {Promise<Object>}
   */
  async createTemplate(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.CREATE, payload);
  }

  /**
   * Get a diet template by its ID
   * Note: Some backend implementations use POST for GET_BY_ID if they have complex querying,
   * but typically it's a GET request. Adjust method here if needed based on actual backend behavior.
   * Assuming GET based on REST conventions, though the provided docs were ambiguous.
   * @param {number|string} id 
   * @returns {Promise<Object>}
   */
  async getTemplateById(id) {
    // We'll use GET. If the backend actually requires POST for this, change to apiClient.post
    return apiClient.get(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.GET_BY_ID(id));
  }

  /**
   * Update a diet template by its ID (passing ID in URL)
   * @param {number|string} id 
   * @param {Object} payload 
   * @returns {Promise<Object>}
   */
  async updateTemplateById(id, payload) {
    // The endpoint shows /update/14. Usually this is PUT or POST. Using POST as it's common in older/custom APIs.
    return apiClient.put(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.UPDATE_BY_ID(id), payload);
  }

  /**
   * Get all diet templates with pagination and sorting
   * @param {Object} payload - Pagination and filter criteria
   * @returns {Promise<Object>}
   */
  async getAllTemplates(payload) {
    return apiClient.post(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.GET_ALL, payload);
  }

  /**
   * Delete a diet template by ID
   * @param {number|string} id 
   * @returns {Promise<Object>}
   */
  async deleteTemplate(id) {
    // Based on standard REST, DELETE method. If the backend requires POST, change this.
    return apiClient.delete(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.DELETE(id));
  }

  /**
   * Generic update template (passing ID in payload)
   * @param {Object} payload - Must contain the 'id' field
   * @returns {Promise<Object>}
   */
  async updateTemplate(payload) {
    return apiClient.put(API_CONFIG.ENDPOINTS.DIET_TEMPLATE.UPDATE, payload);
  }
}

// Export as a singleton instance
export const dietTemplateService = new DietTemplateService();
export default dietTemplateService;
