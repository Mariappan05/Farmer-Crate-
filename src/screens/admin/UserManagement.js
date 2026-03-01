/**
 * UserManagement.js
 * Admin user management – conversion of Flutter user_management.dart (1259 lines)
 *
 * Features:
 *   - 4 filter chips: Farmers, Customers, Transporters, Delivery Persons
 *   - GET /api/admin/users?role={role} (falls back to separate endpoints)
 *   - Accordion-style user list with expandable details
 *   - Each user: name, email, phone, role, status, joined date
 *   - "View Full Details" button → respective detail page
 *   - Search bar to filter users
 *   - Stats summary (total per role)
 *   - Pull to refresh
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  LayoutAnimation,
  Platform,
  UIManager,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* -------------------------------------------------------------------------- */
/*  CONSTANTS                                                                  */
/* -------------------------------------------------------------------------- */

const ROLE_FILTERS = [
  { key: 'farmer', label: 'Farmers', icon: 'leaf-outline', color: '#388E3C' },
  { key: 'customer', label: 'Customers', icon: 'people-outline', color: '#1976D2' },
  { key: 'transporter', label: 'Transporters', mcIcon: 'truck', color: '#F57C00' },
  { key: 'delivery_person', label: 'Delivery', icon: 'bicycle-outline', color: '#00BCD4' },
];

const STATUS_COLORS = {
  active: { bg: '#E8F5E9', text: '#1B5E20' },
  approved: { bg: '#E8F5E9', text: '#1B5E20' },
  verified: { bg: '#E8F5E9', text: '#1B5E20' },
  pending: { bg: '#FFF3E0', text: '#E65100' },
  inactive: { bg: '#FFEBEE', text: '#C62828' },
  rejected: { bg: '#FFEBEE', text: '#C62828' },
  blocked: { bg: '#FFEBEE', text: '#C62828' },
  suspended: { bg: '#FFF3E0', text: '#BF360C' },
};

const getStatusStyle = (s) => STATUS_COLORS[(s || 'active').toLowerCase()] || STATUS_COLORS.active;

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* -------------------------------------------------------------------------- */
/*  SHIMMER                                                                    */
/* -------------------------------------------------------------------------- */

