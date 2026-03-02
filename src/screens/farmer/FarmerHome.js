import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
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
import api, { BASE_URL } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getFarmerOrders } from '../../services/orderService';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Product image map for CatBoost recommended products ─────────────────────
const PRODUCT_IMAGES = {
  'Rice':              'https://images.unsplash.com/photo-1586201375761-83865001e31c?w=400&q=80',
  'Wheat':             'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=400&q=80',
  'Maize':             'https://images.unsplash.com/photo-1601593346740-925612772716?w=400&q=80',
  'Sugarcane':         'https://images.unsplash.com/photo-1559181567-c3190468d910?w=400&q=80',
  'Bajra':             'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&q=80',
  'Jowar':             'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400&q=80',
  'Tomato':            'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&q=80',
  'Onion':             'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80',
  'Potato':            'https://images.unsplash.com/photo-1518977676601-b53f82aba655?w=400&q=80',
  'Brinjal':           'https://images.unsplash.com/photo-1600189020440-893d827b2a4f?w=400&q=80',
  'Banana':            'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?w=400&q=80',
  'Coconut':           'https://images.unsplash.com/photo-1623050804186-2d986f8b3413?w=400&q=80',
  'Mango':             'https://images.unsplash.com/photo-1553279768-865429fa0078?w=400&q=80',
  'Groundnut':         'https://images.unsplash.com/photo-1567892737950-30c4db37cd89?w=400&q=80',
  'Sunflower':         'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=400&q=80',
  'Turmeric':          'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'Chilli':            'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=400&q=80',
  'Cotton':            'https://images.unsplash.com/photo-1605000797499-95a51c5269ae?w=400&q=80',
  'Goat':              'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400&q=80',
  'Sheep':             'https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=400&q=80',
  'Cow Milk':          'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'Goat Milk':         'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&q=80',
  'Eggs':              'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400&q=80',
  'Tilapia':           'https://images.unsplash.com/photo-1534482421-64566f976cfa?w=400&q=80',
  'Shrimp':            'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&q=80',
  'Prawn':             'https://images.unsplash.com/photo-1565680018434-b513d5e5fd47?w=400&q=80',
};
const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&q=80';

const GRADE_CONFIG = {
  Excellent: { bg: '#E8F5E9', text: '#2E7D32', icon: '🏆' },
  Good:      { bg: '#E3F2FD', text: '#1565C0', icon: '✅' },
  Fair:      { bg: '#FFF8E1', text: '#F57F17', icon: '⚡' },
};

