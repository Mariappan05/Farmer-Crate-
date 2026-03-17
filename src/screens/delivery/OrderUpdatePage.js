import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Image,
  StatusBar,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { updateDeliveryOrderStatus } from '../../services/orderService';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';

const ALL_STATUSES = [
  { key: 'PICKUP_IN_PROGRESS', label: 'Pickup In Progress', icon: 'bicycle-outline', color: '#00BCD4' },
  { key: 'SHIPPED', label: 'Picked Up / Shipped', icon: 'cube-outline', color: '#FF5722' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', icon: 'car-outline', color: '#FF9800' },
  { key: 'DELIVERED', label: 'Delivered', icon: 'checkmark-circle-outline', color: '#4CAF50' },
  { key: 'FAILED', label: 'Failed Attempt', icon: 'alert-circle-outline', color: '#F44336' },
  { key: 'CANCELLED', label: 'Cancelled', icon: 'close-circle-outline', color: '#9E9E9E' },
];

const OrderUpdatePage = ({ navigation, route }) => {
  const { order, orderId: paramOrderId, action: suggestedAction } = route.params || {};
  const insets = useSafeAreaInsets();
  const [currentStatus, setCurrentStatus] = useState(order?.current_status || order?.status || '');
  const [selectedStatus, setSelectedStatus] = useState(suggestedAction || null);
  const [remarks, setRemarks] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [orderData, setOrderData] = useState(order);
  const [photoUri, setPhotoUri] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const orderId = paramOrderId || order?.order_id || order?.id;

  // Success animation
  const successAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.5)).current;

  // ─── Fetch current status ─────────────────────────────────────────────
  const fetchStatus = useCallback(async () => {
    if (!orderId) return;
    try {
      const res = await api.get(`/orders/${orderId}`);
      const data = res.data?.data || res.data;
      setOrderData(data);
      setCurrentStatus(data?.current_status || data?.status || '');
    } catch (e) {
      console.log('Fetch status error:', e.message);
    }
  }, [orderId]);

  useEffect(() => {
    fetchStatus();
  }, []);

  // ─── Photo capture ────────────────────────────────────────────────────
  const handleTakePhoto = async () => {
    const uri = await pickImage(true); // from camera
    if (uri) {
      setPhotoUri(uri);
      setUploadingPhoto(true);
      try {
        const url = await uploadImageToCloudinary(uri);
        if (url) {
          setPhotoUrl(url);
        } else {
          Alert.alert('Upload Failed', 'Could not upload photo. You can still update the status.');
        }
      } catch (e) {
        Alert.alert('Upload Error', e.message || 'Photo upload failed');
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const handlePickPhoto = async () => {
    const uri = await pickImage(false); // from gallery
    if (uri) {
      setPhotoUri(uri);
      setUploadingPhoto(true);
      try {
        const url = await uploadImageToCloudinary(uri);
        if (url) {
          setPhotoUrl(url);
        } else {
          Alert.alert('Upload Failed', 'Could not upload photo.');
        }
      } catch (e) {
        Alert.alert('Upload Error', e.message || 'Photo upload failed');
      } finally {
        setUploadingPhoto(false);
      }
    }
  };

  const removePhoto = () => {
    setPhotoUri(null);
    setPhotoUrl(null);
  };

  // ─── Submit update ────────────────────────────────────────────────────
  const handleUpdate = async () => {
    if (!selectedStatus) {
      Alert.alert('Select Status', 'Please select the new status for this order.');
      return;
    }

    Alert.alert(
      'Confirm Update',
      `Update order #${orderId} to "${selectedStatus.replace(/_/g, ' ')}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setIsUpdating(true);
            try {
              const payload = {
                status: selectedStatus,
                remarks: remarks.trim() || undefined,
                proof_image_url: photoUrl || undefined,
              };

              await updateDeliveryOrderStatus(orderId, selectedStatus);

              // If there's a photo or remarks, try to send them separately
              if (photoUrl || remarks.trim()) {
                try {
                  await api.put(`/delivery-persons/orders/${orderId}/update`, payload);
                } catch {
                  // Not critical if this fails
                }
              }

              // Show success animation
              playSuccessAnimation();
            } catch (e) {
              // Fallback
              try {
                await api.put(`/orders/${orderId}/status`, { status: selectedStatus });
                playSuccessAnimation();
              } catch {
                Alert.alert('Error', e.message || 'Failed to update order status');
                setIsUpdating(false);
              }
            }
          },
        },
      ]
    );
  };

  // ─── Success animation ────────────────────────────────────────────────
  const playSuccessAnimation = () => {
    setShowSuccess(true);
    setIsUpdating(false);
    Animated.parallel([
      Animated.timing(successAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        navigation.goBack();
      }, 1500);
    });
  };

  const currentStatusObj = ALL_STATUSES.find((s) => s.key === currentStatus);

  // ─── Success overlay ──────────────────────────────────────────────────
  if (showSuccess) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="dark-content" />
        <View style={styles.successContainer}>
          <Animated.View
            style={[
              styles.successCircle,
              {
                opacity: successAnim,
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Ionicons name="checkmark-circle" size={100} color="#4CAF50" />
          </Animated.View>
          <Animated.Text style={[styles.successTitle, { opacity: successAnim }]}>
            Order Updated!
          </Animated.Text>
          <Animated.Text style={[styles.successSubtext, { opacity: successAnim }]}>
            Order #{orderId} → {selectedStatus?.replace(/_/g, ' ')}
          </Animated.Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Update Order #{orderId}</Text>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Current Status */}
          <View style={styles.currentCard}>
            <Text style={styles.currentLabel}>Current Status</Text>
            <View
              style={[
                styles.currentBadge,
                { backgroundColor: (currentStatusObj?.color || '#888') + '20' },
              ]}
            >
              <Ionicons
                name={currentStatusObj?.icon || 'ellipse-outline'}
                size={22}
                color={currentStatusObj?.color || '#888'}
              />
              <Text
                style={[
                  styles.currentStatusText,
                  { color: currentStatusObj?.color || '#888' },
                ]}
              >
                {currentStatus.replace(/_/g, ' ') || 'Unknown'}
              </Text>
            </View>
          </View>

          {/* Select New Status */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="swap-vertical-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Select New Status</Text>
            </View>
            {ALL_STATUSES.map((status) => (
              <TouchableOpacity
                key={status.key}
                onPress={() => setSelectedStatus(status.key)}
                style={[
                  styles.statusOption,
                  selectedStatus === status.key && styles.statusOptionActive,
                ]}
                activeOpacity={0.7}
              >
                <View style={[styles.statusIconBox, { backgroundColor: status.color + '20' }]}>
                  <Ionicons name={status.icon} size={22} color={status.color} />
                </View>
                <Text
                  style={[
                    styles.statusOptionText,
                    selectedStatus === status.key && styles.statusOptionTextActive,
                  ]}
                >
                  {status.label}
                </Text>
                {selectedStatus === status.key && (
                  <Ionicons name="checkmark-circle" size={22} color="#388E3C" />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Photo Proof */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="camera-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Photo Proof (Optional)</Text>
            </View>
            <Text style={styles.photoSubtext}>
              Take a photo as proof of pickup or delivery
            </Text>

            {photoUri ? (
              <View style={styles.photoPreviewContainer}>
                <Image source={{ uri: photoUri }} style={styles.photoPreview} />
                {uploadingPhoto && (
                  <View style={styles.photoUploadOverlay}>
                    <ActivityIndicator size="large" color="#fff" />
                    <Text style={styles.photoUploadText}>Uploading...</Text>
                  </View>
                )}
                {photoUrl && (
                  <View style={styles.photoUploadedBadge}>
                    <Ionicons name="checkmark-circle" size={16} color="#fff" />
                    <Text style={styles.photoUploadedText}>Uploaded</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removePhotoBtn} onPress={removePhoto}>
                  <Ionicons name="close-circle" size={28} color="#F44336" />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.photoBtnRow}>
                <TouchableOpacity style={styles.photoBtn} onPress={handleTakePhoto}>
                  <Ionicons name="camera" size={28} color="#388E3C" />
                  <Text style={styles.photoBtnText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.photoBtn} onPress={handlePickPhoto}>
                  <Ionicons name="images-outline" size={28} color="#2196F3" />
                  <Text style={[styles.photoBtnText, { color: '#2196F3' }]}>Gallery</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Notes / Comments */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Ionicons name="document-text-outline" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Notes / Comments</Text>
            </View>
            <TextInput
              style={styles.remarksInput}
              placeholder="e.g. Customer not available, left at door, package condition notes..."
              placeholderTextColor="#bbb"
              value={remarks}
              onChangeText={setRemarks}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          {/* Signature Placeholder */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="draw" size={20} color="#1B5E20" />
              <Text style={styles.cardTitle}>Digital Signature</Text>
            </View>
            <View style={styles.signaturePlaceholder}>
              <MaterialCommunityIcons name="gesture" size={40} color="#ccc" />
              <Text style={styles.signaturePlaceholderText}>
                Signature capture coming soon
              </Text>
            </View>
          </View>

          {/* Update Button */}
          <TouchableOpacity
            style={[
              styles.updateBtn,
              (!selectedStatus || isUpdating || uploadingPhoto) && { opacity: 0.5 },
            ]}
            onPress={handleUpdate}
            disabled={!selectedStatus || isUpdating || uploadingPhoto}
            activeOpacity={0.7}
          >
            <LinearGradient
              colors={['#103A12', '#1B5E20', '#2E7D32']}
              style={styles.updateBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {isUpdating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Ionicons name="checkmark-done-outline" size={22} color="#fff" />
                  <Text style={styles.updateBtnText}>Confirm Update</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F1F8E9' },

  // Header
  header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center' },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff', marginLeft: 12 },

  // Current status
  currentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  currentLabel: {
    fontSize: 12,
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  currentStatusText: { fontSize: 16, fontWeight: '800', textTransform: 'uppercase' },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: '#1B5E20', textTransform: 'uppercase', letterSpacing: 0.5 },

  // Status options
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  statusOptionActive: {
    backgroundColor: '#F1F8E9',
    marginHorizontal: -16,
    paddingHorizontal: 20,
    borderRadius: 12,
    borderBottomColor: 'transparent',
  },
  statusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusOptionText: { flex: 1, fontSize: 15, color: '#555' },
  statusOptionTextActive: { fontWeight: '800', color: '#333' },

  // Photo
  photoSubtext: { fontSize: 13, color: '#888', marginBottom: 14, lineHeight: 18 },
  photoBtnRow: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    borderWidth: 2,
    borderColor: '#E8F5E9',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#FAFFF8',
  },
  photoBtnText: { fontSize: 13, fontWeight: '600', color: '#388E3C' },
  photoPreviewContainer: { position: 'relative', borderRadius: 14, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 220, borderRadius: 14 },
  photoUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoUploadText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  photoUploadedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoUploadedText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  removePhotoBtn: { position: 'absolute', top: 8, right: 8 },

  // Remarks
  remarksInput: {
    backgroundColor: '#f8f9f8',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#e8e8e8',
    minHeight: 100,
    lineHeight: 20,
  },

  // Signature
  signaturePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    borderWidth: 2,
    borderColor: '#e8e8e8',
    borderStyle: 'dashed',
    borderRadius: 14,
    backgroundColor: '#fafafa',
    gap: 8,
  },
  signaturePlaceholderText: { fontSize: 13, color: '#bbb' },

  // Update button
  updateBtn: { borderRadius: 16, overflow: 'hidden', marginTop: 4 },
  updateBtnGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  updateBtnText: { color: '#fff', fontSize: 17, fontWeight: 'bold' },

  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F8E9',
    padding: 40,
  },
  successCircle: { marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  successSubtext: { fontSize: 16, color: '#888', textAlign: 'center' },
});

export default OrderUpdatePage;
