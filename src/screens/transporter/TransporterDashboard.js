/**
 * TransporterDashboard.js
 * Dashboard with stats, active orders, delivery persons, quick actions.
 *
 * Features:
 *   - Stats: active orders, delivery persons, completed today
 *   - GET /api/transporters/orders/active for active orders
 *   - GET /api/transporters/delivery-persons for delivery person list
 *   - Delivery person cards: name, phone, availability, assigned orders
 *   - Order cards with assign button
 *   - PUT /api/transporters/orders/{id}/assign
 *   - Quick actions: QR Scan, Order History, Vehicles, Add Delivery Person
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
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { assignTransporterDeliveryPerson } from '../../services/orderService';
import { useAuth } from '../../context/AuthContext';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ── Helpers ──────────────────────────────────────────────── */
const getStatusColor = (status) => {
  const s = (status || '').toUpperCase();
  if (s === 'DELIVERED' || s === 'COMPLETED') return '#4CAF50';
  if (s === 'SHIPPED') return '#3F51B5';
  if (s === 'OUT_FOR_DELIVERY') return '#00BCD4';
  if (s === 'ASSIGNED') return '#9C27B0';
  if (s === 'CONFIRMED') return '#2196F3';
  if (s === 'CANCELLED') return '#F44336';
  return '#FF9800';
};

