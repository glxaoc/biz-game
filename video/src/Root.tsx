import React from 'react';
import { Composition } from 'remotion';
import { StepanychResult } from './StepanychResult';

// 9:16 (1080×1920) под Reels / Shorts / Stories. 6 секунд @ 30fps.
export const RemotionRoot: React.FC = () => {
  return (
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
  );
};
