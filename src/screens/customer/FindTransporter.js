/**
 * FindTransporter.js
 * Find and select transporters - conversion of Flutter findtrans.dart (606 lines)
 *
 * Features:
 *   - Search bar with auto-search on typing
 *   - Animated search indicator with countdown (5 seconds)
 *   - List of available transporters
 *   - GET /api/transporters/available
 *   - Transporter cards: photo, name, rating, vehicle, location, availability
 *   - "Select" button to assign transporter to order
 *   - Profile detail view on tap
 *   - Loading and empty states
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Modal,
  ScrollView,
  Animated,
  Easing,
  StatusBar,
  Alert,
  Dimensions,
  Platform,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import api from '../../services/api';
import { optimizeImageUrl } from '../../services/cloudinaryService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* --------------------------------------------------------------------------
 * HELPERS
 * ------------------------------------------------------------------------ */

const getRatingStars = (rating) => {
  const r = Math.min(5, Math.max(0, parseFloat(rating) || 0));
  const full = Math.floor(r);
  const half = r - full >= 0.5 ? 1 : 0;
  const empty = 5 - full - half;
  return { full, half, empty };
};

/* --------------------------------------------------------------------------
 * SEARCH INDICATOR (Animated countdown)
 * ------------------------------------------------------------------------ */

const SearchingIndicator = ({ visible, countdown }) => {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
      Animated.loop(
        Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }),
      ).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [visible]);

  if (!visible) return null;
  const rotate = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.View style={[styles.searchingBanner, { opacity: fadeAnim }]}>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <MaterialCommunityIcons name="truck-fast" size={24} color="#1B5E20" />
      </Animated.View>
      <View style={{ marginLeft: 12 }}>
        <Text style={styles.searchingText}>Finding transporters...</Text>
        <Text style={styles.searchingCountdown}>Please wait {countdown}s</Text>
      </View>
    </Animated.View>
  );
};

/* --------------------------------------------------------------------------
 * RATING STARS
 * ------------------------------------------------------------------------ */

const Stars = ({ rating }) => {
  const { full, half, empty } = getRatingStars(rating);
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array(full).fill(0).map((_, i) => <Ionicons key={'f' + i} name="star" size={14} color="#FFC107" />)}
      {half > 0 && <Ionicons name="star-half" size={14} color="#FFC107" />}
      {Array(empty).fill(0).map((_, i) => <Ionicons key={'e' + i} name="star-outline" size={14} color="#DDD" />)}
    </View>
  );
};

/* --------------------------------------------------------------------------
 * TRANSPORTER DETAIL MODAL
 * ------------------------------------------------------------------------ */

