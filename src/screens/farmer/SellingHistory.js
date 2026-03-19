import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFarmerOrders } from '../../services/orderService';
import ToastMessage from '../../utils/Toast';

const DATE_RANGES = ['All Time', 'This Month', 'Last Month', 'This Week'];

const SellingHistory = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const toastRef = useRef(null);

  const [deliveredOrders, setDeliveredOrders] = useState([]);
  const [allOrders, setAllOrders] = useState([]); // Add this to store all orders for debugging
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState('All Time');

  // Stats
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [orderCount, setOrderCount] = useState(0);
  const [avgOrderValue, setAvgOrderValue] = useState(0);
  const [monthlyData, setMonthlyData] = useState([]);

  const fetchHistory = useCallback(async () => {
    try {
      console.log('[SellingHistory] Fetching farmer orders...');
      
      // Try multiple approaches to get farmer orders
      let data = null;
      try {
        data = await getFarmerOrders();
        console.log('[SellingHistory] Got data from getFarmerOrders:', data);
      } catch (error) {
        console.log('[SellingHistory] getFarmerOrders failed, trying direct API call:', error.message);
        
        // Fallback: try direct API call
        try {
          const response = await api.get('/farmers/orders');
          data = response.data;
          console.log('[SellingHistory] Got data from direct API call:', data);
        } catch (apiError) {
          console.log('[SellingHistory] Direct API call failed, trying completed orders endpoint:', apiError.message);
          
          // Another fallback: try completed orders endpoint
          try {
            const completedResponse = await api.get('/farmers/orders/completed');
            data = completedResponse.data;
            console.log('[SellingHistory] Got data from completed orders endpoint:', data);
          } catch (completedError) {
            console.log('[SellingHistory] All endpoints failed:', completedError.message);
            throw new Error('Unable to fetch order history from any endpoint');
          }
        }
      }
      
      const all = Array.isArray(data) ? data : data?.orders || data?.data || [];
      console.log('[SellingHistory] Processed orders array:', all);
      
      // Store all orders for debugging
      setAllOrders(all);

      // Filter delivered — check multiple indicators of completion
      const delivered = all.filter(
        (o) => {
          const status = (o.current_status || o.status || '').toUpperCase();
          const paymentStatus = (o.payment_status || '').toLowerCase();
          
          // Traditional completion statuses
          const isTraditionallyDelivered = [
            'DELIVERED', 
            'COMPLETED', 
            'FULFILLED'
          ].includes(status);
          
          // Check if payment is completed (indicates successful transaction)
          const isPaymentCompleted = paymentStatus === 'completed' || paymentStatus === 'success' || paymentStatus === 'paid';
          
          // For now, let's include ASSIGNED orders with completed payment
          // This seems to be how your system works based on the logs
          const isAssignedWithPayment = status === 'ASSIGNED' && isPaymentCompleted;
          
          const isDelivered = isTraditionallyDelivered || isAssignedWithPayment;
          
          console.log('[SellingHistory] Order', o.order_id || o.id, 'completion check:', { 
            current_status: o.current_status, 
            status: o.status, 
            finalStatus: status,
            payment_status: o.payment_status,
            paymentStatus,
            isTraditionallyDelivered,
            isPaymentCompleted,
            isAssignedWithPayment,
            isDelivered
          });
          return isDelivered;
        }
      );
      
      console.log('[SellingHistory] Delivered orders:', delivered);

      delivered.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      setDeliveredOrders(delivered);

      // Compute stats
      const total = delivered.reduce(
        (sum, o) => {
          const amount = parseFloat(
            o.farmer_amount || 
            o.total_price || 
            o.total_amount || 
            o.total || 
            0
          );
          console.log('[SellingHistory] Order', o.order_id || o.id, 'revenue calculation:', {
            farmer_amount: o.farmer_amount,
            total_price: o.total_price,
            total_amount: o.total_amount,
            total: o.total,
            calculatedAmount: amount
          });
          return sum + amount;
        },
        0
      );
      
      console.log('[SellingHistory] Total revenue calculated:', total);
      setTotalRevenue(total);
      setOrderCount(delivered.length);
      setAvgOrderValue(delivered.length > 0 ? total / delivered.length : 0);

      // Monthly
      computeMonthlyData(delivered);
    } catch (e) {
      console.error('[SellingHistory] Fetch error:', e);
      toastRef.current?.show(e?.response?.data?.message || e.message || 'Failed to load selling history', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const computeMonthlyData = (orders) => {
    console.log('[SellingHistory] Computing monthly data for', orders.length, 'orders');
    const map = {};
    orders.forEach((o) => {
      const d = new Date(o.created_at || o.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
      if (!map[key]) map[key] = { key, label, total: 0, count: 0 };
      
      const amount = parseFloat(
        o.farmer_amount || 
        o.total_price || 
        o.total_amount || 
        o.total || 
        0
      );
      
      map[key].total += amount;
      map[key].count += 1;
      
      console.log('[SellingHistory] Monthly data for', key, ':', { amount, total: map[key].total, count: map[key].count });
    });

    const sorted = Object.values(map).sort((a, b) => a.key.localeCompare(b.key));
    const last6Months = sorted.slice(-6);
    console.log('[SellingHistory] Final monthly data:', last6Months);
    setMonthlyData(last6Months); // last 6 months
  };

  useEffect(() => { fetchHistory(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchHistory(); };

  const getFilteredOrders = () => {
    const now = new Date();
    return deliveredOrders.filter((o) => {
      if (dateRange === 'All Time') return true;
      const date = new Date(o.created_at || o.date);
      if (dateRange === 'This Month') {
        return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
      }
      if (dateRange === 'Last Month') {
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return date.getMonth() === lastMonth.getMonth() && date.getFullYear() === lastMonth.getFullYear();
      }
      if (dateRange === 'This Week') {
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        return date >= weekStart;
      }
      return true;
    });
  };

  const filteredOrders = getFilteredOrders();

  // Filtered stats
  const filteredRevenue = filteredOrders.reduce(
    (sum, o) => {
      const amount = parseFloat(
        o.farmer_amount || 
        o.total_price || 
        o.total_amount || 
        o.total || 
        0
      );
      console.log('[SellingHistory] Filtered revenue calculation for order', o.order_id || o.id, ':', amount);
      return sum + amount;
    },
    0
  );
  
  console.log('[SellingHistory] Filtered orders count:', filteredOrders.length, 'Filtered revenue:', filteredRevenue);

  const maxMonthly = monthlyData.length > 0 ? Math.max(...monthlyData.map((m) => m.total)) : 1;

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const renderOrderCard = ({ item }) => {
    console.log('[SellingHistory] Rendering order card for:', item);
    
    // Resolve fields from Sequelize associations or flat fields
    const orderId = item.order_id || item.id;
    
    // Try to get product name from multiple sources
    let productName = 'Product';
    if (item.Product?.name) {
      productName = item.Product.name;
    } else if (item.product?.name) {
      productName = item.product.name;
    } else if (item.items_json) {
      try { 
        const items = JSON.parse(item.items_json); 
        if (Array.isArray(items) && items[0]) {
          productName = items[0].name || items[0].product_name || items.map(i => i.name || i.product_name).filter(Boolean).join(', ') || 'Multiple Products';
        }
      } catch (e) { 
        console.log('[SellingHistory] Error parsing items_json:', e);
      }
    }
    
    // Try to get customer name from multiple sources
    const customerName = item.customer?.name || 
                        item.customer?.full_name || 
                        item.customer_name || 
                        item.user?.full_name ||
                        item.user?.name ||
                        'Customer';
    
    const total = parseFloat(
      item.farmer_amount || 
      item.total_price || 
      item.total_amount || 
      item.total || 
      0
    );
    const farmerAmt = parseFloat(item.farmer_amount || 0);
    const qty = item.quantity || 1;
    const pricePerUnit = parseFloat(
      item.Product?.current_price || 
      item.product?.current_price ||
      item.Product?.price ||
      item.product?.price ||
      0
    );
    
    console.log('[SellingHistory] Order card data:', {
      orderId,
      productName,
      customerName,
      total,
      farmerAmt,
      qty,
      pricePerUnit
    });

    return (
      <View style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: '#4CAF50' }]}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={styles.orderId} numberOfLines={1}>{productName}</Text>
            <Text style={styles.orderDate}>{formatDate(item.created_at || item.date)}</Text>
          </View>
          <Text style={styles.orderTotal}>₹{total.toLocaleString('en-IN')}</Text>
        </View>

        {/* Customer */}
        <View style={styles.customerRow}>
          <Ionicons name="person-outline" size={15} color="#888" />
          <Text style={styles.customerName}>{customerName}</Text>
        </View>

        {/* Qty + Price */}
        <View style={styles.customerRow}>
          <Ionicons name="layers-outline" size={14} color="#888" />
          <Text style={styles.customerName}>Qty: {qty}</Text>
          {pricePerUnit > 0 && (
            <Text style={[styles.customerName, { marginLeft: 10, color: '#1B5E20' }]}>
              ₹{pricePerUnit.toFixed(2)}/unit
            </Text>
          )}
        </View>

        {/* Farmer share */}
        {farmerAmt > 0 && (
          <View style={styles.customerRow}>
            <MaterialCommunityIcons name="cash" size={14} color="#4CAF50" />
            <Text style={[styles.customerName, { color: '#2E7D32', fontWeight: '600' }]}>
              Your earning: ₹{farmerAmt.toFixed(2)}
            </Text>
          </View>
        )}

        <View style={styles.deliveredBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#4CAF50" />
          <Text style={styles.deliveredText}>Delivered</Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ marginTop: 12, color: '#666' }}>Loading history...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <LinearGradient
        colors={['#103A12', '#1B5E20', '#2E7D32']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <Text style={styles.headerTitle}>Selling History</Text>
      </LinearGradient>

      <FlatList
        data={filteredOrders}
        keyExtractor={(item) => String(item.order_id || item.id)}
        renderItem={renderOrderCard}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* Revenue Summary Cards */}
            <View style={styles.summaryRow}>
              <LinearGradient
                colors={['#103A12', '#1B5E20', '#2E7D32']}
                style={styles.summaryGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
              >
                <MaterialCommunityIcons name="cash-multiple" size={24} color="#fff" />
                <Text style={styles.summaryValue}>
                  ₹{filteredRevenue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </Text>
                <Text style={styles.summaryLabel}>Total Revenue</Text>
              </LinearGradient>

              <View style={styles.summarySmallCol}>
                <View style={[styles.summarySmallCard, { backgroundColor: '#E3F2FD' }]}>
                  <Ionicons name="receipt-outline" size={20} color="#1976D2" />
                  <Text style={[styles.summarySmallValue, { color: '#1976D2' }]}>
                    {filteredOrders.length}
                  </Text>
                  <Text style={styles.summarySmallLabel}>Orders</Text>
                </View>
                <View style={[styles.summarySmallCard, { backgroundColor: '#FFF3E0' }]}>
                  <Ionicons name="analytics-outline" size={20} color="#E65100" />
                  <Text style={[styles.summarySmallValue, { color: '#E65100' }]}>
                    ₹{filteredOrders.length > 0
                      ? Math.round(filteredRevenue / filteredOrders.length).toLocaleString('en-IN')
                      : '0'}
                  </Text>
                  <Text style={styles.summarySmallLabel}>Avg Order</Text>
                </View>
              </View>
            </View>

            {/* Monthly Bar Chart */}
            {monthlyData.length > 0 && (
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>Monthly Revenue</Text>
                <View style={styles.chartContainer}>
                  {monthlyData.map((m, idx) => {
                    const barH = maxMonthly > 0 ? (m.total / maxMonthly) * 130 : 0;
                    return (
                      <View key={idx} style={styles.barCol}>
                        <Text style={styles.barValue}>
                          ₹{m.total >= 1000 ? `${(m.total / 1000).toFixed(1)}k` : m.total}
                        </Text>
                        <View style={styles.barWrapper}>
                          <LinearGradient
                            colors={['#4CAF50', '#81C784']}
                            style={[styles.bar, { height: Math.max(barH, 4) }]}
                          />
                        </View>
                        <Text style={styles.barLabel}>{m.label}</Text>
                        <Text style={styles.barCount}>{m.count} orders</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Date Filters */}
            <View style={styles.filterContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                {DATE_RANGES.map((range) => {
                  const active = dateRange === range;
                  return (
                    <TouchableOpacity
                      key={range}
                      style={[styles.filterChip, active && styles.filterChipActive]}
                      onPress={() => setDateRange(range)}
                    >
                      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                        {range}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Results header */}
            <View style={styles.resultsHeader}>
              <Text style={styles.resultsCount}>
                {filteredOrders.length} completed order{filteredOrders.length !== 1 ? 's' : ''}
              </Text>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="time-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>No completed orders yet</Text>
            <Text style={styles.emptySubtext}>Your delivered orders will appear here</Text>
            
            {/* Debug section - show all orders for understanding */}
            {deliveredOrders.length === 0 && (
              <View style={styles.debugSection}>
                <Text style={styles.debugTitle}>Debug: All Orders ({allOrders.length})</Text>
                {allOrders.slice(0, 3).map((order, idx) => (
                  <View key={idx} style={styles.debugOrder}>
                    <Text style={styles.debugText}>Order {order.order_id || order.id}</Text>
                    <Text style={styles.debugText}>Status: {order.current_status || order.status}</Text>
                    <Text style={styles.debugText}>Payment: {order.payment_status}</Text>
                    <Text style={styles.debugText}>Amount: ₹{order.farmer_amount || order.total_amount || order.total || 0}</Text>
                  </View>
                ))}
                {allOrders.length > 3 && (
                  <Text style={styles.debugText}>...and {allOrders.length - 3} more orders</Text>
                )}
              </View>
            )}
          </View>
        }
      />
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default SellingHistory;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: {
    paddingBottom: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800', letterSpacing: 0.2 },

  /* Summary */
  summaryRow: { flexDirection: 'row', margin: 16, gap: 12 },
  summaryGradient: {
    flex: 1.2,
    borderRadius: 18,
    padding: 18,
    justifyContent: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  summaryValue: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 10 },
  summaryLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  summarySmallCol: { flex: 1, gap: 12 },
  summarySmallCard: {
    flex: 1,
    borderRadius: 16,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  summarySmallValue: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  summarySmallLabel: { fontSize: 11, color: '#888', marginTop: 2, fontWeight: '500' },

  /* Chart */
  chartCard: {
    marginHorizontal: 16,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  chartTitle: { fontSize: 17, fontWeight: '800', color: '#1A1A1A', marginBottom: 16 },
  chartContainer: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end' },
  barCol: { alignItems: 'center', flex: 1 },
  barValue: { fontSize: 10, color: '#888', marginBottom: 4 },
  barWrapper: { width: 28, justifyContent: 'flex-end', height: 130 },
  bar: { width: '100%', borderRadius: 6 },
  barLabel: { fontSize: 10, color: '#888', marginTop: 6, textAlign: 'center' },
  barCount: { fontSize: 9, color: '#bbb', marginTop: 1 },

  /* Filters */
  filterContainer: { marginTop: 12 },
  filterScroll: { paddingHorizontal: 12 },
  filterChip: {
    backgroundColor: '#fff',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 22,
    marginHorizontal: 4,
    elevation: 2,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  filterChipActive: { backgroundColor: '#1B5E20' },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '600' },
  filterChipTextActive: { color: '#fff', fontWeight: '800' },

  resultsHeader: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  resultsCount: { fontSize: 14, color: '#888', fontWeight: '600' },

  /* Order Card */
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    elevation: 4,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.09,
    shadowRadius: 7,
    borderWidth: 1,
    borderColor: '#E6EFE6',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  orderId: { fontSize: 15, fontWeight: '700', color: '#1A1A1A' },
  orderDate: { fontSize: 12, color: '#999', marginTop: 2, fontWeight: '500' },
  orderTotal: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },

  customerRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 6 },
  customerName: { fontSize: 13, color: '#555', fontWeight: '500' },

  productsRow: { marginTop: 8, paddingLeft: 4 },
  productLine: { fontSize: 12, color: '#666', marginBottom: 2 },
  moreProducts: { fontSize: 11, color: '#999', fontStyle: 'italic', marginTop: 2 },

  deliveredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  deliveredText: { fontSize: 12, fontWeight: '700', color: '#2E7D32' },

  /* Empty */
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 16, color: '#888', marginTop: 12, fontWeight: '600' },
  emptySubtext: { fontSize: 13, color: '#bbb', marginTop: 4 },
  
  /* Debug Section */
  debugSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FFB74D',
    marginHorizontal: 16,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 12,
  },
  debugOrder: {
    backgroundColor: '#fff',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
});
