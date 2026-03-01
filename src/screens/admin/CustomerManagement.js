import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const CustomerManagement = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [customers, setCustomers] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/customers').catch(() => api.get('/customers'));
      const list = data?.customers || data?.data || data || [];
      setCustomers(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Fetch customers error:', e);
      Alert.alert('Error', 'Failed to load customers');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(customers);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(
      customers.filter(
        (c) =>
          (c.full_name || c.name || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q) ||
          (c.phone || c.mobile || '').includes(q)
      )
    );
  }, [search, customers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomers();
  };

  const activeCustomers = customers.filter(
    (c) => c.is_active !== false && c.status !== 'inactive'
  );

  const handleDelete = (customer) => {
    const name = customer.full_name || customer.name || 'this customer';
    Alert.alert('Delete Customer', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const cid = customer.customer_id || customer._id || customer.id;
          setDeleting(cid);
          try {
            await api
              .delete(`/admin/customers/${cid}`)
              .catch(() => api.delete(`/customers/${cid}`));
            setCustomers((prev) => prev.filter((c) => (c.customer_id || c._id || c.id) !== cid));
            Alert.alert('Success', 'Customer deleted successfully');
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to delete customer');
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
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

  const renderCustomerCard = ({ item }) => {
    const id = item.customer_id || item._id || item.id;
    const name = item.full_name || item.name || 'Unknown';
    const email = item.email || 'N/A';
    const phone = item.phone || item.mobile_number || item.mobile || 'N/A';
    const joined = item.createdAt || item.created_at || item.joinedDate;
    const totalOrders = item.order_stats?.total_orders || item.total_orders || item.totalOrders || 0;
    const avatar = item.image_url || item.profile_image || item.avatar;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            {avatar ? (
              <Image
                source={{ uri: optimizeImageUrl(avatar, { width: 80, height: 80 }) }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Ionicons name="person" size={28} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text style={styles.cardName} numberOfLines={1}>
              {name}
            </Text>
            <View style={styles.infoRow}>
              <Ionicons name="mail-outline" size={14} color="#666" />
              <Text style={styles.infoText} numberOfLines={1}>
                {email}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={14} color="#666" />
              <Text style={styles.infoText}>{phone}</Text>
            </View>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="calendar-outline" size={14} color="#888" />
            <Text style={styles.metaText}>Joined: {formatDate(joined)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="cart-outline" size={14} color="#888" />
            <Text style={styles.metaText}>Orders: {totalOrders}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() =>
              navigation.navigate('CustomerDetails', { customerId: id, customer: item })
            }
          >
            <Ionicons name="eye-outline" size={16} color="#fff" />
            <Text style={styles.detailsBtnText}>View Details</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(item)}
            disabled={deleting === id}
          >
            {deleting === id ? (
              <ActivityIndicator size="small" color="#D32F2F" />
            ) : (
              <>
                <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                <Text style={styles.deleteBtnText}>Delete</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Loading customers...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Management</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: '#E8F5E9' }]}>
          <MaterialCommunityIcons name="account-group" size={24} color="#1B5E20" />
          <Text style={styles.statValue}>{customers.length}</Text>
          <Text style={styles.statLabel}>Total Customers</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: '#F1F8E9' }]}>
          <MaterialCommunityIcons name="account-check" size={24} color="#388E3C" />
          <Text style={styles.statValue}>{activeCustomers.length}</Text>
          <Text style={styles.statLabel}>Active Customers</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email or phone..."
          placeholderTextColor="#999"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>

      <Text style={styles.resultsText}>
        Showing {filtered.length} of {customers.length} customers
      </Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item._id || item.id)}
        renderItem={renderCustomerCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {search ? 'No customers match your search' : 'No customers found'}
            </Text>
          </View>
        }
      />
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

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },

  statsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 16, gap: 12 },
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
  statValue: { fontSize: 22, fontWeight: '700', color: '#1B5E20', marginTop: 4 },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 14,
    borderRadius: 10,
    paddingHorizontal: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: '#333' },

  resultsText: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
    fontSize: 12,
    color: '#888',
  },

  listContent: { paddingHorizontal: 16, paddingBottom: 20 },

  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginTop: 10,
    padding: 14,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center' },
  avatarContainer: { marginRight: 12 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarPlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1B5E20', marginBottom: 4 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  infoText: { fontSize: 13, color: '#666', marginLeft: 6, flex: 1 },

  cardMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  metaItem: { flexDirection: 'row', alignItems: 'center' },
  metaText: { fontSize: 12, color: '#888', marginLeft: 4 },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 10,
  },
  detailsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 6,
  },
  detailsBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFEBEE',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 4,
  },
  deleteBtnText: { color: '#D32F2F', fontSize: 13, fontWeight: '600' },

  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 12, fontSize: 14, color: '#999' },
});

export default CustomerManagement;
