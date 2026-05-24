import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatusBadgeProps {
  status: 'cho_xu_ly' | 'dang_xu_ly' | 'hoan_thanh' | 'loi';
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'cho_xu_ly':
        return {
          bg: '#fef3c7',
          border: '#fde68a',
          text: '#d97706',
          label: 'Chờ xử lý',
        };
      case 'dang_xu_ly':
        return {
          bg: '#dbeafe',
          border: '#bfdbfe',
          text: '#2563eb',
          label: 'Đang xử lý',
        };
      case 'hoan_thanh':
        return {
          bg: '#d1fae5',
          border: '#a7f3d0',
          text: '#059669',
          label: 'Đã hoàn thành',
        };
      case 'loi':
        return {
          bg: '#fee2e2',
          border: '#fecaca',
          text: '#dc2626',
          label: 'Gặp lỗi',
        };
      default:
        return {
          bg: '#f1f5f9',
          border: '#e2e8f0',
          text: '#475569',
          label: 'Không rõ',
        };
    }
  };

  const style = getStatusStyles();

  return (
    <View style={[styles.badge, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[styles.text, { color: style.text }]}>{style.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
});
