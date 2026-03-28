/**
 * OrderStatus.js
 * Active orders split into Source (PICKUP_SHIPPING) and Destination (DELIVERY) tabs.
 *
 * Features:
 *   - GET /api/transporters/orders/active
 *   - Filter by status: All, Assigned, Shipped, In Transit
 *   - Status update buttons (ASSIGNED→SHIPPED, SHIPPED→OUT_FOR_DELIVERY)
 *   - Assign delivery person if not assigned
 *   - Order tap → OrderDetail
 *   - Pull to refresh
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import {
  assignTransporterDeliveryPerson,
  updateTransporterOrderStatus,
} from '../../services/orderService';
import useAutoRefresh from '../../hooks/useAutoRefresh';

const TABS = ['Source (Pickup)', 'Destination (Delivery)'];

const getStatusColor = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'COMPLETED') return '#4CAF50';
  if (s === 'SHIPPED') return '#3F51B5';
  if (s === 'OUT_FOR_DELIVERY' || s === 'IN_TRANSIT') return '#00BCD4';
  if (s === 'ASSIGNED') return '#9C27B0';
  if (s === 'CONFIRMED') return '#2196F3';
  if (s === 'CANCELLED') return '#F44336';
  if (s === 'RECEIVED') return '#FF5722';
  return '#FF9800';
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const getAddressText = (value) => {
  if (!value) return '';

  const parts = [];
  const addPart = (v) => {
    if (v === null || v === undefined) return;
    const text = String(v).trim();
    if (!text) return;
    if (!parts.includes(text)) parts.push(text);
  };

  const parseValue = (input) => {
    if (input === null || input === undefined) return;

    if (typeof input === 'string') {
      const trimmed = input.trim();
      if (!trimmed) return;

      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          parseValue(JSON.parse(trimmed));
          return;
        } catch (_) {
          // Fallback to plain text when parsing fails.
        }
      }

      addPart(trimmed);
      return;
    }

    if (Array.isArray(input)) {
      input.forEach(parseValue);
      return;
    }

    if (typeof input === 'object') {
      addPart(input.full_name || input.name || input.customer_name || input.farmer_name);
      const phone = input.phone || input.mobile || input.mobile_number || input.phone_number;
      if (phone) addPart(`Phone: ${phone}`);
      addPart(input.address_line || input.address || input.street || input.location);

      const cityLine = [input.city, input.district].filter(Boolean).join(', ');
      addPart(cityLine);

      const stateLine = [input.state, input.pincode || input.zipcode || input.zip].filter(Boolean).join(' - ');
      addPart(stateLine);

      if (input.zone) addPart(`Zone: ${input.zone}`);

      if (parts.length === 0) {
        Object.values(input).forEach((v) => {
          if (typeof v === 'string' || typeof v === 'number') addPart(v);
        });
      }
    }
  };

  parseValue(value);
  return parts.join(', ');
};

const getProductImage = (order) => {
  const item = order?.items?.[0] || order?.order_items?.[0] || order?.product;
  const product = item?.product || item;
  if (!product) return null;

  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i?.is_primary) || imgs[0];
    const url = typeof primary === 'string' ? primary : primary?.image_url || primary?.url;
    return url ? optimizeImageUrl(url, { width: 96, height: 96 }) : null;
  }

  const fallback = product.image_url || product.image || order?.product_image;
  return fallback ? optimizeImageUrl(fallback, { width: 96, height: 96 }) : null;
};

const OrderStatus = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const navigateToOrderDetail = useCallback((orderId, order) => {
    const parentNav = navigation.getParent?.();
    if (parentNav?.navigate) {
      parentNav.navigate('OrderDetail', { orderId, order });
      return;
    }
    navigation.navigate('OrderDetail', { orderId, order });
  }, [navigation]);

  const [sourceOrders, setSourceOrders] = useState([]);
  const [destinationOrders, setDestinationOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [updatingId, setUpdatingId] = useState(null);

  const orders = activeTab === 0 ? sourceOrders : destinationOrders;

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/orders/transporter/allocated');
      const allOrders = res.data?.data || res.data?.orders || res.data || [];
      const all = Array.isArray(allOrders) ? allOrders : [];

      setSourceOrders(
        all.filter(
          (o) =>
            o.transporter_role === 'PICKUP_SHIPPING' &&
            o.current_status !== 'COMPLETED' &&
            o.current_status !== 'CANCELLED'
        )
      );
      setDestinationOrders(
        all.filter(
          (o) =>
            o.transporter_role === 'DELIVERY' &&
            o.current_status !== 'COMPLETED' &&
            o.current_status !== 'CANCELLED'
        )
      );
    } catch (e) {
      console.error('OrderStatus fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useAutoRefresh(fetchOrders, 10000);


  /* ── Status update ──────────────────────────────────────── */
  const handleStatusUpdate = (order, newStatus) => {
    const orderId = order.order_id || order.id;
    Alert.alert(
      'Update Status',
      `Change order #${orderId} status to "${newStatus.replace(/_/g, ' ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setUpdatingId(orderId);
            try {
              await updateTransporterOrderStatus(orderId, newStatus);
              Alert.alert('Success', 'Order status updated');
              fetchOrders(true);
            } catch (e) {
              Alert.alert('Error', e.message || 'Failed to update status');
            } finally {
              setUpdatingId(null);
            }
          },
        },
      ]
    );
  };

  /* ── Assign ─────────────────────────────────────────────── */
  const handleAssign = async (order) => {
    try {
      const res = await api.get('/transporters/delivery-persons');
      const persons = res.data?.data || res.data?.delivery_persons || res.data || [];
      const available = (Array.isArray(persons) ? persons : []).filter(
        (p) => p.is_available !== false && p.availability !== false
      );

      if (available.length === 0) {
        Alert.alert('No Available Persons', 'No delivery persons available.');
        return;
      }

      const options = available.map((p) => ({
        text: `${p.full_name || p.name || 'Person'}${p.mobile_number || p.phone ? ` (${p.mobile_number || p.phone})` : ''}`,
        onPress: async () => {
          const orderId = order.order_id || order.id;
          setUpdatingId(orderId);
          try {
            await assignTransporterDeliveryPerson(orderId, p.id || p.delivery_person_id, 'delivery');
            Alert.alert('Success', `Assigned ${p.full_name || p.name}`);
            fetchOrders(true);
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to assign');
          } finally {
            setUpdatingId(null);
          }
        },
      }));

      options.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Assign Delivery Person', 'Choose:', options);
    } catch (e) {
      Alert.alert('Error', e.message || 'Unable to load delivery persons');
    }
  };

  /* ── Render order card ──────────────────────────────────── */
  const renderOrder = (order) => {
    const orderId = order.order_id || order.id;
    const status = (order.current_status || order.status || 'PENDING').toUpperCase();
    const product = order.items?.[0]?.product || order.product || {};
    const productName = product.name || order.product_name || `Order #${orderId}`;
    const productImage = getProductImage(order);
    const isUpdating = updatingId === orderId;
    const role = order.transporter_role;
    const pickupAddressText = getAddressText(order.pickup_address || order.farmer?.address) || order.farmer_name || 'Farmer';
    const deliveryAddressText = getAddressText(order.delivery_address || order.customer?.address) || order.customer_name || 'Customer';
    const hasAssignedDeliveryPerson = !!(
      order.delivery_person_id ||
      order.assigned_delivery_person_id ||
      order.delivery_person?.id ||
      order.delivery_person?.delivery_person_id
    );

    return (
      <TouchableOpacity
        key={orderId}
        style={styles.orderCard}
        onPress={() => navigateToOrderDetail(orderId, order)}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.orderHeader}>
          <View style={styles.productHeaderWrap}>
            {productImage ? (
              <Image source={{ uri: productImage }} style={styles.productThumb} />
            ) : (
              <View style={styles.productThumbPlaceholder}>
                <Ionicons name="cube-outline" size={18} color="#9aa19a" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.productTitle} numberOfLines={2}>{productName}</Text>
              {order.created_at ? <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text> : null}
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Addresses */}
        <View style={styles.detailRow}>
          <Ionicons name="location" size={15} color="#4CAF50" />
          <Text style={styles.detailText} numberOfLines={1}>
            Pickup: {pickupAddressText}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location" size={15} color="#F44336" />
          <Text style={styles.detailText} numberOfLines={1}>
            Delivery: {deliveryAddressText}
          </Text>
        </View>

        {/* Delivery person info */}
        {hasAssignedDeliveryPerson && order.delivery_person && (
          <View style={styles.dpRow}>
            <Ionicons name="person" size={14} color="#1B5E20" />
            <Text style={styles.dpText}>
              {order.delivery_person?.name || order.delivery_person?.full_name || 'Assigned'}
            </Text>
          </View>
        )}

        {/* Action buttons based on role */}
        <View style={styles.actionRow}>
          {role === 'DELIVERY' && status === 'SHIPPED' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FF5722' }]}
              onPress={() => handleAssign(order)}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="person-add-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Assign</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {['ASSIGNED', 'CONFIRMED', 'PLACED', 'PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS', 'PICKED_UP'].includes(status) && role === 'PICKUP_SHIPPING' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FF9800' }]}
              onPress={() => handleStatusUpdate(order, 'RECEIVED')}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="cube-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Pack Order</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'RECEIVED' && role === 'PICKUP_SHIPPING' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eef2ee', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, gap: 6 }}>
              <Ionicons name="qr-code-outline" size={16} color="#1B5E20" />
              <Text style={{ color: '#1B5E20', fontSize: 12, fontWeight: '600' }}>Use QR Scan to Ship</Text>
            </View>
          )}

          {status === 'REACHED_DESTINATION' && role === 'DELIVERY' && !hasAssignedDeliveryPerson && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#00BCD4' }]}
              onPress={() => handleStatusUpdate(order, 'OUT_FOR_DELIVERY')}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="bicycle-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Out for Delivery</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: '#1B5E20' }]}
            onPress={() => navigation.navigate('OrderTracking', { orderId, order })}
          >
            <Ionicons name="navigate-outline" size={14} color="#fff" />
            <Text style={styles.actionBtnText}>Track</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  /* ── Main render ────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Order Status</Text>
            <Text style={styles.headerSub}>{orders.length} active orders</Text>
          </View>
          <TouchableOpacity
            style={styles.qrBtn}
            onPress={() => navigation.navigate('QRScan')}
          >
            <Ionicons name="qr-code-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((tab, idx) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === idx && styles.tabActive]}
            onPress={() => setActiveTab(idx)}
          >
            <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>{tab}</Text>
            <View style={[styles.tabBadge, { backgroundColor: activeTab === idx ? '#1B5E20' : '#ccc' }]}>
              <Text style={styles.tabBadgeText}>
                {idx === 0 ? sourceOrders.length : destinationOrders.length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrders(true); }} colors={['#1B5E20']} />}
          showsVerticalScrollIndicator={false}
        >
          {orders.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="truck-outline" size={50} color="#ccc" />
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptyText}>
                {activeTab === 0 ? 'No active pickup orders' : 'No active delivery orders'}
              </Text>
            </View>
          ) : (
            orders.map(renderOrder)
          )}
        </ScrollView>
      )}
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },
  qrBtn: { padding: 8, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10 },

  tabRow: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 6 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: '#1B5E20' },
  tabText: { fontSize: 13, fontWeight: '600', color: '#888' },
  tabTextActive: { color: '#1B5E20', fontWeight: '800' },
  tabBadge: { backgroundColor: '#ccc', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tabBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 8 },
  productHeaderWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  productThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#eef2ee' },
  productThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 10, backgroundColor: '#eef2ee',
    alignItems: 'center', justifyContent: 'center',
  },
  productTitle: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },
  orderDate: { fontSize: 11, color: '#999', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700' },

  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  detailText: { fontSize: 13, color: '#555', flex: 1 },

  dpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 4 },
  dpText: { fontSize: 12, color: '#1B5E20', fontWeight: '600' },

  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10,
  },
  actionBtnText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  emptyCard: { alignItems: 'center', padding: 40, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },
});

export default OrderStatus;
