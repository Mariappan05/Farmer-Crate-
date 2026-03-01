/**
 * OrderDetail.js
 * Full order details with status timeline, assignment, and actions.
 *
 * Features:
 *   - Receives params: { orderId, order? }
 *   - Full order details: products, farmer info, customer info, delivery person info
 *   - Status timeline
 *   - Assign delivery person dropdown (if not assigned)
 *   - Status update buttons
 *   - QR code display
 *   - Call/contact buttons
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
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { getOrderById } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';

/* ── Constants ────────────────────────────────────────────── */
const TIMELINE_STAGES = [
  { key: 'PLACED', label: 'Order Placed', icon: 'cart', color: '#FF9800' },
  { key: 'CONFIRMED', label: 'Confirmed', icon: 'checkmark-circle', color: '#2196F3' },
  { key: 'ASSIGNED', label: 'Assigned', icon: 'people', color: '#9C27B0' },
  { key: 'SHIPPED', label: 'Shipped', icon: 'airplane', color: '#3F51B5' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: 'bicycle', color: '#00BCD4' },
  { key: 'DELIVERED', label: 'Delivered', icon: 'checkmark-done-circle', color: '#4CAF50' },
];

const STATUS_INDEX = {
  PENDING: 0, PLACED: 0, CONFIRMED: 1, ASSIGNED: 2, PROCESSING: 2,
  SHIPPED: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, COMPLETED: 5, CANCELLED: -1,
};

const getStatusColor = (s) => {
  const u = (s || '').toUpperCase();
  if (u === 'DELIVERED' || u === 'COMPLETED') return '#4CAF50';
  if (u === 'SHIPPED') return '#3F51B5';
  if (u === 'OUT_FOR_DELIVERY') return '#00BCD4';
  if (u === 'ASSIGNED') return '#9C27B0';
  if (u === 'CONFIRMED') return '#2196F3';
  if (u === 'CANCELLED') return '#F44336';
  return '#FF9800';
};

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

