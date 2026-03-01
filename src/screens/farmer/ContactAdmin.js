import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StatusBar,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const SUBJECT_OPTIONS = [
  'General Inquiry',
  'Product Issue',
  'Payment Issue',
  'Account Issue',
  'Feedback',
  'Other',
];

const ContactAdmin = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { authState } = useAuth();

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [showSubjectPicker, setShowSubjectPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchTickets = useCallback(async () => {
    try {
      const { data } = await api.get('/support/tickets');
      const list = Array.isArray(data) ? data : data?.tickets || data?.data || [];
      setTickets(list.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
    } catch (_) {
      // Endpoint may not exist yet, silently fail
    } finally {
      setLoadingTickets(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchTickets(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchTickets(); };

  const handleSubmit = async () => {
    if (!subject) {
      Alert.alert('Validation', 'Please select a subject');
      return;
    }
    if (!message.trim() || message.trim().length < 10) {
      Alert.alert('Validation', 'Please enter a message (at least 10 characters)');
      return;
    }

    setSubmitting(true);
    try {
      // Try support/contact first, fallback to feedback
      let success = false;
      try {
        await api.post('/support/contact', {
          subject,
          message: message.trim(),
          user_id: authState?.userId,
        });
        success = true;
      } catch (_) {
        await api.post('/api/feedback', {
          subject,
          message: message.trim(),
          type: 'contact_admin',
        });
        success = true;
      }

      if (success) {
        Alert.alert(
          'Message Sent',
          'Your message has been sent to admin. We will get back to you shortly.',
          [{ text: 'OK' }]
        );
        setSubject('');
        setMessage('');
        fetchTickets();
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Failed to send message. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getTicketStatusColor = (status) => {
    switch ((status || '').toUpperCase()) {
      case 'OPEN':
      case 'PENDING':
        return '#FF9800';
      case 'IN_PROGRESS':
      case 'IN PROGRESS':
        return '#2196F3';
      case 'RESOLVED':
      case 'CLOSED':
        return '#4CAF50';
      default:
        return '#888';
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1B5E20" />

      <LinearGradient
        colors={['#1B5E20', '#388E3C']}
        style={[styles.header, { paddingTop: insets.top + 8 }]}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact Admin</Text>
        <View style={{ width: 36 }} />
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#4CAF50']} />}
          contentContainerStyle={{ paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Admin Contact Info */}
          <View style={styles.adminInfoCard}>
            <View style={styles.adminInfoRow}>
              <View style={styles.adminIconCircle}>
                <Ionicons name="headset-outline" size={24} color="#1B5E20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.adminInfoTitle}>FarmerCrate Support</Text>
                <Text style={styles.adminInfoSub}>We usually respond within 24 hours</Text>
              </View>
            </View>
            <View style={styles.adminContactRow}>
              <View style={styles.adminContactItem}>
                <Ionicons name="mail-outline" size={16} color="#666" />
                <Text style={styles.adminContactText}>support@farmercrate.com</Text>
              </View>
              <View style={styles.adminContactItem}>
                <Ionicons name="call-outline" size={16} color="#666" />
                <Text style={styles.adminContactText}>+91 98765 43210</Text>
              </View>
            </View>
          </View>

          {/* Contact Form */}
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Send a Message</Text>

            <Text style={styles.fieldLabel}>Subject *</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => setShowSubjectPicker(!showSubjectPicker)}
            >
              <Text style={[styles.dropdownText, !subject && { color: '#999' }]}>
                {subject || 'Select a subject'}
              </Text>
              <Ionicons
                name={showSubjectPicker ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#666"
              />
            </TouchableOpacity>
            {showSubjectPicker && (
              <View style={styles.dropdownList}>
                {SUBJECT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.dropdownItem, subject === opt && styles.dropdownItemActive]}
                    onPress={() => {
                      setSubject(opt);
                      setShowSubjectPicker(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        subject === opt && { color: '#1B5E20', fontWeight: '700' },
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput
              style={styles.textarea}
              value={message}
              onChangeText={setMessage}
              placeholder="Describe your issue or question in detail..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              maxLength={1000}
            />
            <Text style={styles.charCount}>{message.length}/1000</Text>

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.7 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={['#1B5E20', '#388E3C']}
                style={styles.submitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color="#fff" />
                    <Text style={styles.submitText}>Send Message</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Previous Tickets */}
          <View style={styles.ticketsSection}>
            <Text style={styles.ticketsTitle}>Previous Tickets</Text>

            {loadingTickets ? (
              <View style={styles.ticketsLoading}>
                <ActivityIndicator size="small" color="#4CAF50" />
              </View>
            ) : tickets.length === 0 ? (
              <View style={styles.noTickets}>
                <Ionicons name="chatbubbles-outline" size={40} color="#ccc" />
                <Text style={styles.noTicketsText}>No previous tickets</Text>
                <Text style={styles.noTicketsSub}>Your support history will appear here</Text>
              </View>
            ) : (
              tickets.map((ticket, idx) => {
                const statusColor = getTicketStatusColor(ticket.status);
                return (
                  <View key={ticket.id || idx} style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.ticketSubject}>{ticket.subject || 'No subject'}</Text>
                        <Text style={styles.ticketDate}>
                          {formatDate(ticket.created_at || ticket.date)}
                        </Text>
                      </View>
                      <View style={[styles.ticketBadge, { backgroundColor: statusColor + '18' }]}>
                        <Text style={[styles.ticketBadgeText, { color: statusColor }]}>
                          {(ticket.status || 'Pending').replace(/_/g, ' ')}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.ticketMessage} numberOfLines={3}>
                      {ticket.message || ticket.description || ''}
                    </Text>
                    {ticket.admin_reply && (
                      <View style={styles.replyBox}>
                        <Ionicons name="chatbubble-ellipses-outline" size={14} color="#1B5E20" />
                        <Text style={styles.replyText} numberOfLines={3}>
                          {ticket.admin_reply}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

export default ContactAdmin;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F5F5F5' },

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

  /* Admin Info */
  adminInfoCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  adminInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  adminIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  adminInfoTitle: { fontSize: 17, fontWeight: '700', color: '#1B5E20' },
  adminInfoSub: { fontSize: 13, color: '#888', marginTop: 2 },
  adminContactRow: { marginTop: 14, gap: 8 },
  adminContactItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminContactText: { fontSize: 13, color: '#666' },

  /* Form */
  formCard: {
    margin: 16,
    marginBottom: 0,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  formTitle: { fontSize: 17, fontWeight: '700', color: '#1B5E20', marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginTop: 12, marginBottom: 6 },

  dropdown: {
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
    borderRadius: 10,
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

  textarea: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 15,
    color: '#333',
    minHeight: 130,
    lineHeight: 22,
  },
  charCount: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 4 },

  submitBtn: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  /* Tickets */
  ticketsSection: { margin: 16 },
  ticketsTitle: { fontSize: 17, fontWeight: '700', color: '#1B5E20', marginBottom: 12 },
  ticketsLoading: { paddingVertical: 20, alignItems: 'center' },

  noTickets: { alignItems: 'center', paddingVertical: 30 },
  noTicketsText: { color: '#999', fontSize: 15, marginTop: 10 },
  noTicketsSub: { color: '#bbb', fontSize: 13, marginTop: 4 },

  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  ticketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: '#333' },
  ticketDate: { fontSize: 12, color: '#999', marginTop: 2 },
  ticketBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  ticketBadgeText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  ticketMessage: { fontSize: 13, color: '#666', marginTop: 10, lineHeight: 20 },

  replyBox: {
    flexDirection: 'row',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    gap: 8,
    alignItems: 'flex-start',
  },
  replyText: { flex: 1, fontSize: 13, color: '#1B5E20', lineHeight: 20 },
});
