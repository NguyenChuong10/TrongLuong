import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Button, SafeAreaView, Dimensions, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width } = Dimensions.get('window');
const qrSize = width * 0.7;

export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const navigation = useNavigation<any>();

  if (!permission) {
    // Camera permissions are still loading
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!permission.granted) {
    // Camera permissions are not granted yet
    return (
      <SafeAreaView style={styles.centerContainer}>
        <Text style={styles.permissionIcon}>📷</Text>
        <Text style={styles.permissionTitle}>Quyền truy cập Camera</Text>
        <Text style={styles.permissionText}>
          Ứng dụng cần quyền sử dụng Camera để quét mã vạch trên nhãn dán đơn hàng.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Cho phép truy cập</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.backLink} 
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.backLinkText}>Quay về trang chủ</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // Handle scanned barcode
  const handleBarcodeScanned = ({ type, data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    console.log(`[Barcode Scanned] Type: ${type}, Data: ${data}`);
    
    // Navigate to OrderForm with the scanned value
    navigation.navigate('OrderForm', { barcode: data.trim() });
    
    // Reset scanned flag after navigation
    setTimeout(() => setScanned(false), 1000);
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <CameraView 
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={torchOn}
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: [
            'qr', 'code128', 'code39', 'code93', 'ean13', 'ean8', 'upc_a', 'upc_e', 'pdf417'
          ]
        }}
      >
        {/* Fullscreen Overlay Mask */}
        <View style={styles.overlay}>
          {/* Top dark region */}
          <View style={styles.darkRegion} />

          {/* Middle scan frame region */}
          <View style={styles.middleRow}>
            <View style={styles.darkRegion} />
            <View style={styles.scanFrame}>
              {/* Laser line effect */}
              <View style={styles.laser} />
              
              {/* Corners decorations */}
              <View style={[styles.corner, styles.topLeft]} />
              <View style={[styles.corner, styles.topRight]} />
              <View style={[styles.corner, styles.bottomLeft]} />
              <View style={[styles.corner, styles.bottomRight]} />
            </View>
            <View style={styles.darkRegion} />
          </View>

          {/* Bottom region containing guides and buttons */}
          <View style={[styles.darkRegion, styles.bottomRegion]}>
            <Text style={styles.scanGuide}>Di chuyển mã vạch vào giữa khung để quét</Text>
            
            <View style={styles.btnRow}>
              {/* Torch Button */}
              <TouchableOpacity 
                style={[styles.actionBtn, torchOn && styles.actionBtnActive]} 
                onPress={() => setTorchOn(!torchOn)}
              >
                <Text style={styles.actionBtnIcon}>{torchOn ? '🔦' : '💡'}</Text>
                <Text style={styles.actionBtnText}>Đèn Pin</Text>
              </TouchableOpacity>

              {/* Manual Input Button */}
              <TouchableOpacity 
                style={styles.actionBtn}
                onPress={() => navigation.navigate('OrderForm', { barcode: '' })}
              >
                <Text style={styles.actionBtnIcon}>✍️</Text>
                <Text style={styles.actionBtnText}>Nhập tay</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={() => navigation.navigate('Home')}
            >
              <Text style={styles.cancelBtnText}>Quay lại</Text>
            </TouchableOpacity>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

// Simple loader fallback
const ActivityIndicator = ({ size, color }: { size: string; color: string }) => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' }}>
    <Text style={{ color, fontSize: 14, fontWeight: '600' }}>Đang khởi tạo Camera...</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    padding: 24,
  },
  permissionIcon: {
    fontSize: 54,
    marginBottom: 16,
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  permissionButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  permissionButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  backLink: {
    marginTop: 20,
    padding: 10,
  },
  backLinkText: {
    color: '#64748b',
    fontWeight: '600',
    fontSize: 13,
  },
  // Overlay scanning mask
  overlay: {
    flex: 1,
  },
  darkRegion: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  middleRow: {
    flexDirection: 'row',
    height: qrSize,
  },
  scanFrame: {
    width: qrSize,
    height: qrSize,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  laser: {
    width: '85%',
    height: 2,
    backgroundColor: '#ef4444',
    position: 'absolute',
    opacity: 0.8,
  },
  // Neon Corner decorations
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: '#6366f1', // Indigo frame color
    borderWidth: 4,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  bottomRegion: {
    flex: 1.5,
    alignItems: 'center',
    paddingTop: 20,
    paddingHorizontal: 24,
  },
  scanGuide: {
    fontSize: 13,
    color: '#e2e8f0',
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 28,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'center',
    width: '100%',
    marginBottom: 30,
  },
  actionBtn: {
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    width: 90,
  },
  actionBtnActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.3)',
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  actionBtnIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionBtnText: {
    fontSize: 11,
    color: '#f1f5f9',
    fontWeight: '600',
  },
  cancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 14,
  },
});
