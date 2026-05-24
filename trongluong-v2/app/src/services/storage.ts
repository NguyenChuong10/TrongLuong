import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEYS = {
  SERVER_IP: '@trongluong:server_ip',
  SERVER_PORT: '@trongluong:server_port',
  CACHED_ORDERS: '@trongluong:cached_orders',
};

export interface ServerConfig {
  ip: string;
  port: string;
}

export const StorageService = {
  /**
   * Get the current configured server URL
   */
  async getServerConfig(): Promise<ServerConfig> {
    try {
      const ip = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_IP);
      const port = await AsyncStorage.getItem(STORAGE_KEYS.SERVER_PORT);
      return {
        ip: ip || '192.168.1.5', // Default fallback IP (Home Mac IP)
        port: port || '3000',    // Default Express port
      };
    } catch (error) {
      console.error('Error reading server config from storage:', error);
      return { ip: '192.168.1.5', port: '3000' };
    }
  },

  /**
   * Save new server config
   */
  async saveServerConfig(ip: string, port: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_IP, ip.trim());
      await AsyncStorage.setItem(STORAGE_KEYS.SERVER_PORT, port.trim());
      return true;
    } catch (error) {
      console.error('Error saving server config to storage:', error);
      return false;
    }
  },

  /**
   * Get full server URL, e.g., "http://192.168.1.100:3000"
   */
  async getServerUrl(): Promise<string> {
    const config = await this.getServerConfig();
    // Ensure clean URL format
    const cleanedIp = config.ip.replace(/^(f|ht)tps?:\/\//, '');
    return `http://${cleanedIp}:${config.port}`;
  },

  /**
   * Cache orders list for offline availability
   */
  async cacheOrders(orders: any[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CACHED_ORDERS, JSON.stringify(orders));
    } catch (error) {
      console.error('Error caching orders:', error);
    }
  },

  /**
   * Get cached orders
   */
  async getCachedOrders(): Promise<any[]> {
    try {
      const cached = await AsyncStorage.getItem(STORAGE_KEYS.CACHED_ORDERS);
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.error('Error getting cached orders:', error);
      return [];
    }
  }
};
