/**
 * OrderHistory.js
 * Customer order history - full conversion of Flutter order_history.dart (967 lines)
 *
 * Features:
 *   - GET /api/customer/orders
 *   - Status filter chips: All, Pending, Confirmed, Shipped, Delivered, Cancelled
 *   - Order cards: ID, date, status badge (color-coded), product images, item count, total
 *   - Transporter card with name, vehicle, phone
 *   - Delivery person card with name, phone
 *   - Expandable order detail dialog
 *   - Tap order -> OrderSummary; Track Order -> CustomerOrderTracking
 *   - Pull to refresh, loading & empty states
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';
import { getCustomerOrders } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * CONSTANTS
 * ------------------------------------------------------------------------ */

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'Shipped', 'Delivered', 'Cancelled'];

const STATUS_CONFIG = {
  pending:          { color: '#FF9800', bg: '#FFF3E0', icon: 'time-outline',                   label: 'Pending' },
  confirmed:        { color: '#2196F3', bg: '#E3F2FD', icon: 'checkmark-circle-outline',       label: 'Confirmed' },
  processing:       { color: '#9C27B0', bg: '#F3E5F5', icon: 'cog-outline',                    label: 'Processing' },
  shipped:          { color: '#3F51B5', bg: '#E8EAF6', icon: 'airplane-outline',               label: 'Shipped' },
  out_for_delivery: { color: '#00BCD4', bg: '#E0F7FA', icon: 'bicycle-outline',                label: 'Out for Delivery' },
  delivered:        { color: '#4CAF50', bg: '#E8F5E9', icon: 'checkmark-done-circle-outline',  label: 'Delivered' },
  cancelled:        { color: '#F44336', bg: '#FFEBEE', icon: 'close-circle-outline',           label: 'Cancelled' },
};

