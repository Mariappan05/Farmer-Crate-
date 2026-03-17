import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const APP_VERSION = '1.0.0';

const FEATURES = [
  { icon: 'leaf-outline', label: 'Fresh Produce', desc: 'Farm-fresh fruits, vegetables & more delivered to you' },
  { icon: 'storefront-outline', label: 'Direct from Farms', desc: 'Buy directly from verified local farmers' },
  { icon: 'shield-checkmark-outline', label: 'Secure Payments', desc: 'Safe and encrypted payment processing' },
  { icon: 'rocket-outline', label: 'Fast Delivery', desc: 'Quick and reliable doorstep delivery' },
  { icon: 'ribbon-outline', label: 'Quality Assured', desc: 'Rigorous quality checks on all products' },
];

const AppInfo = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>App Info</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Logo & App Identity */}
        <View style={styles.appHeader}>
          <View style={styles.logoCircle}>
            <MaterialCommunityIcons name="sprout" size={44} color="#fff" />
          </View>
          <Text style={styles.appName}>Farmer Crate</Text>
          <View style={styles.versionBadge}>
            <Text style={styles.versionText}>Version {APP_VERSION}</Text>
          </View>
          <Text style={styles.appTagline}>
            Connecting farmers directly with customers for fresh, affordable, and quality produce.
          </Text>
        </View>

        {/* Description */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About Farmer Crate</Text>
          <Text style={styles.aboutText}>
            Farmer Crate is a platform that bridges the gap between farmers and consumers. We eliminate middlemen to ensure farmers receive fair prices and customers enjoy the freshest produce delivered straight from the farm to their doorstep.
          </Text>
          <Text style={[styles.aboutText, { marginTop: 10 }]}>
            Our mission is to empower local farming communities, promote sustainable agriculture, and make wholesome food accessible to everyone.
          </Text>
        </View>

        {/* Features */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Features</Text>
          {FEATURES.map((feat, i) => (
            <View key={i} style={[styles.featureRow, i < FEATURES.length - 1 && styles.featureRowBorder]}>
              <View style={styles.featureIconCircle}>
                <Ionicons name={feat.icon} size={22} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureLabel}>{feat.label}</Text>
                <Text style={styles.featureDesc}>{feat.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Developer Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Developer Information</Text>
          <View style={styles.devRow}>
            <Ionicons name="people-outline" size={18} color="#1B5E20" />
            <Text style={styles.devLabel}>Team</Text>
            <Text style={styles.devValue}>Farmer Crate Dev Team</Text>
          </View>
          <View style={styles.devRow}>
            <Ionicons name="code-slash-outline" size={18} color="#1B5E20" />
            <Text style={styles.devLabel}>Platform</Text>
            <Text style={styles.devValue}>React Native (Expo)</Text>
          </View>
          <View style={styles.devRow}>
            <Ionicons name="server-outline" size={18} color="#1B5E20" />
            <Text style={styles.devLabel}>Backend</Text>
            <Text style={styles.devValue}>Node.js / Express</Text>
          </View>
          <View style={[styles.devRow, { borderBottomWidth: 0 }]}>
            <Ionicons name="mail-outline" size={18} color="#1B5E20" />
            <Text style={styles.devLabel}>Contact</Text>
            <Text style={styles.devValue}>dev@farmercrate.in</Text>
          </View>
        </View>

        {/* Legal Links */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Legal</Text>
          <TouchableOpacity
            style={styles.legalRow}
            onPress={() => Linking.openURL('https://farmercrate.in/privacy')}
          >
            <Ionicons name="document-text-outline" size={20} color="#1B5E20" />
            <Text style={styles.legalText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color="#1B5E20" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.legalRow, { borderBottomWidth: 0 }]}
            onPress={() => Linking.openURL('https://farmercrate.in/terms')}
          >
            <Ionicons name="receipt-outline" size={20} color="#1B5E20" />
            <Text style={styles.legalText}>Terms of Service</Text>
            <Ionicons name="open-outline" size={16} color="#1B5E20" />
          </TouchableOpacity>
        </View>

        <Text style={styles.copyright}>© 2025 Farmer Crate. All rights reserved.</Text>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f8e9' },
  header: {
    backgroundColor: '#1B5E20', paddingHorizontal: 16, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },

  /* Logo / Identity */
  appHeader: { alignItems: 'center', paddingVertical: 28 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45, backgroundColor: '#1B5E20',
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  appName: { fontSize: 28, fontWeight: 'bold', color: '#1B5E20', marginBottom: 8 },
  versionBadge: { backgroundColor: '#E8F5E9', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, marginBottom: 14 },
  versionText: { fontSize: 13, fontWeight: '600', color: '#388E3C' },
  appTagline: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 21, paddingHorizontal: 20 },

  /* Cards */
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#888', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  aboutText: { fontSize: 14, color: '#555', lineHeight: 22 },

  /* Features */
  featureRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  featureRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  featureIconCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  featureLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  featureDesc: { fontSize: 12, color: '#888', marginTop: 2 },

  /* Developer Info */
  devRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5',
  },
  devLabel: { flex: 1, fontSize: 14, color: '#555' },
  devValue: { fontSize: 14, fontWeight: '600', color: '#333' },

  /* Legal */
  legalRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingVertical: 14,
  },
  legalText: { flex: 1, fontSize: 14, color: '#333' },

  copyright: { fontSize: 12, color: '#aaa', textAlign: 'center', marginTop: 10 },
});

export default AppInfo;
