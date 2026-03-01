import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
  Modal,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { pickImage, uploadImageToCloudinary, optimizeImageUrl } from '../../services/cloudinaryService';
import ToastMessage from '../../utils/Toast';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const CATEGORIES = [
  'Vegetables', 'Fruits', 'Grains', 'Dairy', 'Spices',
  'Herbs', 'Organic', 'Nuts', 'Pulses', 'Oil', 'Honey', 'Other',
];
const UNITS = ['kg', 'piece', 'dozen', 'litre', 'bundle'];

function parseImages(product) {
  const imgs = product.images;
  if (Array.isArray(imgs) && imgs.length > 0) {
    return imgs
      .map((i) => (typeof i === 'string' ? i : i?.image_url || i?.url))
      .filter(Boolean);
  }
  if (typeof imgs === 'string' && imgs.length > 0) return imgs.split('|||').filter(Boolean);
  if (product.image_url) return [product.image_url];
  return [];
}

const EditProduct = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [products, setProducts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [editImages, setEditImages] = useState([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showEditPhotoPicker, setShowEditPhotoPicker] = useState(false);

  // Quick edit modal
  const [quickEditModal, setQuickEditModal] = useState(false);
  const [quickEditData, setQuickEditData] = useState({ id: null, price: '', quantity: '' });

  // Image carousel index per product
  const [carouselIndices, setCarouselIndices] = useState({});
  // Delete confirmation modal
  const [deleteModal, setDeleteModal] = useState({ visible: false, product: null, deleting: false });
  const toastRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    try {
      const { data } = await api.get('/products/farmer/me');
      const list = Array.isArray(data) ? data : data?.products || data?.data || [];
      setProducts(list);
      setFiltered(list);
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to load products', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, []);

  useEffect(() => {
    const term = search.trim().toLowerCase();
    let result = products;
    if (term) {
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(term) ||
          p.category?.toLowerCase().includes(term) ||
          p.description?.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter((p) => {
        const qty = p.quantity ?? p.stock ?? 0;
        if (statusFilter === 'out_of_stock') return qty === 0;
        const isActive = p.status === 'active' || p.status === 'ACTIVE' || p.is_active;
        if (statusFilter === 'active') return qty > 0 && isActive;
        if (statusFilter === 'inactive') return qty > 0 && !isActive;
        return true;
      });
    }
    setFiltered(result);
  }, [search, products, statusFilter]);

  const onRefresh = () => { setRefreshing(true); fetchProducts(); };

  /* ─── Delete ─── */
  const handleDelete = (product) => {
    setDeleteModal({ visible: true, product, deleting: false });
  };

  const confirmDelete = async () => {
    const { product } = deleteModal;
    const pid = product.product_id || product.id;
    setDeleteModal((prev) => ({ ...prev, deleting: true }));
    try {
      await api.delete(`/products/${pid}`);
      setProducts((prev) => prev.filter((p) => (p.product_id || p.id) !== pid));
      setDeleteModal({ visible: false, product: null, deleting: false });
      toastRef.current?.show('Product has been removed.', 'success');
    } catch (e) {
      setDeleteModal((prev) => ({ ...prev, deleting: false }));
      toastRef.current?.show(e.message || 'Failed to delete product', 'error');
    }
  };

  /* ─── Status Toggle ─── */
  const handleToggleStatus = async (product) => {
    const pid = product.product_id || product.id;
    const isActive =
      product.status === 'active' || product.status === 'ACTIVE' || product.is_active;
    const newStatus = isActive ? 'inactive' : 'active';
    try {
      await api.put(`/products/${pid}`, { status: newStatus });
      setProducts((prev) =>
        prev.map((p) =>
          (p.product_id || p.id) === pid ? { ...p, status: newStatus, is_active: newStatus === 'active' } : p
        )
      );
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to update status', 'error');
    }
  };

  /* ─── Quick Edit ─── */
  const openQuickEdit = (product) => {
    setQuickEditData({
      id: product.product_id || product.id,
      price: String(product.price || product.current_price || ''),
      quantity: String(product.quantity ?? product.stock ?? ''),
    });
    setQuickEditModal(true);
  };

  const saveQuickEdit = async () => {
    const { id, price, quantity } = quickEditData;
    if (!price || isNaN(parseFloat(price))) { toastRef.current?.show('Enter valid price', 'warning'); return; }
    if (!quantity || isNaN(parseInt(quantity))) { toastRef.current?.show('Enter valid quantity', 'warning'); return; }
    try {
      await api.put(`/products/${id}`, { current_price: parseFloat(price), quantity: parseInt(quantity) });
      setProducts((prev) =>
        prev.map((p) =>
          (p.product_id || p.id) === id ? { ...p, current_price: parseFloat(price), price: parseFloat(price), quantity: parseInt(quantity) } : p
        )
      );
      setQuickEditModal(false);
      toastRef.current?.show('Price and quantity updated.', 'success');
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to update', 'error');
    }
  };

  /* ─── Full Edit ─── */
  const openEditForm = (product) => {
    setEditForm({
      id: product.product_id || product.id,
      name: product.name || '',
      description: product.description || '',
      category: product.category || '',
      variety: product.variety || '',
      price: String(product.price || product.current_price || ''),
      unit: product.unit || 'kg',
      quantity: String(product.quantity ?? product.stock ?? ''),
    });
    setEditImages(
      parseImages(product).map((url) => ({ uri: url, url, uploaded: true }))
    );
    setShowCategoryPicker(false);
    setShowUnitPicker(false);
    setEditModal(true);
  };

  const handleEditImagePick = async (fromCamera = false) => {
    if (editImages.length >= 5) {
      toastRef.current?.show('Maximum 5 images allowed.', 'warning');
      return;
    }
    const uri = await pickImage(fromCamera);
    if (uri) setEditImages((prev) => [...prev, { uri, uploaded: false, url: null }]);
  };

  const showEditImageOptions = () => setShowEditPhotoPicker(true);

  const saveEdit = async () => {
    if (!editForm.name.trim()) { toastRef.current?.show('Name is required', 'warning'); return; }
    if (!editForm.price || isNaN(parseFloat(editForm.price))) { toastRef.current?.show('Valid price required', 'warning'); return; }
    if (!editForm.quantity || isNaN(parseInt(editForm.quantity))) { toastRef.current?.show('Valid quantity required', 'warning'); return; }

    setSaving(true);
    try {
      setUploading(true);
      const uploadedUrls = [];
      for (const img of editImages) {
        if (img.url) {
          uploadedUrls.push(img.url);
        } else {
          const url = await uploadImageToCloudinary(img.uri);
          if (url) uploadedUrls.push(url);
        }
      }
      setUploading(false);

      const payload = {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        category: editForm.category,
        variety: editForm.variety.trim() || undefined,
        current_price: parseFloat(editForm.price),
        unit: editForm.unit,
        quantity: parseInt(editForm.quantity),
        images: uploadedUrls.map((url, i) => ({ url, is_primary: i === 0 })),
        image_urls: uploadedUrls,
        image_url: uploadedUrls[0],
      };

      await api.put(`/products/${editForm.id}`, payload);
      await fetchProducts();
      setEditModal(false);
      toastRef.current?.show('Product updated successfully.', 'success');
    } catch (e) {
      toastRef.current?.show(e.message || 'Failed to update', 'error');
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  /* ─── Carousel ─── */
  const handleCarouselScroll = (productId, event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const idx = Math.round(offsetX / (SCREEN_WIDTH - 60));
    setCarouselIndices((prev) => ({ ...prev, [productId]: idx }));
  };

  const getStatusColor = (product) => {
    if (product.quantity === 0 || product.stock === 0) return '#F44336';
    if (product.status === 'active' || product.status === 'ACTIVE' || product.is_active) return '#4CAF50';
    return '#FF9800';
  };

  const getStatusText = (product) => {
    if (product.quantity === 0 || product.stock === 0) return 'Out of Stock';
    if (product.status === 'active' || product.status === 'ACTIVE' || product.is_active) return 'Active';
    return 'Inactive';
  };

  /* ─── Render Product Card ─── */
  const renderProduct = ({ item }) => {
    const imgUrls = parseImages(item);
    const currentIdx = carouselIndices[item.product_id || item.id] || 0;
    const statusColor = getStatusColor(item);

    return (
      <View style={styles.productCard}>
        {/* Image Carousel */}
        {imgUrls.length > 0 ? (
          <View>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => handleCarouselScroll(item.product_id || item.id, e)}
              style={styles.carousel}
            >
              {imgUrls.map((url, idx) => (
                <Image
                  key={idx}
                  source={{ uri: optimizeImageUrl(url, { width: 400 }) }}
                  style={styles.carouselImage}
                  resizeMode="cover"
                />
              ))}
            </ScrollView>
            {imgUrls.length > 1 && (
              <View style={styles.carouselDots}>
                {imgUrls.map((_, idx) => (
                  <View key={idx} style={[styles.dot, currentIdx === idx && styles.dotActive]} />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noImage}>
            <Ionicons name="image-outline" size={40} color="#ccc" />
          </View>
        )}

        {/* Status Badge */}
        <View style={[styles.statusBadgeWrap, { backgroundColor: statusColor + '18' }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusTextSmall, { color: statusColor }]}>{getStatusText(item)}</Text>
        </View>

        {/* Details */}
        <View style={styles.cardBody}>
          <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.productCategory}>{item.category}</Text>
          <Text style={styles.productDesc} numberOfLines={2}>{item.description}</Text>

          <View style={styles.priceRow}>
            <Text style={styles.price}>₹{parseFloat(item.price || item.current_price || 0).toFixed(2)}</Text>
            <Text style={styles.unit}>/{item.unit || 'kg'}</Text>
            <Text style={styles.quantity}>Qty: {item.quantity ?? item.stock ?? 0}</Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }]}
              onPress={() => openQuickEdit(item)}
            >
              <Ionicons name="pricetag-outline" size={16} color="#1565C0" />
              <Text style={[styles.actionBtnText, { color: '#1565C0' }]}>Quick Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }]}
              onPress={() => openEditForm(item)}
            >
              <Ionicons name="create-outline" size={16} color="#1B5E20" />
              <Text style={[styles.actionBtnText, { color: '#1B5E20' }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FFF3E0' }]}
              onPress={() => handleToggleStatus(item)}
            >
              <Ionicons
                name={getStatusText(item) === 'Active' ? 'pause-circle-outline' : 'play-circle-outline'}
                size={16}
                color="#E65100"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#FFEBEE' }]}
              onPress={() => handleDelete(item)}
            >
              <Ionicons name="trash-outline" size={16} color="#C62828" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  /* ─── Edit Form Modal ─── */
  const renderEditModal = () => (
    <Modal visible={editModal} animationType="slide" onRequestClose={() => setEditModal(false)}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={() => setEditModal(false)}>
            <Ionicons name="close" size={26} color="#333" />
          </TouchableOpacity>
          <Text style={styles.modalTitle}>Edit Product</Text>
          <TouchableOpacity onPress={saveEdit} disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#4CAF50" />
            ) : (
              <Text style={styles.saveText}>Save</Text>
            )}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalForm} keyboardShouldPersistTaps="handled">
            {/* Images */}
            <Text style={styles.label}>Images</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
              {editImages.map((img, idx) => (
                <View key={idx} style={styles.editImageWrap}>
                  <Image source={{ uri: img.uri }} style={styles.editImageThumb} />
                  <TouchableOpacity
                    style={styles.removeImgBtn}
                    onPress={() => setEditImages((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    <Ionicons name="close-circle" size={22} color="#F44336" />
                  </TouchableOpacity>
                </View>
              ))}
              {editImages.length < 5 && (
                <TouchableOpacity style={styles.addEditImgBtn} onPress={showEditImageOptions}>
                  <Ionicons name="add" size={28} color="#4CAF50" />
                </TouchableOpacity>
              )}
            </ScrollView>

            {uploading && (
              <View style={styles.uploadingRow}>
                <ActivityIndicator size="small" color="#4CAF50" />
                <Text style={styles.uploadingText}>Uploading images...</Text>
              </View>
            )}

            {editForm && (
              <>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, name: v }))}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                  value={editForm.description}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, description: v }))}
                  multiline
                />

                <Text style={styles.label}>Category</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => { setShowCategoryPicker(!showCategoryPicker); setShowUnitPicker(false); }}
                >
                  <Text style={styles.dropdownText}>{editForm.category || 'Select'}</Text>
                  <Ionicons name="chevron-down" size={18} color="#666" />
                </TouchableOpacity>
                {showCategoryPicker && (
                  <View style={styles.dropdownList}>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 180 }}>
                      {CATEGORIES.map((c) => (
                        <TouchableOpacity
                          key={c}
                          style={[
                            styles.dropdownItem,
                            editForm.category === c && styles.dropdownItemActive,
                          ]}
                          onPress={() => {
                            setEditForm((f) => ({ ...f, category: c }));
                            setShowCategoryPicker(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={styles.label}>Variety</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.variety}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, variety: v }))}
                />

                <View style={{ flexDirection: 'row' }}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.label}>Price (₹)</Text>
                    <TextInput
                      style={styles.input}
                      value={editForm.price}
                      onChangeText={(v) => setEditForm((f) => ({ ...f, price: v }))}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.label}>Unit</Text>
                    <TouchableOpacity
                      style={styles.dropdown}
                      onPress={() => { setShowUnitPicker(!showUnitPicker); setShowCategoryPicker(false); }}
                    >
                      <Text style={styles.dropdownText}>{editForm.unit}</Text>
                      <Ionicons name="chevron-down" size={18} color="#666" />
                    </TouchableOpacity>
                    {showUnitPicker && (
                      <View style={styles.dropdownList}>
                        {UNITS.map((u) => (
                          <TouchableOpacity
                            key={u}
                            style={[
                              styles.dropdownItem,
                              editForm.unit === u && styles.dropdownItemActive,
                            ]}
                            onPress={() => {
                              setEditForm((f) => ({ ...f, unit: u }));
                              setShowUnitPicker(false);
                            }}
                          >
                            <Text style={styles.dropdownItemText}>{u}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <Text style={styles.label}>Quantity</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.quantity}
                  onChangeText={(v) => setEditForm((f) => ({ ...f, quantity: v }))}
                  keyboardType="numeric"
                />
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );

  /* ─── Quick Edit Modal ─── */
  const renderQuickEditModal = () => (
    <Modal
      visible={quickEditModal}
      transparent
      animationType="fade"
      onRequestClose={() => setQuickEditModal(false)}
    >
      <View style={styles.overlay}>
        <View style={styles.quickEditCard}>
          <Text style={styles.quickEditTitle}>Update Price & Quantity</Text>

          <Text style={styles.label}>Price (₹)</Text>
          <TextInput
            style={styles.input}
            value={quickEditData.price}
            onChangeText={(v) => setQuickEditData((d) => ({ ...d, price: v }))}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Quantity</Text>
          <TextInput
            style={styles.input}
            value={quickEditData.quantity}
            onChangeText={(v) => setQuickEditData((d) => ({ ...d, quantity: v }))}
            keyboardType="numeric"
          />

          <View style={styles.quickEditBtns}>
            <TouchableOpacity
              style={[styles.qeBtn, { backgroundColor: '#eee' }]}
              onPress={() => setQuickEditModal(false)}
            >
              <Text style={{ color: '#666', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.qeBtn, { backgroundColor: '#4CAF50' }]}
              onPress={saveQuickEdit}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Update</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      {/* Header */}
      <LinearGradient
        colors={['#1B5E20', '#388E3C']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Products</Text>
        <TouchableOpacity onPress={() => navigation.navigate('AddProduct')}>
          <Ionicons name="add-circle-outline" size={26} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search-outline" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search products..."
          placeholderTextColor="#999"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={20} color="#999" />
          </TouchableOpacity>
        )}
      </View>

      {/* Status Filter Chips */}
      <View style={styles.filterArea}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {[
            { key: 'all', label: 'All', color: '#424242' },
            { key: 'active', label: 'Active', color: '#1B5E20' },
            { key: 'inactive', label: 'Inactive', color: '#E65100' },
            { key: 'out_of_stock', label: 'Out of Stock', color: '#C62828' },
          ].map((f) => {
            const active = statusFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.filterChip, active ? { backgroundColor: f.color } : { borderColor: f.color + '80', borderWidth: 1 }]}
                onPress={() => setStatusFilter(f.key)}
                activeOpacity={0.7}
              >
                <Text style={[styles.filterChipText, { color: active ? '#fff' : f.color }]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {search ? 'No products match your search' : 'No products yet. Add your first product!'}
          </Text>
          {!search && (
            <TouchableOpacity
              style={styles.addFirstBtn}
              onPress={() => navigation.navigate('AddProduct')}
            >
              <Text style={styles.addFirstBtnText}>Add Product</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item, index) => String(item.product_id || item.id || index)}
          renderItem={renderProduct}
          contentContainerStyle={{ padding: 16, paddingBottom: 30 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderEditModal()}
      {renderQuickEditModal()}

      {/* ── Delete confirmation modal ── */}
      <Modal
        visible={deleteModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => !deleteModal.deleting && setDeleteModal({ visible: false, product: null, deleting: false })}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', alignItems: 'center' }}>
            {/* Icon */}
            <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFEBEE', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
              <Ionicons name="trash-outline" size={32} color="#D32F2F" />
            </View>
            {/* Title */}
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#1a1a1a', marginBottom: 8, textAlign: 'center' }}>
              Delete Product
            </Text>
            {/* Message */}
            <Text style={{ fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20, marginBottom: 24 }}>
              Are you sure you want to delete{'\n'}
              <Text style={{ fontWeight: '600', color: '#333' }}>"{deleteModal.product?.name}"</Text>?{'\n'}
              This action cannot be undone.
            </Text>
            {/* Actions */}
            <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E0E0E0', alignItems: 'center' }}
                onPress={() => setDeleteModal({ visible: false, product: null, deleting: false })}
                disabled={deleteModal.deleting}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#555' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#D32F2F', alignItems: 'center', justifyContent: 'center' }}
                onPress={confirmDelete}
                disabled={deleteModal.deleting}
              >
                {deleteModal.deleting
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: '#fff' }}>Delete</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ToastMessage ref={toastRef} />

      {/* Edit Image Photo Picker Modal */}
      <Modal visible={showEditPhotoPicker} transparent animationType="slide" onRequestClose={() => setShowEditPhotoPicker(false)}>
        <TouchableOpacity style={epStyles.overlay} activeOpacity={1} onPress={() => setShowEditPhotoPicker(false)}>
          <View style={epStyles.sheet}>
            <View style={epStyles.handle} />
            <Text style={epStyles.title}>Product Photo</Text>
            <TouchableOpacity
              style={epStyles.option}
              onPress={() => { setShowEditPhotoPicker(false); setTimeout(() => handleEditImagePick(true), 300); }}
              activeOpacity={0.7}
            >
              <View style={[epStyles.optionIcon, { backgroundColor: '#E3F2FD' }]}>
                <Ionicons name="camera" size={26} color="#1565C0" />
              </View>
              <View style={epStyles.optionText}>
                <Text style={epStyles.optionLabel}>Camera</Text>
                <Text style={epStyles.optionSub}>Take a new photo</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <View style={epStyles.divider} />
            <TouchableOpacity
              style={epStyles.option}
              onPress={() => { setShowEditPhotoPicker(false); setTimeout(() => handleEditImagePick(false), 300); }}
              activeOpacity={0.7}
            >
              <View style={[epStyles.optionIcon, { backgroundColor: '#E8F5E9' }]}>
                <Ionicons name="images" size={26} color="#1B5E20" />
              </View>
              <View style={epStyles.optionText}>
                <Text style={epStyles.optionLabel}>Gallery</Text>
                <Text style={epStyles.optionSub}>Pick from your gallery</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#ccc" />
            </TouchableOpacity>
            <TouchableOpacity style={epStyles.cancelBtn} onPress={() => setShowEditPhotoPicker(false)} activeOpacity={0.7}>
              <Text style={epStyles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default EditProduct;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { marginTop: 12, fontSize: 15, color: '#999', textAlign: 'center' },
  addFirstBtn: {
    marginTop: 16,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addFirstBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

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
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },

  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: '#333' },

  /* Filter Chips */
  filterArea: { paddingVertical: 6 },
  filterRow: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  /* Product Card */
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  carousel: { height: 200 },
  carouselImage: { width: SCREEN_WIDTH - 32, height: 200 },
  carouselDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.5)',
    marginHorizontal: 3,
  },
  dotActive: { backgroundColor: '#fff', width: 20 },
  noImage: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F0F0',
  },

  statusBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginLeft: 14,
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusTextSmall: { fontSize: 12, fontWeight: '600' },

  cardBody: { padding: 14 },
  productName: { fontSize: 18, fontWeight: '700', color: '#333' },
  productCategory: { fontSize: 13, color: '#888', marginTop: 2 },
  productDesc: { fontSize: 13, color: '#666', marginTop: 6 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 10 },
  price: { fontSize: 20, fontWeight: '700', color: '#1B5E20' },
  unit: { fontSize: 14, color: '#666', marginLeft: 2 },
  quantity: { fontSize: 13, color: '#888', marginLeft: 'auto' },

  actionRow: { flexDirection: 'row', marginTop: 12, gap: 6, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600' },

  /* Modal */
  modalContainer: { flex: 1, backgroundColor: '#F5F5F5' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  saveText: { fontSize: 16, fontWeight: '700', color: '#4CAF50' },
  modalForm: { padding: 16, paddingBottom: 40 },

  label: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 14, marginBottom: 6 },
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
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#F0F0F0',
  },
  dropdownItemActive: { backgroundColor: '#E8F5E9' },
  dropdownItemText: { fontSize: 15, color: '#333' },

  editImageWrap: {
    width: 80,
    height: 80,
    borderRadius: 10,
    marginRight: 8,
    position: 'relative',
  },
  editImageThumb: { width: 80, height: 80, borderRadius: 10 },
  removeImgBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: '#fff',
    borderRadius: 11,
  },
  addEditImgBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4CAF50',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
  },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  uploadingText: { marginLeft: 8, color: '#4CAF50', fontSize: 13 },

  /* Quick Edit */
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickEditCard: { backgroundColor: '#fff', width: '85%', borderRadius: 16, padding: 20 },
  quickEditTitle: { fontSize: 18, fontWeight: '700', color: '#333', marginBottom: 8 },
  quickEditBtns: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 12 },
  qeBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
});

/* Edit photo-picker modal styles */
const epStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E0E0E0', alignSelf: 'center', marginBottom: 16 },
  title: { fontSize: 19, fontWeight: '800', color: '#212121', marginBottom: 20 },
  option: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  optionIcon: { width: 50, height: 50, borderRadius: 14, justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 16, fontWeight: '700', color: '#212121' },
  optionSub: { fontSize: 12, color: '#9E9E9E', marginTop: 2 },
  divider: { height: 1, backgroundColor: '#F5F5F5', marginVertical: 2 },
  cancelBtn: {
    marginTop: 12, backgroundColor: '#F5F5F5', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  cancelText: { fontSize: 15, fontWeight: '700', color: '#757575' },
});