/* ── Component ────────────────────────────────────────────── */
const TransporterDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeOrders, setActiveOrders] = useState([]);
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [completedToday, setCompletedToday] = useState(0);
  const [assigningOrderId, setAssigningOrderId] = useState(null);
  const toastRef = React.useRef(null);

  /* ── Fetch data ─────────────────────────────────────────── */
  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [ordersRes, personsRes] = await Promise.all([
        api.get('/transporters/orders/active').catch(() => ({ data: { data: [] } })),
        api.get('/transporters/delivery-persons').catch(() => ({ data: { data: [] } })),
      ]);

      const orders = ordersRes.data?.data || ordersRes.data?.orders || ordersRes.data || [];
      setActiveOrders(Array.isArray(orders) ? orders : []);

      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      setDeliveryPersons(Array.isArray(persons) ? persons : []);

      // Count completed today
      const today = new Date().toDateString();
      const completed = (Array.isArray(orders) ? orders : []).filter(
        (o) =>
          (o.status || o.current_status || '').toUpperCase() === 'DELIVERED' &&
          o.updated_at &&
          new Date(o.updated_at).toDateString() === today
      ).length;
      setCompletedToday(completed);
    } catch (e) {
      console.error('Dashboard fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchDashboard(true));
    return unsub;
  }, [navigation, fetchDashboard]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard(true);
  };

  /* ── Assign delivery person ─────────────────────────────── */
  const handleAssign = (order) => {
    const available = deliveryPersons.filter(
      (p) => p.is_available !== false && p.availability !== false
    );
    if (available.length === 0) {
      Alert.alert('No Available Persons', 'No delivery persons available. Please add one first.');
      return;
    }

    const options = available.map((p) => ({
      text: `${p.full_name || p.name} (${p.assigned_orders || 0} orders)`,
      onPress: () => assignPerson(order, p),
    }));
    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert('Assign Delivery Person', 'Select a delivery person:', options);
  };

  const assignPerson = async (order, person) => {
    const orderId = order.order_id || order.id;
    setAssigningOrderId(orderId);
    try {
      const status = (order.current_status || order.status || '').toUpperCase();
      const assignmentType = status === 'ASSIGNED' ? 'pickup' : 'delivery';
      await assignTransporterDeliveryPerson(
        orderId,
        person.id || person.delivery_person_id,
        assignmentType
      );
      toastRef.current?.show(`Assigned ${person.full_name || person.name} successfully!`, 'success');
      fetchDashboard(true);
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to assign delivery person', 'error');
    } finally {
      setAssigningOrderId(null);
    }
  };

  /* ── Stats data ─────────────────────────────────────────── */
  const stats = [
    { label: 'Active Orders', value: activeOrders.length, icon: 'cube-outline', color: '#FF9800' },
    { label: 'Delivery Persons', value: deliveryPersons.length, icon: 'people-outline', color: '#2196F3' },
    { label: 'Completed Today', value: completedToday, icon: 'checkmark-circle-outline', color: '#4CAF50' },
  ];

  /* ── Quick actions ──────────────────────────────────────── */
  const quickActions = [
    { label: 'QR Scan', icon: 'qr-code-outline', screen: 'QRScan', color: '#9C27B0' },
    { label: 'Order History', icon: 'time-outline', screen: 'History', tab: true, color: '#FF5722' },
    { label: 'Vehicles', icon: 'car-outline', screen: 'Vehicles', tab: true, color: '#00BCD4' },
    { label: 'Add Person', icon: 'person-add-outline', screen: 'AddDeliveryPerson', color: '#1B5E20' },
  ];

  /* ── Render ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <View style={styles.headerBlob1} />
        <View style={styles.headerBlob2} />
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Welcome back,</Text>
            <Text style={styles.userName} numberOfLines={1}>
              {authState?.user?.full_name || authState?.user?.name || 'Transporter'}
            </Text>
          </View>
          <TouchableOpacity style={styles.profileBtn} onPress={() => navigation.navigate('Profile')}>
            <Ionicons name="person-circle-outline" size={36} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          {stats.map((s, i) => (
            <View key={i} style={styles.statCard}>
              <View style={[styles.statIconWrap, { backgroundColor: s.color + '20' }]}>
                <Ionicons name={s.icon} size={22} color={s.color} />
              </View>
              <Text style={styles.statValue}>{s.value}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          {quickActions.map((a, i) => (
            <TouchableOpacity
              key={i}
              style={styles.actionCard}
              onPress={() => navigation.navigate(a.screen)}
            >
              <View style={[styles.actionIconWrap, { backgroundColor: a.color + '15' }]}>
                <Ionicons name={a.icon} size={24} color={a.color} />
              </View>
              <Text style={styles.actionLabel}>{a.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Delivery Persons */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Delivery Persons ({deliveryPersons.length})</Text>
          <TouchableOpacity onPress={() => navigation.navigate('AddDeliveryPerson')}>
            <Ionicons name="add-circle" size={24} color="#1B5E20" />
          </TouchableOpacity>
        </View>
        {deliveryPersons.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No delivery persons yet</Text>
            <TouchableOpacity style={styles.addPersonBtn} onPress={() => navigation.navigate('AddDeliveryPerson')}>
              <Text style={styles.addPersonBtnText}>+ Add Delivery Person</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dpScroll}>
            {deliveryPersons.map((dp, i) => {
              const available = dp.is_available !== false && dp.availability !== false;
              return (
                <View key={dp.id || i} style={styles.dpCard}>
                  <View style={styles.dpAvatarWrap}>
                    {dp.profile_image ? (
                      <Image source={{ uri: dp.profile_image }} style={styles.dpAvatar} />
                    ) : (
                      <View style={[styles.dpAvatar, styles.dpAvatarPlaceholder]}>
                        <Ionicons name="person" size={24} color="#fff" />
                      </View>
                    )}
                    <View style={[styles.dpStatusDot, { backgroundColor: available ? '#4CAF50' : '#F44336' }]} />
                  </View>
                  <Text style={styles.dpName} numberOfLines={1}>{dp.full_name || dp.name || 'N/A'}</Text>
                  <Text style={styles.dpPhone}>{dp.phone || dp.mobile || 'N/A'}</Text>
                  <Text style={[styles.dpAvailTag, { color: available ? '#4CAF50' : '#F44336' }]}>
                    {available ? 'Available' : 'Unavailable'}
                  </Text>
                  <Text style={styles.dpOrders}>{dp.assigned_orders || 0} orders assigned</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Active Orders */}
        <Text style={styles.sectionTitle}>Active Orders ({activeOrders.length})</Text>
        {activeOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="truck-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No active orders</Text>
          </View>
        ) : (
          activeOrders.map((order, i) => {
            const orderId = order.order_id || order.id;
            const status = (order.current_status || order.status || 'PENDING').toUpperCase();
            const product = order.items?.[0]?.product || order.product || {};
            const isAssigning = assigningOrderId === orderId;
            const hasDP = !!(order.delivery_person || order.delivery_person_id);

            return (
              <TouchableOpacity
                key={orderId || i}
                style={styles.orderCard}
                onPress={() => navigation.navigate('OrderDetail', { orderId, order })}
                activeOpacity={0.7}
              >
                <View style={styles.orderHeader}>
                  <Text style={styles.orderId}>Order #{orderId}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                      {status.replace(/_/g, ' ')}
                    </Text>
                  </View>
                </View>

                {product.name && (
                  <View style={styles.productRow}>
                    <Ionicons name="cube-outline" size={14} color="#666" />
                    <Text style={styles.productText} numberOfLines={1}>{product.name}</Text>
                  </View>
                )}

                <View style={styles.orderAddresses}>
                  <View style={styles.addressRow}>
                    <Ionicons name="location" size={14} color="#4CAF50" />
                    <Text style={styles.addressText} numberOfLines={1}>
                      From: {order.farmer_name || order.farmer?.full_name || order.farmer?.name || 'Farmer'}
                    </Text>
                  </View>
                  <View style={styles.addressRow}>
                    <Ionicons name="location" size={14} color="#F44336" />
                    <Text style={styles.addressText} numberOfLines={1}>
                      To: {order.customer_name || order.customer?.full_name || order.customer?.name || 'Customer'}
                    </Text>
                  </View>
                </View>

                {!hasDP ? (
                  <TouchableOpacity
                    style={styles.assignBtn}
                    onPress={() => handleAssign(order)}
                    disabled={isAssigning}
                  >
                    {isAssigning ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Ionicons name="person-add-outline" size={16} color="#fff" />
                        <Text style={styles.assignBtnText}>Assign Delivery Person</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View style={styles.assignedRow}>
                    <Ionicons name="checkmark-circle" size={16} color="#1B5E20" />
                    <Text style={styles.assignedText}>
                      {order.delivery_person?.full_name || order.delivery_person?.name || 'Delivery person assigned'}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F4F8F4' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, overflow: 'hidden' },
  headerBlob1: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: 'rgba(255,255,255,0.08)', top: -80, right: -40 },
  headerBlob2: { position: 'absolute', width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(0,0,0,0.07)', bottom: -10, left: -20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { color: 'rgba(255,255,255,0.72)', fontSize: 14, fontWeight: '500' },
  userName: { color: '#fff', fontSize: 22, fontWeight: '800', marginTop: 2, letterSpacing: 0.2 },
  profileBtn: { padding: 4 },

  body: { flex: 1, paddingHorizontal: 16 },

  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 8 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 14, marginHorizontal: 4,
    alignItems: 'center', elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09, shadowRadius: 6,
  },
  statIconWrap: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  statValue: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2, textAlign: 'center', fontWeight: '500' },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 10 },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginTop: 20, marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#4CAF50', paddingLeft: 10 },

  actionsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  actionCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 14, marginHorizontal: 4,
    alignItems: 'center', elevation: 3, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 5,
  },
  actionIconWrap: { width: 46, height: 46, borderRadius: 23, justifyContent: 'center', alignItems: 'center', marginBottom: 8 },
  actionLabel: { fontSize: 11, color: '#333', fontWeight: '700', textAlign: 'center' },

  emptyCard: {
    backgroundColor: '#fff', borderRadius: 18, padding: 30, alignItems: 'center',
    elevation: 3, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6,
  },
  emptyText: { color: '#888', fontSize: 14, marginTop: 8, fontWeight: '500' },
  addPersonBtn: { marginTop: 14, backgroundColor: '#1B5E20', paddingHorizontal: 22, paddingVertical: 11, borderRadius: 22 },
  addPersonBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },

  dpScroll: { marginBottom: 4 },
  dpCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginRight: 12, width: 140,
    alignItems: 'center', elevation: 3, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 5,
  },
  dpAvatarWrap: { position: 'relative', marginBottom: 8 },
  dpAvatar: { width: 50, height: 50, borderRadius: 25 },
  dpAvatarPlaceholder: { backgroundColor: '#1B5E20', justifyContent: 'center', alignItems: 'center' },
  dpStatusDot: { position: 'absolute', bottom: 0, right: 0, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff' },
  dpName: { fontSize: 13, fontWeight: '700', color: '#1A1A1A', textAlign: 'center' },
  dpPhone: { fontSize: 11, color: '#888', marginTop: 2 },
  dpAvailTag: { fontSize: 11, fontWeight: '700', marginTop: 4 },
  dpOrders: { fontSize: 11, color: '#666', marginTop: 2 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 7,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  productText: { fontSize: 13, color: '#555', flex: 1 },
  orderAddresses: { marginBottom: 10 },
  addressRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  addressText: { fontSize: 12, color: '#666', marginLeft: 6, flex: 1 },
  assignBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 11,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 4, elevation: 4,
  },
  assignBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  assignedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 6 },
  assignedText: { color: '#1B5E20', fontSize: 13, fontWeight: '800' },
});

export default TransporterDashboard;
