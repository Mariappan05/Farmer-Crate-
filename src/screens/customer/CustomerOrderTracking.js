/**
 * CustomerOrderTracking.js
 * Animated order tracking - conversion of Flutter customer_order_tracking.dart (1126 lines)
 *
 * Features:
 *   - Receives params: { orderId, order? }
 *   - Animated tracking timeline with 6 stages
 *   - Auto-refresh every 40 seconds
 *   - Vehicle animation along progress
 *   - Product card with image and details
 *   - Farmer / Transporter / Delivery person info cards
 *   - Status-specific colors and icons per stage
 *   - Cloudinary image optimization
 *   - Estimated delivery info
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  RefreshControl,
  Animated,
  Easing,
  StatusBar,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';
import { getOrderById } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * TRACKING STAGES
 * ------------------------------------------------------------------------ */

const TRACKING_STAGES = [
  { key: 'placed',           label: 'Order Placed',       icon: 'cart',                mcIcon: null,               color: '#FF9800', emoji: '\uD83D\uDED2' },
  { key: 'confirmed',        label: 'Confirmed',          icon: 'checkmark-circle',    mcIcon: null,               color: '#2196F3', emoji: '\u2705' },
  { key: 'assigned',         label: 'Transporter Assigned', icon: null,                mcIcon: 'truck-check',      color: '#9C27B0', emoji: '\uD83D\uDE9A' },
  { key: 'shipped',          label: 'Shipped',            icon: 'airplane',            mcIcon: null,               color: '#3F51B5', emoji: '\uD83D\uDCE6' },
  { key: 'out_for_delivery', label: 'Out for Delivery',   icon: 'bicycle',             mcIcon: null,               color: '#00BCD4', emoji: '\uD83D\uDEB4' },
  { key: 'delivered',        label: 'Delivered',          icon: 'checkmark-done-circle', mcIcon: null,             color: '#4CAF50', emoji: '\uD83C\uDF89' },
];

const STATUS_MAP = {
  pending: 0, placed: 0,
  confirmed: 1,
  assigned: 2, processing: 2,
  shipped: 3,
  out_for_delivery: 4,
  delivered: 5,
  cancelled: -1,
};

const getStageIndex = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return STATUS_MAP[key] !== undefined ? STATUS_MAP[key] : 0;
};

/* --------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------ */

const getProductImage = (item) => {
  const product = item?.product || item;
  if (!product) return null;
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    const primary = imgs.find((i) => i?.is_primary) || imgs[0];
    return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
  }
  return product.image_url || product.image || null;
};

const formatDate = (d) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const formatCurrency = (a) => '\u20B9' + (parseFloat(a) || 0).toFixed(2);

/* --------------------------------------------------------------------------
 * ANIMATED VEHICLE
 * ------------------------------------------------------------------------ */

