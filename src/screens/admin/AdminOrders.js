/**
 * AdminOrders.js
 * Admin orders management – conversion of Flutter admin_orders_page.dart (1422 lines)
 *
 * Features:
 *   - GET /api/orders/all for all orders
 *   - Status filter chips: All, Pending, Confirmed, Shipped, Delivered, Cancelled
 *   - Order card: order ID, date, status badge, product images, customer/farmer name, total
 *   - Transporter info (when assigned)
 *   - "Track Order" → AdminOrderTracking
 *   - Order detail modal
 *   - Pull to refresh, search
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Image,
  StatusBar,
  Dimensions,
  Modal,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* -------------------------------------------------------------------------- */
/*  CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const STATUS_FILTERS = [
  { key: 'all', label: 'All', color: '#424242' },
  { key: 'pending', label: 'Pending', color: '#FF9800' },
  { key: 'confirmed', label: 'Confirmed', color: '#2196F3' },
  { key: 'shipped', label: 'Shipped', color: '#3F51B5' },
  { key: 'delivered', label: 'Delivered', color: '#4CAF50' },
  { key: 'cancelled', label: 'Cancelled', color: '#F44336' },
];

const STATUS_COLORS = {
  pending: { bg: '#FFF3E0', text: '#E65100' },
  placed: { bg: '#FFF3E0', text: '#E65100' },
  confirmed: { bg: '#E3F2FD', text: '#1565C0' },
  processing: { bg: '#F3E5F5', text: '#7B1FA2' },
  assigned: { bg: '#F3E5F5', text: '#7B1FA2' },
  shipped: { bg: '#E8EAF6', text: '#283593' },
  out_for_delivery: { bg: '#E0F7FA', text: '#00695C' },
  delivered: { bg: '#E8F5E9', text: '#1B5E20' },
  cancelled: { bg: '#FFEBEE', text: '#C62828' },
};

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

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

const getStatusColor = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return STATUS_COLORS[key] || STATUS_COLORS.pending;
};

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

/* -------------------------------------------------------------------------- */
/*  SHIMMER                                                                    */
/* -------------------------------------------------------------------------- */

const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e0e0e0', '#f5f5f5'] });
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]} />;
};

/* -------------------------------------------------------------------------- */
/*  ORDER CARD                                                                 */
/* -------------------------------------------------------------------------- */

