import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Platform,
} from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';

import CustomerHome from '../screens/customer/CustomerHome';
import Categories from '../screens/customer/Categories';
import Cart from '../screens/customer/Cart';
import Wishlist from '../screens/customer/Wishlist';
import CustomerProfile from '../screens/customer/CustomerProfile';
import ProductDetails from '../screens/customer/ProductDetails';
import OrderHistory from '../screens/customer/OrderHistory';
import Payment from '../screens/customer/Payment';
import OrderConfirm from '../screens/customer/OrderConfirm';
import FindTransporter from '../screens/customer/FindTransporter';
import Explore from '../screens/customer/Explore';
import Notifications from '../screens/customer/Notifications';
import CustomerOrderTracking from '../screens/customer/CustomerOrderTracking';
import AppSettings from '../screens/customer/AppSettings';
import TransporterLive from '../screens/customer/TransporterLive';
import TrendingPage from '../screens/customer/TrendingPage';
import OrderSummary from '../screens/customer/OrderSummary';

import FAQ from '../screens/common/FAQ';
import HelpSupport from '../screens/common/HelpSupport';
import Feedback from '../screens/common/Feedback';
import AppInfo from '../screens/common/AppInfo';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const SLIDE = {
  animation: 'slide_from_right',
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  contentStyle: { backgroundColor: '#fff' },
};

const TAB_ITEMS = [
  { name: 'Home',    icon: 'home',    iconOff: 'home-outline' },
  { name: 'Explore', icon: 'compass', iconOff: 'compass-outline' },
  { name: 'Cart',    icon: 'cart',    iconOff: 'cart-outline' },
  { name: 'Orders',  icon: 'receipt', iconOff: 'receipt-outline' },
  { name: 'Profile', icon: 'person',  iconOff: 'person-outline' },
];

// ─── Animated Tab Button ──────────────────────────────────────────────────────
const TabButton = ({ item, onPress, isFocused, cartCount }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dotAnim   = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  useEffect(() => {
    Animated.spring(dotAnim, {
      toValue: isFocused ? 1 : 0,
      useNativeDriver: true,
      tension: 80,
      friction: 8,
    }).start();
    if (isFocused) {
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 0.85, duration: 100, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 200, friction: 7, useNativeDriver: true }),
      ]).start();
    }
  }, [isFocused]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.82, duration: 80, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 180, friction: 6, useNativeDriver: true }),
    ]).start();
    onPress();
  };

  const dotScale = dotAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const dotOpacity = dotAnim;

  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.tabBtn}
      activeOpacity={1}
    >
      <Animated.View style={[styles.tabIconWrap, { transform: [{ scale: scaleAnim }] }]}>
        {/* Cart badge */}
        {item.name === 'Cart' && cartCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : String(cartCount)}</Text>
          </View>
        )}
        <Ionicons
          name={isFocused ? item.icon : item.iconOff}
          size={24}
          color={isFocused ? '#1B5E20' : '#9E9E9E'}
        />
      </Animated.View>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>
        {item.name}
      </Text>
      {/* Active indicator dot */}
      <Animated.View
        style={[
          styles.activeDot,
          { transform: [{ scaleX: dotScale }], opacity: dotOpacity },
        ]}
      />
    </TouchableOpacity>
  );
};

// ─── Custom Tab Bar ───────────────────────────────────────────────────────────
const CustomTabBar = ({ state, descriptors, navigation }) => {
  const { cartCount } = useCart();
  const insets = useSafeAreaInsets();
  const extraBottom = insets.bottom > 0 ? insets.bottom : (Platform.OS === 'ios' ? 20 : 6);

  return (
    <View style={[styles.tabBar, { paddingBottom: extraBottom }]}>
      {state.routes.map((route, index) => {
        const isFocused = state.index === index;
        const item = TAB_ITEMS[index] || { icon: 'ellipse', iconOff: 'ellipse-outline', name: route.name };

        const onPress = () => {
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TabButton
            key={route.key}
            item={item}
            onPress={onPress}
            isFocused={isFocused}
            cartCount={cartCount}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 6,
    ...Platform.select({
      android: { elevation: 12 },
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 8 },
    }),
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
  },
  tabIconWrap: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 28,
  },
  tabLabel: {
    fontSize: 10,
    color: '#9E9E9E',
    fontWeight: '500',
    marginTop: 2,
  },
  tabLabelActive: {
    color: '#1B5E20',
    fontWeight: '700',
  },
  activeDot: {
    position: 'absolute',
    bottom: -2,
    width: 20,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#1B5E20',
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -8,
    backgroundColor: '#EF5350',
    borderRadius: 9,
    minWidth: 17,
    height: 17,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#fff',
    zIndex: 10,
  },
  badgeText: { fontSize: 9, color: '#fff', fontWeight: '800' },
});

// ─── Customer Tabs ────────────────────────────────────────────────────────────
const CustomerTabs = () => (
  <Tab.Navigator
    tabBar={(props) => <CustomTabBar {...props} />}
    screenOptions={{ headerShown: false }}
  >
    <Tab.Screen name="Home"    component={CustomerHome} />
    <Tab.Screen name="Explore" component={Explore} />
    <Tab.Screen name="Cart"    component={Cart} />
    <Tab.Screen name="Orders"  component={OrderHistory} />
    <Tab.Screen name="Profile" component={CustomerProfile} />
  </Tab.Navigator>
);

// ─── Customer Navigator ───────────────────────────────────────────────────────
const CustomerNavigator = () => (
  <Stack.Navigator screenOptions={{ headerShown: false, ...SLIDE }}>
    <Stack.Screen name="CustomerTabs" component={CustomerTabs} options={{ animation: 'none' }} />
    <Stack.Screen name="Categories" component={Categories} />
    <Stack.Screen name="Wishlist" component={Wishlist} />
    <Stack.Screen name="ProductDetails" component={ProductDetails} />
    <Stack.Screen name="Payment" component={Payment} />
    <Stack.Screen name="OrderConfirm" component={OrderConfirm} options={{ animation: 'slide_from_bottom' }} />
    <Stack.Screen name="OrderSummary" component={OrderSummary} />
    <Stack.Screen name="CustomerOrderTracking" component={CustomerOrderTracking} />
    <Stack.Screen name="FindTransporter" component={FindTransporter} />
    <Stack.Screen name="TransporterLive" component={TransporterLive} />
    <Stack.Screen name="Notifications" component={Notifications} />
    <Stack.Screen name="TrendingPage" component={TrendingPage} />
    <Stack.Screen name="AppSettings" component={AppSettings} />
    <Stack.Screen name="OrderHistory" component={OrderHistory} />
    <Stack.Screen name="FAQ" component={FAQ} />
    <Stack.Screen name="HelpSupport" component={HelpSupport} />
    <Stack.Screen name="Feedback" component={Feedback} />
    <Stack.Screen name="AppInfo" component={AppInfo} />
  </Stack.Navigator>
);

export default CustomerNavigator;
