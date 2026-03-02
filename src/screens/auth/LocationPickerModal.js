/**
 * LocationPickerModal.js
 *
 * Fully in-app map picker using WebView + Leaflet.js + OpenStreetMap tiles.
 * Zero Google dependency — no API key required, no external app opened.
 *
 * Communication:
 *   RN  → WebView  : webRef.current.injectJavaScript(...)
 *   WebView → RN   : window.ReactNativeWebView.postMessage(JSON)
 *
 * Props:
 *   visible    {boolean}
 *   onClose    {() => void}
 *   onConfirm  {(fields) => void}   fields: { address, city, pincode, zone, state, district }
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Leaflet HTML page (fully self-contained) ─────────────────────────────────
const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"/>
<title>Map</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>
*{margin:0;padding:0;box-sizing:border-box;}
html,body{height:100%;width:100%;overflow:hidden;font-family:-apple-system,sans-serif;}
#map{position:absolute;top:0;left:0;right:0;bottom:0;}

/* Search bar */
#topBar{position:absolute;top:10px;left:10px;right:10px;z-index:1000;display:flex;gap:8px;}
#q{flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid #C8E6C9;
background:#fff;font-size:15px;outline:none;
box-shadow:0 2px 8px rgba(0,0,0,0.18);}
#searchBtn{padding:10px 16px;border-radius:10px;border:none;background:#43A047;
color:#fff;font-size:15px;font-weight:700;cursor:pointer;
box-shadow:0 2px 8px rgba(67,160,71,0.4);}
#searchBtn:active{background:#2E7D32;}

