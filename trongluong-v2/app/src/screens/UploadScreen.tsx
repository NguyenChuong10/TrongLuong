import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, Image, FlatList, TouchableOpacity, ScrollView, SafeAreaView, Alert, Dimensions, StatusBar, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

let FileSystem: any = null;
try {
  FileSystem = require('expo-file-system');
} catch (e) {
  console.warn('[UploadScreen] Gói expo-file-system không khả dụng native trong Expo Go này.');
}
import { ApiService } from '../services/api';
import { SocketService } from '../services/socket';
import { UploadFile } from '../types';
import ProgressBar from '../components/ProgressBar';
import ServerStatus from '../components/ServerStatus';

const { width } = Dimensions.get('window');
const colWidth = (width - 44) / 3; // 3 columns grid spacing calculation

// Helper to determine accurate MIME type for upload
const getMimeType = (uri: string, assetType?: string): string => {
  const ext = uri.substring(uri.lastIndexOf('.')).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.3gp') return 'video/3gpp';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.pdf') return 'application/pdf';
  
  if (assetType === 'video') return 'video/mp4';
  return 'image/jpeg';
};

const findOrCreateGDriveFolder = async (folderName: string, parentFolderId: string, accessToken: string): Promise<string> => {
  try {
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      `name = '${folderName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`
    )}&fields=files(id)`;
    
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      }
    });
    
    const searchData = await searchRes.json();
    if (searchRes.ok && searchData.files && searchData.files.length > 0) {
      const folderId = searchData.files[0].id;
      console.log(`[GDrive direct] Thư mục "${folderName}" đã tồn tại: ${folderId}`);
      return folderId;
    }
  } catch (searchErr) {
    console.warn('[GDrive direct] Lỗi tìm kiếm thư mục:', searchErr);
  }

  const response = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentFolderId]
    })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Không thể tạo thư mục ${folderName}`);
  return data.id;
};

const uploadFileToGDrive = async (
  uri: string, 
  fileName: string, 
  mimeType: string, 
  folderId: string, 
  accessToken: string, 
  onProgress: (percent: number) => void
): Promise<{ id: string; webViewLink: string }> => {
  const formData = new FormData();
  const formattedUri = uri.startsWith('file://') ? uri : `file://${uri}`;

  const metadata = {
    name: fileName,
    parents: [folderId]
  };
  
  formData.append('metadata', {
    string: JSON.stringify(metadata),
    type: 'application/json'
  } as any);
  
  formData.append('file', {
    uri: formattedUri,
    name: fileName,
    type: mimeType
  } as any);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart');
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded * 100) / event.total);
        onProgress(percent);
      }
    };
    
    xhr.onload = () => {
      try {
        if (xhr.status >= 200 && xhr.status < 300) {
          const res = JSON.parse(xhr.responseText);
          resolve({
            id: res.id,
            webViewLink: `https://drive.google.com/file/d/${res.id}/view?usp=drivesdk`
          });
        } else {
          reject(new Error(`Lỗi tải trực tiếp Google Drive (HTTP ${xhr.status}): ${xhr.responseText}`));
        }
      } catch (e) {
        reject(e);
      }
    };
    
    xhr.onerror = () => reject(new Error('Lỗi mạng khi tải trực tiếp lên Google Drive'));
    xhr.send(formData);
  });
};

const setGDriveFilePublic = async (fileId: string, accessToken: string): Promise<boolean> => {
  try {
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
    return response.ok;
  } catch (e) {
    console.warn('Lỗi phân quyền file:', e);
    return false;
  }
};

const deleteLocalFile = async (uri: string) => {
  try {
    if (FileSystem && FileSystem.deleteAsync && uri.startsWith('file://')) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
      console.log('🗑️ [Auto-Cleanup] Đã xóa tệp đệm thành công:', uri);
    } else {
      console.log('[Auto-Cleanup] Bỏ qua dọn dẹp (FileSystem native module không có sẵn trong Expo Go).');
    }
  } catch (e) {
    console.warn('[Auto-Cleanup] Không thể xóa tệp đệm:', e);
  }
};


