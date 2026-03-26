/**
 * TransporterOrderTracking.js
 * Full 10-step order tracking for transporter view.
 *
 * Steps:
 *  1. PENDING           - Customer ordered
 *  2. ASSIGNED          - Farmer accepted and transporters assigned
 *  3. PICKUP_ASSIGNED   - Source transporter assigned pickup delivery person
 *  4. PICKED_UP         - Pickup delivery person picked up from farmer
 *  5. RECEIVED          - Source transporter received at source office
 *  6. SHIPPED           - Source transporter assigned vehicle and shipped
 *  7. IN_TRANSIT        - Package moving to destination transporter
 *  8. REACHED_DESTINATION - Destination transporter received package
 *  9. OUT_FOR_DELIVERY  - Destination transporter assigned final delivery person
 * 10. DELIVERED         - Delivery person delivered to customer
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import { getOrderById } from '../../services/orderService';

const TRACKING_STAGES = [
  { key: 'PENDING',              label: 'Order Placed',            icon: 'cart-outline',                  mc: null,                    color: '#FF9800' },
  { key: 'ASSIGNED',             label: 'Farmer Accepted + Transporters Assigned', icon: null,           mc: 'truck-check-outline',   color: '#9C27B0' },
  { key: 'PICKUP_ASSIGNED',      label: 'Pickup Person Assigned',  icon: 'person-outline',                mc: null,                    color: '#FF5722' },
  { key: 'PICKED_UP',            label: 'Picked Up from Farmer',   icon: null,                            mc: 'store-check-outline',   color: '#00897B' },
  { key: 'RECEIVED',             label: 'Received at Source Office', icon: null,                           mc: 'package-variant-closed', color: '#00897B' },
  { key: 'SHIPPED',              label: 'Shipped from Source',     icon: null,                            mc: 'cube-send',             color: '#3F51B5' },
  { key: 'IN_TRANSIT',           label: 'In Transit to Destination', icon: null,                           mc: 'truck-fast-outline',    color: '#3F51B5' },
  { key: 'REACHED_DESTINATION',  label: 'Reached Destination',     icon: null,                            mc: 'warehouse',             color: '#673AB7' },
  { key: 'OUT_FOR_DELIVERY',     label: 'Out for Delivery',        icon: 'bicycle-outline',               mc: null,                    color: '#00BCD4' },
  { key: 'DELIVERED',            label: 'Delivered to Customer',   icon: 'checkmark-done-circle-outline', mc: null,                    color: '#4CAF50' },
];

const STATUS_INDEX = {
  PENDING: 0, PLACED: 0,
  CONFIRMED: 1, ACCEPTED: 1, ASSIGNED: 1,
  PICKUP_ASSIGNED: 2,
  PICKUP_IN_PROGRESS: 2,
  PICKED_UP: 3,
  RECEIVED: 4,
  SHIPPED: 5,
  IN_TRANSIT: 6,
  REACHED_DESTINATION: 7,
  OUT_FOR_DELIVERY: 8,
  DELIVERED: 9,
  COMPLETED: 9,
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

const getPackingProofImages = (order) => ({
  packing:
    order?.packing_image_url ||
    order?.packing_photo_url ||
    order?.package_image_url ||
    order?.package_photo_url ||
    order?.packing?.packing_image_url ||
    null,
  bill:
    order?.bill_paste_image_url ||
    order?.bill_image_url ||
    order?.bill_photo_url ||
    order?.bill_copy_url ||
    order?.packing?.bill_image_url ||
    order?.packing?.bill_paste_image_url ||
    null,
});

/* --------------------------------------------------------------------------
 * ANIMATED VEHICLE
 * ------------------------------------------------------------------------ */
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
        Animated.timing(bounceAnim, { toValue: -3, duration: 400, useNativeDriver: false }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 400, useNativeDriver: false }),
      ])
    ).start();
  }, [progress]);

  const left = slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '90%'] });

  return (
    <View style={trackStyles.vehicleTrack}>
      <View style={trackStyles.trackLine}>
        <Animated.View style={[trackStyles.trackFill, { width: slideAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
      </View>
      <Animated.View style={[trackStyles.vehicleIcon, { left, transform: [{ translateY: bounceAnim }] }]}>
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
          Animated.timing(scaleAnim, { toValue: 1.15, duration: 600, useNativeDriver: false }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
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
const InfoCard = ({ icon, mc, title, name, details, phone, image, iconColor }) => (
  <View style={s.infoCard}>
    {image ? (
      <Image source={{ uri: optimizeImageUrl(image, { width: 44, height: 44 }) }} style={s.infoAvatarImg} />
    ) : (
      <View style={[s.infoIconWrap, iconColor ? { backgroundColor: iconColor + '15' } : null]}>
        {mc
          ? <MaterialCommunityIcons name={mc} size={22} color={iconColor || '#1B5E20'} />
          : <Ionicons name={icon} size={22} color={iconColor || '#1B5E20'} />
        }
      </View>
    )}
    <View style={{ flex: 1 }}>
      <Text style={s.infoTitle}>{title}</Text>
      <Text style={s.infoName}>{name || 'N/A'}</Text>
      {details ? <Text style={s.infoDetail}>{details}</Text> : null}
    </View>
    {phone && (
      <TouchableOpacity style={s.callBtn} onPress={() => Linking.openURL('tel:' + phone)}>
        <Ionicons name="call-outline" size={18} color={iconColor || '#1B5E20'} />
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
  const nextStatusMap = {
    RECEIVED: 'SHIPPED',
    SHIPPED: 'IN_TRANSIT',
    IN_TRANSIT: 'REACHED_DESTINATION',
    REACHED_DESTINATION: 'OUT_FOR_DELIVERY',
  };
  const nextStatus = nextStatusMap[(order?.current_status || order?.status || '').toUpperCase()] || null;

  const fetchOrder = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const id = orderId || order?.order_id || order?.id;
      if (!id) return;

      // Try stable order endpoints first, keep /track as optional fallback.
      let o = null;
      const endpoints = [
        `/transporters/orders/${id}`,
        `/transporters/orders/${id}/track`,
        `/orders/${id}`,
      ];
      for (const endpoint of endpoints) {
        try {
          const res = await api.get(endpoint);
          const payload = res.data?.data || res.data?.order || res.data;
          const candidate = payload?.order || payload;
          if (candidate && (candidate.order_id || candidate.id)) {
            // Merge carefully to not lose nested objects from initialOrder
            o = { 
              ...(initialOrder || {}), 
              ...candidate,
              farmer: candidate.farmer || candidate.Farmer || initialOrder?.farmer || initialOrder?.Farmer,
              customer: candidate.customer || candidate.Customer || initialOrder?.customer || initialOrder?.Customer,
              delivery_person: candidate.delivery_person || candidate.DeliveryPerson || initialOrder?.delivery_person || initialOrder?.DeliveryPerson,
              source_transporter: candidate.source_transporter || initialOrder?.source_transporter,
              destination_transporter: candidate.destination_transporter || initialOrder?.destination_transporter
            };
            break;
          }
        } catch (_) {
          // continue fallback chain
        }
      }

      if (!o) {
        const data = await getOrderById(id);
        const candidate = data?.data || data?.order || data;
        if (candidate) {
          o = { 
            ...(initialOrder || {}), 
            ...candidate,
            farmer: candidate.farmer || candidate.Farmer || initialOrder?.farmer || initialOrder?.Farmer,
            customer: candidate.customer || candidate.Customer || initialOrder?.customer || initialOrder?.Customer,
            delivery_person: candidate.delivery_person || candidate.DeliveryPerson || initialOrder?.delivery_person || initialOrder?.DeliveryPerson,
            source_transporter: candidate.source_transporter || initialOrder?.source_transporter,
            destination_transporter: candidate.destination_transporter || initialOrder?.destination_transporter
          };
        }
      }

      if (o) setOrder(o);
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
  const productName = items[0]?.product?.name || items[0]?.product_name || items[0]?.name || order?.product?.name || order?.Product?.name || 'Product';
  const farmer = order?.farmer || order?.Farmer || items[0]?.farmer || items[0]?.product?.farmer || {};
  const customer = order?.customer || order?.Customer || order?.buyer || {};
  const deliveryPerson = order?.delivery_person || order?.DeliveryPerson || order?.assigned_delivery_person || {};
  const srcTransporter = order?.source_transporter || order?.sourceTransporter || {};
  const dstTransporter = order?.destination_transporter || order?.destinationTransporter || {};
  const packingProof = getPackingProofImages(order);

  /* -- Loading state ----------------------------------------- */
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
        <Text style={s.headerTitle}>{productName}</Text>
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
              <Text style={s.orderIdText}>{productName}</Text>
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

        {/* Timeline */}
        {!isCancelled && (
          <View style={s.timelineCard}>
            <Text style={s.sectionTitle}>Order Timeline (10 Steps)</Text>
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

        {/* Packing Proof Images */}
        {(order?.packing_image_url || order?.bill_paste_image_url) && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>📸 Packing Proof</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {order?.packing_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image
                    source={{ uri: order.packing_image_url }}
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Packing Image</Text>
                </View>
              )}
              {order?.bill_paste_image_url && (
                <View style={{ flex: 1, alignItems: 'center' }}>
                  <Image
                    source={{ uri: order.bill_paste_image_url }}
                    style={{ width: '100%', height: 160, borderRadius: 12, backgroundColor: '#f0f0f0' }}
                    resizeMode="cover"
                  />
                  <Text style={{ fontSize: 11, color: '#888', marginTop: 4, fontWeight: '600' }}>Bill Image</Text>
                </View>
              )}
            </View>
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

        {/* Farmer Info */}
        {(farmer?.name || farmer?.full_name || farmer?.phone || order?.farmer_name || order?.pickup_address) && (
          <InfoCard
            icon="leaf-outline"
            iconColor="#4CAF50"
            title="Farmer"
            name={farmer.name || farmer.full_name || farmer.username || order?.farmer_name}
            details={farmer.farm_name || farmer.location || farmer.city || formatAddress(order?.pickup_address)}
            phone={farmer.phone || farmer.mobile || farmer.mobile_number || order?.farmer_phone}
            image={farmer.image_url || farmer.image || farmer.profile_image || null}
          />
        )}

        {/* Customer Info */}
        {(customer?.name || customer?.full_name || order?.customer_name || order?.delivery_address) && (
          <InfoCard
            icon="person-outline"
            iconColor="#2196F3"
            title="Customer"
            name={customer.name || customer.full_name || customer.username || order?.customer_name}
            details={formatAddress(order?.delivery_address) || customer.city || formatAddress(customer.address)}
            phone={customer.phone || customer.mobile || customer.mobile_number || order?.customer_phone}
            image={customer.image_url || customer.image || customer.profile_image || null}
          />
        )}

        {/* Delivery Person Info */}
        {(deliveryPerson?.name || deliveryPerson?.full_name || order?.delivery_person_name || order?.delivery_person_id) && (
          <InfoCard
            icon="bicycle-outline"
            iconColor="#9C27B0"
            title="Delivery Person"
            name={deliveryPerson.name || deliveryPerson.full_name || deliveryPerson.username || order?.delivery_person_name}
            details={[deliveryPerson.vehicle_number, deliveryPerson.vehicle_type].filter(Boolean).join(' • ') || order?.vehicle_number}
            phone={deliveryPerson.phone || deliveryPerson.mobile || deliveryPerson.mobile_number || order?.delivery_person_phone}
            image={deliveryPerson.image_url || deliveryPerson.image || deliveryPerson.profile_image || null}
          />
        )}

        {/* Source Transporter */}
        {(srcTransporter?.name || srcTransporter?.transporter_id || order?.source_transporter_id) && (
          <InfoCard
            mc="truck-delivery-outline"
            iconColor="#FF5722"
            title="Source Transporter"
            name={srcTransporter.name || srcTransporter.full_name || `Transporter #${order?.source_transporter_id || srcTransporter?.transporter_id}`}
            details={[srcTransporter.address, srcTransporter.zone, srcTransporter.district, srcTransporter.state].filter(Boolean).join(', ') || srcTransporter.email}
            phone={srcTransporter.phone || srcTransporter.mobile_number}
            image={srcTransporter.image_url || srcTransporter.image || null}
          />
        )}

        {/* Destination Transporter */}
        {(dstTransporter?.name || dstTransporter?.transporter_id || order?.destination_transporter_id) && (
          <InfoCard
            mc="truck-check-outline"
            iconColor="#673AB7"
            title="Destination Transporter"
            name={dstTransporter.name || dstTransporter.full_name || `Transporter #${order?.destination_transporter_id || dstTransporter?.transporter_id}`}
            details={[dstTransporter.address, dstTransporter.zone, dstTransporter.district, dstTransporter.state].filter(Boolean).join(', ') || dstTransporter.email}
            phone={dstTransporter.phone || dstTransporter.mobile_number}
            image={dstTransporter.image_url || dstTransporter.image || null}
          />
        )}

        {(packingProof.packing || packingProof.bill) && (
          <View style={s.sectionCard}>
            <Text style={s.sectionTitle}>Packed Order Proof</Text>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={trackStyles.proofLabel}>Packed Parcel</Text>
                {packingProof.packing ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.packing, { width: 280 }) }} style={trackStyles.proofImage} />
                ) : (
                  <View style={[trackStyles.proofImage, trackStyles.proofEmpty]}>
                    <Text style={trackStyles.proofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={trackStyles.proofLabel}>Bill Pasted</Text>
                {packingProof.bill ? (
                  <Image source={{ uri: optimizeImageUrl(packingProof.bill, { width: 280 }) }} style={trackStyles.proofImage} />
                ) : (
                  <View style={[trackStyles.proofImage, trackStyles.proofEmpty]}>
                    <Text style={trackStyles.proofEmptyText}>Not uploaded</Text>
                  </View>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Delivery address */}
        {(order?.delivery_address || order?.shipping_address) && (
          <View style={trackStyles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#1B5E20" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={trackStyles.addressTitle}>Delivery Address</Text>
              <Text style={trackStyles.addressText}>{formatAddress(order.delivery_address || order.shipping_address)}</Text>
            </View>
          </View>
        )}

        {/* Pickup address */}
        {(order?.pickup_address || order?.farmer_address) && (
          <View style={trackStyles.addressCard}>
            <Ionicons name="location-outline" size={20} color="#FF9800" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={trackStyles.addressTitle}>Pickup Address</Text>
              <Text style={trackStyles.addressText}>{order.pickup_address || order.farmer_address}</Text>
            </View>
          </View>
        )}

        {/* QR / Bill actions */}
        <View style={trackStyles.actionRow}>
          {nextStatus && (
            <TouchableOpacity
              style={trackStyles.actionBtn}
              onPress={() => navigation.navigate('QRScan', { orderId: order?.order_id || order?.id, expectedOrderId: order?.order_id || order?.id })}
            >
              <Ionicons name="qr-code-outline" size={20} color="#1B5E20" />
              <Text style={trackStyles.actionBtnText}>Scan QR</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={trackStyles.actionBtn}
            onPress={() => navigation.navigate('BillPreview', { orderId: order?.order_id || order?.id, order })}
          >
            <Ionicons name="receipt-outline" size={20} color="#1B5E20" />
            <Text style={trackStyles.actionBtnText}>View Bill</Text>
          </TouchableOpacity>
        </View>

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
  infoAvatarImg: { width: 44, height: 44, borderRadius: 22, marginRight: 12, backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#eee' },
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

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
  },
  billBtnText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },
  proofLabel: { fontSize: 13, fontWeight: '700', color: '#1B5E20', marginBottom: 8 },
  proofImage: { width: '100%', height: 150, borderRadius: 10, backgroundColor: '#EEE' },
  proofEmpty: { alignItems: 'center', justifyContent: 'center' },
  proofEmptyText: { color: '#999', fontSize: 12 },
  refreshNote: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 8 },
});

const trackStyles = s;

export default TransporterOrderTracking;
