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
  Dimensions,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TABS = ['Products', 'Orders', 'Customers'];

const FarmerDetails = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { farmerId, farmer: initialFarmer } = route.params || {};

  const [farmer, setFarmer] = useState(initialFarmer || null);
  const [loading, setLoading] = useState(!initialFarmer);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loadingTab, setLoadingTab] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  const fId = farmerId || farmer?._id || farmer?.id;

  const fetchFarmer = useCallback(async () => {
    if (!fId) return;
    try {
      const { data } = await api
        .get(`/admin/farmers/${fId}`)
        .catch(() => api.get(`/farmers/${fId}`));
      const f = data?.farmer || data?.data || data;
      setFarmer(f);
    } catch (e) {
      console.error('Fetch farmer error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fId]);

  const fetchTabData = useCallback(async () => {
    if (!fId) return;
    setLoadingTab(true);
    try {
      if (activeTab === 0) {
        const { data } = await api
          .get(`/admin/farmers/${fId}/products`)
          .catch(() => api.get(`/farmers/${fId}/products`).catch(() => api.get(`/products?farmer=${fId}`)));
        setProducts(data?.products || data?.data || data || []);
      } else if (activeTab === 1) {
        const { data } = await api
          .get(`/admin/farmers/${fId}/orders`)
          .catch(() => api.get(`/orders?farmer=${fId}`));
        setOrders(data?.orders || data?.data || data || []);
      } else {
        const { data } = await api
          .get(`/admin/farmers/${fId}/customers`)
          .catch(() => ({ data: [] }));
        setCustomers(data?.customers || data?.data || data || []);
      }
    } catch (e) {
      console.error('Fetch tab data error:', e);
    } finally {
      setLoadingTab(false);
    }
  }, [fId, activeTab]);

  useEffect(() => {
    fetchFarmer();
  }, []);

  useEffect(() => {
    fetchTabData();
  }, [activeTab]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchFarmer();
    fetchTabData();
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

  const showOrderDetail = (order) => {
    setSelectedOrder(order);
    setOrderModalVisible(true);
  };

  // ------- Render sections -------

  const renderProductCard = ({ item }) => {
    const imgRaw = item.images?.[0] || item.image || item.product_image;
    const img = typeof imgRaw === 'string' ? imgRaw : (imgRaw?.url || imgRaw?.image_url || null);
    return (
      <View style={styles.productCard}>
        {img ? (
          <Image
            source={{ uri: optimizeImageUrl(img, { width: 120, height: 120 }) }}
            style={styles.productImage}
          />
        ) : (
          <View style={[styles.productImage, styles.productImagePlaceholder]}>
            <Ionicons name="leaf-outline" size={28} color="#aaa" />
          </View>
        )}
        <View style={styles.productInfo}>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name || item.product_name || 'Product'}
          </Text>
          <Text style={styles.productPrice}>
            {formatCurrency(item.price || item.selling_price)}
            {item.unit ? ` / ${item.unit}` : ''}
          </Text>
          <Text style={styles.productCategory}>{item.category || ''}</Text>
          {item.stock != null && (
            <Text style={styles.productStock}>Stock: {item.stock}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderOrderCard = ({ item }) => {
    const status = item.current_status || item.status || item.order_status || 'pending';
    return (
      <TouchableOpacity style={styles.orderCard} onPress={() => showOrderDetail(item)}>
        <View style={styles.orderHeader}>
          <Text style={styles.orderId} numberOfLines={1}>
            #{item.order_number || item.order_id || item._id || item.id}
          </Text>
          <View style={[styles.orderStatusBadge, { backgroundColor: getStatusColor(status) + '20' }]}>
            <Text style={[styles.orderStatusText, { color: getStatusColor(status) }]}>
              {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')}
            </Text>
          </View>
        </View>
        <Text style={styles.orderDate}>{formatDate(item.createdAt || item.created_at)}</Text>
        <Text style={styles.orderAmount}>{formatCurrency(item.total_price || item.total_amount || item.total)}</Text>
      </TouchableOpacity>
    );
  };

  const renderCustomerCard = ({ item }) => {
    const avatar = item.image_url || item.profile_image || item.avatar;
    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() =>
          navigation.navigate('CustomerDetails', {
            customerId: item.customer_id || item._id || item.id,
            customer: item,
          })
        }
      >
        {avatar ? (
          <Image
            source={{ uri: optimizeImageUrl(avatar, { width: 60, height: 60 }) }}
            style={styles.custAvatar}
          />
        ) : (
          <View style={[styles.custAvatar, styles.custAvatarPlaceholder]}>
            <Ionicons name="person" size={20} color="#fff" />
          </View>
        )}
        <View style={styles.custInfo}>
          <Text style={styles.custName} numberOfLines={1}>
            {item.full_name || item.name || 'Customer'}
          </Text>
          <Text style={styles.custEmail} numberOfLines={1}>
            {item.email || ''}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  const renderTabContent = () => {
    if (loadingTab) {
      return (
        <View style={styles.tabLoading}>
          <ActivityIndicator size="small" color="#4CAF50" />
        </View>
      );
    }

    if (activeTab === 0) {
      return products.length > 0 ? (
        <FlatList
          data={products}
          keyExtractor={(item, idx) => String(item.product_id || item._id || item.id || idx)}
          renderItem={renderProductCard}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.tabEmpty}>
          <Ionicons name="leaf-outline" size={40} color="#ccc" />
          <Text style={styles.tabEmptyText}>No products found</Text>
        </View>
      );
    }

    if (activeTab === 1) {
      return orders.length > 0 ? (
        <FlatList
          data={orders}
          keyExtractor={(item, idx) => String(item.order_id || item._id || item.id || idx)}
          renderItem={renderOrderCard}
          scrollEnabled={false}
        />
      ) : (
        <View style={styles.tabEmpty}>
          <Ionicons name="receipt-outline" size={40} color="#ccc" />
          <Text style={styles.tabEmptyText}>No orders found</Text>
        </View>
      );
    }

    return customers.length > 0 ? (
      <FlatList
        data={customers}
        keyExtractor={(item, idx) => String(item.customer_id || item._id || item.id || idx)}
        renderItem={renderCustomerCard}
        scrollEnabled={false}
      />
    ) : (
      <View style={styles.tabEmpty}>
        <Ionicons name="people-outline" size={40} color="#ccc" />
        <Text style={styles.tabEmptyText}>No customers found</Text>
      </View>
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
                <Text style={styles.modalValue}>
                  {formatCurrency(o.total_price || o.total_amount || o.total)}
                </Text>
              </View>

              {/* Items */}
              {(o.items || o.products || (o.product ? [o.product] : [])).map((item, idx) => (
                <View key={idx} style={styles.modalItem}>
                  <Text style={styles.modalItemName}>
                    {item.product_name || item.name || `Item ${idx + 1}`}
                  </Text>
                  <Text style={styles.modalItemDetail}>
                    Qty: {item.quantity || 1} × {formatCurrency(item.price)}
                  </Text>
                </View>
              ))}

              {/* Navigate to customer */}
              {(o.customer || o.customer_id) && (
                <TouchableOpacity
                  style={styles.modalNavBtn}
                  onPress={() => {
                    setOrderModalVisible(false);
                    const cust = o.customer || {};
                    navigation.navigate('CustomerDetails', {
                      customerId: cust.customer_id || cust._id || cust.id || o.customer_id,
                      customer: typeof cust === 'object' ? cust : undefined,
                    });
                  }}
                >
                  <Ionicons name="person-outline" size={16} color="#1B5E20" />
                  <Text style={styles.modalNavBtnText}>View Customer</Text>
                </TouchableOpacity>
              )}
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
        <Text style={styles.loadingText}>Loading farmer details...</Text>
      </View>
    );
  }

  if (!farmer) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
        <Text style={styles.loadingText}>Farmer not found</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = farmer.full_name || farmer.name || farmer.username || 'Unknown';
  const email = farmer.email || 'N/A';
  const phone = farmer.mobile_number || farmer.phone || farmer.mobile || 'N/A';
  const farmName = farmer.farm_name || farmer.farmName || '';
  const location =
    farmer.location ||
    [farmer.city, farmer.district, farmer.state].filter(Boolean).join(', ') ||
    'N/A';
  const avatar = farmer.image_url || farmer.profile_image || farmer.avatar;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
      >
        {/* Green gradient header */}
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
                <MaterialCommunityIcons name="sprout" size={40} color="#fff" />
              </View>
            )}
            <Text style={styles.profileName}>{name}</Text>
            {farmName ? <Text style={styles.farmName}>{farmName}</Text> : null}
          </View>
        </LinearGradient>

        {/* Info section */}
        <View style={styles.infoSection}>
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

        {/* Tabs */}
        <View style={styles.tabBar}>
          {TABS.map((tab, idx) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === idx && styles.tabItemActive]}
              onPress={() => setActiveTab(idx)}
            >
              <Text style={[styles.tabText, activeTab === idx && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab content */}
        <View style={styles.tabContent}>{renderTabContent()}</View>
      </ScrollView>

      {renderOrderModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
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
    fontWeight: '800',
    color: '#fff',
    marginTop: 10,
  },
  farmName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },

  infoSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -16,
    borderRadius: 12,
    padding: 16,
    elevation: 3,
    shadowColor: '#1B5E20',
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

  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 20,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#1B5E20',
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#1B5E20' },
  tabTextActive: { color: '#fff' },

  tabContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 30 },
  tabLoading: { paddingVertical: 40, alignItems: 'center' },
  tabEmpty: { alignItems: 'center', paddingVertical: 40 },
  tabEmptyText: { marginTop: 8, fontSize: 14, color: '#999' },

  // Product card
  productCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  productImage: { width: 90, height: 90 },
  productImagePlaceholder: {
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  productInfo: { flex: 1, padding: 10, justifyContent: 'center' },
  productName: { fontSize: 14, fontWeight: '600', color: '#333' },
  productPrice: { fontSize: 15, fontWeight: '800', color: '#1B5E20', marginTop: 4 },
  productCategory: { fontSize: 12, color: '#888', marginTop: 2 },
  productStock: { fontSize: 12, color: '#666', marginTop: 2 },

  // Order card
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    padding: 12,
    elevation: 1,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },
  orderStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  orderStatusText: { fontSize: 11, fontWeight: '600' },
  orderDate: { fontSize: 12, color: '#888', marginTop: 4 },
  orderAmount: { fontSize: 15, fontWeight: '800', color: '#1B5E20', marginTop: 4 },

  // Customer card
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  custAvatar: { width: 44, height: 44, borderRadius: 22 },
  custAvatarPlaceholder: {
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  custInfo: { flex: 1, marginLeft: 12 },
  custName: { fontSize: 14, fontWeight: '600', color: '#333' },
  custEmail: { fontSize: 12, color: '#888', marginTop: 2 },

  // Order detail modal
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
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalItemName: { fontSize: 13, fontWeight: '600', color: '#333' },
  modalItemDetail: { fontSize: 12, color: '#666', marginTop: 2 },
  modalNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    gap: 6,
  },
  modalNavBtnText: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },
});

export default FarmerDetails;