const getStatusConfig = (status) => {
  const key = (status || 'pending').toLowerCase().replace(/\s+/g, '_');
  return STATUS_CONFIG[key] || STATUS_CONFIG.pending;
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

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatCurrency = (amount) => {
  const n = parseFloat(amount) || 0;
  return '\u20B9' + n.toFixed(2);
};

const getOrderTotal = (order) => {
  if (order.total_amount || order.total) return parseFloat(order.total_amount || order.total) || 0;
  const items = order.items || order.order_items || [];
  return items.reduce((sum, it) => sum + (parseFloat(it.total || it.subtotal || 0)), 0);
};

const getOrderItems = (order) => order.items || order.order_items || [];

/* --------------------------------------------------------------------------
 * SHIMMER
 * ------------------------------------------------------------------------ */

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

const OrderCardSkeleton = () => (
  <View style={styles.card}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
      <ShimmerBlock width={120} height={16} />
      <ShimmerBlock width={80} height={24} borderRadius={12} />
    </View>
    <ShimmerBlock width={150} height={12} style={{ marginBottom: 12 }} />
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <ShimmerBlock width={56} height={56} />
      <ShimmerBlock width={56} height={56} />
      <ShimmerBlock width={56} height={56} />
    </View>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
      <ShimmerBlock width={100} height={14} />
      <ShimmerBlock width={80} height={32} borderRadius={16} />
    </View>
  </View>
);

/* --------------------------------------------------------------------------
 * STATUS BADGE
 * ------------------------------------------------------------------------ */

const StatusBadge = ({ status }) => {
  const cfg = getStatusConfig(status);
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Ionicons name={cfg.icon} size={14} color={cfg.color} />
      <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
};

/* --------------------------------------------------------------------------
 * ORDER DETAIL MODAL
 * ------------------------------------------------------------------------ */

const OrderDetailModal = ({ visible, order, onClose, onTrack, onViewSummary }) => {
  if (!order) return null;
  const items = getOrderItems(order);
  const cfg = getStatusConfig(order.status);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Order Details</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 500 }}>
            {/* Order ID + Status */}
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Order ID</Text>
              <Text style={styles.modalValue}>#{order.order_id || order.id}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Status</Text>
              <StatusBadge status={order.status} />
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Date</Text>
              <Text style={styles.modalValue}>{formatDate(order.created_at || order.order_date)}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Total</Text>
              <Text style={[styles.modalValue, { color: '#1B5E20', fontWeight: '700' }]}>
                {formatCurrency(getOrderTotal(order))}
              </Text>
            </View>

            {/* Delivery Address */}
            {(order.delivery_address || order.shipping_address) && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Delivery</Text>
                <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]} numberOfLines={2}>
                  {order.delivery_address || order.shipping_address}
                </Text>
              </View>
            )}

            {/* Payment method */}
            {order.payment_method && (
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Payment</Text>
                <Text style={styles.modalValue}>{order.payment_method}</Text>
              </View>
            )}

            {/* Items */}
            <Text style={[styles.modalLabel, { marginTop: 16, marginBottom: 8, fontSize: 15, fontWeight: '600', color: '#333' }]}>
              Items ({items.length})
            </Text>
            {items.map((item, idx) => {
              const img = getProductImage(item);
              return (
                <View key={idx} style={styles.modalItem}>
                  {img ? (
                    <Image
                      source={{ uri: optimizeImageUrl(img, { width: 60, height: 60 }) }}
                      style={styles.modalItemImage}
                    />
                  ) : (
                    <View style={[styles.modalItemImage, styles.imagePlaceholder]}>
                      <Ionicons name="leaf-outline" size={20} color="#aaa" />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.modalItemName} numberOfLines={1}>
                      {item.product_name || item.product?.name || item.name || 'Product'}
                    </Text>
                    <Text style={styles.modalItemMeta}>
                      Qty: {item.quantity || 1}  {'\u2022'}  {formatCurrency(item.price || item.unit_price || 0)}
                    </Text>
                  </View>
                  <Text style={styles.modalItemTotal}>
                    {formatCurrency(item.total || item.subtotal || (item.price || 0) * (item.quantity || 1))}
                  </Text>
                </View>
              );
            })}

            {/* Transporter */}
            {order.transporter && (
              <View style={styles.infoCard}>
                <MaterialCommunityIcons name="truck-outline" size={20} color="#1B5E20" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.infoCardTitle}>Transporter</Text>
                  <Text style={styles.infoCardValue}>
                    {order.transporter.name || order.transporter.full_name || order.transporter.username || 'N/A'}
                  </Text>
                  {(order.transporter.vehicle_type || order.transporter.vehicle_number) && (
                    <Text style={styles.infoCardMeta}>
                      {'\uD83D\uDE9B'} {order.transporter.vehicle_type || ''} {order.transporter.vehicle_number ? (' \u2022 ' + order.transporter.vehicle_number) : ''}
                    </Text>
                  )}
                  {order.transporter.phone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.transporter.phone}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Delivery Person */}
            {order.delivery_person && (
              <View style={styles.infoCard}>
                <Ionicons name="bicycle-outline" size={20} color="#1B5E20" />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.infoCardTitle}>Delivery Person</Text>
                  <Text style={styles.infoCardValue}>
                    {order.delivery_person.name || order.delivery_person.full_name || order.delivery_person.username || 'N/A'}
                  </Text>
                  {order.delivery_person.phone && (
                    <Text style={styles.infoCardMeta}>{'\uD83D\uDCDE'} {order.delivery_person.phone}</Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalBtn, { backgroundColor: '#E8F5E9' }]}
              onPress={onViewSummary}
            >
              <Ionicons name="receipt-outline" size={18} color="#1B5E20" />
              <Text style={[styles.modalBtnText, { color: '#1B5E20' }]}>View Summary</Text>
            </TouchableOpacity>
            {order.status !== 'delivered' && order.status !== 'cancelled' && (
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#1B5E20' }]}
                onPress={onTrack}
              >
                <Ionicons name="locate-outline" size={18} color="#fff" />
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Track Order</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * ORDER CARD
 * ------------------------------------------------------------------------ */

const OrderCard = ({ order, onPress, onTrack }) => {
  const items = getOrderItems(order);
  const total = getOrderTotal(order);
  const cfg = getStatusConfig(order.status);

  return (
    <TouchableOpacity style={[styles.card, { borderLeftWidth: 4, borderLeftColor: cfg.color }]} activeOpacity={0.7} onPress={onPress}>
      {/* Top row: Order ID + Status */}
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderId}>Order #{order.order_id || order.id}</Text>
          <Text style={styles.orderDate}>{formatDate(order.created_at || order.order_date)}</Text>
        </View>
        <StatusBadge status={order.status} />
      </View>

      {/* Product image previews */}
      <View style={styles.imageRow}>
        {items.slice(0, 4).map((item, idx) => {
          const img = getProductImage(item);
          return img ? (
            <Image
              key={idx}
              source={{ uri: optimizeImageUrl(img, { width: 56, height: 56 }) }}
              style={styles.thumbImage}
            />
          ) : (
            <View key={idx} style={[styles.thumbImage, styles.imagePlaceholder]}>
              <Ionicons name="leaf-outline" size={18} color="#aaa" />
            </View>
          );
        })}
        {items.length > 4 && (
          <View style={[styles.thumbImage, styles.moreItems]}>
            <Text style={styles.moreItemsText}>+{items.length - 4}</Text>
          </View>
        )}
        {items.length === 0 && (
          <View style={[styles.thumbImage, styles.imagePlaceholder]}>
            <Ionicons name="cube-outline" size={18} color="#aaa" />
          </View>
        )}
      </View>

      {/* Bottom row: item count + total + track */}
      <View style={styles.cardFooter}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemCount}>
            {items.length || order.total_items || 0} item{(items.length || order.total_items || 0) !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
        </View>
        {order.status !== 'delivered' && order.status !== 'cancelled' && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={(e) => { e.stopPropagation && e.stopPropagation(); onTrack(); }}
          >
            <Ionicons name="locate-outline" size={16} color="#fff" />
            <Text style={styles.trackBtnText}>Track</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Transporter mini-card */}
      {order.transporter && (
        <View style={styles.miniCard}>
          <MaterialCommunityIcons name="truck-outline" size={16} color="#666" />
          <Text style={styles.miniCardText} numberOfLines={1}>
            {order.transporter.name || order.transporter.full_name || order.transporter.username || ''}
            {order.transporter.vehicle_type ? (' \u2022 ' + order.transporter.vehicle_type) : ''}
            {order.transporter.phone ? (' \u2022 ' + order.transporter.phone) : ''}
          </Text>
        </View>
      )}

      {/* Delivery person mini-card */}
      {order.delivery_person && (
        <View style={styles.miniCard}>
          <Ionicons name="bicycle-outline" size={16} color="#666" />
          <Text style={styles.miniCardText} numberOfLines={1}>
            {order.delivery_person.name || order.delivery_person.full_name || order.delivery_person.username || ''}
            {order.delivery_person.phone ? (' \u2022 ' + order.delivery_person.phone) : ''}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const OrderHistory = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [orders, setOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [activeFilter, setActiveFilter] = useState('All');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const toastRef = useRef(null);

  /* -- Fetch ------------------------------------------------- */
  const fetchOrders = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await getCustomerOrders();
      const list = Array.isArray(data) ? data : data?.data || data?.orders || [];
      list.sort((a, b) => new Date(b.created_at || b.order_date || 0) - new Date(a.created_at || a.order_date || 0));
      setOrders(list);
      applyFilter(activeFilter, list);
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load orders';
      if (!silent) toastRef.current?.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => { fetchOrders(); }, []);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchOrders(true));
    return unsub;
  }, [navigation, fetchOrders]);

  /* -- Filter ------------------------------------------------ */
  const applyFilter = (filter, list = orders) => {
    setActiveFilter(filter);
    if (filter === 'All') {
      setFilteredOrders(list);
    } else {
      const key = filter.toLowerCase();
      setFilteredOrders(list.filter((o) => (o.status || '').toLowerCase() === key));
    }
  };

  /* -- Handlers ---------------------------------------------- */
  const handleOrderPress = (order) => {
    setSelectedOrder(order);
    setModalVisible(true);
  };

  const handleTrackOrder = (order) => {
    setModalVisible(false);
    navigation.navigate('CustomerOrderTracking', { orderId: order.order_id || order.id, order });
  };

  const handleViewSummary = () => {
    if (!selectedOrder) return;
    setModalVisible(false);
    navigation.navigate('OrderSummary', { orderId: selectedOrder.order_id || selectedOrder.id, order: selectedOrder });
  };

  const onRefresh = () => { setRefreshing(true); fetchOrders(true); };

  /* -- Render helpers ---------------------------------------- */
  const renderFilterChips = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chipRow}
    >
      {STATUS_FILTERS.map((f) => {
        const active = f === activeFilter;
        const count = f === 'All'
          ? orders.length
          : orders.filter((o) => (o.status || '').toLowerCase() === f.toLowerCase()).length;
        return (
          <TouchableOpacity
            key={f}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => applyFilter(f)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>
              {f}{count > 0 ? ` (${count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="receipt-outline" size={72} color="#ccc" />
      <Text style={styles.emptyTitle}>No Orders Yet</Text>
      <Text style={styles.emptySubtitle}>
        {activeFilter === 'All'
          ? "You haven't placed any orders yet. Start shopping!"
          : 'No ' + activeFilter.toLowerCase() + ' orders found.'}
      </Text>
      {activeFilter === 'All' && (
        <TouchableOpacity style={styles.shopBtn} onPress={() => navigation.navigate('Home')}>
          <Ionicons name="cart-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
          <Text style={styles.shopBtnText}>Start Shopping</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  /* -- Main -------------------------------------------------- */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Orders</Text>
          <Text style={styles.headerSub}>
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => fetchOrders()} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color="#1B5E20" />
        </TouchableOpacity>
      </View>

      {/* Filter chips */}
      {renderFilterChips()}

      {/* List */}
      {loading ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {[1, 2, 3].map((i) => <OrderCardSkeleton key={i} />)}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, idx) => String(item.order_id || item.id || idx)}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => handleOrderPress(item)}
              onTrack={() => handleTrackOrder(item)}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            filteredOrders.length === 0 && { flex: 1 },
          ]}
          ListEmptyComponent={renderEmpty}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} tintColor="#1B5E20" />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal */}
      <OrderDetailModal
        visible={modalVisible}
        order={selectedOrder}
        onClose={() => setModalVisible(false)}
        onTrack={() => selectedOrder && handleTrackOrder(selectedOrder)}
        onViewSummary={handleViewSummary}
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#1B5E20' },
  headerSub: { fontSize: 13, color: '#888', marginTop: 2 },
  refreshBtn: { padding: 8 },

  /* Filter chips */
  chipRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff', alignItems: 'center' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F0F0F0',
  },
  chipActive: { backgroundColor: '#1B5E20' },
  chipText: { fontSize: 13, color: '#555', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },

  /* List */
  listContent: { padding: 16, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.09, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },
  orderDate: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Badge */
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  badgeText: { fontSize: 12, fontWeight: '600' },

  /* Image row */
  imageRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  thumbImage: { width: 56, height: 56, borderRadius: 10, backgroundColor: '#f0f0f0' },
  imagePlaceholder: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f5f5' },
  moreItems: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#E8F5E9' },
  moreItemsText: { fontSize: 13, fontWeight: '600', color: '#1B5E20' },

  /* Card footer */
  cardFooter: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  itemCount: { fontSize: 12, color: '#888' },
  totalAmount: { fontSize: 16, fontWeight: '700', color: '#1B5E20', marginTop: 2 },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1B5E20',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  trackBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  /* Mini card */
  miniCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    gap: 6,
  },
  miniCardText: { fontSize: 12, color: '#666', flex: 1 },

  /* Empty */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  shopBtn: {
    marginTop: 20,
    backgroundColor: '#1B5E20',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
  },
  shopBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  modalLabel: { fontSize: 14, color: '#888' },
  modalValue: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Modal items */
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  modalItemImage: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#f5f5f5' },
  modalItemName: { fontSize: 14, fontWeight: '600', color: '#333' },
  modalItemMeta: { fontSize: 12, color: '#888', marginTop: 2 },
  modalItemTotal: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },

  /* Info card */
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F8FFF8',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  infoCardTitle: { fontSize: 11, color: '#888', fontWeight: '500' },
  infoCardValue: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 2 },
  infoCardMeta: { fontSize: 12, color: '#666', marginTop: 2 },

  /* Modal actions */
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  modalBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    gap: 6,
  },
  modalBtnText: { fontSize: 14, fontWeight: '600' },
});

export default OrderHistory;
