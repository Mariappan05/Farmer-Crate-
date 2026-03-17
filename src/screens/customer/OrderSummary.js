/**
 * OrderSummary.js
 * Detailed order view — faithful conversion of Flutter order_summary_page.dart
 *
 * Receives: { orderId } or { order }
 * Features:
 *   - Fetches order from GET /api/orders/{orderId}
 *   - Order details: ID, date, status badge
 *   - Items list with images, name, quantity, price
 *   - Price breakdown: subtotal, admin commission, delivery charges, total
 *   - Delivery address display
 *   - Payment method
 *   - QR code display
 *   - Farmer info for each item
 *   - Order timeline
 *   - Track Order / Back to Order History buttons
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';

import api from '../../services/api';
import { getOrderById } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* ═══════════════════════════════════════════════════════════════════════════
 * HELPERS
 * ═══════════════════════════════════════════════════════════════════════════ */

const STATUS_CONFIG = {
  pending: { color: '#FF9800', bg: '#FFF3E0', icon: 'time-outline', label: 'Pending' },
  confirmed: { color: '#2196F3', bg: '#E3F2FD', icon: 'checkmark-circle-outline', label: 'Confirmed' },
  processing: { color: '#9C27B0', bg: '#F3E5F5', icon: 'cog-outline', label: 'Processing' },
  shipped: { color: '#3F51B5', bg: '#E8EAF6', icon: 'airplane-outline', label: 'Shipped' },
  out_for_delivery: { color: '#00BCD4', bg: '#E0F7FA', icon: 'bicycle-outline', label: 'Out for Delivery' },
  delivered: { color: '#4CAF50', bg: '#E8F5E9', icon: 'checkmark-done-circle-outline', label: 'Delivered' },
  cancelled: { color: '#F44336', bg: '#FFEBEE', icon: 'close-circle-outline', label: 'Cancelled' },
};

const getStatusConfig = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return STATUS_CONFIG[key] || STATUS_CONFIG.pending;
};

const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateTime = (dateStr) => {
  if (!dateStr) return 'N/A';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const getProductImage = (item) => {
  if (item.image_url) return item.image_url;
  if (item.product_image) return item.product_image;
  if (Array.isArray(item.images) && item.images.length > 0) {
    const primary = item.images.find((img) => img?.is_primary) || item.images[0];
    return typeof primary === 'string' ? primary : primary?.image_url || primary?.url || null;
  }
  return null;
};

/* ═══════════════════════════════════════════════════════════════════════════
 * TIMELINE COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const TIMELINE_STEPS = [
  { key: 'pending', label: 'Order Placed', icon: 'receipt-outline' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  { key: 'processing', label: 'Processing', icon: 'cog-outline' },
  { key: 'shipped', label: 'Shipped', icon: 'airplane-outline' },
  { key: 'out_for_delivery', label: 'Out for Delivery', icon: 'bicycle-outline' },
  { key: 'delivered', label: 'Delivered', icon: 'checkmark-done-circle-outline' },
];

const OrderTimeline = ({ currentStatus, timestamps }) => {
  const normalizedStatus = (currentStatus || 'pending').toLowerCase().replace(/\s+/g, '_');
  const isCancelled = normalizedStatus === 'cancelled';
  const currentIndex = TIMELINE_STEPS.findIndex((s) => s.key === normalizedStatus);

  return (
    <View style={tlStyles.container}>
      {TIMELINE_STEPS.map((step, index) => {
        const isCompleted = !isCancelled && index <= currentIndex;
        const isCurrent = !isCancelled && index === currentIndex;
        const isLast = index === TIMELINE_STEPS.length - 1;
        const timestamp = timestamps?.[step.key];

        return (
          <View key={step.key} style={tlStyles.stepRow}>
            {/* Line + Dot */}
            <View style={tlStyles.lineContainer}>
              <View style={[
                tlStyles.dot,
                isCompleted && tlStyles.dotCompleted,
                isCurrent && tlStyles.dotCurrent,
              ]}>
                <Ionicons
                  name={step.icon}
                  size={14}
                  color={isCompleted ? '#fff' : '#ccc'}
                />
              </View>
              {!isLast && (
                <View style={[tlStyles.line, isCompleted && index < currentIndex && tlStyles.lineCompleted]} />
              )}
            </View>

            {/* Label */}
            <View style={tlStyles.labelContainer}>
              <Text style={[tlStyles.label, isCompleted && tlStyles.labelCompleted, isCurrent && tlStyles.labelCurrent]}>
                {step.label}
              </Text>
              {timestamp && (
                <Text style={tlStyles.timestamp}>{formatDateTime(timestamp)}</Text>
              )}
            </View>
          </View>
        );
      })}

      {isCancelled && (
        <View style={tlStyles.cancelledBadge}>
          <Ionicons name="close-circle" size={18} color="#F44336" />
          <Text style={tlStyles.cancelledText}>Order Cancelled</Text>
        </View>
      )}
    </View>
  );
};