/* ── Component ────────────────────────────────────────────── */
const OrderDetail = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId: paramOrderId, order: initialOrder } = route.params || {};

  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [assigningDP, setAssigningDP] = useState(false);
  const [deliveryPersons, setDeliveryPersons] = useState([]);

  const orderId = paramOrderId || order?.order_id || order?.id;
  const status = (order?.current_status || order?.status || 'PENDING').toUpperCase();
  const stageIdx = STATUS_INDEX[status] ?? 0;
  const isCancelled = status === 'CANCELLED';

  /* ── Fetch ──────────────────────────────────────────────── */
  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [orderRes, personsRes] = await Promise.all([
        orderId ? getOrderById(orderId) : Promise.resolve(null),
        api.get('/transporters/delivery-persons').catch(() => ({ data: { data: [] } })),
      ]);
      if (orderRes) {
        const o = orderRes?.data || orderRes?.order || orderRes;
        if (o) setOrder(o);
      }
      const persons = personsRes.data?.data || personsRes.data?.delivery_persons || personsRes.data || [];
      setDeliveryPersons(Array.isArray(persons) ? persons : []);
    } catch (e) {
      if (!order) Alert.alert('Error', e.message || 'Failed to fetch order details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  /* ── Status update ──────────────────────────────────────── */
  const handleStatusUpdate = (newStatus) => {
    Alert.alert('Update Status', `Change to "${newStatus.replace(/_/g, ' ')}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm',
        onPress: async () => {
          setUpdatingStatus(true);
          try {
            await api.put(`/transporters/orders/${orderId}/status`, { status: newStatus });
            Alert.alert('Success', 'Status updated');
            fetchOrder(true);
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to update');
          } finally {
            setUpdatingStatus(false);
          }
        },
      },
    ]);
  };

  /* ── Assign ─────────────────────────────────────────────── */
  const handleAssign = () => {
    const available = deliveryPersons.filter((p) => p.is_available !== false);
    if (available.length === 0) {
      Alert.alert('No Available Persons', 'Add delivery persons first.');
      return;
    }
    const options = available.map((p) => ({
      text: p.full_name || p.name || 'Person',
      onPress: async () => {
        setAssigningDP(true);
        try {
          await api.put(`/transporters/orders/${orderId}/assign`, {
            delivery_person_id: p.id || p.delivery_person_id,
          });
          Alert.alert('Success', `Assigned ${p.full_name || p.name}`);
          fetchOrder(true);
        } catch (e) {
          Alert.alert('Error', e.message);
        } finally {
          setAssigningDP(false);
        }
      },
    }));
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Assign Delivery Person', 'Choose:', options);
  };

  /* ── Product image ──────────────────────────────────────── */
  const getProductImage = (item) => {
    const p = item?.product || item;
    if (!p) return null;
    const imgs = p.images;
    if (Array.isArray(imgs) && imgs.length > 0) {
      const primary = imgs.find((i) => i?.is_primary) || imgs[0];
      const url = typeof primary === 'string' ? primary : primary?.image_url || primary?.url;
      return url ? optimizeImageUrl(url, { width: 200 }) : null;
    }
    return p.image_url || p.image || null;
  };

  /* ── Render ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <ActivityIndicator size="large" color="#1B5E20" />
        <Text style={styles.loadingText}>Loading order details...</Text>
      </View>
    );
  }

  if (!order) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <Ionicons name="alert-circle-outline" size={50} color="#ccc" />
        <Text style={styles.loadingText}>Order not found</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.retryBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const items = order.items || order.order_items || (order.product ? [{ product: order.product, quantity: order.quantity || 1 }] : []);
  const farmer = order.farmer || {};
  const customer = order.customer || {};
  const dp = order.delivery_person || order.deliveryPerson || {};
  const hasDP = !!(dp?.id || dp?.full_name || order.delivery_person_id);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Order #{orderId}</Text>
          <Text style={styles.headerSub}>{formatDate(order.created_at)}</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: getStatusColor(status) + '30' }]}>
          <Text style={[styles.headerBadgeText, { color: '#fff' }]}>
            {status.replace(/_/g, ' ')}
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchOrder(true); }} colors={['#1B5E20']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Timeline</Text>
          {isCancelled ? (
            <View style={styles.cancelledRow}>
              <Ionicons name="close-circle" size={22} color="#F44336" />
              <Text style={styles.cancelledText}>Order Cancelled</Text>
            </View>
          ) : (
            TIMELINE_STAGES.map((stage, idx) => {
              const isCompleted = idx <= stageIdx;
              const isActive = idx === stageIdx;
              return (
                <View key={stage.key} style={styles.timelineRow}>
                  <View style={styles.timelineLeft}>
                    <View
                      style={[
                        styles.timelineDot,
                        isCompleted && { backgroundColor: stage.color },
                        isActive && { borderWidth: 3, borderColor: stage.color + '40' },
                      ]}
                    >
                      <Ionicons
                        name={isCompleted ? stage.icon : `${stage.icon}-outline`}
                        size={16}
                        color={isCompleted ? '#fff' : '#ccc'}
                      />
                    </View>
                    {idx < TIMELINE_STAGES.length - 1 && (
                      <View
                        style={[
                          styles.timelineConnector,
                          isCompleted && idx < stageIdx && { backgroundColor: stage.color },
                        ]}
                      />
                    )}
                  </View>
                  <View style={styles.timelineContent}>
                    <Text style={[styles.timelineLabel, isActive && { color: stage.color, fontWeight: '700' }]}>
                      {stage.label}
                    </Text>
                    <Text style={styles.timelineStatus}>
                      {isActive ? 'Current' : isCompleted ? 'Completed' : 'Pending'}
                    </Text>
                  </View>
                </View>
              );
            })
          )}
        </View>

        {/* Products */}
        {items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Products</Text>
            {items.map((item, idx) => {
              const product = item.product || item;
              const imgUrl = getProductImage(item);
              return (
                <View key={idx} style={styles.productRow}>
                  {imgUrl ? (
                    <Image source={{ uri: imgUrl }} style={styles.productImg} />
                  ) : (
                    <View style={[styles.productImg, styles.productImgPlaceholder]}>
                      <Ionicons name="cube-outline" size={20} color="#aaa" />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name || 'Product'}</Text>
                    <Text style={styles.productMeta}>
                      Qty: {item.quantity || 1}
                      {product.price ? ` • ${formatCurrency(product.price)}` : ''}
                    </Text>
                  </View>
                </View>
              );
            })}
            {order.total_amount && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalValue}>{formatCurrency(order.total_amount)}</Text>
              </View>
            )}
          </View>
        )}

        {/* Farmer Info */}
        <InfoCard
          title="Farmer"
          icon="leaf-outline"
          iconColor="#4CAF50"
          name={farmer.full_name || farmer.name || order.farmer_name || 'N/A'}
          phone={farmer.phone || farmer.mobile}
          address={farmer.address || farmer.address_line || order.pickup_address}
        />

        {/* Customer Info */}
        <InfoCard
          title="Customer"
          icon="person-outline"
          iconColor="#2196F3"
          name={customer.full_name || customer.name || order.customer_name || 'N/A'}
          phone={customer.phone || customer.mobile}
          address={customer.address || customer.address_line || order.delivery_address}
        />

        {/* Delivery Person Info */}
        {hasDP && (
          <InfoCard
            title="Delivery Person"
            icon="bicycle-outline"
            iconColor="#9C27B0"
            name={dp.full_name || dp.name || 'N/A'}
            phone={dp.phone || dp.mobile}
            extra={dp.vehicle_number ? `Vehicle: ${dp.vehicle_number}` : null}
          />
        )}

        {/* QR Code */}
        {(order.qr_code || order.qr_image_url) && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>QR Code</Text>
            {order.qr_image_url ? (
              <Image source={{ uri: order.qr_image_url }} style={styles.qrImage} resizeMode="contain" />
            ) : (
              <View style={styles.qrTextWrap}>
                <MaterialCommunityIcons name="qrcode" size={40} color="#1B5E20" />
                <Text style={styles.qrText}>{order.qr_code}</Text>
              </View>
            )}
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Actions</Text>
          <View style={styles.actionsWrap}>
            {!hasDP && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#9C27B0' }]}
                onPress={handleAssign}
                disabled={assigningDP}
              >
                {assigningDP ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="person-add-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Assign Delivery Person</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {status === 'ASSIGNED' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3F51B5' }]}
                onPress={() => handleStatusUpdate('SHIPPED')}
                disabled={updatingStatus}
              >
                {updatingStatus ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="airplane-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Mark as Shipped</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {status === 'SHIPPED' && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#00BCD4' }]}
                onPress={() => handleStatusUpdate('OUT_FOR_DELIVERY')}
                disabled={updatingStatus}
              >
                {updatingStatus ? <ActivityIndicator size="small" color="#fff" /> : (
                  <>
                    <Ionicons name="bicycle-outline" size={18} color="#fff" />
                    <Text style={styles.actionBtnText}>Out for Delivery</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#1B5E20' }]}
              onPress={() => navigation.navigate('TransporterOrderTracking', { orderId, order })}
            >
              <Ionicons name="navigate-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>Track Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FF9800' }]}
              onPress={() => navigation.navigate('BillPreview', { orderId, order })}
            >
              <Ionicons name="receipt-outline" size={18} color="#fff" />
              <Text style={styles.actionBtnText}>View Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

/* ── InfoCard Sub-component ───────────────────────────────── */
const InfoCard = ({ title, icon, iconColor, name, phone, address, extra }) => (
  <View style={styles.card}>
    <View style={styles.infoHeader}>
      <View style={[styles.infoIconWrap, { backgroundColor: (iconColor || '#1B5E20') + '15' }]}>
        <Ionicons name={icon} size={20} color={iconColor || '#1B5E20'} />
      </View>
      <Text style={styles.cardTitle}>{title}</Text>
    </View>
    <Text style={styles.infoName}>{name}</Text>
    {address ? <Text style={styles.infoDetail}>{address}</Text> : null}
    {extra ? <Text style={styles.infoDetail}>{extra}</Text> : null}
    {phone && (
      <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
        <Ionicons name="call-outline" size={16} color="#1B5E20" />
        <Text style={styles.callBtnText}>{phone}</Text>
      </TouchableOpacity>
    )}
  </View>
);

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  retryBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingTop: 12, paddingBottom: 16, gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 12, marginTop: 2 },
  headerBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  headerBadgeText: { fontSize: 11, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#1B5E20', marginBottom: 12 },

  cancelledRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: '#FFEBEE', borderRadius: 10 },
  cancelledText: { fontSize: 15, fontWeight: '600', color: '#F44336' },

  // Timeline
  timelineRow: { flexDirection: 'row', minHeight: 56 },
  timelineLeft: { alignItems: 'center', width: 40, marginRight: 12 },
  timelineDot: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#E0E0E0',
    justifyContent: 'center', alignItems: 'center',
  },
  timelineConnector: { width: 2, flex: 1, backgroundColor: '#E0E0E0', marginVertical: 2 },
  timelineContent: { flex: 1, paddingBottom: 16 },
  timelineLabel: { fontSize: 14, color: '#333' },
  timelineStatus: { fontSize: 11, color: '#999', marginTop: 2 },

  // Products
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  productImg: { width: 56, height: 56, borderRadius: 10 },
  productImgPlaceholder: { backgroundColor: '#F0F0F0', justifyContent: 'center', alignItems: 'center' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#EEE', paddingTop: 12, marginTop: 4 },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  totalValue: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },

  // Info
  infoHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  infoIconWrap: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  infoName: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 4 },
  infoDetail: { fontSize: 13, color: '#666', marginBottom: 2 },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#E8F5E9', borderRadius: 10, alignSelf: 'flex-start' },
  callBtnText: { color: '#1B5E20', fontSize: 13, fontWeight: '600' },

  // QR
  qrImage: { width: 180, height: 180, alignSelf: 'center', marginVertical: 8 },
  qrTextWrap: { alignItems: 'center', gap: 8, padding: 16 },
  qrText: { fontSize: 14, color: '#333', fontFamily: 'monospace' },

  // Actions
  actionsWrap: { gap: 10 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 12,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});

export default OrderDetail;
