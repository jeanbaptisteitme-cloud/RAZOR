import React, { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Delete,
  History,
  Moon,
  Smartphone,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import {
  AngleMode,
  evaluateExpression,
  formatCalculatorNumber,
  isPureNumericPinCandidate,
} from '../lib/calculatorEngine';
import { getCopy } from '../lib/i18n';
import type { AppLanguage, AppTheme, CalcHistoryEntry } from '../types/vault';
import { PWAInstallButton } from './PWAInstallButton';

interface CalculatorViewProps {
  language: AppLanguage;
  theme: AppTheme;
  showFirstRunHint: boolean;
  onDismissHint: () => void;
  onToggleTheme: () => void;
  onAttemptUnlock: (pin: string) => Promise<boolean>;
}

const HISTORY_STORAGE_KEY = 'c007_calc_history_v1';

export const CalculatorView: React.FC<CalculatorViewProps> = ({
  language,
  theme,
  showFirstRunHint,
  onDismissHint,
  onToggleTheme,
  onAttemptUnlock,
}) => {
  const t = getCopy(language);
  const [expression, setExpression] = useState<string>('0');
  const [justEvaluated, setJustEvaluated] = useState<boolean>(false);
  const [errorState, setErrorState] = useState<boolean>(false);
  const [isScientific, setIsScientific] = useState<boolean>(false);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [memory, setMemory] = useState<number>(0);
  const [showMobileHistory, setShowMobileHistory] = useState<boolean>(false);
  const [history, setHistory] = useState<CalcHistoryEntry[]>(() => {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? (JSON.parse(raw) as CalcHistoryEntry[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, 40)));
    } catch {
      // Ignore storage quota errors
    }
  }, [history]);

  // Compute live preview when expression contains an operator or function
  const livePreview = React.useMemo(() => {
    if (errorState || !expression || expression === '0') return '';
    if (!/[+\-×÷*/%^()]|sin|cos|tan|sqrt|ln|log|π|√/.test(expression)) return '';
    try {
      const val = evaluateExpression(expression, angleMode);
      const formatted = formatCalculatorNumber(val);
      return formatted === expression ? '' : formatted;
    } catch {
      return '';
    }
  }, [expression, angleMode, errorState]);

  const appendDigit = (digit: string) => {
    setErrorState(false);
    if (justEvaluated) {
      setExpression(digit === '.' ? '0.' : digit);
      setJustEvaluated(false);
      return;
    }
    if (expression === '0' && digit !== '.') {
      setExpression(digit);
      return;
    }
    // Prevent multiple decimals in the current number segment
    if (digit === '.') {
      const lastSegment = expression.split(/[+\-×÷*/%^()]/).pop() || '';
      if (lastSegment.includes('.')) return;
    }
    setExpression((prev) => prev + digit);
  };

  const appendOperator = (op: string) => {
    setErrorState(false);
    setJustEvaluated(false);
    setExpression((prev) => {
      const trimmed = prev.trim();
      if (!trimmed || trimmed === 'Error') return op === '−' ? '−' : '0' + op;
      const lastChar = trimmed[trimmed.length - 1];
      if ('+−×÷*/%^'.includes(lastChar)) {
        return trimmed.slice(0, -1) + op;
      }
      return trimmed + op;
    });
  };

  const appendFunction = (fnToken: string) => {
    setErrorState(false);
    if (justEvaluated || expression === '0') {
      setExpression(fnToken);
      setJustEvaluated(false);
      return;
    }
    setExpression((prev) => prev + fnToken);
  };

  const handleClearAll = () => {
    setExpression('0');
    setJustEvaluated(false);
    setErrorState(false);
  };

  const handleBackspace = () => {
    setErrorState(false);
    if (justEvaluated) {
      setExpression('0');
      setJustEvaluated(false);
      return;
    }
    setExpression((prev) => {
      if (prev.length <= 1) return '0';
      // Remove function tokens cleanly if at end
      for (const fn of ['sin(', 'cos(', 'tan(', 'log(', 'ln(', '√(']) {
        if (prev.endsWith(fn)) {
          const next = prev.slice(0, -fn.length);
          return next.length ? next : '0';
        }
      }
      return prev.slice(0, -1);
    });
  };

  const handleToggleSign = () => {
    setErrorState(false);
    if (expression === '0') return;
    if (expression.startsWith('−') || expression.startsWith('-')) {
      setExpression(expression.slice(1));
    } else {
      setExpression('−' + expression);
    }
  };

  const handleEvaluate = async () => {
    const raw = expression.trim();
    if (!raw || raw === 'Error') return;

    // Stealth PIN check: only checks pure numeric strings, never reveals wrong attempts
    if (isPureNumericPinCandidate(raw)) {
      const unlocked = await onAttemptUnlock(raw);
      if (unlocked) {
        setExpression('0');
        setJustEvaluated(false);
        setErrorState(false);
        return;
      }
    }

    try {
      const result = evaluateExpression(raw, angleMode);
      const formatted = formatCalculatorNumber(result);
      if (formatted !== raw) {
        setHistory((prev) => [
          {
            id: crypto.randomUUID(),
            expression: raw,
            result: formatted,
            timestamp: Date.now(),
          },
          ...prev.slice(0, 39),
        ]);
      }
      setExpression(formatted);
      setJustEvaluated(true);
      setErrorState(false);
    } catch {
      setExpression('Error');
      setErrorState(true);
      setJustEvaluated(true);
    }
  };

  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-') => {
    if (action === 'MC') {
      setMemory(0);
      return;
    }
    if (action === 'MR') {
      const val = formatCalculatorNumber(memory);
      setExpression((prev) => (prev === '0' || justEvaluated ? val : prev + val));
      setJustEvaluated(false);
      return;
    }
    try {
      const current = evaluateExpression(expression, angleMode);
      setMemory((m) => (action === 'M+' ? m + current : m - current));
    } catch {
      // Ignore if current display isn't evaluable
    }
  };

  // Keyboard support
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key;
      if (/^[0-9]$/.test(key)) {
        e.preventDefault();
        appendDigit(key);
      } else if (key === '.') {
        e.preventDefault();
        appendDigit('.');
      } else if (key === '+') {
        e.preventDefault();
        appendOperator('+');
      } else if (key === '-') {
        e.preventDefault();
        appendOperator('−');
      } else if (key === '*') {
        e.preventDefault();
        appendOperator('×');
      } else if (key === '/') {
        e.preventDefault();
        appendOperator('÷');
      } else if (key === '%') {
        e.preventDefault();
        appendOperator('%');
      } else if (key === '(' || key === ')') {
        e.preventDefault();
        appendFunction(key);
      } else if (key === 'Enter' || key === '=') {
        e.preventDefault();
        void handleEvaluate();
      } else if (key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (key === 'Escape') {
        e.preventDefault();
        handleClearAll();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const btnBase =
    'min-h-[54px] sm:min-h-[60px] rounded-2xl font-medium text-xl flex items-center justify-center select-none active:scale-95 transition-transform duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500';
  const btnDigit = `${btnBase} bg-white dark:bg-[#22262c] text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-[#2a2f37] border border-slate-200/80 dark:border-[#2e333c] font-mono tabular-nums`;
  const btnUtility = `${btnBase} bg-slate-200/80 dark:bg-[#1a1d22] text-slate-700 dark:text-slate-300 hover:bg-slate-300/70 dark:hover:bg-[#252a31] border border-slate-300/60 dark:border-[#2b3038] text-lg`;
  const btnOperator = `${btnBase} bg-slate-200 dark:bg-[#2a241e] text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-[#382d22] border border-amber-500/20 text-2xl`;
  const btnEquals = `${btnBase} bg-amber-600 text-white hover:bg-amber-500 shadow-sm text-2xl font-semibold`;

  const sciButtons: Array<{ label: string; token: string; onPress?: () => void }> = [
    {
      label: angleMode,
      token: '',
      onPress: () => setAngleMode((m) => (m === 'DEG' ? 'RAD' : 'DEG')),
    },
    { label: 'sin', token: 'sin(' },
    { label: 'cos', token: 'cos(' },
    { label: 'tan', token: 'tan(' },
    { label: '√', token: '√(' },
    { label: 'x²', token: '^2' },
    { label: 'ln', token: 'ln(' },
    { label: 'log', token: 'log(' },
    { label: 'π', token: 'π' },
    { label: '^', token: '^' },
    { label: '(', token: '(' },
    { label: ')', token: ')' },
  ];

  return (
    <div className="min-h-[100dvh] bg-[#f4f5f7] dark:bg-[#111315] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Compact Top Bar (<= 56px) */}
      <header className="sticky top-0 z-30 h-14 px-4 lg:px-8 flex items-center justify-between border-b border-slate-200/80 dark:border-[#22262c] bg-[#f4f5f7]/90 dark:bg-[#111315]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-[Outfit] text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            C007
          </span>
          <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {t.calcMode}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsScientific((v) => !v)}
            className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1e2228] inline-flex items-center gap-1.5 transition whitespace-nowrap"
          >
            <span>{isScientific ? t.standard : t.scientific}</span>
            {isScientific ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={() => setShowMobileHistory(true)}
            aria-label={t.history}
            className="lg:hidden min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1e2228] transition"
          >
            <History className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label="Toggle theme"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1e2228] transition"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          <PWAInstallButton label={t.installApp} compact />
        </div>
      </header>

      {/* Non-blocking subtle first-time hint (disappears forever once dismissed or PIN customized) */}
      {showFirstRunHint && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              {t.firstRunHint}
            </span>
            <button
              type="button"
              onClick={onDismissHint}
              className="text-amber-800 dark:text-amber-300 underline underline-offset-2 hover:opacity-80 shrink-0 font-medium"
            >
              {t.dismiss}
            </button>
          </div>
        </div>
      )}

      {/* Main Responsive Canvas */}
      <main className="flex-1 w-full max-w-6xl mx-auto flex flex-col lg:grid lg:grid-cols-12 lg:gap-8 lg:px-8 lg:py-8">
        {/* Calculator Console */}
        <section className="flex-1 flex flex-col justify-between lg:col-span-7 lg:rounded-3xl lg:bg-white/70 lg:dark:bg-[#17191d] lg:border lg:border-slate-200/90 lg:dark:border-[#242830] lg:p-6 p-4 pb-safe">
          {/* Display Area */}
          <div className="flex-1 flex flex-col justify-end items-end py-4 px-2 min-h-[140px] sm:min-h-[176px]">
            <div className="w-full flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-3">
              <span className="font-mono tabular-nums">
                {memory !== 0 ? `${t.memoryLabel}: ${formatCalculatorNumber(memory)}` : '\u00A0'}
              </span>
              <span className="font-mono">{angleMode}</span>
            </div>

            <div className="w-full text-right overflow-x-auto no-scrollbar">
              <div
                className={`font-mono tabular-nums font-semibold tracking-tight break-all leading-tight ${
                  expression.length > 14
                    ? 'text-3xl sm:text-4xl'
                    : expression.length > 9
                    ? 'text-4xl sm:text-5xl'
                    : 'text-5xl sm:text-6xl'
                } ${errorState ? 'text-rose-500' : 'text-slate-900 dark:text-white'}`}
              >
                {expression}
              </div>
            </div>

            <div className="h-7 mt-2 flex items-center justify-end w-full">
              {livePreview && (
                <span className="font-mono tabular-nums text-lg text-slate-500 dark:text-slate-400">
                  = {livePreview}
                </span>
              )}
            </div>
          </div>

          {/* Memory Strip */}
          <div className="grid grid-cols-4 gap-2 mb-2.5">
            {(['MC', 'MR', 'M+', 'M-'] as const).map((memOp) => (
              <button
                key={memOp}
                type="button"
                onClick={() => handleMemory(memOp)}
                className="min-h-[40px] rounded-xl text-xs font-mono font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#22262c] active:scale-95 transition"
              >
                {memOp}
              </button>
            ))}
          </div>

          {/* Optional Scientific Row */}
          {isScientific && (
            <div className="grid grid-cols-4 gap-2 mb-2.5">
              {sciButtons.map((sci) => (
                <button
                  key={sci.label}
                  type="button"
                  onClick={() => (sci.onPress ? sci.onPress() : appendFunction(sci.token))}
                  className="min-h-[44px] rounded-xl bg-slate-200/60 dark:bg-[#1d2026] text-xs font-mono font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-300/60 dark:hover:bg-[#262b33] active:scale-95 transition border border-slate-300/40 dark:border-[#2b3038]"
                >
                  {sci.label}
                </button>
              ))}
            </div>
          )}

          {/* Standard Tactile Keypad */}
          <div className="grid grid-cols-4 gap-2.5">
            <button type="button" onClick={handleClearAll} className={btnUtility}>
              AC
            </button>
            <button type="button" onClick={handleToggleSign} className={btnUtility}>
              ±
            </button>
            <button type="button" onClick={() => appendOperator('%')} className={btnUtility}>
              %
            </button>
            <button type="button" onClick={() => appendOperator('÷')} className={btnOperator}>
              ÷
            </button>

            <button type="button" onClick={() => appendDigit('7')} className={btnDigit}>
              7
            </button>
            <button type="button" onClick={() => appendDigit('8')} className={btnDigit}>
              8
            </button>
            <button type="button" onClick={() => appendDigit('9')} className={btnDigit}>
              9
            </button>
            <button type="button" onClick={() => appendOperator('×')} className={btnOperator}>
              ×
            </button>

            <button type="button" onClick={() => appendDigit('4')} className={btnDigit}>
              4
            </button>
            <button type="button" onClick={() => appendDigit('5')} className={btnDigit}>
              5
            </button>
            <button type="button" onClick={() => appendDigit('6')} className={btnDigit}>
              6
            </button>
            <button type="button" onClick={() => appendOperator('−')} className={btnOperator}>
              −
            </button>

            <button type="button" onClick={() => appendDigit('1')} className={btnDigit}>
              1
            </button>
            <button type="button" onClick={() => appendDigit('2')} className={btnDigit}>
              2
            </button>
            <button type="button" onClick={() => appendDigit('3')} className={btnDigit}>
              3
            </button>
            <button type="button" onClick={() => appendOperator('+')} className={btnOperator}>
              +
            </button>

            <button type="button" onClick={() => appendDigit('0')} className={btnDigit}>
              0
            </button>
            <button type="button" onClick={() => appendDigit('.')} className={btnDigit}>
              .
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              aria-label="Backspace"
              className={btnUtility}
            >
              <Delete className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => void handleEvaluate()} className={btnEquals}>
              =
            </button>
          </div>
        </section>

        {/* Desktop Side Panel: Tape History & Android PWA Card */}
        <aside className="hidden lg:flex lg:col-span-5 flex-col gap-6">
          <div className="flex-1 rounded-3xl bg-white/70 dark:bg-[#17191d] border border-slate-200/90 dark:border-[#242830] p-6 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
                {t.history}
              </h2>
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHistory([])}
                  className="text-xs text-slate-500 hover:text-rose-500 transition inline-flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.clearHistory}</span>
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-12 text-sm text-slate-400 dark:text-slate-500">
                <History className="w-6 h-6 mb-2 opacity-60" />
                <p>{t.noHistory}</p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1 max-h-[380px] pr-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setExpression(item.result);
                      setJustEvaluated(true);
                    }}
                    className="w-full text-right px-3 py-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-[#20242b] transition flex flex-col items-end"
                  >
                    <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                      {item.expression}
                    </span>
                    <span className="font-mono tabular-nums text-base font-semibold text-slate-900 dark:text-slate-100">
                      = {item.result}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-3xl bg-white/70 dark:bg-[#17191d] border border-slate-200/90 dark:border-[#242830] p-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-[Outfit] text-sm font-semibold text-slate-900 dark:text-white">
                  {t.installAndroidTitle}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {t.installAndroidDesc}
                </p>
                <div className="mt-3">
                  <PWAInstallButton label={t.installApp} />
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>

      {/* Mobile History Bottom Sheet */}
      {showMobileHistory && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end lg:hidden"
          onClick={() => setShowMobileHistory(false)}
        >
          <div
            className="w-full max-h-[75dvh] rounded-t-3xl bg-white dark:bg-[#17191d] border-t border-slate-200 dark:border-[#282d35] p-5 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-4" />
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-[Outfit] text-base font-semibold">{t.history}</h2>
              <div className="flex items-center gap-2">
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="min-h-[44px] px-3 text-xs text-rose-500 font-medium"
                  >
                    {t.clearHistory}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMobileHistory(false)}
                  aria-label="Close"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">{t.noHistory}</p>
            ) : (
              <div className="overflow-y-auto space-y-1.5 pb-4">
                {history.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setExpression(item.result);
                      setJustEvaluated(true);
                      setShowMobileHistory(false);
                    }}
                    className="w-full text-right px-3 py-3 rounded-xl bg-slate-50 dark:bg-[#1f2329] flex flex-col items-end"
                  >
                    <span className="font-mono text-xs text-slate-500">{item.expression}</span>
                    <span className="font-mono tabular-nums text-lg font-semibold">= {item.result}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
