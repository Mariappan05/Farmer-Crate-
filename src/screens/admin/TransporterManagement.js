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
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const FILTERS = ['All', 'Verified', 'Pending', 'Rejected'];

const TransporterManagement = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [transporters, setTransporters] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [deleting, setDeleting] = useState(null);

  const fetchTransporters = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/transporters').catch(() => api.get('/transporters'));
      const list = data?.transporters || data?.data || data || [];
      setTransporters(Array.isArray(list) ? list : []);
    } catch (e) {
      console.error('Fetch transporters error:', e);
      Alert.alert('Error', 'Failed to load transporters');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTransporters();
  }, []);

  useEffect(() => {
    let result = [...transporters];

    // Filter by status
    if (activeFilter !== 'All') {
      const statusMap = {
        Verified: 'verified',
        Pending: 'pending',
        Rejected: 'rejected',
      };
      const target = statusMap[activeFilter];
      result = result.filter((t) => {
        const s = (t.verified_status || t.verification_status || t.status || 'pending').toLowerCase();
        return s === target;
      });
    }

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (t) =>
          (t.full_name || t.name || t.username || '').toLowerCase().includes(q) ||
          (t.email || '').toLowerCase().includes(q)
      );
    }

    setFiltered(result);
  }, [search, transporters, activeFilter]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTransporters();
  };

  const handleDelete = (transporter) => {
    const name = transporter.full_name || transporter.name || 'this transporter';
    Alert.alert('Delete Transporter', `Are you sure you want to delete ${name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const tid = transporter.transporter_id || transporter._id || transporter.id;
          setDeleting(tid);
          try {
            await api
              .delete(`/admin/transporters/${tid}`)
              .catch(() => api.delete(`/transporters/${tid}`));
            setTransporters((prev) => prev.filter((t) => (t.transporter_id || t._id || t.id) !== tid));
            Alert.alert('Success', 'Transporter deleted successfully');
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to delete transporter');
          } finally {
            setDeleting(null);
          }
        },
      },
    ]);
  };

  const getStatusStyle = (status) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'approved' || s === 'verified')
      return { bg: '#E8F5E9', color: '#2E7D32', label: 'Verified' };
    if (s === 'rejected') return { bg: '#FFEBEE', color: '#C62828', label: 'Rejected' };
    return { bg: '#FFF8E1', color: '#F57F17', label: 'Pending' };
  };

  const renderTransporterCard = ({ item }) => {
    const id = item.transporter_id || item._id || item.id;
    const name = item.full_name || item.name || item.username || 'Unknown';
    const email = item.email || 'N/A';
    const phone = item.phone || item.mobile_number || item.mobile || 'N/A';
    const company = item.company_name || item.company || '';
    const vehicleType = item.vehicle_type || item.vehicleType || '';
    const avatar = item.image_url || item.profile_image || item.avatar;
    const verStatus = item.verified_status || item.verification_status || item.status || 'pending';
    const statusInfo = getStatusStyle(verStatus);

    const aadhar = item.aadhar_number || item.aadharNumber || '';
    const pan = item.pan_number || item.panNumber || '';
    const voterId = item.voter_id || item.voterId || '';
    const license = item.license_number || item.licenseNumber || '';
    const rejectionReason = item.rejection_reason || item.rejectionReason || '';

    return (
      <View style={styles.card}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.avatarContainer}>
            {avatar ? (
              <Image
                source={{ uri: optimizeImageUrl(avatar, { width: 80, height: 80 }) }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <MaterialCommunityIcons name="truck" size={26} color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.cardInfo}>
            <View style={styles.nameStatusRow}>
              <Text style={styles.cardName} numberOfLines={1}>
                {name}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: statusInfo.bg }]}>
                <Text style={[styles.statusText, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
              </View>
            </View>
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

        {/* Company & Vehicle */}
        {(company || vehicleType) && (
          <View style={styles.detailRow}>
            {company ? (
              <View style={styles.detailChip}>
                <Ionicons name="business-outline" size={14} color="#1B5E20" />
                <Text style={styles.detailChipText}>{company}</Text>
              </View>
            ) : null}
            {vehicleType ? (
              <View style={styles.detailChip}>
                <MaterialCommunityIcons name="truck-outline" size={14} color="#1B5E20" />
                <Text style={styles.detailChipText}>{vehicleType}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Documents section */}
        {(aadhar || pan || voterId || license) && (
          <View style={styles.docSection}>
            <Text style={styles.docTitle}>Documents</Text>
            <View style={styles.docGrid}>
              {aadhar ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>Aadhar</Text>
                  <Text style={styles.docValue} numberOfLines={1}>
                    {aadhar}
                  </Text>
                </View>
              ) : null}
              {pan ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>PAN</Text>
                  <Text style={styles.docValue} numberOfLines={1}>
                    {pan}
                  </Text>
                </View>
              ) : null}
              {voterId ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>Voter ID</Text>
                  <Text style={styles.docValue} numberOfLines={1}>
                    {voterId}
                  </Text>
                </View>
              ) : null}
              {license ? (
                <View style={styles.docItem}>
                  <Text style={styles.docLabel}>License</Text>
                  <Text style={styles.docValue} numberOfLines={1}>
                    {license}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        {/* Rejection reason */}
        {verStatus.toLowerCase() === 'rejected' && rejectionReason ? (
          <View style={styles.rejectionBox}>
            <Ionicons name="alert-circle" size={16} color="#C62828" />
            <Text style={styles.rejectionText}>Reason: {rejectionReason}</Text>
          </View>
        ) : null}

        {/* Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.detailsBtn}
            onPress={() =>
              navigation.navigate('TransporterDetails', { transporterId: id, transporter: item })
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
        <Text style={styles.loadingText}>Loading transporters...</Text>
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
        <Text style={styles.headerTitle}>Transporter Management</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email..."
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

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const isActive = activeFilter === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, isActive && styles.filterChipActive]}
              onPress={() => setActiveFilter(f)}
            >
              <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                {f}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Text style={styles.resultsText}>
        Showing {filtered.length} of {transporters.length} transporters
      </Text>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item._id || item.id)}
        renderItem={renderTransporterCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <MaterialCommunityIcons name="truck-remove-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              {search || activeFilter !== 'All'
                ? 'No transporters match your filters'
                : 'No transporters found'}
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

  filterRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  filterChipText: { fontSize: 13, color: '#666', fontWeight: '500' },
  filterChipTextActive: { color: '#fff' },

  resultsText: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  nameStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardName: { fontSize: 16, fontWeight: '600', color: '#1B5E20', flex: 1, marginRight: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '600' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  infoText: { fontSize: 13, color: '#666', marginLeft: 6, flex: 1 },

  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 10,
    gap: 8,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 4,
  },
  detailChipText: { fontSize: 12, color: '#1B5E20', fontWeight: '500' },

  docSection: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  docTitle: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 },
  docGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  docItem: {
    width: '47%',
  },
  docLabel: { fontSize: 11, color: '#999' },
  docValue: { fontSize: 12, color: '#333', fontWeight: '500' },

  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    padding: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    gap: 6,
  },
  rejectionText: { fontSize: 12, color: '#C62828', flex: 1 },

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

export default TransporterManagement;
