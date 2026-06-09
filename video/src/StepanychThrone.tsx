import React from 'react';
import {
  AbsoluteFill,
  Img,
  staticFile,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  random,
} from 'remotion';

type Props = { src: string };

// Анимация статичной пиксель-картинки «Степаныч на троне»:
// размытый фон-cover + резкая картинка по ширине + оживляющие оверлеи
// (дыхание-зум, свечение короны, искры, парящие монеты, блик по вывеске).
export const StepanychThrone: React.FC<Props> = ({ src }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const url = staticFile(src);

  // Ken Burns: пинг-понг зум (бесшовный луп) + лёгкое парение
  const zoom = interpolate(frame, [0, durationInFrames / 2, durationInFrames], [1.0, 1.055, 1.0]);
  const floatY = Math.sin((frame / durationInFrames) * Math.PI * 2) * 7;

  // пульс свечения за короной
  const glow = 0.4 + (Math.sin(frame / 13) * 0.5 + 0.5) * 0.45;

  // мерцающие искры вокруг короны/трона (доля от кадра)
  const sparks = [
    { x: 0.30, y: 0.40, s: 26 }, { x: 0.71, y: 0.40, s: 30 },
    { x: 0.38, y: 0.33, s: 20 }, { x: 0.63, y: 0.34, s: 22 },
    { x: 0.50, y: 0.29, s: 24 }, { x: 0.24, y: 0.47, s: 18 },
    { x: 0.77, y: 0.47, s: 18 }, { x: 0.45, y: 0.44, s: 14 }, { x: 0.57, y: 0.45, s: 16 },
  ];

  // парящие монеты снизу (две стопки по краям)
  const coins = Array.from({ length: 10 }).map((_, i) => {
    const side = i % 2 === 0 ? 0.11 : 0.89;
    const phase = (frame / 60 + random(`c${i}`)) % 1;
    const x = side + (random(`cx${i}`) - 0.5) * 0.06;
    const y = interpolate(phase, [0, 1], [0.92, 0.66]);
    const op = interpolate(phase, [0, 0.15, 0.8, 1], [0, 1, 1, 0]);
    const sz = 16 + random(`cs${i}`) * 12;
    return { x, y, op, sz, i };
  });

  // блик по верхней вывеске (диагональная полоса, проходит раз в цикл)
  const shimmer = ((frame % 150) / 150);
  const shimmerX = interpolate(shimmer, [0, 1], [-0.4, 1.4]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a120c', overflow: 'hidden' }}>
      {/* размытый фон-cover — заполняет весь вертикальный кадр */}
      <Img
        src={url}
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          filter: 'blur(28px) brightness(0.5) saturate(1.1)',
          transform: 'scale(1.15)',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(120% 80% at 50% 42%, #00000000 40%, #000000aa 100%)' }} />

      {/* резкая картинка по ширине + дыхание-зум */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Img
          src={url}
          style={{
            width: '100%',
            objectFit: 'contain',
            transform: `translateY(${floatY}px) scale(${zoom})`,
            filter: 'drop-shadow(0 20px 40px #00000080)',
            imageRendering: 'pixelated',
          }}
        />
      </AbsoluteFill>

      {/* пульсирующее свечение за короной (screen-blend) */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '43%',
            width: width * 0.9,
            height: width * 0.9,
            transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(circle, rgba(255,210,90,0.9) 0%, rgba(255,170,40,0.35) 28%, rgba(0,0,0,0) 62%)',
            opacity: glow,
          }}
        />
      </AbsoluteFill>

      {/* мерцающие искры */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        {sparks.map((sp, i) => {
          const tw = Math.sin(frame / 7 + i * 1.3) * 0.5 + 0.5;
          const sc = 0.5 + tw * 0.9;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: sp.x * width,
                top: sp.y * height,
                width: sp.s,
                height: sp.s,
                transform: `translate(-50%,-50%) scale(${sc}) rotate(45deg)`,
                opacity: 0.25 + tw * 0.75,
                background:
                  'radial-gradient(circle, #fff 0%, #ffe27a 35%, rgba(255,210,90,0) 70%)',
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* парящие монеты */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {coins.map((c) => (
          <div
            key={c.i}
            style={{
              position: 'absolute',
              left: c.x * width,
              top: c.y * height,
              width: c.sz,
              height: c.sz,
              transform: 'translate(-50%,-50%)',
              borderRadius: '50%',
              background: 'radial-gradient(circle at 35% 30%, #ffe98a, #f2b24a 55%, #b9760f)',
              boxShadow: '0 0 8px #ffcf5a88',
              opacity: c.op,
            }}
          />
        ))}
      </AbsoluteFill>

      {/* блик по верхней вывеске */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute',
            top: '4%',
            left: `${shimmerX * 100}%`,
            width: '22%',
            height: '24%',
            transform: 'skewX(-18deg)',
            background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)',
            opacity: 0.6,
          }}
        />
      </AbsoluteFill>

      {/* лёгкая виньетка */}
      <AbsoluteFill
        style={{
          boxShadow: 'inset 0 0 220px 60px #00000070',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
