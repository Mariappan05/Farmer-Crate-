/**
 * LocationPickerModal.js
 *
 * In-app map location picker using react-native-maps + OpenStreetMap tiles.
 * Nominatim is used for both forward search and reverse geocoding.
 * No external map app is opened — everything runs inside the app.
 *
 * Props:
 *   visible      {boolean}
 *   onClose      {() => void}
 *   onConfirm    {(fields) => void}   fields: { address, city, pincode, zone, state, district }
 *   initialRegion {object}            optional — lat/lng to start at
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  FlatList,
  ActivityIndicator,
  Platform,
  StatusBar,
  Keyboard,
  Dimensions,
} from 'react-native';
import MapView, { Marker, UrlTile, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const NOMINATIM_SEARCH = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_HEADERS = { 'User-Agent': 'FarmerCrate/1.0 (farmercrate@app)' };

const DEFAULT_REGION = {
  latitude: 20.5937,
  longitude: 78.9629,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

const { width: SW, height: SH } = Dimensions.get('window');

export default function LocationPickerModal({ visible, onClose, onConfirm, initialRegion }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);

  // ── State ────────────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [region, setRegion] = useState(initialRegion || DEFAULT_REGION);
  const [markerCoord, setMarkerCoord] = useState(null);
  const [reverseInfo, setReverseInfo] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimer = useRef(null);

  // Sync initial region when modal opens
  useEffect(() => {
    if (visible) {
      setRegion(initialRegion || DEFAULT_REGION);
      setMarkerCoord(null);
      setReverseInfo(null);
      setQuery('');
      setResults([]);
      setShowDropdown(false);
    }
  }, [visible]);

  // ── Search with debounce ─────────────────────────────────────────────────
  const handleSearchChange = useCallback((text) => {
    setQuery(text);
    setShowDropdown(false);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 3) { setResults([]); return; }
    searchTimer.current = setTimeout(() => doSearch(text.trim()), 600);
  }, []);

  const doSearch = async (q) => {
    setSearchLoading(true);
    try {
      const res = await axios.get(NOMINATIM_SEARCH, {
        params: {
          q,
          format: 'json',
          addressdetails: 1,
          limit: 8,
          countrycodes: 'in',   // restrict to India
        },
        headers: NOMINATIM_HEADERS,
      });
      setResults(res.data || []);
      setShowDropdown(true);
    } catch {
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  };

  // ── Select a search result ───────────────────────────────────────────────
  const handleSelectResult = useCallback((item) => {
    Keyboard.dismiss();
    setQuery(item.display_name);
    setShowDropdown(false);
    setResults([]);
    const coord = {
      latitude: parseFloat(item.lat),
      longitude: parseFloat(item.lon),
    };
    setMarkerCoord(coord);
    const newRegion = { ...coord, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 600);
    // Pre-fill reverseInfo from search result address
    buildReverseInfo(item.address, item.display_name);
  }, []);

  // ── Tap on map ───────────────────────────────────────────────────────────
  const handleMapPress = useCallback((e) => {
    const coord = e.nativeEvent.coordinate;
    setMarkerCoord(coord);
    setShowDropdown(false);
    Keyboard.dismiss();
    reverseGeocode(coord.latitude, coord.longitude);
  }, []);

  // ── Drag end ─────────────────────────────────────────────────────────────
  const handleMarkerDragEnd = useCallback((e) => {
    const coord = e.nativeEvent.coordinate;
    setMarkerCoord(coord);
    reverseGeocode(coord.latitude, coord.longitude);
  }, []);

  // ── Reverse geocode ──────────────────────────────────────────────────────
  const reverseGeocode = async (lat, lon) => {
    try {
      const res = await axios.get(NOMINATIM_REVERSE, {
        params: { format: 'json', lat, lon, addressdetails: 1 },
        headers: NOMINATIM_HEADERS,
      });
      buildReverseInfo(res.data?.address, res.data?.display_name);
    } catch { /* silent */ }
  };

  const buildReverseInfo = (a, displayName) => {
    if (!a) return;
    setReverseInfo({
      address: displayName || '',
      city: a.city || a.town || a.village || a.municipality || a.county || '',
      pincode: a.postcode || '',
      zone: a.suburb || a.neighbourhood || a.village || a.hamlet || '',
      state: a.state || '',
      district: a.state_district || a.district || a.county || '',
    });
  };

  // ── Confirm selection ────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!markerCoord) {
      // No pin yet — try confirming from the current map center
      if (!reverseInfo) {
        alert('Please search or tap on the map to select a location.');
        return;
      }
    }

    let info = reverseInfo;
    if (!info && markerCoord) {
      setConfirmLoading(true);
      try {
        const res = await axios.get(NOMINATIM_REVERSE, {
          params: {
            format: 'json',
            lat: markerCoord.latitude,
            lon: markerCoord.longitude,
            addressdetails: 1,
          },
          headers: NOMINATIM_HEADERS,
        });
        const a = res.data?.address || {};
        info = {
          address: res.data?.display_name || '',
          city: a.city || a.town || a.village || a.municipality || '',
          pincode: a.postcode || '',
          zone: a.suburb || a.neighbourhood || a.village || '',
          state: a.state || '',
          district: a.state_district || a.district || a.county || '',
        };
      } catch {
        alert('Could not fetch address. Please try again.');
        setConfirmLoading(false);
        return;
      } finally {
        setConfirmLoading(false);
      }
    }

    onConfirm(info);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* ── Header ── */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        {/* ── Search bar ── */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={20} color="#666" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search city, area, street…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={handleSearchChange}
              returnKeyType="search"
              autoCorrect={false}
            />
            {searchLoading && (
              <ActivityIndicator size="small" color="#4CAF50" style={{ marginLeft: 6 }} />
            )}
            {query.length > 0 && !searchLoading && (
              <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setShowDropdown(false); }}>
                <Ionicons name="close-circle" size={20} color="#bbb" />
              </TouchableOpacity>
            )}
          </View>

          {/* ── Search results dropdown ── */}
          {showDropdown && results.length > 0 && (
            <View style={styles.dropdown}>
              <FlatList
                data={results}
                keyExtractor={(_, i) => String(i)}
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: 240 }}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.dropdownItem}
                    onPress={() => handleSelectResult(item)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="location-outline" size={16} color="#4CAF50" style={{ marginRight: 8, marginTop: 2 }} />
                    <Text style={styles.dropdownText} numberOfLines={2}>{item.display_name}</Text>
                  </TouchableOpacity>
                )}
                ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#eee' }} />}
              />
            </View>
          )}
          {showDropdown && results.length === 0 && !searchLoading && query.length >= 3 && (
            <View style={[styles.dropdown, { padding: 14 }]}>
              <Text style={{ color: '#999', fontSize: 13 }}>No results found</Text>
            </View>
          )}
        </View>

        {/* ── Map ── */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_DEFAULT}
            region={region}
            onRegionChangeComplete={setRegion}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
          >
            <UrlTile
              urlTemplate={OSM_TILE_URL}
              maximumZ={19}
              flipY={false}
              shouldReplaceMapContent
            />
            {markerCoord && (
              <Marker
                coordinate={markerCoord}
                draggable
                onDragEnd={handleMarkerDragEnd}
                pinColor="#E53935"
              />
            )}
          </MapView>

          {/* My Location FAB */}
          <TouchableOpacity
            style={styles.myLocationBtn}
            onPress={() => {
              if (markerCoord) {
                mapRef.current?.animateToRegion({
                  ...markerCoord,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                }, 400);
              }
            }}
          >
            <Ionicons name="locate" size={22} color="#4CAF50" />
          </TouchableOpacity>
        </View>

        {/* ── Selected address preview ── */}
        {reverseInfo && (
          <View style={styles.previewCard}>
            <Ionicons name="location" size={18} color="#E53935" style={{ marginRight: 8 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewCity} numberOfLines={1}>
                {[reverseInfo.city, reverseInfo.district, reverseInfo.state].filter(Boolean).join(', ')}
              </Text>
              <Text style={styles.previewAddress} numberOfLines={2}>
                {reverseInfo.address}
              </Text>
              {reverseInfo.pincode ? (
                <Text style={styles.previewPincode}>📮 Pincode: {reverseInfo.pincode}</Text>
              ) : null}
            </View>
          </View>
        )}

        {/* ── Instructions ── */}
        {!reverseInfo && (
          <View style={styles.hintBox}>
            <Ionicons name="information-circle-outline" size={16} color="#888" />
            <Text style={styles.hintText}>
              Search a place or tap anywhere on the map to drop a pin. Drag the pin to fine-tune.
            </Text>
          </View>
        )}

        {/* ── Confirm button ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!markerCoord && !reverseInfo) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={confirmLoading || (!markerCoord && !reverseInfo)}
            activeOpacity={0.85}
          >
            {confirmLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={22} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.confirmBtnText}>Use This Location</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
  },
  closeBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },

  // Search
  searchWrapper: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    zIndex: 100,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 6,
    borderWidth: 1.5,
    borderColor: '#E8F5E9',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#212121',
    paddingVertical: 0,
  },
  dropdown: {
    position: 'absolute',
    top: 70,
    left: 12,
    right: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
    zIndex: 200,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownText: {
    flex: 1,
    fontSize: 13.5,
    color: '#333',
    lineHeight: 19,
  },

  // Map
  mapContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  myLocationBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 30,
    width: 46,
    height: 46,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
  },

  // Preview card
  previewCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F1F8E9',
    borderTopWidth: 1,
    borderTopColor: '#C8E6C9',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  previewCity: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
    marginBottom: 2,
  },
  previewAddress: {
    fontSize: 12,
    color: '#555',
    lineHeight: 17,
  },
  previewPincode: {
    fontSize: 12,
    color: '#777',
    marginTop: 3,
  },

  // Hint
  hintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  hintText: {
    flex: 1,
    fontSize: 12.5,
    color: '#888',
    lineHeight: 18,
  },

  // Footer
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E8F5E9',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#43A047',
    borderRadius: 14,
    paddingVertical: 16,
    elevation: 3,
    shadowColor: '#43A047',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  confirmBtnDisabled: {
    backgroundColor: '#A5D6A7',
    elevation: 0,
    shadowOpacity: 0,
  },
  confirmBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