const ShimmerBlock = ({ width: w, height: h, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const bg = anim.interpolate({ inputRange: [0, 1], outputRange: ['#e0e0e0', '#f5f5f5'] });
  return <Animated.View style={[{ width: w, height: h, borderRadius, backgroundColor: bg }, style]} />;
};

/* -------------------------------------------------------------------------- */
/*  STAT CHIP                                                                  */
/* -------------------------------------------------------------------------- */

const StatChip = ({ label, count, color, icon, mcIcon }) => (
  <View style={[styles.statChip, { borderLeftColor: color }]}>
    <View style={[styles.statChipIcon, { backgroundColor: color + '20' }]}>
      {mcIcon
        ? <MaterialCommunityIcons name={mcIcon} size={16} color={color} />
        : <Ionicons name={icon || 'people-outline'} size={16} color={color} />}
    </View>
    <Text style={[styles.statChipCount, { color }]}>{count}</Text>
    <Text style={styles.statChipLabel}>{label}</Text>
  </View>
);

/* -------------------------------------------------------------------------- */
/*  USER CARD (ACCORDION)                                                      */
/* -------------------------------------------------------------------------- */

const UserCard = ({ user, roleFilter, expanded, onToggle, onViewDetails }) => {
  const statusValue = user.status || user.account_status || user.verification_status || user.verified_status;
  const sColor = getStatusStyle(statusValue);
  const profileImg = user.image_url || user.profile_image || user.profile_pic || user.image;
  const roleColor = ROLE_FILTERS.find((r) => r.key === roleFilter)?.color || '#388E3C';

  return (
    <View style={[styles.userCard, { borderLeftColor: roleColor, borderLeftWidth: 4 }]}>
      {/* Header — always visible */}
      <TouchableOpacity style={styles.userCardHeader} onPress={onToggle} activeOpacity={0.7}>
        {/* Avatar */}
        <View style={styles.userAvatar}>
          {profileImg ? (
            <Image
              source={{ uri: optimizeImageUrl(profileImg, { width: 80 }) }}
              style={styles.userAvatarImg}
            />
          ) : (
            <View style={[styles.userAvatarPlaceholder, { backgroundColor: ROLE_FILTERS.find((r) => r.key === roleFilter)?.color + '18' || '#E8F5E9' }]}>
              <Text style={styles.userAvatarLetter}>
                {(user.full_name || user.name || '?')[0].toUpperCase()}
              </Text>
            </View>
          )}
        </View>

        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.userName}>{user.full_name || user.name || 'N/A'}</Text>
          <Text style={styles.userEmail} numberOfLines={1}>{user.email || ''}</Text>
        </View>

        <View style={[styles.statusBadge, { backgroundColor: sColor.bg }]}>
          <Text style={[styles.statusBadgeText, { color: sColor.text }]}>
            {(statusValue || 'Active').charAt(0).toUpperCase() +
              (statusValue || 'Active').slice(1)}
          </Text>
        </View>

        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#9E9E9E"
          style={{ marginLeft: 6 }}
        />
      </TouchableOpacity>

      {/* Expanded Details */}
      {expanded && (
        <View style={styles.userExpanded}>
          <View style={styles.divider} />

          {!!user.phone && (
            <DetailRow icon="call-outline" label="Phone" value={user.phone} />
          )}
          <DetailRow icon="mail-outline" label="Email" value={user.email || 'N/A'} />
          <DetailRow
            icon="person-outline"
            label="Role"
            value={(user.role || roleFilter || '').replace(/_/g, ' ')}
          />
          <DetailRow
            icon="calendar-outline"
            label="Joined"
            value={formatDate(user.created_at || user.joined_at || user.createdAt)}
          />

          {/* Farmer-specific */}
          {roleFilter === 'farmer' && (
            <>
              {!!user.farm_name && <DetailRow icon="leaf-outline" label="Farm" value={user.farm_name} />}
              {!!(user.location || user.address || user.farm_location) && (
                <DetailRow icon="location-outline" label="Location" value={user.location || user.address || user.farm_location} />
              )}
            </>
          )}

          {/* Transporter-specific */}
          {roleFilter === 'transporter' && (
            <>
              {!!user.company_name && <DetailRow icon="business-outline" label="Company" value={user.company_name} />}
              {!!user.vehicle_type && <DetailRow mcIcon="truck" label="Vehicle" value={user.vehicle_type} />}
              {!!user.license_number && <DetailRow icon="card-outline" label="License" value={user.license_number} />}
            </>
          )}

          {/* Delivery-person-specific */}
          {roleFilter === 'delivery_person' && (
            <>
              {!!(user.transporter_name || user.transporter?.name) && (
                <DetailRow mcIcon="truck" label="Transporter" value={user.transporter_name || user.transporter?.name} />
              )}
            </>
          )}

          {/* View Details Button */}
          <TouchableOpacity style={styles.viewDetailsBtn} onPress={onViewDetails} activeOpacity={0.8}>
            <LinearGradient
              colors={[roleColor, roleColor + 'CC']}
              style={styles.viewDetailsBtnGrad}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Ionicons name="eye-outline" size={16} color="#fff" />
              <Text style={styles.viewDetailsBtnText}>View Full Details</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const DetailRow = ({ icon, mcIcon, label, value }) => (
  <View style={styles.detailRow}>
    {mcIcon ? (
      <MaterialCommunityIcons name={mcIcon} size={15} color="#757575" />
    ) : (
      <Ionicons name={icon} size={15} color="#757575" />
    )}
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
  </View>
);

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const UserManagement = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const toastRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeRole, setActiveRole] = useState('farmer');
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Stats
  const [roleCounts, setRoleCounts] = useState({ farmer: 0, customer: 0, transporter: 0, delivery_person: 0 });

  /* fetch -------------------------------------------------------------- */
  const fetchUsers = useCallback(async (role, silent = false) => {
    if (!silent) setLoading(true);
    try {
      let list = [];
      // Try unified endpoint first
      try {
        const { data } = await api.get(`/admin/users`, { params: { role } });
        list = Array.isArray(data) ? data : data?.data || data?.users || [];
      } catch {
        // Fall back to role-specific endpoints
        const endpoints = {
          farmer: '/admin/farmers',
          customer: '/admin/customers',
          transporter: '/admin/transporters',
          delivery_person: '/admin/delivery-persons',
        };
        try {
          const { data } = await api.get(endpoints[role] || `/admin/users`);
          list = Array.isArray(data) ? data : data?.data || data?.users || [];
        } catch { list = []; }
      }
      setUsers(list);
    } catch (e) {
      if (!silent) toastRef.current?.show(e.message || 'Failed to load users', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchCounts = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/dashboard-stats');
      const d = data?.data || data;
      setRoleCounts({
        farmer: d.total_farmers ?? d.totalFarmers ?? 0,
        customer: d.total_customers ?? d.totalCustomers ?? 0,
        transporter: d.total_transporters ?? d.totalTransporters ?? 0,
        delivery_person: d.total_delivery_persons ?? d.totalDeliveryPersons ?? 0,
      });
    } catch { /* ignored */ }
  }, []);

  useEffect(() => {
    fetchUsers(activeRole);
    fetchCounts();
  }, [activeRole, fetchUsers, fetchCounts]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchUsers(activeRole, true);
    fetchCounts();
  };

  const onChipPress = (role) => {
    if (role !== activeRole) {
      setActiveRole(role);
      setExpandedId(null);
      setSearch('');
    }
  };

  /* filter ------------------------------------------------------------- */
  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => {
      const name = (u.full_name || u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone || '').toLowerCase();
      return name.includes(q) || email.includes(q) || phone.includes(q);
    });
  }, [users, search]);

  /* toggle accordion --------------------------------------------------- */
  const toggleExpand = (id) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(expandedId === id ? null : id);
  };

  /* navigate to detail ------------------------------------------------- */
  const goToDetail = (user) => {
    const id = user.farmer_id || user.customer_id || user.transporter_id || user.delivery_person_id || user.id || user.user_id;
    switch (activeRole) {
      case 'farmer':
        navigation.navigate('FarmerDetails', { farmerId: id, farmer: user });
        break;
      case 'customer':
        navigation.navigate('CustomerDetails', { customerId: id, customer: user });
        break;
      case 'transporter':
        navigation.navigate('TransporterDetails', { transporterId: id, transporter: user });
        break;
      case 'delivery_person':
        navigation.navigate('DeliveryPersonDetails', { deliveryPersonId: id, deliveryPerson: user });
        break;
    }
  };

  /* render item -------------------------------------------------------- */
  const renderUser = ({ item }) => {
    const uid = item.id || item.user_id;
    return (
      <UserCard
        user={item}
        roleFilter={activeRole}
        expanded={expandedId === uid}
        onToggle={() => toggleExpand(uid)}
        onViewDetails={() => goToDetail(item)}
      />
    );
  };

  /* loading ------------------------------------------------------------ */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
          <Text style={styles.headerTitle}>User Management</Text>
        </LinearGradient>
        <View style={{ padding: 16 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <ShimmerBlock key={i} width={SCREEN_WIDTH - 32} height={72} style={{ marginBottom: 10 }} />
          ))}
        </View>
      </View>
    );
  }

  /* ==================================================================== */
  /*  RENDER                                                               */
  /* ==================================================================== */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
        <Text style={styles.headerTitle}>User Management</Text>
        <Text style={styles.headerSub}>{filtered.length} users</Text>
      </LinearGradient>

      {/* Stats row */}
      <View style={styles.statsRow}>
        {ROLE_FILTERS.map((r) => (
          <StatChip key={r.key} label={r.label} count={roleCounts[r.key]} color={r.color} icon={r.icon} mcIcon={r.mcIcon} />
        ))}
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchIconWrap}>
          <Ionicons name="search" size={18} color="#388E3C" />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, email, phone…"
          placeholderTextColor="#BDBDBD"
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')} style={styles.searchClearBtn}>
            <Ionicons name="close-circle" size={18} color="#9E9E9E" />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips */}
      <ScrollableChips
        filters={ROLE_FILTERS}
        active={activeRole}
        onPress={onChipPress}
      />

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item, idx) => String(item.id || item.user_id || idx)}
        renderItem={renderUser}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="people-outline" size={52} color="#C8E6C9" />
            <Text style={styles.emptyTitle}>No users found</Text>
            <Text style={styles.emptySubtitle}>
              {search.trim() ? 'Try a different search' : `No ${ROLE_FILTERS.find((r) => r.key === activeRole)?.label || 'users'} yet`}
            </Text>
          </View>
        }
      />

      {/* Toast */}
      <ToastMessage ref={toastRef} />
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  SCROLLABLE CHIPS                                                           */
/* -------------------------------------------------------------------------- */

