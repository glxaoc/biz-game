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

// Натуральные пропорции присланной картинки (1086×1448)
const IMG_AR = 1086 / 1448; // ширина / высота

// Анимация статичной пиксель-картинки «Степаныч на троне».
// Работает в ЛЮБОМ формате (9:16 / 16:9 / 1:1): картинка вписывается целиком (contain),
// бока/поля заполняются размытым cover-фоном, а все оверлеи (свечение, искры, монеты, блик)
// привязаны к реальному прямоугольнику картинки — поэтому ничего не разъезжается.
export const StepanychThrone: React.FC<Props> = ({ src }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const url = staticFile(src);

  // прямоугольник, в который реально вписана картинка (contain)
  const canvasAR = width / height;
  let dispW: number, dispH: number;
  if (canvasAR > IMG_AR) { dispH = height; dispW = height * IMG_AR; } // широкий холст → ограничивает высота
  else { dispW = width; dispH = width / IMG_AR; }                     // высокий холст → ограничивает ширина
  const x0 = (width - dispW) / 2;
  const y0 = (height - dispH) / 2;
  // координаты по ДОЛЯМ картинки → пиксели холста
  const ix = (f: number) => x0 + f * dispW;
  const iy = (f: number) => y0 + f * dispH;
  const isz = (f: number) => f * dispW;

  // Ken Burns: пинг-понг зум (бесшовный луп) + лёгкое парение
  const zoom = interpolate(frame, [0, durationInFrames / 2, durationInFrames], [1.0, 1.05, 1.0]);
  const floatY = Math.sin((frame / durationInFrames) * Math.PI * 2) * 6;

  // пульс свечения за короной
  const glow = 0.4 + (Math.sin(frame / 13) * 0.5 + 0.5) * 0.45;

  // искры (доли картинки: вокруг короны/трона)
  const sparks = [
    { x: 0.30, y: 0.40, s: 0.030 }, { x: 0.71, y: 0.40, s: 0.034 },
    { x: 0.38, y: 0.33, s: 0.023 }, { x: 0.63, y: 0.34, s: 0.025 },
    { x: 0.50, y: 0.29, s: 0.027 }, { x: 0.24, y: 0.47, s: 0.020 },
    { x: 0.77, y: 0.47, s: 0.020 }, { x: 0.45, y: 0.44, s: 0.016 }, { x: 0.57, y: 0.45, s: 0.018 },
  ];

  // парящие монеты по краям картинки
  const coins = Array.from({ length: 10 }).map((_, i) => {
    const side = i % 2 === 0 ? 0.11 : 0.89;
    const phase = (frame / 60 + random(`c${i}`)) % 1;
    const x = side + (random(`cx${i}`) - 0.5) * 0.06;
    const y = interpolate(phase, [0, 1], [0.92, 0.66]);
    const op = interpolate(phase, [0, 0.15, 0.8, 1], [0, 1, 1, 0]);
    const sz = isz(0.018 + random(`cs${i}`) * 0.013);
    return { x, y, op, sz, i };
  });

  // блик по верхней вывеске
  const shimmer = (frame % 150) / 150;
  const shimmerX = interpolate(shimmer, [0, 1], [-0.4, 1.4]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a120c', overflow: 'hidden' }}>
      {/* размытый фон-cover — заполняет весь кадр (бока в горизонтали) */}
      <Img
        src={url}
        style={{
          position: 'absolute', width: '100%', height: '100%', objectFit: 'cover',
          filter: 'blur(34px) brightness(0.45) saturate(1.1)', transform: 'scale(1.18)',
        }}
      />
      <AbsoluteFill style={{ background: 'radial-gradient(120% 90% at 50% 45%, #00000000 38%, #000000b0 100%)' }} />

      {/* резкая картинка целиком (contain) + дыхание-зум */}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
        <Img
          src={url}
          style={{
            width: '100%', height: '100%', objectFit: 'contain',
            transform: `translateY(${floatY}px) scale(${zoom})`,
            filter: 'drop-shadow(0 20px 50px #000000a0)',
            imageRendering: 'pixelated',
          }}
        />
      </AbsoluteFill>

      {/* пульсирующее свечение за короной */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <div
          style={{
            position: 'absolute', left: ix(0.5), top: iy(0.43),
            width: isz(0.9), height: isz(0.9), transform: 'translate(-50%,-50%)',
            background: 'radial-gradient(circle, rgba(255,210,90,0.9) 0%, rgba(255,170,40,0.35) 28%, rgba(0,0,0,0) 62%)',
            opacity: glow,
          }}
        />
      </AbsoluteFill>

      {/* искры */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        {sparks.map((sp, i) => {
          const tw = Math.sin(frame / 7 + i * 1.3) * 0.5 + 0.5;
          const sc = 0.5 + tw * 0.9;
          const s = isz(sp.s);
          return (
            <div key={i} style={{
              position: 'absolute', left: ix(sp.x), top: iy(sp.y), width: s, height: s,
              transform: `translate(-50%,-50%) scale(${sc}) rotate(45deg)`, opacity: 0.25 + tw * 0.75,
              background: 'radial-gradient(circle, #fff 0%, #ffe27a 35%, rgba(255,210,90,0) 70%)',
            }} />
          );
        })}
      </AbsoluteFill>

      {/* парящие монеты */}
      <AbsoluteFill style={{ pointerEvents: 'none' }}>
        {coins.map((c) => (
          <div key={c.i} style={{
            position: 'absolute', left: ix(c.x), top: iy(c.y), width: c.sz, height: c.sz,
            transform: 'translate(-50%,-50%)', borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 30%, #ffe98a, #f2b24a 55%, #b9760f)',
            boxShadow: '0 0 8px #ffcf5a88', opacity: c.op,
          }} />
        ))}
      </AbsoluteFill>

      {/* блик по верхней вывеске */}
      <AbsoluteFill style={{ mixBlendMode: 'screen', pointerEvents: 'none' }}>
        <div style={{
          position: 'absolute', top: iy(0.04), left: ix(shimmerX), width: isz(0.22), height: isz(0.30),
          transform: 'skewX(-18deg)',
          background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0) 100%)',
          opacity: 0.6,
        }} />
      </AbsoluteFill>

      <AbsoluteFill style={{ boxShadow: 'inset 0 0 240px 60px #00000070', pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
