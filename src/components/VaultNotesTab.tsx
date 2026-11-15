import React, { useEffect, useState } from 'react';
import { FilePlus2, Pin, Search, Trash2, ArrowLeft } from 'lucide-react';
import { getCopy } from '../lib/i18n';
import type { AppLanguage, VaultNote } from '../types/vault';

interface VaultNotesTabProps {
  notes: VaultNote[];
  language: AppLanguage;
  onSaveNote: (note: { id: string; title: string; content: string; pinned: boolean; createdAt?: number }) => Promise<VaultNote>;
  onDeleteNote: (id: string) => Promise<void>;
}

export const VaultNotesTab: React.FC<VaultNotesTabProps> = ({
  notes,
  language,
  onSaveNote,
  onDeleteNote,
}) => {
  const t = getCopy(language);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const filteredNotes = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
    if (!q) return sorted;
    return sorted.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, query]);

  const activeNote = notes.find((n) => n.id === activeId) || null;

  useEffect(() => {
    if (activeNote) {
      setTitle(activeNote.title);
      setContent(activeNote.content);
      setPinned(activeNote.pinned);
    }
  }, [activeNote?.id]);

  const handleNewNote = () => {
    const id = crypto.randomUUID();
    setActiveId(id);
    setTitle('');
    setContent('');
    setPinned(false);
  };

  const handleSave = async () => {
    if (!activeId) return;
    setSaving(true);
    try {
      await onSaveNote({
        id: activeId,
        title: title.trim() || (language === 'fr' ? 'Note sans titre' : 'Untitled note'),
        content,
        pinned,
        createdAt: activeNote?.createdAt,
      });
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await onDeleteNote(id);
    if (activeId === id) {
      setActiveId(null);
      setTitle('');
      setContent('');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Notes List */}
      <div
        className={`lg:col-span-5 flex flex-col gap-3 ${
          activeId ? 'hidden lg:flex' : 'flex'
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button
            type="button"
            onClick={handleNewNote}
            className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 active:scale-[0.98] transition inline-flex items-center gap-2 shrink-0 whitespace-nowrap"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>{t.newNote}</span>
          </button>
        </div>

        {filteredNotes.length === 0 ? (
          <div className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-8 text-center">
            <p className="text-sm font-medium text-slate-900 dark:text-white">{t.emptyNotes}</p>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t.emptyNotesSub}</p>
          </div>
        ) : (
          <div className="rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] divide-y divide-slate-100 dark:divide-[#23272f] overflow-hidden">
            {filteredNotes.map((note) => {
              const isSelected = note.id === activeId;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setActiveId(note.id)}
                  className={`w-full text-left px-4 py-3.5 min-h-[60px] transition flex items-start justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-[#1d2026]'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {note.pinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {note.title}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {note.content || '—'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Note Editor */}
      <div
        className={`lg:col-span-7 ${
          activeId ? 'flex' : 'hidden lg:flex'
        } flex-col rounded-2xl bg-white dark:bg-[#17191d] border border-slate-200 dark:border-[#262b33] p-5 min-h-[420px]`}
      >
        {!activeId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 dark:text-slate-500 py-12">
            <FilePlus2 className="w-7 h-7 mb-2 opacity-60" />
            <p className="text-sm">{t.emptyNotesSub}</p>
            <button
              type="button"
              onClick={handleNewNote}
              className="mt-4 min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition"
            >
              {t.newNote}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-[#23272f]">
              <button
                type="button"
                onClick={() => setActiveId(null)}
                className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300"
                aria-label="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => setPinned((p) => !p)}
                  aria-label="Pin note"
                  className={`min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center transition ${
                    pinned
                      ? 'bg-amber-500/15 text-amber-500'
                      : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-[#22262c]'
                  }`}
                >
                  <Pin className="w-4 h-4" />
                </button>

                {activeNote && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(activeNote.id)}
                    aria-label={t.deleteItem}
                    className="min-h-[44px] min-w-[44px] rounded-xl flex items-center justify-center text-rose-500 hover:bg-rose-500/10 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="min-h-[44px] px-4 rounded-xl bg-amber-600 text-white text-sm font-medium hover:bg-amber-500 transition disabled:opacity-50 whitespace-nowrap"
                >
                  {savedToast ? '✓' : t.saveNote}
                </button>
              </div>
            </div>

            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.noteTitlePlaceholder}
              className="mt-4 w-full bg-transparent font-[Outfit] text-xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
            />

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t.noteBodyPlaceholder}
              className="mt-3 flex-1 w-full resize-none bg-transparent text-sm leading-relaxed text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none min-h-[260px]"
            />
          </>
        )}
      </div>
    </div>
  );
};
