import React from 'react';
import { Composition } from 'remotion';
import { StepanychResult } from './StepanychResult';
import { StepanychThrone } from './StepanychThrone';
import { StepanychAnalyzes } from './StepanychAnalyzes';

// 9:16 (1080×1920) под Reels / Shorts / Stories — помещается на iPhone 13.
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="StepanychResult"
        component={StepanychResult}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          amount: 1369739,
          clients: 44,
          orders: 89,
          label: 'май 2026',
        }}
      />
      {/* анимация присланной картинки «Степаныч на троне» (положить файл в video/public/) */}
      <Composition
        id="StepanychThrone"
        component={StepanychThrone}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ src: 'stepanych-throne.png' }}
      />
      {/* Степаныч анализирует — анимируем содержимое экранов */}
      <Composition
        id="StepanychAnalyzes"
        component={StepanychAnalyzes}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{ src: 'stepanych-analyzes.png', debug: false }}
      />
    </>
  );
};
