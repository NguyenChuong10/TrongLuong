import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
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


export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ca_sang' | 'ca_dem'>('ca_sang');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [pin, setPin] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    checkActiveSession();
    loadUsers();
  }, []);

  const checkActiveSession = async () => {
    try {
      const activeUser = await AsyncStorage.getItem('@trongluong:active_user');
      if (activeUser) {
        navigation.replace('Home');
      }
    } catch (e) {
      console.error('Lỗi kiểm tra session:', e);
    }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      // 1. Load from cache first for instant offline availability
      const cached = await AsyncStorage.getItem('@trongluong:cached_users');
      if (cached) {
        setUsers(JSON.parse(cached));
      }

      // 2. Fetch fresh from server (if online) and update cache
      const res = await ApiService.fetchUsers();
      if (res && res.length > 0) {
        setUsers(res);
        await AsyncStorage.setItem('@trongluong:cached_users', JSON.stringify(res));
      }
    } catch (e) {
      console.warn('[Login] Đang chạy chế độ offline, tải dữ liệu từ cache.');
    } finally {
      setLoading(false);
    }
  };

  const handleUserSelect = (user: any) => {
    setSelectedUser(user);
    setPin('');
    setPinError(null);
  };

  const handleKeyPress = (num: string) => {
    setPinError(null);
    if (pin.length < 4) {
      const newPin = pin + num;
      setPin(newPin);
      
      if (newPin.length === 4) {
        verifyPin(newPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setPinError(null);
  };

  const verifyPin = async (enteredPin: string) => {
    if (!selectedUser) return;

    if (enteredPin === selectedUser.pin) {
      try {
        // Lưu phiên đăng nhập an toàn
        const sessionData = {
          id: selectedUser.id,
          name: selectedUser.name,
          shift: selectedUser.shift,
        };
        await AsyncStorage.setItem('@trongluong:active_user', JSON.stringify(sessionData));
        await AsyncStorage.setItem('@trongluong:session_business_date', getBusinessDate());
        
        // Chuyển hướng tới Home
        navigation.replace('Home');
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể lưu phiên đăng nhập!');
      }
    } else {
      setPinError('Mã PIN không đúng, vui lòng thử lại!');
      setPin('');
    }
  };

  // Filter users based on selected shift
  const filteredUsers = users.filter(u => u.shift === activeTab);

  return (
    <SafeAreaView style={[styles.container, activeTab === 'ca_dem' ? styles.darkBg : styles.lightBg]}>
      <StatusBar barStyle={activeTab === 'ca_dem' ? 'light-content' : 'dark-content'} />
      
      {/* Welcome Title */}
      <View style={styles.titleContainer}>
        <Text style={[styles.appTitle, activeTab === 'ca_dem' && styles.whiteText]}>TrongLuong v2</Text>
        <Text style={styles.appSubtitle}>HỆ THỐNG KIỂM KHO & QUẢN LÝ TẢI LƯỢNG</Text>
        <View style={{ marginTop: 12 }}>
          <ServerStatus />
        </View>
      </View>

      {!selectedUser ? (
        // SCREEN 1: SELECT USER / SHIFT
        <View style={styles.flowContainer}>
          <Text style={[styles.sectionTitle, activeTab === 'ca_dem' && styles.whiteText]}>
            BẮT ĐẦU CA LÀM VIỆC CỦA BẠN
          </Text>
          <Text style={styles.sectionSubtitle}>Vui lòng chọn Ca làm việc để tiếp tục:</Text>

          {/* Day/Night Shift Tabs */}
          <View style={styles.tabContainer}>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'ca_sang' && styles.activeDayTab]} 
              onPress={() => setActiveTab('ca_sang')}
            >
              <Text style={[styles.tabText, activeTab === 'ca_sang' ? styles.activeTabText : styles.inactiveTabText]}>
                ☀️ Ca Sáng (8h - 21h)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.tabButton, activeTab === 'ca_dem' && styles.activeNightTab]} 
              onPress={() => setActiveTab('ca_dem')}
            >
              <Text style={[styles.tabText, activeTab === 'ca_dem' ? styles.activeTabText : styles.inactiveTabText]}>
                🌙 Ca Đêm (21h - 8h)
              </Text>
            </TouchableOpacity>
          </View>

          {loading && users.length === 0 ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color="#6366f1" />
              <Text style={styles.loaderText}>Đang tải danh sách nhân viên...</Text>
            </View>
          ) : (
            <View style={styles.usersList}>
              {filteredUsers.length === 0 ? (
                <Text style={styles.noUserText}>Chưa có nhân viên nào trong ca này.</Text>
              ) : (
                filteredUsers.map((user) => (
                  <TouchableOpacity 
                    key={user.id} 
                    style={[styles.userCard, activeTab === 'ca_dem' ? styles.darkUserCard : styles.lightUserCard]}
                    onPress={() => handleUserSelect(user)}
                  >
                    <Text style={[styles.userAvatar, activeTab === 'ca_sang' ? styles.dayAvatar : styles.nightAvatar]}>
                      👤
                    </Text>
                    <Text style={[styles.userName, activeTab === 'ca_dem' && styles.whiteText]}>
                      {user.name}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </View>
          )}
        </View>
      ) : (
        // SCREEN 2: ENTER PIN KEYPAD
        <View style={styles.flowContainer}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setSelectedUser(null)}>
            <Text style={styles.backBtnText}>← Chọn nhân viên khác</Text>
          </TouchableOpacity>

          <Text style={[styles.sectionTitle, activeTab === 'ca_dem' && styles.whiteText]}>
            NHẬP MÃ PIN ĐĂNG NHẬP
          </Text>
          <Text style={styles.selectedUserBadge}>
            Tài khoản: {selectedUser.name} ({selectedUser.shift === 'ca_sang' ? 'Ca Sáng' : 'Ca Đêm'})
          </Text>

          {/* PIN Dots Indicators */}
          <View style={styles.pinDotsContainer}>
            {[1, 2, 3, 4].map((dot) => (
              <View 
                key={dot} 
                style={[
                  styles.pinDot,
                  pin.length >= dot ? styles.pinDotFilled : styles.pinDotEmpty,
                  pinError ? styles.pinDotError : null
                ]} 
              />
            ))}
          </View>

          {pinError && <Text style={styles.errorText}>{pinError}</Text>}

          {/* Custom Numeric Keypad */}
          <View style={styles.keypad}>
            <View style={styles.keypadRow}>
              {['1', '2', '3'].map(num => (
                <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                  <Text style={[styles.keyText, activeTab === 'ca_dem' && styles.whiteText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keypadRow}>
              {['4', '5', '6'].map(num => (
                <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                  <Text style={[styles.keyText, activeTab === 'ca_dem' && styles.whiteText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keypadRow}>
              {['7', '8', '9'].map(num => (
                <TouchableOpacity key={num} style={styles.key} onPress={() => handleKeyPress(num)}>
                  <Text style={[styles.keyText, activeTab === 'ca_dem' && styles.whiteText]}>{num}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.keypadRow}>
              <View style={styles.keyEmpty} />
              <TouchableOpacity style={styles.key} onPress={() => handleKeyPress('0')}>
                <Text style={[styles.keyText, activeTab === 'ca_dem' && styles.whiteText]}>0</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.key} onPress={handleBackspace}>
                <Text style={[styles.keyText, styles.backspaceKey]}>⌫</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  lightBg: {
    backgroundColor: '#f8fafc',
  },
  darkBg: {
    backgroundColor: '#0f172a',
  },
  whiteText: {
    color: '#fff',
  },
  titleContainer: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 30,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -1,
  },
  appSubtitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 4,
    letterSpacing: 1.5,
  },
  flowContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 20,
  },
  // Tab Shift Selection
  tabContainer: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    marginBottom: 24,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeDayTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  activeNightTab: {
    backgroundColor: '#1e293b',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeTabText: {
    color: '#6366f1',
  },
  inactiveTabText: {
    color: '#64748b',
  },
  // Users List Cards
  usersList: {
    width: '100%',
    gap: 12,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  lightUserCard: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
  },
  darkUserCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderColor: 'rgba(255,255,255,0.05)',
  },
  userAvatar: {
    fontSize: 20,
    marginRight: 16,
  },
  userName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
  },
  dayAvatar: {
    color: '#f59e0b',
  },
  nightAvatar: {
    color: '#818cf8',
  },
  noUserText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 20,
    fontSize: 13,
  },
  loader: {
    marginTop: 40,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 12,
    fontSize: 12,
    color: '#64748b',
  },
  // Back button in PIN mode
  backBtn: {
    alignSelf: 'flex-start',
    marginBottom: 20,
    paddingVertical: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6366f1',
  },
  selectedUserBadge: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 30,
  },
  // PIN Indicator dots
  pinDotsContainer: {
    flexDirection: 'row',
    gap: 18,
    marginBottom: 16,
    justifyContent: 'center',
    width: '100%',
  },
  pinDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  pinDotEmpty: {
    borderColor: '#cbd5e1',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    borderColor: '#6366f1',
    backgroundColor: '#6366f1',
  },
  pinDotError: {
    borderColor: '#ef4444',
    backgroundColor: '#ef4444',
  },
  errorText: {
    color: '#ef4444',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 20,
  },
  // Custom numeric keypad styles
  keypad: {
    width: '100%',
    maxWidth: 280,
    marginTop: 20,
    gap: 16,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  key: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 4,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0f172a',
  },
  backspaceKey: {
    color: '#ef4444',
    fontSize: 18,
  },
  keyEmpty: {
    width: 64,
    height: 64,
  },
});
