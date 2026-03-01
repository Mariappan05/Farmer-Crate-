/**
 * VerificationPage.js
 * Admin verification – conversion of Flutter verification_page.dart (787 lines)
 *
 * Features:
 *   - Tab view: Pending Farmers | Pending Transporters
 *   - GET /api/admin/farmers/pending  &  /api/admin/transporters/pending
 *   - Each pending card: name, email, phone, documents, date applied
 *   - Approve: PUT /api/admin/farmers/{id}/approve  |  PUT /api/admin/transporters/{id}/approve
 *   - Reject:  DELETE /api/admin/farmers/{id}        |  DELETE /api/admin/transporters/{id}
 *   - Document preview (Aadhar, PAN, License, Voter ID for transporters)
 *   - View full details modal
 *   - Pull to refresh
 *   - Empty states per tab
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
  StatusBar,
  Modal,
  ScrollView,
  Dimensions,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/* -------------------------------------------------------------------------- */
/*  HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

const formatDate = (d) => {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
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
/*  DOCUMENT PREVIEW                                                           */
/* -------------------------------------------------------------------------- */

const DOCUMENT_TYPES = [
  { key: 'aadhar', label: 'Aadhar Card', icon: 'card-outline' },
  { key: 'pan', label: 'PAN Card', icon: 'document-text-outline' },
  { key: 'license', label: 'Driving License', icon: 'car-outline' },
  { key: 'voter_id', label: 'Voter ID', icon: 'shield-checkmark-outline' },
  { key: 'rc', label: 'Vehicle RC', mcIcon: 'car-info' },
  { key: 'insurance', label: 'Insurance', icon: 'shield-outline' },
];

const getDocUrl = (user, docKey) => {
  // Handle both object and flat field patterns
  if (user.documents) {
    if (typeof user.documents === 'object' && !Array.isArray(user.documents)) {
      return user.documents[docKey] || user.documents[`${docKey}_url`] || user.documents[`${docKey}_image`] || null;
    }
    if (Array.isArray(user.documents)) {
      const doc = user.documents.find((d) =>
        (d.type || d.document_type || '').toLowerCase().includes(docKey),
      );
      return doc?.url || doc?.image_url || doc?.file_url || null;
    }
  }
  return user[`${docKey}_url`] || user[`${docKey}_image`] || user[`${docKey}_number`] ? null : null;
};

const DocumentBadge = ({ label, icon, mcIcon, hasDoc, onPress }) => (
  <TouchableOpacity
    style={[styles.docBadge, hasDoc ? styles.docBadgePresent : styles.docBadgeMissing]}
    onPress={onPress}
    disabled={!hasDoc}
    activeOpacity={0.7}
  >
    {mcIcon ? (
      <MaterialCommunityIcons name={mcIcon} size={16} color={hasDoc ? '#1B5E20' : '#BDBDBD'} />
    ) : (
      <Ionicons name={icon} size={16} color={hasDoc ? '#1B5E20' : '#BDBDBD'} />
    )}
    <Text style={[styles.docBadgeText, hasDoc ? { color: '#1B5E20' } : { color: '#BDBDBD' }]}>
      {label}
    </Text>
    {hasDoc && <Ionicons name="checkmark-circle" size={14} color="#4CAF50" style={{ marginLeft: 2 }} />}
  </TouchableOpacity>
);

/* -------------------------------------------------------------------------- */
/*  PENDING CARD                                                               */
/* -------------------------------------------------------------------------- */

