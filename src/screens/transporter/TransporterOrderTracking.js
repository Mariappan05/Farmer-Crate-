/**
 * TransporterOrderTracking.js
 * Full 9-step order tracking for transporter view.
 *
 * Steps:
 *  1. PENDING           - Customer ordered
 *  2. CONFIRMED         - Farmer accepted
 *  3. ASSIGNED          - Transporters assigned (source + destination)
 *  4. PICKUP_ASSIGNED   - Source transporter assigned pickup delivery person
 *  5. PICKED_UP         - Package received at source transporter office (QR by source)
 *  6. IN_TRANSIT        - Vehicle assigned, sent to destination (QR by source)
 *  7. REACHED_DESTINATION - Destination transporter received (QR by destination)
 *  8. OUT_FOR_DELIVERY  - Destination transporter assigned delivery person
 *  9. DELIVERED         - Customer received (QR by destination delivery person)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Image, RefreshControl, Animated, Easing,
  StatusBar, Platform, Linking, Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { getOrderById } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const TRACKING_STAGES = [
  { key: 'PENDING',              label: 'Order Placed',            icon: 'cart-outline',                  mc: null,                    color: '#FF9800' },
  { key: 'CONFIRMED',            label: 'Farmer Accepted',         icon: 'checkmark-circle-outline',      mc: null,                    color: '#2196F3' },
  { key: 'ASSIGNED',             label: 'Transporters Assigned',   icon: null,                            mc: 'truck-check-outline',   color: '#9C27B0' },
  { key: 'PICKUP_ASSIGNED',      label: 'Pickup Person Assigned',  icon: 'person-outline',                mc: null,                    color: '#FF5722' },
  { key: 'PICKUP_IN_PROGRESS',   label: 'Pickup In Progress',      icon: 'bicycle-outline',               mc: null,                    color: '#00BCD4' },
  { key: 'PICKED_UP',            label: 'Picked Up from Farmer',   icon: null,                            mc: 'store-check-outline',   color: '#00897B' },
  { key: 'RECEIVED',             label: 'Received at Source Office', icon: null,                           mc: 'package-check',         color: '#00897B' },
  { key: 'SHIPPED',              label: 'Shipped to Destination',  icon: null,                            mc: 'cube-send',             color: '#3F51B5' },
  { key: 'IN_TRANSIT',           label: 'In Transit to Dest.',     icon: null,                            mc: 'truck-fast-outline',    color: '#3F51B5' },
  { key: 'REACHED_DESTINATION',  label: 'Reached Destination',     icon: null,                            mc: 'warehouse',             color: '#673AB7' },
  { key: 'OUT_FOR_DELIVERY',     label: 'Out for Delivery',        icon: 'bicycle-outline',               mc: null,                    color: '#00BCD4' },
  { key: 'DELIVERED',            label: 'Delivered to Customer',   icon: 'checkmark-done-circle-outline', mc: null,                    color: '#4CAF50' },
];

const STATUS_INDEX = {
  PENDING: 0, PLACED: 0,
  CONFIRMED: 1, ACCEPTED: 1,
  ASSIGNED: 2,
  PICKUP_ASSIGNED: 3,
  PICKUP_IN_PROGRESS: 4,
  PICKED_UP: 5,
  RECEIVED: 6,
  SHIPPED: 7,
  IN_TRANSIT: 8,
  REACHED_DESTINATION: 9,
  OUT_FOR_DELIVERY: 10,
  DELIVERED: 11,
  COMPLETED: 11,
  CANCELLED: -1,
};

const getStageIndex = (status) =>
  STATUS_INDEX[(status || '').toUpperCase()] ?? 0;

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

const formatAddress = (rawAddress) => {
  if (!rawAddress) return null;

  let parsed = rawAddress;
  if (typeof rawAddress === 'string') {
    try {
      parsed = JSON.parse(rawAddress);
    } catch {
      parsed = rawAddress;
    }
  }

  if (typeof parsed === 'object' && parsed !== null) {
    return [
      parsed.address_line,
      parsed.city,
      parsed.district,
      parsed.state,
      parsed.pincode,
      parsed.zone,
    ].filter(Boolean).join(', ');
  }

  return String(parsed);
};

const getProductImage = (item) => {
  const p = item?.product || item;
  if (!p) return null;
  const imgs = p.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i?.is_primary) || imgs[0];
    return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
  }
  return p.image_url || p.image || null;
};

const normalizeOrdersArray = (payload) =>
  Array.isArray(payload) ? payload : payload?.orders || payload?.data || [];

const findOrderById = (orders, id) =>
  orders.find((o) =>
    (o?.order_id && String(o.order_id) === String(id)) ||
    (o?.id && String(o.id) === String(id))
  );

const withTransporterPlaceholders = (orderWithDetails) => {
  const result = { ...orderWithDetails };

  if (orderWithDetails?.source_transporter_id && !orderWithDetails?.source_transporter) {
    console.log('[TransporterOrderTracking] Creating source transporter placeholder for ID:', orderWithDetails.source_transporter_id);
    result.source_transporter = {
      transporter_id: orderWithDetails.source_transporter_id,
      name: 'Source Transporter',
      mobile_number: null,
      mobile: null,
      phone: null,
      email: null,
      address: null,
      note: 'Source transporter details unavailable on this endpoint',
    };
  }

  if (orderWithDetails?.destination_transporter_id && !orderWithDetails?.destination_transporter) {
    console.log('[TransporterOrderTracking] Creating destination transporter placeholder for ID:', orderWithDetails.destination_transporter_id);
    result.destination_transporter = {
      transporter_id: orderWithDetails.destination_transporter_id,
      name: 'Destination Transporter',
      mobile_number: null,
      mobile: null,
      phone: null,
      email: null,
      address: null,
      note: 'Destination transporter details unavailable on this endpoint',
    };
  }

  return result;
};

/* ── Animated Vehicle ─────────────────────────────────────── */
const AnimatedVehicle = ({ progress }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: progress, duration: 800,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -3, duration: 400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ])
    ).start();
  }, [progress]);

  return (
    <View style={s.vehicleTrack}>
      <View style={s.trackLine}>
        <Animated.View style={[s.trackFill, {
          width: slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
        }]} />
      </View>
      <Animated.View style={[s.vehicleIcon, {
        left: slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '90%'] }),
        transform: [{ translateY: bounceAnim }],
      }]}>
        <MaterialCommunityIcons name="truck-fast" size={28} color="#1B5E20" />
      </Animated.View>
    </View>
  );
};

