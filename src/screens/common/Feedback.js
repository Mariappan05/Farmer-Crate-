import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';

const CATEGORIES = [
  'App Experience',
  'Delivery',
  'Product Quality',
  'Customer Service',
  'Suggestions',
  'Other',
];
const RATINGS = [1, 2, 3, 4, 5];
const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'];

const Feedback = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) return Alert.alert('Validation', 'Please select a star rating.');
    if (!category) return Alert.alert('Validation', 'Please select a feedback category.');
    if (!message.trim()) return Alert.alert('Validation', 'Please provide some feedback.');
    setIsSending(true);
    try {
      await api.post('/api/feedback', {
        rating,
        category,
        message: message.trim(),
      });
      setSubmitted(true);
    } catch (e) {
      Alert.alert('Error', 'Failed to submit feedback. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  /* ── Success Screen ── */
  if (submitted) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Feedback</Text>
        </View>
        <View style={styles.thankYou}>
          <View style={styles.successCircle}>
            <Ionicons name="checkmark-circle" size={72} color="#4CAF50" />
          </View>
          <Text style={styles.tyTitle}>Thank You!</Text>
          <Text style={styles.tySub}>
            Your feedback has been submitted successfully. It helps us improve Farmer Crate for everyone.
          </Text>
          <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  /* ── Main Form ── */
  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Feedback</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Star Rating */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>How would you rate Farmer Crate?</Text>
          <View style={styles.starsRow}>
            {RATINGS.map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={42}
                  color={star <= rating ? '#FFC107' : '#ddd'}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingLabel}>
            {rating === 0 ? 'Tap a star to rate' : RATING_LABELS[rating]}
          </Text>
        </View>

        {/* Category Dropdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Feedback Category</Text>
          <TouchableOpacity
            style={styles.dropdown}
            onPress={() => setDropdownOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.dropdownText, !category && { color: '#aaa' }]}>
              {category || 'Select a category'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#888" />
          </TouchableOpacity>
        </View>

        {/* Message */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Feedback</Text>
          <TextInput
            style={styles.textarea}
            placeholder="Share your experience, suggestions, or issues..."
            placeholderTextColor="#aaa"
            value={message}
            onChangeText={setMessage}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{message.length}/500</Text>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitBtn, isSending && { opacity: 0.7 }]}
          onPress={handleSubmit}
          disabled={isSending}
          activeOpacity={0.8}
        >
          {isSending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.submitBtnText}>Submit Feedback</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal visible={dropdownOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setDropdownOpen(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Category</Text>
            {CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.modalItem, category === cat && styles.modalItemActive]}
                onPress={() => {
                  setCategory(cat);
                  setDropdownOpen(false);
                }}
              >
                <Text
                  style={[styles.modalItemText, category === cat && styles.modalItemTextActive]}
                >
                  {cat}
                </Text>
                {category === cat && <Ionicons name="checkmark" size={20} color="#1B5E20" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
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

  /* Cards */
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 14 },

  /* Stars */
  starsRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 8 },
  ratingLabel: { textAlign: 'center', fontSize: 14, color: '#888', marginTop: 4 },

  /* Dropdown */
  dropdown: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#f8f8f8', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#ebebeb',
  },
  dropdownText: { fontSize: 14, color: '#333' },

  /* Textarea */
  textarea: {
    backgroundColor: '#f8f8f8', borderRadius: 12, padding: 12, fontSize: 14,
    color: '#333', borderWidth: 1, borderColor: '#ebebeb', minHeight: 120,
  },
  charCount: { fontSize: 12, color: '#bbb', textAlign: 'right', marginTop: 6 },

  /* Submit */
  submitBtn: {
    backgroundColor: '#1B5E20', borderRadius: 14, paddingVertical: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  /* Thank You */
  thankYou: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  successCircle: { marginBottom: 20 },
  tyTitle: { fontSize: 28, fontWeight: 'bold', color: '#1B5E20', marginBottom: 10 },
  tySub: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 30, paddingHorizontal: 10 },
  doneBtn: { backgroundColor: '#1B5E20', borderRadius: 20, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },

  /* Modal */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: 20, padding: 20, width: '85%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1B5E20', marginBottom: 14 },
  modalItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalItemActive: { backgroundColor: '#E8F5E9', marginHorizontal: -8, paddingHorizontal: 8, borderRadius: 10 },
  modalItemText: { fontSize: 15, color: '#333' },
  modalItemTextActive: { color: '#1B5E20', fontWeight: '600' },
});

export default Feedback;
