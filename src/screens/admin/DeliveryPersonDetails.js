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

const DeliveryPersonDetails = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { deliveryPersonId, deliveryPerson: initialPerson } = route.params || {};

  const [person, setPerson] = useState(initialPerson || null);
  const [loading, setLoading] = useState(!initialPerson);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  const pId = deliveryPersonId || person?.delivery_person_id || person?._id || person?.id;

  const fetchPerson = useCallback(async () => {
    if (!pId) return;
    try {
      const { data } = await api
        .get(`/admin/delivery-persons/${pId}`)
        .catch(() => api.get(`/delivery-persons/${pId}`));
      const p = data?.deliveryPerson || data?.delivery_person || data?.data || data;
      setPerson(p);
    } catch (e) {
      console.error('Fetch delivery person error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [pId]);

  const fetchOrders = useCallback(async () => {
    if (!pId) return;
    setLoadingOrders(true);
    try {
      const { data } = await api
        .get(`/admin/delivery-persons/${pId}/orders`)
        .catch(() => api.get(`/orders?delivery_person=${pId}`));
      setOrders(data?.orders || data?.data || data || []);
    } catch (e) {
      console.error('Fetch orders error:', e);
    } finally {
      setLoadingOrders(false);
    }
  }, [pId]);

  useEffect(() => {
    fetchPerson();
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPerson();
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

  const totalDeliveries = orders.filter(
    (o) => (o.current_status || o.status || '').toLowerCase() === 'delivered' || (o.current_status || o.status || '').toLowerCase() === 'completed'
  ).length;

  const showOrderDetail = (order) => {
    setSelectedOrder(order);
    setOrderModalVisible(true);
  };

  const renderOrderCard = ({ item }) => {
    const status = item.current_status || item.status || item.order_status || 'pending';
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
            <View style={styles.modalHeaderRow}>
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
              {o.pickup_address && (
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Pickup</Text>
                  <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]}>
                    {o.pickup_address}
                  </Text>
                </View>
              )}
              {o.delivery_address && (
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Delivery</Text>
                  <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]}>
                    {o.delivery_address}
                  </Text>
                </View>
              )}

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
        <ActivityIndicator size="large" color="#7B1FA2" />
        <Text style={styles.loadingText}>Loading delivery person details...</Text>
      </View>
    );
  }

  if (!person) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
        <Text style={styles.loadingText}>Delivery person not found</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = person.full_name || person.name || person.username || 'Unknown';
  const email = person.email || 'N/A';
  const phone = person.mobile_number || person.phone || person.mobile || 'N/A';
  const avatar = person.image_url || person.profile_image || person.avatar;
  const vehicleType = person.vehicle_type || person.vehicleType || 'N/A';
  const isAvailable = person.is_available ?? person.availability ?? true;
  const rating = person.rating || person.average_rating || 0;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#4A148C" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#7B1FA2']} />
        }
      >
        {/* Purple gradient header */}
        <LinearGradient colors={['#4A148C', '#7B1FA2', '#9C27B0']} style={styles.headerGradient}>
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
                <MaterialCommunityIcons name="motorbike" size={40} color="#fff" />
              </View>
            )}
            <Text style={styles.profileName}>{name}</Text>
            <View style={styles.availabilityBadge}>
              <View
                style={[
                  styles.availabilityDot,
                  { backgroundColor: isAvailable ? '#4CAF50' : '#F44336' },
                ]}
              />
              <Text style={styles.availabilityText}>
                {isAvailable ? 'Available' : 'Unavailable'}
              </Text>
            </View>
          </View>
        </LinearGradient>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <Ionicons name="mail-outline" size={18} color="#7B1FA2" />
            <Text style={styles.infoValue}>{email}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="call-outline" size={18} color="#7B1FA2" />
            <Text style={styles.infoValue}>{phone}</Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="motorbike" size={18} color="#7B1FA2" />
            <Text style={styles.infoValue}>{vehicleType}</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#F3E5F5' }]}>
            <MaterialCommunityIcons name="package-variant-closed" size={24} color="#7B1FA2" />
            <Text style={[styles.statValue, { color: '#7B1FA2' }]}>{totalDeliveries}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#FFF8E1' }]}>
            <Ionicons name="star" size={24} color="#F9A825" />
            <Text style={[styles.statValue, { color: '#F9A825' }]}>
              {rating ? Number(rating).toFixed(1) : 'N/A'}
            </Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: isAvailable ? '#E8F5E9' : '#FFEBEE' }]}>
            <Ionicons
              name={isAvailable ? 'checkmark-circle' : 'close-circle'}
              size={24}
              color={isAvailable ? '#2E7D32' : '#C62828'}
            />
            <Text
              style={[styles.statValue, { color: isAvailable ? '#2E7D32' : '#C62828', fontSize: 14 }]}
            >
              {isAvailable ? 'Online' : 'Offline'}
            </Text>
            <Text style={styles.statLabel}>Status</Text>
          </View>
        </View>

        {/* Orders list */}
        <View style={styles.sectionHeader}>
          <Ionicons name="receipt-outline" size={20} color="#7B1FA2" />
          <Text style={[styles.sectionTitle, { color: '#7B1FA2' }]}>Delivery Orders</Text>
        </View>

        {loadingOrders ? (
          <View style={styles.tabLoading}>
            <ActivityIndicator size="small" color="#7B1FA2" />
          </View>
        ) : orders.length > 0 ? (
          <FlatList
            data={orders}
            keyExtractor={(item, idx) => String(item.order_id || item._id || item.id || idx)}
            renderItem={renderOrderCard}
            scrollEnabled={false}
            contentContainerStyle={styles.ordersList}
          />
        ) : (
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="package-variant" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No delivery orders yet</Text>
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
    backgroundColor: '#7B1FA2',
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
  availabilityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  availabilityDot: { width: 8, height: 8, borderRadius: 4 },
  availabilityText: { fontSize: 12, color: '#fff', fontWeight: '600' },

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
    gap: 10,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statValue: { fontSize: 20, fontWeight: '700', marginTop: 4 },
  statLabel: { fontSize: 11, color: '#666', marginTop: 2 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 20,
    gap: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },

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
    borderLeftWidth: 4,
    borderLeftColor: '#9C27B0',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600' },
  orderFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  orderDate: { fontSize: 12, color: '#888' },
  orderAmount: { fontSize: 15, fontWeight: '700', color: '#7B1FA2' },

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
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#7B1FA2' },
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
});

export default DeliveryPersonDetails;