const PendingCard = ({ user, type, onApprove, onReject, onViewDetails, busy, onDocPress }) => {
  const isFarmer = type === 'farmer';
  const docs = DOCUMENT_TYPES.filter((dt) => {
    // Show relevant docs
    if (isFarmer) return ['aadhar', 'pan'].includes(dt.key);
    return true;
  });

  return (
    <View style={styles.pendingCard}>
      {/* Header */}
      <View style={styles.pendingHeader}>
        <View style={[styles.avatar, { backgroundColor: isFarmer ? '#E8F5E9' : '#E3F2FD' }]}>
          <Ionicons
            name={isFarmer ? 'leaf' : 'car'}
            size={24}
            color={isFarmer ? '#388E3C' : '#1976D2'}
          />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.pendingName}>{user.full_name || user.name || 'N/A'}</Text>
          <Text style={styles.pendingEmail}>{user.email || ''}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#FFF3E0' }]}>
          <Text style={[styles.statusBadgeText, { color: '#E65100' }]}>Pending</Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailsSection}>
        {!!user.phone && (
          <DetailRow icon="call-outline" value={user.phone} />
        )}
        {isFarmer && !!user.farm_name && (
          <DetailRow icon="leaf-outline" value={user.farm_name} />
        )}
        {isFarmer && !!(user.location || user.address || user.farm_location) && (
          <DetailRow icon="location-outline" value={user.location || user.address || user.farm_location} />
        )}
        {!isFarmer && !!user.company_name && (
          <DetailRow icon="business-outline" value={user.company_name} />
        )}
        {!isFarmer && !!user.vehicle_type && (
          <DetailRow mcIcon="truck" value={user.vehicle_type} />
        )}
        <DetailRow
          icon="calendar-outline"
          value={`Applied: ${formatDate(user.created_at || user.applied_at || user.createdAt)}`}
        />
      </View>

      {/* Documents */}
      <Text style={styles.docTitle}>Documents</Text>
      <View style={styles.docsRow}>
        {docs.map((dt) => {
          const url = getDocUrl(user, dt.key);
          return (
            <DocumentBadge
              key={dt.key}
              label={dt.label}
              icon={dt.icon}
              mcIcon={dt.mcIcon}
              hasDoc={!!url}
              onPress={() => url && onDocPress(url, dt.label)}
            />
          );
        })}
      </View>

      {/* Actions */}
      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.viewBtn} onPress={() => onViewDetails(user)} activeOpacity={0.7}>
          <Ionicons name="eye-outline" size={16} color="#388E3C" />
          <Text style={styles.viewBtnText}>Details</Text>
        </TouchableOpacity>

        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            onPress={() => onReject(user)}
            disabled={busy}
            activeOpacity={0.7}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#D32F2F" />
            ) : (
              <>
                <Ionicons name="close-circle-outline" size={18} color="#D32F2F" />
                <Text style={styles.rejectBtnText}>Reject</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, styles.approveBtn]}
            onPress={() => onApprove(user)}
            disabled={busy}
            activeOpacity={0.7}
          >
            {busy ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.approveBtnText}>Approve</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const DetailRow = ({ icon, mcIcon, value }) => (
  <View style={styles.detailRow}>
    {mcIcon ? (
      <MaterialCommunityIcons name={mcIcon} size={14} color="#757575" />
    ) : (
      <Ionicons name={icon} size={14} color="#757575" />
    )}
    <Text style={styles.detailText}>{value}</Text>
  </View>
);

/* -------------------------------------------------------------------------- */
/*  DETAIL MODAL                                                               */
/* -------------------------------------------------------------------------- */

