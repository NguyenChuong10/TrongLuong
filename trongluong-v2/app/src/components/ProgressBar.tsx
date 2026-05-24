import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface ProgressBarProps {
  progress: number; // 0 to 100
  fileName: string;
  status?: 'pending' | 'uploading' | 'done' | 'error';
}

export default function ProgressBar({ progress, fileName, status = 'uploading' }: ProgressBarProps) {
  const getStatusColor = () => {
    if (status === 'error') return '#ef4444';
    if (status === 'done' || progress === 100) return '#10b981';
    return '#6366f1'; // primary indigo
  };

  const color = getStatusColor();

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.fileName} numberOfLines={1}>
          {fileName}
        </Text>
        <Text style={[styles.percent, { color }]}>
          {status === 'error' ? 'Lỗi' : `${progress}%`}
        </Text>
      </View>
      <View style={styles.barBackground}>
        <View 
          style={[
            styles.barFill, 
            { 
              width: `${progress}%`,
              backgroundColor: color 
            }
          ]} 
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    width: '100%',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  fileName: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
    flex: 1,
    marginRight: 10,
  },
  percent: {
    fontSize: 12,
    fontWeight: '700',
  },
  barBackground: {
    height: 6,
    backgroundColor: '#e2e8f0',
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