export default function UploadScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  
  const { orderId, maVanDon, businessDate } = route.params;

  const [selectedFiles, setSelectedFiles] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [syncingDrive, setSyncingDrive] = useState(false);

  useEffect(() => {
    // Connect socket and join this order's specific room
    // to hear real-time Google Drive sync events
    SocketService.connect();
    SocketService.joinOrderRoom(orderId);

    // Listen to Google Drive synchronization events
    const handleDriveSyncing = () => {
      console.log('[Socket Event] drive_syncing received');
      setSyncingDrive(true);
    };

    const handleDriveSynced = (data: any) => {
      console.log('[Socket Event] drive_synced received:', data);
      setSyncingDrive(false);
      // Tự động quay lại màn hình chính sau khi đồng bộ thành công
      navigation.navigate('Home');
    };

    const handleSyncError = (data: any) => {
      console.error('[Socket Event] sync_error received:', data);
      setSyncingDrive(false);
      Alert.alert('Đồng bộ lỗi', `Lỗi đồng bộ Google Drive: ${data.message || 'Chưa rõ nguyên nhân'}`);
    };

    SocketService.on('drive_syncing', handleDriveSyncing);
    SocketService.on('drive_synced', handleDriveSynced);
    SocketService.on('sync_error', handleSyncError);

    return () => {
      // Clean up and leave the socket room
      SocketService.leaveOrderRoom(orderId);
      SocketService.off('drive_syncing', handleDriveSyncing);
      SocketService.off('drive_synced', handleDriveSynced);
      SocketService.off('sync_error', handleSyncError);
    };
  }, [orderId]);

  // Launch gallery picker with multi-selection
  const pickImages = async () => {
    try {
      // Request media library permissions first
      const libraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!libraryPermission.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền truy cập thư viện ảnh và video trong cài đặt!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsMultipleSelection: true,
        quality: 0.5, // Nén ảnh thông minh để giảm dung lượng file xuống ~150KB
      });

      if (!result.canceled && result.assets) {
        const newFiles: UploadFile[] = result.assets.map(asset => {
          const uri = asset.uri;
          const name = uri.substring(uri.lastIndexOf('/') + 1) || `file_${Date.now()}.jpg`;
          const mime = asset.mimeType || getMimeType(uri, asset.type);
          return {
            uri,
            name,
            type: mime,
            size: asset.fileSize || 0,
            progress: 0,
            status: 'pending',
          };
        });

        setSelectedFiles(prev => [...prev, ...newFiles]);
      }
    } catch (e) {
      console.error('Picking images failed:', e);
      Alert.alert('Lỗi', 'Không thể mở thư viện ảnh.');
    }
  };

  // Launch native camera
  const capturePhoto = async () => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPermission.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền sử dụng camera trong cài đặt!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5, // Nén ảnh thông minh xuống ~150KB
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const name = uri.substring(uri.lastIndexOf('/') + 1) || `photo_${Date.now()}.jpg`;
        const newFile: UploadFile = {
          uri,
          name,
          type: asset.mimeType || 'image/jpeg',
          size: asset.fileSize || 0,
          progress: 0,
          status: 'pending',
        };

        setSelectedFiles(prev => [...prev, newFile]);
      }
    } catch (e) {
      console.error('Capturing photo failed:', e);
      Alert.alert('Lỗi', 'Không thể mở camera chụp ảnh.');
    }
  };

  // Launch native camera for recording video
  const recordVideo = async () => {
    try {
      const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
      if (!cameraPermission.granted) {
        Alert.alert('Quyền truy cập', 'Vui lòng cấp quyền sử dụng camera trong cài đặt để quay video!');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: false,
        quality: 0.5, // Nén video thông minh để giảm dung lượng file xuống ~1MB
        videoMaxDuration: 30, // Giới hạn video tối đa 30 giây để tối ưu dung lượng bộ nhớ
      });

      if (!result.canceled && result.assets && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        const name = uri.substring(uri.lastIndexOf('/') + 1) || `video_${Date.now()}.mp4`;
        const newFile: UploadFile = {
          uri,
          name,
          type: asset.mimeType || 'video/mp4',
          size: asset.fileSize || 0,
          progress: 0,
          status: 'pending',
        };

        setSelectedFiles(prev => [...prev, newFile]);
      }
    } catch (e) {
      console.error('Recording video failed:', e);
      Alert.alert('Lỗi', 'Không thể mở camera quay video.');
    }
  };

  // Remove a file from list before upload
  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleUploadAll = async () => {
    if (selectedFiles.length === 0) {
      Alert.alert('Thông báo', 'Vui lòng chọn ít nhất 1 hình ảnh hoặc video để tải lên!');
      return;
    }

    setUploading(true);
    const isOffline = route.params?.isOffline || false;

    if (isOffline) {
      // ── CHẾ ĐỘ NGOẠI TUYẾN (Offline Upload Flow) ─────────────────────────────
      try {
        const tokenDataStr = await AsyncStorage.getItem('@trongluong:gdrive_access_token');
        const parentFolderId = await AsyncStorage.getItem('@trongluong:gdrive_parent_folder_id') || '0AIw9-Tyyr5vWUk9PVA';
        
        let token = null;
        if (tokenDataStr) {
          const tokenData = JSON.parse(tokenDataStr);
          if (Date.now() - tokenData.timestamp < 50 * 60 * 1000) {
            token = tokenData.token;
          }
        }

        if (token) {
          // A. SERVER OFF + MẠNG ON (Có 4G/Wi-Fi) -> Upload trực tiếp Google Drive
          setSyncingDrive(true);
          
          let targetFolderId = parentFolderId;
          if (businessDate) {
            console.log(`[GDrive direct] Phát hiện ngày nghiệp vụ: ${businessDate}. Đang tạo/tìm thư mục ngày...`);
            targetFolderId = await findOrCreateGDriveFolder(businessDate, parentFolderId, token);
          }
          const folderId = await findOrCreateGDriveFolder(maVanDon, targetFolderId, token);
          const uploadedFilesList: any[] = [];

          const uploadPromises = selectedFiles.map(async (file, index) => {
            updateFileState(index, { status: 'uploading', progress: 0 });
            try {
              const driveFile = await uploadFileToGDrive(
                file.uri, 
                file.name, 
                file.type, 
                folderId, 
                token, 
                (percent) => updateFileState(index, { progress: percent })
              );

              await setGDriveFilePublic(driveFile.id, token);
              updateFileState(index, { status: 'done', progress: 100 });
              
              uploadedFilesList.push({
                driveFileId: driveFile.id,
                fileName: file.name,
                mimeType: file.type,
                size: file.size,
                path: driveFile.webViewLink,
                status: 'synced'
              });

              // AUTO-CLEANUP: Xóa ngay tệp cục bộ trên điện thoại để tiết kiệm dung lượng
              await deleteLocalFile(file.uri);
            } catch (err) {
              updateFileState(index, { status: 'error' });
              throw err;
            }
          });

          await Promise.all(uploadPromises);

          // Cập nhật lại đơn offline trong AsyncStorage queue
          const existingOfflineStr = await AsyncStorage.getItem('@trongluong:offline_orders');
          const existingOffline = existingOfflineStr ? JSON.parse(existingOfflineStr) : [];
          const updatedOffline = existingOffline.map((o: any) => {
            if (o.id === orderId) {
              return {
                ...o,
                driveFolderId: folderId,
                driveUrl: `https://drive.google.com/drive/folders/${folderId}`,
                trangThai: 'cho_dong_bo',
                files: uploadedFilesList
              };
            }
            return o;
          });
          await AsyncStorage.setItem('@trongluong:offline_orders', JSON.stringify(updatedOffline));

          // Cập nhật danh sách cached_orders hiển thị cục bộ
          const cachedOrdersStr = await AsyncStorage.getItem('@trongluong:cached_orders');
          const cachedOrders = cachedOrdersStr ? JSON.parse(cachedOrdersStr) : [];
          const updatedCached = cachedOrders.map((o: any) => {
            if (o.id === orderId) {
              return {
                ...o,
                driveFolderId: folderId,
                driveUrl: `https://drive.google.com/drive/folders/${folderId}`,
                trangThai: 'cho_dong_bo',
                files: uploadedFilesList
              };
            }
            return o;
          });
          await AsyncStorage.setItem('@trongluong:cached_orders', JSON.stringify(updatedCached));

          setSyncingDrive(false);
          Alert.alert(
            'Thành công',
            'Đã tải trực tiếp ảnh/video lên Google Drive thành công! Bộ nhớ đệm điện thoại đã được dọn dẹp sạch sẽ.',
            [{ text: 'Đồng ý', onPress: () => navigation.navigate('Home') }]
          );
        } else {
          // B. SERVER OFF + MẠNG OFF -> Lưu offline hoàn toàn, giữ lại file đệm cục bộ
          const offlineFilesList = selectedFiles.map(file => ({
            uri: file.uri,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            status: 'local'
          }));

          const existingOfflineStr = await AsyncStorage.getItem('@trongluong:offline_orders');
          const existingOffline = existingOfflineStr ? JSON.parse(existingOfflineStr) : [];
          const updatedOffline = existingOffline.map((o: any) => {
            if (o.id === orderId) {
              return {
                ...o,
                trangThai: 'cho_dong_bo',
                files: offlineFilesList
              };
            }
            return o;
          });
          await AsyncStorage.setItem('@trongluong:offline_orders', JSON.stringify(updatedOffline));

          const cachedOrdersStr = await AsyncStorage.getItem('@trongluong:cached_orders');
          const cachedOrders = cachedOrdersStr ? JSON.parse(cachedOrdersStr) : [];
          const updatedCached = cachedOrders.map((o: any) => {
            if (o.id === orderId) {
              return {
                ...o,
                trangThai: 'cho_dong_bo',
                files: offlineFilesList
              };
            }
            return o;
          });
          await AsyncStorage.setItem('@trongluong:cached_orders', JSON.stringify(updatedCached));

          Alert.alert(
            'Ngoại tuyến hoàn toàn',
            'Mất kết nối mạng. Ảnh/video đã được lưu an toàn trên điện thoại. Hệ thống sẽ tự động đồng bộ khi có kết nối!',
            [{ text: 'Đồng ý', onPress: () => navigation.navigate('Home') }]
          );
        }
      } catch (err: any) {
        Alert.alert('Lỗi tải trực tiếp', err.message || 'Không thể đồng bộ Google Drive ngoại tuyến. Vui lòng thử lại!');
        setSyncingDrive(false);
        setUploading(false);
      }
    } else {
      // ── CHẾ ĐỘ TRỰC TUYẾN (Standard Online Upload Flow) ──────────────────────
      try {
        const uploadPromises = selectedFiles.map(async (file, index) => {
          updateFileState(index, { status: 'uploading', progress: 0 });
          try {
            await ApiService.uploadFile(
              maVanDon,
              { uri: file.uri, name: file.name, type: file.type },
              (percent) => {
                updateFileState(index, { progress: percent });
              }
            );
            updateFileState(index, { status: 'done', progress: 100 });
            
            // AUTO-CLEANUP: Xóa ngay tệp cục bộ trên điện thoại sau khi tải lên thành công!
            await deleteLocalFile(file.uri);
          } catch (err) {
            updateFileState(index, { status: 'error' });
            throw err;
          }
        });

        await Promise.all(uploadPromises);

        // Nạp và lưu cache Access Token Google Drive để dùng khi offline
        try {
          const tokenRes = await ApiService.fetchDriveToken();
          if (tokenRes && tokenRes.token) {
            const tokenCache = {
              token: tokenRes.token,
              timestamp: Date.now()
            };
            await AsyncStorage.setItem('@trongluong:gdrive_access_token', JSON.stringify(tokenCache));
            await AsyncStorage.setItem('@trongluong:gdrive_parent_folder_id', tokenRes.parentFolderId);
          }
        } catch (tokenErr) {
          console.warn('Lỗi lưu cache token Google Drive:', tokenErr);
        }

        navigation.navigate('Home');
      } catch (err) {
        Alert.alert(
          'Lỗi tải lên',
          'Có lỗi xảy ra trong quá trình upload song song lên server. Vui lòng thử lại!'
        );
        setUploading(false);
      }
    }
  };


  const updateFileState = (index: number, state: Partial<UploadFile>) => {
    setSelectedFiles(current => 
      current.map((file, i) => {
        if (i === index) {
          return { ...file, ...state };
        }
        return file;
      })
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.title}>Đính kèm tài liệu</Text>
          <Text style={styles.subtitle}>Đơn hàng: {maVanDon}</Text>
        </View>
        <ServerStatus />
      </View>

      <View style={{ flex: 1 }}>
        {/* Render selection options initially */}
        {!uploading && !syncingDrive && (
          <View style={styles.pickerContainer}>
            <TouchableOpacity style={[styles.pickerBtn, styles.galleryBtn]} onPress={pickImages}>
              <Text style={styles.pickerIcon}>🖼️</Text>
              <Text style={[styles.pickerText, styles.galleryBtnText]} numberOfLines={1}>Chọn Thư viện</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pickerBtn, styles.cameraBtn]} onPress={capturePhoto}>
              <Text style={styles.pickerIcon}>📸</Text>
              <Text style={[styles.pickerText, styles.cameraBtnText]} numberOfLines={1}>Chụp ảnh</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.pickerBtn, styles.videoBtn]} onPress={recordVideo}>
              <Text style={styles.pickerIcon}>🎥</Text>
              <Text style={[styles.pickerText, styles.videoBtnText]} numberOfLines={1}>Quay video</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Selected files preview or progress tracker */}
        {uploading || syncingDrive ? (
          <View style={styles.progressContainer}>
            <Text style={styles.progressTitle}>
              {syncingDrive 
                ? '🔄 Đang đồng bộ lên Google Drive...' 
                : '🚀 Đang tải lên server song song (Parallel Upload)...'}
            </Text>
            {syncingDrive && <ActivityIndicator size="small" color="#6366f1" style={{ marginVertical: 10 }} />}
            
            <ScrollView style={styles.progressBarList}>
              {selectedFiles.map((item, index) => (
                <ProgressBar
                  key={index}
                  fileName={item.name}
                  progress={item.progress}
                  status={item.status}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          <FlatList
            data={selectedFiles}
            keyExtractor={(_, index) => index.toString()}
            numColumns={3}
            renderItem={({ item, index }) => {
              const isVideo = item.type.startsWith('video/') || item.name.toLowerCase().endsWith('.mp4') || item.name.toLowerCase().endsWith('.mov');
              return (
                <View style={styles.previewWrapper}>
                  {isVideo ? (
                    <View style={styles.videoPreviewContainer}>
                      <Text style={styles.videoPreviewIcon}>🎥</Text>
                      <Text style={styles.videoName} numberOfLines={1}>{item.name}</Text>
                    </View>
                  ) : (
                    <Image source={{ uri: item.uri }} style={styles.previewImage} />
                  )}
                  <TouchableOpacity style={styles.removeBadge} onPress={() => removeFile(index)}>
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyIcon}>📂</Text>
                <Text style={styles.emptyText}>Chưa có ảnh/video nào được chọn.</Text>
                <Text style={styles.emptySubtext}>
                  Bạn cần đính kèm ít nhất 1 ảnh chụp hàng để phục vụ đối soát trọng lượng.
                </Text>
              </View>
            }
            contentContainerStyle={selectedFiles.length === 0 ? { flex: 1 } : { padding: 12 }}
          />
        )}

        {/* Bottom Upload actions */}
        {!uploading && !syncingDrive && (
          <View style={styles.footer}>
            <TouchableOpacity 
              style={[styles.actionBtn, styles.cancelBtn]}
              onPress={() => navigation.navigate('Home')}
            >
              <Text style={styles.cancelBtnText}>Bỏ qua</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.actionBtn, styles.uploadBtn, selectedFiles.length === 0 && styles.disabledUploadBtn]}
              onPress={handleUploadAll}
              disabled={selectedFiles.length === 0}
            >
              <Text style={styles.uploadBtnText}>Upload {selectedFiles.length} file</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
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
  headerTitleContainer: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  subtitle: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '700',
    marginTop: 2,
  },
  pickerContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  pickerBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  galleryBtn: {
    backgroundColor: '#fff',
    borderColor: '#cbd5e1',
  },
  cameraBtn: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  videoBtn: {
    backgroundColor: '#0f172a',
    borderColor: '#0f172a',
  },
  videoBtnText: {
    color: '#fff',
  },
  pickerIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  pickerText: {
    fontSize: 13,
    fontWeight: '700',
  },
  // Dynamic button texts
  cancelBtnText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 15,
  },
  uploadBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  galleryBtnText: {
    color: '#334155',
  },
  cameraBtnText: {
    color: '#fff',
  },
  // Selection grid
  previewWrapper: {
    width: colWidth,
    height: colWidth,
    margin: 4,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    backgroundColor: '#e2e8f0',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  videoPreviewContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
  },
  videoPreviewIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  videoName: {
    fontSize: 9,
    color: '#cbd5e1',
    fontWeight: '600',
    textAlign: 'center',
  },
  removeBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 48,
    color: '#94a3b8',
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
  },
  // Uploading and tracking layout
  progressContainer: {
    flex: 1,
    padding: 20,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 16,
    lineHeight: 20,
  },
  progressBarList: {
    flex: 1,
  },
  // Footer
  footer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#fff',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#f1f5f9',
  },
  uploadBtn: {
    backgroundColor: '#10b981', // emerald green for final upload
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  disabledUploadBtn: {
    backgroundColor: '#cbd5e1',
    shadowOpacity: 0,
    elevation: 0,
  },
});
