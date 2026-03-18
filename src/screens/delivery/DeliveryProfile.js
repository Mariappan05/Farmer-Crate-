import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  Switch,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';
import { updateDeliveryAvailability } from '../../services/authService';
import ToastMessage from '../../utils/Toast';

const DeliveryProfile = ({ navigation }) => {
  const { authState, clearSession } = useAuth();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [form, setForm] = useState({
    name: '',
    mobile_number: '',
    vehicle_number: '',
    vehicle_type: '',
    current_location: '',
  });

  const user = authState?.user;
  const toastRef = useRef(null);

  // ─── Fetch profile ────────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.get('/delivery-persons/profile');
      const data = res.data?.data || res.data || user;
      setProfile(data);
      setIsAvailable(data?.is_available || false);
      setForm({
        name: data?.name || '',
        mobile_number: data?.mobile_number || data?.phone || '',
        vehicle_number: data?.vehicle_number || '',
        vehicle_type: data?.vehicle_type || '',
        current_location: data?.current_location || '',
      });
    } catch {
      setProfile(user);
      setForm({
        name: user?.name || user?.username || '',
        mobile_number: user?.mobile_number || '',
        vehicle_number: '',
        vehicle_type: '',
        current_location: '',
      });
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  // ─── Toggle availability ──────────────────────────────────────────────
  const toggleAvailability = async (value) => {
    setIsAvailable(value);
    try {
      await updateDeliveryAvailability(value, authState?.token);
    } catch {
      setIsAvailable(!value);
      toastRef.current?.show('Failed to update availability', 'error');
    }
  };

  // ─── Pick & Upload photo ──────────────────────────────────────────────
  const handlePickImage = async (fromCamera = false) => {
    try {
      const imageUri = await pickImage(fromCamera);
      if (!imageUri) return;
      setIsUploadingPhoto(true);
      const url = await uploadImageToCloudinary(imageUri);
      setProfile((p) => ({ ...p, image_url: url }));
      // persist silently
      try {
        await api.put('/delivery-persons/profile', { image_url: url });
      } catch {}
    } catch {
      toastRef.current?.show('Could not upload profile photo', 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Camera', onPress: () => handlePickImage(true) },
      { text: 'Gallery', onPress: () => handlePickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ─── Save profile ────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) {
      toastRef.current?.show('Name is required', 'warning');
      return;
    }
    setIsSaving(true);
    try {
      await api.put('/delivery-persons/profile', {
        ...form,
        image_url: profile?.image_url,
      });
      toastRef.current?.show('Profile updated!', 'success');
      setIsEditing(false);
      fetchProfile();
    } catch {
      toastRef.current?.show('Failed to update profile', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── Logout ───────────────────────────────────────────────────────────
  const handleLogout = () => setLogoutModalVisible(true);

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try { await clearSession(); } catch (e) { console.log('Logout error:', e.message); }
  };

  // ─── Compute stats ───────────────────────────────────────────────────
  const totalDeliveries = profile?.total_deliveries || profile?.deliveries_count || 0;
  const rating = parseFloat(profile?.rating || profile?.average_rating || 0) || 0;
  const onTimePercent = parseFloat(profile?.on_time_percentage || profile?.on_time_rate || 0) || 0;

  // ─── Menu items ───────────────────────────────────────────────────────
  const menuItems = [
    {
      icon: 'time-outline',
      label: 'Delivery History',
      onPress: () => navigation.navigate('History'),
      color: '#2196F3',
    },
    {
      icon: 'cash-outline',
      label: 'Earnings',
      onPress: () => navigation.navigate('Earnings'),
      color: '#4CAF50',
    },
    {
      icon: 'help-circle-outline',
      label: 'FAQ',
      onPress: () => navigation.navigate('FAQ'),
      color: '#FF9800',
    },
    {
      icon: 'headset-outline',
      label: 'Help & Support',
      onPress: () => navigation.navigate('HelpSupport'),
      color: '#9C27B0',
    },
    {
      icon: 'chatbubble-ellipses-outline',
      label: 'Feedback',
      onPress: () => navigation.navigate('Feedback'),
      color: '#00BCD4',
    },
  ];

  // ─── Loading ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={{ color: '#888', marginTop: 12 }}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
        <TouchableOpacity
          onPress={() => (isEditing ? handleSave() : setIsEditing(true))}
          disabled={isSaving}
          style={styles.headerBtn}
        >
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Ionicons name={isEditing ? 'checkmark' : 'create-outline'} size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
        }
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header */}
        <LinearGradient
          colors={['#388E3C', '#4CAF50']}
          style={styles.profileSection}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <TouchableOpacity onPress={isEditing ? showImageOptions : undefined} activeOpacity={0.8}>
            <View style={styles.avatarContainer}>
              {isUploadingPhoto ? (
                <View style={styles.avatarFallback}>
                  <ActivityIndicator size="large" color="#fff" />
                </View>
              ) : profile?.image_url ? (
                <Image source={{ uri: profile.image_url }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarInit}>
                    {(profile?.name || user?.name || 'D')[0].toUpperCase()}
                  </Text>
                </View>
              )}
              {isEditing && (
                <View style={styles.avatarEdit}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.profileName}>
            {profile?.name || user?.name || 'Delivery Agent'}
          </Text>
          <View style={styles.availBadge}>
            <View
              style={[
                styles.availDot,
                { backgroundColor: isAvailable ? '#76FF03' : '#FF5252' },
              ]}
            />
            <Text style={styles.availText}>{isAvailable ? 'Available' : 'Offline'}</Text>
          </View>
          {profile?.vehicle_number ? (
            <View style={styles.vehicleBadge}>
              <MaterialCommunityIcons name="motorbike" size={16} color="#fff" />
              <Text style={styles.vehicleText}>{profile.vehicle_number}</Text>
            </View>
          ) : null}
        </LinearGradient>

        {/* Performance Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <MaterialCommunityIcons name="truck-delivery-outline" size={22} color="#4CAF50" />
            <Text style={styles.statVal}>{totalDeliveries}</Text>
            <Text style={styles.statLabel}>Deliveries</Text>
          </View>
          <View style={[styles.statCard, styles.statCardMiddle]}>
            <Ionicons name="star" size={22} color="#FF9800" />
            <Text style={styles.statVal}>{rating ? rating.toFixed(1) : '—'}</Text>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="timer-outline" size={22} color="#2196F3" />
            <Text style={styles.statVal}>{onTimePercent ? `${onTimePercent}%` : '—'}</Text>
            <Text style={styles.statLabel}>On Time</Text>
          </View>
        </View>

        {/* Availability Toggle */}
        <View style={styles.availCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MaterialCommunityIcons
              name={isAvailable ? 'toggle-switch' : 'toggle-switch-off-outline'}
              size={24}
              color={isAvailable ? '#4CAF50' : '#aaa'}
            />
            <View>
              <Text style={styles.availCardTitle}>Availability</Text>
              <Text style={styles.availCardSub}>
                {isAvailable ? 'You are accepting new orders' : 'You are not accepting orders'}
              </Text>
            </View>
          </View>
          <Switch
            value={isAvailable}
            onValueChange={toggleAvailability}
            trackColor={{ false: '#ddd', true: '#A5D6A7' }}
            thumbColor={isAvailable ? '#4CAF50' : '#999'}
          />
        </View>

        {/* Personal Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Ionicons name="person-outline" size={18} color="#1B5E20" />
            <Text style={styles.sectionTitle}>Personal Information</Text>
          </View>

          {isEditing ? (
            <View style={{ gap: 10 }}>
              {[
                { key: 'name', label: 'Full Name', kb: 'default', icon: 'person-outline' },
                { key: 'mobile_number', label: 'Mobile Number', kb: 'phone-pad', icon: 'call-outline' },
              ].map((field) => (
                <View key={field.key}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <View style={styles.inputRow}>
                    <Ionicons name={field.icon} size={18} color="#aaa" />
                    <TextInput
                      style={styles.input}
                      value={form[field.key]}
                      onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                      keyboardType={field.kb}
                      placeholder={field.label}
                      placeholderTextColor="#ccc"
                    />
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              {[
                { key: 'name', label: 'Full Name', icon: 'person-outline' },
                { key: 'email', label: 'Email', icon: 'mail-outline' },
                { key: 'mobile_number', label: 'Mobile', icon: 'call-outline' },
              ].map((field) => {
                const val = profile?.[field.key] || '';
                if (!val) return null;
                return (
                  <View key={field.key} style={styles.infoRow}>
                    <Ionicons name={field.icon} size={16} color="#aaa" style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>{field.label}</Text>
                      <Text style={styles.infoValue}>{val}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Vehicle Info */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="motorbike" size={18} color="#1B5E20" />
            <Text style={styles.sectionTitle}>Vehicle Information</Text>
          </View>

          {isEditing ? (
            <View style={{ gap: 10 }}>
              {[
                { key: 'vehicle_type', label: 'Vehicle Type', kb: 'default' },
                { key: 'vehicle_number', label: 'Vehicle Number', kb: 'default' },
                { key: 'current_location', label: 'Current Location', kb: 'default' },
              ].map((field) => (
                <View key={field.key}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={[styles.input, { paddingLeft: 14 }]}
                    value={form[field.key]}
                    onChangeText={(v) => setForm((f) => ({ ...f, [field.key]: v }))}
                    keyboardType={field.kb}
                    placeholder={field.label}
                    placeholderTextColor="#ccc"
                  />
                </View>
              ))}
            </View>
          ) : (
            <View style={{ gap: 2 }}>
              {[
                { key: 'vehicle_type', label: 'Vehicle Type', icon: 'car-outline' },
                { key: 'vehicle_number', label: 'Vehicle Number', icon: 'document-text-outline' },
                { key: 'current_location', label: 'Location', icon: 'location-outline' },
              ].map((field) => {
                const val = profile?.[field.key] || '';
                if (!val) return null;
                return (
                  <View key={field.key} style={styles.infoRow}>
                    <Ionicons name={field.icon} size={16} color="#aaa" style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.infoLabel}>{field.label}</Text>
                      <Text style={styles.infoValue}>{val}</Text>
                    </View>
                  </View>
                );
              })}
              {!profile?.vehicle_type && !profile?.vehicle_number && (
                <Text style={styles.noDataText}>No vehicle info added yet</Text>
              )}
            </View>
          )}
        </View>

        {/* Menu Items */}
        <View style={styles.menuCard}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.menuRow,
                index < menuItems.length - 1 && styles.menuRowBorder,
              ]}
              onPress={item.onPress}
              activeOpacity={0.6}
            >
              <View style={[styles.menuIcon, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        {/* App Info */}
        <TouchableOpacity
          style={styles.appInfoRow}
          onPress={() => navigation.navigate('AppInfo')}
          activeOpacity={0.6}
        >
          <Ionicons name="information-circle-outline" size={20} color="#888" />
          <Text style={styles.appInfoText}>App Info</Text>
          <Ionicons name="chevron-forward" size={16} color="#ccc" />
        </TouchableOpacity>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={22} color="#F44336" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        {/* Cancel edit */}
        {isEditing && (
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={() => {
              setIsEditing(false);
              fetchProfile();
            }}
          >
            <Text style={styles.cancelText}>Cancel Editing</Text>
          </TouchableOpacity>
        )}
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Profile section
  profileSection: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingBottom: 24,
  },
  avatarContainer: { position: 'relative' },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarFallback: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatarInit: { fontSize: 40, fontWeight: 'bold', color: '#fff' },
  avatarEdit: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    padding: 6,
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileName: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginTop: 12 },
  availBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  availDot: { width: 8, height: 8, borderRadius: 4 },
  availText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  vehicleText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: -16,
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  statCard: { flex: 1, alignItems: 'center', paddingVertical: 18, gap: 6 },
  statCardMiddle: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#f0f0f0' },
  statVal: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#888' },

  // Availability toggle
  availCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  availCardTitle: { fontSize: 14, fontWeight: '700', color: '#333' },
  availCardSub: { fontSize: 12, color: '#888', marginTop: 2 },

  // Section cards
  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E20',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f8f8',
  },
  infoLabel: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  infoValue: { fontSize: 14, color: '#333', fontWeight: '500' },
  noDataText: { fontSize: 13, color: '#bbb', fontStyle: 'italic', paddingVertical: 8 },

  // Edit mode
  fieldLabel: { fontSize: 12, fontWeight: '600', color: '#555', marginBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 11,
    fontSize: 14,
    color: '#333',
  },

  // Menu
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f5f5f5' },
  menuIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },

  // App info
  appInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  appInfoText: { flex: 1, fontSize: 14, color: '#888' },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFEBEE',
    borderRadius: 16,
    marginHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 8,
  },
  logoutText: { color: '#F44336', fontSize: 16, fontWeight: 'bold' },

  // Cancel
  cancelBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginHorizontal: 16,
  },
  cancelText: { color: '#888', fontSize: 14, fontWeight: '500' },

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

export default DeliveryProfile;
