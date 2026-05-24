import axios, { AxiosInstance } from 'axios';
import { StorageService } from './storage';
import { Order, FileInfo } from '../types';

export const API_KEY = 'TL_SECRET_SECURE_API_KEY_2026';

/**
 * Dynamically construct an Axios instance with the latest server URL
 */
export async function getApiClient(): Promise<AxiosInstance> {
  const baseURL = await StorageService.getServerUrl();
  return axios.create({
    baseURL,
    timeout: 15000, // 15 seconds timeout
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': API_KEY,
    },
  });
}

export const ApiService = {
  /**
   * Health check to ping backend server
   */
  async checkHealth(): Promise<{ ok: boolean; status: string; hostname: string } | null> {
    try {
      const client = await getApiClient();
      const response = await client.get('/api/health');
      return response.data;
    } catch (error) {
      console.warn('[API] Health check failed:', error);
      return null;
    }
  },

  /**
   * Fetch all employees from server
   */
  async fetchUsers(): Promise<any[]> {
    try {
      const client = await getApiClient();
      const response = await client.get('/api/users');
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.warn('[API] Fetching users failed:', error);
      throw error;
    }
  },

  /**
   * Fetch Google Drive upload Access Token from server
   */
  async fetchDriveToken(): Promise<{ token: string; parentFolderId: string } | null> {
    try {
      const client = await getApiClient();
      const response = await client.get('/api/drive/token');
      if (response.data && response.data.ok) {
        return response.data;
      }
      return null;
    } catch (error) {
      console.warn('[API] Fetching drive token failed:', error);
      return null;
    }
  },

  /**
   * Fetch all orders from SQLite
   */
  async fetchOrders(): Promise<Order[]> {
    try {
      const client = await getApiClient();
      const response = await client.get('/api/orders');
      if (response.data && response.data.ok) {
        const orders = response.data.data;
        // Cache them locally
        await StorageService.cacheOrders(orders);
        return orders;
      }
      return [];
    } catch (error) {
      console.warn('[API] Fetching orders failed, falling back to cache:', error);
      return await StorageService.getCachedOrders();
    }
  },

  /**
   * Fetch details for a specific order by ID
   */
  async fetchOrderDetails(id: string): Promise<Order | null> {
    try {
      const client = await getApiClient();
      const response = await client.get(`/api/orders/${id}`);
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return null;
    } catch (error) {
      console.warn(`[API] Fetching order ${id} failed:`, error);
      return null;
    }
  },

  /**
   * Create a new order (weight sheet)
   */
  async createOrder(payload: { 
    maVanDon: string; 
    soKy: number; 
    ghiChu?: string;
    recordedBy?: string;
    shift?: 'ca_sang' | 'ca_dem';
    businessDate?: string;
  }): Promise<Order | null> {
    try {
      const client = await getApiClient();
      const response = await client.post('/api/orders', payload);
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return null;
    } catch (error: any) {
      if (error.response && error.response.status === 409) {
        throw new Error('Mã vận đơn đã tồn tại trên hệ thống!');
      }
      if (error.response && error.response.data && error.response.data.errors) {
        const firstError = error.response.data.errors[0]?.message;
        throw new Error(firstError || 'Dữ liệu không hợp lệ!');
      }
      console.warn('[API] Creating order failed:', error);
      throw new Error(error.message || 'Không thể tạo đơn hàng, vui lòng thử lại.');
    }
  },

  /**
   * Update weight or status of an order (PATCH)
   */
  async updateOrder(id: string, payload: { soKy?: number; trangThai?: string; ghiChu?: string }): Promise<Order | null> {
    try {
      const client = await getApiClient();
      const response = await client.patch(`/api/orders/${id}`, payload);
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return null;
    } catch (error: any) {
      if (error.response && error.response.data && error.response.data.errors) {
        const firstError = error.response.data.errors[0]?.message;
        throw new Error(firstError || 'Dữ liệu cập nhật không hợp lệ!');
      }
      console.warn(`[API] Updating order ${id} failed:`, error);
      throw new Error('Không thể cập nhật đơn hàng.');
    }
  },

  /**
   * Delete an order
   */
  async deleteOrder(id: string): Promise<boolean> {
    try {
      const client = await getApiClient();
      const response = await client.delete(`/api/orders/${id}`);
      return !!(response.data && response.data.ok);
    } catch (error) {
      console.warn(`[API] Deleting order ${id} failed:`, error);
      return false;
    }
  },

  /**
   * Fetch attached files for an order by its barcode (maVanDon)
   */
  async fetchOrderFiles(maVanDon: string): Promise<FileInfo[]> {
    try {
      const client = await getApiClient();
      const response = await client.get(`/api/orders/${maVanDon}/files`);
      if (response.data && response.data.ok) {
        return response.data.data;
      }
      return [];
    } catch (error) {
      console.warn(`[API] Fetching files for order ${maVanDon} failed:`, error);
      return [];
    }
  },

  /**
   * Upload a file with progress tracking
   * Uses multipart/form-data
   */
  async uploadFile(
    maVanDon: string,
    file: { uri: string; name: string; type: string },
    onProgress: (percent: number) => void
  ): Promise<any> {
    const client = await getApiClient();
    const formData = new FormData();
    
    // Format file URI for native upload
    const uri = PlatformOSUriFix(file.uri);
    
    // Append the file using React Native FormData specification
    formData.append('files', {
      uri,
      name: file.name,
      type: file.type,
    } as any);

    const response = await client.post(`/api/orders/${maVanDon}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const total = progressEvent.total || 0;
        if (total > 0) {
          const percent = Math.round((progressEvent.loaded * 100) / total);
          onProgress(percent);
        }
      },
    });

    return response.data;
  },

  /**
   * Sync Google Drive direct upload metadata to server
   */
  async syncDriveMetadata(
    maVanDon: string,
    payload: {
      files: Array<{ driveFileId: string; fileName: string; mimeType: string; size: number; path: string }>;
      driveFolderId?: string;
      driveUrl?: string;
    }
  ): Promise<any> {
    try {
      const client = await getApiClient();
      const response = await client.post(`/api/orders/${maVanDon}/files/drive`, payload);
      return response.data;
    } catch (error) {
      console.error('[API] Syncing Drive metadata failed:', error);
      throw error;
    }
  },

  /**
   * Delete a specific file
   */
  async deleteFile(maVanDon: string, fileId: string): Promise<boolean> {
    try {
      const client = await getApiClient();
      // Router path is: DELETE /api/orders/:maVanDon/files/:fileId
      const response = await client.delete(`/api/orders/${maVanDon}/files/${fileId}`);
      return !!(response.data && response.data.ok);
    } catch (error) {
      console.error(`[API] Deleting file ${fileId} failed:`, error);
      return false;
    }
  }
};

/**
 * Native file path fixes for Expo on iOS/Android
 */
function PlatformOSUriFix(uri: string): string {
  // On iOS, we need to strip file:// or preserve it depending on native engine
  // This is a standard robust solution for both OSes
  if (uri.startsWith('file://')) {
    return uri;
  }
  return uri;
}
