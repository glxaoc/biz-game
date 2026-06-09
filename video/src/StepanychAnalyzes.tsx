import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

type Props = { src: string; debug?: boolean };

export type Screen = { id: string; x: number; y: number; w: number; h: number; kind: string };
// доли кадра (картинка = 9:16, заполняет холст целиком)
export const SCREENS: Screen[] = [
  { id: 'КЛИЕНТЫ', x: 0.05, y: 0.245, w: 0.27, h: 0.185, kind: 'line' },
  { id: 'ПРИБЫЛЬ', x: 0.36, y: 0.245, w: 0.28, h: 0.185, kind: 'line' },
  { id: 'ЗАКАЗЫ', x: 0.68, y: 0.245, w: 0.27, h: 0.185, kind: 'line' },
  { id: 'ИСТОЧНИКИ', x: 0.05, y: 0.43, w: 0.26, h: 0.125, kind: 'pie' },
  { id: 'АКТИВНОСТЬ', x: 0.34, y: 0.43, w: 0.32, h: 0.125, kind: 'bars' },
  { id: 'КОНВЕРСИЯ', x: 0.68, y: 0.43, w: 0.27, h: 0.125, kind: 'funnel' },
];

// псевдо-шум для мерцания (детерминированный, без random — чтобы луп был стабильным)
const flick = (frame: number, seed: number) =>
  0.5 + 0.28 * Math.sin(frame * 0.45 + seed) + 0.12 * Math.sin(frame * 1.7 + seed * 2) + 0.1 * Math.sin(frame * 3.3 + seed);

export const StepanychAnalyzes: React.FC<Props> = ({ src, debug = false }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const url = staticFile(src);

  // луч-сканирование по всем экранам (лево→право), цикл
  const sweepP = (frame % 110) / 110;
  const sweepX = interpolate(sweepP, [0, 1], [0.02, 0.97]);
  const clusterTop = 0.245 * height;
  const clusterH = (0.555 - 0.245) * height;

  return (
    <AbsoluteFill style={{ backgroundColor: '#0c0a08' }}>
      <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover', imageRendering: 'pixelated' }} />

      {/* мерцание + скан-линия на каждом экране */}
      {SCREENS.map((s, i) => {
        const L = s.x * width, T = s.y * height, W = s.w * width, H = s.h * height;
        const col = s.kind === 'line' && s.id === 'ПРИБЫЛЬ' ? '255,200,80' : '110,210,120';
        const glowOp = 0.05 + Math.max(0, flick(frame, i * 1.7)) * 0.12;
        // скан-линия движется сверху вниз внутри экрана
        const scanY = ((frame * 2.2 + i * 40) % (H + 20)) - 10;
        // мигающий индикатор
        const blink = Math.sin(frame * 0.6 + i) > 0.2 ? 1 : 0.25;
        return (
          <div key={s.id} style={{ position: 'absolute', left: L, top: T, width: W, height: H, overflow: 'hidden', pointerEvents: 'none' }}>
            {/* свечение «экран работает» */}
            <div style={{ position: 'absolute', inset: 0, background: `rgba(${col},1)`, opacity: glowOp, mixBlendMode: 'screen' }} />
            {/* бегущая скан-линия */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: scanY, height: 6, background: `linear-gradient(90deg, rgba(${col},0), rgba(${col},0.5), rgba(${col},0))`, mixBlendMode: 'screen' }} />
            {/* индикатор LIVE в углу */}
            <div style={{ position: 'absolute', right: 8, top: 8, width: 9, height: 9, borderRadius: '50%', background: '#7dff9b', opacity: blink, boxShadow: '0 0 8px #7dff9b' }} />
          </div>
        );
      })}

      {/* вращающийся блик на пироге «ИСТОЧНИКИ» */}
      {(() => {
        const pie = SCREENS[3];
        const cx = (pie.x + 0.085) * width;
        const cy = (pie.y + 0.062) * height;
        const r = 0.085 * width;
        return (
          <div
            style={{
              position: 'absolute', left: cx - r, top: cy - r, width: r * 2, height: r * 2, borderRadius: '50%',
              background: `conic-gradient(from ${frame * 4}deg, rgba(255,255,255,0) 0deg, rgba(255,255,255,0.45) 24deg, rgba(255,255,255,0) 60deg)`,
              mixBlendMode: 'screen', pointerEvents: 'none', opacity: 0.6,
            }}
          />
        );
      })()}

      {/* общий луч-сканирование по кластеру экранов */}
      <div
        style={{
          position: 'absolute', top: clusterTop, height: clusterH, left: `${sweepX * 100}%`, width: width * 0.10,
          transform: 'skewX(-10deg)', pointerEvents: 'none',
          background: 'linear-gradient(90deg, rgba(120,230,150,0) 0%, rgba(120,230,150,0.22) 50%, rgba(120,230,150,0) 100%)',
          mixBlendMode: 'screen',
          opacity: interpolate(sweepP, [0, 0.1, 0.9, 1], [0, 1, 1, 0]),
        }}
      />

      {/* лёгкая виньетка */}
      <AbsoluteFill style={{ boxShadow: 'inset 0 0 200px 40px #00000055', pointerEvents: 'none' }} />

      {debug && (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
          {SCREENS.map((s) => (
            <div key={s.id} style={{ position: 'absolute', left: s.x * width, top: s.y * height, width: s.w * width, height: s.h * height, border: '3px solid #ff2d6f', color: '#fff', fontFamily: 'monospace', fontSize: 20 }}>{s.id}</div>
          ))}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
