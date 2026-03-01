/**
 * OrderStatus.js
 * Active orders list with status filtering and status update actions.
 *
 * Features:
 *   - GET /api/transporters/orders/active
 *   - Filter by status: All, Assigned, Shipped, In Transit
 *   - Status update buttons (ASSIGNED→SHIPPED, SHIPPED→OUT_FOR_DELIVERY)
 *   - Assign delivery person if not assigned
 *   - Order tap → OrderDetail
 *   - Pull to refresh
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';

const FILTERS = ['All', 'Assigned', 'Shipped', 'In Transit'];

const getStatusColor = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'COMPLETED') return '#4CAF50';
  if (s === 'SHIPPED') return '#3F51B5';
  if (s === 'OUT_FOR_DELIVERY' || s === 'IN_TRANSIT') return '#00BCD4';
  if (s === 'ASSIGNED') return '#9C27B0';
  if (s === 'CONFIRMED') return '#2196F3';
  if (s === 'CANCELLED') return '#F44336';
  return '#FF9800';
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const OrderStatus = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [updatingId, setUpdatingId] = useState(null);
  const [deliveryPersons, setDeliveryPersons] = useState([]);

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordersRes, personsRes] = await Promise.all([
        api.get('/transporters/orders/active'),
        api.get('/transporters/delivery-persons').catch(() => ({ data: { data: [] } })),
      ]);
      const data = ordersRes.data?.data || ordersRes.data?.orders || ordersRes.data || [];
      setOrders(Array.isArray(data) ? data : []);
      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      setDeliveryPersons(Array.isArray(persons) ? persons : []);
    } catch (e) {
      console.error('OrderStatus fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchOrders(true));
    return unsub;
  }, [navigation, fetchOrders]);

  /* ── Filter ─────────────────────────────────────────────── */
  const filteredOrders = orders.filter((o) => {
    if (activeFilter === 'All') return true;
    const st = (o.current_status || o.status || '').toUpperCase();
    if (activeFilter === 'Assigned') return st === 'ASSIGNED';
    if (activeFilter === 'Shipped') return st === 'SHIPPED';
    if (activeFilter === 'In Transit') return st === 'OUT_FOR_DELIVERY' || st === 'IN_TRANSIT';
    return true;
  });

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
              await api.put(`/transporters/orders/${orderId}/status`, { status: newStatus });
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
  const handleAssign = (order) => {
    const available = deliveryPersons.filter((p) => p.is_available !== false && p.availability !== false);
    if (available.length === 0) {
      Alert.alert('No Available Persons', 'No delivery persons available.');
      return;
    }
    const options = available.map((p) => ({
      text: p.full_name || p.name || 'Person',
      onPress: async () => {
        const orderId = order.order_id || order.id;
        setUpdatingId(orderId);
        try {
          await api.put(`/transporters/orders/${orderId}/assign`, {
            delivery_person_id: p.id || p.delivery_person_id,
          });
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
  };

  /* ── Render order card ──────────────────────────────────── */
  const renderOrder = (order) => {
    const orderId = order.order_id || order.id;
    const status = (order.current_status || order.status || 'PENDING').toUpperCase();
    const product = order.items?.[0]?.product || order.product || {};
    const isUpdating = updatingId === orderId;
    const hasDP = !!(order.delivery_person || order.delivery_person_id);

    return (
      <TouchableOpacity
        key={orderId}
        style={styles.orderCard}
        onPress={() => navigation.navigate('OrderDetail', { orderId, order })}
        activeOpacity={0.7}
      >
        {/* Header */}
        <View style={styles.orderHeader}>
          <View>
            <Text style={styles.orderId}>Order #{orderId}</Text>
            {order.created_at && <Text style={styles.orderDate}>{formatDate(order.created_at)}</Text>}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Product */}
        {product.name && (
          <View style={styles.detailRow}>
            <Ionicons name="cube-outline" size={15} color="#666" />
            <Text style={styles.detailText} numberOfLines={1}>{product.name}</Text>
          </View>
        )}

        {/* Addresses */}
        <View style={styles.detailRow}>
          <Ionicons name="location" size={15} color="#4CAF50" />
          <Text style={styles.detailText} numberOfLines={1}>
            Pickup: {order.pickup_address || order.farmer?.address || order.farmer_name || 'Farmer'}
          </Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="location" size={15} color="#F44336" />
          <Text style={styles.detailText} numberOfLines={1}>
            Delivery: {order.delivery_address || order.customer?.address || order.customer_name || 'Customer'}
          </Text>
        </View>

        {/* Delivery person info */}
        {hasDP && (
          <View style={styles.dpRow}>
            <Ionicons name="person" size={14} color="#1B5E20" />
            <Text style={styles.dpText}>
              {order.delivery_person?.full_name || order.delivery_person?.name || 'Assigned'}
            </Text>
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionRow}>
          {!hasDP && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#9C27B0' }]}
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

          {status === 'ASSIGNED' && (
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#3F51B5' }]}
              onPress={() => handleStatusUpdate(order, 'SHIPPED')}
              disabled={isUpdating}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="airplane-outline" size={14} color="#fff" />
                  <Text style={styles.actionBtnText}>Ship</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {status === 'SHIPPED' && (
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
            onPress={() => navigation.navigate('TransporterOrderTracking', { orderId, order })}
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
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.header}>
        <Text style={styles.headerTitle}>Order Status</Text>
        <Text style={styles.headerSub}>{filteredOrders.length} active orders</Text>
      </LinearGradient>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
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
          {filteredOrders.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="truck-outline" size={50} color="#ccc" />
              <Text style={styles.emptyTitle}>No Orders Found</Text>
              <Text style={styles.emptyText}>
                {activeFilter === 'All' ? 'No active orders at the moment' : `No ${activeFilter.toLowerCase()} orders`}
              </Text>
            </View>
          ) : (
            filteredOrders.map(renderOrder)
          )}
        </ScrollView>
      )}
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  filterRow: { backgroundColor: '#fff', elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 3 },
  filterScroll: { paddingHorizontal: 16, paddingVertical: 12 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#F0F0F0', marginRight: 8,
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
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
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#888', marginTop: 4, textAlign: 'center' },
});

export default OrderStatus;
