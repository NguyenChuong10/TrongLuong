import { io, Socket } from 'socket.io-client';
import { StorageService } from './storage';

import { API_KEY } from './api';

type SocketCallback = (data: any) => void;

class SocketServiceClass {
  private socket: Socket | null = null;
  private listeners: Map<string, Set<SocketCallback>> = new Map();
  private connectionListeners: Set<(connected: boolean) => void> = new Set();
  private currentUrl: string = '';

  /**
   * Initialize socket connection using stored server URL
   */
  async connect(): Promise<Socket | null> {
    const url = await StorageService.getServerUrl();
    
    // If already connected to the correct URL, return existing socket
    if (this.socket && this.socket.connected && this.currentUrl === url) {
      return this.socket;
    }

    // If connected to a different URL, disconnect first
    if (this.socket) {
      this.disconnect();
    }

    console.log(`[Socket] Connecting to: ${url}`);
    this.currentUrl = url;

    this.socket = io(url, {
      transports: ['websocket'], // Forces WebSocket for performance in React Native
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      timeout: 10000,
      auth: {
        token: API_KEY,
      },
    });

    this.socket.on('connect', () => {
      console.log(`[Socket] Connected successfully with ID: ${this.socket?.id}`);
      this.notifyConnectionStatus(true);
      
      // Re-register all listeners on new socket connection
      this.reapplyListeners();
    });

    this.socket.on('disconnect', (reason) => {
      console.log(`[Socket] Disconnected: ${reason}`);
      this.notifyConnectionStatus(false);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[Socket] Connection error:', error.message);
      this.notifyConnectionStatus(false);
    });

    return this.socket;
  }

  /**
   * Disconnect current socket
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentUrl = '';
      this.notifyConnectionStatus(false);
    }
  }

  /**
   * Join an order room to receive events for that specific order
   */
  joinOrderRoom(orderId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('join_order', orderId);
      console.log(`[Socket] Sent join_order for: ${orderId}`);
    }
  }

  /**
   * Leave an order room
   */
  leaveOrderRoom(orderId: string) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('leave_order', orderId);
      console.log(`[Socket] Sent leave_order for: ${orderId}`);
    }
  }

  /**
   * Add a generic event listener
   */
  on(event: string, callback: SocketCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    if (this.socket) {
      this.socket.off(event); // Prevent double-binding
      this.socket.on(event, (data) => {
        this.listeners.get(event)?.forEach(cb => cb(data));
      });
    }
  }

  /**
   * Remove an event listener
   */
  off(event: string, callback: SocketCallback) {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(callback);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
        if (this.socket) {
          this.socket.off(event);
        }
      }
    }
  }

  /**
   * Listen to connection status changes
   */
  onConnectionChange(callback: (connected: boolean) => void) {
    this.connectionListeners.add(callback);
    // Initial call
    callback(!!(this.socket && this.socket.connected));
    return () => {
      this.connectionListeners.delete(callback);
    };
  }

  private notifyConnectionStatus(connected: boolean) {
    this.connectionListeners.forEach(cb => cb(connected));
  }

  private reapplyListeners() {
    if (!this.socket) return;
    
    this.listeners.forEach((callbacks, event) => {
      this.socket!.off(event);
      this.socket!.on(event, (data) => {
        callbacks.forEach(cb => cb(data));
      });
    });
  }

  /**
   * Check if currently connected
   */
  isConnected(): boolean {
    return !!(this.socket && this.socket.connected);
  }
}

export const SocketService = new SocketServiceClass();
