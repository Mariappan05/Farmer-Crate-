import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Dimensions,
  Linking,
  Modal,
  RefreshControl,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { updateDeliveryAvailability } from '../../services/authService';
import { getDeliveryDrops, getDeliveryPickups } from '../../services/orderService';
import useAutoRefresh from '../../hooks/useAutoRefresh';
import ToastMessage from '../../utils/Toast';
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_COLORS = {
  PENDING: Colors.warning,
  CONFIRMED: '#2196F3',
  ASSIGNED: '#9C27B0',
  PICKUP_IN_PROGRESS: '#00BCD4',
  PICKED_UP: '#00897B',
  SHIPPED: '#FF5722',
  IN_TRANSIT: '#00BCD4',
  OUT_FOR_DELIVERY: Colors.warning,
  DELIVERED: Colors.success,
  COMPLETED: Colors.success,
  CANCELLED: Colors.error,
};

const ACTIVE_PICKUP_STATUSES = ['ASSIGNED', 'PICKUP_ASSIGNED', 'PICKUP_IN_PROGRESS'];
const ACTIVE_DELIVERY_STATUSES = ['IN_TRANSIT', 'REACHED_DESTINATION', 'OUT_FOR_DELIVERY'];

const pickFirst = (...values) => values.find((value) => !!value);

