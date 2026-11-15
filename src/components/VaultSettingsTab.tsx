import React, { useRef, useState } from 'react';
import { Download, KeyRound, ShieldAlert, Smartphone, Trash2, Upload } from 'lucide-react';
import { getCopy } from '../lib/i18n';
import {
  exportEncryptedBackup,
  importEncryptedBackup,
  setDecoyPin,
  updatePrimaryPin,
  wipeVaultSpace,
} from '../lib/vaultStorage';
import type { AppLanguage, AppTheme, VaultConfig, VaultSpace } from '../types/vault';
import { PWAInstallButton } from './PWAInstallButton';

interface VaultSettingsTabProps {
  config: VaultConfig;
  space: VaultSpace;
  masterKey: CryptoKey;
  onConfigUpdated: (next: VaultConfig) => void;
  onUpdatePreferences: (
    patch: Partial<Pick<VaultConfig, 'autoLockSeconds' | 'lockOnHide' | 'language' | 'theme'>>
  ) => Promise<void>;
  onSpaceWiped: () => Promise<void>;
  onBackupRestored: () => Promise<void>;
}

export const VaultSettingsTab: React.FC<VaultSettingsTabProps> = ({
  config,
  space,
  masterKey,
  onConfigUpdated,
  onUpdatePreferences,
  onSpaceWiped,
  onBackupRestored,
}) => {
  const t = getCopy(config.language);

  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinStatus, setPinStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [decoyPinInput, setDecoyPinInput] = useState('');
  const [decoyStatus, setDecoyStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [confirmWipe, setConfirmWipe] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);

  const handleUpdatePrimaryPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinStatus(null);
    if (!/^\d{4,10}$/.test(newPin)) {
      setPinStatus({ type: 'err', text: t.pinTooShort });
      return;
    }
    if (newPin !== confirmPin) {
      setPinStatus({ type: 'err', text: t.pinMismatch });
      return;
    }

    const res = await updatePrimaryPin(masterKey, newPin);
    if (!res.ok) {
      setPinStatus({ type: 'err', text: t.pinConflict });
      return;
    }
    if (res.config) onConfigUpdated(res.config);
    setNewPin('');
    setConfirmPin('');
    setPinStatus({ type: 'ok', text: t.pinUpdated });
  };

  const handleSaveDecoyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setDecoyStatus(null);
    if (!/^\d{4,10}$/.test(decoyPinInput)) {
      setDecoyStatus({ type: 'err', text: t.pinTooShort });
      return;
    }
    const res = await setDecoyPin(decoyPinInput);
    if (!res.ok) {
      setDecoyStatus({ type: 'err', text: t.pinConflict });
      return;
    }
    if (res.config) onConfigUpdated(res.config);
    setDecoyPinInput('');
    setDecoyStatus({ type: 'ok', text: t.decoyUpdated });
  };

  const handleExportBackup = async () => {
    const blob = await exportEncryptedBackup();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `c007-backup-${new Date().toISOString().slice(0, 10)}.c007`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ok = await importEncryptedBackup(file);
    e.target.value = '';
    if (ok) {
      setBackupMessage(config.language === 'fr' ? 'Sauvegarde restaurée.' : 'Backup restored.');
      await onBackupRestored();
    } else {
      setBackupMessage(
        config.language === 'fr' ? 'Fichier de sauvegarde invalide.' : 'Invalid backup archive.'
      );
    }
  };

  const handleWipeSpace = async () => {
    if (!confirmWipe) {
      setConfirmWipe(true);
      setTimeout(() => setConfirmWipe(false), 4000);
      return;
    }
    await wipeVaultSpace(space);
    setConfirmWipe(false);
    await onSpaceWiped();
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Primary Passcode (only editable inside primary space) */}
      {space === 'primary' && (
        <section className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
                {t.settingsPinSection}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.settingsPinDesc}</p>

              <form onSubmit={handleUpdatePrimaryPin} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.newPinPlaceholder}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-[#2b3038] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.confirmPinPlaceholder}
                  className="min-h-[44px] px-3.5 rounded-xl bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-[#2b3038] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition"
                  >
                    {t.updatePin}
                  </button>
                  {pinStatus && (
                    <span
                      className={`text-xs font-medium ${
                        pinStatus.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'
                      }`}
                    >
                      {pinStatus.text}
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Decoy Passcode */}
      {space === 'primary' && (
        <section className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-slate-500 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
                {t.decoySection}
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.decoyDesc}</p>

              <form onSubmit={handleSaveDecoyPin} className="mt-4 flex flex-wrap items-center gap-3">
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={decoyPinInput}
                  onChange={(e) => setDecoyPinInput(e.target.value.replace(/\D/g, ''))}
                  placeholder={t.newPinPlaceholder}
                  className="min-h-[44px] w-56 px-3.5 rounded-xl bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-[#2b3038] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-[#242830] text-white text-sm font-medium hover:opacity-90 transition"
                >
                  {t.setDecoyPin}
                </button>
                {decoyStatus && (
                  <span
                    className={`text-xs font-medium ${
                      decoyStatus.type === 'ok' ? 'text-emerald-500' : 'text-rose-500'
                    }`}
                  >
                    {decoyStatus.text}
                  </span>
                )}
              </form>
            </div>
          </div>
        </section>
      )}

      {/* Security, Appearance & Language */}
      <section className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 sm:p-6 space-y-5">
        <h3 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
          {t.securitySection}
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {t.autoLockLabel}
            </label>
            <select
              value={config.autoLockSeconds}
              onChange={(e) =>
                void onUpdatePreferences({ autoLockSeconds: Number(e.target.value) })
              }
              className="w-full min-h-[44px] px-3 rounded-xl bg-slate-50 dark:bg-[#111315] border border-slate-200 dark:border-[#2b3038] text-sm"
            >
              <option value={60}>1 min</option>
              <option value={180}>3 min</option>
              <option value={300}>5 min</option>
              <option value={0}>Off</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {t.themeLabel}
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#111315]">
              {(['dark', 'light'] as AppTheme[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => void onUpdatePreferences({ theme: mode })}
                  className={`min-h-[36px] rounded-lg text-xs font-medium capitalize transition ${
                    config.theme === mode
                      ? 'bg-white dark:bg-[#22262c] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
              {t.languageLabel}
            </label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#111315]">
              {(['en', 'fr'] as AppLanguage[]).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => void onUpdatePreferences({ language: lang })}
                  className={`min-h-[36px] rounded-lg text-xs font-medium uppercase transition ${
                    config.language === lang
                      ? 'bg-white dark:bg-[#22262c] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-500'
                  }`}
                >
                  {lang}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center justify-between gap-4 pt-2 cursor-pointer">
          <span className="text-sm text-slate-700 dark:text-slate-200">{t.lockOnHideLabel}</span>
          <input
            type="checkbox"
            checked={config.lockOnHide}
            onChange={(e) => void onUpdatePreferences({ lockOnHide: e.target.checked })}
            className="w-5 h-5 accent-amber-600 rounded"
          />
        </label>
      </section>

      {/* Install on Android PWA */}
      <section className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <Smartphone className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <h3 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
              {t.installAndroidTitle}
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t.installAndroidDesc}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <PWAInstallButton label={t.installApp} />
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Android Chrome: Menu (⋮) → Install app / Add to Home screen
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Backup & Erase */}
      <section className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 sm:p-6 space-y-4">
        <div>
          <h3 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
            {t.backupSection}
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.backupDesc}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void handleExportBackup()}
            className="min-h-[44px] px-4 rounded-xl bg-slate-900 dark:bg-[#242830] text-white text-sm font-medium hover:opacity-90 transition inline-flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>{t.exportBackup}</span>
          </button>

          <button
            type="button"
            onClick={() => restoreInputRef.current?.click()}
            className="min-h-[44px] px-4 rounded-xl border border-slate-300 dark:border-[#2e343d] text-sm font-medium hover:bg-slate-50 dark:hover:bg-[#1f2329] transition inline-flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            <span>{t.importBackup}</span>
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".c007,application/octet-stream,application/json"
            className="hidden"
            onChange={(e) => void handleImportBackup(e)}
          />

          {backupMessage && (
            <span className="text-xs font-medium text-amber-500">{backupMessage}</span>
          )}
        </div>

        <div className="pt-4 border-t border-slate-100 dark:border-[#23272f]">
          <button
            type="button"
            onClick={() => void handleWipeSpace()}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-medium transition inline-flex items-center gap-2 ${
              confirmWipe
                ? 'bg-rose-600 text-white'
                : 'text-rose-500 hover:bg-rose-500/10 border border-rose-500/30'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            <span>{confirmWipe ? t.eraseConfirm : t.eraseVault}</span>
          </button>
        </div>
      </section>
    </div>
  );
};
