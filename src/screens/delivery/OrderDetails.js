import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  StatusBar,
  RefreshControl,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { updateDeliveryOrderStatus } from '../../services/orderService';

const STATUS_COLORS = {
  PENDING: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  PICKUP_IN_PROGRESS: '#00BCD4',
  PICKED_UP: '#00897B',
  SHIPPED: '#FF5722',
  IN_TRANSIT: '#00BCD4',
  OUT_FOR_DELIVERY: '#FF9800',
  DELIVERED: '#4CAF50',
  COMPLETED: '#4CAF50',
  CANCELLED: '#F44336',
};

const STATUS_FLOW = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKUP_IN_PROGRESS',
  'PICKED_UP',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

// What button label and next status based on current status
const STATUS_ACTIONS = {
  ASSIGNED: { label: 'Start Pickup', nextStatus: 'PICKUP_IN_PROGRESS', icon: 'bicycle-outline' },
  PICKUP_IN_PROGRESS: { label: 'Confirm Pickup', nextStatus: 'SHIPPED', icon: 'checkmark-circle-outline' },
  PICKED_UP: { label: 'Start Delivery', nextStatus: 'OUT_FOR_DELIVERY', icon: 'car-outline' },
  SHIPPED: { label: 'Start Delivery', nextStatus: 'OUT_FOR_DELIVERY', icon: 'car-outline' },
  OUT_FOR_DELIVERY: { label: 'Confirm Delivery', nextStatus: 'DELIVERED', icon: 'checkmark-done-circle-outline' },
};