const TransporterDetailModal = ({ visible, transporter, onClose, onSelect }) => {
  if (!transporter) return null;
  const t = transporter;
  const avatar = t.profile_image || t.avatar || t.image;
  const vehicles = t.vehicles || [];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Transporter Details</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Profile */}
            <View style={styles.profileSection}>
              {avatar ? (
                <Image source={{ uri: optimizeImageUrl(avatar, { width: 80, height: 80 }) }} style={styles.profileAvatar} />
              ) : (
                <View style={[styles.profileAvatar, styles.avatarFallback]}>
                  <Text style={styles.avatarFallbackText}>{(t.username || t.name || 'T')[0].toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.profileName}>{t.username || t.name || t.full_name}</Text>
              <Stars rating={t.rating || t.average_rating || 4.5} />
              <Text style={styles.profileLocation}>
                <Ionicons name="location-outline" size={14} color="#888" />{' '}
                {[t.city, t.district, t.state].filter(Boolean).join(', ') || 'Location N/A'}
              </Text>
            </View>

            {/* Stats */}
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{t.total_trips || t.trips_completed || 0}</Text>
                <Text style={styles.statLabel}>Trips</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{parseFloat(t.rating || t.average_rating || 4.5).toFixed(1)}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: t.is_available ? '#4CAF50' : '#F44336' }]}>
                  {t.is_available ? 'Yes' : 'No'}
                </Text>
                <Text style={styles.statLabel}>Available</Text>
              </View>
            </View>

            {/* Vehicles */}
            {vehicles.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.detailSectionTitle}>Vehicles</Text>
                {vehicles.map((v, i) => (
                  <View key={i} style={styles.vehicleRow}>
                    <MaterialCommunityIcons name="truck-outline" size={20} color="#1B5E20" />
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.vehicleName}>{v.vehicle_type || 'Vehicle'}</Text>
                      <Text style={styles.vehicleNumber}>{v.vehicle_number || ''}</Text>
                    </View>
                    {v.capacity && <Text style={styles.vehicleCapacity}>{v.capacity} kg</Text>}
                  </View>
                ))}
              </View>
            )}

            {/* Contact */}
            {t.phone && (
              <TouchableOpacity style={styles.contactRow} onPress={() => Linking.openURL('tel:' + t.phone)}>
                <Ionicons name="call-outline" size={20} color="#1B5E20" />
                <Text style={styles.contactText}>{t.phone}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          {/* Select button */}
          <TouchableOpacity
            style={[styles.selectBtnLarge, !t.is_available && { backgroundColor: '#ccc' }]}
            disabled={!t.is_available}
            onPress={() => onSelect(t)}
          >
            <MaterialCommunityIcons name="truck-check" size={20} color="#fff" />
            <Text style={styles.selectBtnLargeText}>
              {t.is_available ? 'Select This Transporter' : 'Currently Unavailable'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

/* --------------------------------------------------------------------------
 * TRANSPORTER CARD
 * ------------------------------------------------------------------------ */

const TransporterCard = ({ transporter, onPress, onSelect }) => {
  const t = transporter;
  const avatar = t.profile_image || t.avatar || t.image;
  const vehicles = t.vehicles || [];

  return (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={onPress}>
      {/* Top row */}
      <View style={styles.cardTop}>
        {avatar ? (
          <Image source={{ uri: optimizeImageUrl(avatar, { width: 56, height: 56 }) }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarFallbackText}>{(t.username || t.name || 'T')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.cardName}>{t.username || t.name || t.full_name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Stars rating={t.rating || t.average_rating || 4.5} />
            <Text style={styles.ratingNum}>{parseFloat(t.rating || t.average_rating || 4.5).toFixed(1)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 }}>
            <Ionicons name="location-outline" size={14} color="#888" />
            <Text style={styles.locationText} numberOfLines={1}>
              {[t.city, t.district, t.state].filter(Boolean).join(', ') || 'Location N/A'}
            </Text>
          </View>
        </View>
        <View style={[styles.availBadge, { backgroundColor: t.is_available ? '#E8F5E9' : '#FFEBEE' }]}>
          <View style={[styles.availDot, { backgroundColor: t.is_available ? '#4CAF50' : '#F44336' }]} />
          <Text style={[styles.availText, { color: t.is_available ? '#1B5E20' : '#F44336' }]}>
            {t.is_available ? 'Available' : 'Busy'}
          </Text>
        </View>
      </View>

      {/* Vehicles */}
      {vehicles.length > 0 && (
        <View style={styles.vehicleChips}>
          {vehicles.slice(0, 3).map((v, i) => (
            <View key={i} style={styles.vehicleChip}>
              <MaterialCommunityIcons name="truck-outline" size={13} color="#1B5E20" />
              <Text style={styles.vehicleChipText}>
                {v.vehicle_type || ''}{v.vehicle_number ? ' \u2022 ' + v.vehicle_number : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Trip count */}
      <View style={styles.tripRow}>
        <Ionicons name="navigate-outline" size={14} color="#888" />
        <Text style={styles.tripText}>{t.total_trips || t.trips_completed || 0} trips completed</Text>
      </View>

      {/* Actions */}
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.viewProfileBtn} onPress={onPress}>
          <Ionicons name="person-outline" size={16} color="#1B5E20" />
          <Text style={styles.viewProfileText}>View Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.selectBtn, !t.is_available && { opacity: 0.5 }]}
          disabled={!t.is_available}
          onPress={() => onSelect(t)}
        >
          <Text style={styles.selectBtnText}>Select</Text>
          <Ionicons name="arrow-forward" size={16} color="#fff" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
};

/* --------------------------------------------------------------------------
 * MAIN COMPONENT
 * ------------------------------------------------------------------------ */

const FindTransporter = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const { orderId, order } = route.params || {};

  const [transporters, setTransporters] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [selectedTransporter, setSelectedTransporter] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);

  const searchTimeoutRef = useRef(null);
  const countdownRef = useRef(null);

  /* -- Fetch ------------------------------------------------- */
  const fetchTransporters = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/transporters/available').catch(() => api.get('/transporters'));
      const list = res.data?.data || res.data?.transporters || [];
      setTransporters(list);
      setFiltered(list);
    } catch (e) {
      console.log('FindTransporter error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTransporters(); }, []);

  /* -- Search with countdown --------------------------------- */
  const handleSearch = (text) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (text.trim().length === 0) {
      setFiltered(transporters);
      setSearching(false);
      return;
    }

    // Show searching indicator with countdown
    setSearching(true);
    setCountdown(5);
    let c = 5;
    countdownRef.current = setInterval(() => {
      c -= 1;
      setCountdown(c);
      if (c <= 0) clearInterval(countdownRef.current);
    }, 1000);

    searchTimeoutRef.current = setTimeout(() => {
      clearInterval(countdownRef.current);
      setSearching(false);
      const q = text.toLowerCase();
      setFiltered(
        transporters.filter((t) => {
          const name = (t.username || t.name || t.full_name || '').toLowerCase();
          const city = (t.city || t.district || t.state || '').toLowerCase();
          const vType = (t.vehicles || []).map((v) => (v.vehicle_type || '').toLowerCase()).join(' ');
          return name.includes(q) || city.includes(q) || vType.includes(q);
        }),
      );
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  /* -- Select transporter ------------------------------------ */
  const handleSelect = async (transporter) => {
    setModalVisible(false);
    if (!orderId && !order) {
      Alert.alert('Transporter Selected', (transporter.username || transporter.name) + ' has been selected.');
      navigation.goBack();
      return;
    }
    try {
      const id = orderId || order?.order_id || order?.id;
      await api.put('/orders/' + id + '/assign-transporter', { transporter_id: transporter.id || transporter.user_id });
      Alert.alert('Success', 'Transporter assigned successfully!');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to assign transporter');
    }
  };

  /* -- Loading skeleton -------------------------------------- */
  const renderSkeleton = () => (
    <View style={{ padding: 16 }}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.card, { height: 170 }]}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#e0e0e0' }} />
            <View style={{ flex: 1, gap: 8 }}>
              <View style={{ width: '60%', height: 16, borderRadius: 8, backgroundColor: '#e0e0e0' }} />
              <View style={{ width: '40%', height: 12, borderRadius: 6, backgroundColor: '#e0e0e0' }} />
              <View style={{ width: '50%', height: 12, borderRadius: 6, backgroundColor: '#e0e0e0' }} />
            </View>
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Find Transporter</Text>
        <TouchableOpacity onPress={() => fetchTransporters()}>
          <Ionicons name="refresh-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, location, vehicle..."
          placeholderTextColor="#aaa"
          value={search}
          onChangeText={handleSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <Ionicons name="close-circle" size={20} color="#aaa" />
          </TouchableOpacity>
        )}
      </View>

      {/* Search indicator */}
      <SearchingIndicator visible={searching} countdown={countdown} />

      {/* Results count */}
      {!loading && !searching && (
        <View style={styles.resultBar}>
          <Text style={styles.resultText}>
            {filtered.length} transporter{filtered.length !== 1 ? 's' : ''} found
          </Text>
          <View style={styles.availCount}>
            <View style={[styles.availDot, { backgroundColor: '#4CAF50' }]} />
            <Text style={styles.availCountText}>
              {filtered.filter((t) => t.is_available).length} available
            </Text>
          </View>
        </View>
      )}

      {/* List */}
      {loading ? renderSkeleton() : (
        <FlatList
          data={filtered}
          keyExtractor={(item, idx) => String(item.id || item.user_id || idx)}
          renderItem={({ item }) => (
            <TransporterCard
              transporter={item}
              onPress={() => { setSelectedTransporter(item); setModalVisible(true); }}
              onSelect={handleSelect}
            />
          )}
          contentContainerStyle={[styles.listContent, filtered.length === 0 && { flex: 1 }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchTransporters(true); }} colors={['#1B5E20']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="truck-alert-outline" size={72} color="#ccc" />
              <Text style={styles.emptyTitle}>No Transporters Found</Text>
              <Text style={styles.emptySubtitle}>
                {search ? 'Try a different search term' : 'No transporters available right now'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Modal */}
      <TransporterDetailModal
        visible={modalVisible}
        transporter={selectedTransporter}
        onClose={() => setModalVisible(false)}
        onSelect={handleSelect}
      />
    </View>
  );
};

/* --------------------------------------------------------------------------
 * STYLES
 * ------------------------------------------------------------------------ */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  headerBar: {
    backgroundColor: '#1B5E20',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  /* Search */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 12 : 4,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  searchInput: { flex: 1, fontSize: 15, color: '#333' },

  searchingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 12,
    padding: 12,
  },
  searchingText: { fontSize: 14, fontWeight: '600', color: '#1B5E20' },
  searchingCountdown: { fontSize: 12, color: '#388E3C', marginTop: 2 },

  /* Result bar */
  resultBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  resultText: { fontSize: 13, color: '#888' },
  availCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  availCountText: { fontSize: 12, color: '#4CAF50', fontWeight: '500' },

  listContent: { padding: 16, paddingBottom: 32 },

  /* Card */
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 3 },
    }),
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarFallback: { backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  avatarFallbackText: { fontSize: 22, fontWeight: '700', color: '#1B5E20' },
  cardName: { fontSize: 16, fontWeight: '700', color: '#222' },
  ratingNum: { fontSize: 12, color: '#888', fontWeight: '500' },
  locationText: { fontSize: 12, color: '#888', flex: 1 },

  availBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 5 },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availText: { fontSize: 12, fontWeight: '600' },

  vehicleChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  vehicleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F5F5F5', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  vehicleChipText: { fontSize: 12, color: '#555' },

  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  tripText: { fontSize: 12, color: '#888' },

  cardActions: { flexDirection: 'row', gap: 10 },
  viewProfileBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#1B5E20',
    borderRadius: 12,
    paddingVertical: 10,
  },
  viewProfileText: { fontSize: 13, fontWeight: '600', color: '#1B5E20' },
  selectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B5E20',
    borderRadius: 12,
    paddingVertical: 10,
    gap: 6,
  },
  selectBtnText: { fontSize: 13, fontWeight: '600', color: '#fff' },

  /* Empty */
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 16 },
  emptySubtitle: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },

  profileSection: { alignItems: 'center', marginBottom: 20 },
  profileAvatar: { width: 80, height: 80, borderRadius: 40, marginBottom: 12 },
  profileName: { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 4 },
  profileLocation: { fontSize: 14, color: '#888', marginTop: 6 },

  statsRow: { flexDirection: 'row', backgroundColor: '#F8FFF8', borderRadius: 14, padding: 16, marginBottom: 16 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },
  statLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  statDivider: { width: 1, backgroundColor: '#E0E0E0' },

  detailSection: { marginBottom: 16 },
  detailSectionTitle: { fontSize: 15, fontWeight: '600', color: '#333', marginBottom: 10 },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  vehicleName: { fontSize: 14, fontWeight: '600', color: '#333' },
  vehicleNumber: { fontSize: 12, color: '#888', marginTop: 2 },
  vehicleCapacity: { fontSize: 13, color: '#1B5E20', fontWeight: '500' },

  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  contactText: { fontSize: 15, color: '#1B5E20', fontWeight: '500' },

  selectBtnLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1B5E20',
    borderRadius: 14,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
  },
  selectBtnLargeText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});

export default FindTransporter;