/* ── Timeline Step ────────────────────────────────────────── */
const TimelineStep = ({ stage, index, currentIndex, isLast }) => {
  const isCompleted = index <= currentIndex;
  const isActive = index === currentIndex;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    }
  }, [isActive]);

  return (
    <View style={s.stepRow}>
      <View style={s.stepLeft}>
        <Animated.View style={[
          s.stepDot,
          isCompleted && { backgroundColor: stage.color },
          isActive && { transform: [{ scale: scaleAnim }], borderWidth: 3, borderColor: stage.color + '40' },
        ]}>
          {stage.mc
            ? <MaterialCommunityIcons name={stage.mc} size={16} color={isCompleted ? '#fff' : '#bbb'} />
            : <Ionicons name={isCompleted ? stage.icon.replace('-outline', '') : stage.icon} size={16} color={isCompleted ? '#fff' : '#bbb'} />
          }
        </Animated.View>
        {!isLast && (
          <View style={[s.connector, isCompleted && index < currentIndex && { backgroundColor: stage.color }]} />
        )}
      </View>
      <View style={[s.stepContent, isActive && s.stepContentActive]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.stepLabel, isActive && { color: stage.color, fontWeight: '700' }]}>
            {stage.label}
          </Text>
          {isActive && <Text style={[s.stepSub, { color: stage.color }]}>Current Status</Text>}
          {isCompleted && !isActive && <Text style={[s.stepSub, { color: '#4CAF50' }]}>Completed</Text>}
          {!isCompleted && !isActive && <Text style={[s.stepSub, { color: '#bbb' }]}>Upcoming</Text>}
        </View>
      </View>
    </View>
  );
};

