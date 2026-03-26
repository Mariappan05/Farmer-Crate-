/**
 * VehiclePage.js
 * Vehicle management with permanent and temporary vehicles.
 *
 * Features:
 *   - GET /api/vehicles
 *   - Permanent and temporary vehicles sections
 *   - Add vehicle form with type, number, RC, capacity, ownership
 *   - Document uploads: RC copy, insurance, permit → Cloudinary
 *   - POST /api/vehicles/permanent or /api/vehicles/temporary
 *   - Vehicle cards with details and availability toggle
 *   - Delete vehicle
 *   - Pull to refresh
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
  TextInput,
  Modal,
  Image,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';

const VEHICLE_TYPES = ['Bike', 'Auto', 'Van', 'Mini Truck', 'Truck'];
const OWNERSHIP_TYPES = ['Owned', 'Rented', 'Leased'];

const getVehicleIcon = (type) => {
  const t = (type || '').toLowerCase();
  if (t.includes('bike')) return 'motorbike';
  if (t.includes('auto') || t.includes('rickshaw')) return 'rickshaw';
  if (t.includes('van')) return 'van-utility';
  return 'truck';
};

const normalizeVehiclePayload = (payload) => {
  const data = payload?.data || payload || {};

  const permanentRaw = Array.isArray(data?.permanent_vehicles)
    ? data.permanent_vehicles
    : Array.isArray(data?.permanentVehicles)
      ? data.permanentVehicles
      : [];

  const temporaryRaw = Array.isArray(data?.temporary_vehicles)
    ? data.temporary_vehicles
    : Array.isArray(data?.temporaryVehicles)
      ? data.temporaryVehicles
      : [];

  const allRaw = Array.isArray(data?.vehicles)
    ? data.vehicles
    : Array.isArray(data)
      ? data
      : [];

  if (permanentRaw.length || temporaryRaw.length) {
    const permanent = permanentRaw.map((v) => ({ ...v, _vehicleKind: 'permanent' }));
    const temporary = temporaryRaw.map((v) => ({ ...v, _vehicleKind: 'temporary' }));
    return [...permanent, ...temporary];
  }

  return allRaw.map((v) => {
    const kind = (v?._vehicleKind || v?.vehicle_kind || '').toLowerCase();
    return {
      ...v,
      _vehicleKind: kind.includes('temp') ? 'temporary' : 'permanent',
    };
  });
};

const VehiclePage = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addType, setAddType] = useState('permanent'); // permanent or temporary
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Add form
  const [form, setForm] = useState({
    vehicle_number: '',
    rc_book_number: '',
    vehicle_type: '',
    capacity: '',
    ownership_type: 'Owned',
  });
  const [documents, setDocuments] = useState({
    rc_copy: null,
    insurance: null,
    permit: null,
  });
  const [uploadingDoc, setUploadingDoc] = useState(null);
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showOwnershipPicker, setShowOwnershipPicker] = useState(false);

  /* ── Fetch vehicles ─────────────────────────────────────── */
  const fetchVehicles = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api
        .get('/vehicles')
        .catch((err) => {
          console.error('[VehiclePage] /vehicles failed:', err.message);
          return api.get('/transporters/vehicles').catch(() => ({ data: [] }));
        });
      console.log('[VehiclePage] Raw vehicle response:', JSON.stringify(res?.data).substring(0, 500));
      const normalized = normalizeVehiclePayload(res?.data);
      console.log('[VehiclePage] Normalized vehicles count:', normalized.length);
      setVehicles(Array.isArray(normalized) ? normalized : []);
    } catch (e) {
      console.error('[VehiclePage] Vehicles fetch error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => fetchVehicles(true));
    return unsub;
  }, [navigation, fetchVehicles]);

  /* ── Categorize vehicles ────────────────────────────────── */
  const permanentVehicles = vehicles.filter((v) => v._vehicleKind === 'permanent');
  const temporaryVehicles = vehicles.filter((v) => v._vehicleKind === 'temporary');

  /* ── Document upload ────────────────────────────────────── */
  const handleDocUpload = async (docType) => {
    try {
      const uri = await pickImage(false);
      if (!uri) return;
      setUploadingDoc(docType);
      const url = await uploadImageToCloudinary(uri);
      if (url) {
        setDocuments((prev) => ({ ...prev, [docType]: url }));
      } else {
        Alert.alert('Error', 'Failed to upload document');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Upload failed');
    } finally {
      setUploadingDoc(null);
    }
  };

  /* ── Add vehicle ────────────────────────────────────────── */
  const handleAddVehicle = async () => {
    const errors = [];

    // --- Vehicle Number ---
    const vNum = form.vehicle_number.trim();
    if (!vNum) {
      errors.push('Vehicle number is required');
    } else if (vNum.length < 4) {
      errors.push('Vehicle number must be at least 4 characters');
    } else if (vNum.length > 15) {
      errors.push('Vehicle number cannot exceed 15 characters');
    } else {
      const vNumRegex = /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/i;
      if (!vNumRegex.test(vNum.replace(/[\s-]/g, ''))) {
        errors.push('Invalid vehicle number format (e.g., TN01AB1234)');
      }
    }

    // --- Vehicle Type ---
    if (!form.vehicle_type) {
      errors.push('Vehicle type is required');
    }

    // --- RC Book Number ---
    const rcNum = form.rc_book_number.trim();
    if (addType === 'permanent' && !rcNum) {
      errors.push('RC Book Number is required for permanent vehicles');
    } else if (rcNum && rcNum.length > 20) {
      errors.push('RC Book Number cannot exceed 20 characters');
    } else if (rcNum && rcNum.length < 3) {
      errors.push('RC Book Number must be at least 3 characters');
    }

    // Temporary vehicles also need RC if provided
    if (addType === 'temporary' && !rcNum) {
      errors.push('RC Book Number is required for temporary vehicles');
    }

    // --- Capacity ---
    const capStr = form.capacity.trim();
    if (!capStr) {
      errors.push('Capacity is required');
    } else if (capStr.length > 10) {
      errors.push('Capacity cannot exceed 10 characters');
    } else {
      const capNum = parseInt(capStr.replace(/[^0-9]/g, ''), 10);
      if (isNaN(capNum) || capNum <= 0) {
        errors.push('Capacity must be a valid positive number (e.g., 500)');
      } else if (capNum > 99999) {
        errors.push('Capacity cannot exceed 99,999 kg');
      }
    }

    // --- Ownership Type ---
    if (!form.ownership_type) {
      errors.push('Ownership type is required');
    }

    // --- Documents ---
    if (addType === 'permanent' && !documents.rc_copy) {
      errors.push('RC Copy document is required for permanent vehicles');
    }
    if (addType === 'temporary' && !documents.insurance) {
      errors.push('Insurance document is required for temporary vehicles');
    }

    // Show all errors at once
    if (errors.length > 0) {
      Alert.alert(
        'Validation Errors',
        errors.map((e, i) => `${i + 1}. ${e}`).join('\n'),
        [{ text: 'OK' }]
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        vehicle_number: vNum.toUpperCase(),
        rc_book_number: rcNum,
        vehicle_type: form.vehicle_type,
        capacity: capStr,
        ownership_type: form.ownership_type,
        rc_copy_url: documents.rc_copy,
        insurance_url: documents.insurance,
        permit_url: documents.permit,
      };

      console.log('[VehiclePage] Adding vehicle:', addType, JSON.stringify(payload));
      const endpoint = addType === 'permanent' ? '/vehicles/permanent' : '/vehicles/temporary';
      
      let lastError = null;
      let success = false;

      // Try primary endpoint
      try {
        const res = await api.post(endpoint, payload);
        console.log('[VehiclePage] Vehicle added via', endpoint, res.data);
        success = true;
      } catch (primaryErr) {
        console.error('[VehiclePage] Primary endpoint failed:', endpoint, primaryErr.message, primaryErr?.response?.data);
        lastError = primaryErr;
      }

      // Fallback only if primary failed
      if (!success) {
        try {
          const res = await api.post('/vehicles', { ...payload, vehicle_category: addType });
          console.log('[VehiclePage] Vehicle added via /vehicles fallback', res.data);
          success = true;
        } catch (fallbackErr) {
          console.error('[VehiclePage] Fallback also failed:', fallbackErr.message, fallbackErr?.response?.data);
          // Use the primary error for display (more relevant)
        }
      }

      if (success) {
        Alert.alert('Success', 'Vehicle added successfully!');
        setShowAddModal(false);
        resetForm();
        fetchVehicles(true);
      } else {
        const errMsg = lastError?.response?.data?.message || lastError?.response?.data?.error || lastError?.message || 'Failed to add vehicle';
        const errDetail = lastError?.response?.data?.errors ? 
          '\n' + lastError.response.data.errors.map(e => e.msg || e.message).join('\n') : '';
        Alert.alert('Error', errMsg + errDetail);
      }
    } catch (e) {
      console.error('[VehiclePage] Unexpected error:', e);
      Alert.alert('Error', e.message || 'Failed to add vehicle');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({ vehicle_number: '', rc_book_number: '', vehicle_type: '', capacity: '', ownership_type: 'Owned' });
    setDocuments({ rc_copy: null, insurance: null, permit: null });
  };

  /* ── Toggle availability ────────────────────────────────── */
  const handleToggleAvailability = async (vehicle) => {
    const vId = vehicle.vehicle_id || vehicle.id;
    setTogglingId(vId);
    try {
      const current = vehicle.is_available !== false;
      const kind = vehicle._vehicleKind || 'permanent';
      await api.patch(`/vehicles/${vId}/availability`, { vehicle_type: kind, is_available: !current });
      fetchVehicles(true);
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to update availability');
    } finally {
      setTogglingId(null);
    }
  };

  /* ── Delete vehicle ─────────────────────────────────────── */
  const handleDelete = (vehicle) => {
    const vId = vehicle.id || vehicle.vehicle_id;
    Alert.alert('Delete Vehicle', `Remove ${vehicle.vehicle_number || 'this vehicle'}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeletingId(vId);
          try {
            const kind = vehicle._vehicleKind || 'permanent';
            await api.delete(`/vehicles/${vId}`, { data: { vehicle_type: kind } });
            Alert.alert('Deleted', 'Vehicle removed');
            fetchVehicles(true);
          } catch (e) {
            Alert.alert('Error', e.message || 'Failed to delete');
          } finally {
            setDeletingId(null);
          }
        },
      },
    ]);
  };

  /* ── Render vehicle card ────────────────────────────────── */
  const renderVehicleCard = (vehicle) => {
    const vId = vehicle.id || vehicle.vehicle_id;
    const available = vehicle.is_available !== false;
    const isToggling = togglingId === vId;
    const isDeleting = deletingId === vId;

    return (
      <View key={vId} style={styles.vehicleCard}>
        <View style={styles.vehicleHeader}>
          <View style={styles.vehicleIconWrap}>
            <MaterialCommunityIcons name={getVehicleIcon(vehicle.vehicle_type)} size={24} color="#1B5E20" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.vehicleNumber}>{vehicle.vehicle_number || 'N/A'}</Text>
            <Text style={styles.vehicleType}>{vehicle.vehicle_type || 'Unknown'}</Text>
          </View>
          <View style={styles.availToggle}>
            {isToggling ? (
              <ActivityIndicator size="small" color="#1B5E20" />
            ) : (
              <Switch
                value={available}
                onValueChange={() => handleToggleAvailability(vehicle)}
                trackColor={{ false: '#E0E0E0', true: '#A5D6A7' }}
                thumbColor={available ? '#1B5E20' : '#999'}
              />
            )}
          </View>
        </View>

        <View style={styles.vehicleDetails}>
          {vehicle.capacity && (
            <View style={styles.vDetailRow}>
              <Ionicons name="speedometer-outline" size={14} color="#666" />
              <Text style={styles.vDetailText}>Capacity: {vehicle.capacity}</Text>
            </View>
          )}
          {vehicle.rc_book_number && (
            <View style={styles.vDetailRow}>
              <Ionicons name="document-text-outline" size={14} color="#666" />
              <Text style={styles.vDetailText}>RC: {vehicle.rc_book_number}</Text>
            </View>
          )}
          {vehicle.ownership_type && (
            <View style={styles.vDetailRow}>
              <Ionicons name="key-outline" size={14} color="#666" />
              <Text style={styles.vDetailText}>{vehicle.ownership_type}</Text>
            </View>
          )}
        </View>

        {/* Documents */}
        {(vehicle.rc_copy_url || vehicle.insurance_url || vehicle.permit_url) && (
          <View style={styles.docsRow}>
            {vehicle.rc_copy_url && (
              <View style={styles.docBadge}>
                <Ionicons name="document-attach-outline" size={12} color="#1B5E20" />
                <Text style={styles.docBadgeText}>RC</Text>
              </View>
            )}
            {vehicle.insurance_url && (
              <View style={styles.docBadge}>
                <Ionicons name="shield-checkmark-outline" size={12} color="#1B5E20" />
                <Text style={styles.docBadgeText}>Insurance</Text>
              </View>
            )}
            {vehicle.permit_url && (
              <View style={styles.docBadge}>
                <Ionicons name="card-outline" size={12} color="#1B5E20" />
                <Text style={styles.docBadgeText}>Permit</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.vehicleActions}>
          <Text style={[styles.availText, { color: available ? '#4CAF50' : '#F44336' }]}>
            {available ? '● Available' : '● Unavailable'}
          </Text>
          <TouchableOpacity
            style={styles.deleteBtn}
            onPress={() => handleDelete(vehicle)}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <ActivityIndicator size="small" color="#F44336" />
            ) : (
              <Ionicons name="trash-outline" size={18} color="#F44336" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  /* ── Main render ────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Vehicles</Text>
            <Text style={styles.headerSub}>{vehicles.length} total vehicles</Text>
          </View>
          <TouchableOpacity style={styles.addHeaderBtn} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add" size={24} color="#1B5E20" />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1B5E20" />
          <Text style={styles.loadingText}>Loading vehicles...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.body}
          contentContainerStyle={{ paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchVehicles(true); }} colors={['#1B5E20']} />}
          showsVerticalScrollIndicator={false}
        >
          {vehicles.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="truck-outline" size={50} color="#ccc" />
              <Text style={styles.emptyTitle}>No Vehicles</Text>
              <Text style={styles.emptyText}>Add your first vehicle to get started</Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowAddModal(true)}>
                <Text style={styles.emptyBtnText}>+ Add Vehicle</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Permanent Vehicles */}
              {permanentVehicles.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>
                    <MaterialCommunityIcons name="truck-check" size={16} color="#1B5E20" /> Permanent Vehicles ({permanentVehicles.length})
                  </Text>
                  {permanentVehicles.map(renderVehicleCard)}
                </>
              )}

              {/* Temporary Vehicles */}
              {temporaryVehicles.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>
                    <MaterialCommunityIcons name="truck-fast" size={16} color="#FF9800" /> Temporary Vehicles ({temporaryVehicles.length})
                  </Text>
                  {temporaryVehicles.map(renderVehicleCard)}
                </>
              )}

              {/* Show all if no categorization applies */}
              {permanentVehicles.length === 0 && temporaryVehicles.length === 0 && (
                <>
                  <Text style={styles.sectionTitle}>All Vehicles ({vehicles.length})</Text>
                  {vehicles.map(renderVehicleCard)}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Floating Add Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAddModal(true)} activeOpacity={0.8}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Vehicle Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalContent}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Add Vehicle</Text>
                <TouchableOpacity onPress={() => { setShowAddModal(false); resetForm(); }}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Vehicle type tabs */}
              <View style={styles.typeTabs}>
                <TouchableOpacity
                  style={[styles.typeTab, addType === 'permanent' && styles.typeTabActive]}
                  onPress={() => setAddType('permanent')}
                >
                  <Text style={[styles.typeTabText, addType === 'permanent' && styles.typeTabTextActive]}>Permanent</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeTab, addType === 'temporary' && styles.typeTabActive]}
                  onPress={() => setAddType('temporary')}
                >
                  <Text style={[styles.typeTabText, addType === 'temporary' && styles.typeTabTextActive]}>Temporary</Text>
                </TouchableOpacity>
              </View>

              {/* Vehicle Number */}
              <Text style={styles.formLabel}>Vehicle Number * <Text style={styles.charLimit}>(max 15)</Text></Text>
              <TextInput
                style={styles.formInput}
                value={form.vehicle_number}
                onChangeText={(v) => setForm((p) => ({ ...p, vehicle_number: v.replace(/[^A-Za-z0-9\s-]/g, '') }))}
                placeholder="e.g., TN01AB1234"
                placeholderTextColor="#aaa"
                autoCapitalize="characters"
                maxLength={15}
              />

              {/* RC Book Number */}
              <Text style={styles.formLabel}>RC Book Number {addType === 'permanent' ? '*' : '*'} <Text style={styles.charLimit}>(max 20)</Text></Text>
              <TextInput
                style={styles.formInput}
                value={form.rc_book_number}
                onChangeText={(v) => setForm((p) => ({ ...p, rc_book_number: v.replace(/[^A-Za-z0-9\s-/]/g, '') }))}
                placeholder="Enter RC book number"
                placeholderTextColor="#aaa"
                autoCapitalize="characters"
                maxLength={20}
              />

              {/* Vehicle Type */}
              <Text style={styles.formLabel}>Vehicle Type *</Text>
              <TouchableOpacity style={styles.formInput} onPress={() => setShowTypePicker(true)}>
                <Text style={form.vehicle_type ? styles.formInputText : styles.formPlaceholder}>
                  {form.vehicle_type || 'Select vehicle type'}
                </Text>
              </TouchableOpacity>

              {/* Capacity */}
              <Text style={styles.formLabel}>Capacity * <Text style={styles.charLimit}>(max 10, in kg)</Text></Text>
              <TextInput
                style={styles.formInput}
                value={form.capacity}
                onChangeText={(v) => setForm((p) => ({ ...p, capacity: v.replace(/[^0-9\s]/g, '') }))}
                placeholder="e.g., 500"
                placeholderTextColor="#aaa"
                keyboardType="numeric"
                maxLength={10}
              />

              {/* Ownership Type */}
              <Text style={styles.formLabel}>Ownership Type</Text>
              <TouchableOpacity style={styles.formInput} onPress={() => setShowOwnershipPicker(true)}>
                <Text style={styles.formInputText}>{form.ownership_type}</Text>
              </TouchableOpacity>

              {/* Documents */}
              <Text style={styles.formLabel}>Documents</Text>
              <View style={styles.docUploads}>
                {[
                  { key: 'rc_copy', label: 'RC Copy', icon: 'document-text-outline' },
                  { key: 'insurance', label: 'Insurance', icon: 'shield-checkmark-outline' },
                  { key: 'permit', label: 'Permit', icon: 'card-outline' },
                ].map((doc) => (
                  <TouchableOpacity
                    key={doc.key}
                    style={[styles.docUploadBtn, documents[doc.key] && styles.docUploadDone]}
                    onPress={() => handleDocUpload(doc.key)}
                    disabled={uploadingDoc === doc.key}
                  >
                    {uploadingDoc === doc.key ? (
                      <ActivityIndicator size="small" color="#1B5E20" />
                    ) : documents[doc.key] ? (
                      <Ionicons name="checkmark-circle" size={20} color="#4CAF50" />
                    ) : (
                      <Ionicons name={doc.icon} size={20} color="#888" />
                    )}
                    <Text style={styles.docUploadText}>{doc.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitBtn, saving && { opacity: 0.7 }]}
                onPress={handleAddVehicle}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.submitBtnText}>Add Vehicle</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Vehicle Type Picker Modal */}
      <Modal visible={showTypePicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowTypePicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Select Vehicle Type</Text>
            {VEHICLE_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pickerOption, form.vehicle_type === t && styles.pickerOptionActive]}
                onPress={() => { setForm((p) => ({ ...p, vehicle_type: t })); setShowTypePicker(false); }}
              >
                <MaterialCommunityIcons name={getVehicleIcon(t)} size={20} color={form.vehicle_type === t ? '#1B5E20' : '#666'} />
                <Text style={[styles.pickerOptionText, form.vehicle_type === t && { color: '#1B5E20', fontWeight: '700' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Ownership Type Picker Modal */}
      <Modal visible={showOwnershipPicker} transparent animationType="fade">
        <TouchableOpacity style={styles.pickerOverlay} activeOpacity={1} onPress={() => setShowOwnershipPicker(false)}>
          <View style={styles.pickerContent}>
            <Text style={styles.pickerTitle}>Ownership Type</Text>
            {OWNERSHIP_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.pickerOption, form.ownership_type === t && styles.pickerOptionActive]}
                onPress={() => { setForm((p) => ({ ...p, ownership_type: t })); setShowOwnershipPicker(false); }}
              >
                <Text style={[styles.pickerOptionText, form.ownership_type === t && { color: '#1B5E20', fontWeight: '700' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

/* ── Styles ───────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666', fontSize: 14 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  headerSub: { color: '#C8E6C9', fontSize: 13, marginTop: 2 },
  addHeaderBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center' },

  body: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1B5E20', marginTop: 12, marginBottom: 10 },

  vehicleCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  vehicleHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  vehicleIconWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9', justifyContent: 'center', alignItems: 'center' },
  vehicleNumber: { fontSize: 16, fontWeight: '700', color: '#1B5E20' },
  vehicleType: { fontSize: 12, color: '#888', marginTop: 2 },
  availToggle: { marginLeft: 8 },

  vehicleDetails: { marginBottom: 8 },
  vDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  vDetailText: { fontSize: 13, color: '#666' },

  docsRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  docBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#E8F5E9', borderRadius: 8 },
  docBadgeText: { fontSize: 11, color: '#1B5E20', fontWeight: '600' },

  vehicleActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingTop: 10 },
  availText: { fontSize: 12, fontWeight: '600' },
  deleteBtn: { padding: 6 },

  emptyCard: { alignItems: 'center', padding: 40, marginTop: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginTop: 12 },
  emptyText: { fontSize: 14, color: '#888', marginTop: 4 },
  emptyBtn: { marginTop: 16, backgroundColor: '#1B5E20', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  fab: {
    position: 'absolute', bottom: 90, right: 20, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#1B5E20', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6,
  },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '90%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },

  typeTabs: { flexDirection: 'row', marginBottom: 16, backgroundColor: '#F0F0F0', borderRadius: 12, padding: 4 },
  typeTab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
  typeTabActive: { backgroundColor: '#1B5E20' },
  typeTabText: { fontSize: 14, fontWeight: '600', color: '#666' },
  typeTabTextActive: { color: '#fff' },

  formLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6, marginTop: 12 },
  charLimit: { fontSize: 11, fontWeight: '400', color: '#999' },
  formInput: {
    backgroundColor: '#F8F8F8', borderRadius: 12, borderWidth: 1, borderColor: '#E0E0E0',
    paddingHorizontal: 14, height: 48, justifyContent: 'center',
  },
  formInputText: { fontSize: 15, color: '#333' },
  formPlaceholder: { fontSize: 15, color: '#aaa' },

  docUploads: { flexDirection: 'row', gap: 10, marginTop: 4 },
  docUploadBtn: {
    flex: 1, alignItems: 'center', gap: 4, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E0E0', borderStyle: 'dashed',
  },
  docUploadDone: { borderColor: '#4CAF50', borderStyle: 'solid', backgroundColor: '#E8F5E9' },
  docUploadText: { fontSize: 11, color: '#666', textAlign: 'center' },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 16, marginTop: 20, marginBottom: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Picker modals
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 30 },
  pickerContent: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  pickerTitle: { fontSize: 18, fontWeight: '700', color: '#1B5E20', marginBottom: 14, textAlign: 'center' },
  pickerOption: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, marginBottom: 2 },
  pickerOptionActive: { backgroundColor: '#E8F5E9' },
  pickerOptionText: { fontSize: 15, color: '#333' },
});

export default VehiclePage;
