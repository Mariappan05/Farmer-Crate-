import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pickImage, uploadImageToCloudinary, optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const SOUTH_INDIAN_STATES = {
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Tiruchirappalli', 'Tirunelveli',
    'Erode', 'Vellore', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Ranipet',
    'Sivaganga', 'Karur', 'Namakkal', 'Tirupur', 'Tiruvarur', 'Nagapattinam',
    'Ramanathapuram', 'Cuddalore', 'Viluppuram', 'Krishnagiri', 'Dharmapuri',
    'Kanchipuram', 'Chengalpattu', 'Tiruvallur', 'Perambalur', 'Ariyalur',
    'Nilgiris', 'Kallakurichi', 'Tenkasi', 'Mayiladuthurai',
  ],
  'Kerala': [
    'Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam',
    'Palakkad', 'Alappuzha', 'Malappuram', 'Kannur', 'Kottayam',
    'Kasaragod', 'Pathanamthitta', 'Idukki', 'Wayanad',
  ],
  'Karnataka': [
    'Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi', 'Belagavi', 'Kalaburagi',
    'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga', 'Tumakuru',
    'Raichur', 'Hassan', 'Udupi', 'Chikkamagaluru', 'Mandya', 'Kodagu',
    'Dharwad', 'Chitradurga', 'Haveri', 'Gadag', 'Bagalkot', 'Yadgir',
    'Chamarajanagar', 'Ramanagara', 'Chikkaballapura', 'Koppal',
  ],
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool',
    'Tirupati', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur',
    'Eluru', 'Ongole', 'Chittoor', 'Srikakulam', 'Prakasam',
    'East Godavari', 'West Godavari', 'Krishna', 'Palnadu',
  ],
  'Telangana': [
    'Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar',
    'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet',
    'Siddipet', 'Mancherial', 'Medak', 'Sangareddy', 'Rangareddy',
    'Medchal-Malkajgiri', 'Jagtial', 'Peddapalli', 'Kamareddy',
    'Nirmal', 'Wanaparthy', 'Nagarkurnool', 'Jogulamba Gadwal',
  ],
  'Puducherry': ['Puducherry', 'Karaikal', 'Mahe', 'Yanam'],
};

const ZONES = ['North', 'South', 'East', 'West', 'Central', 'North-East'];