const tlStyles = StyleSheet.create({
  container: { paddingVertical: 4 },
  stepRow: { flexDirection: 'row', minHeight: 52 },
  lineContainer: { width: 36, alignItems: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#e0e0e0' },
  dotCompleted: { backgroundColor: '#1B5E20', borderColor: '#1B5E20' },
  dotCurrent: { backgroundColor: '#1B5E20', borderColor: '#A5D6A7', borderWidth: 3 },
  line: { width: 2, flex: 1, backgroundColor: '#e0e0e0', minHeight: 20 },
  lineCompleted: { backgroundColor: '#1B5E20' },
  labelContainer: { flex: 1, paddingLeft: 12, paddingBottom: 12 },
  label: { fontSize: 13, color: '#aaa', fontWeight: '500' },
  labelCompleted: { color: '#333' },
  labelCurrent: { color: '#1B5E20', fontWeight: 'bold' },
  timestamp: { fontSize: 11, color: '#999', marginTop: 2 },
  cancelledBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FFEBEE', borderRadius: 8, padding: 10, marginTop: 8 },
  cancelledText: { fontSize: 13, color: '#F44336', fontWeight: '600' },
});

/* ═══════════════════════════════════════════════════════════════════════════
 * MAIN COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════ */

const OrderSummary = ({ navigation, route }) => {
  const { orderId: paramOrderId, order: paramOrder } = route.params || {};
  const insets = useSafeAreaInsets();

  const [order, setOrder] = useState(paramOrder || null);
  const [isLoading, setIsLoading] = useState(!paramOrder);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // ── Animation ──
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [order]);

  // ── Fetch order ──
  const fetchOrder = useCallback(async (showLoading = true) => {
    const id = paramOrderId || paramOrder?.order_id || paramOrder?.id;
    if (!id) return;

    if (showLoading) setIsLoading(true);
    setError(null);

    try {
      const data = await getOrderById(id);
      setOrder(data?.data || data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load order details.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [paramOrderId, paramOrder]);

  useEffect(() => {
    if (!paramOrder) fetchOrder();
  }, []);

  const onRefresh = () => {
    setIsRefreshing(true);
    fetchOrder(false);
  };

  // ── Derived data ──
  const orderId = order?.order_id || order?.id || paramOrderId || 'N/A';
  const status = order?.status || 'pending';
  const statusCfg = getStatusConfig(status);
  const items = order?.items || order?.order_items || [];
  const subtotal = parseFloat(order?.subtotal || order?.total_amount || items.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0)) || 0;
  const adminCommission = parseFloat(order?.admin_commission || 0) || 0;
  const deliveryCharges = parseFloat(order?.delivery_charges || order?.delivery_fee || 0) || 0;
  const totalAmount = parseFloat(order?.total_amount || order?.total_price || (subtotal + adminCommission + deliveryCharges)) || 0;
  const paymentMethod = order?.payment_method || 'N/A';
  const qrCode = order?.qr_code || '';
  const createdAt = order?.created_at || order?.createdAt || order?.order_date;
  const timeline = order?.timeline || order?.status_history || null;

  // Delivery address
  const deliveryAddr = order?.delivery_address;
  let addressLines = [];
  if (typeof deliveryAddr === 'string') {
    addressLines = [deliveryAddr];
  } else if (deliveryAddr) {
    if (deliveryAddr.full_name) addressLines.push(deliveryAddr.full_name);
    if (deliveryAddr.phone) addressLines.push(`Phone: ${deliveryAddr.phone}`);
    if (deliveryAddr.address_line) addressLines.push(deliveryAddr.address_line);
    const cityLine = [deliveryAddr.city, deliveryAddr.district].filter(Boolean).join(', ');
    if (cityLine) addressLines.push(cityLine);
    const stateLine = [deliveryAddr.state, deliveryAddr.pincode].filter(Boolean).join(' - ');
    if (stateLine) addressLines.push(stateLine);
    if (deliveryAddr.zone) addressLines.push(`Zone: ${deliveryAddr.zone}`);
  }

  /* ─── LOADING STATE ─── */
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Loading order details...</Text>
        </View>
      </View>
    );
  }

  /* ─── ERROR STATE ─── */
  if (error && !order) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={60} color="#ccc" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => fetchOrder()}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ─── MAIN RENDER ─── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Order Details</Text>
          {(() => {
            const items = order?.items || order?.order_items || [];
            const names = items.map((item) =>
              item.name || item.product_name || item.product?.name || `Product #${item.product_id || item.id || ''}`
            ).filter(Boolean);
            return names.length > 0
              ? <Text style={styles.headerSubtitle} numberOfLines={1}>{names.join(', ')}</Text>
              : order?.product_name
                ? <Text style={styles.headerSubtitle} numberOfLines={1}>{order.product_name}</Text>
                : null;
          })()}
        </View>
        <TouchableOpacity onPress={onRefresh} style={{ padding: 4 }}>
          <Ionicons name="refresh-outline" size={22} color="#A5D6A7" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} colors={['#1B5E20']} />}
      >
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Status Card ── */}
          <View style={[styles.statusCard, { backgroundColor: statusCfg.bg }]}>
            <View style={[styles.statusIconCircle, { backgroundColor: statusCfg.color }]}>
              <Ionicons name={statusCfg.icon} size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              {(() => {
                const names = items.map((item) =>
                  item.name || item.product_name || item.product?.name || `Product #${item.product_id || item.id || ''}`
                ).filter(Boolean);
                return names.length > 0
                  ? <Text style={styles.statusOrderId} numberOfLines={2}>{names.join(', ')}</Text>
                  : order?.product_name
                    ? <Text style={styles.statusOrderId} numberOfLines={2}>{order.product_name}</Text>
                    : <Text style={styles.statusOrderId}>Your Order</Text>;
              })()}
              <Text style={[styles.statusLabel, { color: statusCfg.color }]}>{statusCfg.label}</Text>
              {createdAt && <Text style={styles.statusDate}>Placed on {formatDate(createdAt)}</Text>}
            </View>
            {status !== 'delivered' && status !== 'cancelled' && (
              <TouchableOpacity
                style={[styles.trackChip, { backgroundColor: statusCfg.color }]}
                onPress={() => navigation.navigate('CustomerOrderTracking', { order })}
              >
                <Ionicons name="navigate-outline" size={14} color="#fff" />
                <Text style={styles.trackChipText}>Track</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Items Ordered Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="bag-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Items Ordered ({items.length})</Text>
            </View>

            {items.length === 0 ? (
              <Text style={styles.emptyText}>No item details available</Text>
            ) : (
              items.map((item, i) => {
                const imageUrl = getProductImage(item);
                const farmerName = item.farmer_name || item.farmer?.name || item.farmer?.full_name || null;

                return (
                  <View key={i} style={styles.itemRow}>
                    {/* Product Image */}
                    <View style={styles.itemImageContainer}>
                      {imageUrl ? (
                        <Image
                          source={{ uri: optimizeImageUrl(imageUrl, { width: 120 }) }}
                          style={styles.itemImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.itemImagePlaceholder}>
                          <Ionicons name="leaf-outline" size={22} color="#aaa" />
                        </View>
                      )}
                    </View>

                    {/* Item Details */}
                    <View style={styles.itemDetails}>
                      <Text style={styles.itemName} numberOfLines={2}>
                        {item.product_name || item.name || 'Product'}
                      </Text>
                      {farmerName && (
                        <View style={styles.farmerRow}>
                          <Ionicons name="person-outline" size={12} color="#888" />
                          <Text style={styles.farmerName}>{farmerName}</Text>
                        </View>
                      )}
                      <View style={styles.itemMetaRow}>
                        <Text style={styles.itemQty}>Qty: {item.quantity || 1}</Text>
                        <Text style={styles.itemPrice}>
                          ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                        </Text>
                      </View>
                      {item.unit && (
                        <Text style={styles.itemUnit}>₹{item.price}/{item.unit}</Text>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* ── Price Breakdown Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="calculator-variant-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Price Breakdown</Text>
            </View>

            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Subtotal</Text>
              <Text style={styles.priceValue}>₹{subtotal.toFixed(2)}</Text>
            </View>
            {adminCommission > 0 && (
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Admin Commission</Text>
                <Text style={styles.priceValue}>₹{adminCommission.toFixed(2)}</Text>
              </View>
            )}
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Delivery Charges</Text>
              <Text style={styles.priceValue}>
                {deliveryCharges === 0 ? 'FREE' : `₹${deliveryCharges.toFixed(2)}`}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.priceRow}>
              <Text style={styles.priceTotalLabel}>Total Amount</Text>
              <Text style={styles.priceTotalValue}>₹{totalAmount.toFixed(2)}</Text>
            </View>
          </View>

          {/* ── Delivery Address Card ── */}
          {addressLines.length > 0 && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Ionicons name="location-outline" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Delivery Address</Text>
              </View>
              {addressLines.map((line, i) => (
                <Text key={i} style={[styles.addressLine, i === 0 && { fontWeight: '600', color: '#333' }]}>
                  {line}
                </Text>
              ))}
            </View>
          )}

          {/* ── Payment Info Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="card-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Payment Information</Text>
            </View>
            <View style={styles.paymentRow}>
              <View style={styles.paymentIconCircle}>
                <MaterialCommunityIcons
                  name={paymentMethod === 'COD' || paymentMethod === 'cod' ? 'cash-multiple' : 'credit-card-outline'}
                  size={20}
                  color="#1B5E20"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.paymentMethod}>
                  {paymentMethod === 'COD' || paymentMethod === 'cod' ? 'Cash on Delivery' : paymentMethod === 'ONLINE' || paymentMethod === 'online' ? 'Online Payment' : paymentMethod}
                </Text>
                <Text style={styles.paymentStatus}>
                  {status === 'delivered' ? 'Paid' : paymentMethod === 'COD' || paymentMethod === 'cod' ? 'Pay on delivery' : 'Payment processed'}
                </Text>
              </View>
              <Text style={styles.paymentAmount}>₹{totalAmount.toFixed(2)}</Text>
            </View>
          </View>

          {/* ── QR Code Card ── */}
          {qrCode ? (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons name="qrcode" size={20} color="#1B5E20" />
                <Text style={styles.cardTitle}>Order QR Code</Text>
              </View>
              <View style={styles.qrContainer}>
                <QRCode
                  value={JSON.stringify({ qr_code: qrCode, order_id: orderId, total: totalAmount })}
                  size={150}
                  color="#1B5E20"
                  backgroundColor="#fff"
                />
                <Text style={styles.qrCodeText}>{qrCode}</Text>
                <Text style={styles.qrHint}>Show this QR code to verify delivery</Text>
              </View>
            </View>
          ) : null}

          {/* ── Order Timeline Card ── */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="git-branch-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Order Timeline</Text>
            </View>
            <OrderTimeline currentStatus={status} timestamps={timeline} />
          </View>

          {/* ── Action Buttons ── */}
          {status !== 'delivered' && status !== 'cancelled' && (
            <TouchableOpacity
              style={styles.trackOrderBtn}
              onPress={() => navigation.navigate('CustomerOrderTracking', { order })}
              activeOpacity={0.85}
            >
              <Ionicons name="navigate-outline" size={20} color="#fff" />
              <Text style={styles.trackOrderBtnText}>Track Order</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={styles.backToOrdersBtn}
            onPress={() => navigation.navigate('CustomerTabs', { screen: 'Orders' })}
            activeOpacity={0.85}
          >
            <Ionicons name="list-outline" size={18} color="#1B5E20" />
            <Text style={styles.backToOrdersBtnText}>Back to Order History</Text>
          </TouchableOpacity>

        </Animated.View>
      </ScrollView>
    </View>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
 * STYLES
 * ═══════════════════════════════════════════════════════════════════════════ */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f8e9',
  },

  /* Header */
  header: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  headerSubtitle: { fontSize: 12, color: '#A5D6A7', marginTop: 2 },

  /* Loading / Error */
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 14, color: '#888', marginTop: 12 },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  errorText: { fontSize: 14, color: '#888', marginTop: 12, textAlign: 'center' },
  retryBtn: { backgroundColor: '#1B5E20', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12, marginTop: 16 },
  retryBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  /* Status card */
  statusCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusOrderId: { fontSize: 12, color: '#888' },
  statusLabel: { fontSize: 18, fontWeight: 'bold', marginTop: 2 },
  statusDate: { fontSize: 12, color: '#999', marginTop: 2 },
  trackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  trackChipText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  /* Cards */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1B5E20',
  },

  /* Items */
  emptyText: { fontSize: 13, color: '#aaa', fontStyle: 'italic' },
  itemRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    gap: 12,
  },
  itemImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F4F8F4',
  },
  itemImage: {
    width: 60,
    height: 60,
  },
  itemImagePlaceholder: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
  },
  itemDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  farmerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 3,
  },
  farmerName: {
    fontSize: 12,
    color: '#888',
  },
  itemMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  itemQty: {
    fontSize: 13,
    color: '#888',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1B5E20',
  },
  itemUnit: {
    fontSize: 11,
    color: '#aaa',
    marginTop: 1,
  },

  /* Price breakdown */
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  priceLabel: { fontSize: 13, color: '#666' },
  priceValue: { fontSize: 13, color: '#333', fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#e0e0e0', marginVertical: 8 },
  priceTotalLabel: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  priceTotalValue: { fontSize: 18, fontWeight: 'bold', color: '#1B5E20' },

  /* Address */
  addressLine: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
  },

  /* Payment info */
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  paymentIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paymentMethod: { fontSize: 14, fontWeight: '600', color: '#333' },
  paymentStatus: { fontSize: 12, color: '#888', marginTop: 2 },
  paymentAmount: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20' },

  /* QR */
  qrContainer: { alignItems: 'center', paddingVertical: 12 },
  qrCodeText: {
    fontSize: 15,
    color: '#1B5E20',
    fontWeight: 'bold',
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1,
  },
  qrHint: { fontSize: 12, color: '#999', marginTop: 6 },

  /* Action buttons */
  trackOrderBtn: {
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  trackOrderBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  backToOrdersBtn: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#1B5E20',
  },
  backToOrdersBtnText: { color: '#1B5E20', fontSize: 15, fontWeight: '600' },
});

export default OrderSummary;
