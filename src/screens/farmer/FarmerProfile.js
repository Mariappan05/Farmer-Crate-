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
  StatusBar,
  Platform,
  Animated,
  Modal,
  FlatList,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { pickImage, uploadImageToCloudinary, optimizeImageUrl } from '../../services/cloudinaryService';
import { useAuth } from '../../context/AuthContext';
import ToastMessage from '../../utils/Toast';

const SOUTH_INDIAN_STATES = [
  'Tamil Nadu',
  'Kerala',
  'Karnataka',
  'Andhra Pradesh',
  'Telangana',
  'Puducherry',
];

const DISTRICTS_BY_STATE = {
  'Tamil Nadu': [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
    'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Dindigul',
    'Thanjavur', 'Ranipet', 'Sivagangai', 'Karur', 'Namakkal',
    'Tiruppur', 'Cuddalore', 'Kanchipuram', 'Tiruvallur', 'Villupuram',
    'Nagapattinam', 'Krishnagiri', 'Dharmapuri', 'Ramanathapuram',
    'Virudhunagar', 'Theni', 'Ariyalur', 'Perambalur', 'Nilgiris',
    'Pudukkottai', 'Kallakurichi', 'Tenkasi', 'Tirupattur',
    'Chengalpattu', 'Tiruvarur', 'Mayiladuthurai',
  ],
  Kerala: [
    'Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam',
    'Palakkad', 'Alappuzha', 'Malappuram', 'Kannur', 'Kottayam',
    'Idukki', 'Pathanamthitta', 'Ernakulam', 'Wayanad', 'Kasaragod',
  ],
  Karnataka: [
    'Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi',
    'Kalaburagi', 'Davanagere', 'Ballari', 'Vijayapura', 'Shivamogga',
    'Tumakuru', 'Raichur', 'Bidar', 'Mandya', 'Hassan',
    'Chitradurga', 'Udupi', 'Chikkamagaluru', 'Kodagu', 'Yadgir',
    'Haveri', 'Gadag', 'Chamarajanagar', 'Bagalkot', 'Ramanagara',
    'Chikkaballapur', 'Koppal', 'Dharwad',
  ],
  'Andhra Pradesh': [
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool',
    'Tirupati', 'Rajahmundry', 'Kakinada', 'Kadapa', 'Anantapur',
    'Eluru', 'Ongole', 'Srikakulam', 'Vizianagaram', 'Chittoor',
    'Prakasam', 'West Godavari', 'East Godavari', 'Krishna', 'Palnadu',
    'Bapatla', 'Anakapalli', 'Alluri Sitharama Raju', 'Konaseema',
    'NTR', 'Sri Sathya Sai', 'Annamayya',
  ],
  Telangana: [
    'Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar',
    'Ramagundam', 'Mahbubnagar', 'Nalgonda', 'Adilabad', 'Suryapet',
    'Siddipet', 'Miryalaguda', 'Jagtial', 'Mancherial', 'Nirmal',
    'Kamareddy', 'Medak', 'Wanaparthy', 'Nagarkurnool',
    'Jogulamba Gadwal', 'Sangareddy', 'Medchal-Malkajgiri', 'Vikarabad',
    'Rangareddy', 'Yadadri Bhuvanagiri', 'Jayashankar Bhupalpally',
    'Mulugu', 'Narayanpet', 'Mahabubabad', 'Jangaon', 'Peddapalli',
    'Rajanna Sircilla', 'Kumuram Bheem Asifabad',
  ],
  Puducherry: [
    'Puducherry', 'Karaikal', 'Mahe', 'Yanam',
  ],
};

const ShimmerBlock = ({ width, height, style, borderRadius = 8 }) => {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 800, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 800, useNativeDriver: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['#e0e0e0', '#f5f5f5'],
  });

  return <Animated.View style={[{ width, height, borderRadius, backgroundColor: bg }, style]} />;
};

