import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Dimensions,
  StatusBar,
  Linking,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pickImage, uploadImageToCloudinary, optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width } = Dimensions.get('window');

const MENU_ITEMS = [
  { id: 'history', icon: 'time-outline', label: 'Order History', color: '#2196F3', route: 'History' },
  { id: 'vehicles', icon: 'car-outline', label: 'Vehicles', color: '#FF9800', route: 'Vehicles' },
  { id: 'tracking', icon: 'location-outline', label: 'Order Tracking', color: '#4CAF50', route: 'TransporterOrderTracking' },
  { id: 'faq', icon: 'help-circle-outline', label: 'FAQ', color: '#9C27B0', route: 'FAQ' },
  { id: 'help', icon: 'headset-outline', label: 'Help & Support', color: '#00BCD4', route: 'HelpSupport' },
  { id: 'feedback', icon: 'chatbubble-ellipses-outline', label: 'Feedback', color: '#E91E63', route: 'Feedback' },
  { id: 'appinfo', icon: 'information-circle-outline', label: 'App Info', color: '#607D8B', route: 'AppInfo' },
];

const TransporterProfile = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState, clearSession } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);

  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    company_name: '',
    address_line: '',
    city: '',
    state: '',
    district: '',
    pincode: '',
  });

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const toastRef = useRef(null);

  useEffect(() => {
    fetchProfile();
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const res = await api.get('/transporters/profile');
      const data = res.data?.user || res.data?.data || res.data;
      setProfile(data);
      setFormData({
        full_name: data.full_name || '',
        email: data.email || '',
        phone: data.phone || '',
        company_name: data.company_name || '',
        address_line: data.address_line || '',
        city: data.city || '',
        state: data.state || '',
        district: data.district || '',
        pincode: data.pincode || '',
      });
    } catch (e) {
      console.log('Profile fetch error:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, []);

  const handleImagePick = async (fromCamera) => {
    try {
      setUploadingImage(true);
      const uri = await pickImage(fromCamera);
      if (!uri) return;
      const url = await uploadImageToCloudinary(uri);
      if (url) {
        await api.put('/transporters/profile', { profile_image: url });
        setProfile(prev => ({ ...prev, profile_image: url }));
        toastRef.current?.show('Profile image updated', 'success');
      }
    } catch (e) {
      toastRef.current?.show('Failed to update image', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Camera', onPress: () => handleImagePick(true) },
      { text: 'Gallery', onPress: () => handleImagePick(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleSave = async () => {
    if (!formData.full_name.trim()) {
      toastRef.current?.show('Name is required', 'warning');
      return;
    }
    if (formData.phone && formData.phone.length !== 10) {
      toastRef.current?.show('Phone must be 10 digits', 'warning');
      return;
    }
    try {
      setSaving(true);
      const payload = { ...formData };
      delete payload.email;
      await api.put('/transporters/profile', payload);
      setProfile(prev => ({ ...prev, ...payload }));
      setEditMode(false);
      toastRef.current?.show('Profile updated successfully', 'success');
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => setLogoutModalVisible(true);

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try { await clearSession(); } catch (e) { console.log('Logout error:', e.message); }
  };

  const getInitials = (name) => {
    if (!name) return 'T';
    return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerOverlay} />
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.headerOverlay} />
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => {
              if (editMode) {
                setFormData({
                  full_name: profile?.full_name || '',
                  email: profile?.email || '',
                  phone: profile?.phone || '',
                  company_name: profile?.company_name || '',
                  address_line: profile?.address_line || '',
                  city: profile?.city || '',
                  state: profile?.state || '',
                  district: profile?.district || '',
                  pincode: profile?.pincode || '',
                });
              }
              setEditMode(!editMode);
            }}
          >
            <Ionicons name={editMode ? 'close' : 'create-outline'} size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Avatar */}
        <TouchableOpacity style={styles.avatarContainer} onPress={showImageOptions}>
          {uploadingImage ? (
            <View style={styles.avatarPlaceholder}>
              <ActivityIndicator color="#fff" size="small" />
            </View>
          ) : profile?.profile_image ? (
            <Image
              source={{ uri: optimizeImageUrl(profile.profile_image, { width: 200, height: 200 }) }}
              style={styles.avatar}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{getInitials(profile?.full_name)}</Text>
            </View>
          )}
          <View style={styles.cameraIcon}>
            <Ionicons name="camera" size={14} color="#fff" />
          </View>
        </TouchableOpacity>

        <Text style={styles.profileName}>{profile?.full_name || 'Transporter'}</Text>
        <Text style={styles.profileEmail}>{profile?.email || ''}</Text>
        <View style={styles.roleBadge}>
          <MaterialCommunityIcons name="truck-delivery" size={14} color="#fff" />
          <Text style={styles.roleBadgeText}>Transporter</Text>
        </View>
        {profile?.company_name ? (
          <Text style={styles.companyText}>{profile.company_name}</Text>
        ) : null}
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={{ paddingBottom: 30 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.total_orders || 0}</Text>
            <Text style={styles.statLabel}>Orders</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.rating ? parseFloat(profile.rating).toFixed(1) : '4.5'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.delivery_persons_count || 0}</Text>
            <Text style={styles.statLabel}>Drivers</Text>
          </View>
        </View>

        {/* Personal Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={20} color="#1B5E20" />
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>
          <View style={styles.sectionCard}>
            <InfoField
              label="Full Name"
              value={formData.full_name}
              editable={editMode}
              onChange={(v) => setFormData(p => ({ ...p, full_name: v }))}
            />
            <InfoField label="Email" value={formData.email} editable={false} />
            <InfoField
              label="Phone"
              value={formData.phone}
              editable={editMode}
              onChange={(v) => setFormData(p => ({ ...p, phone: v }))}
              keyboardType="phone-pad"
              maxLength={10}
            />
          </View>
        </View>

        {/* Company Info */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="business-outline" size={20} color="#1B5E20" />
            <Text style={styles.sectionTitle}>Company Information</Text>
          </View>
          <View style={styles.sectionCard}>
            <InfoField
              label="Company Name"
              value={formData.company_name}
              editable={editMode}
              onChange={(v) => setFormData(p => ({ ...p, company_name: v }))}
            />
            <InfoField
              label="Address"
              value={formData.address_line}
              editable={editMode}
              onChange={(v) => setFormData(p => ({ ...p, address_line: v }))}
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InfoField
                  label="City"
                  value={formData.city}
                  editable={editMode}
                  onChange={(v) => setFormData(p => ({ ...p, city: v }))}
                />
              </View>
              <View style={styles.halfField}>
                <InfoField
                  label="Pincode"
                  value={formData.pincode}
                  editable={editMode}
                  onChange={(v) => setFormData(p => ({ ...p, pincode: v }))}
                  keyboardType="numeric"
                  maxLength={6}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <InfoField
                  label="State"
                  value={formData.state}
                  editable={editMode}
                  onChange={(v) => setFormData(p => ({ ...p, state: v }))}
                />
              </View>
              <View style={styles.halfField}>
                <InfoField
                  label="District"
                  value={formData.district}
                  editable={editMode}
                  onChange={(v) => setFormData(p => ({ ...p, district: v }))}
                />
              </View>
            </View>
          </View>
        </View>

        {/* Save Button */}
        {editMode && (
          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* Menu Items */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="menu-outline" size={20} color="#1B5E20" />
            <Text style={styles.sectionTitle}>Quick Links</Text>
          </View>
          <View style={styles.menuCard}>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.menuItem}
                onPress={() => {
                  try {
                    navigation.navigate(item.route);
                  } catch {
                    Alert.alert('Info', `${item.label} - Coming soon`);
                  }
                }}
              >
                <View style={[styles.menuIconBg, { backgroundColor: item.color + '15' }]}>
                  <Ionicons name={item.icon} size={22} color={item.color} />
                </View>
                <Text style={styles.menuLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#F44336" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>FarmerCrate Transporter v1.0.0</Text>
      </ScrollView>

      {/* ─── Logout Confirmation Modal ─── */}
      <Modal
        visible={logoutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLogoutModalVisible(false)}
      >
        <View style={styles.logoutOverlay}>
          <View style={styles.logoutModal}>
            <View style={styles.logoutIconCircle}>
              <Ionicons name="log-out-outline" size={36} color="#fff" />
            </View>
            <Text style={styles.logoutModalTitle}>Sign Out</Text>
            <Text style={styles.logoutModalMsg}>
              Are you sure you want to sign out from your account?
            </Text>
            <View style={styles.logoutModalBtns}>
              <TouchableOpacity
                style={styles.logoutCancelBtn}
                onPress={() => setLogoutModalVisible(false)}
              >
                <Text style={styles.logoutCancelText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.logoutConfirmBtn}
                onPress={confirmLogout}
              >
                <Ionicons name="log-out-outline" size={16} color="#fff" />
                <Text style={styles.logoutConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <ToastMessage ref={toastRef} />
    </Animated.View>
  );
};

const InfoField = ({ label, value, editable, onChange, keyboardType, maxLength }) => (
  <View style={styles.fieldContainer}>
    <Text style={styles.fieldLabel}>{label}</Text>
    {editable ? (
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        maxLength={maxLength}
        placeholderTextColor="#aaa"
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    ) : (
      <Text style={styles.fieldValue}>{value || 'Not set'}</Text>
    )}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: {
    backgroundColor: '#1B5E20',
    paddingBottom: 24,
    alignItems: 'center',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2E7D32',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    opacity: 0.3,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarContainer: { alignItems: 'center', marginBottom: 10 },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarPlaceholder: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarInitials: { fontSize: 32, fontWeight: '700', color: '#fff' },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: -4,
    backgroundColor: '#1B5E20',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileName: { fontSize: 20, fontWeight: '700', color: '#fff', marginTop: 4 },
  profileEmail: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
    gap: 4,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  companyText: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  body: { flex: 1 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 10, color: '#666', fontSize: 14 },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginTop: -12,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  statValue: { fontSize: 22, fontWeight: '700', color: '#1B5E20' },
  statLabel: { fontSize: 12, color: '#666', marginTop: 2 },
  section: { marginTop: 20, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#333' },
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  row: { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },
  fieldContainer: { marginBottom: 14 },
  fieldLabel: { fontSize: 12, color: '#888', marginBottom: 4, fontWeight: '500' },
  fieldValue: { fontSize: 15, color: '#333', fontWeight: '500' },
  fieldInput: {
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fafafa',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  menuIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#333', marginLeft: 12, fontWeight: '500' },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#F44336',
    gap: 8,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#F44336' },
  versionText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#aaa',
    marginTop: 16,
    marginBottom: 10,
  },

  // Logout Modal
  logoutOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' },
  logoutModal: { width: '82%', backgroundColor: '#fff', borderRadius: 24, padding: 28, alignItems: 'center', elevation: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.18, shadowRadius: 16 },
  logoutIconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#E53935', alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: '#E53935', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 8 },
  logoutModalTitle: { fontSize: 20, fontWeight: '700', color: '#1A1A1A', marginBottom: 8 },
  logoutModalMsg: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  logoutModalBtns: { flexDirection: 'row', width: '100%', gap: 12 },
  logoutCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F5F5F5', alignItems: 'center' },
  logoutCancelText: { fontSize: 15, color: '#555', fontWeight: '600' },
  logoutConfirmBtn: { flex: 1.5, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E53935', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 4, shadowColor: '#E53935', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  logoutConfirmText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});

export default TransporterProfile;
