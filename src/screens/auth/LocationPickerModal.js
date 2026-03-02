/**
 * LocationPickerModal.js
 *
 * Full-screen map picker using react-native-maps (Google Maps, PROVIDER_GOOGLE).
 * Requires a valid com.google.android.geo.API_KEY in AndroidManifest.xml.
 *
 * Features:
 *  - Google MapView with draggable pin
 *  - Search bar using Nominatim (OpenStreetMap) — no extra API key needed
 *  - "Detect my location" via expo-location
 *  - Address preview card with all 6 fields
 *  - Confirm fills: address, city, pincode, zone, state, district
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Modal, ActivityIndicator, StatusBar, FlatList, Alert,
  Keyboard, Platform, Dimensions,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';

const { height: SCREEN_H } = Dimensions.get('window');

const NOM = 'https://nominatim.openstreetmap.org';
const NOM_HDR = { 'User-Agent': 'FarmerCrate/1.0 (farmercrate@app)', Accept: 'application/json' };

const DEFAULT_REGION = {
  latitude: 20.5937, longitude: 78.9629,
  latitudeDelta: 15, longitudeDelta: 15,
};

// ── Parse Nominatim address object into form fields ───────────────────────────
function parseAddr(addr, displayName) {
  // Zone: try progressively broader locality identifiers used by Nominatim for Indian addresses
  const zone =
    addr.suburb       ||
    addr.neighbourhood||
    addr.quarter      ||
    addr.locality     ||
    addr.residential  ||
    addr.hamlet       ||
    addr.village      ||
    addr.road         ||
    addr.town         ||
    '';

  return {
    address:  displayName || '',
    city:     addr.city || addr.town || addr.village || addr.municipality || addr.county || '',
    pincode:  addr.postcode || '',
    zone,
    state:    addr.state || '',
    district: addr.state_district || addr.district || addr.county || '',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
export default function LocationPickerModal({ visible, onClose, onConfirm }) {
  const insets = useSafeAreaInsets();
  const mapRef = useRef(null);
  const debRef = useRef(null);

  // State
  const [region,          setRegion]          = useState(DEFAULT_REGION);
  const [markerCoord,     setMarkerCoord]     = useState(null);
  const [selected,        setSelected]        = useState(null);
  const [query,           setQuery]           = useState('');
  const [results,         setResults]         = useState([]);
  const [searchLoading,   setSearchLoading]   = useState(false);
  const [showResults,     setShowResults]     = useState(false);
  const [gpsLoading,      setGpsLoading]      = useState(false);
  const [reverseLoading,  setReverseLoading]  = useState(false);

  // Reset when modal opens
  useEffect(() => {
    if (visible) {
      setRegion(DEFAULT_REGION);
      setMarkerCoord(null);
      setSelected(null);
      setQuery('');
      setResults([]);
      setShowResults(false);
    }
  }, [visible]);

  // ── Reverse geocode ───────────────────────────────────────────────────────
  const reverseGeocode = useCallback(async (lat, lon, source = 'map') => {
    console.log(`[LocationPicker] Reverse geocoding (${source}):`, lat, lon);
    setReverseLoading(true);
    try {
      const res = await axios.get(`${NOM}/reverse`, {
        params: { format: 'json', lat, lon, addressdetails: 1 },
        headers: NOM_HDR,
        timeout: 10000,
      });
      console.log('[LocationPicker] Reverse result:', res.data?.display_name);
      if (res.data?.address) {
        const fields = parseAddr(res.data.address, res.data.display_name);
        setSelected(fields);
        setQuery(res.data.display_name || '');
      } else {
        console.warn('[LocationPicker] No address returned from reverse geocode');
      }
    } catch (err) {
      console.error('[LocationPicker] Reverse geocode error:', err?.message);
    } finally {
      setReverseLoading(false);
    }
  }, []);

  // ── Tap on map → drop pin ─────────────────────────────────────────────────
  const handleMapPress = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    console.log('[LocationPicker] Map tapped:', latitude, longitude);
    setMarkerCoord({ latitude, longitude });
    setShowResults(false);
    Keyboard.dismiss();
    reverseGeocode(latitude, longitude, 'tap');
  }, [reverseGeocode]);

  // ── Drag pin end ──────────────────────────────────────────────────────────
  const handleMarkerDragEnd = useCallback((e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    console.log('[LocationPicker] Marker dragged to:', latitude, longitude);
    setMarkerCoord({ latitude, longitude });
    reverseGeocode(latitude, longitude, 'drag');
  }, [reverseGeocode]);

  // ── Nominatim search ──────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 3) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setSearchLoading(true);
    console.log('[LocationPicker] Searching for:', q);
    try {
      const res = await axios.get(`${NOM}/search`, {
        params: { format: 'json', q: q.trim(), addressdetails: 1, limit: 7, countrycodes: 'in' },
        headers: NOM_HDR,
        timeout: 10000,
      });
      console.log('[LocationPicker] Search results count:', res.data?.length);
      setResults(res.data || []);
      setShowResults(true);
    } catch (err) {
      console.error('[LocationPicker] Search error:', err?.message);
      setResults([]);
      setShowResults(false);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    setShowResults(false);
    if (debRef.current) clearTimeout(debRef.current);
    if (text.trim().length >= 3) {
      debRef.current = setTimeout(() => doSearch(text), 600);
    } else {
      setResults([]);
    }
  }, [doSearch]);

  // ── Select search result → pan map ───────────────────────────────────────
  const handleSelectResult = useCallback((item) => {
    Keyboard.dismiss();
    setShowResults(false);
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    const coord = { latitude: lat, longitude: lon };
    setMarkerCoord(coord);
    const newRegion = { latitude: lat, longitude: lon, latitudeDelta: 0.05, longitudeDelta: 0.05 };
    setRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 600);
    const fields = parseAddr(item.address || {}, item.display_name);
    setSelected(fields);
    setQuery(item.display_name);
  }, []);

  // ── GPS button ────────────────────────────────────────────────────────────
  const handleGPS = useCallback(async () => {
    console.log('[LocationPicker] GPS button pressed');
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[LocationPicker] Permission:', status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required to detect your position.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      console.log('[LocationPicker] GPS coords:', latitude, longitude);
      const coord = { latitude, longitude };
      setMarkerCoord(coord);
      const newRegion = { latitude, longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      setRegion(newRegion);
      mapRef.current?.animateToRegion(newRegion, 600);
      await reverseGeocode(latitude, longitude, 'gps');
    } catch (err) {
      console.error('[LocationPicker] GPS error:', err?.message, err?.code);
      Alert.alert('GPS Error', err?.message || 'Could not detect location. Please try again.');
    } finally {
      setGpsLoading(false);
    }
  }, [reverseGeocode]);

  // ── Confirm ───────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!selected) {
      Alert.alert('No location', 'Tap on the map or search to select a location.');
      return;
    }
    console.log('[LocationPicker] Confirming selection:', selected);
    onConfirm(selected);
  }, [selected, onConfirm]);

  // ── Render search result row ──────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const parts = item.display_name.split(',');
    const main  = parts.slice(0, 2).join(',').trim();
    const sub   = parts.slice(2, 4).join(',').trim();
    return (
      <TouchableOpacity
        style={styles.resultRow}
        onPress={() => handleSelectResult(item)}
        activeOpacity={0.75}
      >
        <Ionicons name="location-outline" size={18} color="#43A047" style={{ marginRight: 10 }} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resultMain} numberOfLines={1}>{main}</Text>
          {sub ? <Text style={styles.resultSub} numberOfLines={1}>{sub}</Text> : null}
        </View>
      </TouchableOpacity>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* ── Header ── */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        {/* ── Search bar row ── */}
        <View style={styles.searchWrapper}>
          <View style={styles.searchBar}>
            <Ionicons name="search-outline" size={18} color="#666" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search city, area, pincode…"
              placeholderTextColor="#999"
              value={query}
              onChangeText={handleQueryChange}
              returnKeyType="search"
              onSubmitEditing={() => doSearch(query)}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchLoading
              ? <ActivityIndicator size="small" color="#43A047" />
              : query.length > 0
                ? <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setShowResults(false); }}>
                    <Ionicons name="close-circle" size={18} color="#bbb" />
                  </TouchableOpacity>
                : null}
          </View>

          {/* GPS icon button */}
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleGPS}
            disabled={gpsLoading}
            activeOpacity={0.85}
          >
            {gpsLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="locate" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* ── Search dropdown (absolute, floats over map) ── */}
        {showResults && results.length > 0 && (
          <View style={styles.dropdown}>
            <FlatList
              data={results}
              keyExtractor={(_, i) => String(i)}
              renderItem={renderItem}
              keyboardShouldPersistTaps="handled"
              ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: '#F0F0F0' }} />}
              style={{ maxHeight: 240 }}
            />
          </View>
        )}

        {/* ── Map ── */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            provider={PROVIDER_GOOGLE}
            style={StyleSheet.absoluteFill}
            region={region}
            onPress={handleMapPress}
            showsUserLocation
            showsMyLocationButton={false}
            toolbarEnabled={false}
          >
            {markerCoord && (
              <Marker
                coordinate={markerCoord}
                draggable
                onDragEnd={handleMarkerDragEnd}
                pinColor="#2E7D32"
              />
            )}
          </MapView>

          {/* "Tap to pin" hint shown when no marker yet */}
          {!markerCoord && (
            <View style={styles.hintOverlay} pointerEvents="none">
              <View style={styles.hintBubble}>
                <Ionicons name="hand-left-outline" size={16} color="#fff" />
                <Text style={styles.hintText}>Tap on the map to drop a pin</Text>
              </View>
            </View>
          )}

          {/* Reverse-geocoding spinner (top-right of map) */}
          {reverseLoading && (
            <View style={styles.reverseSpinner} pointerEvents="none">
              <ActivityIndicator size="small" color="#2E7D32" />
            </View>
          )}
        </View>

        {/* ── Footer: address card + confirm button ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 6 }]}>
          {selected ? (
            <View style={styles.addrCard}>
              <Ionicons name="location" size={18} color="#2E7D32" style={{ marginTop: 2 }} />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.addrCity}>
                  {selected.city || selected.district || 'Unknown area'}
                </Text>
                <Text style={styles.addrFull} numberOfLines={2}>{selected.address}</Text>
                <View style={styles.addrChips}>
                  {selected.pincode ? (
                    <View style={styles.chip}><Text style={styles.chipText}>{selected.pincode}</Text></View>
                  ) : null}
                  {selected.state ? (
                    <View style={styles.chip}><Text style={styles.chipText}>{selected.state}</Text></View>
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.noSelCard}>
              <Ionicons name="location-outline" size={18} color="#aaa" />
              <Text style={styles.noSelText}>No location selected yet</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected || reverseLoading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={selected ? ['#2E7D32', '#43A047'] : ['#B0BEC5', '#B0BEC5']}
              style={styles.confirmBtnInner}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.confirmBtnText}>Use This Location</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const HEADER_H = 54;
const SEARCH_H = 62;
const FOOTER_H = 148;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    height: HEADER_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    elevation: 4,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // Search row
  searchWrapper: {
    height: SEARCH_H,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff',
    elevation: 3, zIndex: 10,
    borderBottomWidth: 1, borderBottomColor: '#E8F5E9',
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1, borderColor: '#C8E6C9',
    marginRight: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#212121', paddingVertical: 0 },
  gpsBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#2E7D32',
    alignItems: 'center', justifyContent: 'center',
    elevation: 3,
  },

  // Dropdown (floats over map)
  dropdown: {
    position: 'absolute',
    top: HEADER_H + SEARCH_H,
    left: 12, right: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E0E0',
    elevation: 20, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 6,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  resultMain: { fontSize: 14, fontWeight: '600', color: '#1A1A1A' },
  resultSub:  { fontSize: 12, color: '#777', marginTop: 2 },

  // Map area fills remaining space
  mapContainer: { flex: 1 },

  hintOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 18,
  },
  hintBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20,
  },
  hintText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  reverseSpinner: {
    position: 'absolute', top: 10, right: 10,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 8, padding: 6, elevation: 5,
  },

  // Footer
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 10,
  },
  addrCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#F1F8E9', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#C5E1A5',
  },
  addrCity: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginBottom: 2 },
  addrFull: { fontSize: 12, color: '#555', lineHeight: 17 },
  addrChips: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  chip: {
    backgroundColor: '#E8F5E9', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  chipText: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },

  noSelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAFAFA', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#EEE',
  },
  noSelText: { fontSize: 13, color: '#aaa' },

  confirmBtn:         { borderRadius: 12, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.6 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, gap: 8,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
