import React from 'react';
import { AbsoluteFill, staticFile, useVideoConfig } from 'remotion';

const SHEET = 'gennady-sprite.png';
const FRAMES = 4; // 0 шаг-A, 1 шаг-B, 2 покой, 3 покой(хвост)

// один кадр спрайт-листа, увеличенный без сглаживания, на прозрачном фоне
const Frame: React.FC<{ i: number; size: number }> = ({ i, size }) => (
  <div
    style={{
      width: size,
      height: size,
      backgroundImage: `url(${staticFile(SHEET)})`,
      backgroundRepeat: 'no-repeat',
      backgroundSize: `${size * FRAMES}px ${size}px`,
      backgroundPosition: `${-i * size}px 0`,
      imageRendering: 'pixelated',
    }}
  />
);

// Готовый файл: один кадр Геннадия крупно, ПРОЗРАЧНЫЙ фон.
export const GennadyShot: React.FC<{ frame: number }> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const size = Math.round(Math.min(width, height) * 0.86);
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <Frame i={frame} size={size} />
    </AbsoluteFill>
  );
};

// Превью: все 4 кадра в ряд на тёмном фоне (чтобы выбрать позу).
export const GennadyContact: React.FC = () => {
  const cell = 240;
  return (
    <AbsoluteFill style={{ background: '#14110d', justifyContent: 'center', alignItems: 'center', gap: 24, flexDirection: 'row' }}>
      {Array.from({ length: FRAMES }).map((_, i) => (
        <div key={i} style={{ textAlign: 'center', color: '#cdbfa6', fontFamily: 'monospace', fontSize: 28 }}>
          <Frame i={i} size={cell} />
          <div>{i}</div>
        </div>
      ))}
    </AbsoluteFill>
  );
};
