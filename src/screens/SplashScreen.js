import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Animated, Easing,
  Dimensions, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Line, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

/* ─── Particle dots scattered in background ─── */
const PARTICLES = Array.from({ length: 28 }, (_, i) => ({
  cx: Math.random() * width,
  cy: Math.random() * height,
  r:  1 + Math.random() * 2.5,
  opacity: 0.08 + Math.random() * 0.18,
}));

/* ─── Floating farm icons ─── */
const ICONS = [
  { name: 'leaf',      lib: 'I', size: 32, top: '6%',    left: '7%',   delay: 0   },
  { name: 'nutrition', lib: 'I', size: 22, top: '11%',   right: '11%', delay: 150 },
  { name: 'flower',    lib: 'I', size: 26, top: '26%',   left: '3%',   delay: 350 },
  { name: 'grain',     lib: 'M', size: 24, top: '19%',   right: '5%',  delay: 550 },
  { name: 'leaf',      lib: 'I', size: 20, bottom: '32%',left: '9%',   delay: 250 },
  { name: 'nutrition', lib: 'I', size: 22, bottom: '22%',right: '8%',  delay: 450 },
  { name: 'flower',    lib: 'I', size: 28, bottom: '40%',right: '16%', delay: 80  },
  { name: 'sprout',    lib: 'M', size: 26, top: '44%',   left: '88%',  delay: 650 },
  { name: 'leaf',      lib: 'I', size: 18, top: '57%',   left: '2%',   delay: 200 },
  { name: 'grain',     lib: 'M', size: 20, bottom: '14%',left: '82%',  delay: 400 },
];

const FloatingIcon = ({ icon, index }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const rot   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 1000, delay: icon.delay, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2200 + index * 160, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2200 + index * 160, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 9000 + index * 600, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -22] });
  const rotate     = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const pos = {};
  if (icon.top)    pos.top    = icon.top;
  if (icon.bottom) pos.bottom = icon.bottom;
  if (icon.left)   pos.left   = icon.left;
  if (icon.right)  pos.right  = icon.right;

  const Icon = icon.lib === 'M' ? MaterialCommunityIcons : Ionicons;
  return (
    <Animated.View style={[styles.floatIcon, pos, { opacity: fade, transform: [{ translateY }, { rotate }] }]}>
      <Icon name={icon.name} size={icon.size} color="rgba(255,255,255,0.15)" />
    </Animated.View>
  );
};

/* ─── Spinning ring ─── */
const SpinRing = ({ size, borderColor, duration, reverse = false, style }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.timing(spin, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 1.5, borderColor, position: 'absolute', transform: [{ rotate }] }, style]} />
  );
};

/* ─── Bouncing dot ─── */
const Dot = ({ delay }) => {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.delay(delay),
      Animated.timing(anim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(anim, { toValue: 0, duration: 400, useNativeDriver: true }),
      Animated.delay(400),
    ])).start();
  }, []);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const scale      = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.4] });
  return <Animated.View style={[styles.dot, { transform: [{ translateY }, { scale }] }]} />;
};

