import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  StatusBar,
  Image,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

// Floating icon configurations
const FLOATING_ICONS = [
  { name: 'leaf', lib: 'Ionicons', size: 28, top: '8%', left: '10%', delay: 0 },
  { name: 'nutrition', lib: 'Ionicons', size: 24, top: '12%', right: '15%', delay: 200 },
  { name: 'flower', lib: 'Ionicons', size: 26, top: '25%', left: '5%', delay: 400 },
  { name: 'grain', lib: 'Material', size: 24, top: '18%', right: '8%', delay: 600 },
  { name: 'leaf', lib: 'Ionicons', size: 22, bottom: '28%', left: '12%', delay: 300 },
  { name: 'nutrition', lib: 'Ionicons', size: 20, bottom: '22%', right: '10%', delay: 500 },
  { name: 'flower', lib: 'Ionicons', size: 30, bottom: '35%', right: '20%', delay: 100 },
  { name: 'sprout', lib: 'Material', size: 26, top: '40%', left: '85%', delay: 700 },
];

const FloatingIcon = ({ icon, index }) => {
  const floatAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fade in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      delay: icon.delay,
      useNativeDriver: true,
    }).start();

    // Continuous floating bounce
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 1800 + index * 200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1800 + index * 200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const translateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -18],
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
        styles.floatingIcon,
        positionStyle,
        { opacity: fadeAnim, transform: [{ translateY }] },
      ]}
    >
      <IconComponent name={icon.name} size={icon.size} color="rgba(255,255,255,0.25)" />
    </Animated.View>
  );
};

const SplashScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  // Animations
  const logoScaleAnim = useRef(new Animated.Value(0.3)).current;
  const logoFadeAnim = useRef(new Animated.Value(0)).current;
  const titleSlideAnim = useRef(new Animated.Value(40)).current;
  const titleFadeAnim = useRef(new Animated.Value(0)).current;
  const subtitleFadeAnim = useRef(new Animated.Value(0)).current;
  const subtitleSlideAnim = useRef(new Animated.Value(20)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');

    // Logo scale + fade entrance
    Animated.parallel([
      Animated.spring(logoScaleAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }),
      Animated.timing(logoFadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
    ]).start();

    // Logo pulse loop
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    // Title slide + fade
    Animated.parallel([
      Animated.timing(titleFadeAnim, {
        toValue: 1,
        duration: 800,
        delay: 400,
        useNativeDriver: true,
      }),
      Animated.timing(titleSlideAnim, {
        toValue: 0,
        duration: 800,
        delay: 400,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }),
    ]).start();

    // Subtitle slide + fade
    Animated.parallel([
      Animated.timing(subtitleFadeAnim, {
        toValue: 1,
        duration: 700,
        delay: 800,
        useNativeDriver: true,
      }),
      Animated.timing(subtitleSlideAnim, {
        toValue: 0,
        duration: 700,
        delay: 800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    // Progress bar fills over 3 seconds
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3000,
      easing: Easing.linear,
      useNativeDriver: false, // width animation needs layout
    }).start();

    pulseLoop.start();

    // Navigate after 3 seconds
    const timer = setTimeout(() => {
      navigation.replace('GetStarted');
    }, 3000);

    return () => {
      clearTimeout(timer);
      pulseLoop.stop();
    };
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar backgroundColor="#103A12" barStyle="light-content" />

      {/* Background decorative circles for gradient effect */}
      <View style={styles.bgCircleTopRight} />
      <View style={styles.bgCircleMidLeft} />
      <View style={styles.bgCircleBottomLeft} />
      <View style={styles.bgCircleCenter} />

      {/* Floating decorative icons */}
      {FLOATING_ICONS.map((icon, index) => (
        <FloatingIcon key={index} icon={icon} index={index} />
      ))}

      {/* Main content */}
      <View style={styles.content}>
        {/* Logo */}
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: logoFadeAnim,
              transform: [{ scale: logoScaleAnim }, { scale: pulseAnim }],
            },
          ]}
        >
          <View style={styles.logoOuterRing}>
            <View style={styles.logoInnerCircle}>
              <Image
                source={require('../../assets/FarmerCrate_Logo.jpg')}
                style={styles.logoImg}
                resizeMode="contain"
              />
            </View>
          </View>
        </Animated.View>

        {/* Title */}
        <Animated.Text
          style={[
            styles.title,
            {
              opacity: titleFadeAnim,
              transform: [{ translateY: titleSlideAnim }],
            },
          ]}
        >
          Farmer Crate
        </Animated.Text>

        {/* Subtitle */}
        <Animated.Text
          style={[
            styles.subtitle,
            {
              opacity: subtitleFadeAnim,
              transform: [{ translateY: subtitleSlideAnim }],
            },
          ]}
        >
          Fresh from Farm to Your Table
        </Animated.Text>
      </View>

      {/* Progress bar at bottom */}
      <View style={styles.progressContainer}>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
        </View>
        <Animated.Text style={[styles.loadingText, { opacity: subtitleFadeAnim }]}>
          Loading...
        </Animated.Text>
      </View>

      {/* Version */}
      <Text style={styles.version}>v1.0.0</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1B5E20',
    overflow: 'hidden',
  },
  // Background decorative circles to simulate gradient
  bgCircleTopRight: {
    position: 'absolute',
    top: -height * 0.12,
    right: -width * 0.25,
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    backgroundColor: 'rgba(76, 175, 80, 0.3)',
  },
  bgCircleMidLeft: {
    position: 'absolute',
    top: height * 0.3,
    left: -width * 0.3,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: 'rgba(129, 199, 132, 0.15)',
  },
  bgCircleBottomLeft: {
    position: 'absolute',
    bottom: -height * 0.08,
    left: -width * 0.15,
    width: width * 0.85,
    height: width * 0.85,
    borderRadius: width * 0.425,
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
  },
  bgCircleCenter: {
    position: 'absolute',
    top: height * 0.25,
    right: -width * 0.1,
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: width * 0.25,
    backgroundColor: 'rgba(129, 199, 132, 0.1)',
  },
  // Floating icons
  floatingIcon: {
    position: 'absolute',
    zIndex: 1,
  },
  // Main content
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  logoContainer: {
    marginBottom: 24,
  },
  logoOuterRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  logoInnerCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: '#1B5E20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    overflow: 'hidden',
  },
  logoImg: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  title: {
    fontSize: 38,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.35)',
    textShadowOffset: { width: 1, height: 2 },
    textShadowRadius: 6,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 10,
    letterSpacing: 0.8,
    fontStyle: 'italic',
  },
  // Progress bar
  progressContainer: {
    alignItems: 'center',
    paddingBottom: 40,
    paddingHorizontal: 50,
    zIndex: 2,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#81C784',
    borderRadius: 2,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.55)',
    letterSpacing: 1,
  },
  version: {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.35)',
    letterSpacing: 0.5,
  },
});

export default SplashScreen;
