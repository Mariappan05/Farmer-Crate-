/**
 * GoogleProfileCompletion.js
 * Profile completion for new Google Sign-In users.
 * Mirrors Flutter google_profile_completion.dart
 *
 * API: POST /api/auth/google-complete-profile
 *   { email, name, googleId, role, mobile_number, address, pincode, zone,
 *     state, district, age, image_url?, ...role-specific fields }
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
  StatusBar,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import axios from 'axios';

import { useAuth } from '../../context/AuthContext';
import { googleCompleteProfile, decodeJwtPayload } from '../../services/authService';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';
import LocationPickerModal from './LocationPickerModal';

const GoogleProfileCompletion = ({ navigation, route }) => {
  const { email, name, googleId, role } = route.params;
  const insets = useSafeAreaInsets();
  const { saveSession } = useAuth();

  // ─── Form state ──────────────────────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [age, setAge] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [zone, setZone] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');

  // Profile image
  const [profileImage, setProfileImage] = useState(null);

  // Farmer-specific
  const [farmName, setFarmName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [globalFarmerId, setGlobalFarmerId] = useState('');

  // Transporter-specific
  const [companyName, setCompanyName] = useState('');
  const [vehicleType, setVehicleType] = useState('');
  const [aadharNumber, setAadharNumber] = useState('');
  const [panNumber, setPanNumber] = useState('');
  const [voterIdNumber, setVoterIdNumber] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [aadharDoc, setAadharDoc] = useState(null);
  const [panDoc, setPanDoc] = useState(null);
  const [voterIdDoc, setVoterIdDoc] = useState(null);
  const [licenseDoc, setLicenseDoc] = useState(null);
  const [tAccountNumber, setTAccountNumber] = useState('');
  const [tIfscCode, setTIfscCode] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);

  // ─── Map location confirm ────────────────────────────────────────────────
  const handleMapConfirm = (fields) => {
    if (fields.address)  setAddress(fields.address);
    if (fields.city)     setCity(fields.city);
    if (fields.pincode)  setPincode(fields.pincode);
    if (fields.zone)     setZone(fields.zone);
    if (fields.state)    setState(fields.state);
    if (fields.district) setDistrict(fields.district);
    setShowMapPicker(false);
  };

  // ─── Location auto-fill ──────────────────────────────────────────────────
  const getCurrentLocation = async () => {
    setLocationLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({});
      const resp = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.coords.latitude}&lon=${loc.coords.longitude}`,
        { headers: { 'User-Agent': 'FarmerCrate/1.0' } },
      );
      if (resp.data?.address) {
        const a = resp.data.address;
        setAddress(resp.data.display_name || '');
        setPincode(a.postcode || '');
        setZone(a.suburb || a.neighbourhood || a.village || '');
        setState(a.state || '');
        setDistrict(a.state_district || a.county || '');
        setCity(a.city || a.town || a.village || '');
        Alert.alert('Success', 'Location fetched successfully');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not fetch location.');
    } finally {
      setLocationLoading(false);
    }
  };

  // ─── Pick & set image / doc ──────────────────────────────────────────────
  const handlePickImage = async (setter) => {
    const uri = await pickImage();
    if (uri) setter(uri);
  };

  // ─── Validation ──────────────────────────────────────────────────────────
  const validate = () => {
    if (!phone || phone.length !== 10) {
      Alert.alert('Validation', 'Mobile number must be 10 digits');
      return false;
    }
    const ageNum = parseInt(age, 10);
    if (!age || isNaN(ageNum) || ageNum < 18 || ageNum > 100) {
      Alert.alert('Validation', 'Age must be between 18 and 100');
      return false;
    }
    if (!address || !pincode || !zone || !state || !district || !city) {
      Alert.alert('Validation', 'All location fields are required including city');
      return false;
    }
    if (pincode.length !== 6) {
      Alert.alert('Validation', 'Pincode must be 6 digits');
      return false;
    }
    if (role === 'farmer') {
      if (!farmName.trim()) {
        Alert.alert('Validation', 'Farm Name is required');
        return false;
      }
      if (!accountNumber || accountNumber.length < 9) {
        Alert.alert('Validation', 'Account number must be 9-18 digits');
        return false;
      }
      if (!ifscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifscCode)) {
        Alert.alert('Validation', 'Invalid IFSC code');
        return false;
      }
      // global_farmer_id is optional — assigned by admin
    }
    if (role === 'transporter') {
      if (!companyName.trim()) {
        Alert.alert('Validation', 'Company Name is required');
        return false;
      }
      if (!vehicleType.trim()) {
        Alert.alert('Validation', 'Vehicle Type is required');
        return false;
      }
      if (!aadharNumber || aadharNumber.length !== 12) {
        Alert.alert('Validation', 'Aadhar must be 12 digits');
        return false;
      }
      if (!panNumber || !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(panNumber)) {
        Alert.alert('Validation', 'Invalid PAN number');
        return false;
      }
      if (!voterIdNumber || voterIdNumber.length < 3) {
        Alert.alert('Validation', 'Voter ID must be at least 3 characters');
        return false;
      }
      if (!licenseNumber || licenseNumber.length < 5) {
        Alert.alert('Validation', 'License number must be at least 5 characters');
        return false;
      }
      if (!aadharDoc || !panDoc || !voterIdDoc || !licenseDoc) {
        Alert.alert('Validation', 'Please upload all 4 required documents');
        return false;
      }
      if (!tAccountNumber || tAccountNumber.length < 9) {
        Alert.alert('Validation', 'Account number must be 9-18 digits');
        return false;
      }
      if (!tIfscCode || !/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(tIfscCode)) {
        Alert.alert('Validation', 'Invalid IFSC code');
        return false;
      }
    }
    return true;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!validate()) return;
    setIsLoading(true);
    try {
      // Upload profile image
      let imageUrl = null;
      if (profileImage) {
        imageUrl = await uploadImageToCloudinary(profileImage);
        if (!imageUrl) {
          Alert.alert('Error', 'Failed to upload profile image');
          setIsLoading(false);
          return;
        }
      }

      // Build request body
      const body = {
        email,
        name,
        full_name: name,        // backend may expect full_name
        googleId,
        role,
        phone: phone.trim(),          // alias for backends expecting 'phone'
        mobile_number: phone.trim(),  // alias for backends expecting 'mobile_number'
        address: address.trim(),         // keep for legacy
        address_line: address.trim(),    // match normal signup field name
        city: city.trim(),
        pincode: pincode.trim(),
        zone: zone.trim(),
        state: state.trim(),
        district: district.trim(),
        age: parseInt(age, 10),
      };
      if (imageUrl) body.image_url = imageUrl;

      // Farmer-specific fields
      if (role === 'farmer') {
        body.farm_name = farmName.trim();
        body.account_number = accountNumber.trim();
        body.ifsc_code = ifscCode.trim().toUpperCase();
        if (bankName.trim()) body.bank_name = bankName.trim();
        if (globalFarmerId.trim()) body.global_farmer_id = globalFarmerId.trim();
      }

      // Transporter-specific fields
      if (role === 'transporter') {
        // Upload documents
        const [aadharUrl, panUrl, voterIdUrl, licenseUrl] = await Promise.all([
          uploadImageToCloudinary(aadharDoc),
          uploadImageToCloudinary(panDoc),
          uploadImageToCloudinary(voterIdDoc),
          uploadImageToCloudinary(licenseDoc),
        ]);
        if (!aadharUrl || !panUrl || !voterIdUrl || !licenseUrl) {
          Alert.alert('Error', 'Failed to upload one or more documents');
          setIsLoading(false);
          return;
        }
        body.company_name = companyName.trim();
        body.vehicle_type = vehicleType.trim();
        body.aadhar_url = aadharUrl;
        body.pan_url = panUrl;
        body.voter_id_url = voterIdUrl;
        body.license_url = licenseUrl;
        body.aadhar_number = aadharNumber.trim();
        body.pan_number = panNumber.trim().toUpperCase();
        body.voter_id_number = voterIdNumber.trim().toUpperCase();
        body.license_number = licenseNumber.trim().toUpperCase();
        body.account_number = tAccountNumber.trim();
        body.ifsc_code = tIfscCode.trim().toUpperCase();
      }

      const data = await googleCompleteProfile(body);

      // Farmer or transporter pending verification — no token returned
      if (data.requiresVerification) {
        Alert.alert(
          'Registration Submitted',
          'Your account has been created and is under review by our admin team. You will be notified once approved.',
          [{ text: 'OK', onPress: () => navigation.navigate('Login') }],
        );
        return;
      }

      if (data.token) {
        const user = data.user;

        // Save session & navigate
        const decoded = decodeJwtPayload(data.token);
        await saveSession({
          token: data.token,
          role,
          userId: user?.id ?? decoded?.userId,
          user,
          expiryMs: decoded?.exp ? decoded.exp * 1000 : undefined,
        });
        // AuthContext will auto-navigate via AppNavigator
      }
    } catch (e) {
      const msg =
        e?.response?.data?.message ||
        e?.message ||
        'Failed to complete profile';
      if (e?.response?.status === 400) {
        Alert.alert('Already Registered', 'This user already exists. Please login instead.', [
          { text: 'OK', onPress: () => navigation.navigate('Login') },
        ]);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render helpers ──────────────────────────────────────────────────────
  const renderInput = (label, value, setter, opts = {}) => (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        {opts.icon && (
          <Ionicons name={opts.icon} size={20} color="#388E3C" style={{ marginRight: 10 }} />
        )}
        {opts.prefix && <Text style={styles.prefix}>{opts.prefix}</Text>}
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={setter}
          placeholder={opts.placeholder || label}
          placeholderTextColor="#9E9E9E"
          keyboardType={opts.keyboardType || 'default'}
          maxLength={opts.maxLength}
          autoCapitalize={opts.autoCapitalize || 'sentences'}
        />
      </View>
    </View>
  );

  const renderDocPicker = (label, docUri, onPick) => (
    <TouchableOpacity
      style={[styles.docPicker, docUri && styles.docPickerSelected]}
      onPress={onPick}
      activeOpacity={0.7}
    >
      <Ionicons
        name={docUri ? 'checkmark-circle' : 'cloud-upload-outline'}
        size={22}
        color={docUri ? '#4CAF50' : '#999'}
      />
      <Text style={[styles.docPickerText, docUri && { color: '#4CAF50', fontWeight: '600' }]}>
        {docUri ? `${label} - Selected` : `Tap to upload ${label}`}
      </Text>
      {docUri && <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />}
    </TouchableOpacity>
  );

  // ─── UI ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#4CAF50" />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <LinearGradient colors={['#4CAF50', '#66BB6A']} style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Complete Your Profile</Text>
          <View style={{ width: 24 }} />
        </LinearGradient>

        <LinearGradient colors={['#4CAF50', '#66BB6A']} style={styles.welcomeBanner}>
          <Text style={styles.welcomeName}>Welcome, {name}!</Text>
          <Text style={styles.welcomeSub}>
            Complete your {role} profile to get started
          </Text>
        </LinearGradient>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.card}>
            {/* Profile Image */}
            <Text style={styles.sectionTitle}>Profile Image</Text>
            <TouchableOpacity style={styles.imagePicker} onPress={() => handlePickImage(setProfileImage)}>
              {profileImage ? (
                <Image source={{ uri: profileImage }} style={styles.imagePreview} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Ionicons name="camera-outline" size={36} color="#4CAF50" />
                  <Text style={styles.imagePlaceholderText}>Tap to select image</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Transporter documents */}
            {role === 'transporter' && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Required Documents</Text>
                {renderDocPicker('Aadhar Card', aadharDoc, () => handlePickImage(setAadharDoc))}
                {renderDocPicker('PAN Card', panDoc, () => handlePickImage(setPanDoc))}
                {renderDocPicker('Voter ID', voterIdDoc, () => handlePickImage(setVoterIdDoc))}
                {renderDocPicker('Driving License', licenseDoc, () => handlePickImage(setLicenseDoc))}
              </>
            )}

            {/* Contact Info */}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Contact Information</Text>
            {renderInput('Mobile Number', phone, setPhone, {
              icon: 'call-outline',
              prefix: '+91 ',
              keyboardType: 'phone-pad',
              maxLength: 10,
            })}
            {renderInput('Age', age, setAge, {
              icon: 'calendar-outline',
              keyboardType: 'numeric',
              maxLength: 3,
            })}
            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Location Details</Text>

            {/* Location action buttons */}
            <View style={styles.locationBtnRow}>
              {/* Get Current Location */}
              <TouchableOpacity
                style={[styles.locationBtn, { flex: 1, marginRight: 8 }]}
                onPress={getCurrentLocation}
                disabled={locationLoading}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#43A047', '#66BB6A']} style={styles.locationBtnInner}>
                  {locationLoading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="locate-outline" size={18} color="#fff" />
                  )}
                  <Text style={styles.locationBtnText} numberOfLines={1}>
                    {locationLoading ? 'Fetching…' : 'Use GPS'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Pick on Map */}
              <TouchableOpacity
                style={[styles.locationBtn, { flex: 1, marginLeft: 8 }]}
                onPress={() => setShowMapPicker(true)}
                activeOpacity={0.85}
              >
                <LinearGradient colors={['#1976D2', '#42A5F5']} style={styles.locationBtnInner}>
                  <Ionicons name="map-outline" size={18} color="#fff" />
                  <Text style={styles.locationBtnText} numberOfLines={1}>Pick on Map</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Filled location preview badge */}
            {(city || state) ? (
              <View style={styles.locationBadge}>
                <Ionicons name="location" size={15} color="#E53935" style={{ marginRight: 6 }} />
                <Text style={styles.locationBadgeText} numberOfLines={1}>
                  {[city, district, state].filter(Boolean).join(', ')}
                  {pincode ? `  📮 ${pincode}` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => { setAddress(''); setCity(''); setPincode(''); setZone(''); setState(''); setDistrict(''); }}
                  hitSlop={{ top: 6, left: 6, right: 6, bottom: 6 }}
                >
                  <Ionicons name="close-circle" size={16} color="#999" />
                </TouchableOpacity>
              </View>
            ) : null}

            {renderInput('Address', address, setAddress, { icon: 'home-outline' })}
            {renderInput('City', city, setCity, { icon: 'business-outline', autoCapitalize: 'words' })}
            {renderInput('Pincode', pincode, setPincode, {
              icon: 'pin-outline',
              keyboardType: 'numeric',
              maxLength: 6,
            })}
            {renderInput('Zone', zone, setZone, { icon: 'map-outline' })}
            {renderInput('State', state, setState, { icon: 'location-outline' })}
            {renderInput('District', district, setDistrict, { icon: 'business-outline' })}

            {/* Map picker modal */}
            <LocationPickerModal
              visible={showMapPicker}
              onClose={() => setShowMapPicker(false)}
              onConfirm={handleMapConfirm}
            />

            {/* Farmer fields */}
            {role === 'farmer' && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Farm Details</Text>
                {renderInput('Farm Name', farmName, setFarmName, {
                  icon: 'leaf-outline',
                  autoCapitalize: 'words',
                })}
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Banking Details</Text>
                {renderInput('Bank Name', bankName, setBankName, {
                  icon: 'business-outline',
                  autoCapitalize: 'words',
                  placeholder: 'e.g. State Bank of India',
                })}
                {renderInput('Account Number', accountNumber, setAccountNumber, {
                  icon: 'wallet-outline',
                  keyboardType: 'numeric',
                  maxLength: 18,
                })}
                {renderInput('IFSC Code', ifscCode, setIfscCode, {
                  icon: 'code-outline',
                  autoCapitalize: 'characters',
                  maxLength: 11,
                })}
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Farmer Identification</Text>
                {renderInput('Global Farmer ID', globalFarmerId, setGlobalFarmerId, {
                  icon: 'id-card-outline',
                })}
              </>
            )}

            {/* Transporter identity + banking */}
            {role === 'transporter' && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Company Details</Text>
                {renderInput('Company Name', companyName, setCompanyName, {
                  icon: 'business-outline',
                  autoCapitalize: 'words',
                })}
                {renderInput('Vehicle Type', vehicleType, setVehicleType, {
                  icon: 'car-outline',
                  placeholder: 'e.g. Truck, Van, Mini-truck',
                })}
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Identity Verification</Text>
                {renderInput('Aadhar Number', aadharNumber, setAadharNumber, {
                  icon: 'card-outline',
                  keyboardType: 'numeric',
                  maxLength: 12,
                })}
                {renderInput('PAN Number', panNumber, setPanNumber, {
                  icon: 'id-card-outline',
                  autoCapitalize: 'characters',
                  maxLength: 10,
                })}
                {renderInput('Voter ID Number', voterIdNumber, setVoterIdNumber, {
                  icon: 'document-outline',
                  autoCapitalize: 'characters',
                  maxLength: 10,
                })}
                {renderInput('License Number', licenseNumber, setLicenseNumber, {
                  icon: 'car-outline',
                  autoCapitalize: 'characters',
                  maxLength: 20,
                })}
                <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Banking Details</Text>
                {renderInput('Account Number', tAccountNumber, setTAccountNumber, {
                  icon: 'wallet-outline',
                  keyboardType: 'numeric',
                  maxLength: 18,
                })}
                {renderInput('IFSC Code', tIfscCode, setTIfscCode, {
                  icon: 'code-outline',
                  autoCapitalize: 'characters',
                  maxLength: 11,
                })}
              </>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={isLoading}
              activeOpacity={0.85}
            >
              <LinearGradient colors={['#4CAF50', '#66BB6A']} style={styles.submitBtnInner}>
                {isLoading ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.submitBtnText}>Submitting...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />
                    <Text style={styles.submitBtnText}>Complete Profile</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default GoogleProfileCompletion;

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F5F5F5' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  welcomeBanner: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 32 },
  welcomeName: { fontSize: 26, fontWeight: 'bold', color: '#fff' },
  welcomeSub: { fontSize: 15, color: 'rgba(255,255,255,0.9)', marginTop: 4 },
  scrollContent: { paddingBottom: 40 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: -20,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 12,
  },
  inputGroup: { marginBottom: 14 },
  inputLabel: { fontSize: 13, color: '#666', marginBottom: 6, fontWeight: '500' },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 50,
    backgroundColor: '#FAFAFA',
  },
  prefix: { color: '#388E3C', fontWeight: '600', marginRight: 2 },
  textInput: { flex: 1, fontSize: 15, color: '#333' },
  imagePicker: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    backgroundColor: '#FAFAFA',
  },
  imagePreview: { width: '100%', height: '100%', resizeMode: 'cover' },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: { color: '#999', fontSize: 14, marginTop: 6 },
  docPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 56,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FAFAFA',
    marginBottom: 10,
  },
  docPickerSelected: {
    borderColor: '#4CAF50',
    borderWidth: 2,
    backgroundColor: 'rgba(76,175,80,0.08)',
  },
  docPickerText: { flex: 1, marginLeft: 12, fontSize: 14, color: '#666' },
  locationBtnRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginBottom: 16,
  },
  locationBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 0 },
  locationBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  locationBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', marginLeft: 6 },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  locationBadgeText: {
    flex: 1,
    fontSize: 13,
    color: '#2E7D32',
    fontWeight: '500',
  },
  submitBtn: { marginTop: 28, borderRadius: 16, overflow: 'hidden' },
  submitBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    gap: 10,
  },
  submitBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
});