/* Dropdown */
#drop{position:absolute;top:58px;left:10px;right:10px;z-index:1001;
background:#fff;border-radius:10px;
box-shadow:0 4px 16px rgba(0,0,0,0.2);
max-height:240px;overflow-y:auto;display:none;}
.ri{padding:12px 14px;font-size:13px;color:#333;
border-bottom:1px solid #f0f0f0;cursor:pointer;
display:flex;align-items:flex-start;gap:8px;}
.ri:last-child{border-bottom:none;}
.ri:active,.ri:hover{background:#F1F8E9;}
.ric{color:#43A047;flex-shrink:0;font-size:15px;}

/* Address strip */
#strip{position:absolute;bottom:0;left:0;right:0;z-index:1000;
background:#F1F8E9;border-top:1px solid #C8E6C9;
padding:10px 14px;display:none;flex-direction:column;gap:3px;}
#acity{font-size:13px;font-weight:700;color:#2E7D32;}
#afull{font-size:11px;color:#555;line-height:1.5;}
#apin{font-size:11px;color:#777;margin-top:2px;}

/* Spinner */
#spin{position:absolute;inset:0;z-index:2000;background:rgba(255,255,255,0.65);
display:flex;align-items:center;justify-content:center;}
.s{width:38px;height:38px;border:4px solid #C8E6C9;border-top-color:#43A047;
border-radius:50%;animation:sp 0.7s linear infinite;}
@keyframes sp{to{transform:rotate(360deg);}}
</style>
</head>
<body>
<div id="map"></div>
<div id="topBar"><input id="q" placeholder="Search city, area, street…" autocomplete="off"/><button id="searchBtn">🔍</button></div>
<div id="drop"></div>
<div id="strip" style="display:none"><div id="acity"></div><div id="afull"></div><div id="apin"></div></div>
<div id="spin"><div class="s"></div></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
(function(){
  var map,marker,stripH=0,debT,UA='FarmerCrate/1.0 (farmercrate@app)';
  function post(o){window.ReactNativeWebView&&window.ReactNativeWebView.postMessage(JSON.stringify(o));}
  function show(show){document.getElementById('spin').style.display=show?'flex':'none';}
  function fields(a,disp){return{address:disp||'',city:a.city||a.town||a.village||a.municipality||a.county||'',pincode:a.postcode||'',zone:a.suburb||a.neighbourhood||a.village||a.hamlet||'',state:a.state||'',district:a.state_district||a.district||a.county||''};}
  function strip(f){
    document.getElementById('acity').textContent=[f.city,f.district,f.state].filter(Boolean).join(', ');
    document.getElementById('afull').textContent=f.address;
    document.getElementById('apin').textContent=f.pincode?'📮 '+f.pincode:'';
    var s=document.getElementById('strip');
    s.style.display='flex';
    stripH=s.offsetHeight||60;
    document.getElementById('map').style.bottom=stripH+'px';
  }
  function revGeo(lat,lng){
    show(true);
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+lat+'&lon='+lng+'&addressdetails=1',{headers:{'User-Agent':UA}})
    .then(function(r){return r.json();})
    .then(function(d){
      show(false);
      if(!d||!d.address)return;
      var f=fields(d.address,d.display_name);
      strip(f);
      post({type:'reverse',fields:f,lat:lat,lng:lng});
    }).catch(function(e){show(false);post({type:'error',msg:String(e)});});
  }
  function drop(lat,lng){
    if(marker){marker.setLatLng([lat,lng]);}
    else{
      marker=L.marker([lat,lng],{draggable:true}).addTo(map);
      marker.on('dragend',function(e){var p=e.target.getLatLng();revGeo(p.lat,p.lng);});
    }
    revGeo(lat,lng);
  }
  window.addEventListener('load',function(){
    show(false);
    map=L.map('map',{center:[20.5937,78.9629],zoom:5,zoomControl:true,attributionControl:false});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,subdomains:['a','b','c']}).addTo(map);
    map.on('click',function(e){drop(e.latlng.lat,e.latlng.lng);});
    document.addEventListener('message',onRN);
    window.addEventListener('message',onRN);
  });
  function onRN(e){
    try{var m=JSON.parse(e.data);if(m.type==='flyto'){map.setView([m.lat,m.lng],14,{animate:true});drop(m.lat,m.lng);}
    }catch(_){}
  }
  window.confirmLocation=function(){
    if(!marker){post({type:'nopin'});return;}
    var p=marker.getLatLng();
    show(true);
    fetch('https://nominatim.openstreetmap.org/reverse?format=json&lat='+p.lat+'&lon='+p.lng+'&addressdetails=1',{headers:{'User-Agent':UA}})
    .then(function(r){return r.json();})
    .then(function(d){
      show(false);
      if(!d||!d.address){post({type:'nopin'});return;}
      post({type:'confirm',fields:fields(d.address,d.display_name)});
    }).catch(function(e){show(false);post({type:'error',msg:String(e)});});
  };
  function doSearch(q){
    if(!q||q.trim().length<3)return;
    show(true);
    var drop2=document.getElementById('drop');
    drop2.style.display='none';drop2.innerHTML='';
    fetch('https://nominatim.openstreetmap.org/search?format=json&q='+encodeURIComponent(q)+'&addressdetails=1&limit=7&countrycodes=in',{headers:{'User-Agent':UA}})
    .then(function(r){return r.json();})
    .then(function(items){
      show(false);
      if(!items.length){drop2.innerHTML='<div class="ri"><span style="color:#999">No results</span></div>';drop2.style.display='block';return;}
      items.forEach(function(it){
        var d=document.createElement('div');d.className='ri';
        d.innerHTML='<span class="ric">📍</span><span>'+it.display_name+'</span>';
        d.addEventListener('click',function(){
          drop2.style.display='none';
          document.getElementById('q').value=it.display_name;
          var la=parseFloat(it.lat),lo=parseFloat(it.lon);
          map.setView([la,lo],14,{animate:true});drop(la,lo);
        });
        drop2.appendChild(d);
      });
      drop2.style.display='block';
    }).catch(function(e){show(false);post({type:'error',msg:String(e)});});
  }
  document.getElementById('searchBtn').addEventListener('click',function(){doSearch(document.getElementById('q').value);});
  document.getElementById('q').addEventListener('keydown',function(e){if(e.key==='Enter'||e.keyCode===13)doSearch(this.value);});
  document.getElementById('q').addEventListener('input',function(){
    clearTimeout(debT);
    if(this.value.trim().length>=3){debT=setTimeout(function(){doSearch(document.getElementById('q').value);},700);}
    else{document.getElementById('drop').style.display='none';}
  });
  document.addEventListener('click',function(e){
    var d=document.getElementById('drop'),q=document.getElementById('q'),b=document.getElementById('searchBtn');
    if(!d.contains(e.target)&&e.target!==q&&e.target!==b)d.style.display='none';
  });
})();
</script>
</body>
</html>`;

// ─── React Native Component ───────────────────────────────────────────────────
export default function LocationPickerModal({ visible, onClose, onConfirm }) {
  const insets     = useSafeAreaInsets();
  const webRef     = useRef(null);
  const [webReady,   setWebReady]   = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (visible) { setWebReady(false); setConfirming(false); }
  }, [visible]);

  // ── Messages from WebView ─────────────────────────────────────────────────
  const handleMessage = useCallback((event) => {
    let msg;
    try { msg = JSON.parse(event.nativeEvent.data); }
    catch (e) {
      console.error('[LocationPicker] invalid JSON from WebView:', event.nativeEvent.data);
      return;
    }
    console.log('[LocationPicker]', msg.type, msg);

    if (msg.type === 'confirm') {
      setConfirming(false);
      onConfirm(msg.fields);
    } else if (msg.type === 'nopin') {
      setConfirming(false);
      Alert.alert('No pin placed', 'Search for a place or tap on the map to drop a pin first.');
    } else if (msg.type === 'error') {
      setConfirming(false);
      console.error('[LocationPicker] map error:', msg.msg);
      Alert.alert('Map error', msg.msg || 'Something went wrong.');
    }
    // 'reverse' is just a preview update — no action needed in RN
  }, [onConfirm]);

  // ── Confirm: call JS function inside WebView ──────────────────────────────
  const handleConfirm = useCallback(() => {
    if (!webReady) return;
    console.log('[LocationPicker] requesting confirm from WebView');
    setConfirming(true);
    webRef.current?.injectJavaScript('window.confirmLocation(); true;');
  }, [webReady]);

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#2E7D32" />

        {/* Header */}
        <LinearGradient colors={['#2E7D32', '#43A047']} style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}
            hitSlop={{ top: 8, left: 8, right: 8, bottom: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📍 Pick Location</Text>
          <View style={{ width: 40 }} />
        </LinearGradient>

        {/* Hint */}
        <View style={styles.hintBar}>
          <Ionicons name="information-circle-outline" size={15} color="#666" />
          <Text style={styles.hintText}>
            Search a place or tap the map to drop a pin, then press "Use This Location"
          </Text>
        </View>

        {/* Map (WebView with Leaflet) */}
        <View style={styles.mapWrapper}>
          {!webReady && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#43A047" />
              <Text style={styles.loadingText}>Loading map…</Text>
            </View>
          )}
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: LEAFLET_HTML }}
            style={styles.webView}
            javaScriptEnabled
            domStorageEnabled
            allowUniversalAccessFromFileURLs
            mixedContentMode="always"
            onLoadEnd={() => {
              setWebReady(true);
              console.log('[LocationPicker] WebView map loaded');
            }}
            onMessage={handleMessage}
            onError={(e) => {
              console.error('[LocationPicker] WebView crash:', e.nativeEvent);
              Alert.alert('Map Error', e.nativeEvent.description || 'Map failed to load.');
            }}
            onHttpError={(e) => {
              console.warn('[LocationPicker] HTTP error', e.nativeEvent.statusCode, e.nativeEvent.url);
            }}
          />
        </View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 10 }]}>
          <TouchableOpacity
            style={[styles.confirmBtn, (!webReady || confirming) && styles.confirmBtnDisabled]}
            onPress={handleConfirm}
            disabled={!webReady || confirming}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={(!webReady || confirming) ? ['#A5D6A7','#A5D6A7'] : ['#2E7D32','#43A047']}
              style={styles.confirmBtnInner}
            >
              {confirming
                ? <ActivityIndicator color="#fff" size="small" />
                : <Ionicons name="checkmark-circle-outline" size={22} color="#fff" />}
              <Text style={styles.confirmBtnText}>
                {confirming ? 'Getting address…' : 'Use This Location'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    elevation: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3,
  },
  closeBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff', letterSpacing: 0.3 },

  hintBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F9FBF9',
    borderBottomWidth: 1, borderBottomColor: '#E0E0E0',
    paddingHorizontal: 14, paddingVertical: 8,
  },
  hintText: { flex: 1, fontSize: 12, color: '#666', lineHeight: 17 },

  mapWrapper: { flex: 1, backgroundColor: '#E8F5E9' },
  webView: { flex: 1 },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10, backgroundColor: '#F1F8E9',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  loadingText: { color: '#388E3C', fontSize: 14, fontWeight: '500' },

  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 20, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: '#E8F5E9',
    elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
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
