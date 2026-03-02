/**
 * LocationPickerModal.js
 *
 * In-app map picker â€” react-native-maps (already compiled) + OpenStreetMap UrlTile.
 * Search and reverse-geocoding via Nominatim (free, no key needed).
 * The placeholder Google API key in AndroidManifest prevents the native crash;
 * actual tiles are replaced 100% by OSM UrlTile â€” Google tiles never shown.
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}  fields: { address, city, pincode, zone, state, district }
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  StatusBar,
  Alert,
  Keyboard,
  Platform,
  Dimensions,
} from 'react-native';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

const OSM_TILE  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const NOM_URL   = 'https://nominatim.openstreetmap.org';
const NOM_HDR   = { 'User-Agent': 'FarmerCrate/1.0 (farmercrate@app)' };
const DEFAULT_REGION = { latitude: 20.5937, longitude: 78.9629, latitudeDelta: 10, longitudeDelta: 10 };

// â”€â”€â”€ placeholder to satisfy Metro bundler (not used at runtime here) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const _LEAFLET_HTML_REMOVED = true; // WebView replaced by react-native-maps
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Build address fields from Nominatim response
function buildFields(a, display) {
  return {
    address:  display || '',
    city:     a.city || a.town || a.village || a.municipality || a.county || '',
    pincode:  a.postcode  || '',
    zone:     a.suburb || a.neighbourhood || a.village || a.hamlet || '',
    state:    a.state || '',
    district: a.state_district || a.district || a.county || '',
  };
}

// â”€â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function LocationPickerModal({ visible, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  const [region,      setRegion]      = useState(DEFAULT_REGION);
  const [markerCoord, setMarkerCoord] = useState(null);
  const [preview,     setPreview]     = useState(null);   // { city, district, state, pincode, address, ... }

  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState([]);
  const [searchLoading,  setSearchLoading]  = useState(false);
  const [showDrop,       setShowDrop]       = useState(false);
  const [revLoading,     setRevLoading]     = useState(false);
  const [confirming,     setConfirming]     = useState(false);
  const debounceRef = useRef(null);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setRegion(DEFAULT_REGION);
      setMarkerCoord(null);
      setPreview(null);
      setQuery('');
      setResults([]);
      setShowDrop(false);
    }
  }, [visible]);

  // â”€â”€ Reverse geocode a coordinate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const reverseGeocode = useCallback(async (lat, lon) => {
    setRevLoading(true);
    try {
      const res = await axios.get(`${NOM_URL}/reverse`, {
        params: { format: 'json', lat, lon, addressdetails: 1 },
        headers: NOM_HDR,
      });
      if (res.data?.address) {
        setPreview(buildFields(res.data.address, res.data.display_name));
      }
    } catch (e) {
      console.error('[LocationPicker] reverse geocode error:', e.message);
    } finally {
      setRevLoading(false);
    }
  }, []);

  // â”€â”€ Tap on map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleMapPress = useCallback((e) => {
    const coord = e.nativeEvent.coordinate;
    setMarkerCoord(coord);
    setShowDrop(false);
    Keyboard.dismiss();
    reverseGeocode(coord.latitude, coord.longitude);
  }, [reverseGeocode]);

  // â”€â”€ Drag marker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleDragEnd = useCallback((e) => {
    const coord = e.nativeEvent.coordinate;
    setMarkerCoord(coord);
    reverseGeocode(coord.latitude, coord.longitude);
  }, [reverseGeocode]);

  // â”€â”€ Search (debounced) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSearchChange = useCallback((text) => {
    setQuery(text);
    setShowDrop(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 3) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await axios.get(`${NOM_URL}/search`, {
          params: { format: 'json', q: text.trim(), addressdetails: 1, limit: 7, countrycodes: 'in' },
          headers: NOM_HDR,
        });
        setResults(res.data || []);
        setShowDrop(true);
      } catch (e) {
        console.error('[LocationPicker] search error:', e.message);
      } finally {
        setSearchLoading(false);
      }
    }, 600);
  }, []);

  // â”€â”€ Pick search result â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSelectResult = useCallback((item) => {
    Keyboard.dismiss();
    setQuery(item.display_name);
    setShowDrop(false);
    setResults([]);
    const coord = { latitude: parseFloat(item.lat), longitude: parseFloat(item.lon) };
    const newRegion = { ...coord, latitudeDelta: 0.06, longitudeDelta: 0.06 };
    setMarkerCoord(coord);
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);
    if (item.address) setPreview(buildFields(item.address, item.display_name));
    else reverseGeocode(coord.latitude, coord.longitude);
  }, [reverseGeocode]);

  // â”€â”€ Confirm â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleConfirm = useCallback(async () => {
    if (!markerCoord && !preview) {
      Alert.alert('No location selected', 'Tap on the map or search to select a location first.');
      return;
    }
    if (preview) { onConfirm(preview); return; }
    // Fallback: reverse geocode current marker
    setConfirming(true);
    try {
      const res = await axios.get(`${NOM_URL}/reverse`, {
        params: { format: 'json', lat: markerCoord.latitude, lon: markerCoord.longitude, addressdetails: 1 },
        headers: NOM_HDR,
      });
      if (res.data?.address) {
        onConfirm(buildFields(res.data.address, res.data.display_name));
      } else {
        Alert.alert('Error', 'Could not fetch address. Try again.');
      }
    } catch (e) {
      console.error('[LocationPicker] confirm geocode error:', e.message);
      Alert.alert('Error', 'Could not fetch address. Check your internet connection.');
    } finally {
      setConfirming(false);
    }
  }, [markerCoord, preview, onConfirm]);

  const hasSelection = !!(markerCoord || preview);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* â”€â”€ Header â”€â”€ */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>ðŸ“ Pick Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        {/* â”€â”€ Search bar â”€â”€ */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#666" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search city, area, pincodeâ€¦"
              placeholderTextColor="#999"
              value={query}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchLoading
              ? <ActivityIndicator size="small" color="#43A047" style={{ marginLeft: 6 }} />
              : query.length > 0
                ? <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setShowDrop(false); }}>
                    <Ionicons name="close-circle" size={20} color="#bbb" />
                  </TouchableOpacity>
                : null
            }
          </View>

          {/* â”€â”€ Search dropdown â”€â”€ */}
          {showDrop && results.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={results}
                keyExtractor={(_, i) => String(i)}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 220 }}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.dropItem} onPress={() => handleSelectResult(item)} activeOpacity={0.7}>
                    <Ionicons name="location-outline" size={15} color="#43A047" style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={styles.dropText} numberOfLines={2}>{item.display_name}</Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
              />
            </View>
          )}
          {showDrop && results.length === 0 && !searchLoading && query.length >= 3 && (
            <View style={[styles.dropdown, { padding: 14 }]}>
              <Text style={{ color: '#999', fontSize: 13 }}>No results found</Text>
            </View>
          )}
        </View>

        {/* â”€â”€ Map â”€â”€ */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_DEFAULT}
            region={region}
            onRegionChangeComplete={setRegion}
            onPress={handleMapPress}
            showsUserLocation={false}
            toolbarEnabled={false}
          >
            <UrlTile urlTemplate={OSM_TILE} maximumZ={19} flipY={false} shouldReplaceMapContent />
            {markerCoord && (
              <Marker coordinate={markerCoord} draggable onDragEnd={handleDragEnd} pinColor="#E53935" />
            )}
          </MapView>

          {/* Reverse-geocoding spinner overlay */}
          {revLoading && (
            <View style={styles.mapSpinner}>
              <ActivityIndicator size="small" color="#43A047" />
            </View>
          )}
        </View>

        {/* â”€â”€ Address preview â”€â”€ */}
        {preview ? (
          <View style={styles.previewCard}>
            <Ionicons name="location" size={18} color="#E53935" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewCity} numberOfLines={1}>
                {[preview.city, preview.district, preview.state].filter(Boolean).join(', ')}
              </Text>
              <Text style={styles.previewAddr} numberOfLines={2}>{preview.address}</Text>
              {preview.pincode ? <Text style={styles.previewPin}>ðŸ“® {preview.pincode}</Text> : null}
            </View>
          </View>
        ) : (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={15} color="#888" />
            <Text style={styles.hintText}>Tap anywhere on the map or search above to select a location</Text>
          </View>
        )}

        {/* â”€â”€ Confirm button â”€â”€ */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!hasSelection || confirming) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!hasSelection || confirming}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={(!hasSelection || confirming) ? ['#A5D6A7', '#A5D6A7'] : ['#2E7D32', '#43A047']}
              style={styles.confirmBtnInner}
            >
              {confirming
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />}
              <Text style={styles.confirmBtnText}>
                {confirming ? 'Getting addressâ€¦' : 'Use This Location'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// â”€â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 3,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  searchWrapper: {
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff', zIndex: 100, elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 4,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    borderWidth: 1.5, borderColor: '#E8F5E9',
  },
  searchInput: { flex: 1, fontSize: 15, color: '#212121', paddingVertical: 0 },
  dropdown: {
    position: 'absolute', top: 62, left: 12, right: 12,
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E0E0',
    overflow: 'hidden', zIndex: 200, elevation: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.14, shadowRadius: 6,
  },
  dropItem: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12 },
  dropText: { flex: 1, fontSize: 13.5, color: '#333', lineHeight: 19 },

  mapContainer: { flex: 1, overflow: 'hidden' },
  mapSpinner: {
    position: 'absolute', bottom: 16, right: 16,
    backgroundColor: '#fff', borderRadius: 20, padding: 8,
    elevation: 4,
  },

  previewCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#F1F8E9', borderTopWidth: 1, borderTopColor: '#C8E6C9',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  previewCity: { fontSize: 14, fontWeight: '700', color: '#2E7D32', marginBottom: 2 },
  previewAddr: { fontSize: 12, color: '#555', lineHeight: 17 },
  previewPin:  { fontSize: 12, color: '#777', marginTop: 3 },

  hintBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAFAFA', borderTopWidth: 1, borderTopColor: '#E0E0E0',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  hintText: { flex: 1, fontSize: 12.5, color: '#888', lineHeight: 18 },

  footer: {
    backgroundColor: '#fff', paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08, shadowRadius: 4,
  },
  confirmBtn: { borderRadius: 14, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, borderRadius: 14, gap: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.4 },
});

