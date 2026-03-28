import React, { useState, useRef } from 'react';
import { View, StyleSheet, PanResponder, TouchableOpacity, Text } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

const SignaturePad = ({ onOK }) => {
  const [lines, setLines] = useState([]);
  const currentLine = useRef([]);

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentLine.current = [`${locationX},${locationY}`];
      setLines((prev) => [...prev, currentLine.current]);
    },
    onPanResponderMove: (evt) => {
      const { locationX, locationY } = evt.nativeEvent;
      currentLine.current.push(`${locationX},${locationY}`);
      setLines((prev) => {
        const newLines = [...prev];
        newLines[newLines.length - 1] = [...currentLine.current];
        return newLines;
      });
    },
    onPanResponderRelease: () => {
      // Nothing needs to be done here
    },
  });

  const handleClear = () => {
    setLines([]);
    currentLine.current = [];
  };

  const handleSave = () => {
    if (lines.length === 0) {
      onOK(null);
      return;
    }
    // We will save the SVG data points as a string, but ideally we would convert it to an image.
    // However, saving to Cloudinary from pure SVG string requires backend rendering.
    // For now, returning the points so the frontend knows a signature exists.
    onOK(JSON.stringify(lines));
  };

  return (
    <View style={styles.container}>
      <View style={styles.svgContainer} {...panResponder.panHandlers}>
        <Svg style={StyleSheet.absoluteFill}>
          {lines.map((line, i) => (
            <Polyline
              key={i}
              points={line.join(' ')}
              fill="none"
              stroke="black"
              strokeWidth="3"
            />
          ))}
        </Svg>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.clearBtn} onPress={handleClear}>
          <Text style={styles.clearText}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveText}>Save Signature</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  svgContainer: { flex: 1, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: 1, borderColor: '#ddd', overflow: 'hidden' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 12 },
  clearBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#ffebee' },
  clearText: { color: '#d32f2f', fontWeight: 'bold' },
  saveBtn: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#e8f5e9' },
  saveText: { color: '#2e7d32', fontWeight: 'bold' },
});

export default SignaturePad;
