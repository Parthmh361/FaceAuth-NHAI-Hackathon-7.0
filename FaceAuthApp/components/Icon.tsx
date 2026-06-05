/**
 * Dependency-free vector icons.
 *
 * The app must stay installable without a native rebuild, so instead of an
 * icon font (react-native-vector-icons) or SVG (react-native-svg) we draw a
 * small, consistent set of line/filled glyphs using plain Views. Every icon
 * scales from `size` and tints from `color`.
 */
import React from 'react';
import { View, ViewStyle } from 'react-native';
import { colors } from '../theme';

export type IconName =
  | 'home' | 'history' | 'users' | 'settings'
  | 'enroll' | 'verify'
  | 'check' | 'close' | 'plus'
  | 'checkCircle' | 'closeCircle' | 'shieldCheck'
  | 'eye' | 'smile' | 'arrowLeft' | 'arrowRight'
  | 'person' | 'cameraFlip';

export function Icon({
  name, size = 24, color = colors.text,
}: { name: IconName; size?: number; color?: string }) {
  const t = Math.max(2, Math.round(size * 0.085)); // stroke width
  const box: ViewStyle = { width: size, height: size, alignItems: 'center', justifyContent: 'center' };
  const abs: ViewStyle = { position: 'absolute' };

  const bar = (w: number, h: number, extra?: ViewStyle): ViewStyle => ({
    width: w, height: h, backgroundColor: color, borderRadius: Math.min(w, h) / 2, ...extra,
  });
  const ring = (d: number): ViewStyle => ({
    width: d, height: d, borderRadius: d / 2, borderWidth: t, borderColor: color,
  });
  const disc = (d: number): ViewStyle => ({
    width: d, height: d, borderRadius: d / 2, backgroundColor: color,
  });

  switch (name) {
    case 'check':
      return (
        <View style={box}>
          <View style={{
            width: size * 0.34, height: size * 0.6, marginTop: -size * 0.08,
            borderColor: color, borderRightWidth: t, borderBottomWidth: t,
            transform: [{ rotate: '45deg' }],
          }} />
        </View>
      );

    case 'close':
      return (
        <View style={box}>
          <View style={[abs, bar(size * 0.78, t, { transform: [{ rotate: '45deg' }] })]} />
          <View style={[abs, bar(size * 0.78, t, { transform: [{ rotate: '-45deg' }] })]} />
        </View>
      );

    case 'plus':
      return (
        <View style={box}>
          <View style={[abs, bar(size * 0.7, t)]} />
          <View style={[abs, bar(t, size * 0.7)]} />
        </View>
      );

    case 'checkCircle':
      return (
        <View style={box}>
          <View style={[disc(size), { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={{
              width: size * 0.26, height: size * 0.46, marginTop: -size * 0.06,
              borderColor: '#fff', borderRightWidth: t, borderBottomWidth: t,
              transform: [{ rotate: '45deg' }],
            }} />
          </View>
        </View>
      );

    case 'closeCircle':
      return (
        <View style={box}>
          <View style={[disc(size), { alignItems: 'center', justifyContent: 'center' }]}>
            <View style={[abs, { width: size * 0.5, height: t, backgroundColor: '#fff', borderRadius: t, transform: [{ rotate: '45deg' }] }]} />
            <View style={[abs, { width: size * 0.5, height: t, backgroundColor: '#fff', borderRadius: t, transform: [{ rotate: '-45deg' }] }]} />
          </View>
        </View>
      );

    case 'shieldCheck':
      return (
        <View style={box}>
          {/* shield body: rounded top, tapered bottom via rotated square */}
          <View style={{
            width: size * 0.62, height: size * 0.5, backgroundColor: color,
            borderTopLeftRadius: size * 0.16, borderTopRightRadius: size * 0.16,
            marginBottom: size * 0.26, alignItems: 'center', justifyContent: 'center',
          }} />
          <View style={[abs, {
            width: size * 0.44, height: size * 0.44, backgroundColor: color,
            bottom: size * 0.12, transform: [{ rotate: '45deg' }],
            borderBottomRightRadius: size * 0.1,
          }]} />
          <View style={[abs, {
            width: size * 0.18, height: size * 0.32, marginTop: -size * 0.02,
            borderColor: '#fff', borderRightWidth: t * 0.8, borderBottomWidth: t * 0.8,
            transform: [{ rotate: '45deg' }],
          }]} />
        </View>
      );

    case 'eye':
      return (
        <View style={box}>
          <View style={{
            width: size * 0.92, height: size * 0.56, borderRadius: size * 0.28,
            borderWidth: t, borderColor: color, alignItems: 'center', justifyContent: 'center',
          }}>
            <View style={disc(size * 0.26)} />
          </View>
        </View>
      );

    case 'smile':
      return (
        <View style={box}>
          <View style={[ring(size * 0.92)]} />
          <View style={[abs, disc(size * 0.1), { top: size * 0.32, left: size * 0.3 }]} />
          <View style={[abs, disc(size * 0.1), { top: size * 0.32, right: size * 0.3 }]} />
          {/* bottom arc = smile (only bottom border colored) */}
          <View style={[abs, {
            width: size * 0.46, height: size * 0.46, borderRadius: size * 0.23,
            borderWidth: t, borderColor: 'transparent', borderBottomColor: color,
            bottom: size * 0.16,
          }]} />
        </View>
      );

    case 'arrowRight':
    case 'arrowLeft':
      return (
        <View style={[box, name === 'arrowLeft' && { transform: [{ scaleX: -1 }] }]}>
          <View style={[abs, bar(size * 0.66, t, { left: size * 0.14 })]} />
          <View style={[abs, {
            width: size * 0.3, height: size * 0.3, right: size * 0.18,
            borderColor: color, borderTopWidth: t, borderRightWidth: t,
            transform: [{ rotate: '45deg' }],
          }]} />
        </View>
      );

    case 'person':
    case 'users':
    case 'enroll':
      return (
        <View style={box}>
          <View style={[abs, ring(size * 0.4), { top: size * 0.06 }]} />
          <View style={[abs, {
            width: size * 0.66, height: size * 0.38, bottom: size * 0.06,
            borderTopLeftRadius: size * 0.33, borderTopRightRadius: size * 0.33,
            borderWidth: t, borderBottomWidth: 0, borderColor: color,
          }]} />
          {name === 'enroll' && (
            <View style={[abs, {
              right: -size * 0.04, bottom: -size * 0.02,
              width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2,
              backgroundColor: color, alignItems: 'center', justifyContent: 'center',
            }]}>
              <View style={[abs, { width: size * 0.22, height: t * 0.9, backgroundColor: '#fff', borderRadius: t }]} />
              <View style={[abs, { width: t * 0.9, height: size * 0.22, backgroundColor: '#fff', borderRadius: t }]} />
            </View>
          )}
        </View>
      );

    case 'verify':
      // a face inside a check — used for the Verify CTA
      return (
        <View style={box}>
          <View style={ring(size * 0.88)} />
          <View style={[abs, {
            width: size * 0.24, height: size * 0.42, marginTop: -size * 0.04,
            borderColor: color, borderRightWidth: t, borderBottomWidth: t,
            transform: [{ rotate: '45deg' }],
          }]} />
        </View>
      );

    case 'history':
      return (
        <View style={[box, { justifyContent: 'center' }]}>
          {[0, 1, 2].map(i => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: size * 0.07 }}>
              <View style={[disc(size * 0.14), { marginRight: size * 0.12 }]} />
              <View style={bar(size * 0.56, t)} />
            </View>
          ))}
        </View>
      );

    case 'settings':
      return (
        <View style={[box, { justifyContent: 'center' }]}>
          {[0.2, 0.62, 0.5].map((knob, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginVertical: size * 0.08, width: size * 0.84 }}>
              <View style={bar(size * 0.84, t * 0.8, { position: 'absolute' })} />
              <View style={[disc(size * 0.22), { position: 'absolute', left: knob * size * 0.84 }]} />
            </View>
          ))}
        </View>
      );

    case 'home':
      return (
        <View style={box}>
          {/* roof */}
          <View style={{
            width: 0, height: 0, backgroundColor: 'transparent',
            borderLeftWidth: size * 0.42, borderRightWidth: size * 0.42, borderBottomWidth: size * 0.34,
            borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: color,
            marginBottom: -t / 2,
          }} />
          {/* body */}
          <View style={{
            width: size * 0.56, height: size * 0.34, borderColor: color,
            borderWidth: t, borderTopWidth: 0,
          }} />
        </View>
      );

    case 'cameraFlip':
      // Two opposing arrows (→ top, ← bottom) = swap/flip glyph
      return (
        <View style={box}>
          {/* top: → */}
          <View style={[abs, bar(size * 0.52, t, { top: size * 0.28, left: size * 0.1 })]} />
          <View style={[abs, {
            width: size * 0.22, height: size * 0.22, top: size * 0.2, right: size * 0.12,
            borderColor: color, borderTopWidth: t, borderRightWidth: t,
            transform: [{ rotate: '45deg' }],
          }]} />
          {/* bottom: ← */}
          <View style={[abs, bar(size * 0.52, t, { bottom: size * 0.28, right: size * 0.1 })]} />
          <View style={[abs, {
            width: size * 0.22, height: size * 0.22, bottom: size * 0.2, left: size * 0.12,
            borderColor: color, borderTopWidth: t, borderRightWidth: t,
            transform: [{ rotate: '225deg' }],
          }]} />
        </View>
      );

    default:
      return <View style={box} />;
  }
}
