// Dessin de l'exosquelette sur le flux caméra (section 8.2) avec react-native-svg.
import React from 'react';
import { StyleSheet } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { colors } from '../theme';

const CONNECTIONS = [
  ['left_shoulder', 'right_shoulder'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_shoulder', 'left_hip'],
  ['right_shoulder', 'right_hip'],
  ['left_hip', 'right_hip'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
];

/**
 * keypoints : coordonnées en pixels de la vidéo (videoW × videoH).
 * La vidéo est affichée en « object-fit: cover » dans un cadre width × height,
 * on applique donc la même mise à l'échelle et le même recadrage.
 */
export default function ExoskeletonOverlay({ keypoints, videoW, videoH, width, height, isValidPosture }) {
  if (!keypoints?.length || !videoW || !videoH || !width || !height) return null;
  const s = Math.max(width / videoW, height / videoH);
  const ox = (width - videoW * s) / 2;
  const oy = (height - videoH * s) / 2;
  const visible = new Map(
    keypoints.filter((k) => k.score > 0.5).map((k) => [k.name, { x: k.x * s + ox, y: k.y * s + oy }]),
  );
  const stroke = isValidPosture ? colors.accent : colors.primary;

  return (
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      {CONNECTIONS.map(([a, b]) => {
        const p1 = visible.get(a);
        const p2 = visible.get(b);
        if (!p1 || !p2) return null;
        return (
          <Line
            key={`${a}-${b}`}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            stroke={stroke}
            strokeWidth={4}
            strokeLinecap="round"
          />
        );
      })}
      {[...visible.entries()]
        .filter(([name]) => name !== 'nose')
        .map(([name, p]) => (
          <Circle key={name} cx={p.x} cy={p.y} r={6} fill="#fff" stroke={stroke} strokeWidth={3} />
        ))}
    </Svg>
  );
}