const OrderCard = ({ order, onTrack, onViewDetail }) => {
  const statusColor = getStatusColor(order.current_status || order.status);
  // Order has a single product (not items array) — backend returns order.product
  const items = order.items || order.order_items || (order.product ? [order.product] : []);
  const firstItem = items[0];
  const productImg = order.product ? getProductImage(order.product) : (firstItem ? getProductImage(firstItem) : null);

  return (
    <TouchableOpacity style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor.text }]} onPress={onViewDetail} activeOpacity={0.7}>
      {/* Top Row: Product name + Status */}
      <View style={styles.orderCardTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderId} numberOfLines={1}>
            {order.product?.name || order.product_name || firstItem?.name || firstItem?.product?.name || 'Order'}
          </Text>
          <Text style={styles.orderDate}>
            {formatDate(order.created_at || order.order_date || order.date)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor.text }]}>
            {(order.current_status || order.status || 'pending').replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Product Images Row */}
      {items.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.productImagesRow}
        >
          {items.slice(0, 5).map((item, idx) => {
            const img = getProductImage(item);
            return (
              <View key={idx} style={styles.productThumb}>
                {img ? (
                  <Image
                    source={{ uri: optimizeImageUrl(img, { width: 100 }) }}
                    style={styles.productThumbImg}
                  />
                ) : (
                  <View style={[styles.productThumbImg, styles.productThumbPlaceholder]}>
                    <Ionicons name="image-outline" size={18} color="#bbb" />
                  </View>
                )}
                <Text style={styles.productThumbName} numberOfLines={1}>
                  {item.product?.name || item.product_name || item.name || `Item ${idx + 1}`}
                </Text>
                {(item.category || item.category_name || item.product?.category || item.product?.category_name) ? (
                  <Text style={styles.productThumbCategory} numberOfLines={1}>
                    {item.category || item.category_name || item.product?.category || item.product?.category_name}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {items.length > 5 && (
            <View style={[styles.productThumb, { justifyContent: 'center' }]}>
              <Text style={styles.moreItems}>+{items.length - 5}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Info rows */}
      <View style={styles.orderInfoRows}>
        <View style={styles.orderInfoRow}>
          <Ionicons name="person-outline" size={14} color="#757575" />
          <Text style={styles.orderInfoLabel}>Customer:</Text>
          <Text style={styles.orderInfoValue} numberOfLines={1}>
            {order.customer_name ||
              order.customer?.full_name ||
              order.customer?.name ||
              order.user?.full_name ||
              'N/A'}
          </Text>
        </View>
        <View style={styles.orderInfoRow}>
          <Ionicons name="leaf-outline" size={14} color="#757575" />
          <Text style={styles.orderInfoLabel}>Farmer:</Text>
          <Text style={styles.orderInfoValue} numberOfLines={1}>
            {order.farmer_name ||
              order.farmer?.full_name ||
              order.farmer?.name ||
              order.product?.farmer?.name ||
              firstItem?.product?.farmer_name ||
              'N/A'}
          </Text>
        </View>
        {(order.transporter_name || order.transporter) && (
          <View style={styles.orderInfoRow}>
            <MaterialCommunityIcons name="truck" size={14} color="#757575" />
            <Text style={styles.orderInfoLabel}>Transporter:</Text>
            <Text style={styles.orderInfoValue} numberOfLines={1}>
              {order.transporter_name ||
                order.transporter?.full_name ||
                order.transporter?.name ||
                order.transporter?.company_name ||
                'Assigned'}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.orderCardFooter}>
        <Text style={styles.orderTotal}>
          {formatCurrency(order.total_price || order.total_amount || order.total || 0)}
        </Text>
        <TouchableOpacity style={styles.trackBtn} onPress={onTrack} activeOpacity={0.7}>
          <Ionicons name="navigate-outline" size={16} color="#fff" />
          <Text style={styles.trackBtnText}>Track</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

/* -------------------------------------------------------------------------- */
/*  ORDER DETAIL MODAL                                                         */
/* -------------------------------------------------------------------------- */

const OrderDetailModal = ({ visible, order, onClose }) => {
  if (!order) return null;
  const items = order.items || order.order_items || (order.product ? [order.product] : []);
  const statusColor = getStatusColor(order.current_status || order.status);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Order Details
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#424242" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Status */}
            <View style={[styles.modalStatusBadge, { backgroundColor: statusColor.bg, alignSelf: 'flex-start' }]}>
              <Text style={[styles.modalStatusText, { color: statusColor.text }]}>
                {(order.current_status || order.status || 'pending').replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>

            {/* Date */}
            <Text style={styles.modalLabel}>Placed on</Text>
            <Text style={styles.modalValue}>
              {formatDate(order.created_at || order.order_date)}
            </Text>

            {/* Customer */}
            <Text style={styles.modalLabel}>Customer</Text>
            <Text style={styles.modalValue}>
              {order.customer_name || order.customer?.full_name || order.user?.full_name || 'N/A'}
            </Text>
            {(order.customer?.email || order.customer_email) && (
              <Text style={styles.modalSub}>
                {order.customer?.email || order.customer_email}
              </Text>
            )}

            {/* Farmer */}
            <Text style={styles.modalLabel}>Farmer</Text>
            <Text style={styles.modalValue}>
              {order.farmer_name || order.farmer?.full_name || order.product?.farmer?.name || 'N/A'}
            </Text>
            {(order.farmer?.email || order.farmer_email) && (
              <Text style={styles.modalSub}>
                {order.farmer?.email || order.farmer_email}
              </Text>
            )}

            {/* Transporter */}
            {(order.transporter || order.transporter_name) && (
              <>
                <Text style={styles.modalLabel}>Transporter</Text>
                <Text style={styles.modalValue}>
                  {order.transporter_name ||
                    order.transporter?.full_name ||
                    order.transporter?.company_name ||
                    'Assigned'}
                </Text>
              </>
            )}

            {/* Delivery Person */}
            {(order.delivery_person || order.delivery_person_name) && (
              <>
                <Text style={styles.modalLabel}>Delivery Person</Text>
                <Text style={styles.modalValue}>
                  {order.delivery_person_name ||
                    order.delivery_person?.full_name ||
                    'Assigned'}
                </Text>
              </>
            )}

            {/* Delivery Address */}
            {(order.delivery_address || order.shipping_address) && (
              <>
                <Text style={styles.modalLabel}>Delivery Address</Text>
                <Text style={styles.modalValue}>
                  {typeof (order.delivery_address || order.shipping_address) === 'string'
                    ? order.delivery_address || order.shipping_address
                    : [
                        order.delivery_address?.street,
                        order.delivery_address?.city,
                        order.delivery_address?.state,
                        order.delivery_address?.pincode,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                </Text>
              </>
            )}

            {/* Items */}
            <Text style={[styles.modalLabel, { marginTop: 12 }]}>
              Items ({items.length})
            </Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={styles.modalItemRow}>
                  {img ? (
                    <Image
                      source={{ uri: optimizeImageUrl(img, { width: 80 }) }}
                      style={styles.modalItemImg}
                    />
                  ) : (
                    <View style={[styles.modalItemImg, styles.productThumbPlaceholder]}>
                      <Ionicons name="image-outline" size={16} color="#bbb" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.modalItemName}>
                      {item.product?.name || item.product_name || item.name || `Item ${idx + 1}`}
                    </Text>
                    <Text style={styles.modalItemQty}>
                      Qty: {item.quantity || 1} × {formatCurrency(item.price || item.unit_price || 0)}
                    </Text>
                  </View>
                  <Text style={styles.modalItemTotal}>
                    {formatCurrency((item.quantity || 1) * (item.price || item.unit_price || 0))}
                  </Text>
                </View>
              );
            })}

            {/* Total */}
            <View style={styles.modalTotalRow}>
              <Text style={styles.modalTotalLabel}>Total</Text>
              <Text style={styles.modalTotalValue}>
                {formatCurrency(order.total_price || order.total_amount || order.total || 0)}
              </Text>
            </View>

            {/* Payment */}
            {(order.payment_method || order.payment_status) && (
              <View style={styles.modalPaymentRow}>
                {order.payment_method && (
                  <Text style={styles.modalSub}>
                    Payment: {order.payment_method}
                  </Text>
                )}
                {order.payment_status && (
                  <Text style={styles.modalSub}>
                    Status: {order.payment_status}
                  </Text>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const AdminOrders = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [detailOrder, setDetailOrder] = useState(null);
  const toastRef = useRef(null);

  /* fetch -------------------------------------------------------------- */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/orders/all');
      const list = Array.isArray(data) ? data : data?.data || data?.orders || [];
      setOrders(list);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load orders';
      if (!silent) toastRef.current?.show(msg, 'error');
      else toastRef.current?.show('Could not refresh orders', 'warning');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrders(true);
  };

  /* filtering ---------------------------------------------------------- */
  const filtered = orders.filter((o) => {
    // Status filter
    if (activeFilter !== 'all') {
      const orderStatus = (o.current_status || o.status || '').toLowerCase().replace(/\s+/g, '_');
      if (orderStatus !== activeFilter) return false;
    }
    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      const id = String(o.id || o.order_id || '').toLowerCase();
      const customer =
        (o.customer_name || o.customer?.full_name || o.user?.full_name || '').toLowerCase();
      const farmer =
        (o.farmer_name || o.farmer?.full_name || '').toLowerCase();
      return id.includes(q) || customer.includes(q) || farmer.includes(q);
    }
    return true;
  });

  /* render item -------------------------------------------------------- */
  const renderOrder = ({ item }) => (
    <OrderCard
      order={item}
      onTrack={() =>
        navigation.navigate('AdminOrderTracking', {
          orderId: item.id || item.order_id,
          order: item,
        })
      }
      onViewDetail={() => setDetailOrder(item)}
    />
  );

  /* loading skeleton */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
          <Text style={styles.headerTitle}>Orders</Text>
        </LinearGradient>
        <View style={{ padding: 16 }}>
          {[1, 2, 3, 4].map((i) => (
            <ShimmerBlock
              key={i}
              width={SCREEN_WIDTH - 32}
              height={160}
              style={{ marginBottom: 12 }}
            />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
        <Text style={styles.headerTitle}>Orders</Text>
        <Text style={styles.headerSub}>{orders.length} total orders</Text>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchIconWrap}>
          <Ionicons name="search" size={18} color="#388E3C" />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by ID, customer, farmer…"
          placeholderTextColor="#9E9E9E"
          value={search}
          onChangeText={setSearch}
          underlineColorAndroid="transparent"
          includeFontPadding={false}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <View style={styles.filterArea}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {STATUS_FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[
                  styles.filterChip,
                  active ? { backgroundColor: f.color, borderColor: f.color } : { borderColor: f.color + '80' },
                ]}
                onPress={() => setActiveFilter(f.key)}
                activeOpacity={0.7}
              >
                {active && <View style={[styles.filterDot, { backgroundColor: '#fff' }]} />}
                <Text style={[styles.filterChipText, active ? { color: '#fff' } : { color: f.color }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item, idx) =>
          String(item.id || item.order_id || idx)
        }
        renderItem={renderOrder}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#1B5E20']}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="receipt-outline" size={56} color="#C8E6C9" />
            <Text style={styles.emptyTitle}>No orders found</Text>
            <Text style={styles.emptySubtitle}>
              {search.trim()
                ? 'Try a different search term'
                : activeFilter !== 'all'
                  ? 'No orders with this status'
                  : 'Orders will appear here'}
            </Text>
          </View>
        }
      />

      {/* Detail Modal */}
      <OrderDetailModal
        visible={!!detailOrder}
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 52,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  searchIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#212121', height: 40, includeFontPadding: false },

  /* Filters */
  filterArea: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    marginRight: 8,
    backgroundColor: '#fff',
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  filterDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  filterChipText: { fontSize: 13, fontWeight: '700', color: '#424242' },

  /* Order Card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  orderCardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#212121' },
  orderDate: { fontSize: 12, color: '#9E9E9E', marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  /* Product images */
  productImagesRow: { marginBottom: 8 },
  productThumb: { marginRight: 10, alignItems: 'center', width: 60 },
  productThumbImg: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#f5f5f5' },
  productThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  productThumbName: { fontSize: 10, color: '#757575', marginTop: 3, textAlign: 'center' },
  productThumbCategory: { fontSize: 9, color: '#9E9E9E', marginTop: 1, textAlign: 'center', fontStyle: 'italic' },
  moreItems: { fontSize: 14, fontWeight: '700', color: '#757575' },

  /* Info rows */
  orderInfoRows: { marginBottom: 8 },
  orderInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  orderInfoLabel: { fontSize: 12, color: '#9E9E9E', marginLeft: 5, marginRight: 4 },
  orderInfoValue: { fontSize: 13, color: '#424242', fontWeight: '500', flex: 1 },

  /* Footer */
  orderCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
  },
  orderTotal: { fontSize: 17, fontWeight: '700', color: '#1B5E20' },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#388E3C',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
  },
  trackBtnText: { color: '#fff', fontWeight: '600', fontSize: 13, marginLeft: 4 },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  modalStatusBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, marginBottom: 12 },
  modalStatusText: { fontSize: 12, fontWeight: '700' },
  modalLabel: { fontSize: 12, color: '#9E9E9E', marginTop: 10, fontWeight: '600' },
  modalValue: { fontSize: 14, color: '#212121', fontWeight: '500', marginTop: 2 },
  modalSub: { fontSize: 12, color: '#757575', marginTop: 1 },
  modalItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalItemImg: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#f5f5f5' },
  modalItemName: { fontSize: 14, fontWeight: '600', color: '#212121' },
  modalItemQty: { fontSize: 12, color: '#757575', marginTop: 2 },
  modalItemTotal: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  modalTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#E0E0E0',
  },
  modalTotalLabel: { fontSize: 16, fontWeight: '700', color: '#212121' },
  modalTotalValue: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  modalPaymentRow: { marginTop: 8 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#424242', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#9E9E9E', marginTop: 4, textAlign: 'center' },
});

export default AdminOrders;
