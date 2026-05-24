import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Order } from '../types';
import StatusBadge from './StatusBadge';

interface OrderCardProps {
  order: Order;
  onPress: () => void;
}

export default function OrderCard({ order, onPress }: OrderCardProps) {
  // Format date cleanly
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return isoString;
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View>
          <Text style={styles.barcodeLabel}>MÃ VẬN ĐƠN</Text>
          <Text style={styles.barcode}>{order.maVanDon}</Text>
        </View>
        <StatusBadge status={order.trangThai} />
      </View>

      <View style={styles.body}>
        <View style={styles.weightContainer}>
          <Text style={styles.weightLabel}>TRỌNG LƯỢNG</Text>
          <Text style={styles.weight}>{order.soKy} kg</Text>
        </View>

        {order.ghiChu && (
          <View style={styles.noteContainer}>
            <Text style={styles.noteLabel}>GHI CHÚ</Text>
            <Text style={styles.note} numberOfLines={1}>
              {order.ghiChu}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.time}>{formatDate(order.createdAt)}</Text>
        <Text style={styles.detailLink}>Xem chi tiết →</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    paddingBottom: 12,
  },
  barcodeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  barcode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  body: {
    paddingVertical: 12,
    flexDirection: 'row',
    gap: 20,
  },
  weightContainer: {
    flex: 1,
  },
  weightLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  weight: {
    fontSize: 18,
    fontWeight: '800',
    color: '#6366f1', // Indigo accent
  },
  noteContainer: {
    flex: 2,
  },
  noteLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  note: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
    marginTop: 2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 10,
  },
  time: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  detailLink: {
    fontSize: 12,
    color: '#6366f1',
    fontWeight: '600',
  },
});