const DropdownModal = ({ visible, title, data, selected, onSelect, onClose }) => {
  const [search, setSearch] = useState('');
  const filtered = data.filter((item) => item.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (visible) setSearch('');
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={ddStyles.overlay}>
        <View style={ddStyles.container}>
          <View style={ddStyles.header}>
            <Text style={ddStyles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={ddStyles.closeBtn}>
              <Ionicons name="close" size={22} color="#666" />
            </TouchableOpacity>
          </View>

          {data.length > 6 && (
            <View style={ddStyles.searchWrap}>
              <Ionicons name="search-outline" size={18} color="#999" />
              <TextInput
                style={ddStyles.searchInput}
                placeholder={'Search ' + title.toLowerCase().replace('select ', '') + '...'}
                placeholderTextColor="#aaa"
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color="#ccc" />
                </TouchableOpacity>
              )}
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            renderItem={({ item }) => {
              const isSelected = item === selected;
              return (
                <TouchableOpacity
                  style={[ddStyles.item, isSelected && ddStyles.itemSelected]}
                  onPress={() => {
                    onSelect(item);
                    onClose();
                  }}
                >
                  <Text style={[ddStyles.itemText, isSelected && ddStyles.itemTextSelected]}>{item}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={{ padding: 32, alignItems: 'center' }}>
                <Text style={{ color: '#aaa', fontSize: 14 }}>No results found</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      </View>
    </Modal>
  );
};

const ProfileField = ({
  icon,
  label,
  value,
  isEditing,
  onChangeText,
  keyboardType = 'default',
  placeholder = '',
  maxLength,
  multiline = false,
  readOnly = false,
  secureTextEntry = false,
  autoCapitalize = 'none',
}) => (
  <View style={styles.formField}>
    <Ionicons
      name={icon}
      size={18}
      color={isEditing && !readOnly ? '#1B5E20' : '#999'}
      style={{ marginRight: 10, marginTop: 2 }}
    />
    <View style={{ flex: 1 }}>
      <Text style={[styles.fieldLabel, isEditing && !readOnly && styles.fieldLabelActive]}>
        {label}
        {readOnly && <Text style={{ color: '#ccc', fontSize: 10 }}>  (read-only)</Text>}
      </Text>
      {isEditing && !readOnly ? (
        <TextInput
          style={[styles.input, multiline && { minHeight: 52, textAlignVertical: 'top' }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor="#bbb"
          maxLength={maxLength}
          multiline={multiline}
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
        />
      ) : (
        <Text style={styles.fieldValue}>{value || '\u2014'}</Text>
      )}
    </View>
  </View>
);

const FarmerProfile = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState, clearSession } = useAuth();

  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [profileImage, setProfileImage] = useState('');

  const [form, setForm] = useState({
    full_name: '',
    username: '',
    email: '',
    phone: '',
    farm_name: '',
    global_farmer_id: '',
    address_line: '',
    city: '',
    state: '',
    district: '',
    pincode: '',
    zone: '',
    account_number: '',
    ifsc_code: '',
    bank_name: '',
  });

  const [stateModalVisible, setStateModalVisible] = useState(false);
  const [districtModalVisible, setDistrictModalVisible] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [photoPickerVisible, setPhotoPickerVisible] = useState(false);
  const toastRef = useRef(null);

  const availableDistricts = DISTRICTS_BY_STATE[form.state] || [];

  const populateForm = useCallback((raw) => {
    const userNested = raw?.user || {};
    const d = { ...userNested, ...raw };

    setForm({
      full_name: d.full_name || d.name || userNested.full_name || '',
      username: d.username || d.user_name || userNested.username || '',
      email: d.email || userNested.email || '',
      phone: d.phone || d.mobile || d.mobile_number || userNested.phone || '',
      farm_name: d.farm_name || userNested.farm_name || '',
      global_farmer_id: d.global_farmer_id || d.farmer_id || userNested.global_farmer_id || '',
      address_line: d.address_line || d.address || userNested.address_line || userNested.address || '',
      city: d.city || userNested.city || '',
      state: d.state || userNested.state || '',
      district: d.district || userNested.district || '',
      pincode: String(d.pincode || d.zip_code || userNested.pincode || ''),
      zone: d.zone || userNested.zone || '',
      account_number: d.account_number || userNested.account_number || '',
      ifsc_code: d.ifsc_code || userNested.ifsc_code || '',
      bank_name: d.bank_name || userNested.bank_name || '',
    });

    setProfileImage(
      d.image_url || d.profile_image || d.profileImage || d.avatar || d.image
      || userNested.image_url || userNested.profile_image || '',
    );
  }, []);

  const fetchProfile = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);

    try {
      const { data } = await api.get('/farmers/me');
      const raw = data?.farmer || data?.data?.farmer || data?.data || data?.user || data?.profile || data;

      if (raw) {
        setProfile(raw);
        populateForm(raw);
      }
    } catch (e) {
      console.log('Profile fetch error:', e?.message || e);
      const cached = authState?.user;

      if (cached && !silent) {
        populateForm(cached);
        toastRef.current?.show('Showing cached profile. Pull down to refresh.', 'warning');
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [authState?.user, populateForm]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleImagePick = () => {
    if (!isEditing) return;
    setPhotoPickerVisible(true);
  };

  const uploadProfileImage = async (uri) => {
    setIsUploading(true);
    try {
      const url = await uploadImageToCloudinary(uri);
      if (url) {
        setProfileImage(url);
        toastRef.current?.show('Photo uploaded successfully', 'success');
      } else {
        toastRef.current?.show('Failed to upload image. Please try again.', 'error');
      }
    } catch (_e) {
      toastRef.current?.show('Image upload failed.', 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toastRef.current?.show('Full name is required.', 'warning');
      return;
    }

    if (form.phone && !/^\d{10}$/.test(form.phone.replace(/\D/g, ''))) {
      toastRef.current?.show('Please enter a valid 10-digit phone number.', 'warning');
      return;
    }

    if (form.pincode && !/^\d{6}$/.test(form.pincode)) {
      toastRef.current?.show('Please enter a valid 6-digit pincode.', 'warning');
      return;
    }

    setIsSaving(true);

    const payload = {
      name: form.full_name.trim(),
      mobile_number: form.phone.trim(),
      farm_name: form.farm_name.trim(),
      address: form.address_line.trim(),
      city: form.city.trim(),
      state: form.state,
      district: form.district,
      pincode: form.pincode.trim(),
      zone: form.zone.trim(),
      account_number: form.account_number.trim(),
      ifsc_code: form.ifsc_code.trim().toUpperCase(),
      bank_name: form.bank_name.trim(),
      image_url: profileImage,
    };

    try {
      await api.put('/farmers/me', payload);
      setProfile((prev) => ({ ...prev, ...payload }));
      setIsEditing(false);
      toastRef.current?.show('Profile updated successfully!', 'success');
    } catch (e) {
      toastRef.current?.show(e?.message || 'Failed to update profile.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStateChange = (value) => {
    setForm((prev) => ({ ...prev, state: value, district: '' }));
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    if (profile) {
      populateForm(profile);
    }
  };

  const handleLogout = () => setLogoutModalVisible(true);

  const confirmLogout = async () => {
    setLogoutModalVisible(false);
    try {
      await clearSession();
    } catch (e) {
      console.log('Logout error:', e?.message || e);
    }
  };

  const menuItems = [
    { icon: 'shield-checkmark-outline', label: 'FHE Encryption', color: '#1B5E20', bg: '#E8F5E9', onPress: () => navigation.navigate('FHEEncryption') },
    { icon: 'analytics-outline', label: 'Price Prediction', color: '#2E7D32', bg: '#E0F2F1', onPress: () => navigation.navigate('PricePrediction') },
    { icon: 'cube-outline', label: 'Edit Products', color: '#1565C0', bg: '#E3F2FD', onPress: () => navigation.navigate('EditProduct') },
    { icon: 'time-outline', label: 'Selling History', color: '#E65100', bg: '#FFF3E0', onPress: () => navigation.navigate('History') },
    { icon: 'mail-outline', label: 'Contact Admin', color: '#6A1B9A', bg: '#F3E5F5', onPress: () => navigation.navigate('ContactAdmin') },
    { icon: 'help-circle-outline', label: 'FAQ', color: '#00695C', bg: '#E0F2F1', onPress: () => navigation.navigate('FAQ') },
    { icon: 'headset-outline', label: 'Help & Support', color: '#37474F', bg: '#ECEFF1', onPress: () => navigation.navigate('HelpSupport') },
    { icon: 'chatbubble-outline', label: 'Feedback', color: '#F57F17', bg: '#FFFDE7', onPress: () => navigation.navigate('Feedback') },
    { icon: 'information-circle-outline', label: 'App Info', color: '#424242', bg: '#F5F5F5', onPress: () => navigation.navigate('AppInfo') },
  ];

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#103A12" />
        <View style={styles.headerBar}>
          <Text style={styles.headerTitle}>Farmer Profile</Text>
        </View>
        <View style={styles.skeletonHeader}>
          <ShimmerBlock width={100} height={100} borderRadius={50} />
          <ShimmerBlock width={180} height={18} style={{ marginTop: 14 }} />
          <ShimmerBlock width={210} height={13} style={{ marginTop: 8 }} />
          <ShimmerBlock width={92} height={24} borderRadius={12} style={{ marginTop: 10 }} />
        </View>
        <View style={{ padding: 16, gap: 12 }}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <ShimmerBlock key={i} width="100%" height={52} borderRadius={12} />
          ))}
        </View>
      </View>
    );
  }

  const displayName = form.full_name || form.username || 'Farmer';
  const displayEmail = form.email || profile?.email || authState?.user?.email || 'No email';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'F';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}> 
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <View style={styles.headerBar}>
        <TouchableOpacity
          onPress={() => navigation.canGoBack() && navigation.goBack()}
          style={styles.headerBackBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Farmer Profile</Text>
        <TouchableOpacity
          onPress={() => (isEditing ? handleCancelEdit() : setIsEditing(true))}
          style={[styles.editToggleBtn, isEditing && styles.editToggleBtnActive]}
        >
          <Ionicons name={isEditing ? 'close' : 'create-outline'} size={20} color={isEditing ? '#EF5350' : '#fff'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              fetchProfile(true);
            }}
            colors={['#1B5E20']}
            tintColor="#1B5E20"
          />
        }
      >
        <LinearGradient
          colors={['#103A12', '#1B5E20', '#2E7D32']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileHeaderBg}
        >
          <TouchableOpacity
            onPress={isEditing ? handleImagePick : null}
            activeOpacity={isEditing ? 0.7 : 1}
            style={styles.avatarWrapper}
          >
            {profileImage ? (
              <Image
                source={{ uri: optimizeImageUrl(profileImage, { width: 200 }) }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Text style={styles.avatarInitial}>{initials}</Text>
              </View>
            )}
            {isEditing && (
              <View style={styles.cameraOverlay}>
                {isUploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="camera" size={18} color="#fff" />
                )}
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileEmail}>{displayEmail}</Text>

          <View style={styles.roleBadge}>
            <MaterialCommunityIcons name="sprout" size={13} color="#fff" />
            <Text style={styles.roleBadgeText}>Farmer</Text>
          </View>
        </LinearGradient>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="person-circle-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardHeaderText}>Personal Information</Text>
          </View>

          <ProfileField
            icon="person-outline"
            label="Full Name"
            value={form.full_name}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, full_name: value }))}
            placeholder="Enter full name"
            autoCapitalize="words"
          />

          <ProfileField
            icon="mail-outline"
            label="Email"
            value={displayEmail}
            isEditing={false}
            readOnly
          />

          <ProfileField
            icon="call-outline"
            label="Phone"
            value={form.phone}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value.replace(/\D/g, '') }))}
            keyboardType="phone-pad"
            placeholder="Enter 10-digit phone number"
            maxLength={10}
          />

          <ProfileField
            icon="at-outline"
            label="Username"
            value={form.username || profile?.username || authState?.user?.username || ''}
            isEditing={false}
            readOnly
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="barn" size={20} color="#1B5E20" />
            <Text style={styles.cardHeaderText}>Farm Information</Text>
          </View>

          <ProfileField
            icon="leaf-outline"
            label="Farm Name"
            value={form.farm_name}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, farm_name: value }))}
            placeholder="Enter farm name"
            autoCapitalize="words"
          />

          <ProfileField
            icon="card-outline"
            label="Global Farmer ID"
            value={form.global_farmer_id}
            isEditing={false}
            readOnly
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="location-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardHeaderText}>Address Details</Text>
          </View>

          <ProfileField
            icon="home-outline"
            label="Address Line"
            value={form.address_line}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, address_line: value }))}
            placeholder="Street address, building, etc."
            multiline
            autoCapitalize="sentences"
          />

          <ProfileField
            icon="business-outline"
            label="City"
            value={form.city}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, city: value }))}
            placeholder="Enter city"
            autoCapitalize="words"
          />

          <View style={styles.formField}>
            <Ionicons name="map-outline" size={18} color="#888" style={{ marginRight: 10, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>State</Text>
              {isEditing ? (
                <TouchableOpacity style={styles.dropdownTrigger} onPress={() => setStateModalVisible(true)}>
                  <Text style={[styles.dropdownText, !form.state && { color: '#aaa' }]}>{form.state || 'Select state'}</Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.fieldValue}>{form.state || '\u2014'}</Text>
              )}
            </View>
          </View>

          <View style={styles.formField}>
            <Ionicons name="navigate-outline" size={18} color="#888" style={{ marginRight: 10, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>District</Text>
              {isEditing ? (
                <TouchableOpacity
                  style={[styles.dropdownTrigger, !form.state && { opacity: 0.5 }]}
                  onPress={() => {
                    if (!form.state) {
                      toastRef.current?.show('Please select a state first.', 'warning');
                      return;
                    }
                    setDistrictModalVisible(true);
                  }}
                >
                  <Text style={[styles.dropdownText, !form.district && { color: '#aaa' }]}>{form.district || 'Select district'}</Text>
                  <Ionicons name="chevron-down" size={18} color="#888" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.fieldValue}>{form.district || '\u2014'}</Text>
              )}
            </View>
          </View>

          <ProfileField
            icon="keypad-outline"
            label="Pincode"
            value={form.pincode}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, pincode: value.replace(/\D/g, '') }))}
            keyboardType="number-pad"
            placeholder="6-digit pincode"
            maxLength={6}
          />

          <ProfileField
            icon="globe-outline"
            label="Zone"
            value={form.zone}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, zone: value }))}
            placeholder="Enter zone"
            autoCapitalize="words"
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="card-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardHeaderText}>Bank Details</Text>
          </View>

          <ProfileField
            icon="wallet-outline"
            label="Account Number"
            value={form.account_number}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, account_number: value.replace(/\D/g, '') }))}
            keyboardType="number-pad"
            placeholder="Enter account number"
            secureTextEntry={!isEditing && !!form.account_number}
          />

          <ProfileField
            icon="code-outline"
            label="IFSC Code"
            value={form.ifsc_code}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, ifsc_code: value.toUpperCase() }))}
            placeholder="Enter IFSC code"
            autoCapitalize="characters"
          />

          <ProfileField
            icon="business-outline"
            label="Bank Name"
            value={form.bank_name}
            isEditing={isEditing}
            onChangeText={(value) => setForm((prev) => ({ ...prev, bank_name: value }))}
            placeholder="Enter bank name"
            autoCapitalize="words"
          />
        </View>

        {isEditing && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleCancelEdit} disabled={isSaving} activeOpacity={0.7}>
              <Ionicons name="close-outline" size={20} color="#888" />
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveBtn, isSaving && { opacity: 0.7 }]}
              onPress={handleSave}
              disabled={isSaving}
              activeOpacity={0.8}
            >
              {isSaving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.saveBtnText}>Save Changes</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="grid-outline" size={20} color="#1B5E20" />
            <Text style={styles.cardHeaderText}>Quick Links</Text>
          </View>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={item.label}
              onPress={item.onPress}
              style={[styles.menuItem, index < menuItems.length - 1 && styles.menuItemBorder]}
              activeOpacity={0.6}
            >
              <View style={[styles.menuIconBox, { backgroundColor: item.bg }]}> 
                <Ionicons name={item.icon} size={20} color={item.color} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={18} color="#bbb" />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={20} color="#F44336" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>

        <Text style={styles.versionText}>FarmerCrate v1.0.0</Text>
      </ScrollView>

      <DropdownModal
        visible={stateModalVisible}
        title="Select State"
        data={SOUTH_INDIAN_STATES}
        selected={form.state}
        onSelect={handleStateChange}
        onClose={() => setStateModalVisible(false)}
      />
      <DropdownModal
        visible={districtModalVisible}
        title="Select District"
        data={availableDistricts}
        selected={form.district}
        onSelect={(value) => setForm((prev) => ({ ...prev, district: value }))}
        onClose={() => setDistrictModalVisible(false)}
      />
      <ToastMessage ref={toastRef} />

      <Modal
        visible={photoPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPhotoPickerVisible(false)}
      >
        <TouchableOpacity style={ppStyles.overlay} activeOpacity={1} onPress={() => setPhotoPickerVisible(false)}>
          <View style={ppStyles.sheet}>
            <View style={ppStyles.handle} />
            <Text style={ppStyles.title}>Update Profile Photo</Text>
            <Text style={ppStyles.subtitle}>Choose image source</Text>
            <TouchableOpacity
              style={ppStyles.option}
              onPress={async () => {
                setPhotoPickerVisible(false);
                setTimeout(async () => {
                  const uri = await pickImage(true);
                  if (uri) uploadProfileImage(uri);
                }, 300);
              }}
              activeOpacity={0.7}
            >
              <View style={[ppStyles.optionIcon, { backgroundColor: '#E3F2FD' }]}> 
                <Ionicons name="camera" size={26} color="#1565C0" />
              </View>
              <View style={ppStyles.optionText}>
                <Text style={ppStyles.optionLabel}>Camera</Text>
                <Text style={ppStyles.optionSub}>Take a new photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <View style={ppStyles.divider} />
            <TouchableOpacity
              style={ppStyles.option}
              onPress={async () => {
                setPhotoPickerVisible(false);
                setTimeout(async () => {
                  const uri = await pickImage(false);
                  if (uri) uploadProfileImage(uri);
                }, 300);
              }}
              activeOpacity={0.7}
            >
              <View style={[ppStyles.optionIcon, { backgroundColor: '#E8F5E9' }]}> 
                <Ionicons name="images" size={26} color="#1B5E20" />
              </View>
              <View style={ppStyles.optionText}>
                <Text style={ppStyles.optionLabel}>Photo Gallery</Text>
                <Text style={ppStyles.optionSub}>Choose from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <TouchableOpacity style={ppStyles.cancelBtn} onPress={() => setPhotoPickerVisible(false)} activeOpacity={0.7}>
              <Text style={ppStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

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
            <Text style={styles.logoutModalMsg}>Are you sure you want to sign out from your account?</Text>
            <View style={styles.logoutModalBtns}>
              <TouchableOpacity style={styles.logoutCancelBtn} onPress={() => setLogoutModalVisible(false)} activeOpacity={0.8}>
                <Text style={styles.logoutCancelText}>Stay</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.logoutConfirmBtn} onPress={confirmLogout} activeOpacity={0.8}>
                <Ionicons name="log-out-outline" size={16} color="#fff" style={{ marginRight: 5 }} />
                <Text style={styles.logoutConfirmText}>Sign Out</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const ddStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#333' },
  closeBtn: { padding: 4 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F8F4',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 4,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  itemSelected: { backgroundColor: '#E8F5E9' },
  itemText: { fontSize: 15, color: '#333' },
  itemTextSelected: { color: '#1B5E20', fontWeight: '600' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },

  headerBar: {
    backgroundColor: '#103A12',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...Platform.select({
      android: { elevation: 6 },
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.18,
        shadowRadius: 6,
      },
    }),
  },
  headerBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    flex: 1,
    textAlign: 'center',
  },
  editToggleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editToggleBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
  },

  profileHeaderBg: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 30,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    overflow: 'hidden',
  },

  avatarWrapper: { position: 'relative', marginBottom: 14 },
  avatar: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 3,
    borderColor: '#fff',
  },
  avatarFallback: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  avatarInitial: { fontSize: 36, fontWeight: '800', color: '#fff' },
  cameraOverlay: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    backgroundColor: '#388E3C',
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },

  profileName: { fontSize: 20, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  profileEmail: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 3 },

  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 10,
  },
  roleBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginHorizontal: 14,
    marginTop: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    ...Platform.select({
      ios: {
        shadowColor: '#1B5E20',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 7,
      },
      android: { elevation: 4 },
    }),
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  cardHeaderText: { fontSize: 15, fontWeight: '800', color: '#1A1A1A', flex: 1 },

  formField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  fieldLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  fieldLabelActive: { color: '#1B5E20' },
  fieldValue: { fontSize: 14, color: '#1A1A1A', marginTop: 4 },
  input: {
    fontSize: 14,
    color: '#1A1A1A',
    backgroundColor: '#F4F8F4',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    marginTop: 5,
  },

  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F4F8F4',
    borderWidth: 1.5,
    borderColor: '#C8E6C9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 8,
    marginTop: 5,
  },
  dropdownText: { fontSize: 14, color: '#1A1A1A' },

  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: 14,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 15,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  cancelBtnText: { color: '#777', fontWeight: '700', fontSize: 15 },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1B5E20',
    borderRadius: 14,
    paddingVertical: 15,
    ...Platform.select({
      ios: {
        shadowColor: '#1B5E20',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
      },
      android: { elevation: 5 },
    }),
  },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  menuIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuLabel: { flex: 1, fontSize: 15, color: '#1A1A1A', fontWeight: '600' },

  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF3F3',
    marginHorizontal: 14,
    marginTop: 16,
    borderRadius: 16,
    paddingVertical: 15,
    borderWidth: 1.5,
    borderColor: '#FFCDD2',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: '#F44336' },

  logoutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logoutModal: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#1B5E20',
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 16,
  },
  logoutIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F44336',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
    shadowColor: '#F44336',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  logoutModalTitle: { fontSize: 22, fontWeight: '800', color: '#212121', marginBottom: 8 },
  logoutModalMsg: { fontSize: 14, color: '#757575', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  logoutModalBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  logoutCancelBtn: {
    flex: 1,
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  logoutCancelText: { fontSize: 15, fontWeight: '700', color: '#424242' },
  logoutConfirmBtn: {
    flex: 1.5,
    backgroundColor: '#F44336',
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F44336',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  logoutConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  versionText: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginTop: 20,
    marginBottom: 10,
  },

  skeletonHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    backgroundColor: '#1B5E20',
  },
});

const ppStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 19, fontWeight: '800', color: '#212121', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#9E9E9E', marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  optionIcon: {
    width: 50,
    height: 50,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '800', color: '#212121' },
  optionSub: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEF5EE', marginVertical: 2 },
  cancelBtn: {
    marginTop: 12,
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '800', color: '#757575' },
});

export default FarmerProfile;
