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

const TransporterDetails = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { transporterId, transporter: initialTransporter } = route.params || {};

  const [transporter, setTransporter] = useState(initialTransporter || null);
  const [loading, setLoading] = useState(!initialTransporter);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderModalVisible, setOrderModalVisible] = useState(false);

  const tId = transporterId || transporter?.transporter_id || transporter?._id || transporter?.id;

  const fetchTransporter = useCallback(async () => {
    if (!tId) return;
    try {
      const { data } = await api
        .get(`/admin/transporters/${tId}`)
        .catch(() => api.get(`/transporters/${tId}`));
      const t = data?.transporter || data?.data || data;
      setTransporter(t);
    } catch (e) {
      console.error('Fetch transporter error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tId]);

  const fetchOrders = useCallback(async () => {
    if (!tId) return;
    setLoadingOrders(true);
    try {
      const { data } = await api
        .get(`/admin/transporters/${tId}/orders`)
        .catch(() => api.get(`/orders?transporter=${tId}`));
      setOrders(data?.orders || data?.data || data || []);
    } catch (e) {
      console.error('Fetch orders error:', e);
    } finally {
      setLoadingOrders(false);
    }
  }, [tId]);

  useEffect(() => {
    fetchTransporter();
    fetchOrders();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransporter();
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

  const getVerificationStyle = (status) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'approved' || s === 'verified')
      return { bg: '#E8F5E9', color: '#2E7D32', label: 'Verified' };
    if (s === 'rejected') return { bg: '#FFEBEE', color: '#C62828', label: 'Rejected' };
    return { bg: '#FFF8E1', color: '#F57F17', label: 'Pending' };
  };

  const activeOrders = orders.filter((o) => {
    const s = (o.current_status || o.status || '').toLowerCase();
    return s !== 'delivered' && s !== 'completed' && s !== 'cancelled';
  });
  const completedOrders = orders.filter((o) => {
    const s = (o.current_status || o.status || '').toLowerCase();
    return s === 'delivered' || s === 'completed';
  });

  // Separate source/destination orders
  const sourceOrders = orders.filter((o) => o.is_source || o.order_type === 'source');
  const destOrders = orders.filter((o) => o.is_destination || o.order_type === 'destination');
  const hasSourceDest = sourceOrders.length > 0 || destOrders.length > 0;

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
        {(item.source || item.pickup_address) && (
          <View style={styles.addressRow}>
            <Ionicons name="location" size={14} color="#E65100" />
            <Text style={styles.addressText} numberOfLines={1}>
              {item.source || item.pickup_address}
            </Text>
          </View>
        )}
        {(item.destination || item.delivery_address) && (
          <View style={styles.addressRow}>
            <Ionicons name="flag" size={14} color="#2E7D32" />
            <Text style={styles.addressText} numberOfLines={1}>
              {item.destination || item.delivery_address}
            </Text>
          </View>
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
              {(o.source || o.pickup_address) && (
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Source</Text>
                  <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]}>
                    {o.source || o.pickup_address}
                  </Text>
                </View>
              )}
              {(o.destination || o.delivery_address) && (
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>Destination</Text>
                  <Text style={[styles.modalValue, { flex: 1, textAlign: 'right' }]}>
                    {o.destination || o.delivery_address}
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
                {(o.customer || o.customer_id) && (
                  <TouchableOpacity
                    style={[styles.modalNavBtn, { backgroundColor: '#E3F2FD' }]}
                    onPress={() => {
                      setOrderModalVisible(false);
                      const c = o.customer || {};
                      navigation.navigate('CustomerDetails', {
                        customerId: c.customer_id || c._id || c.id || o.customer_id,
                        customer: typeof c === 'object' ? c : undefined,
                      });
                    }}
                  >
                    <Ionicons name="person-outline" size={16} color="#1565C0" />
                    <Text style={[styles.modalNavBtnText, { color: '#1565C0' }]}>Customer</Text>
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
        <ActivityIndicator size="large" color="#E65100" />
        <Text style={styles.loadingText}>Loading transporter details...</Text>
      </View>
    );
  }

  if (!transporter) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Ionicons name="alert-circle-outline" size={48} color="#ccc" />
        <Text style={styles.loadingText}>Transporter not found</Text>
        <TouchableOpacity style={styles.goBackBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const name = transporter.full_name || transporter.name || transporter.username || 'Unknown';
  const email = transporter.email || 'N/A';
  const phone = transporter.mobile_number || transporter.phone || transporter.mobile || 'N/A';
  const company = transporter.company_name || transporter.company || 'N/A';
  const vehicleType = transporter.vehicle_type || transporter.vehicleType || 'N/A';
  const verStatus = transporter.verified_status || transporter.verification_status || transporter.status || 'pending';
  const verInfo = getVerificationStyle(verStatus);
  const avatar = transporter.image_url || transporter.profile_image || transporter.avatar;

  // Documents
  const aadhar = transporter.aadhar_number || transporter.aadharNumber || '';
  const pan = transporter.pan_number || transporter.panNumber || '';
  const license = transporter.license_number || transporter.licenseNumber || '';
  const voterId = transporter.voter_id || transporter.voterId || '';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#BF360C" />

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#E65100']} />
        }
      >
        {/* Orange gradient header */}
        <LinearGradient colors={['#BF360C', '#E65100', '#FF8F00']} style={styles.headerGradient}>
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
                <MaterialCommunityIcons name="truck" size={40} color="#fff" />
              </View>
            )}
            <Text style={styles.profileName}>{name}</Text>
            {company !== 'N/A' && <Text style={styles.companyName}>{company}</Text>}
            <View style={[styles.verBadge, { backgroundColor: verInfo.bg }]}>
              <Text style={[styles.verBadgeText, { color: verInfo.color }]}>{verInfo.label}</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoItem}>
            <Ionicons name="mail-outline" size={18} color="#E65100" />
            <Text style={styles.infoValue}>{email}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="call-outline" size={18} color="#E65100" />
            <Text style={styles.infoValue}>{phone}</Text>
          </View>
          <View style={styles.infoItem}>
            <MaterialCommunityIcons name="truck-outline" size={18} color="#E65100" />
            <Text style={styles.infoValue}>{vehicleType}</Text>
          </View>
          <View style={styles.infoItem}>
            <Ionicons name="business-outline" size={18} color="#E65100" />
            <Text style={styles.infoValue}>{company}</Text>
          </View>
        </View>

        {/* Documents section */}
        {(aadhar || pan || license || voterId) && (
          <View style={styles.docsCard}>
            <View style={styles.docsTitleRow}>
              <MaterialCommunityIcons name="file-document-outline" size={20} color="#E65100" />
              <Text style={styles.docsTitle}>Documents</Text>
            </View>
            <View style={styles.docsGrid}>
              {aadhar ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>Aadhar Number</Text>
                  <Text style={styles.docValue}>{aadhar}</Text>
                </View>
              ) : null}
              {pan ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>PAN Number</Text>
                  <Text style={styles.docValue}>{pan}</Text>
                </View>
              ) : null}
              {license ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>License Number</Text>
                  <Text style={styles.docValue}>{license}</Text>
                </View>
              ) : null}
              {voterId ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>Voter ID</Text>
                  <Text style={styles.docValue}>{voterId}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: '#FFF3E0' }]}>
            <MaterialCommunityIcons name="package-variant" size={24} color="#E65100" />
            <Text style={[styles.statValue, { color: '#E65100' }]}>{orders.length}</Text>
            <Text style={styles.statLabel}>Total Orders</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E3F2FD' }]}>
            <MaterialCommunityIcons name="truck-fast" size={24} color="#1565C0" />
            <Text style={[styles.statValue, { color: '#1565C0' }]}>{activeOrders.length}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="checkmark-circle" size={24} color="#2E7D32" />
            <Text style={[styles.statValue, { color: '#2E7D32' }]}>{completedOrders.length}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* Source/Destination separated orders */}
        {hasSourceDest ? (
          <>
            {sourceOrders.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="location" size={20} color="#E65100" />
                  <Text style={[styles.sectionTitle, { color: '#E65100' }]}>
                    Source Orders ({sourceOrders.length})
                  </Text>
                </View>
                <FlatList
                  data={sourceOrders}
                  keyExtractor={(item, idx) => String(item.order_id || item._id || item.id || idx)}
                  renderItem={renderOrderCard}
                  scrollEnabled={false}
                  contentContainerStyle={styles.ordersList}
                />
              </>
            )}
            {destOrders.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="flag" size={20} color="#2E7D32" />
                  <Text style={[styles.sectionTitle, { color: '#2E7D32' }]}>
                    Destination Orders ({destOrders.length})
                  </Text>
                </View>
                <FlatList
                  data={destOrders}
                  keyExtractor={(item, idx) => String(item.order_id || item._id || item.id || idx)}
                  renderItem={renderOrderCard}
                  scrollEnabled={false}
                  contentContainerStyle={styles.ordersList}
                />
              </>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Ionicons name="receipt-outline" size={20} color="#E65100" />
              <Text style={[styles.sectionTitle, { color: '#E65100' }]}>Orders</Text>
            </View>

            {loadingOrders ? (
              <View style={styles.tabLoading}>
                <ActivityIndicator size="small" color="#E65100" />
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
                <MaterialCommunityIcons name="truck-remove-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>No orders yet</Text>
              </View>
            )}
          </>
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
    backgroundColor: '#E65100',
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
  companyName: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  verBadge: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
  },
  verBadgeText: { fontSize: 12, fontWeight: '600' },

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

  docsCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  docsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  docsTitle: { fontSize: 15, fontWeight: '700', color: '#E65100' },
  docsGrid: { gap: 10 },
  docItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  docLabel: { fontSize: 13, color: '#888' },
  docValue: { fontSize: 13, fontWeight: '600', color: '#333' },

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
    borderLeftColor: '#FF8F00',
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  orderId: { fontSize: 13, fontWeight: '600', color: '#333', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusText: { fontSize: 11, fontWeight: '600' },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
  },
  addressText: { fontSize: 12, color: '#666', flex: 1 },
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
  orderAmount: { fontSize: 15, fontWeight: '700', color: '#E65100' },

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
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#E65100' },
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

export default TransporterDetails;

