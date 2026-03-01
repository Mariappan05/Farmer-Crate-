import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
  Animated,
  StatusBar,
  Image,
  ActivityIndicator,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getFarmerOrders } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_COLORS = {
  PENDING: '#FF9800',
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  SHIPPED: '#00BCD4',
  OUT_FOR_DELIVERY: '#FF5722',
  DELIVERED: '#4CAF50',
  CANCELLED: '#F44336',
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const FarmerHome = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeOrders: 0,
    revenue: 0,
    rating: 0,
    activeCount: 0,
    pendingCount: 0,
    outOfStockCount: 0,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);

  const farmerName =
    authState?.user?.full_name ||
    authState?.user?.name ||
    authState?.user?.username ||
    'Farmer';

  const fetchData = useCallback(async () => {
    try {
      const [prodRes, orderRes] = await Promise.allSettled([
        api.get('/products/farmer/me'),
        getFarmerOrders(),
      ]);

      const prodList =
        prodRes.status === 'fulfilled'
          ? Array.isArray(prodRes.value.data)
            ? prodRes.value.data
            : prodRes.value.data?.products || prodRes.value.data?.data || []
          : [];
      const orderList =
        orderRes.status === 'fulfilled'
          ? Array.isArray(orderRes.value)
            ? orderRes.value
            : orderRes.value?.orders || []
          : [];

      setProducts(prodList);
      setOrders(orderList);

      const activeCount = prodList.filter(
        (p) => p.status === 'active' || p.status === 'ACTIVE' || p.is_active
      ).length;
      const pendingCount = prodList.filter(
        (p) => p.status === 'pending' || p.status === 'PENDING'
      ).length;
      const outOfStockCount = prodList.filter(
        (p) =>
          p.quantity === 0 ||
          p.stock === 0 ||
          p.status === 'out_of_stock' ||
          p.status === 'OUT_OF_STOCK'
      ).length;

      const activeOrders = orderList.filter(
        (o) => o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
      ).length;
      const deliveredOrders = orderList.filter((o) => o.status === 'DELIVERED');
      const revenue = deliveredOrders.reduce(
        (sum, o) => sum + parseFloat(o.total_amount || o.total || 0),
        0
      );

      const ratings = prodList
        .map((p) => parseFloat(p.average_rating || p.rating || 0))
        .filter((r) => r > 0);
      const avgRating =
        ratings.length > 0
          ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
          : 0;

      setStats({
        totalProducts: prodList.length,
        activeOrders,
        revenue,
        rating: avgRating,
        activeCount,
        pendingCount,
        outOfStockCount,
      });
    } catch (e) {
      console.error('FarmerHome fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
    .slice(0, 5);

  const quickActions = [
    {
      label: 'Add Product',
      icon: 'add-circle-outline',
      color: '#4CAF50',
      onPress: () => navigation.navigate('AddProduct'),
    },
    {
      label: 'View Orders',
      icon: 'receipt-outline',
      color: '#2196F3',
      onPress: () => navigation.navigate('Orders'),
    },
    {
      label: 'Edit Products',
      icon: 'create-outline',
      color: '#FF9800',
      onPress: () => navigation.navigate('EditProduct'),
    },
    {
      label: 'Selling History',
      icon: 'time-outline',
      color: '#9C27B0',
      onPress: () => navigation.navigate('History'),
    },
  ];

  const statsCards = [
    {
      title: 'Total Products',
      value: stats.totalProducts,
      icon: 'cube-outline',
      gradient: ['#4CAF50', '#388E3C'],
    },
    {
      title: 'Active Orders',
      value: stats.activeOrders,
      icon: 'cart-outline',
      gradient: ['#2196F3', '#1565C0'],
    },
    {
      title: 'Revenue',
      value: `₹${stats.revenue.toLocaleString('en-IN')}`,
      icon: 'cash-outline',
      gradient: ['#FF9800', '#F57C00'],
    },
    {
      title: 'Rating',
      value: stats.rating > 0 ? `${stats.rating} ★` : 'N/A',
      icon: 'star-outline',
      gradient: ['#9C27B0', '#7B1FA2'],
    },
  ];

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.headerContent}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()} 👋</Text>
            <Text style={styles.farmerName} numberOfLines={1}>
              {farmerName}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('Profile')}
          >
            <Ionicons name="person-circle-outline" size={36} color="#fff" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <Animated.ScrollView
        style={{ opacity: fadeAnim }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        contentContainerStyle={{ paddingBottom: 30 }}
      >
        {/* Stats Cards */}
        <View style={styles.statsGrid}>
          {statsCards.map((card, idx) => (
            <LinearGradient
              key={idx}
              colors={card.gradient}
              style={styles.statCard}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Ionicons name={card.icon} size={28} color="rgba(255,255,255,0.8)" />
              <Text style={styles.statValue}>{card.value}</Text>
              <Text style={styles.statTitle}>{card.title}</Text>
            </LinearGradient>
          ))}
        </View>

        {/* Product Status Overview */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Product Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: '#E8F5E9' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#4CAF50' }]} />
              <Text style={styles.statusLabel}>Active</Text>
              <Text style={[styles.statusCount, { color: '#4CAF50' }]}>{stats.activeCount}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: '#FFF3E0' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#FF9800' }]} />
              <Text style={styles.statusLabel}>Pending</Text>
              <Text style={[styles.statusCount, { color: '#FF9800' }]}>{stats.pendingCount}</Text>
            </View>
            <View style={[styles.statusPill, { backgroundColor: '#FFEBEE' }]}>
              <View style={[styles.statusDotBig, { backgroundColor: '#F44336' }]} />
              <Text style={styles.statusLabel}>Out of Stock</Text>
              <Text style={[styles.statusCount, { color: '#F44336' }]}>{stats.outOfStockCount}</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            {quickActions.map((action, idx) => (
              <TouchableOpacity key={idx} style={styles.actionCard} onPress={action.onPress} activeOpacity={0.7}>
                <View style={[styles.actionIcon, { backgroundColor: action.color + '18' }]}>
                  <Ionicons name={action.icon} size={26} color={action.color} />
                </View>
                <Text style={styles.actionLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Recent Orders */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Orders</Text>
            {orders.length > 0 && (
              <TouchableOpacity onPress={() => navigation.navigate('Orders')}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            )}
          </View>
          {recentOrders.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="receipt-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No orders yet</Text>
            </View>
          ) : (
            recentOrders.map((order, idx) => {
              const statusColor = STATUS_COLORS[order.status] || '#888';
              return (
                <TouchableOpacity
                  key={order.id || idx}
                  style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: statusColor }]}
                  onPress={() =>
                    navigation.navigate('FarmerOrderTracking', {
                      orderId: order.id,
                      order,
                    })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.orderTop}>
                    <Text style={styles.orderId} numberOfLines={1}>
                      {order.product?.name || order.product_name || order.customer_name || order.user?.full_name || 'Order'}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: statusColor + '18' }]}>
                      <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                        {(order.status || '').replace(/_/g, ' ')}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.orderCustomer} numberOfLines={1}>
                    {order.customer_name || order.user?.full_name || 'Customer'}
                  </Text>
                  <View style={styles.orderBottom}>
                    <Text style={styles.orderAmount}>
                      ₹{parseFloat(order.total_amount || order.total || 0).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.orderDate}>
                      {order.created_at
                        ? new Date(order.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>
      </Animated.ScrollView>

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

export default FarmerHome;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  /* Header */
  header: { paddingBottom: 20, paddingHorizontal: 20, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greeting: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  farmerName: { color: '#fff', fontSize: 22, fontWeight: '700', marginTop: 2 },
  profileBtn: { padding: 4 },

  /* Stats */
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginTop: 16 },
  statCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    margin: 6,
    borderRadius: 16,
    padding: 16,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  statValue: { color: '#fff', fontSize: 24, fontWeight: '700', marginTop: 8 },
  statTitle: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },

  /* Section */
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 12, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#43A047' },
  seeAll: { fontSize: 14, color: '#4CAF50', fontWeight: '600' },

  /* Product Status */
  statusRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statusPill: {
    flex: 1,
    marginHorizontal: 4,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statusDotBig: { width: 10, height: 10, borderRadius: 5, marginBottom: 6 },
  statusLabel: { fontSize: 12, color: '#555', marginBottom: 4 },
  statusCount: { fontSize: 20, fontWeight: '700' },

  /* Quick Actions */
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  actionCard: {
    width: (SCREEN_WIDTH - 48) / 2,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  actionIcon: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Recent Orders */
  emptyBox: { alignItems: 'center', paddingVertical: 30 },
  emptyText: { marginTop: 8, fontSize: 14, color: '#999' },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 15, fontWeight: '700', color: '#333' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  orderCustomer: { fontSize: 13, color: '#666', marginTop: 6 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' },
  orderAmount: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },
  orderDate: { fontSize: 12, color: '#999' },
});
