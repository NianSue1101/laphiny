import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getErrorMessage, getWebBasePath, isSecureWebContext, showNotice } from '../app/app_utils';
import type { PWAInstallPromptEvent, ServiceWorkerStatus } from '../app/app_types';
import type { DiagnosticLogEntry } from '../types';

type LogInput = Omit<DiagnosticLogEntry, 'id' | 'createdAt'> & { id?: string; createdAt?: string };

type UsePwaRuntimeOptions = {
  appendDiagnosticLog: (input: LogInput) => void;
};

export function usePwaRuntime({ appendDiagnosticLog }: UsePwaRuntimeOptions) {
  const [networkOnline, setNetworkOnline] = useState(() => Platform.OS !== 'web' || typeof navigator === 'undefined' ? true : navigator.onLine);
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<PWAInstallPromptEvent | null>(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  const [serviceWorkerStatus, setServiceWorkerStatus] = useState<ServiceWorkerStatus>('unsupported');

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const updateNetworkState = () => {
      setNetworkOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPwaInstallPrompt(event as PWAInstallPromptEvent);
    };
    const handleInstalled = () => {
      setPwaInstallPrompt(null);
      setPwaInstalled(true);
      appendDiagnosticLog({
        level: 'success',
        category: 'system',
        title: 'PWA 已安装',
        message: '浏览器已确认 Laphiny 安装为应用。',
      });
    };

    updateNetworkState();
    window.addEventListener('online', updateNetworkState);
    window.addEventListener('offline', updateNetworkState);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    if ('serviceWorker' in navigator && isSecureWebContext()) {
      setServiceWorkerStatus('registering');
      const basePath = getWebBasePath();
      navigator.serviceWorker.register(`${basePath}sw.js`, { scope: basePath })
        .then(() => {
          setServiceWorkerStatus('registered');
        })
        .catch((error) => {
          setServiceWorkerStatus('failed');
          appendDiagnosticLog({
            level: 'warning',
            category: 'system',
            title: 'Service Worker 注册失败',
            message: getErrorMessage(error),
          });
        });
    }

    return () => {
      window.removeEventListener('online', updateNetworkState);
      window.removeEventListener('offline', updateNetworkState);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function installPwa() {
    if (!pwaInstallPrompt) {
      showNotice('暂时不能安装', '当前浏览器还没有提供安装入口。请确认正在使用 HTTPS 或浏览器菜单中的“安装应用”。');
      return;
    }

    try {
      await pwaInstallPrompt.prompt();
      const choice = await pwaInstallPrompt.userChoice;
      setPwaInstallPrompt(null);
      appendDiagnosticLog({
        level: choice.outcome === 'accepted' ? 'success' : 'info',
        category: 'system',
        title: choice.outcome === 'accepted' ? 'PWA 安装已接受' : 'PWA 安装已取消',
        message: `平台：${choice.platform || 'unknown'}`,
      });
    } catch (error) {
      appendDiagnosticLog({
        level: 'warning',
        category: 'system',
        title: 'PWA 安装触发失败',
        message: getErrorMessage(error),
      });
      showNotice('安装失败', getErrorMessage(error));
    }
  }

  return {
    networkOnline,
    pwaInstallPrompt,
    pwaInstalled,
    serviceWorkerStatus,
    installPwa,
  };
}