const CARD_WIDTH = 160;

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

  const [recommendations, setRecommendations] = useState([]);
  const [recDistrict, setRecDistrict]         = useState('');
  const [recLoading, setRecLoading]           = useState(true);
  const [recError, setRecError]               = useState(null);

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

  const fetchRecommendations = useCallback(async () => {
    console.log('========================================');
    console.log('[REC] fetchRecommendations() — START');
    setRecLoading(true);
    setRecError(null);
    try {
      console.log('[REC] Calling API: GET /recommendations/farmer');
      console.log('[REC] Full URL    :', `${BASE_URL}/recommendations/farmer`);
      const res = await api.get('/recommendations/farmer');

      console.log('[REC] Response Status :', res.status);
      console.log('[REC] Response Headers:', JSON.stringify(res.headers));
      console.log('[REC] Response Data   :', JSON.stringify(res.data, null, 2));

      if (res.data?.success) {
        const list = res.data.weekly_recommendations || [];
        const district = res.data.district || '';
        console.log('[REC] ✅ Success — district:', district);
        console.log('[REC] Total recommendations:', list.length);
        if (list.length > 0) {
          console.log('[REC] First item:', JSON.stringify(list[0], null, 2));
        } else {
          console.warn('[REC] ⚠️  weekly_recommendations array is EMPTY');
        }
        setRecommendations(list);
        setRecDistrict(district);
      } else {
        console.warn('[REC] ⚠️  success=false in response');
        console.warn('[REC] message:', res.data?.message);
        setRecError(res.data?.message || 'Could not load recommendations');
      }
    } catch (e) {
      console.error('[REC] ❌ EXCEPTION caught:');
      console.error('[REC] message   :', e.message);
      console.error('[REC] name      :', e.name);
      if (e.response) {
        console.error('[REC] HTTP status   :', e.response.status);
        console.error('[REC] HTTP data     :', JSON.stringify(e.response.data));
        console.error('[REC] HTTP headers  :', JSON.stringify(e.response.headers));
      } else if (e.request) {
        console.error('[REC] No response received — possible network/CORS/timeout');
        console.error('[REC] Request config:', JSON.stringify(e.config?.url), JSON.stringify(e.config?.baseURL));
      } else {
        console.error('[REC] Error setting up request:', e.message);
      }
      setRecError('Could not load recommendations');
    } finally {
      setRecLoading(false);
      console.log('[REC] fetchRecommendations() — END');
      console.log('========================================');
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchRecommendations();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchRecommendations();
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
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
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

        {/* ── Weekly Recommendations ───────────────────────────────────────── */}
        <View style={styles.recSection}>
          <LinearGradient colors={['#1B5E20', '#2E7D32']} style={styles.recHeader}>
            <View style={styles.recHeaderLeft}>
              <Text style={styles.recTitle}>🌾 Weekly Recommendations</Text>
              {recDistrict ? (
                <Text style={styles.recSubtitle}>📍 Based on {recDistrict} district</Text>
              ) : null}
            </View>
            <View style={styles.recBadge}>
              <Text style={styles.recBadgeText}>AI Powered</Text>
            </View>
          </LinearGradient>

          {recLoading ? (
            <View style={styles.recLoader}>
              <ActivityIndicator size="large" color="#4CAF50" />
              <Text style={styles.recLoaderText}>Fetching recommendations…</Text>
            </View>
          ) : recError ? (
            <TouchableOpacity style={styles.recError} onPress={fetchRecommendations}>
              <Ionicons name="cloud-offline-outline" size={36} color="#F44336" />
              <Text style={styles.recErrorText}>{recError}</Text>
              <Text style={styles.recRetry}>Tap to retry</Text>
            </TouchableOpacity>
          ) : recommendations.length === 0 ? (
            <View style={styles.recEmpty}>
              <Ionicons name="leaf-outline" size={40} color="#ccc" />
              <Text style={styles.recEmptyText}>No recommendations yet</Text>
            </View>
          ) : (
            <FlatList
              data={recommendations}
              horizontal
              keyExtractor={(item, i) => `rec-${item.product}-${i}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recList}
              snapToInterval={CARD_WIDTH + 14}
              decelerationRate="fast"
              renderItem={({ item }) => {
                const grade = GRADE_CONFIG[item.grade] || GRADE_CONFIG.Fair;
                const imgUri = PRODUCT_IMAGES[item.product] || DEFAULT_PRODUCT_IMAGE;
                return (
                  <View style={styles.recCard}>
                    {/* Product Image */}
                    <View style={styles.recImgContainer}>
                      <Image
                        source={{ uri: imgUri }}
                        style={styles.recImg}
                        resizeMode="cover"
                      />
                      {/* Grade badge */}
                      <View style={[styles.gradeBadge, { backgroundColor: grade.bg }]}>
                        <Text style={[styles.gradeBadgeText, { color: grade.text }]}>
                          {grade.icon} {item.grade}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.recCardBody}>
                      {/* Product Name */}
                      <Text style={styles.recProductName} numberOfLines={1}>
                        {item.product}
                      </Text>

                      {/* Category */}
                      <View style={styles.recCategoryRow}>
                        <Ionicons name="pricetag-outline" size={11} color="#888" />
                        <Text style={styles.recCategory}>{item.category}</Text>
                      </View>

                      {/* Price */}
                      <View style={styles.recPriceRow}>
                        <Ionicons name="cash-outline" size={13} color="#2E7D32" />
                        <Text style={styles.recPrice}>
                          ₹{(item.estimated_price_per_quintal || 0).toLocaleString('en-IN')}
                          <Text style={styles.recPriceUnit}>/qtl</Text>
                        </Text>
                      </View>

                      {/* Score bar */}
                      <View style={styles.scoreBarBg}>
                        <View
                          style={[
                            styles.scoreBarFill,
                            { width: `${Math.round((item.overall_score || 0) * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.scoreText}>
                        Suitability: {Math.round((item.overall_score || 0) * 100)}%
                      </Text>

                      {/* Already posted / New opportunity */}
                      {item.already_posted ? (
                        <View style={styles.alreadyPosted}>
                          <Ionicons name="checkmark-circle" size={13} color="#4CAF50" />
                          <Text style={styles.alreadyPostedText}>You post this</Text>
                        </View>
                      ) : (
                        <View style={styles.newOpportunity}>
                          <Ionicons name="bulb-outline" size={13} color="#FF9800" />
                          <Text style={styles.newOpportunityText}>New Opportunity</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
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

  /* ── Weekly Recommendations ─────────── */
  recSection: {
    marginTop: 22,
    marginHorizontal: 0,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginHorizontal: 16,
    borderRadius: 16,
    marginBottom: 14,
  },
  recHeaderLeft: { flex: 1 },
  recTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  recSubtitle: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 3 },
  recBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  recBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  recList: { paddingHorizontal: 16, paddingBottom: 8 },
  recLoader: { alignItems: 'center', paddingVertical: 30 },
  recLoaderText: { color: '#888', fontSize: 13, marginTop: 10 },
  recError: { alignItems: 'center', paddingVertical: 28 },
  recErrorText: { color: '#F44336', fontSize: 14, marginTop: 8 },
  recRetry: { color: '#4CAF50', fontSize: 13, marginTop: 4, textDecorationLine: 'underline' },
  recEmpty: { alignItems: 'center', paddingVertical: 28 },
  recEmptyText: { color: '#aaa', fontSize: 14, marginTop: 8 },

  /* Card */
  recCard: {
    width: CARD_WIDTH,
    backgroundColor: '#fff',
    borderRadius: 18,
    marginRight: 14,
    elevation: 5,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.13,
    shadowRadius: 8,
    overflow: 'hidden',
  },
  recImgContainer: { width: '100%', height: 110, position: 'relative' },
  recImg: { width: '100%', height: '100%' },
  gradeBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  gradeBadgeText: { fontSize: 10, fontWeight: '700' },
  recCardBody: { padding: 10 },
  recProductName: { fontSize: 14, fontWeight: '800', color: '#1B5E20', marginBottom: 4 },
  recCategoryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  recCategory: { fontSize: 11, color: '#888', marginLeft: 3 },
  recPriceRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 7 },
  recPrice: { fontSize: 13, fontWeight: '700', color: '#2E7D32', marginLeft: 4 },
  recPriceUnit: { fontSize: 10, fontWeight: '400', color: '#888' },
  scoreBarBg: {
    height: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 2,
    marginBottom: 3,
    overflow: 'hidden',
  },
  scoreBarFill: { height: '100%', backgroundColor: '#43A047', borderRadius: 2 },
  scoreText: { fontSize: 10, color: '#888', marginBottom: 7 },
  alreadyPosted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  alreadyPostedText: { fontSize: 10, color: '#2E7D32', fontWeight: '700', marginLeft: 4 },
  newOpportunity: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  newOpportunityText: { fontSize: 10, color: '#E65100', fontWeight: '700', marginLeft: 4 },
});