const ScrollableChips = ({ filters, active, onPress }) => (
  <View style={styles.chipsRow}>
    {filters.map((f) => {
      const isActive = active === f.key;
      return (
        <TouchableOpacity
          key={f.key}
          style={[
            styles.chip,
            isActive && { backgroundColor: f.color, borderColor: f.color },
          ]}
          onPress={() => onPress(f.key)}
          activeOpacity={0.7}
        >
          {f.mcIcon ? (
            <MaterialCommunityIcons name={f.mcIcon} size={16} color={isActive ? '#fff' : f.color} style={{ marginRight: 4 }} />
          ) : (
            <Ionicons name={f.icon} size={16} color={isActive ? '#fff' : f.color} style={{ marginRight: 4 }} />
          )}
          <Text style={[styles.chipText, isActive && { color: '#fff' }]}>{f.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerBar: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  /* Stats */
  statsRow: { flexDirection: 'row', paddingHorizontal: 12, marginTop: 14, justifyContent: 'space-between' },
  statChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    marginHorizontal: 3,
    borderLeftWidth: 3,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  statChipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  statChipCount: { fontSize: 16, fontWeight: '800' },
  statChipLabel: { fontSize: 10, color: '#757575', marginTop: 2 },

  /* Search */
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 52,
    elevation: 3,
    shadowColor: '#1B5E20',
    shadowOpacity: 0.10,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  searchIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#212121',
    height: 40,
    paddingVertical: 0,
    includeFontPadding: false,
  },
  searchClearBtn: { padding: 6 },

  /* Chips */
  chipsRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, flexWrap: 'wrap' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: '#BDBDBD',
    marginRight: 8,
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  chipText: { fontSize: 13, fontWeight: '600', color: '#616161' },

  /* User Card */
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  userCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  userAvatar: {},
  userAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  userAvatarPlaceholder: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  userAvatarLetter: { fontSize: 18, fontWeight: '700', color: '#388E3C' },
  userName: { fontSize: 15, fontWeight: '700', color: '#212121' },
  userEmail: { fontSize: 12, color: '#757575', marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  /* Expanded */
  userExpanded: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, backgroundColor: '#F0F0F0', marginBottom: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  detailLabel: { fontSize: 12, color: '#9E9E9E', width: 70, marginLeft: 6 },
  detailValue: { fontSize: 13, color: '#424242', flex: 1 },
  viewDetailsBtn: {
    marginTop: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  viewDetailsBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  viewDetailsBtnText: { color: '#fff', fontWeight: '600', fontSize: 14, marginLeft: 6 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#424242', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#9E9E9E', marginTop: 4, textAlign: 'center' },
});

export default UserManagement;
