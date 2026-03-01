/**
 * Toast.js – lightweight animated toast for React Native (no external libs)
 *
 * Usage:
 *   const toastRef = useRef(null);
 *   <ToastMessage ref={toastRef} />
 *   toastRef.current?.show('Approved!', 'success');
 *
 * Types: 'success' | 'error' | 'warning' | 'info'
 */

import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const COLORS = {
  success: { bg: '#388E3C', icon: 'checkmark-circle', border: '#2E7D32' },
  error:   { bg: '#D32F2F', icon: 'close-circle',     border: '#B71C1C' },
  warning: { bg: '#F57C00', icon: 'warning',           border: '#E65100' },
  info:    { bg: '#1565C0', icon: 'information-circle', border: '#0D47A1' },
};

const ToastMessage = forwardRef((_, ref) => {
  const [message, setMessage] = useState('');
  const [type, setType] = useState('success');
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef(null);

  useImperativeHandle(ref, () => ({
    show(msg, toastType = 'success', duration = 2800) {
      setMessage(msg);
      setType(toastType);

      // Cancel any running timer
      if (timerRef.current) clearTimeout(timerRef.current);

      // Slide-up + fade-in
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 6,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-hide
      timerRef.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 120,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }, duration);
    },
    hide() {
      if (timerRef.current) clearTimeout(timerRef.current);
      Animated.parallel([
        Animated.timing(translateY, { toValue: 120, duration: 250, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start();
    },
  }));

  const cfg = COLORS[type] || COLORS.success;

  return (
    <Animated.View
      style={[
        styles.toast,
        { backgroundColor: cfg.bg, borderLeftColor: cfg.border },
        { transform: [{ translateY }], opacity },
      ]}
      pointerEvents="none"
    >
      <Ionicons name={cfg.icon} size={20} color="#fff" style={{ marginRight: 10 }} />
      <Text style={styles.toastText} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderLeftWidth: 4,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 9999,
  },
  toastText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});

export default ToastMessage;
