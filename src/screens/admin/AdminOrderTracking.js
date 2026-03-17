/**
 * AdminOrderTracking.js
 * Admin order tracking – conversion of Flutter admin_order_tracking.dart (1571 lines)
 *
 * Features:
 *   - Receives: { orderId, order? }
 *   - 6-stage animated timeline: PLACED → CONFIRMED → ASSIGNED → SHIPPED → OUT_FOR_DELIVERY → DELIVERED
 *   - Auto-refresh every 40s
 *   - Product card, farmer card, customer card, transporter card, delivery person card
 *   - Navigation to FarmerDetails, CustomerDetails, TransporterDetails, DeliveryPersonDetails
 *   - Animated vehicle progress
 *   - Status-specific colours/icons
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
  Alert,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import api from '../../services/api';
import { getOrderById } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* -------------------------------------------------------------------------- */
/*  TRACKING STAGES                                                            */
/* -------------------------------------------------------------------------- */

const TRACKING_STAGES = [
  { key: 'placed', label: 'Order Placed', icon: 'cart', mcIcon: null, color: '#FF9800', emoji: '🛒' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle', mcIcon: null, color: '#2196F3', emoji: '✅' },
  { key: 'assigned', label: 'Transporter Assigned', icon: null, mcIcon: 'truck-check', color: '#9C27B0', emoji: '🚚' },
  { key: 'shipped', label: 'Shipped', icon: 'airplane', mcIcon: null, color: '#3F51B5', emoji: '📦' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle', mcIcon: null, color: '#00BCD4', emoji: '🚴' },
  { key: 'delivered', label: 'Delivered', icon: 'checkmark-done-circle', mcIcon: null, color: '#4CAF50', emoji: '🎉' },
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

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

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
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatCurrency = (a) => '₹' + (parseFloat(a) || 0).toFixed(2);

/* -------------------------------------------------------------------------- */
/*  ANIMATED VEHICLE                                                           */
/* -------------------------------------------------------------------------- */

const AnimatedVehicle = ({ progress }) => {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: progress,
      duration: 1200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const bounce = Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -4, duration: 500, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    bounce.start();
    return () => bounce.stop();
  }, [progress]);

  const trackWidth = SCREEN_WIDTH - 80;
  const translateX = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, trackWidth - 32],
  });

  return (
    <View style={styles.vehicleTrack}>
      {/* Track line */}
      <View style={styles.vehicleLine} />
      <View
        style={[
          styles.vehicleLineFill,
          { width: `${Math.min(progress * 100, 100)}%` },
        ]}
      />
      {/* Vehicle */}
      <Animated.View
        style={[
          styles.vehicleIcon,
          { transform: [{ translateX }, { translateY: bounceAnim }] },
        ]}
      >
        <MaterialCommunityIcons name="truck-fast" size={22} color="#4CAF50" />
      </Animated.View>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  TIMELINE                                                                   */
/* -------------------------------------------------------------------------- */

const Timeline = ({ currentStage, isCancelled }) => {
  const anims = useRef(TRACKING_STAGES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    TRACKING_STAGES.forEach((_, i) => {
      if (i <= currentStage) {
        Animated.timing(anims[i], {
          toValue: 1,
          duration: 500,
          delay: i * 150,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [currentStage]);

  if (isCancelled) {
    return (
      <View style={styles.cancelledWrap}>
        <Ionicons name="close-circle" size={48} color="#D32F2F" />
        <Text style={styles.cancelledText}>Order Cancelled</Text>
      </View>
    );
  }

  return (
    <View style={styles.timeline}>
      {TRACKING_STAGES.map((stage, i) => {
        const reached = i <= currentStage;
        const active = i === currentStage;
        const scaleAnim = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 1],
        });

        return (
          <View key={stage.key} style={styles.timelineRow}>
            {/* Connector */}
            {i > 0 && (
              <View style={styles.connectorWrap}>
                <View
                  style={[
                    styles.connector,
                    reached && { backgroundColor: stage.color },
                  ]}
                />
              </View>
            )}

            {/* Node */}
            <View style={styles.timelineNodeRow}>
              <Animated.View
                style={[
                  styles.timelineNode,
                  reached && { backgroundColor: stage.color, borderColor: stage.color },
                  active && styles.timelineNodeActive,
                  { transform: [{ scale: scaleAnim }] },
                ]}
              >
                {reached ? (
                  stage.mcIcon ? (
                    <MaterialCommunityIcons name={stage.mcIcon} size={16} color="#fff" />
                  ) : (
                    <Ionicons name={stage.icon || 'ellipse'} size={16} color="#fff" />
                  )
                ) : (
                  <View style={styles.timelineNodeEmpty} />
                )}
              </Animated.View>

              <View style={styles.timelineLabel}>
                <Text
                  style={[
                    styles.timelineLabelText,
                    reached && { color: '#212121', fontWeight: '600' },
                    active && { fontWeight: '700', color: stage.color },
                  ]}
                >
                  {stage.emoji} {stage.label}
                </Text>
                {active && (
                  <Text style={[styles.timelineSubText, { color: stage.color }]}>
                    Current status
                  </Text>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  INFO CARD                                                                  */
/* -------------------------------------------------------------------------- */

const InfoCard = ({ title, icon, mcIcon, color, data, onPress }) => (
  <TouchableOpacity
    style={styles.infoCard}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <View style={styles.infoCardHeader}>
      <View style={[styles.infoCardIcon, { backgroundColor: color + '18' }]}>
        {mcIcon ? (
          <MaterialCommunityIcons name={mcIcon} size={20} color={color} />
        ) : (
          <Ionicons name={icon} size={20} color={color} />
        )}
      </View>
      <Text style={styles.infoCardTitle}>{title}</Text>
      {onPress && <Ionicons name="chevron-forward" size={18} color="#BDBDBD" />}
    </View>
    <View style={styles.infoCardBody}>
      {data.map((row, i) =>
        row.value ? (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoLabel}>{row.label}</Text>
            <Text style={styles.infoValue} numberOfLines={2}>
              {row.value}
            </Text>
          </View>
        ) : null,
      )}
    </View>
  </TouchableOpacity>
);

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const AdminOrderTracking = ({ route, navigation }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order: initialOrder } = route.params || {};

  const [order, setOrder] = useState(initialOrder || null);
  const [loading, setLoading] = useState(!initialOrder);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const refreshInterval = useRef(null);

  /* fetch -------------------------------------------------------------- */
  const fetchOrder = useCallback(
    async (silent = false) => {
      if (!orderId && !initialOrder?.id) return;
      if (!silent) setLoading(true);
      try {
        const data = await getOrderById(orderId || initialOrder?.id);
        setOrder(data?.data || data);
        setError(null);
      } catch (e) {
        if (!silent) setError(e.message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orderId, initialOrder],
  );

  useEffect(() => {
    fetchOrder();
    // Auto-refresh every 40s
    refreshInterval.current = setInterval(() => fetchOrder(true), 40000);
    return () => clearInterval(refreshInterval.current);
  }, [fetchOrder]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrder(true);
  };

  /* derived state ----------------------------------------------------- */
  const status = (order?.status || 'pending').toLowerCase().replace(/\s+/g, '_');
  const isCancelled = status === 'cancelled';
  const stageIndex = getStageIndex(status);
  const progress = isCancelled ? 0 : stageIndex / (TRACKING_STAGES.length - 1);

  const items = order?.items || order?.order_items || [];
  const firstItem = items[0];

  /* loading ------------------------------------------------------------ */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Tracking</Text>
        </LinearGradient>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#388E3C" />
          <Text style={styles.loaderText}>Loading order…</Text>
        </View>
      </View>
    );
  }

  /* error -------------------------------------------------------------- */
  if (error && !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.headerBar}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Tracking</Text>
        </LinearGradient>
        <View style={styles.loaderWrap}>
          <Ionicons name="alert-circle-outline" size={48} color="#D32F2F" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchOrder()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ==================================================================== */
  /*  RENDER                                                               */
  /* ==================================================================== */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Order Tracking</Text>
          <Text style={styles.headerSub}>#{order?.id || order?.order_id || orderId}</Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Vehicle Animation */}
        {!isCancelled && (
          <View style={styles.vehicleSection}>
            <AnimatedVehicle progress={progress} />
          </View>
        )}

        {/* Timeline */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Tracking Status</Text>
          <Timeline currentStage={stageIndex} isCancelled={isCancelled} />
        </View>

        {/* Order Summary */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Order Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Order ID</Text>
            <Text style={styles.summaryValue}>#{order?.id || order?.order_id}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Date</Text>
            <Text style={styles.summaryValue}>
              {formatDate(order?.created_at || order?.order_date)}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={[styles.summaryValue, { color: '#1B5E20', fontWeight: '700' }]}>
              {formatCurrency(order?.total_amount || order?.total || order?.grand_total || 0)}
            </Text>
          </View>
          {order?.payment_method && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Payment</Text>
              <Text style={styles.summaryValue}>{order.payment_method}</Text>
            </View>
          )}
          {order?.estimated_delivery && (
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Est. Delivery</Text>
              <Text style={styles.summaryValue}>{formatDate(order.estimated_delivery)}</Text>
            </View>
          )}
        </View>

        {/* Products */}
        {items.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Products ({items.length})</Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={styles.productRow}>
                  {img ? (
                    <Image
                      source={{ uri: optimizeImageUrl(img, { width: 100 }) }}
                      style={styles.productImg}
                    />
                  ) : (
                    <View style={[styles.productImg, styles.productImgPlaceholder]}>
                      <Ionicons name="image-outline" size={20} color="#bbb" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.productName}>
                      {item.product?.name || item.product_name || item.name || `Item ${idx + 1}`}
                    </Text>
                    <Text style={styles.productQty}>
                      Qty: {item.quantity || 1} × {formatCurrency(item.price || item.unit_price || 0)}
                    </Text>
                  </View>
                  <Text style={styles.productTotal}>
                    {formatCurrency((item.quantity || 1) * (item.price || item.unit_price || 0))}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Farmer Card */}
        {(order?.farmer || order?.farmer_name) && (
          <InfoCard
            title="Farmer"
            icon="leaf"
            color="#388E3C"
            data={[
              { label: 'Name', value: order.farmer?.full_name || order.farmer?.name || order.farmer_name },
              { label: 'Email', value: order.farmer?.email || order.farmer_email },
              { label: 'Phone', value: order.farmer?.phone || order.farmer_phone },
              { label: 'Farm', value: order.farmer?.farm_name },
              { label: 'Location', value: order.farmer?.location || order.farmer?.address || order.farmer?.farm_location },
            ]}
            onPress={() => {
              const farmerId = order.farmer?.id || order.farmer?.farmer_id || order.farmer_id;
              if (farmerId) navigation.navigate('FarmerDetails', { farmerId, farmer: order.farmer });
            }}
          />
        )}

        {/* Customer Card */}
        {(order?.customer || order?.customer_name || order?.user) && (
          <InfoCard
            title="Customer"
            icon="person"
            color="#1976D2"
            data={[
              { label: 'Name', value: order.customer?.full_name || order.customer?.name || order.customer_name || order.user?.full_name },
              { label: 'Email', value: order.customer?.email || order.customer_email || order.user?.email },
              { label: 'Phone', value: order.customer?.phone || order.customer_phone || order.user?.phone },
              {
                label: 'Address',
                value: typeof order.delivery_address === 'string'
                  ? order.delivery_address
                  : order.delivery_address
                    ? [order.delivery_address.street, order.delivery_address.city, order.delivery_address.state].filter(Boolean).join(', ')
                    : order.customer?.address,
              },
            ]}
            onPress={() => {
              const customerId = order.customer?.id || order.customer?.customer_id || order.customer_id || order.user?.id;
              if (customerId) navigation.navigate('CustomerDetails', { customerId, customer: order.customer || order.user });
            }}
          />
        )}

        {/* Transporter Card */}
        {(order?.transporter || order?.transporter_name) && (
          <InfoCard
            title="Transporter"
            mcIcon="truck"
            color="#F57C00"
            data={[
              { label: 'Name', value: order.transporter?.full_name || order.transporter?.name || order.transporter_name },
              { label: 'Company', value: order.transporter?.company_name },
              { label: 'Phone', value: order.transporter?.phone },
              { label: 'Vehicle', value: order.transporter?.vehicle_type },
            ]}
            onPress={() => {
              const transporterId = order.transporter?.id || order.transporter?.transporter_id || order.transporter_id;
              if (transporterId) navigation.navigate('TransporterDetails', { transporterId, transporter: order.transporter });
            }}
          />
        )}

        {/* Delivery Person Card */}
        {(order?.delivery_person || order?.delivery_person_name) && (
          <InfoCard
            title="Delivery Person"
            icon="bicycle"
            color="#00BCD4"
            data={[
              { label: 'Name', value: order.delivery_person?.full_name || order.delivery_person?.name || order.delivery_person_name },
              { label: 'Phone', value: order.delivery_person?.phone },
              { label: 'Email', value: order.delivery_person?.email },
            ]}
            onPress={() => {
              const dpId = order.delivery_person?.id || order.delivery_person?.delivery_person_id || order.delivery_person_id;
              if (dpId) navigation.navigate('DeliveryPersonDetails', { deliveryPersonId: dpId, deliveryPerson: order.delivery_person });
            }}
          />
        )}
      </ScrollView>
    </View>
  );
};

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },

  /* Header */
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { marginRight: 12, padding: 4 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 1 },

  /* Loader */
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loaderText: { fontSize: 14, color: '#757575', marginTop: 12 },
  errorText: { fontSize: 14, color: '#D32F2F', marginTop: 12, textAlign: 'center', paddingHorizontal: 30 },
  retryBtn: { marginTop: 16, backgroundColor: '#388E3C', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryBtnText: { color: '#fff', fontWeight: '600' },

  /* Vehicle track */
  vehicleSection: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 8 },
  vehicleTrack: { height: 36, justifyContent: 'center' },
  vehicleLine: { position: 'absolute', left: 0, right: 0, height: 4, backgroundColor: '#E0E0E0', borderRadius: 2 },
  vehicleLineFill: { position: 'absolute', left: 0, height: 4, backgroundColor: '#4CAF50', borderRadius: 2 },
  vehicleIcon: { position: 'absolute', left: 0 },

  /* Timeline */
  timeline: { marginTop: 8 },
  timelineRow: {},
  connectorWrap: { paddingLeft: 17, height: 24 },
  connector: { width: 2, flex: 1, backgroundColor: '#E0E0E0', borderRadius: 1 },
  timelineNodeRow: { flexDirection: 'row', alignItems: 'center' },
  timelineNode: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E0E0',
    borderWidth: 2,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineNodeActive: {
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  timelineNodeEmpty: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  timelineLabel: { marginLeft: 12, flex: 1 },
  timelineLabelText: { fontSize: 14, color: '#9E9E9E' },
  timelineSubText: { fontSize: 11, marginTop: 1 },

  /* Cancelled */
  cancelledWrap: { alignItems: 'center', paddingVertical: 24 },
  cancelledText: { fontSize: 16, fontWeight: '800', color: '#D32F2F', marginTop: 8 },

  /* Card */
  card: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: '#212121', marginBottom: 10 },

  /* Summary */
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  summaryLabel: { fontSize: 13, color: '#757575' },
  summaryValue: { fontSize: 13, color: '#212121', fontWeight: '500', maxWidth: '60%', textAlign: 'right' },

  /* Products */
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  productImg: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#F4F8F4' },
  productImgPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: '600', color: '#212121' },
  productQty: { fontSize: 12, color: '#757575', marginTop: 2 },
  productTotal: { fontSize: 14, fontWeight: '800', color: '#1B5E20' },

  /* Info Card */
  infoCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  infoCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  infoCardIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  infoCardTitle: { fontSize: 15, fontWeight: '800', color: '#212121', flex: 1, marginLeft: 10 },
  infoCardBody: {},
  infoRow: { flexDirection: 'row', paddingVertical: 3 },
  infoLabel: { fontSize: 12, color: '#9E9E9E', width: 70 },
  infoValue: { fontSize: 13, color: '#424242', flex: 1 },
});

export default AdminOrderTracking;
