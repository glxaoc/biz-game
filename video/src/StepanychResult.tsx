import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
  random,
} from 'remotion';

type Props = {
  amount: number;
  clients: number;
  orders: number;
  label: string;
};

const COLORS = ['#ff5a8a', '#ffd84d', '#5ec46a', '#49c5e0', '#a06ae0', '#ff8a3d', '#ffffff'];

// easeOutCubic
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

export const StepanychResult: React.FC<Props> = ({ amount, clients, orders, label }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  // появление шапки
  const headIn = spring({ frame, fps, config: { damping: 200 } });

  // счётчик: считаем 0 → amount на кадрах 20..95
  const p = interpolate(frame, [20, 95], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const current = Math.round(amount * easeOut(p));

  // «удар» числа в момент завершения счёта
  const pop = spring({ frame: frame - 92, fps, config: { damping: 9, stiffness: 140, mass: 0.5 } });
  const popScale = 1 + Math.max(0, pop) * 0.12 * (frame < 92 ? 0 : 1);

  // подпись снизу
  const subIn = interpolate(frame, [98, 118], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  // конфетти после «удара»
  const confettiStart = 90;
  const confetti = Array.from({ length: 90 }).map((_, i) => {
    const delay = random(`d${i}`) * 22;
    const f = frame - confettiStart - delay;
    const x = random(`x${i}`) * width;
    const y = interpolate(f, [0, 78], [-60, height * 0.98], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const rot = f * 7 * (random(`r${i}`) > 0.5 ? 1 : -1);
    const op = f < 0 ? 0 : interpolate(f, [60, 80], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const w = 10 + random(`s${i}`) * 16;
    const h = 14 + random(`h${i}`) * 16;
    return { i, x, y, rot, op, w, h, c: COLORS[i % COLORS.length] };
  });

  const money = (n: number) => n.toLocaleString('ru-RU');

  return (
    <AbsoluteFill
      style={{
        background: 'radial-gradient(120% 90% at 50% 0%, #123042 0%, #0a1822 55%, #060f16 100%)',
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        color: '#eaf6ff',
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      {/* конфетти */}
      {confetti.map((c) => (
        <div
          key={c.i}
          style={{
            position: 'absolute',
            left: c.x,
            top: c.y,
            width: c.w,
            height: c.h,
            background: c.c,
            opacity: c.op,
            transform: `rotate(${c.rot}deg)`,
            borderRadius: 2,
          }}
        />
      ))}

      {/* шапка: агент */}
      <div
        style={{
          position: 'absolute',
          top: 230,
          textAlign: 'center',
          opacity: headIn,
          transform: `translateY(${interpolate(headIn, [0, 1], [30, 0])}px)`,
        }}
      >
        <div style={{ fontSize: 120 }}>🐶</div>
        <div style={{ fontSize: 58, fontWeight: 800, letterSpacing: 2, color: '#7fe6ff', textShadow: '0 0 30px #2bd4ff55' }}>
          СТЕПАНЫЧ
        </div>
        <div style={{ fontSize: 38, color: '#9fc4d6', marginTop: 8 }}>ИИ-агент · возврат клиентов</div>
      </div>

      {/* центр: счётчик */}
      <div style={{ textAlign: 'center', transform: `scale(${popScale})` }}>
        <div style={{ fontSize: 40, letterSpacing: 3, color: '#8fb6c8', textTransform: 'uppercase', marginBottom: 18 }}>
          доп. выручка за {label}
        </div>
        <div
          style={{
            fontSize: 150,
            fontWeight: 900,
            lineHeight: 1,
            backgroundImage: 'linear-gradient(180deg,#fff7c8,#ffce4a 55%,#e8902a)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            WebkitTextStroke: '2px #3a2408',
            filter: 'drop-shadow(0 6px 0 #00000055) drop-shadow(0 0 40px #ffb43c44)',
          }}
        >
          +{money(current)} ₽
        </div>
        <div style={{ fontSize: 44, color: '#8fe6a8', marginTop: 14, fontWeight: 700 }}>
          ≈ {(amount / 1e6).toFixed(2).replace('.', ',')} млн ₽
        </div>
      </div>

      {/* низ: детали */}
      <div
        style={{
          position: 'absolute',
          bottom: 300,
          textAlign: 'center',
          opacity: subIn,
          transform: `translateY(${interpolate(subIn, [0, 1], [24, 0])}px)`,
        }}
      >
        <div style={{ fontSize: 52, fontWeight: 800 }}>
          🔁 вернул {clients} клиентов
        </div>
        <div style={{ fontSize: 38, color: '#9fc4d6', marginTop: 12 }}>
          {orders} заказов · данные из 1С
        </div>
      </div>
    </AbsoluteFill>
  );
};
