import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
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
import { updateDeliveryOrderStatus } from '../../services/orderService';
import { Colors, Font, Radius, Spacing, shadowStyle } from '../../utils/theme';

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
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);
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
  const performStatusUpdate = async () => {
    setConfirmModalVisible(false);
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
  };

  const handleUpdate = async () => {
    if (!selectedStatus) {
      Alert.alert('Select Status', 'Please select the new status for this order.');
      return;
    }
    setConfirmModalVisible(true);
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
            Status changed to {selectedStatus?.replace(/_/g, ' ')}
          </Animated.Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={Colors.gradientHeroDark} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Update Order</Text>
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
              colors={Colors.gradientHeroDark}
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

      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmModalVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <View style={styles.confirmIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={28} color="#1B5E20" />
            </View>
            <Text style={styles.confirmTitle}>Confirm Status Update</Text>
            <Text style={styles.confirmText}>You are about to update this order to:</Text>
            <View style={styles.confirmStatusPill}>
              <Text style={styles.confirmStatusText}>{selectedStatus?.replace(/_/g, ' ')}</Text>
            </View>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmModalVisible(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmUpdateBtn} onPress={performStatusUpdate}>
                <Text style={styles.confirmUpdateText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: Radius.xxl,
    borderBottomRightRadius: Radius.xxl,
  },
  backBtn: { padding: 6 },
  headerTitle: { flex: 1, fontSize: Font.xl, fontWeight: Font.weightBold, color: Colors.textOnDark, marginLeft: 12 },

  // Current status
  currentCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 20,
    marginBottom: 14,
    alignItems: 'center',
    ...shadowStyle('sm'),
  },
  currentLabel: {
    fontSize: Font.xs,
    color: Colors.textMuted,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: Font.weightSemiBold,
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Radius.pill,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  currentStatusText: { fontSize: Font.lg, fontWeight: Font.weightExtraBold, textTransform: 'uppercase' },

  // Card
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: 16,
    marginBottom: 14,
    ...shadowStyle('sm'),
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: Font.base, fontWeight: Font.weightExtraBold, color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Status options
  statusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  statusOptionActive: {
    backgroundColor: Colors.primaryXSoft,
    marginHorizontal: -16,
    paddingHorizontal: 20,
    borderRadius: Radius.md,
    borderBottomColor: 'transparent',
  },
  statusIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusOptionText: { flex: 1, fontSize: Font.md, color: Colors.textSecondary },
  statusOptionTextActive: { fontWeight: Font.weightExtraBold, color: Colors.textPrimary },

  // Photo
  photoSubtext: { fontSize: Font.sm, color: Colors.textMuted, marginBottom: 14, lineHeight: 18 },
  photoBtnRow: { flexDirection: 'row', gap: 12 },
  photoBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 24,
    borderWidth: 2,
    borderColor: Colors.primarySoft,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated,
  },
  photoBtnText: { fontSize: Font.sm, fontWeight: Font.weightSemiBold, color: Colors.primaryMid },
  photoPreviewContainer: { position: 'relative', borderRadius: Radius.lg, overflow: 'hidden' },
  photoPreview: { width: '100%', height: 220, borderRadius: Radius.lg },
  photoUploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  photoUploadText: { color: Colors.textOnDark, fontSize: Font.base, fontWeight: Font.weightSemiBold },
  photoUploadedBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#4CAF50',
    borderRadius: Radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  photoUploadedText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightSemiBold },
  removePhotoBtn: { position: 'absolute', top: 8, right: 8 },

  // Remarks
  remarksInput: {
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    padding: 14,
    fontSize: Font.base,
    color: Colors.textPrimary,
    borderWidth: 1,
    borderColor: Colors.border,
    minHeight: 100,
    lineHeight: 20,
  },

  // Signature
  signaturePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceElevated,
    gap: 8,
  },
  signaturePlaceholderText: { fontSize: Font.sm, color: Colors.textLight },

  // Update button
  updateBtn: { borderRadius: Radius.lg, overflow: 'hidden', marginTop: 4, ...shadowStyle('md') },
  updateBtnGradient: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  updateBtnText: { color: Colors.textOnDark, fontSize: Font.lg, fontWeight: Font.weightBold },

  // Success
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
    padding: 40,
  },
  successCircle: { marginBottom: 24 },
  successTitle: { fontSize: 28, fontWeight: Font.weightBold, color: Colors.textPrimary, marginBottom: 8 },
  successSubtext: { fontSize: Font.lg, color: Colors.textMuted, textAlign: 'center' },

  // Confirm modal
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  confirmCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.xl,
    padding: 22,
    ...shadowStyle('md'),
  },
  confirmIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryXSoft,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  confirmTitle: { textAlign: 'center', fontSize: Font.lg, fontWeight: Font.weightExtraBold, color: Colors.textPrimary },
  confirmText: { textAlign: 'center', fontSize: Font.sm, color: Colors.textMuted, marginTop: 8 },
  confirmStatusPill: {
    marginTop: 12,
    alignSelf: 'center',
    backgroundColor: Colors.primaryXSoft,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  confirmStatusText: { color: Colors.primaryMid, fontSize: Font.sm, fontWeight: Font.weightBold, textTransform: 'uppercase' },
  confirmActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  confirmCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  confirmCancelText: { color: Colors.textSecondary, fontSize: Font.sm, fontWeight: Font.weightSemiBold },
  confirmUpdateBtn: {
    flex: 1,
    backgroundColor: Colors.primaryMid,
    borderRadius: Radius.md,
    alignItems: 'center',
    paddingVertical: 10,
  },
  confirmUpdateText: { color: Colors.textOnDark, fontSize: Font.sm, fontWeight: Font.weightBold },
});

export default OrderUpdatePage;
