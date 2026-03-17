import React, { useState, useRef } from 'react';
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
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pickImage, uploadImageToCloudinary } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Grains', 'Dairy', 'Spices',
  'Herbs', 'Organic', 'Nuts', 'Pulses', 'Oil', 'Honey', 'Other',
];

const UNITS = ['kg', 'piece', 'dozen', 'litre', 'bundle'];

const AddProduct = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();
  const scrollRef = useRef(null);
  const toastRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    description: '',
    category: '',
    variety: '',
    price: '',
    unit: 'kg',
    quantity: '',
    harvest_date: '',
    expiry_date: '',
  });
  const [images, setImages] = useState([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [datePickerField, setDatePickerField] = useState(null); // 'harvest_date' | 'expiry_date'
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Date picker state
  const currentYear = new Date().getFullYear();
  const YEARS = Array.from({ length: 10 }, (_, i) => String(currentYear + i));
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const DAYS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0'));
  const [dpYear, setDpYear] = useState(String(currentYear));
  const [dpMonth, setDpMonth] = useState('01');
  const [dpDay, setDpDay] = useState('01');

  const openDatePicker = (field) => {
    setDatePickerField(field);
    const existing = form[field];
    if (existing && existing.length === 10) {
      const [y, m, d] = existing.split('-');
      setDpYear(y || String(currentYear));
      setDpMonth(m || '01');
      setDpDay(d || '01');
    } else {
      setDpYear(String(currentYear));
      setDpMonth('01');
      setDpDay('01');
    }
    setShowDatePicker(true);
  };

  const confirmDate = () => {
    const formatted = `${dpYear}-${dpMonth}-${dpDay}`;
    updateForm(datePickerField, formatted);
    setShowDatePicker(false);
  };

  const formatDisplayDate = (iso) => {
    if (!iso || iso.length < 10) return '';
    const [y, m, d] = iso.split('-');
    const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${monthNames[parseInt(m, 10) - 1] || ''} ${y}`;
  };

  const updateForm = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handlePickImage = async (fromCamera = false) => {
    if (images.length >= 5) {
      toastRef.current?.show('You can upload up to 5 images.', 'warning');
      return;
    }
    const uri = await pickImage(fromCamera);
    if (uri) {
      setImages((prev) => [...prev, { uri, uploaded: false, url: null }]);
    }
  };

  const removeImage = (index) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const showImageOptions = () => setShowPhotoPicker(true);

  const validate = () => {
    if (!form.name.trim()) { toastRef.current?.show('Product name is required', 'warning'); return false; }
    if (!form.description.trim()) { toastRef.current?.show('Description is required', 'warning'); return false; }
    if (!form.category) { toastRef.current?.show('Please select a category', 'warning'); return false; }
    if (!form.price || isNaN(parseFloat(form.price)) || parseFloat(form.price) <= 0) {
      toastRef.current?.show('Enter a valid price', 'warning'); return false;
    }
    if (!form.quantity || isNaN(parseInt(form.quantity)) || parseInt(form.quantity) <= 0) {
      toastRef.current?.show('Enter a valid quantity', 'warning'); return false;
    }
    if (!form.harvest_date) { toastRef.current?.show('Harvest date is required', 'warning'); return false; }
    if (!form.expiry_date) { toastRef.current?.show('Expiry date is required', 'warning'); return false; }
    if (images.length === 0) { toastRef.current?.show('Add at least one product image', 'warning'); return false; }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);

    try {
      // Upload images to Cloudinary
      setUploading(true);
      const uploadedUrls = [];
      for (const img of images) {
        if (img.url) {
          uploadedUrls.push(img.url);
        } else {
          const url = await uploadImageToCloudinary(img.uri);
          if (url) uploadedUrls.push(url);
        }
      }
      setUploading(false);

      if (uploadedUrls.length === 0) {
        toastRef.current?.show('Failed to upload images. Please try again.', 'error');
        setSubmitting(false);
        return;
      }

      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        variety: form.variety.trim() || undefined,
        price: parseFloat(form.price),
        unit: form.unit,
        quantity: parseInt(form.quantity),
        harvest_date: form.harvest_date || undefined,
        expiry_date: form.expiry_date || undefined,
        // Send as array of {url, is_primary} objects
        images: uploadedUrls.map((url, i) => ({ url, is_primary: i === 0 })),
        // Also send plain array and string as fallbacks for different backend versions
        image_urls: uploadedUrls,
        image_url: uploadedUrls[0],
      };

      await api.post('/products', payload);
      toastRef.current?.show('Product added successfully!', 'success');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to add product', 'error');
    } finally {
      setSubmitting(false);
      setUploading(false);
    }
  };

  const renderDropdown = (items, selected, onSelect, visible, setVisible, placeholder) => (
    <>
      <TouchableOpacity
        style={styles.dropdown}
        onPress={() => {
          setVisible(!visible);
          if (placeholder === 'Select category') setShowUnitPicker(false);
          else setShowCategoryPicker(false);
        }}
        activeOpacity={0.7}
      >
        <Text style={[styles.dropdownText, !selected && { color: '#999' }]}>
          {selected || placeholder}
        </Text>
        <Ionicons name={visible ? 'chevron-up' : 'chevron-down'} size={20} color="#666" />
      </TouchableOpacity>
      {visible && (
        <View style={styles.dropdownList}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 200 }}>
            {items.map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.dropdownItem, selected === item && styles.dropdownItemActive]}
                onPress={() => { onSelect(item); setVisible(false); }}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    selected === item && { color: '#1B5E20', fontWeight: '700' },
                  ]}
                >
                  {item}
                </Text>
                {selected === item && <Ionicons name="checkmark" size={18} color="#1B5E20" />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#103A12" />

      {/* Header */}
      <LinearGradient colors={['#103A12', '#1B5E20', '#2E7D32']} style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Product</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.formContainer}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Images */}
          <Text style={styles.label}>Product Images *</Text>
          <View style={styles.imageSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {images.map((img, idx) => (
                <View key={idx} style={styles.imageWrapper}>
                  <Image source={{ uri: img.uri }} style={styles.imagePreview} />
                  <TouchableOpacity style={styles.removeImageBtn} onPress={() => removeImage(idx)}>
                    <Ionicons name="close-circle" size={24} color="#F44336" />
                  </TouchableOpacity>
                  {idx === 0 && (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeText}>Primary</Text>
                    </View>
                  )}
                </View>
              ))}
              {images.length < 5 && (
                <TouchableOpacity style={styles.addImageBtn} onPress={showImageOptions}>
                  <Ionicons name="camera-outline" size={32} color="#4CAF50" />
                  <Text style={styles.addImageText}>{images.length}/5</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>

          {/* Name */}
          <Text style={styles.label}>Product Name *</Text>
          <TextInput
            style={styles.input}
            value={form.name}
            onChangeText={(v) => updateForm('name', v)}
            placeholder="Enter product name"
            placeholderTextColor="#999"
          />

          {/* Description */}
          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={form.description}
            onChangeText={(v) => updateForm('description', v)}
            placeholder="Describe your product"
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />

          {/* Category */}
          <Text style={styles.label}>Category *</Text>
          {renderDropdown(
            CATEGORIES,
            form.category,
            (v) => updateForm('category', v),
            showCategoryPicker,
            setShowCategoryPicker,
            'Select category'
          )}

          {/* Variety */}
          <Text style={styles.label}>Variety / Subcategory</Text>
          <TextInput
            style={styles.input}
            value={form.variety}
            onChangeText={(v) => updateForm('variety', v)}
            placeholder="e.g., Alphonso, Basmati"
            placeholderTextColor="#999"
          />

          {/* Price & Unit */}
          <View style={styles.row}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.label}>Price (₹) *</Text>
              <TextInput
                style={styles.input}
                value={form.price}
                onChangeText={(v) => updateForm('price', v)}
                placeholder="0.00"
                placeholderTextColor="#999"
                keyboardType="numeric"
              />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.label}>Unit *</Text>
              {renderDropdown(
                UNITS,
                form.unit,
                (v) => updateForm('unit', v),
                showUnitPicker,
                setShowUnitPicker,
                'Select unit'
              )}
            </View>
          </View>

          {/* Quantity */}
          <Text style={styles.label}>Quantity *</Text>
          <TextInput
            style={styles.input}
            value={form.quantity}
            onChangeText={(v) => updateForm('quantity', v)}
            placeholder="Available quantity"
            placeholderTextColor="#999"
            keyboardType="numeric"
          />

          {/* Harvest Date */}
          <Text style={styles.label}>Harvest Date *</Text>
          <TouchableOpacity style={styles.dateInput} onPress={() => openDatePicker('harvest_date')} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={20} color="#4CAF50" />
            <Text style={[styles.dateInputText, !form.harvest_date && { color: '#999' }]}>
              {form.harvest_date ? formatDisplayDate(form.harvest_date) : 'Select harvest date'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>

          {/* Expiry Date */}
          <Text style={styles.label}>Expiry / Best Before Date *</Text>
          <TouchableOpacity style={styles.dateInput} onPress={() => openDatePicker('expiry_date')} activeOpacity={0.7}>
            <Ionicons name="calendar-outline" size={20} color="#E65100" />
            <Text style={[styles.dateInputText, !form.expiry_date && { color: '#999' }]}>
              {form.expiry_date ? formatDisplayDate(form.expiry_date) : 'Select expiry date'}
            </Text>
            <Ionicons name="chevron-forward" size={18} color="#ccc" />
          </TouchableOpacity>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || uploading) && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={submitting || uploading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#4CAF50', '#388E3C']}
              style={styles.submitGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {submitting || uploading ? (
                <View style={styles.submitRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.submitText}>
                    {uploading ? 'Uploading images...' : 'Adding product...'}
                  </Text>
                </View>
              ) : (
                <View style={styles.submitRow}>
                  <Ionicons name="add-circle-outline" size={22} color="#fff" />
                  <Text style={styles.submitText}>Add Product</Text>
                </View>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
      <ToastMessage ref={toastRef} />

      {/* ── Photo Picker Enhanced Modal ── */}
      <Modal visible={showPhotoPicker} transparent animationType="slide" onRequestClose={() => setShowPhotoPicker(false)}>
        <TouchableOpacity style={pStyles.overlay} activeOpacity={1} onPress={() => setShowPhotoPicker(false)}>
          <View style={pStyles.sheet}>
            <View style={pStyles.handle} />
            <Text style={pStyles.title}>Add Product Photo</Text>
            <Text style={pStyles.subtitle}>Choose image source for your product ({images.length}/5)</Text>
            <TouchableOpacity
              style={pStyles.option}
              onPress={() => { setShowPhotoPicker(false); setTimeout(() => handlePickImage(true), 300); }}
              activeOpacity={0.7}
            >
              <View style={[pStyles.optionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="camera" size={26} color="#1565C0" />
              </View>
              <View style={pStyles.optionText}>
                <Text style={pStyles.optionLabel}>Camera</Text>
                <Text style={pStyles.optionSub}>Take a new photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <View style={pStyles.divider} />
            <TouchableOpacity
              style={pStyles.option}
              onPress={() => { setShowPhotoPicker(false); setTimeout(() => handlePickImage(false), 300); }}
              activeOpacity={0.7}
            >
              <View style={[pStyles.optionIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="images" size={26} color="#1B5E20" />
              </View>
              <View style={pStyles.optionText}>
                <Text style={pStyles.optionLabel}>Gallery</Text>
                <Text style={pStyles.optionSub}>Pick from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <TouchableOpacity style={pStyles.cancelBtn} onPress={() => setShowPhotoPicker(false)} activeOpacity={0.7}>
              <Text style={pStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Date Picker Modal ── */}
      <Modal visible={showDatePicker} transparent animationType="fade" onRequestClose={() => setShowDatePicker(false)}>
        <TouchableOpacity style={dpStyles.overlay} activeOpacity={1} onPress={() => setShowDatePicker(false)}>
          <TouchableOpacity style={dpStyles.card} activeOpacity={1}>
            <Text style={dpStyles.title}>
              {datePickerField === 'harvest_date' ? 'Select Harvest Date' : 'Select Expiry Date'}
            </Text>
            <View style={dpStyles.columnsRow}>
              {/* Day */}
              <View style={dpStyles.col}>
                <Text style={dpStyles.colLabel}>Day</Text>
                <FlatList
                  data={DAYS}
                  keyExtractor={(d) => d}
                  style={dpStyles.scroll}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => setDpDay(item)}
                      style={[dpStyles.item, dpDay === item && dpStyles.itemActive]}
                    >
                      <Text style={[dpStyles.itemText, dpDay === item && dpStyles.itemTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
              {/* Month */}
              <View style={dpStyles.col}>
                <Text style={dpStyles.colLabel}>Month</Text>
                <FlatList
                  data={MONTHS}
                  keyExtractor={(m, i) => m}
                  style={dpStyles.scroll}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item, index }) => {
                    const mVal = String(index + 1).padStart(2, '0');
                    return (
                      <TouchableOpacity
                        onPress={() => setDpMonth(mVal)}
                        style={[dpStyles.item, dpMonth === mVal && dpStyles.itemActive]}
                      >
                        <Text style={[dpStyles.itemText, dpMonth === mVal && dpStyles.itemTextActive]}>{item}</Text>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
              {/* Year */}
              <View style={dpStyles.col}>
                <Text style={dpStyles.colLabel}>Year</Text>
                <FlatList
                  data={YEARS}
                  keyExtractor={(y) => y}
                  style={dpStyles.scroll}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => setDpYear(item)}
                      style={[dpStyles.item, dpYear === item && dpStyles.itemActive]}
                    >
                      <Text style={[dpStyles.itemText, dpYear === item && dpStyles.itemTextActive]}>{item}</Text>
                    </TouchableOpacity>
                  )}
                />
              </View>
            </View>
            <View style={dpStyles.actions}>
              <TouchableOpacity style={dpStyles.cancelBtn} onPress={() => setShowDatePicker(false)}>
                <Text style={dpStyles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={dpStyles.confirmBtn} onPress={confirmDate}>
                <Text style={dpStyles.confirmText}>Confirm</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default AddProduct;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F8F4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: { padding: 6 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },

  formContainer: { padding: 16, paddingBottom: 40 },

  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#333',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  textArea: { minHeight: 100, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },

  /* Dropdown */
  dropdown: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
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
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: { backgroundColor: '#E8F5E9' },
  dropdownItemText: { fontSize: 15, color: '#333' },

  /* Images */
  imageSection: { marginTop: 4 },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: 12,
    marginRight: 10,
    position: 'relative',
  },
  imagePreview: { width: 100, height: 100, borderRadius: 12 },
  removeImageBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  primaryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  primaryBadgeText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  addImageBtn: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  addImageText: { fontSize: 12, color: '#4CAF50', marginTop: 4 },

  /* Submit */
  submitBtn: { marginTop: 24, borderRadius: 14, overflow: 'hidden' },
  submitGradient: { paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  submitRow: { flexDirection: 'row', alignItems: 'center' },
  submitText: { color: '#fff', fontSize: 17, fontWeight: '800', marginLeft: 8 },
  /* Date input */
  dateInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dateInputText: { flex: 1, fontSize: 15, color: '#333' },
});
const pStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '800', color: '#212121', marginBottom: 4 },
  subtitle: { fontSize: 13, color: '#9E9E9E', marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  optionIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '800', color: '#212121' },
  optionSub: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#EEF5EE', marginVertical: 2 },
  cancelBtn: {
    marginTop: 12, backgroundColor: '#E8F5E9', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '800', color: '#757575' },
});

/* Date picker modal styles */
const dpStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20,
    width: '92%',
    elevation: 10, shadowColor: '#1B5E20', shadowOpacity: 0.15, shadowRadius: 12,
  },
  title: { fontSize: 17, fontWeight: '800', color: '#333', marginBottom: 16, textAlign: 'center' },
  columnsRow: { flexDirection: 'row', gap: 8 },
  col: { flex: 1 },
  colLabel: { fontSize: 12, fontWeight: '800', color: '#888', textAlign: 'center', marginBottom: 6 },
  scroll: { height: 200 },
  item: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, marginBottom: 2, alignItems: 'center' },
  itemActive: { backgroundColor: '#E8F5E9' },
  itemText: { fontSize: 15, color: '#555' },
  itemTextActive: { color: '#1B5E20', fontWeight: '800' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16, gap: 12 },
  cancelBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: '#E8F5E9' },
  cancelText: { fontSize: 14, fontWeight: '600', color: '#666' },
  confirmBtn: { paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, backgroundColor: '#4CAF50' },
  confirmText: { fontSize: 14, fontWeight: '800', color: '#fff' },
});
