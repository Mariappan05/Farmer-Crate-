import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import api from '../../services/api';

const HelpSupport = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSending, setIsSending] = useState(false);

  /* ── Report a Problem submit ── */
  const submitReport = async () => {
    if (!subject.trim() || !description.trim())
      return Alert.alert('Validation', 'Please fill in all fields.');
    setIsSending(true);
    try {
      await api.post('/support/contact', {
        subject: subject.trim(),
        message: description.trim(),
      });
      Alert.alert('Sent!', "Your report has been submitted. We'll respond within 24 hours.");
      setSubject('');
      setDescription('');
    } catch (e) {
      Alert.alert('Error', 'Failed to send report. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  /* ── Contact info ── */
  const contactInfo = [
    {
      icon: 'mail-outline',
      label: 'Email',
      value: 'farmercrate@support.com',
      action: () => Linking.openURL('mailto:farmercrate@support.com'),
    },
    {
      icon: 'call-outline',
      label: 'Phone',
      value: '+91 98765 43210',
      action: () => Linking.openURL('tel:+919876543210'),
    },
    {
      icon: 'time-outline',
      label: 'Working Hours',
      value: 'Mon – Sat, 9:00 AM – 6:00 PM',
      action: null,
    },
  ];

  /* ── Quick Help categories ── */
  const quickHelp = [
    { icon: 'cart-outline', label: 'Order Issues', color: '#E8F5E9', iconColor: '#1B5E20' },
    { icon: 'card-outline', label: 'Payment Help', color: '#FFF3E0', iconColor: '#E65100' },
    { icon: 'settings-outline', label: 'Account Settings', color: '#E3F2FD', iconColor: '#1565C0' },
    { icon: 'location-outline', label: 'Delivery Tracking', color: '#F3E5F5', iconColor: '#7B1FA2' },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help & Support</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Contact Information ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Contact Information</Text>
          {contactInfo.map((item, i) => (
            <TouchableOpacity
              key={i}
              disabled={!item.action}
              onPress={item.action}
              style={[
                styles.contactRow,
                i < contactInfo.length - 1 && { borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
              ]}
            >
              <View style={styles.contactIconCircle}>
                <Ionicons name={item.icon} size={20} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>{item.label}</Text>
                <Text style={styles.contactValue}>{item.value}</Text>
              </View>
              {item.action && <Ionicons name="chevron-forward" size={18} color="#bbb" />}
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Quick Help Categories ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Help</Text>
          <View style={styles.quickGrid}>
            {quickHelp.map((item, i) => (
              <TouchableOpacity key={i} style={styles.quickItem} activeOpacity={0.7}>
                <View style={[styles.quickIconCircle, { backgroundColor: item.color }]}>
                  <Ionicons name={item.icon} size={26} color={item.iconColor} />
                </View>
                <Text style={styles.quickLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── FAQ Link ── */}
        <TouchableOpacity
          style={styles.faqLink}
          onPress={() => navigation.navigate('FAQ')}
          activeOpacity={0.7}
        >
          <Ionicons name="help-circle-outline" size={22} color="#1B5E20" />
          <Text style={styles.faqLinkText}>Browse our FAQs for quick answers</Text>
          <Ionicons name="chevron-forward" size={18} color="#1B5E20" />
        </TouchableOpacity>

        {/* ── Live Chat ── */}
        <View style={styles.card}>
          <View style={styles.liveChatRow}>
            <View style={styles.liveChatIcon}>
              <Ionicons name="chatbubbles-outline" size={28} color="#4CAF50" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.liveChatTitle}>Live Chat</Text>
              <Text style={styles.liveChatSub}>Chat with our support team in real time</Text>
            </View>
            <TouchableOpacity
              style={styles.liveChatBtn}
              onPress={() => Alert.alert('Coming Soon', 'Live chat will be available in a future update.')}
            >
              <Text style={styles.liveChatBtnText}>Start</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Report a Problem ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Report a Problem</Text>

          <Text style={styles.fieldLabel}>Subject</Text>
          <TextInput
            style={styles.input}
            placeholder="Brief description of the issue"
            placeholderTextColor="#aaa"
            value={subject}
            onChangeText={setSubject}
          />

          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, { height: 120, textAlignVertical: 'top' }]}
            placeholder="Provide details so we can help faster..."
            placeholderTextColor="#aaa"
            value={description}
            onChangeText={setDescription}
            multiline
          />

          <TouchableOpacity
            style={[styles.sendBtn, isSending && { opacity: 0.7 }]}
            onPress={submitReport}
            disabled={isSending}
            activeOpacity={0.8}
          >
            {isSending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.sendBtnText}>Submit Report</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Emergency Contact ── */}
        <View style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#D32F2F' }]}>
          <View style={styles.emergencyRow}>
            <Ionicons name="warning-outline" size={24} color="#D32F2F" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.emergencyTitle}>Emergency Contact</Text>
              <Text style={styles.emergencySub}>
                For urgent issues related to food safety or order emergencies
              </Text>
              <TouchableOpacity onPress={() => Linking.openURL('tel:+911800123456')}>
                <Text style={styles.emergencyPhone}>1800-123-456 (Toll Free)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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

  /* Card */
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#1B5E20', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#1B5E20', marginBottom: 12 },

  /* Contact Info */
  contactRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  contactIconCircle: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  contactLabel: { fontSize: 13, color: '#888' },
  contactValue: { fontSize: 14, fontWeight: '600', color: '#333', marginTop: 2 },

  /* Quick Help */
  quickGrid: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
  },
  quickItem: {
    width: '48%', alignItems: 'center', paddingVertical: 16,
    backgroundColor: '#fafafa', borderRadius: 14, marginBottom: 10,
  },
  quickIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  quickLabel: { fontSize: 13, fontWeight: '600', color: '#333' },

  /* FAQ Link */
  faqLink: {
    backgroundColor: '#E8F5E9', borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', padding: 14, gap: 10, marginBottom: 14,
  },
  faqLinkText: { flex: 1, fontSize: 14, color: '#1B5E20', fontWeight: '500' },

  /* Live Chat */
  liveChatRow: { flexDirection: 'row', alignItems: 'center' },
  liveChatIcon: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  liveChatTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  liveChatSub: { fontSize: 12, color: '#888', marginTop: 2 },
  liveChatBtn: {
    backgroundColor: '#4CAF50', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 8,
  },
  liveChatBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  /* Report Form */
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  input: {
    backgroundColor: '#f8f8f8', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 14, color: '#333', borderWidth: 1, borderColor: '#e8e8e8', marginBottom: 14,
  },
  sendBtn: { backgroundColor: '#1B5E20', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  /* Emergency */
  emergencyRow: { flexDirection: 'row', alignItems: 'flex-start' },
  emergencyTitle: { fontSize: 15, fontWeight: 'bold', color: '#D32F2F' },
  emergencySub: { fontSize: 13, color: '#666', marginTop: 4, lineHeight: 19 },
  emergencyPhone: { fontSize: 15, fontWeight: 'bold', color: '#D32F2F', marginTop: 8 },
});

export default HelpSupport;
