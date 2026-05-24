import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, Text, View, FlatList, TouchableOpacity, RefreshControl, ActivityIndicator, SafeAreaView, StatusBar, Modal, Alert } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../services/api';

let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system');
} catch (e) {
  console.warn('[HomeScreen] Gói expo-file-system không khả dụng native trong Expo Go.');
}
import { SocketService } from '../services/socket';
import { Order } from '../types';
import OrderCard from '../components/OrderCard';
import ServerStatus from '../components/ServerStatus';

export function getBusinessDate(date: Date = new Date()): string {
  const d = new Date(date);
  const hour = d.getHours();
  if (hour < 8) {
    d.setDate(d.getDate() - 1);
  }
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function HomeScreen() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeUser, setActiveUser] = useState<any | null>(null);
  const [sessionBusinessDate, setSessionBusinessDate] = useState<string | null>(null);
  const [showHandoverModal, setShowHandoverModal] = useState(false);
  const navigation = useNavigation<any>();

  // Load orders list
  const loadOrders = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await ApiService.fetchOrders();
      setOrders(data);
    } catch (e) {
      console.error('Failed to load orders:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const checkActiveSession = async () => {
    try {
      const activeUserStr = await AsyncStorage.getItem('@trongluong:active_user');
      const sessionDateStr = await AsyncStorage.getItem('@trongluong:session_business_date');
      
      if (!activeUserStr) {
        navigation.replace('Login');
        return;
      }
      
      const user = JSON.parse(activeUserStr);
      setActiveUser(user);
      setSessionBusinessDate(sessionDateStr);
      
      const currentBDate = getBusinessDate(new Date());
      if (sessionDateStr && sessionDateStr !== currentBDate) {
        // We have passed 08:00 AM of the next business date!
        setShowHandoverModal(true);
      }
    } catch (e) {
      console.error('Lỗi check session ở HomeScreen:', e);
    }
  };

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('@trongluong:active_user');
      await AsyncStorage.removeItem('@trongluong:session_business_date');
      navigation.replace('Login');
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể đăng xuất!');
    }
  };

  const handleHandoverConfirm = async () => {
    try {
      await AsyncStorage.removeItem('@trongluong:active_user');
      await AsyncStorage.removeItem('@trongluong:session_business_date');
      setShowHandoverModal(false);
      navigation.replace('Login');
    } catch (e) {
      console.error('Lỗi bàn giao ca:', e);
    }
  };

  const startOfflineSync = async () => {
    try {
      const health = await ApiService.checkHealth();
      if (!health || !health.ok) {
        return; // Server is offline
      }

      const offlineOrdersStr = await AsyncStorage.getItem('@trongluong:offline_orders');
      if (!offlineOrdersStr) return;

      const offlineOrders = JSON.parse(offlineOrdersStr);
      if (offlineOrders.length === 0) return;

      console.log(`🔄 [Auto-Sync] Phát hiện ${offlineOrders.length} đơn hàng ngoại tuyến. Bắt đầu đồng bộ...`);
      let remainingOffline = [...offlineOrders];

      for (const order of offlineOrders) {
        try {
          // 1. Tạo đơn hàng SQLite trên Server
          let serverOrder = null;
          try {
            serverOrder = await ApiService.createOrder({
              maVanDon: order.maVanDon,
              soKy: order.soKy,
              ghiChu: order.ghiChu,
              recordedBy: order.recordedBy,
              shift: order.shift,
              businessDate: order.businessDate
            });
          } catch (createErr: any) {
            if (createErr.message.includes('đã tồn tại')) {
              const allOrders = await ApiService.fetchOrders();
              serverOrder = allOrders.find((o: any) => o.maVanDon === order.maVanDon);
            } else {
              throw createErr;
            }
          }

          if (!serverOrder) throw new Error('Không thể khởi tạo đơn hàng trên SQLite Server');

          // 2. Đồng bộ các tệp tin đính kèm
          if (order.driveFolderId) {
            // Đã upload Drive trực tiếp (SERVER OFF + MẠNG ON) -> Gửi siêu dữ liệu
            await ApiService.syncDriveMetadata(order.maVanDon, {
              files: order.files,
              driveFolderId: order.driveFolderId,
              driveUrl: order.driveUrl
            });
            console.log(`✅ [Auto-Sync] Đồng bộ thành công siêu dữ liệu Drive cho đơn: ${order.maVanDon}`);
          } else {
            // Ngoại tuyến hoàn toàn -> Tải lên server và xóa tệp cục bộ
            if (order.files && order.files.length > 0) {
              for (const file of order.files) {
                await ApiService.uploadFile(
                  order.maVanDon,
                  { uri: file.uri, name: file.fileName, type: file.mimeType },
                  () => {}
                );
                
                // AUTO-CLEANUP: Xóa ngay tệp cục bộ trên điện thoại sau khi tải lên thành công
                try {
                  if (FileSystem && FileSystem.deleteAsync && file.uri.startsWith('file://')) {
                    await FileSystem.deleteAsync(file.uri, { idempotent: true });
                    console.log('🗑️ [Auto-Sync Cleanup] Đã xóa tệp đệm:', file.uri);
                  }
                } catch (cleanupErr) {
                  console.warn('Lỗi dọn dẹp file trong auto-sync:', cleanupErr);
                }
              }
            }
            console.log(`✅ [Auto-Sync] Đồng bộ thành công đơn hàng hoàn toàn offline: ${order.maVanDon}`);
          }

          // Xóa đơn này khỏi hàng đợi offline
          remainingOffline = remainingOffline.filter((o: any) => o.id !== order.id);
          await AsyncStorage.setItem('@trongluong:offline_orders', JSON.stringify(remainingOffline));

          // Reload quiet
          loadOrders(false);
        } catch (orderErr) {
          console.error(`❌ [Auto-Sync] Lỗi đồng bộ đơn ${order.maVanDon}:`, orderErr);
        }
      }
    } catch (e) {
      console.error('[Auto-Sync] Lỗi tiến trình đồng bộ ngầm:', e);
    }
  };

  // Re-fetch orders when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      // Connect services initially
      SocketService.connect();
      loadOrders(orders.length === 0);
      checkActiveSession();
      
      return () => {
        // Keeps socket active so connection badge stays updated, no disconnect
      };
    }, [])
  );

  useEffect(() => {
    // 1. Establish connection initially
    SocketService.connect();

    // 2. Listen to real-time order_updated from server
    // (e.g. from weight changes on other devices or desktop)
    const handleOrderUpdated = (data: any) => {
      console.log('[Socket Event] order_updated received in Home:', data);
      const { orderId, changes } = data;
      
      setOrders(currentOrders => 
        currentOrders.map(order => {
          if (order.id === orderId) {
            return {
              ...order,
              ...changes,
              // Map backend columns back to CamelCase if they come raw
              soKy: changes.soKy !== undefined ? changes.soKy : order.soKy,
              trangThai: changes.trangThai !== undefined ? changes.trangThai : order.trangThai,
              ghiChu: changes.ghiChu !== undefined ? changes.ghiChu : order.ghiChu,
            };
          }
          return order;
        })
      );
    };

    // 3. Listen to files_updated or drive_synced to refresh specific records
    const handleFilesUpdated = () => {
      loadOrders(false); // Reload quietly
    };

    SocketService.on('order_updated', handleOrderUpdated);
    SocketService.on('files_updated', handleFilesUpdated);
    SocketService.on('drive_synced', handleFilesUpdated);

    // 4. Kích hoạt tiến trình đồng bộ hàng đợi offline mỗi 10 giây
    const syncInterval = setInterval(startOfflineSync, 10000);
    startOfflineSync(); // Chạy ngay lập tức khi ứng dụng hiển thị

    return () => {
      SocketService.off('order_updated', handleOrderUpdated);
      SocketService.off('files_updated', handleFilesUpdated);
      SocketService.off('drive_synced', handleFilesUpdated);
      clearInterval(syncInterval);
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadOrders(false);
  };

  // Calculate quick stats for the current Business Date
  const currentBDate = getBusinessDate(new Date());
  const todayOrders = orders.filter(o => o.businessDate === currentBDate);
  const totalCount = todayOrders.length;
  const dayShiftCount = todayOrders.filter(o => o.shift === 'ca_sang').length;
  const nightShiftCount = todayOrders.filter(o => o.shift === 'ca_dem').length;

  // Handover summary calculations for completed business date
  const handoverOrders = sessionBusinessDate ? orders.filter(o => o.businessDate === sessionBusinessDate) : [];
  const handoverTotal = handoverOrders.length;
  const handoverDayCount = handoverOrders.filter(o => o.shift === 'ca_sang').length;
  const handoverNightCount = handoverOrders.filter(o => o.shift === 'ca_dem').length;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      {/* Sleek Custom Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>TrongLuong v2</Text>
          {activeUser ? (
            <View style={styles.userSessionContainer}>
              <Text style={styles.userSessionText}>
                👤 {activeUser.name} ({activeUser.shift === 'ca_sang' ? '☀️ Ca Sáng' : '🌙 Ca Đêm'})
              </Text>
              <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
                <Text style={styles.logoutBtnText}>Đăng xuất</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.subtitle}>Hệ thống quản lý tải lượng</Text>
          )}
        </View>
        <ServerStatus />
      </View>

      {/* Modern Dashboard Stats Grid */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#0f172a' }]}>{totalCount}</Text>
          <Text style={styles.statLabel}>Đơn Ngày ({currentBDate})</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#6366f1' }]}>{dayShiftCount}</Text>
          <Text style={styles.statLabel}>☀️ Ca Sáng</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#818cf8' }]}>{nightShiftCount}</Text>
          <Text style={styles.statLabel}>🌙 Ca Đêm</Text>
        </View>
      </View>

      {/* Prominent Call to Action Button */}
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={() => navigation.navigate('Scan')}
        activeOpacity={0.95}
      >
        <View style={styles.actionBtnGlow} />
        <Text style={styles.actionButtonIcon}>📸</Text>
        <View>
          <Text style={styles.actionButtonText}>TẠO ĐƠN HÀNG MỚI</Text>
          <Text style={styles.actionButtonSubtext}>Quét mã vận đơn Barcode bằng Camera</Text>
        </View>
      </TouchableOpacity>

      {/* Shift Handover Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={showHandoverModal}
        onRequestClose={() => {}}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalIcon}>🔄</Text>
            <Text style={styles.modalTitle}>BÀN GIAO CA LÀM VIỆC</Text>
            
            <View style={styles.handoverBadge}>
              <Text style={styles.handoverBadgeText}>
                Hết ca ngày nghiệp vụ: {sessionBusinessDate}
              </Text>
            </View>

            <Text style={styles.modalText}>
              Đồng hồ đã bước sang ngày nghiệp vụ mới. Vui lòng bàn giao ca làm việc của bạn để nhân viên ca sau tiếp tục đăng nhập.
            </Text>

            <View style={styles.handoverStats}>
              <View style={styles.handoverStatRow}>
                <Text style={styles.handoverStatLabel}>☀️ Số đơn Ca Sáng:</Text>
                <Text style={styles.handoverStatValue}>{handoverDayCount} đơn</Text>
              </View>
              <View style={styles.handoverStatRow}>
                <Text style={styles.handoverStatLabel}>🌙 Số đơn Ca Đêm:</Text>
                <Text style={styles.handoverStatValue}>{handoverNightCount} đơn</Text>
              </View>
              <View style={[styles.handoverStatRow, styles.handoverTotalRow]}>
                <Text style={styles.handoverTotalLabel}>📦 Tổng số đơn:</Text>
                <Text style={styles.handoverTotalValue}>{handoverTotal} đơn</Text>
              </View>
            </View>

            <TouchableOpacity 
              style={styles.modalButton} 
              onPress={handleHandoverConfirm}
              activeOpacity={0.9}
            >
              <Text style={styles.modalButtonText}>BẮT ĐẦU CA MỚI</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Text style={styles.sectionTitle}>Đơn hàng gần đây</Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
          <Text style={styles.loadingText}>Đang tải danh sách đơn hàng...</Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard 
              order={item} 
              onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })} 
            />
          )}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh} 
              colors={['#6366f1']} 
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>📦</Text>
              <Text style={styles.emptyTitle}>Chưa có đơn hàng nào</Text>
              <Text style={styles.emptyText}>
                Hãy bấm "Tạo đơn hàng mới" ở trên để quét barcode và cân trọng lượng gói hàng!
              </Text>
            </View>
          }
          contentContainerStyle={orders.length === 0 ? { flex: 1 } : { paddingBottom: 24 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc', // slate-50
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
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 5,
    elevation: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#6366f1', // Indigo Accent
    borderRadius: 14,
    padding: 18,
    marginHorizontal: 16,
    marginTop: 16,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  actionBtnGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  actionButtonIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  actionButtonSubtext: {
    fontSize: 11,
    color: '#c7d2fe',
    fontWeight: '500',
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginHorizontal: 16,
    marginTop: 24,
    marginBottom: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
  },
  userSessionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  userSessionText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
  },
  logoutBtn: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  logoutBtnText: {
    fontSize: 10,
    color: '#ef4444',
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  handoverBadge: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 9999,
    marginBottom: 16,
  },
  handoverBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  handoverStats: {
    width: '100%',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 24,
    gap: 10,
  },
  handoverStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  handoverStatLabel: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  handoverStatValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '700',
  },
  handoverTotalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
    marginTop: 2,
  },
  handoverTotalLabel: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: '800',
  },
  handoverTotalValue: {
    fontSize: 14,
    color: '#6366f1',
    fontWeight: '800',
  },
  modalButton: {
    backgroundColor: '#6366f1',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
