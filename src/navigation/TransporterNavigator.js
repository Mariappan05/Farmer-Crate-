import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import TransporterDashboard from '../screens/transporter/TransporterDashboard';
import OrderStatus from '../screens/transporter/OrderStatus';
import OrderHistoryPage from '../screens/transporter/OrderHistoryPage';
import VehiclePage from '../screens/transporter/VehiclePage';
import TransporterProfile from '../screens/transporter/TransporterProfile';
import AddDeliveryPerson from '../screens/transporter/AddDeliveryPerson';
import BillPreview from '../screens/transporter/BillPreview';
import BillAction from '../screens/transporter/BillAction';
import OrderDetail from '../screens/transporter/OrderDetail';
import TransporterOrderTracking from '../screens/transporter/TransporterOrderTracking';
import QRScan from '../screens/transporter/QRScan';
import FAQ from '../screens/common/FAQ';
import HelpSupport from '../screens/common/HelpSupport';
import Feedback from '../screens/common/Feedback';
import AppInfo from '../screens/common/AppInfo';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const SLIDE = { animation: 'slide_from_right', gestureEnabled: true, contentStyle: { backgroundColor: '#fff' } };

const TRANS_TABS = [
  { name: 'Dashboard', icon: 'apps',    iconOff: 'apps-outline',    label: 'Dashboard' },
  { name: 'Orders',    icon: 'list',    iconOff: 'list-outline',    label: 'Orders' },
  { name: 'History',   icon: 'time',    iconOff: 'time-outline',    label: 'History' },
  { name: 'Vehicles',  icon: 'car',     iconOff: 'car-outline',     label: 'Vehicles' },
  { name: 'Profile',   icon: 'person',  iconOff: 'person-outline',  label: 'Profile' },
];

const AnimatedTabBtn = ({ item, onPress, isFocused }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnim = useRef(new Animated.Value(isFocused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(dotAnim, { toValue: isFocused ? 1 : 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
    if (isFocused) Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
    ]).start();
  }, [isFocused]);
  return (
    <TouchableOpacity onPress={onPress} style={ts.tabBtn} activeOpacity={1}>
      <Animated.View style={[ts.iconWrap, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name={isFocused ? item.icon : item.iconOff} size={24} color={isFocused ? '#1B5E20' : '#9E9E9E'} />
      </Animated.View>
      <Text style={[ts.label, isFocused && ts.labelActive]}>{item.label}</Text>
      <Animated.View style={[ts.dot, { transform: [{ scaleX: dotAnim }], opacity: dotAnim }]} />
    </TouchableOpacity>
  );
};

const TransporterTabBar = ({ state, navigation }) => {
  const insets = useSafeAreaInsets();
  const extraBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 20 : 6);
  return (
    <View style={[ts.bar, { paddingBottom: extraBottom }]}>
      {state.routes.map((route, index) => (
        <AnimatedTabBtn
          key={route.key}
          item={TRANS_TABS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', label: route.name }}
          isFocused={state.index === index}
          onPress={() => { if (state.index !== index) navigation.navigate(route.name); }}
        />
      ))}
    </View>
  );
};

const ts = StyleSheet.create({
  bar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#F0F0F0',
    paddingTop: 6,
    ...Platform.select({ android: { elevation: 12 }, ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8 } }),
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 4 },
  iconWrap: { width: 32, height: 28, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 10, color: '#9E9E9E', fontWeight: '500', marginTop: 2 },
  labelActive: { color: '#1B5E20', fontWeight: '700' },
  dot: { position: 'absolute', bottom: -2, width: 20, height: 3, borderRadius: 2, backgroundColor: '#1B5E20' },
});

const TransporterTabs = () => (
  <Tab.Navigator tabBar={(props) => <TransporterTabBar {...props} />} screenOptions={{ headerShown: false }}>
    <Tab.Screen name="Dashboard" component={TransporterDashboard} />
    <Tab.Screen name="Orders" component={OrderStatus} />
    <Tab.Screen name="History" component={OrderHistoryPage} />
    <Tab.Screen name="Vehicles" component={VehiclePage} />
    <Tab.Screen name="Profile" component={TransporterProfile} />
  </Tab.Navigator>
);

const TransporterNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="TransporterTabs" component={TransporterTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="AddDeliveryPerson" component={AddDeliveryPerson} />
    <Stack.Screen name="BillPreview" component={BillPreview} />
    <Stack.Screen name="BillAction" component={BillAction} />
    <Stack.Screen name="OrderDetail" component={OrderDetail} />
    <Stack.Screen name="TransporterOrderTracking" component={TransporterOrderTracking} />
    <Stack.Screen name="QRScan" component={QRScan} />
    <Stack.Screen name="FAQ" component={FAQ} />
    <Stack.Screen name="HelpSupport" component={HelpSupport} />
    <Stack.Screen name="Feedback" component={Feedback} />
    <Stack.Screen name="AppInfo" component={AppInfo} />
  </Stack.Navigator>
);

export default TransporterNavigator;