const OrderDetails = ({ navigation, route }) => {
  const { order: initialOrder, orderId: paramOrderId } = route.params || {};
  const insets = useSafeAreaInsets();
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const orderId = paramOrderId || initialOrder?.order_id || initialOrder?.id;

  // ─── Fetch order ──────────────────────────────────────────────────────
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const data = res.data?.data || res.data;
      setOrder(data);
    } catch (e) {
      // Fallback: fetch from delivery orders
      try {
        const res2 = await api.get('/delivery-persons/orders');
        const allOrders = res2.data?.data || res2.data?.orders || [];
        const found = allOrders.find((o) => o.order_id === orderId || o.id === orderId);
        if (found) setOrder(found);
      } catch {
        console.log('Fetch order error:', e.message);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrder();
  };

  // ─── Status update ────────────────────────────────────────────────────
  const currentStatus = order?.current_status || order?.status || '';
  const action = STATUS_ACTIONS[currentStatus];

  const handleStatusUpdate = () => {
    if (!action) return;
    Alert.alert(
      action.label,
      `Are you sure you want to mark this order as "${action.nextStatus.replace(/_/g, ' ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsUpdating(true);
            try {
              await updateDeliveryOrderStatus(orderId, action.nextStatus);
              setOrder((prev) => ({ ...prev, current_status: action.nextStatus }));
              Alert.alert('Success!', `Order status updated to ${action.nextStatus.replace(/_/g, ' ')}`);
            } catch (e) {
              // Fallback
              try {
                await api.put(`/orders/${orderId}/status`, { status: action.nextStatus });
                setOrder((prev) => ({ ...prev, current_status: action.nextStatus }));
                Alert.alert('Success!', `Order status updated to ${action.nextStatus.replace(/_/g, ' ')}`);
              } catch {
                Alert.alert('Error', e.message || 'Failed to update status');
              }
            } finally {
              setIsUpdating(false);
            }
          },
        },
      ]
    );
  };

  // Navigate to update page with photo proof
  const handleManualUpdate = () => {
    navigation.navigate('OrderUpdate', {
      order,
      orderId: orderId,
      action: action?.nextStatus || null,
    });
  };

  // ─── Phone & Map actions ──────────────────────────────────────────────
  const callPerson = (phone) => {
    if (!phone) {
      Alert.alert('No Phone', 'Phone number not available');
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Error', 'Cannot make call'));
  };

  const openMap = (address) => {
    if (!address) return;
    const query = encodeURIComponent(address);
    Linking.openURL(`https://maps.google.com/maps?q=${query}`).catch(() =>
      Alert.alert('Error', 'Cannot open maps')
    );
  };

  // ─── Timeline ─────────────────────────────────────────────────────────
  const renderTimeline = () => {
    const currentIdx = STATUS_FLOW.indexOf(currentStatus);
    return (
      <View style={styles.timelineContainer}>
        {STATUS_FLOW.map((status, i) => {
          const isActive = i <= currentIdx;
          const isCurrent = status === currentStatus;
          const color = isActive ? (STATUS_COLORS[status] || '#4CAF50') : '#ddd';
          return (
            <View key={status} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View
                  style={[
                    styles.timelineDot,
                    {
                      backgroundColor: isActive ? color : '#fff',
                      borderColor: color,
                      borderWidth: isActive ? 0 : 2,
                    },
                    isCurrent && styles.timelineDotCurrent,
                  ]}
                >
                  {isActive && (
                    <Ionicons
                      name={i < currentIdx ? 'checkmark' : 'ellipse'}
                      size={i < currentIdx ? 14 : 8}
                      color="#fff"
                    />
                  )}
                </View>
                {i < STATUS_FLOW.length - 1 && (
                  <View
                    style={[
                      styles.timelineLine,
                      { backgroundColor: i < currentIdx ? '#4CAF50' : '#e0e0e0' },
                    ]}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.timelineText,
                  isActive && styles.timelineTextActive,
                  isCurrent && styles.timelineTextCurrent,
                ]}
              >
                {status.replace(/_/g, ' ')}
              </Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ─── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </View>
    );
  }

  const statusColor = STATUS_COLORS[currentStatus] || '#888';

  // Order items
  const items = order?.items || order?.order_items || [];
  const singleProduct = order?.product || null;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order #{orderId}</Text>
        <TouchableOpacity onPress={onRefresh}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Badge */}
        <View style={styles.statusCard}>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {currentStatus.replace(/_/g, ' ')}
            </Text>
          </View>
          <Text style={styles.statusSub}>
            Order placed on {order?.order_date ? new Date(order.order_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </Text>
        </View>

        {/* Pickup Info (Farmer) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="store-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Pickup From</Text>
          </View>
          <Text style={styles.personName}>
            {order?.farmer?.name || order?.farmer?.full_name || order?.farmer_name || 'Farmer'}
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#888" />
            <Text style={styles.infoText}>
              {order?.farmer?.address || order?.farmer?.farm_address || order?.pickup_address || order?.farm_address || 'Address not available'}
            </Text>
          </View>
          {(order?.farmer?.phone || order?.farmer?.mobile_number || order?.farmer_phone) && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#888" />
              <Text style={styles.infoText}>
                {order?.farmer?.phone || order?.farmer?.mobile_number || order?.farmer_phone}
              </Text>
            </View>
          )}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
              onPress={() => openMap(order?.farmer?.address || order?.pickup_address || order?.farm_address)}
            >
              <Ionicons name="navigate-outline" size={18} color="#2196F3" />
              <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }]}
              onPress={() => callPerson(order?.farmer?.phone || order?.farmer?.mobile_number || order?.farmer_phone)}
            >
              <Ionicons name="call-outline" size={18} color="#4CAF50" />
              <Text style={[styles.actionBtnText, { color: '#4CAF50' }]}>Call Farmer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Delivery Info (Customer) */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Deliver To</Text>
          </View>
          <Text style={styles.personName}>
            {order?.customer?.name || order?.customer?.full_name || order?.customer_name || 'Customer'}
          </Text>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={16} color="#888" />
            <Text style={styles.infoText}>
              {order?.delivery_address || order?.customer?.address || 'Address not available'}
            </Text>
          </View>
          {(order?.customer?.phone || order?.customer?.mobile_number || order?.customer_phone) && (
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#888" />
              <Text style={styles.infoText}>
                {order?.customer?.phone || order?.customer?.mobile_number || order?.customer_phone}
              </Text>
            </View>
          )}
          <View style={styles.actionBtnRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
              onPress={() => openMap(order?.delivery_address || order?.customer?.address)}
            >
              <Ionicons name="navigate-outline" size={18} color="#2196F3" />
              <Text style={[styles.actionBtnText, { color: '#2196F3' }]}>Directions</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FFF3E0' }]}
              onPress={() => callPerson(order?.customer?.phone || order?.customer?.mobile_number || order?.customer_phone)}
            >
              <Ionicons name="call-outline" size={18} color="#FF9800" />
              <Text style={[styles.actionBtnText, { color: '#FF9800' }]}>Call Customer</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Order Items / Products */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="package-variant" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Order Items</Text>
          </View>

          {items.length > 0 ? (
            items.map((item, i) => (
              <View key={i} style={styles.productRow}>
                {item.image_url && (
                  <Image source={{ uri: item.image_url }} style={styles.productImage} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.productName}>{item.product_name || item.name || 'Product'}</Text>
                  <Text style={styles.productQty}>
                    Qty: {item.quantity || 1} {item.unit && `(${item.unit})`}
                  </Text>
                </View>
                <Text style={styles.productPrice}>
                  ₹{Number(item.total_price || item.price || 0).toFixed(2)}
                </Text>
              </View>
            ))
          ) : singleProduct ? (
            <View style={styles.productRow}>
              {singleProduct.image_url && (
                <Image source={{ uri: singleProduct.image_url }} style={styles.productImage} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.productName}>{singleProduct.name || 'Product'}</Text>
                <Text style={styles.productQty}>Qty: {order?.quantity || 1}</Text>
              </View>
              <Text style={styles.productPrice}>
                ₹{Number(order?.total_price || order?.total_amount || 0).toFixed(2)}
              </Text>
            </View>
          ) : (
            <Text style={styles.noItems}>Product details not available</Text>
          )}

          {/* Total */}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Amount</Text>
            <Text style={styles.totalValue}>
              ₹{Number(order?.total_price || order?.total_amount || order?.grand_total || 0).toFixed(2)}
            </Text>
          </View>
          <View style={styles.paymentRow}>
            <Ionicons name="card-outline" size={16} color="#888" />
            <Text style={styles.paymentText}>
              Payment: {order?.payment_method || order?.payment_status || 'COD'}
            </Text>
          </View>
        </View>

        {/* QR Code */}
        {(order?.qr_code || order?.qr_image_url) && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="qr-code-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Order QR Code</Text>
            </View>
            {order?.qr_image_url ? (
              <View style={styles.qrContainer}>
                <Image source={{ uri: order.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
              </View>
            ) : (
              <View style={styles.qrContainer}>
                <Text style={styles.qrText}>{order.qr_code}</Text>
              </View>
            )}
          </View>
        )}

        {/* Status Timeline */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="git-branch-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardTitle}>Order Timeline</Text>
          </View>
          {renderTimeline()}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {action && currentStatus !== 'DELIVERED' && currentStatus !== 'CANCELLED' && (
            <TouchableOpacity
              style={[styles.primaryActionBtn, isUpdating && { opacity: 0.6 }]}
              onPress={handleStatusUpdate}
              disabled={isUpdating}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={['#103A12', '#1B5E20', '#2E7D32']}
                style={styles.primaryActionGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isUpdating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name={action.icon} size={22} color="#fff" />
                    <Text style={styles.primaryActionText}>{action.label}</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.secondaryActionBtn}
            onPress={handleManualUpdate}
            activeOpacity={0.7}
          >
            <Ionicons name="create-outline" size={20} color="#FF9800" />
            <Text style={styles.secondaryActionText}>Update with Photo Proof</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },

  // Header
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 12 },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Status card
  statusCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    elevation: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 8,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 18, fontWeight: '800', textTransform: 'uppercase' },
  statusSub: { fontSize: 13, color: '#888', marginTop: 8 },

  // Cards
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#1B5E20', textTransform: 'uppercase', letterSpacing: 0.5 },

  personName: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  infoText: { flex: 1, fontSize: 13, color: '#666', lineHeight: 19 },

  // Action buttons row
  actionBtnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 10,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },

  // Products
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 12,
  },
  productImage: { width: 50, height: 50, borderRadius: 10 },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productQty: { fontSize: 12, color: '#888', marginTop: 2 },
  productPrice: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  noItems: { fontSize: 13, color: '#aaa', textAlign: 'center', padding: 16 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 14,
    marginTop: 8,
    borderTopWidth: 1.5,
    borderTopColor: '#E8F5E9',
  },
  totalLabel: { fontSize: 14, fontWeight: '800', color: '#1A1A1A' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#1B5E20' },
  paymentRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  paymentText: { fontSize: 13, color: '#888' },

  // QR Code
  qrContainer: { alignItems: 'center', padding: 16 },
  qrImage: { width: 180, height: 180 },
  qrText: { fontSize: 14, fontFamily: 'monospace', color: '#555', textAlign: 'center' },

  // Timeline
  timelineContainer: { paddingLeft: 4 },
  timelineItem: { flexDirection: 'row', alignItems: 'flex-start', minHeight: 40 },
  timelineLeft: { alignItems: 'center', width: 28, marginRight: 12 },
  timelineDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timelineDotCurrent: {
    width: 26,
    height: 26,
    borderRadius: 13,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  timelineLine: { width: 2, flex: 1, marginVertical: 2 },
  timelineText: { fontSize: 12, color: '#bbb', paddingTop: 3, flex: 1 },
  timelineTextActive: { color: '#555', fontWeight: '500' },
  timelineTextCurrent: { color: '#1B5E20', fontWeight: '700', fontSize: 13 },

  // Actions
  actionsContainer: { gap: 12, marginTop: 8 },
  primaryActionBtn: { borderRadius: 16, overflow: 'hidden' },
  primaryActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  primaryActionText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF8E1',
    borderRadius: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  secondaryActionText: { color: '#FF9800', fontSize: 15, fontWeight: 'bold' },
});

export default OrderDetails;
