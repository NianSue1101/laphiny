import { NativeModules, Platform } from 'react-native';

type BackgroundAgentNativeModule = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

const nativeBackgroundAgent = NativeModules.LaphinyBackgroundAgent as
  | BackgroundAgentNativeModule
  | undefined;

let activeTaskCount = 0;
let serviceStarted = false;

export function shouldStreamHermesReplies(): boolean {
  return Platform.OS === 'web';
}

export async function beginBackgroundAgentTask(): Promise<() => Promise<void>> {
  if (Platform.OS !== 'android' || !nativeBackgroundAgent) {
    return async () => undefined;
  }

  activeTaskCount += 1;
  if (!serviceStarted) {
    try {
      await nativeBackgroundAgent.start();
      serviceStarted = true;
    } catch (error) {
      console.warn('Failed to start Android background agent service.', error);
    }
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;

    activeTaskCount = Math.max(0, activeTaskCount - 1);
    if (activeTaskCount > 0 || !serviceStarted) return;

    try {
      await nativeBackgroundAgent.stop();
    } catch (error) {
      console.warn('Failed to stop Android background agent service.', error);
    } finally {
      serviceStarted = false;
    }
  };
}
