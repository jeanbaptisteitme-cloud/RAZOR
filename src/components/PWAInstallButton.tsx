import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  label?: string;
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  label = 'Install App',
  compact = false,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 text-white font-medium hover:bg-amber-500 active:scale-[0.98] transition whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
          compact ? 'min-h-[44px] px-3 text-xs' : 'min-h-[44px] px-4 py-2 text-sm'
        }`}
      >
        <Download className="w-4 h-4" />
        <span>{label}</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 dark:border-[#2e343d] px-3 min-h-[44px] text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#1f2329] transition whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-4 h-4" />
          <span>{label}</span>
        </button>

        {showGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#1a1d21] border border-slate-200 dark:border-[#2b3038] p-6 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Install C007 on Home Screen
                </h3>
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  aria-label="Close"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                <li>1. Tap the Share button in Safari&apos;s toolbar.</li>
                <li>2. Scroll down and select Add to Home Screen.</li>
                <li>3. Confirm &ldquo;C007&rdquo; to launch in standalone mode.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-amber-600 text-white text-sm font-medium hover:opacity-90 transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