const UserDetailModal = ({ visible, user, type, onClose }) => {
  if (!user) return null;
  const isFarmer = type === 'farmer';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isFarmer ? 'Farmer' : 'Transporter'} Details
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#424242" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Avatar */}
            <View style={styles.modalAvatarWrap}>
              <View style={[styles.modalAvatar, { backgroundColor: isFarmer ? '#E8F5E9' : '#E3F2FD' }]}>
                <Ionicons
                  name={isFarmer ? 'leaf' : 'car'}
                  size={36}
                  color={isFarmer ? '#388E3C' : '#1976D2'}
                />
              </View>
              <Text style={styles.modalUserName}>{user.full_name || user.name || 'N/A'}</Text>
              <Text style={styles.modalUserEmail}>{user.email || ''}</Text>
            </View>

            {/* Info rows */}
            <ModalInfoRow label="Phone" value={user.phone} />
            <ModalInfoRow label="Email" value={user.email} />
            <ModalInfoRow
              label="Applied"
              value={formatDate(user.created_at || user.applied_at)}
            />

            {isFarmer && (
              <>
                <ModalInfoRow label="Farm Name" value={user.farm_name} />
                <ModalInfoRow label="Location" value={user.location || user.address || user.farm_location} />
                <ModalInfoRow label="Farm Size" value={user.farm_size} />
                <ModalInfoRow label="Crops" value={Array.isArray(user.crops) ? user.crops.join(', ') : user.crops} />
                <ModalInfoRow label="Aadhar" value={user.aadhar_number || user.documents?.aadhar_number} />
              </>
            )}

            {!isFarmer && (
              <>
                <ModalInfoRow label="Company" value={user.company_name} />
                <ModalInfoRow label="Vehicle Type" value={user.vehicle_type} />
                <ModalInfoRow label="Vehicle No." value={user.vehicle_number || user.vehicle_registration} />
                <ModalInfoRow label="License No." value={user.license_number} />
                <ModalInfoRow label="Aadhar" value={user.aadhar_number || user.documents?.aadhar_number} />
                <ModalInfoRow label="PAN" value={user.pan_number || user.documents?.pan_number} />
                <ModalInfoRow label="Voter ID" value={user.voter_id || user.documents?.voter_id} />
              </>
            )}

            {/* Document images */}
            {user.documents && typeof user.documents === 'object' && !Array.isArray(user.documents) && (
              <>
                <Text style={styles.modalSectionTitle}>Document Images</Text>
                {Object.entries(user.documents).map(([key, val]) => {
                  if (!val || typeof val !== 'string' || !val.startsWith('http')) return null;
                  return (
                    <View key={key} style={styles.modalDocRow}>
                      <Text style={styles.modalDocLabel}>{key.replace(/_/g, ' ')}</Text>
                      <Image
                        source={{ uri: optimizeImageUrl(val, { width: 400 }) }}
                        style={styles.modalDocImg}
                        resizeMode="contain"
                      />
                    </View>
                  );
                })}
              </>
            )}

            {Array.isArray(user.documents) && user.documents.length > 0 && (
              <>
                <Text style={styles.modalSectionTitle}>Document Images</Text>
                {user.documents.map((doc, idx) => {
                  const url = doc.url || doc.image_url || doc.file_url;
                  if (!url) return null;
                  return (
                    <View key={idx} style={styles.modalDocRow}>
                      <Text style={styles.modalDocLabel}>
                        {doc.type || doc.document_type || `Document ${idx + 1}`}
                      </Text>
                      <Image
                        source={{ uri: optimizeImageUrl(url, { width: 400 }) }}
                        style={styles.modalDocImg}
                        resizeMode="contain"
                      />
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const ModalInfoRow = ({ label, value }) => {
  if (!value) return null;
  return (
    <View style={styles.modalInfoRow}>
      <Text style={styles.modalInfoLabel}>{label}</Text>
      <Text style={styles.modalInfoValue}>{value}</Text>
    </View>
  );
};

/* -------------------------------------------------------------------------- */
/*  DOCUMENT PREVIEW MODAL                                                     */
/* -------------------------------------------------------------------------- */

const DocPreviewModal = ({ visible, url, title, onClose }) => (
  <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
    <View style={styles.docPreviewOverlay}>
      <View style={styles.docPreviewContent}>
        <View style={styles.docPreviewHeader}>
          <Text style={styles.docPreviewTitle}>{title || 'Document'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
        </View>
        {url && (
          <Image
            source={{ uri: optimizeImageUrl(url, { width: 600 }) }}
            style={styles.docPreviewImg}
            resizeMode="contain"
          />
        )}
      </View>
    </View>
  </Modal>
);

/* ========================================================================== */
/*  MAIN COMPONENT                                                             */
/* ========================================================================== */

const VerificationPage = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [activeTab, setActiveTab] = useState(0); // 0 = farmers, 1 = transporters
  const [pendingFarmers, setPendingFarmers] = useState([]);
  const [pendingTransporters, setPendingTransporters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Modals
  const [detailUser, setDetailUser] = useState(null);
  const [docPreview, setDocPreview] = useState({ visible: false, url: null, title: '' });

  const tabAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);

  /* fetch -------------------------------------------------------------- */
  const fetchPending = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [farmersRes, transportersRes] = await Promise.allSettled([
        api.get('/admin/farmers/pending'),
        api.get('/admin/transporters/pending'),
      ]);

      if (farmersRes.status === 'fulfilled') {
        const d = farmersRes.value.data;
        setPendingFarmers(Array.isArray(d) ? d : d?.data || []);
      } else {
        setPendingFarmers([]);
      }

      if (transportersRes.status === 'fulfilled') {
        const d = transportersRes.value.data;
        setPendingTransporters(Array.isArray(d) ? d : d?.data || []);
      } else {
        setPendingTransporters([]);
      }
    } catch (e) {
      if (!silent) Alert.alert('Error', e.message || 'Failed to load pending users');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchPending(true);
  };

  /* tab animation ------------------------------------------------------ */
  const switchTab = (idx) => {
    setActiveTab(idx);
    Animated.timing(tabAnim, {
      toValue: idx,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const tabIndicatorX = tabAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, (SCREEN_WIDTH - 32) / 2],
  });

  /* approve / reject --------------------------------------------------- */
  const handleApprove = (user, type) => {
    const id = user.id || user.farmer_id || user.transporter_id || user.user_id;
    const name = user.full_name || user.name;
    const isFarmer = type === 'farmer';

    Alert.alert(
      `Approve ${isFarmer ? 'Farmer' : 'Transporter'}`,
      `Approve ${name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          onPress: async () => {
            setBusyId(id);
            try {
              const endpoint = isFarmer
                ? `/admin/farmers/${id}/approve`
                : `/admin/transporters/${id}/approve`;
              await api.put(endpoint);
              toastRef.current?.show(`${name} has been approved!`, 'success');
              fetchPending(true);
            } catch (e) {
              toastRef.current?.show(e.message || 'Approval failed', 'error');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  const handleReject = (user, type) => {
    const id = user.id || user.farmer_id || user.transporter_id || user.user_id;
    const name = user.full_name || user.name;
    const isFarmer = type === 'farmer';

    Alert.alert(
      `Reject ${isFarmer ? 'Farmer' : 'Transporter'}`,
      `Reject ${name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setBusyId(id);
            try {
              const endpoint = isFarmer
                ? `/admin/farmers/${id}`
                : `/admin/transporters/${id}`;
              await api.delete(endpoint);
              toastRef.current?.show(`${name} has been rejected`, 'warning');
              fetchPending(true);
            } catch (e) {
              toastRef.current?.show(e.message || 'Rejection failed', 'error');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  };

  /* render item -------------------------------------------------------- */
  const renderFarmer = ({ item }) => (
    <PendingCard
      user={item}
      type="farmer"
      onApprove={(u) => handleApprove(u, 'farmer')}
      onReject={(u) => handleReject(u, 'farmer')}
      onViewDetails={(u) => navigation.navigate('FarmerDetails', { farmerId: u.farmer_id || u.id || u.user_id, farmer: u })}
      onDocPress={(url, title) => setDocPreview({ visible: true, url, title })}
      busy={busyId === (item.id || item.farmer_id || item.user_id)}
    />
  );

  const renderTransporter = ({ item }) => (
    <PendingCard
      user={item}
      type="transporter"
      onApprove={(u) => handleApprove(u, 'transporter')}
      onReject={(u) => handleReject(u, 'transporter')}
      onViewDetails={(u) => navigation.navigate('TransporterDetails', { transporterId: u.transporter_id || u.id || u.user_id, transporter: u })}
      onDocPress={(url, title) => setDocPreview({ visible: true, url, title })}
      busy={busyId === (item.id || item.transporter_id || item.user_id)}
    />
  );

  /* empty component ---------------------------------------------------- */
  const EmptyState = ({ type }) => (
    <View style={styles.emptyWrap}>
      <Ionicons
        name={type === 'farmer' ? 'leaf-outline' : 'car-outline'}
        size={52}
        color="#C8E6C9"
      />
      <Text style={styles.emptyTitle}>No pending {type === 'farmer' ? 'farmers' : 'transporters'}</Text>
      <Text style={styles.emptySubtitle}>
        All {type === 'farmer' ? 'farmer' : 'transporter'} verifications are complete.
      </Text>
    </View>
  );

  /* loading ------------------------------------------------------------ */
  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <LinearGradient colors={['#1B5E20', '#388E3C']} style={styles.headerBar}>
          <Text style={styles.headerTitle}>Verification</Text>
        </LinearGradient>
        <View style={{ padding: 16 }}>
          {[1, 2, 3].map((i) => (
            <ShimmerBlock key={i} width={SCREEN_WIDTH - 32} height={180} style={{ marginBottom: 12 }} />
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
        <Text style={styles.headerTitle}>Verification</Text>
        <Text style={styles.headerSub}>
          {pendingFarmers.length + pendingTransporters.length} pending
        </Text>
      </LinearGradient>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab(0)} activeOpacity={0.7}>
          <Ionicons name="leaf-outline" size={16} color={activeTab === 0 ? '#1B5E20' : '#9E9E9E'} />
          <Text style={[styles.tabText, activeTab === 0 && styles.tabTextActive]}>
            Farmers ({pendingFarmers.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => switchTab(1)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="truck" size={16} color={activeTab === 1 ? '#1B5E20' : '#9E9E9E'} />
          <Text style={[styles.tabText, activeTab === 1 && styles.tabTextActive]}>
            Transporters ({pendingTransporters.length})
          </Text>
        </TouchableOpacity>
        {/* Animated indicator */}
        <Animated.View
          style={[
            styles.tabIndicator,
            { transform: [{ translateX: tabIndicatorX }] },
          ]}
        />
      </View>

      {/* List */}
      {activeTab === 0 ? (
        <FlatList
          data={pendingFarmers}
          keyExtractor={(item, idx) => String(item.id || item.farmer_id || idx)}
          renderItem={renderFarmer}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />
          }
          ListEmptyComponent={<EmptyState type="farmer" />}
        />
      ) : (
        <FlatList
          data={pendingTransporters}
          keyExtractor={(item, idx) => String(item.id || item.transporter_id || idx)}
          renderItem={renderTransporter}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 100 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1B5E20']} />
          }
          ListEmptyComponent={<EmptyState type="transporter" />}
        />
      )}

      {/* Document Preview Modal */}

      {/* Toast Notifications */}
      <ToastMessage ref={toastRef} />
      <DocPreviewModal
        visible={docPreview.visible}
        url={docPreview.url}
        title={docPreview.title}
        onClose={() => setDocPreview({ visible: false, url: null, title: '' })}
      />
    </View>
  );
};

/* ========================================================================== */
/*  STYLES                                                                     */
/* ========================================================================== */

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  /* Header */
  headerBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },

  /* Tabs */
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    position: 'relative',
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: '#9E9E9E', marginLeft: 5 },
  tabTextActive: { color: '#1B5E20' },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: (SCREEN_WIDTH - 32) / 2,
    height: 3,
    backgroundColor: '#1B5E20',
    borderRadius: 2,
  },

  /* Pending Card */
  pendingCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  pendingHeader: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  pendingName: { fontSize: 16, fontWeight: '700', color: '#212121' },
  pendingEmail: { fontSize: 12, color: '#757575', marginTop: 1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  /* Details */
  detailsSection: { marginTop: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  detailText: { fontSize: 13, color: '#424242', marginLeft: 6, flex: 1 },

  /* Documents */
  docTitle: { fontSize: 13, fontWeight: '600', color: '#757575', marginTop: 10, marginBottom: 6 },
  docsRow: { flexDirection: 'row', flexWrap: 'wrap' },
  docBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginRight: 6,
    marginBottom: 6,
    borderWidth: 1,
  },
  docBadgePresent: { borderColor: '#C8E6C9', backgroundColor: '#F1F8E9' },
  docBadgeMissing: { borderColor: '#E0E0E0', backgroundColor: '#FAFAFA' },
  docBadgeText: { fontSize: 11, fontWeight: '600', marginLeft: 4 },

  /* Actions */
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 10,
    marginTop: 10,
  },
  viewBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#E8F5E9' },
  viewBtnText: { color: '#388E3C', fontWeight: '600', fontSize: 13, marginLeft: 4 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 8,
  },
  rejectBtn: { backgroundColor: '#FFEBEE' },
  rejectBtnText: { color: '#D32F2F', fontWeight: '600', marginLeft: 4, fontSize: 13 },
  approveBtn: { backgroundColor: '#388E3C' },
  approveBtnText: { color: '#fff', fontWeight: '600', marginLeft: 4, fontSize: 13 },

  /* Modal */
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 30,
    maxHeight: '85%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#212121' },
  modalAvatarWrap: { alignItems: 'center', marginBottom: 16 },
  modalAvatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  modalUserName: { fontSize: 18, fontWeight: '700', color: '#212121' },
  modalUserEmail: { fontSize: 13, color: '#757575', marginTop: 2 },
  modalInfoRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  modalInfoLabel: { fontSize: 13, color: '#9E9E9E', width: 100 },
  modalInfoValue: { fontSize: 14, color: '#212121', flex: 1 },
  modalSectionTitle: { fontSize: 15, fontWeight: '700', color: '#212121', marginTop: 16, marginBottom: 8 },
  modalDocRow: { marginBottom: 12 },
  modalDocLabel: { fontSize: 12, fontWeight: '600', color: '#757575', marginBottom: 4, textTransform: 'capitalize' },
  modalDocImg: { width: '100%', height: 200, borderRadius: 10, backgroundColor: '#f5f5f5' },

  /* Document Preview */
  docPreviewOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center' },
  docPreviewContent: { flex: 1 },
  docPreviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: 12,
  },
  docPreviewTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  docPreviewImg: { flex: 1, marginHorizontal: 16, marginBottom: 40, borderRadius: 10 },

  /* Empty */
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#424242', marginTop: 12 },
  emptySubtitle: { fontSize: 13, color: '#9E9E9E', marginTop: 4, textAlign: 'center', paddingHorizontal: 40 },
});

export default VerificationPage;
