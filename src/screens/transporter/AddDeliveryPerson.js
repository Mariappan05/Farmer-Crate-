/**
 * AddDeliveryPerson.js
 * Form to add a new delivery person with vehicle info.
 *
 * Features:
 *   - Form: name, email, phone, password
 *   - Vehicle info: vehicle type dropdown, vehicle number
 *   - POST /api/transporters/delivery-persons
 *   - Form validation
 *   - Success → navigate back
 *   - Loading state
 */

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';

const VEHICLE_TYPES = ['Bike', 'Auto', 'Van', 'Truck'];

const AddDeliveryPerson = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    mobile_number: '',
    password: '',
    vehicle_type: '',
    vehicle_number: '',
    license_number: '',
    current_location: '',
  });
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [errors, setErrors] = useState({});
  const [licenseImageUri, setLicenseImageUri] = useState('');
  const [profileImageUri, setProfileImageUri] = useState('');

  const updateField = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  };

  /* ── Validation ─────────────────────────────────────────── */
  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    if (!form.email.trim()) errs.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Invalid email';
    if (!form.phone.trim()) errs.phone = 'Phone is required';
    else if (!/^\d{10}$/.test(form.phone.trim())) errs.phone = 'Phone must be 10 digits';
    if (!form.mobile_number.trim()) errs.mobile_number = 'Mobile number is required';
    else if (!/^\d{10}$/.test(form.mobile_number.trim())) errs.mobile_number = 'Mobile number must be 10 digits';
    if (!form.password) errs.password = 'Password is required';
    else if (form.password.length < 6) errs.password = 'Password must be at least 6 characters';
    if (!form.vehicle_type) errs.vehicle_type = 'Select vehicle type';
    if (!form.vehicle_number.trim()) errs.vehicle_number = 'Vehicle number is required';
    if (!form.license_number.trim()) errs.license_number = 'License number is required';
    if (!licenseImageUri) errs.license_image = 'License image is required';
    if (!profileImageUri) errs.profile_image = 'Profile image is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePickImage = async (type) => {
    const uri = await pickImage(false);
    if (!uri) return;
    if (type === 'license') setLicenseImageUri(uri);
    if (type === 'profile') setProfileImageUri(uri);
    setErrors((prev) => ({ ...prev, [`${type}_image`]: null }));
  };

  /* ── Submit ─────────────────────────────────────────────── */
  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const [licenseUrl, profileUrl] = await Promise.all([
        uploadImageToCloudinary(licenseImageUri),
        uploadImageToCloudinary(profileImageUri),
      ]);

      if (!licenseUrl || !profileUrl) {
        throw new Error('Failed to upload license/profile images');
      }

      const payload = {
        full_name: form.name.trim(),
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        mobile_number: form.mobile_number.trim(),
        password: form.password,
        vehicle_type: form.vehicle_type.toLowerCase(),
        vehicle_number: form.vehicle_number.trim().toUpperCase(),
        license_number: form.license_number.trim().toUpperCase(),
        license_url: licenseUrl,
        image_url: profileUrl,
        current_location: form.current_location.trim(),
        is_available: true,
      };

      try {
        await api.post('/transporters/delivery-person', payload);
      } catch {
        await api.post('/transporters/delivery-persons', payload);
      }

      Alert.alert('Success', 'Delivery person added successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to add delivery person');
    } finally {
      setLoading(false);
    }
  };

  /* ── Render helpers ─────────────────────────────────────── */
  const renderInput = (label, field, opts = {}) => (
    <View style={styles.inputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, errors[field] && styles.inputError]}>
        {opts.icon && (
          <Ionicons name={opts.icon} size={20} color="#888" style={styles.inputIcon} />
        )}
        <TextInput
          style={styles.input}
          value={form[field]}
          onChangeText={(v) => updateField(field, v)}
          placeholder={opts.placeholder || `Enter ${label.toLowerCase()}`}
          placeholderTextColor="#aaa"
          keyboardType={opts.keyboardType || 'default'}
          autoCapitalize={opts.autoCapitalize || 'none'}
          secureTextEntry={field === 'password' && !showPassword}
          editable={!loading}
        />
        {field === 'password' && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="#888" />
          </TouchableOpacity>
        )}
      </View>
      {errors[field] && <Text style={styles.errorText}>{errors[field]}</Text>}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Delivery Person</Text>
        <View style={{ width: 32 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Personal Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="account-outline" size={20} color="#1B5E20" />
              <Text style={styles.sectionTitle}>Personal Information</Text>
            </View>

            {renderInput('Full Name', 'name', { icon: 'person-outline', autoCapitalize: 'words', placeholder: 'Enter full name' })}
            {renderInput('Email', 'email', { icon: 'mail-outline', keyboardType: 'email-address', placeholder: 'Enter email address' })}
            {renderInput('Phone', 'phone', { icon: 'call-outline', keyboardType: 'phone-pad', placeholder: 'Enter 10-digit phone number' })}
            {renderInput('Mobile Number', 'mobile_number', { icon: 'call-outline', keyboardType: 'phone-pad', placeholder: 'Enter 10-digit mobile number' })}
            {renderInput('Password', 'password', { icon: 'lock-closed-outline', placeholder: 'Minimum 6 characters' })}
          </View>

          {/* Vehicle Info */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <MaterialCommunityIcons name="truck-outline" size={20} color="#1B5E20" />
              <Text style={styles.sectionTitle}>Vehicle Information</Text>
            </View>

            {/* Vehicle Type Picker */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Vehicle Type</Text>
              <TouchableOpacity
                style={[styles.inputWrap, errors.vehicle_type && styles.inputError]}
                onPress={() => setShowVehiclePicker(true)}
              >
                <MaterialCommunityIcons name="truck" size={20} color="#888" style={styles.inputIcon} />
                <Text style={[styles.input, !form.vehicle_type && { color: '#aaa' }]}>
                  {form.vehicle_type || 'Select vehicle type'}
                </Text>
                <Ionicons name="chevron-down" size={20} color="#888" />
              </TouchableOpacity>
              {errors.vehicle_type && <Text style={styles.errorText}>{errors.vehicle_type}</Text>}
            </View>

            {renderInput('Vehicle Number', 'vehicle_number', {
              icon: 'document-text-outline',
              autoCapitalize: 'characters',
              placeholder: 'e.g., TN01AB1234',
            })}

            {renderInput('License Number', 'license_number', {
              icon: 'card-outline',
              autoCapitalize: 'characters',
              placeholder: 'Enter driving license number',
            })}

            {renderInput('Current Location', 'current_location', {
              icon: 'location-outline',
              autoCapitalize: 'words',
              placeholder: 'Enter current location (optional)',
            })}

            <View style={styles.inputGroup}>
              <Text style={styles.label}>License Image</Text>
              <TouchableOpacity style={[styles.uploadCard, errors.license_image && styles.inputError]} onPress={() => handlePickImage('license')}>
                {licenseImageUri ? (
                  <Image source={{ uri: licenseImageUri }} style={styles.uploadPreview} />
                ) : (
                  <MaterialCommunityIcons name="file-image-plus-outline" size={26} color="#666" />
                )}
                <Text style={styles.uploadText}>{licenseImageUri ? 'Change license image' : 'Upload license image'}</Text>
              </TouchableOpacity>
              {errors.license_image && <Text style={styles.errorText}>{errors.license_image}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Profile Image</Text>
              <TouchableOpacity style={[styles.uploadCard, errors.profile_image && styles.inputError]} onPress={() => handlePickImage('profile')}>
                {profileImageUri ? (
                  <Image source={{ uri: profileImageUri }} style={styles.uploadPreview} />
                ) : (
                  <MaterialCommunityIcons name="account-box-plus-outline" size={26} color="#666" />
                )}
                <Text style={styles.uploadText}>{profileImageUri ? 'Change profile image' : 'Upload profile image'}</Text>
              </TouchableOpacity>
              {errors.profile_image && <Text style={styles.errorText}>{errors.profile_image}</Text>}
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="person-add" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>Add Delivery Person</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Vehicle Type Picker Modal */}
      <Modal visible={showVehiclePicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowVehiclePicker(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Vehicle Type</Text>
            {VEHICLE_TYPES.map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.modalOption, form.vehicle_type === type && styles.modalOptionActive]}
                onPress={() => {
                  updateField('vehicle_type', type);
                  setShowVehiclePicker(false);
                }}
              >
                <MaterialCommunityIcons
                  name={type === 'Bike' ? 'motorbike' : type === 'Auto' ? 'rickshaw' : type === 'Van' ? 'van-utility' : 'truck'}
                  size={22}
                  color={form.vehicle_type === type ? '#1B5E20' : '#666'}
                />
                <Text style={[styles.modalOptionText, form.vehicle_type === type && { color: '#1B5E20', fontWeight: '700' }]}>
                  {type}
                </Text>
                {form.vehicle_type === type && <Ionicons name="checkmark-circle" size={20} color="#1B5E20" />}
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowVehiclePicker(false)}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  backBtn: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  section: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8F8F8',
    borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0', paddingHorizontal: 12, height: 48,
  },
  inputError: { borderColor: '#F44336' },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 15, color: '#333' },
  errorText: { color: '#F44336', fontSize: 12, marginTop: 4 },

  uploadCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#F8F8F8', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: 12, paddingVertical: 10,
  },
  uploadPreview: { width: 42, height: 42, borderRadius: 8, backgroundColor: '#EEE' },
  uploadText: { color: '#444', fontSize: 14, fontWeight: '600' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 16, marginTop: 8,
    elevation: 3, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6,
  },
  submitBtnDisabled: { opacity: 0.7 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 16, textAlign: 'center' },
  modalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14,
    paddingHorizontal: 16, borderRadius: 12, marginBottom: 4,
  },
  modalOptionActive: { backgroundColor: '#E8F5E9' },
  modalOptionText: { flex: 1, fontSize: 15, color: '#333' },
  modalCancel: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  modalCancelText: { fontSize: 15, color: '#888', fontWeight: '600' },
});

export default AddDeliveryPerson;
