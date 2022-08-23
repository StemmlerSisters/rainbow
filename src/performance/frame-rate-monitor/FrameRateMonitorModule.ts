import { NativeModules } from 'react-native';

type FrameRateMonitorModuleInterface = {
  startMonitoring: () => Promise<void>;
  stopMonitoring: () => Promise<void>;
  getStats: () => Promise<{
    sessionDuration: number;
    screenFrameRate: number;
    totalFramesDrawn: number;
    totalFramesDropped: number;
    expectedFramesToBeDrawn: number;
    framesDrawnRate: number;
    framesDroppedRate: number;
  }>;
};

// TODO: Remove when iOS implementation is done
const dummyModule: FrameRateMonitorModuleInterface = {
  getStats: () =>
    new Promise(resolve =>
      resolve({
        expectedFramesToBeDrawn: 0,
        framesDrawnRate: 0,
        framesDroppedRate: 0,
        screenFrameRate: 0,
        sessionDuration: 0,
        totalFramesDrawn: 0,
        totalFramesDropped: 0,
      })
    ),
  startMonitoring: () => new Promise(resolve => resolve()),
  stopMonitoring: () => new Promise(resolve => resolve()),
};

// TODO: Use only native module when iOS implementation is ready
export const FrameRateMonitorModule: FrameRateMonitorModuleInterface = android
  ? NativeModules.RNFrameRateMonitorModule
  : dummyModule;