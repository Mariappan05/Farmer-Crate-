import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Corner floating icon configs
const CORNER_ICONS = [
  { name: 'leaf', lib: 'Ionicons', size: 32, top: '6%', left: '8%', delay: 0 },
  { name: 'flower', lib: 'Ionicons', size: 28, top: '5%', right: '10%', delay: 300 },
  { name: 'nutrition', lib: 'Ionicons', size: 26, bottom: '12%', left: '6%', delay: 150 },
  { name: 'grain', lib: 'Material', size: 30, bottom: '10%', right: '8%', delay: 450 },
  { name: 'sprout', lib: 'Material', size: 22, top: '20%', left: '82%', delay: 200 },
  { name: 'leaf', lib: 'Ionicons', size: 20, top: '30%', left: '4%', delay: 500 },
];

const FloatingCornerIcon = ({ icon, index }) => {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 900,
      delay: icon.delay + 400,
      useNativeDriver: true,
    }).start();

    // Continuous bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 2000 + index * 300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 2000 + index * 300,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Gentle rotation
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 3000 + index * 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 3000 + index * 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const translateY = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -14],
  });

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['-15deg', '15deg'],
  });

  const positionStyle = {};
  if (icon.top) positionStyle.top = icon.top;
  if (icon.bottom) positionStyle.bottom = icon.bottom;
  if (icon.left) positionStyle.left = icon.left;
  if (icon.right) positionStyle.right = icon.right;

  const IconComponent = icon.lib === 'Material' ? MaterialCommunityIcons : Ionicons;

  return (
    <Animated.View
      style={[
        styles.cornerIcon,
        positionStyle,
        { opacity: fadeAnim, transform: [{ translateY }, { rotate }] },
      ]}
    >
      <IconComponent name={icon.name} size={icon.size} color="rgba(255,255,255,0.2)" />
    </Animated.View>
  );
};

const GetStartedScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  // Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const logoScaleAnim = useRef(new Animated.Value(0.5)).current;
  const logoFadeAnim = useRef(new Animated.Value(0)).current;
  const titleSlideAnim = useRef(new Animated.Value(30)).current;
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const cardSlideAnim = useRef(new Animated.Value(60)).current;
  const cardFadeAnim = useRef(new Animated.Value(0)).current;
  const buttonScaleAnim = useRef(new Animated.Value(0.8)).current;
  const buttonFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');

    // Background fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();

    // Logo entrance
    Animated.parallel([
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 40,
        delay: 200,
        useNativeDriver: true,
      }),
      Animated.timing(logoFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Title slide + fade
    Animated.parallel([
      Animated.timing(titleFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 500,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlideAnim, {
        toValue: 0,
        duration: 700,
        delay: 500,
        easing: Easing.out(Easing.back(1.2)),
        useNativeDriver: true,
      }),
    ]).start();

    // Card slide up + fade
    Animated.parallel([
      Animated.timing(cardFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 800,
        useNativeDriver: true,
      }),
      Animated.timing(cardSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 800,
        easing: Easing.out(Easing.back(1)),
        useNativeDriver: true,
      }),
    ]).start();

    // Button entrance
    Animated.parallel([
      Animated.spring(buttonScaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 50,
        delay: 1200,
        useNativeDriver: true,
      }),
      Animated.timing(buttonFadeAnim, {
        toValue: 1,
        duration: 600,
        delay: 1200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar backgroundColor="#388E3C" barStyle="light-content" />

      {/* Background decorative circles */}
      <View style={styles.decorCircleTopLeft} />
      <View style={styles.decorCircleTopRight} />
      <View style={styles.decorCircleBottomLeft} />
      <View style={styles.decorCircleBottomRight} />

      {/* Floating corner icons */}
      {CORNER_ICONS.map((icon, index) => (
        <FloatingCornerIcon key={index} icon={icon} index={index} />
      ))}

      <Animated.View style={[styles.mainContent, { opacity: fadeAnim }]}>
        {/* Circle Avatar with Logo */}
        <Animated.View
          style={[
            styles.avatarContainer,
            {
              opacity: logoFadeAnim,
              transform: [{ scale: logoScaleAnim }],
            },
          ]}
        >
          <View style={styles.avatarOuterRing}>
            <View style={styles.avatarInnerCircle}>
              <Image
                source={require('../../assets/FarmerCrate_Logo.jpg')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
          </View>
        </Animated.View>

        {/* Title & Subtitle */}
        <Animated.View
          style={[
            styles.titleContainer,
            {
              opacity: titleFadeAnim,
              transform: [{ translateY: titleSlideAnim }],
            },
          ]}
        >
          <Text style={styles.title}>Farmer Crate</Text>
          <Text style={styles.subtitle}>Connecting Farmers & Customers</Text>
        </Animated.View>

        {/* Glassmorphic Card */}
        <Animated.View
          style={[
            styles.glassCard,
            {
              opacity: cardFadeAnim,
              transform: [{ translateY: cardSlideAnim }],
            },
          ]}
        >
          <Ionicons
            name="sparkles"
            size={28}
            color="#FFD54F"
            style={styles.cardSparkle}
          />
          <Text style={styles.cardTitle}>Let's Get Started</Text>
          <Text style={styles.cardText}>
            Your Journey to Freshness Begins Here
          </Text>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Get Started Button */}
          <Animated.View
            style={{
              opacity: buttonFadeAnim,
              transform: [{ scale: buttonScaleAnim }],
              width: '100%',
            }}
          >
            <TouchableOpacity
              style={styles.getStartedButton}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={styles.getStartedButtonText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </Animated.View>

          {/* Dot Indicators */}
          <View style={styles.dotsContainer}>
            <View style={[styles.dot, styles.dotInactive]} />
            <View style={[styles.dot, styles.dotActive]} />
            <View style={[styles.dot, styles.dotInactive]} />
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#4CAF50',
    overflow: 'hidden',
  },
  // Decorative corner circles
  decorCircleTopLeft: {
    position: 'absolute',
    top: -60,
    left: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircleTopRight: {
    position: 'absolute',
    top: -40,
    right: -50,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  decorCircleBottomLeft: {
    position: 'absolute',
    bottom: -70,
    left: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(56, 142, 60, 0.5)',
  },
  decorCircleBottomRight: {
    position: 'absolute',
    bottom: -50,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(27, 94, 32, 0.3)',
  },
  // Floating corner icons
  cornerIcon: {
    position: 'absolute',
    zIndex: 1,
  },
  // Main content layout
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
    zIndex: 2,
  },
  // Avatar / Logo
  avatarContainer: {
    marginBottom: 20,
  },
  avatarOuterRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  avatarInnerCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    overflow: 'hidden',
  },
  logoImg: {
    width: 82,
    height: 82,
    borderRadius: 41,
  },
  // Title section
  titleContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 5,
  },
  subtitle: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  // Glassmorphic card
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 24,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  cardSparkle: {
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.85)',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 6,
  },
  cardDivider: {
    width: 50,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 2,
    marginVertical: 18,
  },
  // Get Started button
  getStartedButton: {
    flexDirection: 'row',
    backgroundColor: '#1B5E20',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  getStartedButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.8,
  },
  // Dot indicators
  dotsContainer: {
    flexDirection: 'row',
    marginTop: 22,
    alignItems: 'center',
  },
  dot: {
    borderRadius: 5,
    marginHorizontal: 5,
  },
  dotActive: {
    width: 24,
    height: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 4,
  },
  dotInactive: {
    width: 8,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
});

export default GetStartedScreen;
