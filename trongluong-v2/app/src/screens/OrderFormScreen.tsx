import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView, SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ApiService } from '../services/api';
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

export default function OrderFormScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  const initialBarcode = route.params?.barcode || '';
  const isManual = initialBarcode === '';

  const [barcode, setBarcode] = useState(initialBarcode);
  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Validate form fields
  const handleNext = async () => {
    const cleanedBarcode = barcode.trim();
    const weightNum = parseFloat(weight);

    if (!cleanedBarcode) {
      Alert.alert('Lỗi nhập liệu', 'Vui lòng nhập Mã vận đơn!');
      return;
    }

    if (cleanedBarcode.length < 5) {
      Alert.alert('Lỗi nhập liệu', 'Mã vận đơn phải chứa ít nhất 5 ký tự!');
      return;
    }

    if (isNaN(weightNum) || weightNum <= 0) {
      Alert.alert('Lỗi nhập liệu', 'Vui lòng nhập số ký chính xác (phải lớn hơn 0)!');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Load session details
      const activeUserStr = await AsyncStorage.getItem('@trongluong:active_user');
      let recordedBy = undefined;
      let shift = undefined;
      if (activeUserStr) {
        const user = JSON.parse(activeUserStr);
        recordedBy = user.name;
        shift = user.shift;
      }
      const businessDate = getBusinessDate(new Date());

      const payload = {
        maVanDon: cleanedBarcode,
        soKy: weightNum,
        ghiChu: notes.trim() || undefined,
        recordedBy,
        shift,
        businessDate,
      };

      // 2. Submit POST /api/orders
      const order = await ApiService.createOrder(payload);

      if (order && order.id) {
        // Success! Navigate to upload screen, passing orderId and maVanDon
        navigation.navigate('Upload', { 
          orderId: order.id, 
          maVanDon: order.maVanDon,
          businessDate: order.businessDate,
          isOffline: false
        });
      } else {
        throw new Error('Không nhận được dữ liệu phản hồi từ server.');
      }
    } catch (error: any) {
      if (error.message.includes('Mã vận đơn đã tồn tại')) {
        Alert.alert('Lỗi nhập liệu', error.message);
        return;
      }

      console.warn('[Offline Mode] Lỗi gửi lên server, tiến hành lưu offline:', error);

      try {
        const activeUserStr = await AsyncStorage.getItem('@trongluong:active_user');
        let recordedBy = 'Nhân viên';
        let shift = 'ca_sang';
        if (activeUserStr) {
          const user = JSON.parse(activeUserStr);
          recordedBy = user.name;
          shift = user.shift;
        }
        const businessDate = getBusinessDate(new Date());

        const payload = {
          maVanDon: cleanedBarcode,
          soKy: weightNum,
          ghiChu: notes.trim() || undefined,
          recordedBy,
          shift,
          businessDate,
        };

        const offlineId = `offline_${Date.now()}`;
        const newOfflineOrder = {
          id: offlineId,
          ...payload,
          trangThai: 'cho_dong_bo', // Yellow tag
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          files: []
        };

        // Save to offline orders list
        const existingOfflineStr = await AsyncStorage.getItem('@trongluong:offline_orders');
        const existingOffline = existingOfflineStr ? JSON.parse(existingOfflineStr) : [];
        
        if (existingOffline.some((o: any) => o.maVanDon === cleanedBarcode)) {
          Alert.alert('Lỗi nhập liệu', 'Mã vận đơn này đã nằm trong hàng đợi offline của bạn!');
          return;
        }

        existingOffline.push(newOfflineOrder);
        await AsyncStorage.setItem('@trongluong:offline_orders', JSON.stringify(existingOffline));

        // Also save in cached orders list so it displays on HomeScreen instantly
        const cachedOrdersStr = await AsyncStorage.getItem('@trongluong:cached_orders');
        const cachedOrders = cachedOrdersStr ? JSON.parse(cachedOrdersStr) : [];
        cachedOrders.unshift(newOfflineOrder);
        await AsyncStorage.setItem('@trongluong:cached_orders', JSON.stringify(cachedOrders));

        Alert.alert(
          'Chế độ Ngoại tuyến',
          'Đang mất kết nối tới máy chủ. Đơn hàng đã được lưu tạm trên điện thoại (Chờ đồng bộ). Tiếp tục tải lên hình ảnh/video minh chứng!',
          [
            {
              text: 'Đồng ý',
              onPress: () => {
                navigation.navigate('Upload', {
                  orderId: offlineId,
                  maVanDon: cleanedBarcode,
                  businessDate: payload.businessDate,
                  isOffline: true
                });
              }
            }
          ]
        );
      } catch (storageErr) {
        Alert.alert('Lỗi', 'Không thể lưu đơn hàng ngoại tuyến!');
      }
    } finally {
      setSubmitting(false);
    }

  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Chi tiết cân nặng</Text>
        <ServerStatus />
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            
            {/* Barcode input field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>MÃ VẬN ĐƠN (BARCODE):</Text>
              <TextInput
                style={[styles.input, !isManual && styles.disabledInput]}
                value={barcode}
                onChangeText={setBarcode}
                editable={isManual}
                placeholder="Nhập hoặc quét mã vạch..."
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {!isManual && (
                <Text style={styles.helperText}>
                  * Mã được quét tự động từ camera. Bấm quay lại để quét lại.
                </Text>
              )}
            </View>

            {/* Weight input field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>TRỌNG LƯỢNG THỰC TẾ (KG):</Text>
              <View style={styles.weightInputContainer}>
                <TextInput
                  style={styles.weightInput}
                  value={weight}
                  onChangeText={setWeight}
                  placeholder="0.0"
                  keyboardType="decimal-pad"
                  autoFocus={true}
                  placeholderTextColor="#94a3b8"
                />
                <Text style={styles.weightUnit}>KG</Text>
              </View>
              <Text style={styles.helperText}>
                Ví dụ: 12.5 (dùng dấu chấm thập phân)
              </Text>
            </View>

            {/* Notes input field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>GHI CHÚ (TÙY CHỌN):</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={notes}
                onChangeText={setNotes}
                placeholder="Ví dụ: Hàng dễ vỡ, Thùng gỗ..."
                multiline={true}
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

          </View>

          {/* Action Buttons */}
          <View style={styles.btnGroup}>
            <TouchableOpacity 
              style={[styles.button, styles.backBtn]} 
              onPress={() => navigation.goBack()}
              disabled={submitting}
            >
              <Text style={styles.backBtnText}>Quay lại</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.submitBtn]} 
              onPress={handleNext}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Tiếp tục →</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
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
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: '#0f172a',
    backgroundColor: '#fff',
  },
  disabledInput: {
    backgroundColor: '#f1f5f9',
    borderColor: '#cbd5e1',
    color: '#475569',
    fontWeight: '600',
  },
  helperText: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 6,
    fontWeight: '500',
  },
  weightInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#6366f1', // Indigo frame for focus feel
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  weightInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    fontSize: 24,
    fontWeight: '800',
    color: '#6366f1',
  },
  weightUnit: {
    paddingHorizontal: 20,
    fontSize: 16,
    fontWeight: '800',
    color: '#475569',
    backgroundColor: '#f1f5f9',
    height: '100%',
    textAlignVertical: 'center',
    textAlign: 'center',
    // Simulate vertical alignment for iOS:
    paddingTop: Platform.OS === 'ios' ? 16 : 0,
  },
  textArea: {
    height: 90,
  },
  btnGroup: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  backBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 15,
  },
  submitBtn: {
    backgroundColor: '#6366f1',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});
