/**
 * LocationPickerModal.js
 *
 * Interactive tile-based map using OpenStreetMap tiles + pure React Native Image
 * components. Zero native map modules needed — works with the existing dev-client
 * APK without any rebuild.
 *
 * Features:
 *  - Real OpenStreetMap tiles rendered as a grid of <Image> components
 *  - Tap on map to drop a pin + reverse geocode via Nominatim
 *  - Zoom In / Zoom Out buttons
 *  - GPS detect via expo-location
 *  - Nominatim search (debounced, India-restricted)
 *  - Address preview card + confirm fills all 6 fields
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}
 *     fields = { address, city, pincode, zone, state, district }
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Pressable, Image,
  StyleSheet, Modal, ActivityIndicator, StatusBar,
  Keyboard, Platform, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import axios from 'axios';

const { width: SW } = Dimensions.get('window');

const NOM  = 'https://nominatim.openstreetmap.org';
const NHDR = { 'User-Agent': 'FarmerCrate/1.0 (contact@farmercrate.app)', Accept: 'application/json' };

// ESRI World Street Map — free, no API key, no User-Agent restriction, reliable CDN
const ESRI_TILE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile';

const TILE_SIZE  = 256;   // OSM tile pixel size
const GRID_SIZE  = 5;     // render a GRID_SIZE × GRID_SIZE tile grid
const HALF_GRID  = Math.floor(GRID_SIZE / 2); // 2

const DEFAULT_LAT  = 20.5937;   // geographic centre of India
const DEFAULT_LON  = 78.9629;
const DEFAULT_ZOOM = 5;         // overview of India on first open
const SEARCH_ZOOM  = 15;        // street-level after GPS / search

// ── OSM tile math ─────────────────────────────────────────────────────────────

/** Convert lat/lon to fractional tile coordinates at a given zoom level */
function latLonToFrac(lat, lon, zoom) {
  const n = Math.pow(2, zoom);
  const fx = (lon + 180) / 360 * n;
  const sinLat = Math.sin(lat * Math.PI / 180);
  const fy = (1 - Math.log((1 + sinLat) / (1 - sinLat)) / (2 * Math.PI)) / 2 * n;
  return { fx, fy };
}

/** Convert fractional tile coordinates back to lat/lon */
function fracToLatLon(fx, fy, zoom) {
  const n = Math.pow(2, zoom);
  const lon = fx / n * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * fy / n)));
  return { lat: latRad * 180 / Math.PI, lon };
}

/** Return an ESRI World Street Map tile URL (note: ESRI uses z/y/x order) */
function tileUrl(tx, ty, zoom) {
  return `${ESRI_TILE}/${zoom}/${ty}/${tx}`;
}

// ── Parse Nominatim response ──────────────────────────────────────────────────

