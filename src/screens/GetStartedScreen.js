import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Animated, Easing, Dimensions, StatusBar, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop, Path } from 'react-native-svg';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');

/* ── Particles ── */
const PARTICLES = Array.from({ length: 32 }, () => ({
  cx: Math.random() * width,
  cy: Math.random() * height,
  r:  1 + Math.random() * 2.8,
  op: 0.06 + Math.random() * 0.16,
}));

/* ── Floating icons ── */
const FLOAT_ICONS = [
  { name: 'leaf',      lib: 'I', size: 30, top: '5%',    left: '7%',   delay: 0   },
  { name: 'flower',    lib: 'I', size: 26, top: '4%',    right: '9%',  delay: 280 },
  { name: 'nutrition', lib: 'I', size: 24, bottom: '13%',left: '5%',   delay: 140 },
  { name: 'grain',     lib: 'M', size: 28, bottom: '11%',right: '7%',  delay: 420 },
  { name: 'sprout',    lib: 'M', size: 22, top: '22%',   left: '84%',  delay: 190 },
  { name: 'leaf',      lib: 'I', size: 18, top: '32%',   left: '3%',   delay: 480 },
  { name: 'nutrition', lib: 'I', size: 20, top: '48%',   right: '4%',  delay: 320 },
];

const FloatIcon = ({ icon, index }) => {
  const fade  = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const rot   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 900, delay: icon.delay + 500, useNativeDriver: true }).start();
    Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 2200 + index * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(float, { toValue: 0, duration: 2200 + index * 200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(rot, { toValue: 1, duration: 3500 + index * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(rot, { toValue: 0, duration: 3500 + index * 400, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
  }, []);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const rotate     = rot.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] });
  const pos = {};
  if (icon.top)    pos.top    = icon.top;
  if (icon.bottom) pos.bottom = icon.bottom;
  if (icon.left)   pos.left   = icon.left;
  if (icon.right)  pos.right  = icon.right;
  const Icon = icon.lib === 'M' ? MaterialCommunityIcons : Ionicons;
  return (
    <Animated.View style={[styles.floatIcon, pos, { opacity: fade, transform: [{ translateY }, { rotate }] }]}>
      <Icon name={icon.name} size={icon.size} color="rgba(255,255,255,0.14)" />
    </Animated.View>
  );
};

/* ── Feature pill ── */
const FeaturePill = ({ icon, label, delay, anim }) => (
  <Animated.View style={[styles.pill, { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
    <LinearGradient colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.08)']} style={styles.pillGrad}>
      <Ionicons name={icon} size={15} color="#A5D6A7" />
      <Text style={styles.pillText}>{label}</Text>
    </LinearGradient>
  </Animated.View>
);

/* ── Spinning ring ── */
const SpinRing = ({ size, color, duration, reverse }) => {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spin, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: reverse ? ['360deg', '0deg'] : ['0deg', '360deg'] });
  return (
    <Animated.View style={[styles.spinRing, { width: size, height: size, borderRadius: size / 2, borderColor: color, transform: [{ rotate }] }]} />
  );
};

