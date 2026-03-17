import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
  Modal,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const CustomerDetails = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { customerId, customer: initialCustomer } = route.params || {};

  const [customer, setCustomer] = useState(initialCustomer || null);
  const [loading, setLoading] = useState(!initialCustomer);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  const cId = customerId || customer?.customer_id || customer?._id || customer?.id;

  const fetchCustomer = useCallback(async () => {
    if (!cId) return;
    try {
      const { data } = await api
        .get(`/admin/customers/${cId}`)
        .catch(() => api.get(`/customers/${cId}`));
      const c = data?.customer || data?.data || data;
      setCustomer(c);
    } catch (e) {
      console.error('Fetch customer error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cId]);

  const fetchOrders = useCallback(async () => {
    if (!cId) return;
    setLoadingOrders(true);
    try {
      const { data } = await api
        .get(`/admin/customers/${cId}/orders`)
        .catch(() => api.get(`/orders?customer=${cId}`));
      setOrders(data?.orders || data?.data || data || []);
    } catch (e) {
      console.error('Fetch orders error:', e);
    } finally {
      setLoadingOrders(false);
    }
  }, [cId]);

  useEffect(() => {
    fetchCustomer();
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomer();
    fetchOrders();
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount) => {
    if (amount == null) return '₹0';
    return `₹${Number(amount).toLocaleString('en-IN')}`;
  };

  const getStatusColor = (status) => {
    const s = (status || '').toLowerCase();
    if (s === 'delivered' || s === 'completed') return '#2E7D32';
    if (s === 'cancelled' || s === 'rejected') return '#C62828';
    if (s === 'pending') return '#F57F17';
    if (s === 'processing' || s === 'shipped' || s === 'in_transit') return '#1565C0';
    return '#666';
  };

  const totalSpent = orders.reduce((sum, o) => sum + Number(o.total_price || o.total_amount || o.total || 0), 0);

  const showOrderDetail = (order) => {
    setSelectedOrder(order);
    setOrderModalVisible(true);
  };

  const renderOrderCard = ({ item }) => {
    const status = item.current_status || item.status || item.order_status || 'pending';
    const productList = item.items || item.products || (item.product ? [item.product] : []);
    const productImages = productList
      .map((p) => p.product_image || p.image_url || p.image || p.images?.[0])
      .filter(Boolean);

    return (
      <TouchableOpacity style={styles.orderCard} onPress={() => showOrderDetail(item)}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderId} numberOfLines={1}>
            #{item.order_number || item.order_id || item._id || item.id}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
              {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
            </Text>
          </View>
        </View>

        {/* Product images row */}
        {productImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imgRow}
          >
            {productImages.map((img, idx) => (
              <Image
                key={idx}
                source={{ uri: optimizeImageUrl(img, { width: 60, height: 60 }) }}
                style={styles.orderProductImg}
              />
            ))}
          </ScrollView>
        )}

        <View style={styles.orderFooter}>
          <Text style={styles.orderDate}>
            {formatDate(item.createdAt || item.created_at)}
          </Text>
          <Text style={styles.orderAmount}>
            {formatCurrency(item.total_price || item.total_amount || item.total)}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  // ------- Order detail modal -------
  const renderOrderModal = () => {
    if (!selectedOrder) return null;
    const o = selectedOrder;
    const status = o.current_status || o.status || o.order_status || 'pending';

    return (
      <Modal
        visible={orderModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setOrderModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Order Details</Text>
              <TouchableOpacity onPress={() => setOrderModalVisible(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Order ID</Text>
                <Text style={styles.modalValue}>
                  #{o.order_number || o.order_id || o._id || o.id}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Status</Text>
                <Text style={[styles.modalValue, { color: getStatusColor(status) }]}>
                  {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Date</Text>
                <Text style={styles.modalValue}>
                  {formatDate(o.createdAt || o.created_at)}
                </Text>
              </View>
              <View style={styles.modalRow}>
                <Text style={styles.modalLabel}>Amount</Text>
                <Text style={[styles.modalValue, { fontWeight: '700' }]}>
                  {formatCurrency(o.total_price || o.total_amount || o.total)}
                </Text>
              </View>

              {/* Items list */}
              {(o.items || o.products || (o.product ? [o.product] : [])).map((item, idx) => {
                const img = item.product_image || item.image || item.images?.[0];
                return (
                  <View key={idx} style={styles.modalItem}>
                    {img ? (
                      <Image
                        source={{ uri: optimizeImageUrl(img, { width: 50, height: 50 }) }}
                        style={styles.modalItemImg}
                      />
                    ) : (
                      <View style={[styles.modalItemImg, styles.modalItemImgPlaceholder]}>
                        <Ionicons name="cube-outline" size={16} color="#aaa" />
                      </View>
                    )}
                    <View style={styles.modalItemInfo}>
                      <Text style={styles.modalItemName}>
                        {item.product_name || item.name || `Item ${idx + 1}`}
                      </Text>
                      <Text style={styles.modalItemDetail}>
                        Qty: {item.quantity || 1} × {formatCurrency(item.price)}
                      </Text>
                    </View>
                  </View>
                );
              })}

              {/* Navigation buttons */}
              <View style={styles.modalNavRow}>
                {(o.farmer || o.farmer_id) && (
                  <TouchableOpacity
                    style={styles.modalNavBtn}
                    onPress={() => {
                      setOrderModalVisible(false);
                      const f = o.farmer || {};
                      navigation.navigate('FarmerDetails', {
                        farmerId: f.farmer_id || f._id || f.id || o.farmer_id,
                        farmer: typeof f === 'object' ? f : undefined,
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="sprout" size={16} color="#1B5E20" />
                    <Text style={styles.modalNavBtnText}>Farmer</Text>
                  </TouchableOpacity>
                )}
                {(o.transporter || o.transporter_id) && (
                  <TouchableOpacity
                    style={[styles.modalNavBtn, { backgroundColor: '#FFF3E0' }]}
                    onPress={() => {
                      setOrderModalVisible(false);
                      const t = o.transporter || {};
                      navigation.navigate('TransporterDetails', {
                        transporterId: t.transporter_id || t._id || t.id || o.transporter_id,
                        transporter: typeof t === 'object' ? t : undefined,
                      });
                    }}
                  >
                    <MaterialCommunityIcons name="truck-outline" size={16} color="#E65100" />
                    <Text style={[styles.modalNavBtnText, { color: '#E65100' }]}>Transporter</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ------- Main render -------

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading customer details...</Text>
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
        <Text style={styles.loadingText}>Customer not found</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = customer.full_name || customer.name || customer.username || 'Unknown';
  const email = customer.email || 'N/A';
  const phone = customer.mobile_number || customer.phone || customer.mobile || 'N/A';
  const location =
    customer.location ||
    [customer.city, customer.district, customer.state].filter(Boolean).join(', ') ||
    'N/A';
  const avatar = customer.image_url || customer.profile_image || customer.avatar;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
      >
        {/* Header */}
        <LinearGradient colors={['#1B5E20', '#388E3C', '#4CAF50']} style={styles.headerGradient}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.profileSection}>
            {avatar ? (
              <Image
                source={{ uri: optimizeImageUrl(avatar, { width: 120, height: 120 }) }}
                style={styles.profileImage}
              />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="person" size={40} color="#fff" />
              </View>
            )}
            <Text style={styles.profileName}>{name}</Text>
          </View>
        </LinearGradient>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <Ionicons name="mail-outline" size={18} color="#1B5E20" />
            <Text style={styles.infoValue}>{email}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="call-outline" size={18} color="#1B5E20" />
            <Text style={styles.infoValue}>{phone}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={18} color="#1B5E20" />
            <Text style={styles.infoValue}>{location}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <MaterialCommunityIcons name="shopping" size={24} color="#1B5E20" />
            <Text style={styles.statValue}>{orders.length}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#F1F8E9' }]}>
            <MaterialCommunityIcons name="currency-inr" size={24} color="#388E3C" />
            <Text style={styles.statValue}>{formatCurrency(totalSpent)}</Text>
            <Text style={styles.statLabel}>Total Spent</Text>
          </View>
        </View>

        {/* Order History */}
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={20} color="#1B5E20" />
          <Text style={styles.sectionTitle}>Order History</Text>
        </View>

        {loadingOrders ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator size="small" color="#4CAF50" />
          </View>
        ) : orders.length > 0 ? (
          <FlatList
            data={orders}
            keyExtractor={(item, index) => String(item.order_id || item._id || item.id || index)}
            renderItem={renderOrderCard}
            scrollEnabled={false}
            contentContainerStyle={styles.ordersList}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <Ionicons name="receipt-outline" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No orders yet</Text>
          </View>
        )}

        <View style={{ height: 30 }} />
      </ScrollView>

      {renderOrderModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: { marginTop: 12, fontSize: 14, color: '#666' },
  goBackBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  goBackBtnText: { color: '#fff', fontWeight: '600' },

  headerGradient: {
    paddingBottom: 30,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  backBtn: { padding: 4, marginTop: 8, alignSelf: 'flex-start' },

  profileSection: { alignItems: 'center', marginTop: 10 },
  profileImage: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  profileImagePlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  profileName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginTop: 10,
  },

  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 12,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  infoValue: { fontSize: 14, color: '#333', flex: 1 },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1B5E20', marginTop: 4 },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },

  ordersList: { paddingHorizontal: 16, paddingTop: 10 },

  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600' },

  imgRow: { marginTop: 10, flexDirection: 'row' },
  orderProductImg: { width: 50, height: 50, borderRadius: 6, marginRight: 6 },

  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  orderDate: { fontSize: 12, color: '#888' },
  orderAmount: { fontSize: 15, fontWeight: '700', color: '#1B5E20' },

  tabLoading: { paddingVertical: 40, alignItems: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { marginTop: 8, color: '#999', fontSize: 14 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20' },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalLabel: { fontSize: 13, color: '#888' },
  modalValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalItemImg: { width: 44, height: 44, borderRadius: 6 },
  modalItemImgPlaceholder: {
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalItemInfo: { flex: 1, marginLeft: 10 },
  modalItemName: { fontSize: 13, fontWeight: '600', color: '#333' },
  modalItemDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  modalNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  modalNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    gap: 6,
  },
  modalNavBtnText: { fontSize: 13, fontWeight: '600', color: '#1B5E20' },
});

export default CustomerDetails;