const AnimatedVehicle = ({ progress }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, { toValue: progress, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -3, duration: 400, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ).start();
  }, [progress]);

  const left = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '90%'],
  });

  return (
    <View style={trackStyles.vehicleTrack}>
      {/* Track line */}
      <View style={trackStyles.trackLine}>
        <Animated.View style={[trackStyles.trackFill, { width: slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      {/* Vehicle icon */}
      <Animated.View style={[trackStyles.vehicleIcon, { left, transform: [{ translateY: bounceAnim }] }]}>
        <MaterialCommunityIcons name="truck-fast" size={28} color="#1B5E20" />
      </Animated.View>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * TIMELINE STEP
 * ------------------------------------------------------------------------ */

const TimelineStep = ({ stage, index, currentIndex, isLast, animValue }) => {
  const isCompleted = index <= currentIndex;
  const isActive = index === currentIndex;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
      ).start();
    }
  }, [isActive]);

  return (
    <View style={trackStyles.stepRow}>
      {/* Left side: dot + connector */}
      <View style={trackStyles.stepLeft}>
        <Animated.View
          style={[
            trackStyles.stepDot,
            isCompleted && { backgroundColor: stage.color },
            isActive && { transform: [{ scale: scaleAnim }], borderWidth: 3, borderColor: stage.color + '40' },
          ]}
        >
          {stage.mcIcon ? (
            <MaterialCommunityIcons name={isCompleted ? stage.mcIcon : stage.mcIcon} size={18} color={isCompleted ? '#fff' : '#bbb'} />
          ) : (
            <Ionicons name={isCompleted ? stage.icon : (stage.icon + '-outline')} size={18} color={isCompleted ? '#fff' : '#bbb'} />
          )}
        </Animated.View>
        {!isLast && (
          <View style={[trackStyles.connector, isCompleted && index < currentIndex && { backgroundColor: stage.color }]} />
        )}
      </View>

      {/* Right side: label + info */}
      <View style={[trackStyles.stepContent, isActive && trackStyles.stepContentActive]}>
        <Text style={trackStyles.stepEmoji}>{stage.emoji}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[trackStyles.stepLabel, isActive && { color: stage.color, fontWeight: '700' }]}>{stage.label}</Text>
          {isActive && <Text style={[trackStyles.stepStatus, { color: stage.color }]}>Current Status</Text>}
          {isCompleted && !isActive && <Text style={trackStyles.stepDone}>Completed</Text>}
          {!isCompleted && !isActive && <Text style={trackStyles.stepPending}>Upcoming</Text>}
        </View>
      </View>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * INFO CARD
 * ------------------------------------------------------------------------ */

const InfoCard = ({ icon, mcIcon, title, name, details, phone }) => (
  <View style={trackStyles.infoCard}>
    <View style={trackStyles.infoIconWrap}>
      {mcIcon ? (
        <MaterialCommunityIcons name={mcIcon} size={22} color="#1B5E20" />
      ) : (
        <Ionicons name={icon} size={22} color="#1B5E20" />
      )}
    </View>
    <View style={{ flex: 1 }}>
      <Text style={trackStyles.infoTitle}>{title}</Text>
      <Text style={trackStyles.infoName}>{name || 'N/A'}</Text>
      {details ? <Text style={trackStyles.infoDetail}>{details}</Text> : null}
    </View>
    {phone && (
      <TouchableOpacity style={trackStyles.callBtn} onPress={() => Linking.openURL('tel:' + phone)}>
        <Ionicons name="call-outline" size={18} color="#1B5E20" />
      </TouchableOpacity>
    )}
  </View>
);

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const CustomerOrderTracking = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};
  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const progressAnim = useRef(new Animated.Value(0)).current;
  const intervalRef = useRef(null);

  const currentIndex = getStageIndex(order?.status);
  const isCancelled = (order?.status || '').toLowerCase() === 'cancelled';
  const progress = isCancelled ? 0 : Math.min(1, currentIndex / (TRACKING_STAGES.length - 1));

  /* -- Fetch ------------------------------------------------- */
  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const id = orderId || order?.order_id || order?.id;
      if (!id) return;
      const data = await getOrderById(id);
      const o = data?.data || data?.order || data;
      if (o) setOrder(o);
      setError(null);
    } catch (e) {
      if (!order) setError(e.message);
      console.log('Tracking fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderId, order]);

  useEffect(() => {
    if (!initialOrder || orderId) fetchOrder();
  }, [orderId]);

  /* -- Auto-refresh every 40s -------------------------------- */
  useEffect(() => {
    intervalRef.current = setInterval(() => fetchOrder(true), 40000);
    return () => clearInterval(intervalRef.current);
  }, [fetchOrder]);

  /* -- Animate progress -------------------------------------- */
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress,
      duration: 1000,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress]);

  const items = order?.items || order?.order_items || [];
  const transporter = order?.transporter;
  const deliveryPerson = order?.delivery_person;
  const farmer = order?.farmer || items[0]?.farmer || items[0]?.product?.farmer;

  /* -- Loading state ----------------------------------------- */
  if (loading && !order) {
    return (
      <View style={[trackStyles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={trackStyles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={trackStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={trackStyles.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={{ color: '#888', marginTop: 12, fontSize: 14 }}>Loading tracking info...</Text>
        </View>
      </View>
    );
  }

  /* -- Error state ------------------------------------------- */
  if (error && !order) {
    return (
      <View style={[trackStyles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={trackStyles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={trackStyles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={trackStyles.headerTitle}>Track Order</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
          <Ionicons name="alert-circle-outline" size={64} color="#F44336" />
          <Text style={{ color: '#333', marginTop: 12, fontSize: 16, fontWeight: '600' }}>Unable to load</Text>
          <Text style={{ color: '#888', marginTop: 4, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity onPress={() => fetchOrder()} style={trackStyles.retryBtn}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* -- Cancelled state --------------------------------------- */
  const renderCancelled = () => (
    <View style={trackStyles.cancelledCard}>
      <Ionicons name="close-circle" size={48} color="#F44336" />
      <Text style={trackStyles.cancelledTitle}>Order Cancelled</Text>
      <Text style={trackStyles.cancelledSub}>This order has been cancelled.</Text>
    </View>
  );

  /* -- Main render ------------------------------------------- */
  return (
    <View style={[trackStyles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={trackStyles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={trackStyles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={trackStyles.headerTitle}>Track Order</Text>
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
            tintColor="#1B5E20"
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {/* Order Info Card */}
        <View style={trackStyles.orderCard}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <View>
              <Text style={trackStyles.orderIdText}>Order #{order?.order_id || order?.id}</Text>
              <Text style={trackStyles.orderDateText}>{formatDate(order?.created_at || order?.order_date)}</Text>
            </View>
            <View style={[trackStyles.statusChip, { backgroundColor: isCancelled ? '#FFEBEE' : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50') + '20' }]}>
              <Text style={[trackStyles.statusChipText, { color: isCancelled ? '#F44336' : (TRACKING_STAGES[currentIndex]?.color || '#4CAF50') }]}>
                {isCancelled ? 'Cancelled' : TRACKING_STAGES[currentIndex]?.label || order?.status}
              </Text>
            </View>
          </View>
          {order?.total_amount && (
            <Text style={trackStyles.orderTotal}>Total: {formatCurrency(order.total_amount)}</Text>
          )}
          {order?.estimated_delivery && (
            <View style={trackStyles.etaRow}>
              <Ionicons name="time-outline" size={16} color="#1B5E20" />
              <Text style={trackStyles.etaText}>Est. Delivery: {formatDate(order.estimated_delivery)}</Text>
            </View>
          )}
        </View>

        {/* Cancelled */}
        {isCancelled && renderCancelled()}

        {/* Vehicle animation */}
        {!isCancelled && <AnimatedVehicle progress={progress} />}

        {/* Progress percentage */}
        {!isCancelled && (
          <View style={trackStyles.progressRow}>
            <Text style={trackStyles.progressLabel}>Delivery Progress</Text>
            <Text style={trackStyles.progressPercent}>{Math.round(progress * 100)}%</Text>
          </View>
        )}

        {/* Timeline */}
        {!isCancelled && (
          <View style={trackStyles.timelineCard}>
            <Text style={trackStyles.sectionTitle}>Order Timeline</Text>
            {TRACKING_STAGES.map((stage, idx) => (
              <TimelineStep
                key={stage.key}
                stage={stage}
                index={idx}
                currentIndex={currentIndex}
                isLast={idx === TRACKING_STAGES.length - 1}
                animValue={progressAnim}
              />
            ))}
          </View>
        )}

        {/* Product cards */}
        {items.length > 0 && (
          <View style={trackStyles.sectionCard}>
            <Text style={trackStyles.sectionTitle}>Products ({items.length})</Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={trackStyles.productRow}>
                  {img ? (
                    <Image
                      source={{ uri: optimizeImageUrl(img, { width: 64, height: 64 }) }}
                      style={trackStyles.productImg}
                    />
                  ) : (
                    <View style={[trackStyles.productImg, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' }]}>
                      <Ionicons name="leaf-outline" size={22} color="#aaa" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={trackStyles.productName} numberOfLines={1}>
                      {item.product_name || item.product?.name || item.name || 'Product'}
                    </Text>
                    <Text style={trackStyles.productMeta}>Qty: {item.quantity || 1}</Text>
                    <Text style={trackStyles.productPrice}>{formatCurrency(item.total || item.subtotal || (item.price || 0) * (item.quantity || 1))}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Farmer Info */}
        {farmer && (
          <InfoCard
            icon="leaf-outline"
            title="Farmer"
            name={farmer.name || farmer.full_name || farmer.username}
            details={farmer.farm_name || farmer.location || farmer.city}
            phone={farmer.phone}
          />
        )}

        {/* Transporter Info */}
        {transporter && (
          <InfoCard
            mcIcon="truck-outline"
            title="Transporter"
            name={transporter.name || transporter.full_name || transporter.username}
            details={[transporter.vehicle_type, transporter.vehicle_number].filter(Boolean).join(' \u2022 ')}
            phone={transporter.phone}
          />
        )}

        {/* Delivery Person Info */}
        {deliveryPerson && (
          <InfoCard
            icon="bicycle-outline"
            title="Delivery Person"
            name={deliveryPerson.name || deliveryPerson.full_name || deliveryPerson.username}
            details={deliveryPerson.vehicle_number}
            phone={deliveryPerson.phone}
          />
        )}

        {/* Delivery address */}
        {(order?.delivery_address || order?.shipping_address) && (
          <View style={trackStyles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#1B5E20" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={trackStyles.addressTitle}>Delivery Address</Text>
              <Text style={trackStyles.addressText}>{order.delivery_address || order.shipping_address}</Text>
            </View>
          </View>
        )}

        {/* View Summary button */}
        <TouchableOpacity
          style={trackStyles.summaryBtn}
          onPress={() => navigation.navigate('OrderSummary', { orderId: order?.order_id || order?.id, order })}
        >
          <Ionicons name="receipt-outline" size={18} color="#1B5E20" />
          <Text style={trackStyles.summaryBtnText}>View Order Summary</Text>
        </TouchableOpacity>

        {/* Auto-refresh note */}
        <Text style={trackStyles.refreshNote}>Auto-refreshes every 40 seconds</Text>
      </ScrollView>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const trackStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerBar: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  retryBtn: {
    marginTop: 16,
    backgroundColor: '#1B5E20',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
  },

  /* Order card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  orderIdText: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  orderDateText: { fontSize: 13, color: '#888', marginTop: 2 },
  orderTotal: { fontSize: 15, fontWeight: '600', color: '#1B5E20', marginTop: 8 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusChipText: { fontSize: 12, fontWeight: '600' },
  etaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#E8F5E9', borderRadius: 8, padding: 8 },
  etaText: { fontSize: 13, color: '#1B5E20', fontWeight: '500' },

  /* Cancelled */
  cancelledCard: {
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
  },
  cancelledTitle: { fontSize: 18, fontWeight: '700', color: '#F44336', marginTop: 12 },
  cancelledSub: { fontSize: 14, color: '#888', marginTop: 4 },

  /* Vehicle track */
  vehicleTrack: { height: 48, marginBottom: 8, justifyContent: 'center' },
  trackLine: { height: 6, backgroundColor: '#E0E0E0', borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: '100%', backgroundColor: '#4CAF50', borderRadius: 3 },
  vehicleIcon: { position: 'absolute', top: 2 },

  /* Progress */
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  progressLabel: { fontSize: 14, color: '#888' },
  progressPercent: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },

  /* Timeline */
  timelineCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 16 },

  stepRow: { flexDirection: 'row', minHeight: 70 },
  stepLeft: { alignItems: 'center', width: 48, marginRight: 8 },
  stepDot: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  connector: { width: 3, flex: 1, backgroundColor: '#E0E0E0', marginVertical: 2 },
  stepContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    marginBottom: 4,
    gap: 8,
  },
  stepContentActive: { backgroundColor: '#F1F8E9' },
  stepEmoji: { fontSize: 20 },
  stepLabel: { fontSize: 14, fontWeight: '500', color: '#666' },
  stepStatus: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  stepDone: { fontSize: 12, color: '#4CAF50', marginTop: 2 },
  stepPending: { fontSize: 12, color: '#bbb', marginTop: 2 },

  /* Section card */
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },

  /* Product */
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  productImg: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f0f0f0' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  productPrice: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginTop: 2 },

  /* Info card */
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  infoIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  infoTitle: { fontSize: 11, color: '#888', fontWeight: '500', textTransform: 'uppercase' },
  infoName: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 2 },
  infoDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },

  /* Address */
  addressCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4 },
      android: { elevation: 2 },
    }),
  },
  addressTitle: { fontSize: 11, color: '#888', fontWeight: '500', textTransform: 'uppercase' },
  addressText: { fontSize: 14, color: '#333', marginTop: 2, lineHeight: 20 },

  /* Summary button */
  summaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 8,
    gap: 8,
  },
  summaryBtnText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },

  refreshNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },
});

export default CustomerOrderTracking;