/* ══════════════════════════════════════════════ */
const GetStartedScreen = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const bgFade      = useRef(new Animated.Value(0)).current;
  const logoScale   = useRef(new Animated.Value(0.3)).current;
  const logoFade    = useRef(new Animated.Value(0)).current;
  const glow        = useRef(new Animated.Value(0.3)).current;
  const ring1Scale  = useRef(new Animated.Value(0.5)).current;
  const ring1Fade   = useRef(new Animated.Value(0)).current;
  const ring2Scale  = useRef(new Animated.Value(0.5)).current;
  const ring2Fade   = useRef(new Animated.Value(0)).current;
  const titleY      = useRef(new Animated.Value(40)).current;
  const titleFade   = useRef(new Animated.Value(0)).current;
  const subY        = useRef(new Animated.Value(25)).current;
  const subFade     = useRef(new Animated.Value(0)).current;
  const pill1Fade   = useRef(new Animated.Value(0)).current;
  const pill2Fade   = useRef(new Animated.Value(0)).current;
  const pill3Fade   = useRef(new Animated.Value(0)).current;
  const cardY       = useRef(new Animated.Value(70)).current;
  const cardFade    = useRef(new Animated.Value(0)).current;
  const btnScale    = useRef(new Animated.Value(0.8)).current;
  const btnFade     = useRef(new Animated.Value(0)).current;
  const shimmer     = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    StatusBar.setBarStyle('light-content');

    Animated.timing(bgFade, { toValue: 1, duration: 600, useNativeDriver: true }).start();

    Animated.parallel([
      Animated.spring(logoScale, { toValue: 1, friction: 4, tension: 28, delay: 150, useNativeDriver: true }),
      Animated.timing(logoFade,  { toValue: 1, duration: 800, delay: 150, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.spring(ring1Scale, { toValue: 1, friction: 5, tension: 22, delay: 300, useNativeDriver: true }),
      Animated.timing(ring1Fade,  { toValue: 1, duration: 700, delay: 300, useNativeDriver: true }),
      Animated.spring(ring2Scale, { toValue: 1, friction: 5, tension: 18, delay: 500, useNativeDriver: true }),
      Animated.timing(ring2Fade,  { toValue: 1, duration: 700, delay: 500, useNativeDriver: true }),
    ]).start();

    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1,   duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.3, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();

    Animated.parallel([
      Animated.timing(titleFade, { toValue: 1, duration: 700, delay: 550, useNativeDriver: true }),
      Animated.timing(titleY,    { toValue: 0, duration: 700, delay: 550, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(subFade, { toValue: 1, duration: 600, delay: 750, useNativeDriver: true }),
      Animated.timing(subY,    { toValue: 0, duration: 600, delay: 750, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    Animated.stagger(150, [
      Animated.timing(pill1Fade, { toValue: 1, duration: 500, delay: 900, useNativeDriver: true }),
      Animated.timing(pill2Fade, { toValue: 1, duration: 500, delay: 900, useNativeDriver: true }),
      Animated.timing(pill3Fade, { toValue: 1, duration: 500, delay: 900, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(cardFade, { toValue: 1, duration: 700, delay: 1100, useNativeDriver: true }),
      Animated.timing(cardY,    { toValue: 0, duration: 700, delay: 1100, easing: Easing.out(Easing.back(1)), useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.spring(btnScale, { toValue: 1, friction: 4, tension: 45, delay: 1400, useNativeDriver: true }),
      Animated.timing(btnFade,  { toValue: 1, duration: 500, delay: 1400, useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.timing(shimmer, { toValue: width * 1.5, duration: 2000, delay: 1800, easing: Easing.linear, useNativeDriver: false })
    ).start();
  }, []);

  return (
    <View style={styles.root}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />

      {/* Gradient background */}
      <LinearGradient
        colors={['#071A08', '#0D3B10', '#1B5E20', '#2E7D32', '#1B5E20', '#0D3B10']}
        locations={[0, 0.15, 0.35, 0.55, 0.78, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* SVG particles + radial glow */}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <RadialGradient id="rg1" cx="50%" cy="35%" r="55%">
            <Stop offset="0%"   stopColor="#66BB6A" stopOpacity="0.2" />
            <Stop offset="100%" stopColor="#071A08" stopOpacity="0"   />
          </RadialGradient>
          <RadialGradient id="rg2" cx="50%" cy="85%" r="45%">
            <Stop offset="0%"   stopColor="#388E3C" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#071A08" stopOpacity="0"    />
          </RadialGradient>
        </Defs>
        <Circle cx={width / 2} cy={height * 0.35} r={width * 0.75} fill="url(#rg1)" />
        <Circle cx={width / 2} cy={height * 0.85} r={width * 0.6}  fill="url(#rg2)" />
        {PARTICLES.map((p, i) => (
          <Circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill="white" opacity={p.op} />
        ))}
        {/* curved top arc */}
        <Path
          d={`M0,${height * 0.52} Q${width / 2},${height * 0.44} ${width},${height * 0.52}`}
          stroke="rgba(255,255,255,0.05)" strokeWidth={1.5} fill="none"
        />
      </Svg>

      {/* Bottom wave */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.3)']}
        style={styles.bottomWave}
      />

      {/* Floating icons */}
      {FLOAT_ICONS.map((icon, i) => <FloatIcon key={i} icon={icon} index={i} />)}

      <Animated.View style={[styles.content, { opacity: bgFade, paddingTop: insets.top, paddingBottom: insets.bottom }]}>

        {/* ── HERO SECTION ── */}
        <View style={styles.heroSection}>
          {/* Glow */}
          <Animated.View style={[styles.glow, { opacity: glow }]} />

          {/* Spinning rings */}
          <SpinRing size={220} color="rgba(129,199,132,0.1)"  duration={14000} />
          <SpinRing size={188} color="rgba(255,255,255,0.07)" duration={9000}  reverse />

          {/* Entrance rings */}
          <Animated.View style={[styles.ring2, { opacity: ring2Fade, transform: [{ scale: ring2Scale }] }]} />
          <Animated.View style={[styles.ring1, { opacity: ring1Fade, transform: [{ scale: ring1Scale }] }]} />

          {/* Logo */}
          <Animated.View style={[styles.logoWrap, { opacity: logoFade, transform: [{ scale: logoScale }] }]}>
            <LinearGradient
              colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.06)']}
              style={styles.logoBorder}
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
        </View>

        {/* ── TITLE ── */}
        <Animated.Text style={[styles.title, { opacity: titleFade, transform: [{ translateY: titleY }] }]}>
          Farmer Crate
        </Animated.Text>

        {/* ── SUBTITLE ── */}
        <Animated.Text style={[styles.subtitle, { opacity: subFade, transform: [{ translateY: subY }] }]}>
          Connecting Farmers &amp; Customers
        </Animated.Text>

        {/* ── FEATURE PILLS ── */}
        <View style={styles.pillsRow}>
          <FeaturePill icon="leaf"         label="100% Fresh"  delay={900}  anim={pill1Fade} />
          <FeaturePill icon="flash"        label="Fast Delivery" delay={1050} anim={pill2Fade} />
          <FeaturePill icon="shield-checkmark" label="Trusted"  delay={1200} anim={pill3Fade} />
        </View>

        {/* ── CARD ── */}
        <Animated.View style={[styles.card, { opacity: cardFade, transform: [{ translateY: cardY }] }]}>

          {/* Top accent bar */}
          <LinearGradient
            colors={['#66BB6A', '#2E7D32']}
            style={styles.cardAccentBar}
          />

          {/* Heading */}
          <View style={styles.cardHeader}>
            <Ionicons name="sparkles" size={18} color="#FFD54F" />
            <Text style={styles.cardTitle}>Let's Get Started</Text>
            <Ionicons name="sparkles" size={18} color="#FFD54F" />
          </View>
          <Text style={styles.cardSub}>Your journey to freshness begins here</Text>

          {/* Feature rows */}
          {[
            { icon: 'storefront-outline',      label: 'Buy directly from local farmers', color: '#80CBC4', bg: 'rgba(128,203,196,0.15)' },
            { icon: 'bicycle-outline',          label: 'Fast & reliable delivery',        color: '#FFD54F', bg: 'rgba(255,213,79,0.12)'  },
            { icon: 'shield-checkmark-outline', label: 'Safe & secure payments',          color: '#A5D6A7', bg: 'rgba(165,214,167,0.15)' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <LinearGradient colors={[f.bg, 'transparent']} style={styles.featureIconCircle}>
                <Ionicons name={f.icon} size={17} color={f.color} />
              </LinearGradient>
              <Text style={styles.featureText}>{f.label}</Text>
              <Ionicons name="checkmark-circle" size={16} color="rgba(165,214,167,0.6)" />
            </View>
          ))}

          {/* Divider */}
          <View style={styles.divider} />

          {/* CTA Button */}
          <Animated.View style={[styles.btnWrap, { opacity: btnFade, transform: [{ scale: btnScale }] }]}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation.navigate('Login')}
              style={styles.btnTouch}
            >
              <LinearGradient
                colors={['#81C784', '#43A047', '#1B5E20']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.btnGrad}
              >
                <Animated.View style={[styles.btnShimmer, { transform: [{ translateX: shimmer }] }]} pointerEvents="none" />
                <Text style={styles.btnText}>Get Started</Text>
                <View style={styles.btnArrow}>
                  <Ionicons name="arrow-forward" size={18} color="#1B5E20" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

        </Animated.View>

      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#071A08' },

  bottomWave: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: height * 0.2,
    borderTopLeftRadius: width * 0.6, borderTopRightRadius: width * 0.6,
  },

  floatIcon: { position: 'absolute', zIndex: 1 },

  content: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, zIndex: 2,
  },

  /* Hero */
  heroSection: {
    width: 220, height: 220,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 20,
  },
  glow: {
    position: 'absolute', width: 240, height: 240, borderRadius: 120,
    backgroundColor: 'rgba(100,200,100,0.15)',
    shadowColor: '#81C784', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 50,
  },
  ring2: {
    position: 'absolute', width: 210, height: 210, borderRadius: 105,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  ring1: {
    position: 'absolute', width: 178, height: 178, borderRadius: 89,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)',
  },
  spinRing: {
    position: 'absolute', borderWidth: 1.5,
  },
  logoWrap: {},
  logoBorder: {
    width: 148, height: 148, borderRadius: 74,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 16,
  },
  logoCircle: {
    width: 126, height: 126, borderRadius: 63,
    backgroundColor: '#fff', overflow: 'hidden',
  },
  logoImg: { width: 126, height: 126 },

  /* Title */
  title: {
    fontSize: 40, fontWeight: '900', color: '#fff',
    letterSpacing: 2.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 10,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14, color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.8, fontWeight: '500', marginBottom: 16,
  },

  /* Pills */
  pillsRow: { flexDirection: 'row', gap: 8, marginBottom: 22 },
  pill: {},
  pillGrad: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  pillText: { fontSize: 11, color: '#fff', fontWeight: '600', letterSpacing: 0.5 },

  /* Card */
  card: {
    width: '100%',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.5,
    shadowRadius: 28,
    elevation: 20,
  },
  cardAccentBar: { width: '100%', height: 4 },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 20, marginBottom: 4, paddingHorizontal: 22,
  },
  cardTitle: { fontSize: 21, fontWeight: '800', color: '#fff', letterSpacing: 0.5 },
  cardSub: {
    fontSize: 12.5, color: 'rgba(255,255,255,0.55)',
    marginBottom: 18, letterSpacing: 0.4, paddingHorizontal: 22,
  },

  featureRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    width: '100%', paddingHorizontal: 22, marginBottom: 14,
  },
  featureIconCircle: {
    width: 38, height: 38, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  featureText: { fontSize: 13.5, color: 'rgba(255,255,255,0.88)', fontWeight: '500', flex: 1 },

  divider: {
    width: '100%', height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 16,
  },

  /* Button */
  btnWrap: { width: '100%', paddingHorizontal: 22, paddingBottom: 22 },
  btnTouch: {
    borderRadius: 16, overflow: 'hidden',
    shadowColor: '#66BB6A', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5, shadowRadius: 14, elevation: 10,
  },
  btnGrad: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 16, gap: 12, overflow: 'hidden',
  },
  btnShimmer: {
    position: 'absolute', top: 0, bottom: 0, width: 80,
    backgroundColor: 'rgba(255,255,255,0.18)',
    transform: [{ skewX: '-20deg' }],
  },
  btnText: { fontSize: 17, fontWeight: '800', color: '#fff', letterSpacing: 1 },
  btnArrow: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center', alignItems: 'center',
  },
});

export default GetStartedScreen;
