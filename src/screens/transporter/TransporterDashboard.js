/**
 * TransporterDashboard.js
 * Dashboard with stats, allocated orders (source/destination), delivery persons, quick actions.
 *
 * Features:
 *   - Stats: source orders, destination orders, delivery persons
 *   - GET /orders/transporter/allocated — split by transporter_role
 *   - Source orders: PICKUP_SHIPPING + status PLACED (need assignment)
 *   - Destination orders: DELIVERY + status RECEIVED (need assignment)
 *   - Assign dialog: vehicle (permanent/temporary) + delivery person
 *   - POST /transporters/assign-vehicle  — assign vehicle to order
 *   - POST /transporters/assign-order   — assign delivery person
 *   - Quick actions: QR Scan, Order History, Vehicles, Add Delivery Person
 *   - Pull to refresh
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
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
import { useAuth } from '../../context/AuthContext';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ── Helpers ──────────────────────────────────────────────── */
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

const getOrderProductName = (order) => {
  const firstItem = order?.items?.[0] || order?.order_items?.[0] || null;
  const firstProduct = firstItem?.product || order?.product || {};

  return (
    firstProduct?.name ||
    firstItem?.product_name ||
    firstItem?.name ||
    order?.product_name ||
    order?.productName ||
    'Product'
  );
};

