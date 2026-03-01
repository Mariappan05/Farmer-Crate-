import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import { getFarmerOrders, updateFarmerOrderStatus } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const STATUS_LIST = ['All', 'PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED'];

const STATUS_COLORS = {
  PENDING: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  SHIPPED: '#00BCD4',
  OUT_FOR_DELIVERY: '#FF5722',
  DELIVERED: '#4CAF50',
  CANCELLED: '#F44336',
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
      // Normalize: backend sends current_status, frontend uses status
      const list = raw.map(o => ({ ...o, status: o.current_status || o.status || 'PENDING' }));
      setOrders(list.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
      console.log('[FarmerOrders] Fetched', list.length, 'orders');
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

  const handleAction = async (orderId, status) => {
    setActionLoading(orderId);
    try {
      await updateFarmerOrderStatus(orderId, status);
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status } : o))
      );
      toastRef.current?.show(`Order ${status === 'CONFIRMED' ? 'accepted' : 'cancelled'} successfully`, 'success');
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to update order', 'error');
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
    const statusColor = STATUS_COLORS[item.status] || '#888';
    const isPending = item.status === 'PENDING';

    const products = item.items || item.products || item.order_items || [];

    return (
      <TouchableOpacity
        style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
        onPress={() => openDetail(item)}
        activeOpacity={0.7}
      >
        {/* Order Header */}
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderId} numberOfLines={1}>
              {item.customer_name || item.user?.full_name || (products[0] && (products[0].product_name || products[0].name)) || 'Order'}
            </Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at || item.date)}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {(item.status || '').replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Ionicons name="person-outline" size={16} color="#888" />
          <Text style={styles.customerName} numberOfLines={1}>
            {item.customer_name || item.user?.full_name || 'Customer'}
          </Text>
        </View>

        {/* Products Summary */}
        {products.length > 0 && (
          <View style={styles.productsSection}>
            {products.slice(0, 3).map((p, idx) => (
              <Text key={idx} style={styles.productLine} numberOfLines={1}>
                • {p.product_name || p.name} × {p.quantity || 1}
              </Text>
            ))}
            {products.length > 3 && (
              <Text style={styles.moreProducts}>+{products.length - 3} more items</Text>
            )}
          </View>
        )}

        {/* Total */}
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>
            ₹{parseFloat(item.total_amount || item.total || 0).toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Actions for pending orders */}
        {isPending && (
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.rejectBtn]}
              onPress={() => {
                Alert.alert('Reject Order', 'Are you sure you want to reject this order?', [
                  { text: 'No', style: 'cancel' },
                  { text: 'Yes, Reject', onPress: () => handleAction(item.id, 'CANCELLED') },
                ]);
              }}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#F44336" />
              ) : (
                <>
                  <Ionicons name="close-circle-outline" size={18} color="#F44336" />
                  <Text style={styles.rejectText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleAction(item.id, 'CONFIRMED')}
              disabled={actionLoading === item.id}
            >
              {actionLoading === item.id ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                  <Text style={styles.acceptText}>Accept</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Track button for non-pending */}
        {!isPending && item.status !== 'CANCELLED' && (
          <TouchableOpacity
            style={styles.trackBtn}
            onPress={() =>
              navigation.navigate('FarmerOrderTracking', { orderId: item.id, order: item })
            }
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
    const statusColor = STATUS_COLORS[o.status] || '#888';
    const products = o.items || o.products || o.order_items || [];

    return (
      <Modal visible={detailModal} transparent animationType="slide" onRequestClose={() => setDetailModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.detailCard}>
            <View style={styles.detailHeader}>
              <Text style={styles.detailTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setDetailModal(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
              <View style={[styles.statusBadgeLg, { backgroundColor: statusColor + '18', alignSelf: 'flex-start' }]}>
                <Text style={[styles.statusTextLg, { color: statusColor }]}>
                  {(o.status || '').replace(/_/g, ' ')}
                </Text>
              </View>

              <Text style={styles.detailLabel}>Customer</Text>
              <Text style={styles.detailValue}>{o.customer_name || o.user?.full_name || 'N/A'}</Text>

              <Text style={styles.detailLabel}>Date</Text>
              <Text style={styles.detailValue}>{formatDate(o.created_at || o.date)}</Text>

              {products.length > 0 && (
                <>
                  <Text style={styles.detailLabel}>Products</Text>
                  {products.map((p, idx) => (
                    <View key={idx} style={styles.detailProductRow}>
                      <Text style={styles.detailProductName} numberOfLines={1}>
                        {p.product_name || p.name}
                      </Text>
                      <Text style={styles.detailProductQty}>×{p.quantity || 1}</Text>
                      <Text style={styles.detailProductPrice}>
                        ₹{parseFloat(p.price || p.total || 0).toFixed(2)}
                      </Text>
                    </View>
                  ))}
                </>
              )}

              <View style={styles.detailTotalRow}>
                <Text style={styles.detailTotalLabel}>Total Amount</Text>
                <Text style={styles.detailTotalValue}>
                  ₹{parseFloat(o.total_amount || o.total || 0).toLocaleString('en-IN')}
                </Text>
              </View>

              {o.delivery_address && (
                <>
                  <Text style={styles.detailLabel}>Delivery Address</Text>
                  <Text style={styles.detailValue}>{o.delivery_address}</Text>
                </>
              )}
            </ScrollView>

            {o.status !== 'CANCELLED' && o.status !== 'DELIVERED' && (
              <TouchableOpacity
                style={styles.detailTrackBtn}
                onPress={() => {
                  setDetailModal(false);
                  navigation.navigate('FarmerOrderTracking', { orderId: o.id, order: o });
                }}
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
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={[styles.header, { paddingTop: insets.top + 8 }]}>
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
          keyExtractor={(item) => String(item.id || item.order_id)}
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
  container: { flex: 1, backgroundColor: '#F5F5F5' },
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500', textTransform: 'capitalize' },
  filterChipTextActive: { color: '#fff' },
  filterCount: {
    backgroundColor: '#F0F0F0',
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
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 16, fontWeight: '700', color: '#333' },
  orderDate: { fontSize: 12, color: '#999', marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  customerName: { fontSize: 14, color: '#555' },

  productsSection: { marginTop: 10, paddingLeft: 4 },
  productLine: { fontSize: 13, color: '#666', marginBottom: 2 },
  moreProducts: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 2 },

  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  totalLabel: { fontSize: 14, color: '#888' },
  totalAmount: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },

  actionsRow: { flexDirection: 'row', marginTop: 14, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 10, gap: 6 },
  rejectBtn: { backgroundColor: '#FFEBEE' },
  acceptBtn: { backgroundColor: '#4CAF50' },
  rejectText: { color: '#F44336', fontWeight: '600', fontSize: 14 },
  acceptText: { color: '#fff', fontWeight: '600', fontSize: 14 },

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
  trackText: { color: '#1B5E20', fontWeight: '600', fontSize: 14 },

  /* Detail Modal */
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  detailCard: { backgroundColor: '#fff', width: '90%', borderRadius: 18, padding: 20, maxHeight: '80%' },
  detailHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  detailTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  statusBadgeLg: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12, marginBottom: 14 },
  statusTextLg: { fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  detailLabel: { fontSize: 13, fontWeight: '600', color: '#888', marginTop: 12 },
  detailValue: { fontSize: 15, color: '#333', marginTop: 2 },
  detailProductRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  detailProductName: { flex: 1, fontSize: 14, color: '#333' },
  detailProductQty: { fontSize: 14, color: '#888', marginHorizontal: 10 },
  detailProductPrice: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },
  detailTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  detailTotalLabel: { fontSize: 16, fontWeight: '600', color: '#333' },
  detailTotalValue: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },
  detailTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 12,
    gap: 8,
  },
  detailTrackText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