const FarmerProfile = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState, clearSession } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Form state
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    farm_name: '',
    address_line: '',
    city: '',
    state: '',
    district: '',
    pincode: '',
    zone: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
    global_farmer_id: '',
    profile_image: '',
  });

  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [showZonePicker, setShowZonePicker] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const toastRef = useRef(null);

  const states = Object.keys(SOUTH_INDIAN_STATES);
  const districts = form.state ? SOUTH_INDIAN_STATES[form.state] || [] : [];

  const fetchProfile = useCallback(async () => {
    try {
      const { data } = await api.get('/farmers/me');

      /*
       * Unwrap the actual payload:
       *   { farmer: {...} }
       *   { data: { farmer: {...} } }
       *   { data: {...} }
       *   { user: {...} }
       *   {...}  (flat)
       */
      const raw =
        data?.farmer      ||
        data?.data?.farmer ||
        data?.data        ||
        data?.user        ||
        data?.profile     ||
        data              ||
        {};

      /*
       * Some backends nest personal fields under raw.user
       * while keeping farmer-specific fields at the top level.
       * Merge so every field is reachable directly.
       */
      const userNested = raw?.user || {};
      const p = { ...userNested, ...raw };

      setProfile(p);
      setForm({
        full_name:        p.full_name       || p.name             || userNested.full_name  || '',
        phone:            p.phone           || p.mobile           || p.mobile_number       || userNested.phone || '',
        farm_name:        p.farm_name       || '',
        address_line:     p.address_line    || p.address          || userNested.address_line || userNested.address || '',
        city:             p.city            || userNested.city    || '',
        state:            p.state           || userNested.state   || '',
        district:         p.district        || userNested.district || '',
        pincode:          String(p.pincode  || p.zip_code         || userNested.pincode || ''),
        zone:             p.zone            || userNested.zone    || '',
        account_number:   p.account_number  || '',
        ifsc_code:        p.ifsc_code       || '',
        bank_name:        p.bank_name       || '',
        global_farmer_id: p.global_farmer_id || p.farmer_id      || '',
        profile_image:    p.profile_image   || p.avatar          || p.image_url || userNested.profile_image || userNested.image_url || '',
      });
    } catch (e) {
      console.error('Profile fetch error:', e?.message || e);
      // Fall back to whatever was saved at login time
      const saved = authState?.user;
      if (saved) {
        setForm((prev) => ({
          ...prev,
          full_name:     prev.full_name     || saved.full_name  || saved.name  || '',
          phone:         prev.phone         || saved.phone      || saved.mobile_number || '',
          address_line:  prev.address_line  || saved.address_line || saved.address || '',
          city:          prev.city          || saved.city       || '',
          state:         prev.state         || saved.state      || '',
          district:      prev.district      || saved.district   || '',
          pincode:       prev.pincode       || String(saved.pincode || ''),
          zone:          prev.zone          || saved.zone       || '',
          profile_image: prev.profile_image || saved.profile_image || saved.image_url || '',
        }));
      }
      toastRef.current?.show('Could not load latest profile. Showing cached data.', 'warning');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authState?.user]);

  useEffect(() => { fetchProfile(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleImagePick = () => {
    setPhotoPickerVisible(true);
  };

  const uploadProfileImage = async (uri) => {
    setUploadingImage(true);
    try {
      const url = await uploadImageToCloudinary(uri);
      if (url) {
        updateForm('profile_image', url);
        // Save immediately
        await api.put('/farmers/me', { image_url: url });
        setProfile((prev) => ({ ...prev, image_url: url, profile_image: url }));
      } else {
        toastRef.current?.show('Failed to upload image', 'error');
      }
    } catch (e) {
      toastRef.current?.show(e.message || 'Upload failed', 'error');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toastRef.current?.show('Full name is required', 'warning');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.full_name.trim(),
        mobile_number: form.phone.trim(),
        address: form.address_line.trim(),
        state: form.state,
        district: form.district,
        zone: form.zone,
        account_number: form.account_number.trim(),
        ifsc_code: form.ifsc_code.trim(),
      };
      await api.put('/farmers/me', payload);
      setProfile((prev) => ({ ...prev, ...payload }));
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

  const menuItems = [
    { label: 'Edit Products', icon: 'cube-outline', onPress: () => navigation.navigate('EditProduct') },
    { label: 'Contact Admin', icon: 'mail-outline', onPress: () => navigation.navigate('ContactAdmin') },
    { label: 'Selling History', icon: 'time-outline', onPress: () => navigation.navigate('History') },
    { label: 'FAQ', icon: 'help-circle-outline', onPress: () => navigation.navigate('FAQ') },
    { label: 'Help & Support', icon: 'headset-outline', onPress: () => navigation.navigate('HelpSupport') },
    { label: 'Feedback', icon: 'chatbubble-ellipses-outline', onPress: () => navigation.navigate('Feedback') },
    { label: 'App Info', icon: 'information-circle-outline', onPress: () => navigation.navigate('AppInfo') },
  ];

  const renderDropdown = (items, selected, onSelect, visible, setVisible, placeholder) => (
    <>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => {
          if (!editMode) return;
          setShowStatePicker(false);
          setShowDistrictPicker(false);
          setShowZonePicker(false);
          setVisible(!visible);
        }}
        activeOpacity={editMode ? 0.7 : 1}
      >
        <Text style={[styles.dropdownText, !selected && { color: '#999' }]}>
          {selected || placeholder}
        </Text>
        {editMode && <Ionicons name={visible ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />}
      </TouchableOpacity>
      {visible && editMode && (
        <View style={styles.dropdownList}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
            {items.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.dropdownItem, selected === item && styles.dropdownItemActive]}
                onPress={() => {
                  onSelect(item);
                  setVisible(false);
                }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selected === item && { color: '#1B5E20', fontWeight: '700' },
                  ]}
                >
                  {item}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );

  if (loading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  const avatarUrl = form.profile_image
    ? optimizeImageUrl(form.profile_image, { width: 200 })
    : null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Profile Header */}
          <LinearGradient
            colors={['#1B5E20', '#388E3C', '#4CAF50']}
            style={[styles.profileHeader, { paddingTop: insets.top + 16 }]}
          >
            <TouchableOpacity
              style={styles.avatarContainer}
              onPress={handleImagePick}
              disabled={uploadingImage}
            >
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={44} color="#fff" />
                </View>
              )}
              {uploadingImage ? (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <View style={styles.cameraIcon}>
                  <Ionicons name="camera" size={16} color="#fff" />
                </View>
              )}
            </TouchableOpacity>

            <Text style={styles.profileName}>{form.full_name || 'Farmer'}</Text>
            <Text style={styles.profileEmail}>{profile?.email || authState?.user?.email || ''}</Text>
            <View style={styles.roleBadge}>
              <MaterialCommunityIcons name="sprout" size={14} color="#fff" />
              <Text style={styles.roleBadgeText}>Farmer</Text>
            </View>
          </LinearGradient>

          {/* Edit Toggle */}
          <View style={styles.editToggleRow}>
            <TouchableOpacity
              style={[styles.editToggleBtn, editMode && styles.editToggleBtnActive]}
              onPress={() => {
                if (editMode) handleSave();
                else setEditMode(true);
              }}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={editMode ? 'checkmark-circle-outline' : 'create-outline'}
                    size={18}
                    color={editMode ? '#fff' : '#1B5E20'}
                  />
                  <Text
                    style={[styles.editToggleText, editMode && { color: '#fff' }]}
                  >
                    {editMode ? 'Save Changes' : 'Edit Profile'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            {editMode && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setEditMode(false);
                  fetchProfile();
                }}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Personal Info */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="person-outline" size={20} color="#1B5E20" />
              <Text style={styles.sectionTitle}>Personal Information</Text>
            </View>

            <Text style={styles.fieldLabel}>Full Name</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.full_name}
              onChangeText={(v) => updateForm('full_name', v)}
              editable={editMode}
            />

            <Text style={styles.fieldLabel}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={profile?.email || authState?.user?.email || ''}
              editable={false}
            />

            <Text style={styles.fieldLabel}>Phone</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.phone}
              onChangeText={(v) => updateForm('phone', v)}
              editable={editMode}
              keyboardType="phone-pad"
            />

            <Text style={styles.fieldLabel}>Username</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={profile?.username || authState?.user?.username || ''}
              editable={false}
            />
          </View>

          {/* Farm Info */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <MaterialCommunityIcons name="barn" size={20} color="#1B5E20" />
              <Text style={styles.sectionTitle}>Farm Information</Text>
            </View>

            <Text style={styles.fieldLabel}>Farm Name</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.farm_name}
              onChangeText={(v) => updateForm('farm_name', v)}
              editable={editMode}
            />

            <Text style={styles.fieldLabel}>Global Farmer ID</Text>
            <TextInput
              style={[styles.input, styles.inputDisabled]}
              value={form.global_farmer_id}
              editable={false}
              placeholder="Assigned by admin"
            />

            <Text style={styles.fieldLabel}>Address Line</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.address_line}
              onChangeText={(v) => updateForm('address_line', v)}
              editable={editMode}
            />

            <Text style={styles.fieldLabel}>City</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.city}
              onChangeText={(v) => updateForm('city', v)}
              editable={editMode}
            />

            <Text style={styles.fieldLabel}>State</Text>
            {renderDropdown(
              states,
              form.state,
              (v) => {
                updateForm('state', v);
                updateForm('district', '');
              },
              showStatePicker,
              setShowStatePicker,
              'Select state'
            )}

            <Text style={styles.fieldLabel}>District</Text>
            {renderDropdown(
              districts,
              form.district,
              (v) => updateForm('district', v),
              showDistrictPicker,
              setShowDistrictPicker,
              form.state ? 'Select district' : 'Select state first'
            )}

            <Text style={styles.fieldLabel}>Pincode</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.pincode}
              onChangeText={(v) => updateForm('pincode', v)}
              editable={editMode}
              keyboardType="numeric"
              maxLength={6}
            />

            <Text style={styles.fieldLabel}>Zone</Text>
            {renderDropdown(
              ZONES,
              form.zone,
              (v) => updateForm('zone', v),
              showZonePicker,
              setShowZonePicker,
              'Select zone'
            )}
          </View>

          {/* Bank Details */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionTitleRow}>
              <Ionicons name="card-outline" size={20} color="#1B5E20" />
              <Text style={styles.sectionTitle}>Bank Details</Text>
            </View>

            <Text style={styles.fieldLabel}>Account Number</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.account_number}
              onChangeText={(v) => updateForm('account_number', v)}
              editable={editMode}
              keyboardType="numeric"
              secureTextEntry={!editMode}
            />

            <Text style={styles.fieldLabel}>IFSC Code</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.ifsc_code}
              onChangeText={(v) => updateForm('ifsc_code', v.toUpperCase())}
              editable={editMode}
              autoCapitalize="characters"
            />

            <Text style={styles.fieldLabel}>Bank Name</Text>
            <TextInput
              style={[styles.input, !editMode && styles.inputDisabled]}
              value={form.bank_name}
              onChangeText={(v) => updateForm('bank_name', v)}
              editable={editMode}
            />
          </View>

          {/* Menu Items */}
          <View style={styles.sectionCard}>
            {menuItems.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.menuItem, idx < menuItems.length - 1 && styles.menuItemBorder]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                <View style={styles.menuLeft}>
                  <Ionicons name={item.icon} size={22} color="#1B5E20" />
                  <Text style={styles.menuLabel}>{item.label}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </TouchableOpacity>
            ))}
          </View>

          {/* Logout */}
          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={22} color="#F44336" />
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

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

      {/* ── Photo Picker Modal ── */}
      <Modal visible={photoPickerVisible} transparent animationType="slide" onRequestClose={() => setPhotoPickerVisible(false)}>
        <TouchableOpacity style={fpStyles.overlay} activeOpacity={1} onPress={() => setPhotoPickerVisible(false)}>
          <View style={fpStyles.sheet}>
            <View style={fpStyles.handle} />
            <Text style={fpStyles.sheetTitle}>Profile Photo</Text>
            <TouchableOpacity
              style={fpStyles.optionBtn}
              onPress={() => {
                setPhotoPickerVisible(false);
                setTimeout(async () => {
                  const uri = await pickImage(true);
                  if (uri) uploadProfileImage(uri);
                }, 300);
              }}
            >
              <View style={[fpStyles.optionIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="camera-outline" size={24} color="#388E3C" />
              </View>
              <Text style={fpStyles.optionText}>Take Photo</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={fpStyles.optionBtn}
              onPress={() => {
                setPhotoPickerVisible(false);
                setTimeout(async () => {
                  const uri = await pickImage(false);
                  if (uri) uploadProfileImage(uri);
                }, 300);
              }}
            >
              <View style={[fpStyles.optionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="image-outline" size={24} color="#1976D2" />
              </View>
              <Text style={fpStyles.optionText}>Choose from Gallery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={fpStyles.cancelBtn} onPress={() => setPhotoPickerVisible(false)} activeOpacity={0.7}>
              <Text style={fpStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default FarmerProfile;

const fpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#DDD', alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#1A1A1A', marginBottom: 16 },
  optionBtn: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  optionIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  optionText: { fontSize: 15, color: '#333', fontWeight: '500' },
  cancelBtn: {
    marginTop: 12, paddingVertical: 14, borderRadius: 14,
    backgroundColor: '#F5F5F5', alignItems: 'center',
  },
  cancelText: { fontSize: 15, color: '#666', fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  /* Profile Header */
  profileHeader: {
    alignItems: 'center',
    paddingBottom: 28,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
  },
  avatarContainer: { position: 'relative', marginBottom: 12 },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#fff' },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#4CAF50',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  profileName: { color: '#fff', fontSize: 22, fontWeight: '700' },
  profileEmail: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 4 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 10,
  },
  roleBadgeText: { color: '#fff', fontSize: 13, fontWeight: '600', marginLeft: 6 },

  /* Edit Toggle */
  editToggleRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 16, gap: 10 },
  editToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    gap: 6,
  },
  editToggleBtnActive: { backgroundColor: '#4CAF50' },
  editToggleText: { fontSize: 15, fontWeight: '600', color: '#1B5E20' },
  cancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
  },
  cancelText: { color: '#F44336', fontWeight: '600' },

  /* Section Card */
  sectionCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#1B5E20' },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 5 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inputDisabled: { backgroundColor: '#F5F5F5', color: '#888' },

  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownText: { fontSize: 15, color: '#333' },
  dropdownList: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: { backgroundColor: '#E8F5E9' },
  dropdownItemText: { fontSize: 15, color: '#333' },

  /* Menu */
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  menuLabel: { fontSize: 15, color: '#333', fontWeight: '500' },

  /* Logout */
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FFCDD2',
    gap: 8,
  },
  logoutText: { color: '#F44336', fontSize: 16, fontWeight: '600' },

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