/* ── Component ────────────────────────────────────────────── */
const TransporterDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sourceOrders, setSourceOrders] = useState([]);
  const [destinationOrders, setDestinationOrders] = useState([]);
  const [deliveryPersons, setDeliveryPersons] = useState([]);
  const [permanentVehicles, setPermanentVehicles] = useState([]);
  const [temporaryVehicles, setTemporaryVehicles] = useState([]);
  const [assignModal, setAssignModal] = useState({ visible: false, order: null, isSource: false });
  const [selectedVehicleId, setSelectedVehicleId] = useState(null);
  const [selectedVehicleType, setSelectedVehicleType] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const toastRef = React.useRef(null);

  /* ── Fetch data ─────────────────────────────────────────── */
  const fetchDashboard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [allocatedRes, personsRes, vehiclesRes] = await Promise.all([
        api.get('/orders/transporter/allocated').catch(() => ({ data: { data: [] } })),
        api.get('/transporters/delivery-persons').catch(() => ({ data: { data: [] } })),
        api.get('/vehicles').catch(() => ({ data: { data: {} } })),
      ]);

      const allOrders = allocatedRes.data?.data || [];
      const srcOrders = allOrders.filter(
        (o) => o.transporter_role === 'PICKUP_SHIPPING' && o.current_status === 'PLACED'
      );
      const destOrders = allOrders.filter(
        (o) => o.transporter_role === 'DELIVERY' && o.current_status === 'RECEIVED'
      );
      setSourceOrders(srcOrders);
      setDestinationOrders(destOrders);

      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      setDeliveryPersons(Array.isArray(persons) ? persons : []);

      const fleetData = vehiclesRes.data?.data || {};
      setPermanentVehicles(fleetData.permanent_vehicles || []);
      setTemporaryVehicles(fleetData.temporary_vehicles || []);
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

  /* ── Open assign dialog ─────────────────────────────────── */
  const openAssignModal = (order) => {
    const isSource = order.transporter_role === 'PICKUP_SHIPPING';
    setSelectedVehicleId(null);
    setSelectedVehicleType(null);
    setSelectedPersonId(null);
    setAssignModal({ visible: true, order, isSource });
  };

  const canConfirmAssign = () => {
    if (!assignModal.order) return false;
    if (assignModal.isSource) return selectedVehicleId !== null && selectedPersonId !== null;
    return selectedPersonId !== null;
  };

  const handleConfirmAssign = async () => {
    const order = assignModal.order;
    if (!order || !canConfirmAssign()) return;

    const orderId = order.order_id || order.id;
    setAssigningOrderId(orderId);
    try {
      await api.put(`/transporters/orders/${orderId}/assign`, {
        delivery_person_id: person.id || person.delivery_person_id,
      });
      toastRef.current?.show(`Assigned ${person.full_name || person.name} successfully!`, 'success');
      fetchDashboard(true);
    } catch (e) {
      toastRef.current?.show(e.message || 'Assignment failed', 'error');
    } finally {
      setAssigning(false);
    }
  };

  /* ── Stats data ─────────────────────────────────────────── */
  const stats = [
    { label: 'Pickup Orders', value: sourceOrders.length, icon: 'cube-outline', color: '#FF9800' },
    { label: 'Delivery Orders', value: destinationOrders.length, icon: 'bicycle-outline', color: '#2196F3' },
    { label: 'Delivery Persons', value: deliveryPersons.length, icon: 'people-outline', color: '#4CAF50' },
  ];

  /* ── Quick actions ──────────────────────────────────────── */
  const quickActions = [
    { label: 'QR Scan', icon: 'qr-code-outline', screen: 'QRScan', color: '#9C27B0' },
    { label: 'Order History', icon: 'time-outline', screen: 'History', color: '#FF5722' },
    { label: 'Vehicles', icon: 'car-outline', screen: 'Vehicles', color: '#00BCD4' },
    { label: 'Add Person', icon: 'person-add-outline', screen: 'AddDeliveryPerson', color: '#1B5E20' },
  ];

  /* ── Render order card ──────────────────────────────────── */
  const renderOrderCard = (order, i) => {
    const orderId = order.order_id || order.id;
    const status = (order.current_status || order.status || 'PENDING').toUpperCase();
    const product = order.items?.[0]?.product || order.product || {};
    const productName = getOrderProductName(order);

    return (
      <TouchableOpacity
        key={orderId || i}
        style={styles.orderCard}
        onPress={() => navigation.navigate('OrderDetail', { orderId, order })}
        activeOpacity={0.7}
      >
        <View style={styles.orderHeader}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={styles.orderTitle} numberOfLines={1}>{productName}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {product.name && product.name !== productName && (
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

        <TouchableOpacity
          style={styles.assignBtn}
          onPress={() => openAssignModal(order)}
        >
          <Ionicons name="person-add-outline" size={16} color="#fff" />
          <Text style={styles.assignBtnText}>
            {order.transporter_role === 'PICKUP_SHIPPING' ? 'Assign Vehicle & Person' : 'Assign Delivery Person'}
          </Text>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

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
                <View key={dp.delivery_person_id || dp.id || i} style={styles.dpCard}>
                  <View style={styles.dpAvatarWrap}>
                    {dp.image_url || dp.profile_image ? (
                      <Image source={{ uri: dp.image_url || dp.profile_image }} style={styles.dpAvatar} />
                    ) : (
                      <View style={[styles.dpAvatar, styles.dpAvatarPlaceholder]}>
                        <Ionicons name="person" size={24} color="#fff" />
                      </View>
                    )}
                    <View style={[styles.dpStatusDot, { backgroundColor: available ? '#4CAF50' : '#F44336' }]} />
                  </View>
                  <Text style={styles.dpName} numberOfLines={1}>
                    {dp.name || dp.full_name || 'N/A'}
                  </Text>
                  <Text style={styles.dpPhone}>{dp.mobile_number || dp.phone || 'N/A'}</Text>
                  <Text style={[styles.dpAvailTag, { color: available ? '#4CAF50' : '#F44336' }]}>
                    {available ? 'Available' : 'Unavailable'}
                  </Text>
                  <Text style={styles.dpVehicle}>{dp.vehicle_type || ''}</Text>
                </View>
              );
            })}
          </ScrollView>
        )}

        {/* Source Orders (Pickup & Shipping) */}
        <Text style={styles.sectionTitle}>
          Pickup Orders — Need Assignment ({sourceOrders.length})
        </Text>
        {sourceOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="truck-outline" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No new pickup orders</Text>
          </View>
        ) : (
          sourceOrders.map((order, i) => renderOrderCard(order, i))
        )}

        {/* Destination Orders (Delivery) */}
        <Text style={styles.sectionTitle}>
          Delivery Orders — Need Assignment ({destinationOrders.length})
        </Text>
        {destinationOrders.length === 0 ? (
          <View style={styles.emptyCard}>
            <MaterialCommunityIcons name="bicycle" size={40} color="#ccc" />
            <Text style={styles.emptyText}>No new delivery orders</Text>
          </View>
        ) : (
          destinationOrders.map((order, i) => renderOrderCard(order, i))
        )}
      </ScrollView>

      {/* Assign Modal */}
      <Modal
        visible={assignModal.visible}
        transparent
        animationType="slide"
        onRequestClose={() => setAssignModal({ visible: false, order: null, isSource: false })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {assignModal.isSource ? 'Assign Vehicle & Person' : 'Assign Delivery Person'}
              </Text>
              <TouchableOpacity onPress={() => setAssignModal({ visible: false, order: null, isSource: false })}>
                <Ionicons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              {/* Vehicle section — only for source / pickup orders */}
              {assignModal.isSource && (
                <>
                  <Text style={styles.modalSection}>Select Vehicle</Text>
                  {permanentVehicles.length > 0 && (
                    <>
                      <Text style={styles.modalSubSection}>Permanent Vehicles</Text>
                      {permanentVehicles.map((v) => (
                        <TouchableOpacity
                          key={v.vehicle_id}
                          style={[styles.selectCard, selectedVehicleId === v.vehicle_id && styles.selectCardActive]}
                          onPress={() => { setSelectedVehicleId(v.vehicle_id); setSelectedVehicleType('permanent'); }}
                        >
                          <MaterialCommunityIcons name="truck" size={24} color={selectedVehicleId === v.vehicle_id ? '#1B5E20' : '#888'} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.selectCardTitle}>{v.vehicle_number || 'N/A'}</Text>
                            <Text style={styles.selectCardSub}>{(v.vehicle_type || '').toUpperCase()} · {v.capacity || 0} tons</Text>
                          </View>
                          {selectedVehicleId === v.vehicle_id && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  {temporaryVehicles.length > 0 && (
                    <>
                      <Text style={styles.modalSubSection}>Temporary Vehicles</Text>
                      {temporaryVehicles.map((v) => (
                        <TouchableOpacity
                          key={v.vehicle_id}
                          style={[styles.selectCard, selectedVehicleId === v.vehicle_id && styles.selectCardActive]}
                          onPress={() => { setSelectedVehicleId(v.vehicle_id); setSelectedVehicleType('temporary'); }}
                        >
                          <MaterialCommunityIcons name="car" size={24} color={selectedVehicleId === v.vehicle_id ? '#1B5E20' : '#888'} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={styles.selectCardTitle}>{v.vehicle_number || 'N/A'}</Text>
                            <Text style={styles.selectCardSub}>{(v.vehicle_type || '').toUpperCase()} · {v.capacity || 0} tons</Text>
                          </View>
                          {selectedVehicleId === v.vehicle_id && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  {permanentVehicles.length === 0 && temporaryVehicles.length === 0 && (
                    <Text style={styles.emptyModalText}>No vehicles available. Add vehicles first.</Text>
                  )}
                  <View style={styles.divider} />
                </>
              )}

              {/* Delivery person */}
              <Text style={styles.modalSection}>Select Delivery Person</Text>
              {deliveryPersons.length > 0 ? (
                deliveryPersons.map((p) => (
                  <TouchableOpacity
                    key={p.delivery_person_id || p.id}
                    style={[styles.selectCard, selectedPersonId === (p.delivery_person_id || p.id) && styles.selectCardActive]}
                    onPress={() => setSelectedPersonId(p.delivery_person_id || p.id)}
                  >
                    <Ionicons name="person-circle-outline" size={28} color={selectedPersonId === (p.delivery_person_id || p.id) ? '#1B5E20' : '#888'} />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.selectCardTitle}>{p.name || p.full_name || 'N/A'}</Text>
                      <Text style={styles.selectCardSub}>{p.mobile_number || p.phone || ''} · {p.vehicle_type || ''}</Text>
                    </View>
                    {selectedPersonId === (p.delivery_person_id || p.id) && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
                  </TouchableOpacity>
                ))
              ) : (
                <Text style={styles.emptyModalText}>No delivery persons. Add one first.</Text>
              )}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setAssignModal({ visible: false, order: null, isSource: false })}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, !canConfirmAssign() && { opacity: 0.5 }]}
                onPress={handleConfirmAssign}
                disabled={!canConfirmAssign() || assigning}
              >
                {assigning ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Assign</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

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
    marginBottom: 12,
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
  dpVehicle: { fontSize: 11, color: '#666', marginTop: 2 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 4, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 7,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderTitle: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
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

  // Assign Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },
  modalSection: { fontSize: 15, fontWeight: '700', color: '#1B5E20', marginTop: 8, marginBottom: 8 },
  modalSubSection: { fontSize: 13, fontWeight: '600', color: '#666', marginBottom: 6 },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 12 },
  selectCard: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E0E0E0',
    borderRadius: 12, padding: 12, marginBottom: 8, backgroundColor: '#FAFAFA',
  },
  selectCardActive: { borderColor: '#1B5E20', backgroundColor: '#F1F8F1' },
  selectCardTitle: { fontSize: 14, fontWeight: '700', color: '#222' },
  selectCardSub: { fontSize: 12, color: '#888', marginTop: 2 },
  emptyModalText: { fontSize: 13, color: '#999', textAlign: 'center', paddingVertical: 12 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalCancelBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#F0F0F0' },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#666' },
  modalConfirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 14, borderRadius: 12, backgroundColor: '#1B5E20' },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});

export default TransporterDashboard;
