import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, Image, TouchableOpacity, TextInput, ActivityIndicator, Alert, SafeAreaView, Dimensions, StatusBar, Linking } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { ApiService, API_KEY } from '../services/api';
import { SocketService } from '../services/socket';
import { StorageService } from '../services/storage';
import { Order, FileInfo } from '../types';
import StatusBadge from '../components/StatusBadge';
import ServerStatus from '../components/ServerStatus';

const { width } = Dimensions.get('window');
const thumbSize = (width - 48) / 3;

export default function OrderDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  const { orderId } = route.params;

  const [order, setOrder] = useState<Order | null>(null);
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWeight, setEditingWeight] = useState(false);
  const [newWeight, setNewWeight] = useState('');
  const [savingWeight, setSavingWeight] = useState(false);
  const [serverUrl, setServerUrl] = useState('');

  // Fetch full details
  const loadOrderDetails = async () => {
    try {
      const data = await ApiService.fetchOrderDetails(orderId);
      if (data) {
        setOrder(data);
        setNewWeight(data.soKy.toString());
        
        // Load files
        const orderFiles = await ApiService.fetchOrderFiles(data.maVanDon);
        setFiles(orderFiles);
      }
    } catch (e) {
      console.error('Failed to load order details:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrderDetails();

    // Load server URL asynchronously for static images
    const initServerUrl = async () => {
      const url = await StorageService.getServerUrl();
      setServerUrl(url);
    };
    initServerUrl();

    // Join Socket room to hear realtime updates for this specific order
    SocketService.connect();
    SocketService.joinOrderRoom(orderId);

    // Listen to real-time events for this order
    const handleOrderUpdated = (data: any) => {
      console.log('[Socket Event] order_updated received in Detail:', data);
      const { changes } = data;
      setOrder(curr => curr ? { ...curr, ...changes } : null);
      if (changes.soKy !== undefined) {
        setNewWeight(changes.soKy.toString());
      }
    };

    const handleFilesUpdated = () => {
      // Re-fetch files
      loadOrderDetails();
    };

    const handleDriveSynced = (data: any) => {
      console.log('[Socket Event] drive_synced in Detail:', data);
      setOrder(curr => curr ? { ...curr, trangThai: 'hoan_thanh' } : null);
      Alert.alert('Đồng bộ thành công', 'Đơn hàng đã được đồng bộ lên Google Drive hoàn tất!');
    };

    SocketService.on('order_updated', handleOrderUpdated);
    SocketService.on('files_updated', handleFilesUpdated);
    SocketService.on('drive_synced', handleDriveSynced);

    return () => {
      SocketService.leaveOrderRoom(orderId);
      SocketService.off('order_updated', handleOrderUpdated);
      SocketService.off('files_updated', handleFilesUpdated);
      SocketService.off('drive_synced', handleDriveSynced);
    };
  }, [orderId]);

  // Submit inline weight change (PATCH)
  const handleSaveWeight = async () => {
    const parsedWeight = parseFloat(newWeight);
    if (isNaN(parsedWeight) || parsedWeight <= 0) {
      Alert.alert('Lỗi nhập liệu', 'Vui lòng nhập số ký chính xác!');
      return;
    }

    setSavingWeight(true);

    try {
      const updated = await ApiService.updateOrder(orderId, {
        soKy: parsedWeight
      });

      if (updated) {
        setOrder(updated);
        setEditingWeight(false);
        
        // Emit Socket event so other clients (like Electron desktop) update in real-time
        const socket = await SocketService.connect();
        if (socket && socket.connected) {
          socket.emit('order_updated', { 
            orderId, 
            changes: { soKy: parsedWeight } 
          });
        }
        
        Alert.alert('Thành công', 'Đã cập nhật trọng lượng đơn hàng!');
      }
    } catch (error: any) {
      Alert.alert('Thất bại', error.message || 'Không thể cập nhật số ký.');
    } finally {
      setSavingWeight(false);
    }
  };

  // Delete attached file
  const handleDeleteFile = (fileId: string) => {
    if (!order) return;
    
    Alert.alert('Xóa file', 'Bạn có chắc chắn muốn xóa file đính kèm này?', [
      { text: 'Hủy', style: 'cancel' },
      { 
        text: 'Xóa', 
        style: 'destructive',
        onPress: async () => {
          const success = await ApiService.deleteFile(order.maVanDon, fileId);
          if (success) {
            setFiles(prev => prev.filter(f => f.id !== fileId));
            // Trigger Socket update
            const socket = await SocketService.connect();
            if (socket) {
              socket.emit('files_updated', { orderId });
            }
          } else {
            Alert.alert('Lỗi', 'Không thể xóa file.');
          }
        }
      }
    ]);
  };

  // Delete entire order
  const handleDeleteOrder = () => {
    Alert.alert('Xóa đơn hàng', 'Hành động này sẽ xóa hoàn toàn đơn hàng khỏi cơ sở dữ liệu và xóa sạch các file đính kèm trên server. Bạn có chắc chắn muốn tiếp tục?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa sạch',
        style: 'destructive',
        onPress: async () => {
          const success = await ApiService.deleteOrder(orderId);
          if (success) {
            navigation.navigate('Home');
          } else {
            Alert.alert('Lỗi', 'Không thể xóa đơn hàng.');
          }
        }
      }
    ]);
  };

  // Format date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('vi-VN');
    } catch (e) {
      return isoString;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Đang tải chi tiết đơn hàng...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorText}>Không tìm thấy đơn hàng trên hệ thống!</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('Home')}>
          <Text style={styles.backBtnText}>Quay lại trang chủ</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerBackBtn} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.headerBackIcon}>←</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Chi tiết Đơn hàng</Text>
        </View>
        <ServerStatus />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        
        {/* Core Order Info Card */}
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.label}>MÃ VẬN ĐƠN</Text>
              <Text style={styles.barcode}>{order.maVanDon}</Text>
            </View>
            <StatusBadge status={order.trangThai} />
          </View>

          {/* Weight Field (with inline editor) */}
          <View style={styles.infoSection}>
            <Text style={styles.label}>TRỌNG LƯỢNG (KILOGRAM)</Text>
            {editingWeight ? (
              <View style={styles.weightEditContainer}>
                <TextInput
                  style={styles.weightInput}
                  value={newWeight}
                  onChangeText={setNewWeight}
                  keyboardType="decimal-pad"
                  autoFocus={true}
                />
                <Text style={styles.weightUnit}>KG</Text>
                
                <TouchableOpacity style={styles.saveBtn} onPress={handleSaveWeight} disabled={savingWeight}>
                  {savingWeight ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Lưu</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingWeight(false)}>
                  <Text style={styles.cancelBtnText}>Hủy</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.weightDisplayRow}>
                <Text style={styles.weight}>{order.soKy} kg</Text>
                <TouchableOpacity style={styles.editBtn} onPress={() => setEditingWeight(true)}>
                  <Text style={styles.editBtnText}>✏️ Chỉnh sửa</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.infoSection}>
            <Text style={styles.label}>GHI CHÚ</Text>
            <Text style={styles.value}>{order.ghiChu || '(Không có ghi chú)'}</Text>
          </View>

          {/* Timestamps */}
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>NĂM TẠO</Text>
              <Text style={styles.dateValue}>{formatDate(order.createdAt)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>CẬP NHẬT CUỐI</Text>
              <Text style={styles.dateValue}>{formatDate(order.updatedAt)}</Text>
            </View>
          </View>
        </View>

        {/* Files section */}
        <Text style={styles.sectionTitle}>Hình ảnh minh chứng ({files.length})</Text>
        
        {files.length === 0 ? (
          <View style={styles.emptyFilesCard}>
            <Text style={styles.emptyFilesText}>Chưa có ảnh đối soát nào cho đơn hàng này.</Text>
            <TouchableOpacity 
              style={styles.addFilesBtn}
              onPress={() => navigation.navigate('Upload', { orderId: order.id, maVanDon: order.maVanDon })}
            >
              <Text style={styles.addFilesBtnText}>+ Thêm ảnh ngay</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.filesGrid}>
            {files.map((file) => {
              // Construct serving URL for static upload files on server, fallback to local Uri if needed
              // Serve URL points to: http://<ip>:3000/uploads/<maVanDon>/<storedName>
              const fileUrl = `${serverUrl || 'http://localhost:3000'}/uploads/${order.maVanDon}/${file.storedName}?apiKey=${API_KEY}`;
              const isVideo = (file.mimeType && file.mimeType.startsWith('video/')) ||
                              file.fileName.toLowerCase().endsWith('.mp4') || 
                              file.fileName.toLowerCase().endsWith('.mov') || 
                              file.storedName.toLowerCase().endsWith('.mp4') || 
                              file.storedName.toLowerCase().endsWith('.mov');
              
              return (
                <View key={file.id} style={styles.fileThumbnailContainer}>
                  {isVideo ? (
                    <TouchableOpacity 
                      style={styles.videoThumbnail} 
                      onPress={() => Linking.openURL(fileUrl)}
                    >
                      <Text style={styles.videoIcon}>🎥</Text>
                      <Text style={styles.videoText}>Xem Video</Text>
                    </TouchableOpacity>
                  ) : (
                    <Image source={{ uri: fileUrl }} style={styles.thumbnail} />
                  )}
                  <TouchableOpacity style={styles.deleteFileBtn} onPress={() => handleDeleteFile(file.id)}>
                    <Text style={styles.deleteFileIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* Sync status section */}
        {order.trangThai === 'hoan_thanh' && (
          <View style={[styles.card, styles.syncCard]}>
            <Text style={styles.syncIcon}>☁️</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.syncTitle}>Đã lưu trữ thành công</Text>
              <Text style={styles.syncDesc}>
                Đơn hàng và toàn bộ ảnh đối soát đã được đồng bộ lên Google Drive của công ty.
              </Text>
            </View>
          </View>
        )}

        {/* Order deletion */}
        <TouchableOpacity style={styles.dangerZoneBtn} onPress={handleDeleteOrder}>
          <Text style={styles.dangerZoneText}>🗑️ Xóa toàn bộ đơn hàng</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerBackBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerBackIcon: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#475569',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
    marginBottom: 20,
    textAlign: 'center',
  },
  backBtn: {
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  backBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 10,
    elevation: 2,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 14,
    marginBottom: 14,
  },
  label: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  barcode: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  infoSection: {
    marginBottom: 16,
  },
  value: {
    fontSize: 14,
    color: '#334155',
    fontWeight: '500',
    marginTop: 2,
  },
  dateRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 14,
    gap: 16,
  },
  dateValue: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2,
  },
  weightDisplayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  weight: {
    fontSize: 22,
    fontWeight: '900',
    color: '#6366f1',
  },
  editBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  editBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  // Weight Edit Form
  weightEditContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  weightInput: {
    borderWidth: 1,
    borderColor: '#6366f1',
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    fontSize: 16,
    fontWeight: '700',
    width: 80,
    color: '#6366f1',
    backgroundColor: '#f5f3ff',
  },
  weightUnit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#64748b',
  },
  saveBtn: {
    backgroundColor: '#10b981',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  cancelBtnText: {
    color: '#64748b',
    fontWeight: '700',
    fontSize: 13,
  },
  // Files section
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    marginTop: 8,
  },
  emptyFilesCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 20,
  },
  emptyFilesText: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 12,
  },
  addFilesBtn: {
    backgroundColor: '#f5f3ff',
    borderWidth: 1,
    borderColor: '#c7d2fe',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addFilesBtnText: {
    color: '#6366f1',
    fontWeight: '700',
    fontSize: 13,
  },
  filesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  fileThumbnailContainer: {
    width: thumbSize,
    height: thumbSize,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#f1f5f9',
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  videoThumbnail: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoIcon: {
    fontSize: 24,
  },
  videoText: {
    fontSize: 9,
    color: '#cbd5e1',
    fontWeight: '700',
    marginTop: 2,
  },
  deleteFileBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteFileIcon: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  // Drive sync layout
  syncCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    borderColor: 'rgba(16, 185, 129, 0.2)',
  },
  syncIcon: {
    fontSize: 32,
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#065f46',
  },
  syncDesc: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '500',
    lineHeight: 16,
    marginTop: 2,
  },
  // Danger zone
  dangerZoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    backgroundColor: 'rgba(239, 68, 68, 0.02)',
    marginTop: 10,
  },
  dangerZoneText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 13,
  },
});
