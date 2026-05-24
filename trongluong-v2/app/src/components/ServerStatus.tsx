import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Modal, TextInput, ActivityIndicator } from 'react-native';
import { SocketService } from '../services/socket';
import { StorageService } from '../services/storage';
import { ApiService } from '../services/api';

export default function ServerStatus() {
  const [connected, setConnected] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [ip, setIp] = useState('');
  const [port, setPort] = useState('');
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);

  useEffect(() => {
    // Listen to real-time socket connection changes
    const unsubscribe = SocketService.onConnectionChange((status) => {
      setConnected(status);
    });

    // Load current config initially
    loadConfig();

    return () => unsubscribe();
  }, []);

  const loadConfig = async () => {
    const config = await StorageService.getServerConfig();
    setIp(config.ip);
    setPort(config.port);
  };

  const handleSave = async () => {
    if (!ip.trim() || !port.trim()) return;
    setSaving(true);
    setTestResult(null);

    try {
      // 1. Temporarily save config to test
      await StorageService.saveServerConfig(ip, port);
      
      // 2. Test server health check
      const health = await ApiService.checkHealth();
      
      if (health && health.ok) {
        setTestResult('success');
        // Reconnect socket to new URL
        await SocketService.connect();
        
        setTimeout(() => {
          setModalVisible(false);
          setTestResult(null);
        }, 1000);
      } else {
        setTestResult('failed');
      }
    } catch (error) {
      setTestResult('failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity 
        style={[styles.badge, connected ? styles.onlineBadge : styles.offlineBadge]} 
        onPress={() => {
          loadConfig();
          setModalVisible(true);
        }}
      >
        <View style={[styles.dot, connected ? styles.onlineDot : styles.offlineDot]} />
        <Text style={styles.text}>
          {connected ? 'Server: Online' : 'Server: Offline'}
        </Text>
      </TouchableOpacity>

      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Cấu hình Máy chủ (Backend)</Text>
            <Text style={styles.modalDescription}>
              Nhập IP máy tính Windows và Cổng chạy server trong mạng LAN nội bộ.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Địa chỉ IP:</Text>
              <TextInput
                style={styles.input}
                value={ip}
                onChangeText={setIp}
                placeholder="Ví dụ: 192.168.1.15"
                keyboardType="numeric"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Cổng (Port):</Text>
              <TextInput
                style={styles.input}
                value={port}
                onChangeText={setPort}
                placeholder="Mặc định: 3000"
                keyboardType="numeric"
              />
            </View>

            {testResult === 'success' && (
              <Text style={[styles.testText, styles.successText]}>✅ Kết nối thành công!</Text>
            )}
            {testResult === 'failed' && (
              <Text style={[styles.testText, styles.failedText]}>❌ Không kết nối được. Vui lòng kiểm tra lại!</Text>
            )}

            <View style={styles.buttonGroup}>
              <TouchableOpacity 
                style={[styles.button, styles.cancelButton]} 
                onPress={() => {
                  setTestResult(null);
                  setModalVisible(false);
                }}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Hủy</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.button, styles.saveButton]} 
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.saveButtonText}>Kết nối & Lưu</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  onlineBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  onlineDot: {
    backgroundColor: '#10b981',
  },
  offlineDot: {
    backgroundColor: '#ef4444',
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
    color: '#334155',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  testText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginVertical: 10,
  },
  successText: {
    color: '#10b981',
  },
  failedText: {
    color: '#ef4444',
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#f1f5f9',
  },
  cancelButtonText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: '#6366f1',
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
