import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Modal,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { acceptFarmerOrder, getFarmerOrders, rejectFarmerOrder } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const STATUS_LIST = ['All', 'PLACED', 'PENDING', 'CONFIRMED', 'ASSIGNED', 'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'];

const STATUS_COLORS = {
  PLACED: '#FF9800',
  PENDING: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  SHIPPED: '#00BCD4',
  OUT_FOR_DELIVERY: '#FF5722',
  DELIVERED: '#4CAF50',
  CANCELLED: '#F44336',
};

// Map backend mixed-case status to uppercase canonical key
const normalizeStatus = (s) => {
  if (!s) return 'PLACED';
  return s.toUpperCase().replace(/ /g, '_');
};

const FarmerOrders = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [detailModal, setDetailModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const toastRef = React.useRef(null);

  const fetchOrders = useCallback(async () => {
    try {
      const data = await getFarmerOrders();
      const raw = Array.isArray(data) ? data : data?.orders || data?.data || [];
      // Normalize: backend sends current_status (mixed case), map to uppercase
      const list = raw.map(o => ({
        ...o,
        status: normalizeStatus(o.current_status || o.status),
      }));
      setOrders(list.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
      console.log('[FarmerOrders] Fetched', list.length, 'orders. Sample:', JSON.stringify(list[0]));
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to load orders';
      console.error('[FarmerOrders] fetchOrders error:', msg, '\nStatus:', e?.response?.status, '\nDetails:', JSON.stringify(e?.response?.data));
      toastRef.current?.show(msg, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchOrders(); };

  const filteredOrders =
    activeFilter === 'All'
      ? orders
      : orders.filter((o) => (o.status || o.current_status || '').toUpperCase() === activeFilter.toUpperCase());

  const handleAction = async (orderId, action) => {
    setActionLoading(orderId);
    try {
      if (action === 'accept') {
        await acceptFarmerOrder(orderId);
        setOrders((prev) =>
          prev.map((o) => ((o.order_id || o.id) === orderId ? { ...o, status: 'CONFIRMED' } : o))
        );
        toastRef.current?.show('Order accepted successfully!', 'success');
      } else {
        await rejectFarmerOrder(orderId);
        setOrders((prev) =>
          prev.map((o) => ((o.order_id || o.id) === orderId ? { ...o, status: 'CANCELLED' } : o))
        );
        toastRef.current?.show('Order rejected.', 'success');
      }
    } catch (e) {
      const msg = e?.response?.data?.message || e.message || 'Failed to update order';
      toastRef.current?.show(msg, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openDetail = (order) => {
    setSelectedOrder(order);
    setDetailModal(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderOrderCard = ({ item }) => {
    const realId = item.order_id || item.id;
    const statusColor = STATUS_COLORS[item.status] || '#888';
    const isActionable = ['PLACED', 'PENDING'].includes(item.status);

    // API returns per-item records with a Product association
    const product = item.Product || item.product || {};
    const imgUri = product.image_url || product.image || product.photo || null;
    const productName = product.name || product.product_name || item.product_name || 'Product';
    const unitPrice = parseFloat(product.current_price || product.price || item.unit_price || item.price_per_unit || 0);
    const qty = parseInt(item.quantity || 1);
    const total = parseFloat(item.total_price || item.total_amount || item.total || 0);
    const customerName = item.customer?.name || item.customer?.full_name || item.customer_name || 'Customer';

    return (
      <TouchableOpacity
        style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
        onPress={() => openDetail(item)}
        activeOpacity={0.85}
      >
        {/* ── Header ── */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId}>Order #{realId}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at || item.date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(item.status || '').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* ── Customer ── */}
        <View style={styles.customerRow}>
          <Ionicons name="person-circle-outline" size={17} color="#888" />
          <Text style={styles.customerName} numberOfLines={1}>{customerName}</Text>
        </View>

        {/* ── Product (single item record) ── */}
        <View style={styles.productsSection}>
          <View style={styles.productRow}>
            {imgUri ? (
              <Image source={{ uri: imgUri }} style={styles.productThumb} />
            ) : (
              <View style={styles.productThumbPlaceholder}>
                <MaterialCommunityIcons name="food-apple-outline" size={26} color="#aaa" />
              </View>
            )}
            <View style={styles.productInfoWrap}>
              <Text style={styles.productName} numberOfLines={2}>{productName}</Text>
              <Text style={styles.productMeta}>
                Qty: {qty}{unitPrice > 0 ? `  ·  ₹${unitPrice.toFixed(2)}/unit` : ''}
              </Text>
            </View>
            {total > 0 && (
              <Text style={styles.productItemTotal}>₹{total.toLocaleString('en-IN')}</Text>
            )}
          </View>
        </View>

        {/* ── Total ── */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Order Total</Text>
          <Text style={styles.totalAmount}>₹{total.toLocaleString('en-IN')}</Text>
        </View>

        {/* ── Action Required: Accept / Reject ── */}
        {isActionable && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() =>
                Alert.alert('Reject Order', 'Are you sure you want to reject this order?', [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes, Reject', style: 'destructive', onPress: () => handleAction(realId, 'reject') },
                ])
              }
              disabled={actionLoading === realId}
            >
              {actionLoading === realId ? (
                <ActivityIndicator size="small" color="#F44336" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={19} color="#F44336" />
                  <Text style={styles.rejectText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleAction(realId, 'accept')}
              disabled={actionLoading === realId}
            >
              {actionLoading === realId ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={19} color="#fff" />
                  <Text style={styles.acceptText}>Accept Order</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* ── Track for confirmed+ orders ── */}
        {!isActionable && item.status !== 'CANCELLED' && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() => navigation.navigate('FarmerOrderTracking', { orderId: realId, order: item })}
          >
            <MaterialCommunityIcons name="truck-outline" size={16} color="#1B5E20" />
            <Text style={styles.trackText}>Track Order</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  /* ─── Order Detail Modal ─── */
  const renderDetailModal = () => {
    if (!selectedOrder) return null;
    const o = selectedOrder;
    const realId = o.order_id || o.id;
    const statusColor = STATUS_COLORS[o.status] || '#888';
    const isActionable = ['PLACED', 'PENDING'].includes(o.status);

    const product = o.Product || o.product || {};
    const imgUri = product.image_url || product.image || product.photo || null;
    const productName = product.name || product.product_name || o.product_name || 'Product';
    const unitPrice = parseFloat(product.current_price || product.price || o.unit_price || o.price_per_unit || 0);
    const qty = parseInt(o.quantity || 1);
    const total = parseFloat(o.total_price || o.total_amount || o.total || 0);
    const customerName = o.customer?.name || o.customer?.full_name || o.customer_name || 'N/A';
    const deliveryAddr = o.delivery_address || o.Order?.delivery_address || o.order?.delivery_address || null;

    return (
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.detailCard}>
            {/* Header */}
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Order #{realId}</Text>
              <TouchableOpacity onPress={() => setDetailModal(false)} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 520 }}>
              {/* Status badge */}
              <View style={[styles.statusBadgeLg, { backgroundColor: statusColor + '22', alignSelf: 'flex-start' }]}>
                <Text style={[styles.statusTextLg, { color: statusColor }]}>
                  {(o.status || '').replace(/_/g, ' ')}
                </Text>
              </View>

              <Text style={styles.detailLabel}>Customer</Text>
              <Text style={styles.detailValue}>{customerName}</Text>

              <Text style={styles.detailLabel}>Order Date</Text>
              <Text style={styles.detailValue}>{formatDate(o.created_at || o.date)}</Text>

              {deliveryAddr ? (
                <>
                  <Text style={styles.detailLabel}>Delivery Address</Text>
                  <Text style={styles.detailValue}>{deliveryAddr}</Text>
                </>
              ) : null}

              {/* Product row */}
              <Text style={[styles.detailLabel, { marginBottom: 10, marginTop: 16 }]}>Product</Text>
              <View style={styles.detailProductRow}>
                {imgUri ? (
                  <Image source={{ uri: imgUri }} style={styles.detailProductImg} />
                ) : (
                  <View style={[styles.detailProductImg, styles.detailProductImgPlaceholder]}>
                    <MaterialCommunityIcons name="food-apple-outline" size={28} color="#ccc" />
                  </View>
                )}
                <View style={styles.detailProductInfo}>
                  <Text style={styles.detailProductName} numberOfLines={2}>{productName}</Text>
                  <Text style={styles.detailProductMeta}>
                    Qty: {qty}{unitPrice > 0 ? `  ·  ₹${unitPrice.toFixed(2)}/unit` : ''}
                  </Text>
                </View>
                {total > 0 && (
                  <Text style={styles.detailProductPrice}>₹{total.toLocaleString('en-IN')}</Text>
                )}
              </View>

              {/* Total */}
              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Total Amount</Text>
                <Text style={styles.detailTotalValue}>₹{total.toLocaleString('en-IN')}</Text>
              </View>
            </ScrollView>

            {/* Accept / Reject inside modal */}
            {isActionable && (
              <View style={[styles.actionsRow, { marginTop: 14 }]}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  onPress={() =>
                    Alert.alert('Reject Order', 'Reject this order?', [
                      { text: 'No', style: 'cancel' },
                      { text: 'Reject', style: 'destructive', onPress: () => { handleAction(realId, 'reject'); setDetailModal(false); } },
                    ])
                  }
                  disabled={actionLoading === realId}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#F44336" />
                  <Text style={styles.rejectText}>Reject</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.acceptBtn]}
                  onPress={() => { handleAction(realId, 'accept'); setDetailModal(false); }}
                  disabled={actionLoading === realId}
                >
                  {actionLoading === realId ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                      <Text style={styles.acceptText}>Accept Order</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {!isActionable && o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && (
              <TouchableOpacity
                style={styles.detailTrackBtn}
                onPress={() => { setDetailModal(false); navigation.navigate('FarmerOrderTracking', { orderId: realId, order: o }); }}
              >
                <MaterialCommunityIcons name="truck-outline" size={18} color="#fff" />
                <Text style={styles.detailTrackText}>Track Order</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Text style={styles.headerTitle}>My Orders</Text>
      </LinearGradient>

      {/* Filter Chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STATUS_LIST.map((status) => {
            const isActive = activeFilter === status;
            const count =
              status === 'All'
                ? orders.length
                : orders.filter((o) => o.status === status).length;
            return (
              <TouchableOpacity
                key={status}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setActiveFilter(status)}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {status === 'All' ? 'All' : status.replace(/_/g, ' ')}
                </Text>
                <View style={[styles.filterCount, isActive && styles.filterCountActive]}>
                  <Text style={[styles.filterCountText, isActive && { color: '#4CAF50' }]}>
                    {count}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading orders...</Text>
        </View>
      ) : filteredOrders.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="receipt-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {activeFilter === 'All' ? 'No orders yet' : `No ${activeFilter.toLowerCase()} orders`}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={(item, index) => String(item.order_id || item.id || index)}
          renderItem={renderOrderCard}
          contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderDetailModal()}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default FarmerOrders;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },
  emptyText: { marginTop: 12, fontSize: 15, color: '#999' },

  header: {
    paddingBottom: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  /* Filters */
  filterContainer: { marginTop: 12 },
  filterRow: { paddingHorizontal: 12 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginHorizontal: 4,
    elevation: 1,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#fff' },
  filterCount: {
    backgroundColor: '#ECF3EC',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    marginLeft: 6,
  },
  filterCountActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  filterCountText: { fontSize: 11, fontWeight: '700', color: '#888' },

  /* Order Card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', letterSpacing: 0.1 },
  orderDate: { fontSize: 12, color: '#999', marginTop: 3 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },

  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  customerName: { fontSize: 14, color: '#555', fontWeight: '500' },

  /* Product rows in card */
  productsSection: { marginTop: 12, borderTopWidth: 1, borderTopColor: '#EDF3ED', paddingTop: 12, gap: 10 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  productThumb: { width: 52, height: 52, borderRadius: 10, backgroundColor: '#F5F5F5' },
  productThumbPlaceholder: {
    width: 52, height: 52, borderRadius: 10,
    backgroundColor: '#F0F4F0', justifyContent: 'center', alignItems: 'center',
  },
  productInfoWrap: { flex: 1 },
  productName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 3 },
  productMeta: { fontSize: 12, color: '#888' },
  productItemTotal: { fontSize: 14, fontWeight: '700', color: '#1B5E20' },
  moreProducts: { fontSize: 12, color: '#4CAF50', fontWeight: '600', marginTop: 2 },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  totalLabel: { fontSize: 13, color: '#888', fontWeight: '500' },
  totalAmount: { fontSize: 19, fontWeight: '800', color: '#1B5E20' },

  actionsRow: { flexDirection: 'row', marginTop: 14, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12, gap: 6 },
  rejectBtn: { backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' },
  acceptBtn: { backgroundColor: '#2E7D32', elevation: 3 },
  rejectText: { color: '#F44336', fontWeight: '700', fontSize: 14 },
  acceptText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    gap: 6,
  },
  trackText: { color: '#1B5E20', fontWeight: '700', fontSize: 13 },

  /* Detail Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  detailCard: { backgroundColor: '#fff', width: '92%', borderRadius: 20, padding: 20, maxHeight: '88%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  detailTitle: { fontSize: 18, fontWeight: '800', color: '#1A1A1A' },
  closeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F5F5F5', justifyContent: 'center', alignItems: 'center' },
  statusBadgeLg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, marginBottom: 12 },
  statusTextLg: { fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  detailLabel: { fontSize: 12, fontWeight: '700', color: '#888', marginTop: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailValue: { fontSize: 15, color: '#333', marginTop: 3, fontWeight: '500' },

  /* Product row in modal */
  detailProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
    gap: 12,
  },
  detailProductImg: { width: 60, height: 60, borderRadius: 12, backgroundColor: '#F5F5F5' },
  detailProductImgPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  detailProductInfo: { flex: 1 },
  detailProductName: { fontSize: 14, fontWeight: '700', color: '#1A1A1A', marginBottom: 4 },
  detailProductMeta: { fontSize: 12, color: '#888' },
  detailProductPrice: { fontSize: 15, fontWeight: '800', color: '#1B5E20' },

  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#E8F5E9',
  },
  detailTotalLabel: { fontSize: 15, fontWeight: '700', color: '#333' },
  detailTotalValue: { fontSize: 22, fontWeight: '800', color: '#1B5E20' },
  detailTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
    paddingVertical: 13,
    backgroundColor: '#2E7D32',
    borderRadius: 14,
    gap: 8,
    elevation: 3,
  },
  detailTrackText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