/* ── Info Card ────────────────────────────────────────────── */
const InfoCard = ({ icon, mc, title, name, details, phone }) => (
  <View style={s.infoCard}>
    <View style={s.infoIconWrap}>
      {mc
        ? <MaterialCommunityIcons name={mc} size={22} color="#1B5E20" />
        : <Ionicons name={icon} size={22} color="#1B5E20" />
      }
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.infoTitle}>{title}</Text>
      <Text style={s.infoName}>{name || 'N/A'}</Text>
      {details ? <Text style={s.infoDetail}>{details}</Text> : null}
    </View>
    {phone && (
      <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:' + phone)}>
        <Ionicons name="call-outline" size={18} color="#1B5E20" />
      </TouchableOpacity>
    )}
  </View>
);

/* ── Main Component ───────────────────────────────────────── */
const TransporterOrderTracking = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef(null);

  const currentIndex = getStageIndex(order?.current_status || order?.status);
  const isCancelled = (order?.current_status || order?.status || '').toUpperCase() === 'CANCELLED';
  const progress = isCancelled ? 0 : Math.min(1, currentIndex / (TRACKING_STAGES.length - 1));

  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const id = orderId || order?.order_id || order?.id;
      if (!id) return;

      console.log('[TransporterOrderTracking] Fetching order:', id);
      let o = null;

      try {
        const res = await api.get(`/transporters/orders/${id}/track`);
        o = res.data?.data || res.data?.order || res.data;
        console.log('[TransporterOrderTracking] Got order from tracking endpoint:', JSON.stringify(o, null, 2));
      } catch (trackingError) {
        console.log('[TransporterOrderTracking] Tracking endpoint not available:', trackingError.message);
      }

      if (!o) {
        try {
          const activeResp = await api.get('/transporters/orders/active');
          const activeOrders = normalizeOrdersArray(activeResp?.data);
          o = findOrderById(activeOrders, id);
          if (o) {
            console.log('[TransporterOrderTracking] Found order from active orders endpoint:', id);
          }
        } catch (activeError) {
          console.log('[TransporterOrderTracking] Active orders fallback failed:', activeError.message);
        }
      }

      if (!o) {
        try {
          const allResp = await api.get('/transporters/orders');
          const allOrders = normalizeOrdersArray(allResp?.data);
          o = findOrderById(allOrders, id);
          if (o) {
            console.log('[TransporterOrderTracking] Found order from orders endpoint:', id);
          }
        } catch (ordersError) {
          console.log('[TransporterOrderTracking] Orders list fallback failed:', ordersError.message);
        }
      }

      if (!o) {
        try {
          const data = await getOrderById(id);
          o = data?.data || data?.order || data;
          if (o) {
            console.log('[TransporterOrderTracking] Found order from generic order endpoint:', id);
          }
        } catch (genericError) {
          console.log('[TransporterOrderTracking] Generic order fallback failed:', genericError.message);
        }
      }

      if (o) {
        const normalizedOrder = withTransporterPlaceholders(o);
        console.log('[TransporterOrderTracking] Final order payload:', JSON.stringify(normalizedOrder, null, 2));
        setOrder(normalizedOrder);
      } else {
        console.error('[TransporterOrderTracking] Order not found for ID:', id);
      }

      setError(null);
    } catch (e) {
      console.error('[TransporterOrderTracking] Fetch tracking error:', e.message);
      if (!order) setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (initialOrder) {
      console.log('[TransporterOrderTracking] Using route order data:', JSON.stringify(initialOrder, null, 2));
      setOrder(initialOrder);
      setLoading(false);
      fetchOrder(true);
      return;
    }

    fetchOrder();
  }, []);

  useEffect(() => {
    intervalRef.current = setInterval(() => fetchOrder(true), 40000);
    return () => clearInterval(intervalRef.current);
  }, [fetchOrder]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress, duration: 1000,
      easing: Easing.out(Easing.cubic), useNativeDriver: false,
    }).start();
  }, [progress]);

  const items = order?.items || order?.order_items || [];
  const farmer = order?.farmer || items[0]?.farmer;
  const customer = order?.customer;
  const deliveryPerson = order?.delivery_person;
  const customerName =
    customer?.name ||
    customer?.full_name ||
    order?.customer_name ||
    null;
  const customerPhone =
    customer?.phone ||
    customer?.mobile ||
    customer?.mobile_number ||
    null;
  const customerEmail = customer?.email || null;
  const customerAddress = formatAddress(order?.delivery_address || customer?.address || customer?.address_line);
  const customerDetails = [
    customerAddress,
    customerEmail ? `Email: ${customerEmail}` : null,
  ].filter(Boolean).join('\n');

  if (loading && !order) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={{ color: '#888', marginTop: 12 }}>Loading tracking info...</Text>
        </View>
      </View>
    );
  }

  if (error && !order) {
    return (
      <View style={[s.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={s.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
          <Text style={{ color: '#333', marginTop: 12, fontSize: 16, fontWeight: '600' }}>Unable to load</Text>
          <Text style={{ color: '#888', marginTop: 4, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={() => fetchOrder()} style={s.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <View style={s.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Track Order #{order?.order_id || order?.id}</Text>
        <TouchableOpacity onPress={() => fetchOrder(true)}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); fetchOrder(true); }}
            colors={['#1B5E20']}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Order Info */}
        <View style={s.orderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={s.orderIdText}>Order #{order?.order_id || order?.id}</Text>
              <Text style={s.orderDateText}>{formatDate(order?.created_at)}</Text>
            </View>
            <View style={[s.statusChip, {
              backgroundColor: isCancelled ? '#FFEBEE'
                : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50') + '20',
            }]}>
              <Text style={[s.statusChipText, {
                color: isCancelled ? '#F44336'
                  : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50'),
              }]}>
                {isCancelled ? 'Cancelled' : TRACKING_STAGES[currentIndex]?.label || order?.current_status}
              </Text>
            </View>
          </View>
          {order?.total_amount && (
            <Text style={s.orderTotal}>Total: {formatCurrency(order.total_amount)}</Text>
          )}
        </View>

        {/* Cancelled */}
        {isCancelled && (
          <View style={s.cancelledCard}>
            <Ionicons name="close-circle" size={48} color="#F44336" />
            <Text style={s.cancelledTitle}>Order Cancelled</Text>
          </View>
        )}

        {/* Vehicle animation */}
        {!isCancelled && <AnimatedVehicle progress={progress} />}

        {/* Progress */}
        {!isCancelled && (
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>Delivery Progress</Text>
            <Text style={s.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        {/* QR Scan button — only shown after ASSIGNED (step 3+) */}
        {!isCancelled && currentIndex >= 2 && (
          <TouchableOpacity
            style={s.qrBtn}
            onPress={() => navigation.navigate('QRScan', { orderId: order?.order_id || order?.id })}
          >
            <Ionicons name="qr-code-outline" size={20} color="#fff" />
            <Text style={s.qrBtnText}>Scan QR to Update Status</Text>
          </TouchableOpacity>
        )}

        {/* Timeline */}
        {!isCancelled && (
          <View style={s.timelineCard}>
            <Text style={s.sectionTitle}>Order Timeline (9 Steps)</Text>
            {TRACKING_STAGES.map((stage, idx) => (
              <TimelineStep
                key={stage.key}
                stage={stage}
                index={idx}
                currentIndex={currentIndex}
                isLast={idx === TRACKING_STAGES.length - 1}
              />
            ))}
          </View>
        )}

        {/* Products */}
        {items.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Products</Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={s.productRow}>
                  {img
                    ? <Image source={{ uri: optimizeImageUrl(img, { width: 64 }) }} style={s.productImg} />
                    : <View style={[s.productImg, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }]}>
                        <Ionicons name="leaf-outline" size={22} color="#aaa" />
                      </View>
                  }
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.productName} numberOfLines={1}>
                      {item.product_name || item.product?.name || 'Product'}
                    </Text>
                    <Text style={s.productMeta}>Qty: {item.quantity || 1}</Text>
                    <Text style={s.productPrice}>
                      {formatCurrency(item.total || (item.price || 0) * (item.quantity || 1))}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Farmer */}
        {farmer && (
          <InfoCard
            icon="leaf-outline"
            title="Farmer (Pickup)"
            name={farmer.name || farmer.full_name}
            details={farmer.address || farmer.city}
            phone={farmer.phone || farmer.mobile}
          />
        )}

        {/* Source Transporter */}
        {order?.source_transporter && (
          <InfoCard
            mc="truck-outline"
            title="Source Transporter"
            name={order.source_transporter.name || order.source_transporter.full_name}
            details={order.source_transporter.address}
            phone={order.source_transporter.phone || order.source_transporter.mobile}
          />
        )}

        {/* Destination Transporter */}
        {order?.destination_transporter && (
          <InfoCard
            mc="truck-delivery-outline"
            title="Destination Transporter"
            name={order.destination_transporter.name || order.destination_transporter.full_name}
            details={order.destination_transporter.address}
            phone={order.destination_transporter.phone || order.destination_transporter.mobile}
          />
        )}

        {/* Customer */}
        {(customerName || customerPhone || customerDetails) && (
          <InfoCard
            icon="person-outline"
            title="Customer (Delivery)"
            name={customerName || 'Customer'}
            details={customerDetails}
            phone={customerPhone}
          />
        )}

        {/* Delivery Person */}
        {deliveryPerson && (
          <InfoCard
            icon="bicycle-outline"
            title="Delivery Person"
            name={deliveryPerson.name || deliveryPerson.full_name}
            details={deliveryPerson.vehicle_number}
            phone={deliveryPerson.phone}
          />
        )}

        {/* Bill */}
        <TouchableOpacity
          style={s.billBtn}
          onPress={() => navigation.navigate('BillPreview', { orderId: order?.order_id || order?.id, order })}
        >
          <Ionicons name="receipt-outline" size={18} color="#1B5E20" />
          <Text style={s.billBtnText}>View Bill</Text>
        </TouchableOpacity>

        <Text style={s.refreshNote}>Auto-refreshes every 40 seconds</Text>
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  headerBar: {
    backgroundColor: '#1B5E20', flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', flex: 1, marginHorizontal: 8 },
  retryBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 20 },

  orderCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  orderIdText: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  orderDateText: { fontSize: 13, color: '#888', marginTop: 2 },
  orderTotal: { fontSize: 15, fontWeight: '600', color: '#1B5E20', marginTop: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  cancelledCard: { alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 16, padding: 24, marginBottom: 16 },
  cancelledTitle: { fontSize: 18, fontWeight: '700', color: '#F44336', marginTop: 12 },

  vehicleTrack: { height: 48, marginBottom: 8, justifyContent: 'center' },
  trackLine: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  vehicleIcon: { position: 'absolute', top: 2 },

  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressLabel: { fontSize: 14, color: '#888' },
  progressPercent: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },

  qrBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 14, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }, android: { elevation: 4 } }),
  },
  qrBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  timelineCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 16 },

  stepRow: { flexDirection: 'row', minHeight: 60 },
  stepLeft: { alignItems: 'center', width: 44, marginRight: 8 },
  stepDot: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: '#E0E0E0',
    justifyContent: 'center', alignItems: 'center', zIndex: 1,
  },
  connector: { width: 3, flex: 1, backgroundColor: '#E0E0E0', marginVertical: 2 },
  stepContent: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, marginBottom: 4,
  },
  stepContentActive: { backgroundColor: '#F1F8E9' },
  stepLabel: { fontSize: 13, fontWeight: '500', color: '#666' },
  stepSub: { fontSize: 11, marginTop: 2 },

  sectionCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 }, android: { elevation: 3 } }),
  },
  productRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f0f0f0' },
  productImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f0f0f0' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginTop: 2 },

  infoCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 14, padding: 14, marginBottom: 12,
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 }, android: { elevation: 2 } }),
  },
  infoIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  infoTitle: { fontSize: 11, color: '#888', fontWeight: '500', textTransform: 'uppercase' },
  infoName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  infoDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  callBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },

  billBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#E8F5E9', borderRadius: 14, paddingVertical: 14, marginBottom: 8, gap: 8,
  },
  billBtnText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },
  refreshNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },
});

export default TransporterOrderTracking;
