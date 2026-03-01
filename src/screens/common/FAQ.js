import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const FAQS = [
  {
    q: 'How do I place an order?',
    a: 'Browse products on the Home screen, add items to your cart, and proceed to checkout. Fill in your delivery details and choose a payment method to complete your order.',
    topic: 'Ordering',
  },
  {
    q: 'What payment methods are accepted?',
    a: 'We accept online payments via Razorpay (credit/debit cards, UPI, net banking) and Cash on Delivery (COD) for all orders.',
    topic: 'Payments',
  },
  {
    q: 'How long does delivery take?',
    a: 'Delivery typically takes 1-3 days depending on your location and the farmer\'s proximity. You\'ll receive real-time tracking updates once your order is shipped.',
    topic: 'Delivery',
  },
  {
    q: 'What is the return/refund policy?',
    a: 'If you receive damaged or incorrect items, you can request a return within 24 hours of delivery. Refunds are processed within 5-7 business days after approval.',
    topic: 'Returns',
  },
  {
    q: 'How do I update my account details?',
    a: 'Go to your Profile page and tap the edit icon. You can update your name, phone number, address, and profile picture from there.',
    topic: 'Account',
  },
  {
    q: 'How is product quality ensured?',
    a: 'All farmers on our platform are verified. Products go through quality checks and are accompanied by harvest date information so you always know the freshness level.',
    topic: 'Quality',
  },
  {
    q: 'How can farmers join the platform?',
    a: 'Farmers can sign up through the app by selecting the "Farmer" role during registration. After submitting necessary documents, our admin team verifies and approves the account.',
    topic: 'Farmers',
  },
  {
    q: 'How does the transporter system work?',
    a: 'Registered transporters pick up orders from farmers and deliver them to customers. Transporters can manage their deliveries, assign delivery personnel, and track orders in real time.',
    topic: 'Transporters',
  },
  {
    q: 'Can I cancel my order?',
    a: 'Orders can be cancelled only if they haven\'t been dispatched yet. Go to Order History, select the order, and tap "Cancel" if the option is available. Contact support for further help.',
    topic: 'Ordering',
  },
  {
    q: 'How do I track my order?',
    a: 'Go to Order History, select your order, and tap "Track" to see live status updates including pickup, transit, and delivery milestones.',
    topic: 'Delivery',
  },
  {
    q: 'Is my payment information secure?',
    a: 'Absolutely. All payments are processed through Razorpay\'s secure gateway with end-to-end encryption. We never store your card details.',
    topic: 'Payments',
  },
  {
    q: 'How do I reset my password?',
    a: 'On the login screen, tap "Forgot Password" and enter your registered email or phone number. You\'ll receive an OTP to verify and set a new password.',
    topic: 'Account',
  },
];

const FAQ = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [search, setSearch] = useState('');

  const toggle = (i) => setExpandedIndex((prev) => (prev === i ? null : i));

  const filteredFaqs = useMemo(() => {
    if (!search.trim()) return FAQS;
    const term = search.toLowerCase();
    return FAQS.filter(
      (faq) =>
        faq.q.toLowerCase().includes(term) ||
        faq.a.toLowerCase().includes(term) ||
        faq.topic.toLowerCase().includes(term),
    );
  }, [search]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Frequently Asked Questions</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color="#888" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search FAQs..."
            placeholderTextColor="#aaa"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color="#bbb" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {filteredFaqs.length === 0 && (
          <View style={styles.emptyContainer}>
            <Ionicons name="search" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No FAQs match your search.</Text>
          </View>
        )}

        {filteredFaqs.map((faq, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => toggle(i)}
            activeOpacity={0.7}
            style={[styles.faqItem, expandedIndex === i && styles.faqItemActive]}
          >
            <View style={styles.faqQuestion}>
              <View style={styles.faqIconCircle}>
                <Ionicons
                  name={expandedIndex === i ? 'remove' : 'add'}
                  size={18}
                  color={expandedIndex === i ? '#fff' : '#4CAF50'}
                />
              </View>
              <Text style={[styles.faqQ, expandedIndex === i && { color: '#1B5E20' }]}>
                {faq.q}
              </Text>
              <Ionicons
                name={expandedIndex === i ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={expandedIndex === i ? '#1B5E20' : '#bbb'}
              />
            </View>
            {expandedIndex === i && (
              <View style={styles.answerContainer}>
                <View style={styles.topicBadge}>
                  <Text style={styles.topicBadgeText}>{faq.topic}</Text>
                </View>
                <Text style={styles.faqAnswer}>{faq.a}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}

        {/* Still have questions */}
        <View style={styles.contactCard}>
          <Ionicons name="headset-outline" size={28} color="#1B5E20" />
          <Text style={styles.contactTitle}>Still have questions?</Text>
          <Text style={styles.contactSub}>Our support team is here to help.</Text>
          <TouchableOpacity style={styles.contactBtn} onPress={() => navigation.navigate('HelpSupport')}>
            <Text style={styles.contactBtnText}>Contact Support</Text>
          </TouchableOpacity>
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
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', flex: 1 },

  /* Search */
  searchContainer: { backgroundColor: '#1B5E20', paddingHorizontal: 16, paddingBottom: 14 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, paddingHorizontal: 12, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },

  /* Empty */
  emptyContainer: { alignItems: 'center', paddingVertical: 48 },
  emptyText: { fontSize: 15, color: '#999', marginTop: 12 },

  /* FAQ items */
  faqItem: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  faqItemActive: { borderLeftWidth: 3, borderLeftColor: '#1B5E20' },
  faqQuestion: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  faqIconCircle: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#E8F5E9',
    justifyContent: 'center', alignItems: 'center', marginTop: 1,
  },
  faqQ: { fontSize: 14, fontWeight: '600', color: '#333', flex: 1, lineHeight: 20 },
  answerContainer: { marginTop: 12, marginLeft: 38 },
  topicBadge: {
    alignSelf: 'flex-start', backgroundColor: '#E8F5E9', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 3, marginBottom: 8,
  },
  topicBadgeText: { fontSize: 11, fontWeight: '600', color: '#388E3C' },
  faqAnswer: { fontSize: 14, color: '#555', lineHeight: 21 },

  /* Contact card */
  contactCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, marginTop: 10,
    alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  contactTitle: { fontSize: 17, fontWeight: 'bold', color: '#222', marginTop: 10 },
  contactSub: { fontSize: 13, color: '#888', marginTop: 4, marginBottom: 16 },
  contactBtn: { backgroundColor: '#1B5E20', borderRadius: 20, paddingHorizontal: 24, paddingVertical: 12 },
  contactBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});

export default FAQ;