/* ══════════════════════════════════════════════ */
const SplashScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  // Refs
  const logoScale  = useRef(new Animated.Value(0)).current;
  const logoFade   = useRef(new Animated.Value(0)).current;
  const glow       = useRef(new Animated.Value(0.3)).current;
  const ring1Scale = useRef(new Animated.Value(0.4)).current;
  const ring1Fade  = useRef(new Animated.Value(0)).current;
  const ring2Scale = useRef(new Animated.Value(0.4)).current;
  const ring2Fade  = useRef(new Animated.Value(0)).current;
  const titleY     = useRef(new Animated.Value(60)).current;
  const titleFade  = useRef(new Animated.Value(0)).current;
  const shimmer    = useRef(new Animated.Value(-width)).current;
  const badgeScale = useRef(new Animated.Value(0)).current;
  const badgeFade  = useRef(new Animated.Value(0)).current;
  const subY       = useRef(new Animated.Value(30)).current;
  const subFade    = useRef(new Animated.Value(0)).current;
  const divW       = useRef(new Animated.Value(0)).current;
  const tagFade    = useRef(new Animated.Value(0)).current;
  const dotsFade   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');

    // Logo pop-in
    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 4, tension: 30, useNativeDriver: true }),
      Animated.timing(logoFade,  { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();

    // Rings expand
    Animated.parallel([
      Animated.spring(ring1Scale, { toValue: 1, friction: 5, tension: 25, delay: 200, useNativeDriver: true }),
      Animated.timing(ring1Fade,  { toValue: 1, duration: 700, delay: 200, useNativeDriver: true }),
      Animated.spring(ring2Scale, { toValue: 1, friction: 5, tension: 20, delay: 400, useNativeDriver: true }),
      Animated.timing(ring2Fade,  { toValue: 1, duration: 700, delay: 400, useNativeDriver: true }),
    ]).start();

    // Glow pulse
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1,   duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.3, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    // Title slide up
    Animated.parallel([
      Animated.timing(titleFade, { toValue: 1, duration: 700, delay: 550, useNativeDriver: true }),
      Animated.timing(titleY,    { toValue: 0, duration: 700, delay: 550, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
    ]).start();

    // Shimmer sweep on title
    Animated.loop(
      Animated.timing(shimmer, { toValue: width * 1.5, duration: 2200, delay: 1200, easing: Easing.linear, useNativeDriver: true })
    ).start();

    // Badge pop
    Animated.parallel([
      Animated.spring(badgeScale, { toValue: 1, friction: 4, tension: 40, delay: 900, useNativeDriver: true }),
      Animated.timing(badgeFade,  { toValue: 1, duration: 500, delay: 900, useNativeDriver: true }),
    ]).start();

    // Subtitle
    Animated.parallel([
      Animated.timing(subFade, { toValue: 1, duration: 600, delay: 1100, useNativeDriver: true }),
      Animated.timing(subY,    { toValue: 0, duration: 600, delay: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    // Divider
    Animated.timing(divW, { toValue: 1, duration: 700, delay: 1400, easing: Easing.out(Easing.ease), useNativeDriver: false }).start();

    // Tagline
    Animated.timing(tagFade, { toValue: 1, duration: 600, delay: 1700, useNativeDriver: true }).start();

    // Dots
    Animated.timing(dotsFade, { toValue: 1, duration: 500, delay: 1900, useNativeDriver: true }).start();

    const timer = setTimeout(() => navigation.replace('GetStarted'), 3400);
    return () => clearTimeout(timer);
  }, []);

  const dividerWidth = divW.interpolate({ inputRange: [0, 1], outputRange: ['0%', '55%'] });

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* ── Full-screen gradient ── */}
      <LinearGradient
        colors={['#0A2E0C', '#1B5E20', '#2E7D32', '#1B5E20', '#0A2E0C']}
        locations={[0, 0.25, 0.5, 0.75, 1]}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* ── SVG particle layer ── */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <RadialGradient id="rg" cx="50%" cy="40%" r="60%">
            <Stop offset="0%"   stopColor="#81C784" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#0A2E0C" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={width / 2} cy={height * 0.42} r={width * 0.7} fill="url(#rg)" />
        {PARTICLES.map((p, i) => (
          <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="white" opacity={p.opacity} />
        ))}
        {/* subtle grid lines */}
        {Array.from({ length: 6 }, (_, i) => (
          <Line key={`h${i}`}
            x1={0} y1={height * (i / 6)}
            x2={width} y2={height * (i / 6)}
            stroke="rgba(255,255,255,0.03)" strokeWidth={1}
          />
        ))}
        {Array.from({ length: 5 }, (_, i) => (
          <Line key={`v${i}`}
            x1={width * (i / 5)} y1={0}
            x2={width * (i / 5)} y2={height}
            stroke="rgba(255,255,255,0.03)" strokeWidth={1}
          />
        ))}
      </Svg>

      {/* ── Bottom wave ── */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.25)']}
        style={styles.bottomWave}
      />

      {/* ── Floating icons ── */}
      {ICONS.map((icon, i) => <FloatingIcon key={i} icon={icon} index={i} />)}

      {/* ── Center content ── */}
      <View style={[styles.content, { paddingTop: insets.top }]}>

        {/* Glow halo */}
        <Animated.View style={[styles.glow, { opacity: glow }]} />

        {/* Spinning decorative rings */}
        <SpinRing size={230} borderColor="rgba(129,199,132,0.12)" duration={12000} />
        <SpinRing size={200} borderColor="rgba(255,255,255,0.08)" duration={8000} reverse />

        {/* Expanding entrance rings */}
        <Animated.View style={[styles.ring2, { opacity: ring2Fade, transform: [{ scale: ring2Scale }] }]} />
        <Animated.View style={[styles.ring1, { opacity: ring1Fade, transform: [{ scale: ring1Scale }] }]} />

        {/* Logo */}
        <Animated.View style={[styles.logoWrap, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0.25)', 'rgba(255,255,255,0.05)']}
            style={styles.logoGradBorder}
          >
            <View style={styles.logoCircle}>
              <Image
                source={require('../../assets/FarmerCrate_Logo.jpg')}
                style={styles.logoImg}
                resizeMode="cover"
              />
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Title + shimmer */}
        <Animated.View style={[styles.titleWrap, { opacity: titleFade, transform: [{ translateY: titleY }] }]}>
          <Text style={styles.title}>Farmer Crate</Text>
          {/* shimmer overlay */}
          <Animated.View
            style={[styles.shimmer, { transform: [{ translateX: shimmer }] }]}
            pointerEvents="none"
          />
        </Animated.View>

        {/* "Fresh" badge */}
        <Animated.View style={[styles.badge, { opacity: badgeFade, transform: [{ scale: badgeScale }] }]}>
          <LinearGradient colors={['#66BB6A', '#2E7D32']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.badgeGrad}>
            <Ionicons name="leaf" size={11} color="#fff" />
            <Text style={styles.badgeText}>100% Farm Fresh</Text>
            <Ionicons name="leaf" size={11} color="#fff" />
          </LinearGradient>
        </Animated.View>

        {/* Subtitle */}
        <Animated.Text style={[styles.subtitle, { opacity: subFade, transform: [{ translateY: subY }] }]}>
          Farm-Fresh. Delivered to Your Door.
        </Animated.Text>

        {/* Divider */}
        <View style={styles.divRow}>
          <Animated.View style={[styles.divLine, { width: dividerWidth }]} />
          <Animated.View style={{ opacity: tagFade }}>
            <MaterialCommunityIcons name="sprout" size={18} color="rgba(129,199,132,0.8)" style={{ marginHorizontal: 10 }} />
          </Animated.View>
          <Animated.View style={[styles.divLine, { width: dividerWidth }]} />
        </View>

        {/* Tagline */}
        <Animated.Text style={[styles.tagline, { opacity: tagFade }]}>
          Connecting Farmers &amp; Customers
        </Animated.Text>
      </View>

      {/* ── Loading dots ── */}
      <Animated.View style={[styles.dotsRow, { opacity: dotsFade, paddingBottom: insets.bottom + 40 }]}>
        <Dot delay={0} />
        <Dot delay={180} />
        <Dot delay={360} />
      </Animated.View>

      <Text style={[styles.version, { bottom: insets.bottom + 10 }]}>v1.0.0</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0A2E0C' },

  bottomWave: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.22,
    borderTopLeftRadius: width * 0.7, borderTopRightRadius: width * 0.7,
  },

  floatIcon: { position: 'absolute', zIndex: 1 },

  content: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 2 },

  // Glow
  glow: {
    position: 'absolute',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(100,200,100,0.18)',
    shadowColor: '#81C784', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 60, elevation: 0,
  },

  // Rings
  ring2: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  ring1: {
    position: 'absolute', width: 175, height: 175, borderRadius: 87.5,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },

  // Logo
  logoWrap: { marginBottom: 26 },
  logoGradBorder: {
    width: 148, height: 148, borderRadius: 74,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 16,
  },
  logoCircle: {
    width: 128, height: 128, borderRadius: 64,
    backgroundColor: '#fff', overflow: 'hidden',
    justifyContent: 'center', alignItems: 'center',
  },
  logoImg: { width: 128, height: 128, borderRadius: 64 },

  // Title
  titleWrap: { overflow: 'hidden', marginBottom: 10 },
  title: {
    fontSize: 44, fontWeight: '900', color: '#FFFFFF',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 12,
  },
  shimmer: {
    position: 'absolute', top: 0, left: 0, bottom: 0, width: 80,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ skewX: '-20deg' }],
  },

  // Badge
  badge: { marginBottom: 14 },
  badgeGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20,
    shadowColor: '#2E7D32', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5, shadowRadius: 6, elevation: 6,
  },
  badgeText: { fontSize: 11, color: '#fff', fontWeight: '700', letterSpacing: 0.8 },

  // Subtitle
  subtitle: {
    fontSize: 14.5, color: 'rgba(255,255,255,0.72)',
    letterSpacing: 1, fontWeight: '500',
  },

  // Divider
  divRow: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  divLine: { height: 1, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 1 },

  // Tagline
  tagline: {
    marginTop: 14, fontSize: 13, color: 'rgba(255,255,255,0.5)',
    letterSpacing: 0.8, fontStyle: 'italic',
  },

  // Dots
  dotsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 10, zIndex: 2 },
  dot: { width: 9, height: 9, borderRadius: 4.5, backgroundColor: '#81C784' },

  version: {
    position: 'absolute', alignSelf: 'center',
    fontSize: 11, color: 'rgba(255,255,255,0.25)', letterSpacing: 0.5,
  },
});

export default SplashScreen;
