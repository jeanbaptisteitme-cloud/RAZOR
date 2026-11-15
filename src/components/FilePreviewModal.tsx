import React, { useEffect, useState } from 'react';
import { Download, FileText, Star, Trash2, X } from 'lucide-react';
import { getCopy } from '../lib/i18n';
import { decryptVaultFile, formatBytes } from '../lib/vaultStorage';
import type { AppLanguage, VaultFileItem } from '../types/vault';

interface FilePreviewModalProps {
  file: VaultFileItem | null;
  masterKey: CryptoKey;
  language: AppLanguage;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleStar: (id: string) => void;
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({
  file,
  masterKey,
  language,
  onClose,
  onDelete,
  onToggleStar,
}) => {
  const t = getCopy(language);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [textPreview, setTextPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      setTextPreview(null);
      return;
    }

    let active = true;
    let createdUrl: string | null = null;
    setLoading(true);
    setTextPreview(null);

    decryptVaultFile(file.id, masterKey)
      .then(async (res) => {
        if (!active || !res) {
          if (res?.url) URL.revokeObjectURL(res.url);
          return;
        }
        createdUrl = res.url;
        setObjectUrl(res.url);

        if (
          res.mimeType.startsWith('text/') ||
          res.mimeType === 'application/json' ||
          /\.(txt|md|json|csv|log|xml)$/i.test(res.name)
        ) {
          const text = await res.blob.text();
          if (active) setTextPreview(text.slice(0, 60_000));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [file, masterKey]);

  if (!file) return null;

  const handleDownload = () => {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col"
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="h-14 px-4 lg:px-6 flex items-center justify-between border-b border-white/10 bg-black/50 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 pr-4">
          <h3 className="text-sm font-semibold truncate">{file.name}</h3>
          <p className="text-xs text-slate-400">
            {formatBytes(file.size)} · {new Date(file.createdAt).toLocaleDateString()}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => onToggleStar(file.id)}
            aria-label="Toggle star"
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-white/10 transition"
          >
            <Star
              className={`w-4 h-4 ${
                file.starred ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
              }`}
            />
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!objectUrl}
            aria-label={t.exportFile}
            className="min-h-[44px] px-3 rounded-xl flex items-center gap-1.5 text-xs font-medium hover:bg-white/10 transition disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{t.exportFile}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onDelete(file.id);
              onClose();
            }}
            aria-label={t.deleteItem}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-rose-400 hover:bg-rose-500/15 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label={t.previewClose}
            className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-300 hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div
        className="flex-1 flex items-center justify-center p-4 overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading || !objectUrl ? (
          <div className="text-sm text-slate-300">Decrypting...</div>
        ) : file.category === 'image' ? (
          <img
            src={objectUrl}
            alt={file.name}
            referrerPolicy="no-referrer"
            className="max-w-full max-h-[82dvh] object-contain rounded-xl shadow-2xl"
          />
        ) : file.category === 'video' ? (
          <video
            src={objectUrl}
            controls
            autoPlay
            className="max-w-full max-h-[82dvh] rounded-xl shadow-2xl"
          />
        ) : file.category === 'audio' ? (
          <div className="w-full max-w-md rounded-2xl bg-[#1a1d21] border border-white/10 p-6 text-center text-white">
            <p className="text-sm font-medium mb-4 truncate">{file.name}</p>
            <audio src={objectUrl} controls className="w-full" />
          </div>
        ) : textPreview !== null ? (
          <pre className="w-full max-w-3xl max-h-[80dvh] overflow-auto rounded-2xl bg-[#17191d] border border-white/10 p-5 text-xs font-mono text-slate-200 whitespace-pre-wrap break-words">
            {textPreview}
          </pre>
        ) : file.mimeType === 'application/pdf' ? (
          <iframe
            src={objectUrl}
            title={file.name}
            className="w-full max-w-4xl h-[82dvh] rounded-xl bg-white"
          />
        ) : (
          <div className="w-full max-w-sm rounded-2xl bg-[#1a1d21] border border-white/10 p-6 text-center text-white">
            <FileText className="w-10 h-10 mx-auto text-amber-400 mb-3" />
            <p className="text-sm font-semibold truncate">{file.name}</p>
            <p className="text-xs text-slate-400 mt-1">{formatBytes(file.size)}</p>
            <button
              type="button"
              onClick={handleDownload}
              className="mt-5 w-full min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-500 text-sm font-medium text-white transition"
            >
              {t.exportFile}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
