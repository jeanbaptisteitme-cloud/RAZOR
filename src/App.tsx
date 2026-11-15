import { useCallback, useEffect, useState } from 'react';
import { CalculatorView } from './components/CalculatorView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { VaultView } from './components/VaultView';
import {
  ensureVaultConfig,
  unlockVaultWithPin,
  updateVaultPreferences,
} from './lib/vaultStorage';
import type { VaultConfig, VaultSpace } from './types/vault';

interface UnlockedSession {
  space: VaultSpace;
  masterKey: CryptoKey;
}

export default function App() {
  const [config, setConfig] = useState<VaultConfig | null>(null);
  const [session, setSession] = useState<UnlockedSession | null>(null);

  useEffect(() => {
    void ensureVaultConfig().then((loaded) => {
      setConfig(loaded);
    });
  }, []);

  // Sync theme class on <html>
  useEffect(() => {
    if (!config) return;
    const root = document.documentElement;
    if (config.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', config.theme === 'dark' ? '#111315' : '#f4f5f7');
    }
  }, [config?.theme]);

  const lockVault = useCallback(() => {
    setSession(null);
  }, []);

  // Optional lock when app is hidden / minimized
  useEffect(() => {
    if (!session || !config?.lockOnHide) return;
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        lockVault();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [session, config?.lockOnHide, lockVault]);

  // Inactivity auto-lock timer
  useEffect(() => {
    if (!session || !config || config.autoLockSeconds <= 0) return;

    let timer = window.setTimeout(lockVault, config.autoLockSeconds * 1000);
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lockVault, config.autoLockSeconds * 1000);
    };

    const events = ['pointerdown', 'keydown', 'scroll'];
    for (const ev of events) {
      window.addEventListener(ev, resetTimer, { passive: true });
    }

    return () => {
      window.clearTimeout(timer);
      for (const ev of events) {
        window.removeEventListener(ev, resetTimer);
      }
    };
  }, [session, config?.autoLockSeconds, lockVault]);

  const handleAttemptUnlock = async (pin: string): Promise<boolean> => {
    const result = await unlockVaultWithPin(pin);
    if (!result) return false;
    setConfig(result.config);
    setSession({ space: result.space, masterKey: result.masterKey });
    return true;
  };

  const handleToggleTheme = async () => {
    if (!config) return;
    const nextTheme = config.theme === 'dark' ? 'light' : 'dark';
    const updated = await updateVaultPreferences({ theme: nextTheme });
    setConfig(updated);
  };

  const handleDismissHint = async () => {
    const updated = await updateVaultPreferences({ hintDismissed: true });
    setConfig(updated);
  };

  const handleUpdatePreferences = async (
    patch: Partial<Pick<VaultConfig, 'autoLockSeconds' | 'lockOnHide' | 'language' | 'theme'>>
  ) => {
    const updated = await updateVaultPreferences(patch);
    setConfig(updated);
  };

  const activeLanguage = config?.language ?? 'en';
  const activeTheme = config?.theme ?? 'dark';

  return (
    <>
      {session && config ? (
        <VaultView
          space={session.space}
          masterKey={session.masterKey}
          config={config}
          onConfigUpdated={setConfig}
          onUpdatePreferences={handleUpdatePreferences}
          onLock={lockVault}
        />
      ) : (
        <CalculatorView
          language={activeLanguage}
          theme={activeTheme}
          showFirstRunHint={Boolean(config && !config.isPinCustomized && !config.hintDismissed)}
          onDismissHint={() => void handleDismissHint()}
          onToggleTheme={() => void handleToggleTheme()}
          onAttemptUnlock={handleAttemptUnlock}
        />
      )}
      <OfflineIndicator />
    </>
  );
}
