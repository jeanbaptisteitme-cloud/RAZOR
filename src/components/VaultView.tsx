import React, { useEffect, useRef, useState } from 'react';
import {
  FileText,
  Folder,
  FolderPlus,
  Image as ImageIcon,
  Lock,
  Music,
  Plus,
  Search,
  Settings,
  Star,
  StickyNote,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { getCopy } from '../lib/i18n';
import {
  createVaultFolder,
  deleteVaultFile,
  deleteVaultFolder,
  deleteVaultNote,
  formatBytes,
  importFilesToVault,
  loadVaultFiles,
  loadVaultFolders,
  loadVaultNotes,
  saveVaultNote,
  toggleStarVaultFile,
} from '../lib/vaultStorage';
import type {
  VaultConfig,
  VaultFileCategory,
  VaultFileItem,
  VaultFolder,
  VaultNote,
  VaultSpace,
} from '../types/vault';
import { FilePreviewModal } from './FilePreviewModal';
import { VaultNotesTab } from './VaultNotesTab';
import { VaultSettingsTab } from './VaultSettingsTab';

type VaultTab = 'files' | 'photos' | 'notes' | 'settings';

interface VaultViewProps {
  space: VaultSpace;
  masterKey: CryptoKey;
  config: VaultConfig;
  onConfigUpdated: (next: VaultConfig) => void;
  onUpdatePreferences: (
    patch: Partial<Pick<VaultConfig, 'autoLockSeconds' | 'lockOnHide' | 'language' | 'theme'>>
  ) => Promise<void>;
  onLock: () => void;
}

export const VaultView: React.FC<VaultViewProps> = ({
  space,
  masterKey,
  config,
  onConfigUpdated,
  onUpdatePreferences,
  onLock,
}) => {
  const t = getCopy(config.language);
  const [activeTab, setActiveTab] = useState<VaultTab>('files');
  const [files, setFiles] = useState<VaultFileItem[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [notes, setNotes] = useState<VaultNote[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [importing, setImporting] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [categoryFilter, setCategoryFilter] = useState<VaultFileCategory | 'starred'>('all');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [previewFile, setPreviewFile] = useState<VaultFileItem | null>(null);

  const [showNewFolder, setShowNewFolder] = useState<boolean>(false);
  const [newFolderName, setNewFolderName] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeThumbUrlsRef = useRef<string[]>([]);

  const revokeThumbUrls = (list: VaultFileItem[]) => {
    for (const item of list) {
      if (item.thumbnailUrl) URL.revokeObjectURL(item.thumbnailUrl);
    }
  };

  const refreshAll = async () => {
    setLoading(true);
    try {
      const [loadedFiles, loadedFolders, loadedNotes] = await Promise.all([
        loadVaultFiles(space, masterKey),
        loadVaultFolders(space),
        loadVaultNotes(space, masterKey),
      ]);
      revokeThumbUrls(activeThumbUrlsRef.current.map((url) => ({ thumbnailUrl: url } as VaultFileItem)));
      activeThumbUrlsRef.current = loadedFiles
        .map((f) => f.thumbnailUrl)
        .filter((u): u is string => Boolean(u));

      setFiles(loadedFiles);
      setFolders(loadedFolders);
      setNotes(loadedNotes);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshAll();
    return () => {
      for (const url of activeThumbUrlsRef.current) {
        URL.revokeObjectURL(url);
      }
      activeThumbUrlsRef.current = [];
    };
  }, [space, masterKey]);

  const handleImportFiles = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;
    setImporting(true);
    try {
      const created = await importFilesToVault(fileList, space, selectedFolderId, masterKey);
      for (const c of created) {
        if (c.thumbnailUrl) activeThumbUrlsRef.current.push(c.thumbnailUrl);
      }
      setFiles((prev) => [...created, ...prev]);
    } finally {
      setImporting(false);
    }
  };

  const handleDeleteFile = async (id: string) => {
    await deleteVaultFile(id);
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.thumbnailUrl) URL.revokeObjectURL(target.thumbnailUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const handleToggleStar = async (id: string) => {
    const nextStarred = await toggleStarVaultFile(id);
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, starred: nextStarred } : f)));
    setPreviewFile((prev) => (prev && prev.id === id ? { ...prev, starred: nextStarred } : prev));
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    const created = await createVaultFolder(space, newFolderName);
    setFolders((prev) => [...prev, created]);
    setNewFolderName('');
    setShowNewFolder(false);
    setSelectedFolderId(created.id);
  };

  const handleDeleteFolder = async (folderId: string) => {
    await deleteVaultFolder(folderId);
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setFiles((prev) => prev.map((f) => (f.folderId === folderId ? { ...f, folderId: null } : f)));
    if (selectedFolderId === folderId) setSelectedFolderId(null);
  };

  const handleSaveNote = async (note: {
    id: string;
    title: string;
    content: string;
    pinned: boolean;
    createdAt?: number;
  }) => {
    const saved = await saveVaultNote({ ...note, space }, masterKey);
    setNotes((prev) => {
      const exists = prev.some((n) => n.id === saved.id);
      if (exists) return prev.map((n) => (n.id === saved.id ? saved : n));
      return [saved, ...prev];
    });
    return saved;
  };

  const handleDeleteNote = async (id: string) => {
    await deleteVaultNote(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
  };

  const displayedFiles = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return files.filter((file) => {
      if (activeTab === 'photos' && file.category !== 'image' && file.category !== 'video') {
        return false;
      }
      if (activeTab === 'files') {
        if (categoryFilter === 'starred' && !file.starred) return false;
        if (
          categoryFilter !== 'all' &&
          categoryFilter !== 'starred' &&
          file.category !== categoryFilter
        ) {
          return false;
        }
        if (selectedFolderId && file.folderId !== selectedFolderId) return false;
      }
      if (q && !file.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [files, activeTab, categoryFilter, selectedFolderId, searchQuery]);

  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

  const renderCategoryIcon = (category: VaultFileItem['category']) => {
    switch (category) {
      case 'image':
        return <ImageIcon className="w-5 h-5 text-amber-500" />;
      case 'video':
        return <Video className="w-5 h-5 text-sky-500" />;
      case 'audio':
        return <Music className="w-5 h-5 text-emerald-500" />;
      default:
        return <FileText className="w-5 h-5 text-slate-400" />;
    }
  };

  const navItems: Array<{ id: VaultTab; label: string; icon: React.ReactNode }> = [
    { id: 'files', label: t.navFiles, icon: <Folder className="w-5 h-5" /> },
    { id: 'photos', label: t.navPhotos, icon: <ImageIcon className="w-5 h-5" /> },
    { id: 'notes', label: t.navNotes, icon: <StickyNote className="w-5 h-5" /> },
    { id: 'settings', label: t.navSettings, icon: <Settings className="w-5 h-5" /> },
  ];

  return (
    <div
      className="min-h-[100dvh] bg-[#f4f5f7] dark:bg-[#111315] text-slate-900 dark:text-slate-100 flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) {
          void handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Top Bar */}
      <header className="sticky top-0 z-30 h-12 lg:h-16 px-4 lg:px-8 border-b border-slate-200 dark:border-[#22262c] bg-[#f4f5f7]/90 dark:bg-[#111315]/90 backdrop-blur-md flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-[Outfit] text-base lg:text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
            {t.vaultTitle}
          </span>
          {space === 'decoy' && (
            <>
              <span className="text-slate-400" aria-hidden="true">
                ·
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {t.decoySpaceTag}
              </span>
            </>
          )}
          <span className="hidden md:inline text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 truncate">
            {t.encryptedLocalLabel}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {(activeTab === 'files' || activeTab === 'photos') && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="min-h-[40px] lg:min-h-[44px] px-3.5 lg:px-4 rounded-xl bg-amber-600 text-white text-xs lg:text-sm font-medium hover:bg-amber-500 active:scale-[0.98] transition inline-flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{importing ? '...' : t.importFiles}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLock}
            className="min-h-[40px] lg:min-h-[44px] px-3.5 rounded-xl bg-slate-900 dark:bg-[#22262c] text-white text-xs lg:text-sm font-medium hover:opacity-90 active:scale-[0.98] transition inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>{t.lockNow}</span>
          </button>
        </div>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) {
            void handleImportFiles(e.target.files);
            e.target.value = '';
          }
        }}
      />

      {/* Default PIN reminder banner (primary space only, before customized) */}
      {space === 'primary' && !config.isPinCustomized && activeTab !== 'settings' && (
        <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 lg:px-8 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 text-xs">
            <span className="text-amber-800 dark:text-amber-300 font-medium">
              {t.customizePinBanner}
            </span>
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-amber-800 dark:text-amber-300 underline underline-offset-2 font-semibold shrink-0"
            >
              {t.goToSettings}
            </button>
          </div>
        </div>
      )}

      {/* Desktop + Mobile Main Layout */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col lg:flex-row gap-6 px-4 lg:px-8 py-5 pb-24 lg:pb-10">
        {/* Desktop Sidebar Rail */}
        <aside className="hidden lg:flex lg:w-60 shrink-0 flex-col gap-6">
          <nav className="space-y-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full min-h-[44px] px-3.5 rounded-xl text-sm font-medium flex items-center gap-3 transition ${
                    active
                      ? 'bg-amber-600 text-white'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#1a1d22]'
                  }`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Folders section on desktop */}
          {activeTab === 'files' && (
            <div className="pt-4 border-t border-slate-200 dark:border-[#22262c]">
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t.folderAll}
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewFolder((v) => !v)}
                  aria-label={t.newFolder}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  <FolderPlus className="w-4 h-4" />
                </button>
              </div>

              {showNewFolder && (
                <form onSubmit={(e) => void handleCreateFolder(e)} className="mb-2 flex gap-1.5">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={t.folderPlaceholder}
                    className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#2b3038] text-xs"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-medium"
                  >
                    +
                  </button>
                </form>
              )}

              <div className="space-y-1">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(null)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition ${
                    selectedFolderId === null
                      ? 'bg-slate-200/80 dark:bg-[#1e2228] text-slate-900 dark:text-white'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.folderAll}
                </button>
                {folders.map((folder) => (
                  <div key={folder.id} className="group flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSelectedFolderId(folder.id)}
                      className={`flex-1 text-left px-3 py-2 rounded-xl text-xs font-medium truncate transition ${
                        selectedFolderId === folder.id
                          ? 'bg-slate-200/80 dark:bg-[#1e2228] text-slate-900 dark:text-white'
                          : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {folder.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteFolder(folder.id)}
                      aria-label="Delete folder"
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 hover:text-rose-500 transition"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clean unboxed storage summary */}
          <div className="mt-auto pt-4 border-t border-slate-200 dark:border-[#22262c] px-1 text-xs text-slate-500 dark:text-slate-400 space-y-1">
            <p className="font-mono tabular-nums font-medium text-slate-700 dark:text-slate-300">
              {t.itemsCount(files.length)} · {formatBytes(totalBytes)}
            </p>
            <p>{t.itemsCount(notes.length)} · {t.navNotes}</p>
          </div>
        </aside>

        {/* Main Workspace Content */}
        <main className="flex-1 min-w-0">
          {(activeTab === 'files' || activeTab === 'photos') && (
            <div className="space-y-5">
              {/* Search + Category Filters */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t.searchPlaceholder}
                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {activeTab === 'files' && (
                  <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-200/70 dark:bg-[#17191d] border border-slate-200/60 dark:border-[#242830] overflow-x-auto">
                    {(
                      [
                        { id: 'all', label: t.allFiles },
                        { id: 'image', label: t.images },
                        { id: 'video', label: t.videos },
                        { id: 'audio', label: t.audio },
                        { id: 'document', label: t.documents },
                        { id: 'starred', label: t.starred },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategoryFilter(cat.id)}
                        className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition whitespace-nowrap shrink-0 ${
                          categoryFilter === cat.id
                            ? 'bg-white dark:bg-[#242932] text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Mobile Folder Strip */}
              {activeTab === 'files' && (
                <div className="flex lg:hidden items-center gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => setSelectedFolderId(null)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border ${
                      selectedFolderId === null
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                        : 'bg-white dark:bg-[#17191d] border-slate-200 dark:border-[#262b33] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t.folderAll}
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => setSelectedFolderId(folder.id)}
                      className={`min-h-[38px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border ${
                        selectedFolderId === folder.id
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                          : 'bg-white dark:bg-[#17191d] border-slate-200 dark:border-[#262b33] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {folder.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowNewFolder((v) => !v)}
                    className="min-h-[38px] px-3 rounded-xl text-xs font-medium whitespace-nowrap shrink-0 border border-dashed border-slate-300 dark:border-[#2f3540] text-slate-500 inline-flex items-center gap-1"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>{t.newFolder}</span>
                  </button>
                </div>
              )}

              {showNewFolder && (
                <form
                  onSubmit={(e) => void handleCreateFolder(e)}
                  className="flex lg:hidden items-center gap-2"
                >
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder={t.folderPlaceholder}
                    className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#2b3038] text-sm"
                  />
                  <button
                    type="submit"
                    className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-sm font-medium"
                  >
                    {t.create}
                  </button>
                </form>
              )}

              {/* Drop Zone Indicator / Empty State */}
              {isDragging ? (
                <div className="rounded-3xl border-2 border-dashed border-amber-500 bg-amber-500/10 p-12 text-center">
                  <Upload className="w-8 h-8 text-amber-500 mx-auto mb-3" />
                  <p className="text-base font-semibold text-slate-900 dark:text-white">
                    {t.dropPrompt}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.dropSub}</p>
                </div>
              ) : loading ? (
                <div className="py-16 text-center text-sm text-slate-500">Decrypting vault...</div>
              ) : displayedFiles.length === 0 ? (
                <div className="rounded-3xl bg-white dark:bg-[#17191d] border border-dashed border-slate-300 dark:border-[#2a3038] p-10 text-center">
                  <Upload className="w-7 h-7 text-amber-500 mx-auto mb-3" />
                  <p className="font-[Outfit] text-base font-semibold text-slate-900 dark:text-white">
                    {t.emptyFiles}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                    {t.emptyFilesSub}
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-5 min-h-[44px] px-5 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    <span>{t.importFiles}</span>
                  </button>
                </div>
              ) : activeTab === 'photos' ? (
                /* Photo & Video Media Grid */
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {displayedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="group relative rounded-2xl overflow-hidden bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] aspect-square"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="w-full h-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                        {file.thumbnailUrl ? (
                          <img
                            src={file.thumbnailUrl}
                            alt={file.name}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            {renderCategoryIcon(file.category)}
                            <span className="text-xs text-slate-500 truncate max-w-full">
                              {file.name}
                            </span>
                          </div>
                        )}
                      </button>

                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-end justify-between gap-2 pointer-events-none">
                        <span className="text-xs font-medium text-white truncate">{file.name}</span>
                        <span className="text-[11px] font-mono tabular-nums text-slate-300 shrink-0">
                          {formatBytes(file.size)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                /* Files Tap List / Cards */
                <div className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] divide-y divide-slate-100 dark:divide-[#23272f] overflow-hidden">
                  {displayedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 px-4 py-3 min-h-[64px] hover:bg-slate-50 dark:hover:bg-[#1d2026] transition"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewFile(file)}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left focus-visible:outline-none"
                      >
                        {file.thumbnailUrl ? (
                          <img
                            src={file.thumbnailUrl}
                            alt={file.name}
                            referrerPolicy="no-referrer"
                            className="w-11 h-11 rounded-xl object-cover shrink-0 bg-slate-100 dark:bg-[#22262c]"
                          />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-slate-100 dark:bg-[#22262c] flex items-center justify-center shrink-0">
                            {renderCategoryIcon(file.category)}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {file.name}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate font-mono tabular-nums">
                            {file.category} · {formatBytes(file.size)} ·{' '}
                            {new Date(file.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleToggleStar(file.id)}
                          aria-label="Star file"
                          className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center hover:bg-slate-200/60 dark:hover:bg-[#262b33] transition"
                        >
                          <Star
                            className={`w-4 h-4 ${
                              file.starred
                                ? 'fill-amber-500 text-amber-500'
                                : 'text-slate-400'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteFile(file.id)}
                          aria-label={t.deleteItem}
                          className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <VaultNotesTab
              notes={notes}
              language={config.language}
              onSaveNote={handleSaveNote}
              onDeleteNote={handleDeleteNote}
            />
          )}

          {activeTab === 'settings' && (
            <VaultSettingsTab
              config={config}
              space={space}
              masterKey={masterKey}
              onConfigUpdated={onConfigUpdated}
              onUpdatePreferences={onUpdatePreferences}
              onSpaceWiped={refreshAll}
              onBackupRestored={refreshAll}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-14 pb-safe bg-white/90 dark:bg-[#111315]/95 backdrop-blur-md border-t border-slate-200 dark:border-[#22262c] grid grid-cols-4 items-center">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition ${
                active ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {item.icon}
              <span className="text-[11px] font-medium tracking-tight">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Decrypted File Preview Modal */}
      <FilePreviewModal
        file={previewFile}
        masterKey={masterKey}
        language={config.language}
        onClose={() => setPreviewFile(null)}
        onDelete={(id) => void handleDeleteFile(id)}
        onToggleStar={(id) => void handleToggleStar(id)}
      />
    </div>
  );
};