const formatAddress = (rawAddress) => {
  if (!rawAddress) return null;

  let parsed = rawAddress;
  if (typeof rawAddress === 'string') {
    try {
      parsed = JSON.parse(rawAddress);
    } catch {
      return rawAddress;
    }
  }

  if (typeof parsed !== 'object') return String(parsed);

  return [
    parsed.full_name,
    parsed.address_line,
    parsed.landmark,
    parsed.city,
    parsed.district,
    parsed.state,
    parsed.pincode,
    parsed.zone,
  ]
    .filter(Boolean)
    .join(', ');
};

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const DeliveryDashboard = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pickupOrders, setPickupOrders] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [isAvailable, setIsAvailable] = useState(true);
  const [togglingAvailability, setTogglingAvailability] = useState(false);
  const [showStartupModal, setShowStartupModal] = useState(false);
  const [availabilityModalVisible, setAvailabilityModalVisible] = useState(false);
  const [pendingAvailability, setPendingAvailability] = useState(null);
  const [stats, setStats] = useState({
    todayDeliveries: 0,
    todayEarnings: 0,
    rating: 0,
    totalCompleted: 0,
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);
  const startupPromptShownRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);
  const appExitSyncRef = useRef(false);

  const deliveryName =
    authState?.user?.full_name ||
    authState?.user?.name ||
    authState?.user?.username ||
    'Delivery Partner';

  // ─── Fetch data ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      console.log('[DeliveryDashboard] Starting to fetch data...');
      console.log('[DeliveryDashboard] Auth state:', authState?.user);
      console.log('[DeliveryDashboard] User role:', authState?.user?.role);
      console.log('[DeliveryDashboard] Delivery person ID:', authState?.user?.delivery_person_id);
      console.log('[DeliveryDashboard] User ID (fallback):', authState?.user?.id);
      console.log('[DeliveryDashboard] Full token payload:', authState?.token ? JSON.parse(atob(authState.token.split('.')[1])) : 'No token');
      
      const [pickupRes, dropRes, profileRes] = await Promise.allSettled([
        getDeliveryPickups(),
        getDeliveryDrops(),
        api.get('/delivery-persons/profile'),
      ]);

      console.log('[DeliveryDashboard] Pickup response status:', pickupRes.status);
      console.log('[DeliveryDashboard] Drop response status:', dropRes.status);
      
      if (pickupRes.status === 'rejected') {
        console.error('[DeliveryDashboard] Pickup fetch failed:', pickupRes.reason);
      }
      if (dropRes.status === 'rejected') {
        console.error('[DeliveryDashboard] Drop fetch failed:', dropRes.reason);
      }

      const pickups =
        pickupRes.status === 'fulfilled'
          ? Array.isArray(pickupRes.value) ? pickupRes.value
            : pickupRes.value?.data || pickupRes.value?.orders || []
          : [];
      const drops =
        dropRes.status === 'fulfilled'
          ? Array.isArray(dropRes.value) ? dropRes.value
            : dropRes.value?.data || dropRes.value?.orders || []
          : [];

      console.log('[DeliveryDashboard] Pickups count:', pickups.length);
      console.log('[DeliveryDashboard] Drops count:', drops.length);
      console.log('[DeliveryDashboard] Pickups data:', pickups);
      console.log('[DeliveryDashboard] Drops data:', drops);

      const activePickups = pickups.filter((o) =>
        ACTIVE_PICKUP_STATUSES.includes((o.current_status || o.status || '').toUpperCase())
      );
      const activeDrops = drops.filter((o) =>
        ACTIVE_DELIVERY_STATUSES.includes((o.current_status || o.status || '').toUpperCase())
      );

      setPickupOrders(activePickups);
      setDeliveryOrders(activeDrops);
      if (profileRes.status === 'fulfilled') {
        const prof = profileRes.value?.data?.data || profileRes.value?.data || profileRes.value || {};
        const rawAvailability = prof?.is_available;
        const availability =
          typeof rawAvailability === 'boolean'
            ? rawAvailability
            : typeof rawAvailability === 'number'
              ? rawAvailability === 1
              : typeof rawAvailability === 'string'
                ? rawAvailability.toLowerCase() === 'true' || rawAvailability === '1'
                : null;

        if (availability !== null) {
          setIsAvailable(availability);
        }

        if (availability === false && !startupPromptShownRef.current) {
          startupPromptShownRef.current = true;
          setShowStartupModal(true);
        }
        setStats((prev) => ({
          ...prev,
          rating: parseFloat(prof.rating || prof.average_rating || 0),
        }));
      }

      // Today's stats from completed orders
      const today = new Date().toISOString().slice(0, 10);
      const allDone = [...pickups, ...drops].filter(
        (o) =>
          (o.current_status === 'DELIVERED' || o.current_status === 'COMPLETED') &&
          (o.delivery_date || o.updated_at || '').slice(0, 10) === today
      );
      const todayEarnings = allDone.reduce(
        (s, o) => s + Number(o.delivery_charge || o.earnings || o.transport_charge || 0),
        0
      );
      setStats((prev) => ({
        ...prev,
        todayDeliveries: allDone.length,
        todayEarnings,
        totalCompleted: [...pickups, ...drops].filter(
          (o) => o.current_status === 'DELIVERED' || o.current_status === 'COMPLETED'
        ).length,
      }));
    } catch (e) {
      console.error('[DeliveryDashboard] Error fetching data:', e);
      console.error('[DeliveryDashboard] Error details:', e.response?.data || e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useAutoRefresh(fetchData, 10000);

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  }, []);

  // Best-effort status sync when app goes background/exit-like state.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      appStateRef.current = nextState;

      if ((nextState === 'inactive' || nextState === 'background') && isAvailable && !appExitSyncRef.current) {
        appExitSyncRef.current = true;
        try {
          await updateDeliveryAvailability(false, authState?.token);
          setIsAvailable(false);
        } catch {
          // Ignore network failures on app exit/background transition.
        } finally {
          appExitSyncRef.current = false;
        }
      }
    });

    return () => sub.remove();
  }, [isAvailable, authState?.token]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openAvailabilityModal = (value) => {
    if (togglingAvailability) return;
    setPendingAvailability(value);
    setAvailabilityModalVisible(true);
  };

  // ─── Availability toggle ─────────────────────────────────────────────
  const toggleAvailability = async (val) => {
    setTogglingAvailability(true);
    try {
      await updateDeliveryAvailability(val, authState?.token);
      setIsAvailable(val);
      toastRef.current?.show(val ? 'You are now available for deliveries' : 'You are now offline', 'success');
    } catch (e) {
      console.log('Availability error:', e.message);
      toastRef.current?.show('Failed to update availability status', 'error');
    } finally {
      setTogglingAvailability(false);
    }
  };

  // ─── Navigate to map ─────────────────────────────────────────────────
  const openNavigate = (address) => {
    const normalizedAddress = formatAddress(address);
    if (!normalizedAddress) return;
    const query = encodeURIComponent(normalizedAddress);
    Linking.openURL(`https://maps.google.com/maps?q=${query}`).catch(() => {});
  };

  // ─── Pickup card ──────────────────────────────────────────────────────
  const renderPickupCard = (order) => {
    const status = order.current_status || order.status || '';
    const color = STATUS_COLORS[status] || '#888';
    const farmerName =
      pickFirst(
        order.farmer?.name,
        order.farmer?.full_name,
        order.pickup_farmer?.name,
        order.farmer_name,
        order.pickup_farmer_name,
        'Farmer'
      );
    const pickupAddress = formatAddress(
      pickFirst(
        order.farmer?.address,
        order.farmer?.farm_address,
        order.farmer?.address_line,
        order.pickup_farmer?.address,
        order.farmer_address,
        order.pickup_address,
        order.farm_address,
        null
      )
    );
    return (
      <TouchableOpacity
        key={order.order_id || order.id}
        style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: color }]}
        onPress={() => navigation.navigate('OrderDetails', { orderId: order.order_id || order.id, order })}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardHeader}>
          <View style={styles.orderIdRow}>
            <Ionicons name="cube-outline" size={18} color="#1B5E20" />
            <Text style={styles.orderId} numberOfLines={1}>
              {order.product?.name || order.product_name || order.farmer?.name || order.farmer_name || 'Pickup'}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Farmer / pickup info */}
        <View style={styles.infoSection}>
          <Ionicons name="person-outline" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={1}>
            {farmerName}
          </Text>
        </View>
        <View style={styles.infoSection}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={2}>
            {pickupAddress || 'Pickup address'}
          </Text>
        </View>

        {/* Product details */}
        {(order.product?.name || order.product_name) && (
          <View style={styles.infoSection}>
            <MaterialCommunityIcons name="package-variant" size={16} color="#666" />
            <Text style={styles.infoText} numberOfLines={1}>
              {order.product?.name || order.product_name}
              {order.quantity ? ` × ${order.quantity}` : ''}
            </Text>
          </View>
        )}

        <View style={styles.orderCardFooter}>
          <Text style={styles.orderAmount}>
            ₹{Number(order.total_price || order.total_amount || 0).toFixed(0)}
          </Text>
          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={() => openNavigate(pickupAddress)}
          >
            <Ionicons name="navigate-outline" size={16} color="#fff" />
            <Text style={styles.navigateBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Delivery card ────────────────────────────────────────────────────
  const renderDeliveryCard = (order) => {
    const status = order.current_status || order.status || '';
    const color = STATUS_COLORS[status] || '#888';
    const customerName =
      pickFirst(
        order.customer?.name,
        order.customer?.full_name,
        order.delivery_customer?.name,
        order.customer_name,
        order.delivery_customer_name,
        order.product?.name,
        'Delivery'
      );
    const deliveryAddress = formatAddress(
      pickFirst(
        order.delivery_address,
        order.customer?.address,
        order.customer?.address_line,
        order.delivery_customer?.address,
        order.destination_address,
        order.destination_transporter_address,
        null
      )
    );
    return (
      <TouchableOpacity
        key={order.order_id || order.id}
        style={[styles.orderCard, { borderLeftWidth: 4, borderLeftColor: color }]}
        onPress={() => navigation.navigate('OrderDetails', { orderId: order.order_id || order.id, order })}
        activeOpacity={0.7}
      >
        <View style={styles.orderCardHeader}>
          <View style={styles.orderIdRow}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={18} color="#1B5E20" />
            <Text style={styles.orderId} numberOfLines={1}>
              {customerName}
            </Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: color + '20' }]}>
            <Text style={[styles.statusBadgeText, { color }]}>
              {status.replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        <View style={styles.infoSection}>
          <Ionicons name="person-outline" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={1}>
            {customerName}
          </Text>
        </View>
        <View style={styles.infoSection}>
          <Ionicons name="location-outline" size={16} color="#666" />
          <Text style={styles.infoText} numberOfLines={2}>
            {deliveryAddress || 'Delivery address'}
          </Text>
        </View>

        <View style={styles.orderCardFooter}>
          <Text style={styles.orderAmount}>
            ₹{Number(order.total_price || order.total_amount || 0).toFixed(0)}
          </Text>
          <TouchableOpacity
            style={styles.navigateBtn}
            onPress={() => openNavigate(deliveryAddress)}
          >
            <Ionicons name="navigate-outline" size={16} color="#fff" />
            <Text style={styles.navigateBtnText}>Navigate</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={Colors.gradientHeroDark} style={styles.header}>
        <View style={styles.headerOrbOne} />
        <View style={styles.headerOrbTwo} />
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name}>{deliveryName}</Text>
            <Text style={styles.subtitle}>Stay focused, deliver faster</Text>
          </View>
          <TouchableOpacity
            style={styles.notifBtn}
            onPress={() => navigation.navigate('Scanner')}
          >
            <Ionicons name="qr-code-outline" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Availability Toggle */}
        <View style={styles.availabilityRow}>
          <View style={styles.availabilityLeft}>
            <View
              style={[
                styles.availabilityDot,
                { backgroundColor: isAvailable ? '#4CAF50' : '#F44336' },
              ]}
            />
            <Text style={styles.availabilityText}>
              {isAvailable ? 'Available for Deliveries' : 'Currently Offline'}
            </Text>
          </View>
          {togglingAvailability ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Switch
              value={isAvailable}
              onValueChange={openAvailabilityModal}
              trackColor={{ false: '#666', true: '#81C784' }}
              thumbColor={isAvailable ? '#fff' : '#ccc'}
            />
          )}
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading dashboard...</Text>
        </View>
      ) : (
        <Animated.ScrollView
          style={{ opacity: fadeAnim }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={[styles.statCard, { borderTopColor: '#4CAF50' }]}>
              <Ionicons name="today-outline" size={22} color="#4CAF50" />
              <Text style={[styles.statVal, { color: '#4CAF50' }]}>{stats.todayDeliveries}</Text>
              <Text style={styles.statLabel}>Today</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: '#2196F3' }]}>
              <Ionicons name="wallet-outline" size={22} color="#2196F3" />
              <Text style={[styles.statVal, { color: '#2196F3' }]}>₹{stats.todayEarnings.toFixed(0)}</Text>
              <Text style={styles.statLabel}>Earnings</Text>
            </View>
            <View style={[styles.statCard, { borderTopColor: '#FF9800' }]}>
              <Ionicons name="star-outline" size={22} color="#FF9800" />
              <Text style={[styles.statVal, { color: '#FF9800' }]}>
                {stats.rating > 0 ? stats.rating.toFixed(1) : '—'}
              </Text>
              <Text style={styles.statLabel}>Rating</Text>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
          </View>
          <View style={styles.quickActionsRow}>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('Scanner')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="qr-code-outline" size={24} color="#2196F3" />
              </View>
              <Text style={styles.quickActionText}>Scan QR</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('History')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#FFF3E0' }]}>
                <Ionicons name="time-outline" size={24} color="#FF9800" />
              </View>
              <Text style={styles.quickActionText}>History</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickAction}
              onPress={() => navigation.navigate('Earnings')}
            >
              <View style={[styles.quickActionIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="wallet-outline" size={24} color="#4CAF50" />
              </View>
              <Text style={styles.quickActionText}>Earnings</Text>
            </TouchableOpacity>
          </View>

          {/* Pending Counts */}
          {isAvailable && (
            <View style={styles.pendingCountRow}>
              <View style={[styles.pendingCountCard, { borderLeftColor: '#FF5722' }]}>
                <Text style={styles.pendingCountVal}>{pickupOrders.length}</Text>
                <Text style={styles.pendingCountLabel}>Pending Pickups</Text>
              </View>
              <View style={[styles.pendingCountCard, { borderLeftColor: '#2196F3' }]}>
                <Text style={styles.pendingCountVal}>{deliveryOrders.length}</Text>
                <Text style={styles.pendingCountLabel}>Pending Deliveries</Text>
              </View>
            </View>
          )}

          {/* Offline Notice */}
          {!isAvailable && (
            <View style={styles.offlineCard}>
              <View style={styles.offlineIconWrap}>
                <Ionicons name="pause-circle-outline" size={30} color="#FF9800" />
              </View>
              <Text style={styles.offlineTitle}>You are offline</Text>
              <Text style={styles.offlineMsg}>
                Orders assigned by transporter are hidden while you are offline. Turn on availability to view active tasks.
              </Text>
              <TouchableOpacity
                style={styles.goOnlineBtn}
                onPress={() => toggleAvailability(true)}
              >
                <Text style={styles.goOnlineBtnText}>Go Online</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Pickup Orders */}
          {isAvailable && pickupOrders.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <Ionicons name="cube-outline" size={20} color="#1B5E20" />
                <Text style={styles.sectionTitle}>Pending Pickups ({pickupOrders.length})</Text>
              </View>
              {pickupOrders.map(renderPickupCard)}
            </>
          )}

          {/* Delivery Orders */}
          {isAvailable && deliveryOrders.length > 0 && (
            <>
              <View style={styles.sectionHeader}>
                <MaterialCommunityIcons name="truck-delivery-outline" size={20} color="#1B5E20" />
                <Text style={styles.sectionTitle}>Pending Deliveries ({deliveryOrders.length})</Text>
              </View>
              {deliveryOrders.map(renderDeliveryCard)}
            </>
          )}

          {/* Empty state */}
          {isAvailable && pickupOrders.length === 0 && deliveryOrders.length === 0 && (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="check-circle-outline" size={64} color="#C8E6C9" />
              <Text style={styles.emptyTitle}>All Caught Up!</Text>
              <Text style={styles.emptyMsg}>No pending orders right now. Take a break!</Text>
              <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
                <Ionicons name="refresh-outline" size={18} color="#388E3C" />
                <Text style={styles.refreshBtnText}>Refresh</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.ScrollView>
      )}

      <Modal
        visible={showStartupModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStartupModal(false)}
      >
        <View style={styles.startupModalOverlay}>
          <View style={styles.startupModalCard}>
            <View style={styles.startupModalIconWrap}>
              <Ionicons name="information-circle-outline" size={30} color="#FF9800" />
            </View>
            <Text style={styles.startupModalTitle}>You are currently offline</Text>
            <Text style={styles.startupModalText}>
              Switch to available mode to receive and view active pickup and delivery orders.
            </Text>
            <View style={styles.startupModalActions}>
              <TouchableOpacity
                style={styles.startupLaterBtn}
                onPress={() => setShowStartupModal(false)}
              >
                <Text style={styles.startupLaterBtnText}>Later</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.startupOnlineBtn}
                onPress={async () => {
                  setShowStartupModal(false);
                  await toggleAvailability(true);
                }}
              >
                <Text style={styles.startupOnlineBtnText}>Go Online</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={availabilityModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAvailabilityModalVisible(false)}
      >
        <View style={styles.startupModalOverlay}>
          <View style={styles.startupModalCard}>
            <View style={styles.startupModalIconWrap}>
              <Ionicons
                name={pendingAvailability ? 'radio-button-on-outline' : 'radio-button-off-outline'}
                size={30}
                color={pendingAvailability ? '#4CAF50' : '#F44336'}
              />
            </View>
            <Text style={styles.startupModalTitle}>
              {pendingAvailability ? 'Go available?' : 'Go offline?'}
            </Text>
            <Text style={styles.startupModalText}>
              {pendingAvailability
                ? 'You will start receiving pickup and delivery assignments.'
                : 'Active assignment cards will be hidden until you turn availability back on.'}
            </Text>
            <View style={styles.startupModalActions}>
              <TouchableOpacity
                style={styles.startupLaterBtn}
                onPress={() => {
                  setAvailabilityModalVisible(false);
                  setPendingAvailability(null);
                }}
              >
                <Text style={styles.startupLaterBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.startupOnlineBtn}
                onPress={async () => {
                  const next = pendingAvailability;
                  setAvailabilityModalVisible(false);
                  setPendingAvailability(null);
                  if (typeof next === 'boolean') await toggleAvailability(next);
                }}
              >
                <Text style={styles.startupOnlineBtnText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.base,
    paddingBottom: Spacing.xl,
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
    overflow: 'hidden',
  },
  headerOrbOne: {
    position: 'absolute',
    right: -40,
    top: -24,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: Colors.headerBlob1,
  },
  headerOrbTwo: {
    position: 'absolute',
    right: 52,
    top: 20,
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: Colors.headerBlob2,
  },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: Font.base, color: Colors.textOnDarkSoft },
  name: {
    fontSize: Font.xxxl,
    fontWeight: Font.weightExtraBold,
    color: Colors.textOnDark,
    marginTop: 2,
    letterSpacing: Font.trackTight,
  },
  subtitle: { fontSize: Font.sm, color: Colors.textOnDarkMuted, marginTop: 5 },
  notifBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.glassBgStrong,
    borderWidth: 1,
    borderColor: Colors.glassBorderStrong,
    justifyContent: 'center', alignItems: 'center',
  },

  // Availability
  availabilityRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: Colors.glassBg,
    borderWidth: 1,
    borderColor: Colors.glassBorder,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  availabilityLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  availabilityDot: { width: 10, height: 10, borderRadius: 5 },
  availabilityText: { color: Colors.textOnDark, fontSize: Font.md, fontWeight: Font.weightSemiBold },

  // Loading
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.textSecondary, marginTop: 12, fontSize: Font.base },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    alignItems: 'center',
    borderTopWidth: 3,
    gap: 4,
    ...shadowStyle('sm'),
  },
  statVal: { fontSize: Font.xxl, fontWeight: Font.weightExtraBold },
  statLabel: { fontSize: Font.xs, color: Colors.textMuted, textAlign: 'center' },

  // Quick Actions
  quickActionsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    ...shadowStyle('xs'),
  },
  quickActionIcon: {
    width: 56, height: 56, borderRadius: Radius.lg, justifyContent: 'center', alignItems: 'center',
  },
  quickActionText: { fontSize: Font.sm, fontWeight: Font.weightSemiBold, color: Colors.textSecondary },

  // Pending counts
  pendingCountRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  pendingCountCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    borderLeftWidth: 4,
    ...shadowStyle('xs'),
  },
  pendingCountVal: { fontSize: 28, fontWeight: Font.weightExtraBold, color: Colors.textPrimary },
  pendingCountLabel: { fontSize: Font.sm, color: Colors.textMuted, marginTop: 4 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#1B5E20', paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#43A047' },

  // Order cards
  orderCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: 12,
    ...shadowStyle('sm'),
  },
  orderCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  orderIdRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  orderId: { fontSize: Font.md, fontWeight: Font.weightBold, color: Colors.textPrimary },
  statusBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 10, fontWeight: Font.weightBold, textTransform: 'uppercase' },
  infoSection: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  infoText: { flex: 1, fontSize: Font.sm, color: Colors.textSecondary, lineHeight: 19 },
  orderCardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f5f5f5' },
  orderAmount: { fontSize: Font.lg, fontWeight: Font.weightBold, color: Colors.textPrimary },
  navigateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primaryMid,
    borderRadius: Radius.md, paddingHorizontal: 14, paddingVertical: 8,
  },
  navigateBtnText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightSemiBold },

  // Empty
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: 40,
    alignItems: 'center',
    marginTop: 10,
    ...shadowStyle('sm'),
  },
  emptyTitle: { fontSize: Font.xxl, fontWeight: Font.weightBold, color: Colors.textPrimary, marginTop: 16 },
  emptyMsg: { fontSize: Font.base, color: Colors.textMuted, textAlign: 'center', marginTop: 8 },
  refreshBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 20,
    backgroundColor: Colors.primaryXSoft,
    borderRadius: Radius.md,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  refreshBtnText: { color: Colors.primaryMid, fontSize: Font.base, fontWeight: Font.weightSemiBold },

  // Offline card
  offlineCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 20,
    alignItems: 'center',
    marginBottom: 18,
    ...shadowStyle('sm'),
  },
  offlineIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#FFF3E0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  offlineTitle: { fontSize: Font.lg, fontWeight: Font.weightBold, color: Colors.textPrimary },
  offlineMsg: { fontSize: Font.sm, color: Colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  goOnlineBtn: {
    marginTop: 14,
    backgroundColor: Colors.primaryMid,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  goOnlineBtnText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightBold },

  // Startup modal
  startupModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  startupModalCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: 22,
    ...shadowStyle('md'),
  },
  startupModalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3E0',
    alignSelf: 'center',
    marginBottom: 10,
  },
  startupModalTitle: { textAlign: 'center', fontSize: Font.lg, fontWeight: Font.weightBold, color: Colors.textPrimary },
  startupModalText: { textAlign: 'center', fontSize: Font.sm, color: Colors.textMuted, marginTop: 8, lineHeight: 20 },
  startupModalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  startupLaterBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  startupLaterBtnText: { color: Colors.textSecondary, fontSize: Font.sm, fontWeight: Font.weightSemiBold },
  startupOnlineBtn: {
    flex: 1,
    backgroundColor: Colors.primaryMid,
    borderRadius: Radius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  startupOnlineBtnText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightBold },
});

export default DeliveryDashboard;