function parseAddr(addr, displayName) {
  const zone =
    addr.suburb        || addr.neighbourhood || addr.quarter  ||
    addr.locality      || addr.residential   || addr.hamlet   ||
    addr.village       || addr.road          || addr.town     || '';
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
  const debRef = useRef(null);

  // Map state
  const [zoom,      setZoom]      = useState(DEFAULT_ZOOM);
  const [centerLat, setCenterLat] = useState(DEFAULT_LAT);
  const [centerLon, setCenterLon] = useState(DEFAULT_LON);
  const [mapSize,   setMapSize]   = useState({ w: SW, h: 320 });
  const mapInfoRef  = useRef({});   // keeps grid offsets for the tap handler

  // UI state
  const [query,          setQuery]          = useState('');
  const [results,        setResults]        = useState([]);
  const [searching,      setSearching]      = useState(false);
  const [gpsLoading,     setGpsLoading]     = useState(false);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [selected,       setSelected]       = useState(null);
  const [showResults,    setShowResults]    = useState(false);

  // Reset on open
  useEffect(() => {
    if (visible) {
      setZoom(DEFAULT_ZOOM);
      setCenterLat(DEFAULT_LAT);
      setCenterLon(DEFAULT_LON);
      setQuery('');
      setResults([]);
      setSelected(null);
      setShowResults(false);
    }
  }, [visible]);

  // ── Build tile grid ─────────────────────────────────────────────────────────
  const { fx, fy }    = latLonToFrac(centerLat, centerLon, zoom);
  const centerTileX   = Math.floor(fx);
  const centerTileY   = Math.floor(fy);
  const { w: cW, h: cH } = mapSize;
  const offsetPxX     = (fx - centerTileX) * TILE_SIZE;
  const offsetPxY     = (fy - centerTileY) * TILE_SIZE;
  const gridLeft      = cW / 2 - offsetPxX - HALF_GRID * TILE_SIZE;
  const gridTop       = cH / 2 - offsetPxY - HALF_GRID * TILE_SIZE;

  // Store in ref so tap handler always has latest values (no closure staleness)
  mapInfoRef.current = { gridLeft, gridTop, zoom, centerTileX, centerTileY };

  const tileImages = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const tx = centerTileX - HALF_GRID + col;
      const ty = centerTileY - HALF_GRID + row;
      if (tx < 0 || ty < 0) continue;
      tileImages.push(
        <Image
          key={`${zoom}-${tx}-${ty}`}
          source={{ uri: tileUrl(tx, ty, zoom) }}
          style={{
            position: 'absolute',
            left: gridLeft + col * TILE_SIZE,
            top:  gridTop  + row * TILE_SIZE,
            width:  TILE_SIZE,
            height: TILE_SIZE,
          }}
          fadeDuration={150}
        />,
      );
    }
  }

  // ── Reverse geocode ─────────────────────────────────────────────────────────
  const reverseGeocode = useCallback(async (lat, lon, source) => {
    console.log(`[LocationPicker] Reverse geocoding (${source}): ${lat}, ${lon}`);
    setReverseLoading(true);
    try {
      const res = await axios.get(`${NOM}/reverse`, {
        params: { format: 'json', lat, lon, addressdetails: 1 },
        headers: NHDR, timeout: 10000,
      });
      if (res.data?.address) {
        const fields = parseAddr(res.data.address, res.data.display_name);
        console.log('[LocationPicker] Fields — city:', fields.city, '| zone:', fields.zone, '| district:', fields.district);
        setSelected(fields);
        setQuery(res.data.display_name || '');
      } else {
        console.warn('[LocationPicker] No address data returned');
      }
    } catch (err) {
      console.error('[LocationPicker] Reverse geocode error:', err?.message);
    } finally {
      setReverseLoading(false);
    }
  }, []);

  // ── Tap on map ──────────────────────────────────────────────────────────────
  const handleMapPress = useCallback((e) => {
    const { locationX, locationY } = e.nativeEvent;
    const { gridLeft, gridTop, zoom, centerTileX, centerTileY } = mapInfoRef.current;
    // Convert screen tap → absolute fractional tile coordinates (world-tile space)
    // gridLeft is the screen-x of tile column (centerTileX - HALF_GRID)
    const tappedFx = (centerTileX - HALF_GRID) + (locationX - gridLeft) / TILE_SIZE;
    const tappedFy = (centerTileY - HALF_GRID) + (locationY - gridTop)  / TILE_SIZE;
    const { lat, lon } = fracToLatLon(tappedFx, tappedFy, zoom);
    console.log('[LocationPicker] Map tapped → lat:', lat.toFixed(5), 'lon:', lon.toFixed(5));
    setCenterLat(lat);
    setCenterLon(lon);
    setShowResults(false);
    Keyboard.dismiss();
    reverseGeocode(lat, lon, 'tap');
  }, [reverseGeocode]);

  // ── Zoom ────────────────────────────────────────────────────────────────────
  const zoomIn  = useCallback(() => setZoom(z => Math.min(z + 1, 18)), []);
  const zoomOut = useCallback(() => setZoom(z => Math.max(z - 1, 3)),  []);

  // ── Nominatim search ────────────────────────────────────────────────────────
  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 3) { setResults([]); setShowResults(false); return; }
    setSearching(true);
    console.log('[LocationPicker] Searching:', q.trim());
    try {
      const res = await axios.get(`${NOM}/search`, {
        params: { format: 'json', q: q.trim(), addressdetails: 1, limit: 6, countrycodes: 'in' },
        headers: NHDR, timeout: 10000,
      });
      console.log('[LocationPicker] Search results:', res.data?.length);
      setResults(res.data || []);
      setShowResults(true);
    } catch (err) {
      console.error('[LocationPicker] Search error:', err?.message);
      setResults([]); setShowResults(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleQueryChange = useCallback((text) => {
    setQuery(text);
    setShowResults(false);
    if (debRef.current) clearTimeout(debRef.current);
    if (text.trim().length >= 3) debRef.current = setTimeout(() => doSearch(text), 600);
    else setResults([]);
  }, [doSearch]);

  // ── Select search result ────────────────────────────────────────────────────
  const handleSelectResult = useCallback((item) => {
    Keyboard.dismiss();
    setShowResults(false);
    const lat = parseFloat(item.lat);
    const lon = parseFloat(item.lon);
    setCenterLat(lat);
    setCenterLon(lon);
    setZoom(SEARCH_ZOOM);
    const fields = parseAddr(item.address || {}, item.display_name);
    setSelected(fields);
    setQuery(item.display_name);
    console.log('[LocationPicker] Search selected:', fields.city);
  }, []);

  // ── GPS ─────────────────────────────────────────────────────────────────────
  const handleGPS = useCallback(async () => {
    console.log('[LocationPicker] GPS button pressed');
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      console.log('[LocationPicker] Location permission:', status);
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is required.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;
      console.log('[LocationPicker] GPS coords:', latitude, longitude);
      setCenterLat(latitude);
      setCenterLon(longitude);
      setZoom(SEARCH_ZOOM);
      await reverseGeocode(latitude, longitude, 'gps');
    } catch (err) {
      console.error('[LocationPicker] GPS error:', err?.message, err?.code);
      Alert.alert('GPS Error', err?.message || 'Could not detect location. Check permissions.');
    } finally {
      setGpsLoading(false);
    }
  }, [reverseGeocode]);

  // ── Confirm ─────────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!selected) {
      Alert.alert('No location', 'Tap on the map, search, or use GPS to pick a location.');
      return;
    }
    console.log('[LocationPicker] Confirming:', selected);
    onConfirm(selected);
  }, [selected, onConfirm]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* ── Header ── */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 10, left: 10, right: 10, bottom: 10 }}
          >
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pick Location</Text>
          <View style={{ width: 24 }} />
        </LinearGradient>

        {/* ── Search row ── */}
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
              onSubmitEditing={() => { if (debRef.current) clearTimeout(debRef.current); doSearch(query); }}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searching
              ? <ActivityIndicator size="small" color="#43A047" />
              : query.length > 0
                ? (
                  <TouchableOpacity onPress={() => {
                    setQuery(''); setResults([]); setShowResults(false);
                  }}>
                    <Ionicons name="close-circle" size={18} color="#bbb" />
                  </TouchableOpacity>
                )
                : null}
          </View>
          <TouchableOpacity style={styles.gpsBtn} onPress={handleGPS} disabled={gpsLoading}>
            {gpsLoading
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="locate" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* ── Search dropdown (floats over map) ── */}
        {showResults && results.length > 0 && (
          <View style={styles.dropdown}>
            {results.map((item, idx) => {
              const parts = item.display_name.split(',');
              const main  = parts.slice(0, 2).join(',').trim();
              const sub   = parts.slice(2, 4).join(',').trim();
              return (
                <TouchableOpacity
                  key={String(idx)}
                  style={[styles.resultRow, idx > 0 && styles.resultBorder]}
                  onPress={() => handleSelectResult(item)}
                  activeOpacity={0.72}
                >
                  <View style={styles.resultIcon}>
                    <Ionicons name="location-outline" size={16} color="#43A047" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resultMain} numberOfLines={1}>{main}</Text>
                    {sub ? <Text style={styles.resultSub} numberOfLines={1}>{sub}</Text> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ══ MAP ══ */}
        <View
          style={styles.mapContainer}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setMapSize({ w: width, h: height });
          }}
        >
          {/* OSM tile images */}
          {tileImages}

          {/* Tile attribution */}
          <View style={styles.attribution} pointerEvents="none">
            <Text style={styles.attributionText}>© Esri | © OSM contributors</Text>
          </View>

          {/* Centre pin — always in the middle of the container */}
          <View style={styles.centerPinWrap} pointerEvents="none">
            <Ionicons name="location" size={42} color="#E53935" />
            <View style={styles.pinDot} />
          </View>

          {/* Zoom controls */}
          <View style={styles.zoomControls}>
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomIn} activeOpacity={0.8}>
              <Ionicons name="add" size={22} color="#333" />
            </TouchableOpacity>
            <View style={styles.zoomDivider} />
            <TouchableOpacity style={styles.zoomBtn} onPress={zoomOut} activeOpacity={0.8}>
              <Ionicons name="remove" size={22} color="#333" />
            </TouchableOpacity>
          </View>

          {/* Reverse-geocoding spinner */}
          {reverseLoading && (
            <View style={styles.reverseSpinner} pointerEvents="none">
              <ActivityIndicator size="small" color="#2E7D32" />
            </View>
          )}

          {/* "Tap to pin" hint when nothing selected yet */}
          {!selected && !reverseLoading && (
            <View style={styles.tapHint} pointerEvents="none">
              <View style={styles.tapHintBubble}>
                <Ionicons name="hand-left-outline" size={15} color="#fff" />
                <Text style={styles.tapHintText}>Tap anywhere on the map</Text>
              </View>
            </View>
          )}

          {/* Transparent Pressable to catch taps on the map */}
          <Pressable style={StyleSheet.absoluteFill} onPress={handleMapPress} />
        </View>

        {/* ── Footer ── */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          {selected ? (
            <View style={styles.addrCard}>
              <Ionicons name="location" size={16} color="#2E7D32" style={{ marginRight: 8, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.addrCity} numberOfLines={1}>
                  {[selected.city, selected.district].filter(Boolean).join(', ') || 'Selected spot'}
                </Text>
                <Text style={styles.addrFull} numberOfLines={2}>{selected.address}</Text>
                {selected.pincode ? (
                  <View style={styles.chipRow}>
                    {selected.pincode ? <View style={styles.chip}><Text style={styles.chipText}>{selected.pincode}</Text></View> : null}
                    {selected.state   ? <View style={styles.chip}><Text style={styles.chipText}>{selected.state}</Text></View>   : null}
                  </View>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.noSelCard}>
              <Ionicons name="map-outline" size={16} color="#aaa" />
              <Text style={styles.noSelText}>Tap on the map, search, or use GPS</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.confirmBtn, !selected && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!selected || reverseLoading}
            activeOpacity={0.88}
          >
            <LinearGradient
              colors={selected ? ['#2E7D32', '#43A047'] : ['#9E9E9E', '#9E9E9E']}
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
const SEARCH_H = 58;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    height: HEADER_H,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16,
    elevation: 5,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },

  // Search row
  searchWrapper: {
    height: SEARCH_H,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: '#fff',
    elevation: 3, zIndex: 10,
    borderBottomWidth: 1, borderBottomColor: '#E8F5E9',
  },
  searchBar: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1, borderColor: '#C8E6C9', marginRight: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1A1A1A', paddingVertical: 0 },
  gpsBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#2E7D32',
    alignItems: 'center', justifyContent: 'center',
    elevation: 3,
  },

  // Dropdown
  dropdown: {
    position: 'absolute',
    top: HEADER_H + SEARCH_H,
    left: 10, right: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1, borderColor: '#E0E0E0',
    elevation: 25, zIndex: 100,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8,
    overflow: 'hidden',
  },
  resultRow:    { flexDirection: 'row', alignItems: 'center', padding: 12 },
  resultBorder: { borderTopWidth: 1, borderTopColor: '#F0F0F0' },
  resultIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center',
    marginRight: 10, flexShrink: 0,
  },
  resultMain: { fontSize: 13, fontWeight: '600', color: '#1A1A1A' },
  resultSub:  { fontSize: 11, color: '#888', marginTop: 1 },

  // Map
  mapContainer: {
    flex: 1,
    backgroundColor: '#E8EAE9',
    overflow: 'hidden',
  },

  // Centre pin
  centerPinWrap: {
    position: 'absolute',
    top: '50%', left: '50%',
    transform: [{ translateX: -21 }, { translateY: -42 }],
    alignItems: 'center',
  },
  pinDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: 'rgba(229,57,53,0.4)',
    marginTop: -2,
  },

  // Zoom controls
  zoomControls: {
    position: 'absolute', right: 12, bottom: 40,
    backgroundColor: '#fff', borderRadius: 8,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  zoomBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  zoomDivider: { height: 1, backgroundColor: '#E0E0E0' },

  // Attribution
  attribution: {
    position: 'absolute', bottom: 4, left: 6,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2,
  },
  attributionText: { fontSize: 9, color: '#555' },

  // Reverse spinner
  reverseSpinner: {
    position: 'absolute', top: 10, right: 60,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 8, padding: 7, elevation: 4,
  },

  // Tap hint
  tapHint: {
    position: 'absolute', bottom: 50, left: 0, right: 0,
    alignItems: 'center',
  },
  tapHintBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.52)',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
  },
  tapHintText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Footer
  footer: {
    backgroundColor: '#fff', paddingHorizontal: 14, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 12,
  },
  addrCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#F1F8E9', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#C5E1A5',
  },
  addrCity: { fontSize: 14, fontWeight: '700', color: '#1B5E20', marginBottom: 2 },
  addrFull: { fontSize: 12, color: '#555', lineHeight: 17 },
  chipRow:  { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  chip:     { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 11, color: '#2E7D32', fontWeight: '600' },

  noSelCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#FAFAFA', borderRadius: 12,
    padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: '#EEEEEE',
  },
  noSelText: { fontSize: 13, color: '#aaa' },

  confirmBtn:         { borderRadius: 12, overflow: 'hidden' },
  confirmBtnDisabled: { opacity: 0.55 },
  confirmBtnInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 15, gap: 8,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
});
