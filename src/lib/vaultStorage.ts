import {
  base64ToBuffer,
  base64ToBytes,
  bufferToBase64,
  bytesToBase64,
  createImageThumbnail,
  decryptBytes,
  decryptJSON,
  derivePinCredentials,
  encryptBytes,
  encryptJSON,
  generateMasterKey,
  generateRandomBytes,
  unwrapMasterKey,
  wrapMasterKey,
} from './crypto';
import type {
  AppLanguage,
  AppTheme,
  VaultConfig,
  VaultFileItem,
  VaultFileRecord,
  VaultFolder,
  VaultNote,
  VaultNoteRecord,
  VaultSpace,
} from '../types/vault';

const DB_NAME = 'c007_vault_db';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('config')) {
        db.createObjectStore('config', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files')) {
        const filesStore = db.createObjectStore('files', { keyPath: 'id' });
        filesStore.createIndex('space', 'space', { unique: false });
      }
      if (!db.objectStoreNames.contains('notes')) {
        const notesStore = db.createObjectStore('notes', { keyPath: 'id' });
        notesStore.createIndex('space', 'space', { unique: false });
      }
      if (!db.objectStoreNames.contains('folders')) {
        const foldersStore = db.createObjectStore('folders', { keyPath: 'id' });
        foldersStore.createIndex('space', 'space', { unique: false });
      }
    };
  });
}

function idbGet<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).get(key);
        req.onsuccess = () => resolve(req.result as T | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbPut<T>(storeName: string, value: T): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbDelete(storeName: string, key: IDBValidKey): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.objectStore(storeName).delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

function idbGetAllBySpace<T>(storeName: string, space: VaultSpace): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const index = tx.objectStore(storeName).index('space');
        const req = index.getAll(space);
        req.onsuccess = () => resolve((req.result as T[]) || []);
        req.onerror = () => reject(req.error);
      })
  );
}

function idbGetAll<T>(storeName: string): Promise<T[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const req = tx.objectStore(storeName).getAll();
        req.onsuccess = () => resolve((req.result as T[]) || []);
        req.onerror = () => reject(req.error);
      })
  );
}

export async function ensureVaultConfig(): Promise<VaultConfig> {
  const existing = await idbGet<VaultConfig>('config', 'main');
  if (existing) return existing;

  const pinSalt = generateRandomBytes(16);
  const { verifierHash, kek } = await derivePinCredentials('007', pinSalt);
  const masterKey = await generateMasterKey();
  const { wrapped, iv } = await wrapMasterKey(masterKey, kek);

  const defaultLang: AppLanguage =
    typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr')
      ? 'fr'
      : 'en';

  const config: VaultConfig = {
    id: 'main',
    pinSalt,
    primaryPinHash: verifierHash,
    wrappedMasterKeyPrimary: wrapped,
    wrappedMasterKeyPrimaryIv: iv,
    isPinCustomized: false,
    hintDismissed: false,
    autoLockSeconds: 180,
    lockOnHide: false,
    language: defaultLang,
    theme: 'dark',
  };

  await idbPut('config', config);
  return config;
}

export async function updateVaultPreferences(
  patch: Partial<Pick<VaultConfig, 'autoLockSeconds' | 'lockOnHide' | 'language' | 'theme' | 'hintDismissed'>>
): Promise<VaultConfig> {
  const config = await ensureVaultConfig();
  const updated: VaultConfig = { ...config, ...patch };
  await idbPut('config', updated);
  return updated;
}

export async function unlockVaultWithPin(
  pin: string
): Promise<{ space: VaultSpace; masterKey: CryptoKey; config: VaultConfig } | null> {
  const config = await ensureVaultConfig();
  const { verifierHash, kek } = await derivePinCredentials(pin, config.pinSalt);

  if (verifierHash === config.primaryPinHash) {
    const masterKey = await unwrapMasterKey(
      config.wrappedMasterKeyPrimary,
      config.wrappedMasterKeyPrimaryIv,
      kek
    );
    return { space: 'primary', masterKey, config };
  }

  if (
    config.decoyPinHash &&
    config.wrappedMasterKeyDecoy &&
    config.wrappedMasterKeyDecoyIv &&
    verifierHash === config.decoyPinHash
  ) {
    const masterKey = await unwrapMasterKey(
      config.wrappedMasterKeyDecoy,
      config.wrappedMasterKeyDecoyIv,
      kek
    );
    return { space: 'decoy', masterKey, config };
  }

  return null;
}

export async function updatePrimaryPin(
  masterKey: CryptoKey,
  newPin: string
): Promise<{ ok: boolean; error?: 'conflict'; config?: VaultConfig }> {
  const config = await ensureVaultConfig();
  const { verifierHash, kek } = await derivePinCredentials(newPin, config.pinSalt);

  if (config.decoyPinHash && verifierHash === config.decoyPinHash) {
    return { ok: false, error: 'conflict' };
  }

  const { wrapped, iv } = await wrapMasterKey(masterKey, kek);
  const updated: VaultConfig = {
    ...config,
    primaryPinHash: verifierHash,
    wrappedMasterKeyPrimary: wrapped,
    wrappedMasterKeyPrimaryIv: iv,
    isPinCustomized: true,
    hintDismissed: true,
  };
  await idbPut('config', updated);
  return { ok: true, config: updated };
}

export async function setDecoyPin(
  newDecoyPin: string
): Promise<{ ok: boolean; error?: 'conflict'; config?: VaultConfig }> {
  const config = await ensureVaultConfig();
  const { verifierHash, kek } = await derivePinCredentials(newDecoyPin, config.pinSalt);

  if (verifierHash === config.primaryPinHash) {
    return { ok: false, error: 'conflict' };
  }

  let decoyKey: CryptoKey;
  if (config.wrappedMasterKeyDecoy && config.wrappedMasterKeyDecoyIv) {
    // Generate fresh key if rotating decoy PIN without old decoy PIN; or keep existing decoy items
    // Note: if decoy space already has items, warn or wipe; here we only preserve if empty, otherwise re-init cleanly
    const existingFiles = await idbGetAllBySpace<VaultFileRecord>('files', 'decoy');
    const existingNotes = await idbGetAllBySpace<VaultNoteRecord>('notes', 'decoy');
    for (const f of existingFiles) await idbDelete('files', f.id);
    for (const n of existingNotes) await idbDelete('notes', n.id);
  }
  decoyKey = await generateMasterKey();
  const { wrapped, iv } = await wrapMasterKey(decoyKey, kek);

  const updated: VaultConfig = {
    ...config,
    decoyPinHash: verifierHash,
    wrappedMasterKeyDecoy: wrapped,
    wrappedMasterKeyDecoyIv: iv,
  };
  await idbPut('config', updated);
  return { ok: true, config: updated };
}

function classifyMimeType(mime: string, name: string): VaultFileRecord['category'] {
  const lower = mime.toLowerCase();
  if (lower.startsWith('image/')) return 'image';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  const ext = name.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'heic'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'mkv'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac'].includes(ext)) return 'audio';
  return 'document';
}

export async function importFilesToVault(
  files: FileList | File[],
  space: VaultSpace,
  folderId: string | null,
  masterKey: CryptoKey
): Promise<VaultFileItem[]> {
  const list = Array.from(files);
  const created: VaultFileItem[] = [];

  for (const file of list) {
    const buffer = await file.arrayBuffer();
    const { iv, ciphertext } = await encryptBytes(buffer, masterKey);
    const thumbBytes = await createImageThumbnail(file);

    let thumbnailIv: Uint8Array | undefined;
    let encryptedThumbnail: ArrayBuffer | undefined;
    let thumbnailUrl: string | undefined;

    if (thumbBytes) {
      const encThumb = await encryptBytes(thumbBytes, masterKey);
      thumbnailIv = encThumb.iv;
      encryptedThumbnail = encThumb.ciphertext;
      thumbnailUrl = URL.createObjectURL(
        new Blob([thumbBytes.buffer as ArrayBuffer], { type: 'image/jpeg' })
      );
    }

    const now = Date.now();
    const id = crypto.randomUUID();
    const category = classifyMimeType(file.type, file.name);
    const record: VaultFileRecord = {
      id,
      space,
      folderId,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      category,
      createdAt: now,
      updatedAt: now,
      starred: false,
      iv,
      encryptedData: ciphertext,
      thumbnailIv,
      encryptedThumbnail,
    };

    await idbPut('files', record);
    created.push({
      id,
      space,
      folderId,
      name: record.name,
      mimeType: record.mimeType,
      size: record.size,
      category,
      createdAt: now,
      updatedAt: now,
      starred: false,
      thumbnailUrl,
    });
  }

  return created;
}

export async function loadVaultFiles(
  space: VaultSpace,
  masterKey: CryptoKey
): Promise<VaultFileItem[]> {
  const records = await idbGetAllBySpace<VaultFileRecord>('files', space);
  records.sort((a, b) => b.createdAt - a.createdAt);

  const items: VaultFileItem[] = [];
  for (const rec of records) {
    let thumbnailUrl: string | undefined;
    if (rec.encryptedThumbnail && rec.thumbnailIv) {
      try {
        const plainThumb = await decryptBytes(rec.encryptedThumbnail, rec.thumbnailIv, masterKey);
        thumbnailUrl = URL.createObjectURL(new Blob([plainThumb], { type: 'image/jpeg' }));
      } catch {
        thumbnailUrl = undefined;
      }
    }
    items.push({
      id: rec.id,
      space: rec.space,
      folderId: rec.folderId,
      name: rec.name,
      mimeType: rec.mimeType,
      size: rec.size,
      category: rec.category,
      createdAt: rec.createdAt,
      updatedAt: rec.updatedAt,
      starred: rec.starred,
      thumbnailUrl,
    });
  }

  return items;
}

export async function decryptVaultFile(
  fileId: string,
  masterKey: CryptoKey
): Promise<{ blob: Blob; url: string; name: string; mimeType: string } | null> {
  const rec = await idbGet<VaultFileRecord>('files', fileId);
  if (!rec) return null;
  const plain = await decryptBytes(rec.encryptedData, rec.iv, masterKey);
  const blob = new Blob([plain], { type: rec.mimeType || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  return { blob, url, name: rec.name, mimeType: rec.mimeType };
}

export async function toggleStarVaultFile(fileId: string): Promise<boolean> {
  const rec = await idbGet<VaultFileRecord>('files', fileId);
  if (!rec) return false;
  rec.starred = !rec.starred;
  rec.updatedAt = Date.now();
  await idbPut('files', rec);
  return rec.starred;
}

export async function deleteVaultFile(fileId: string): Promise<void> {
  await idbDelete('files', fileId);
}

export async function loadVaultFolders(space: VaultSpace): Promise<VaultFolder[]> {
  const folders = await idbGetAllBySpace<VaultFolder>('folders', space);
  folders.sort((a, b) => a.createdAt - b.createdAt);
  return folders;
}

export async function createVaultFolder(space: VaultSpace, name: string): Promise<VaultFolder> {
  const folder: VaultFolder = {
    id: crypto.randomUUID(),
    space,
    name: name.trim(),
    createdAt: Date.now(),
  };
  await idbPut('folders', folder);
  return folder;
}

export async function deleteVaultFolder(folderId: string): Promise<void> {
  const files = await idbGetAll<VaultFileRecord>('files');
  for (const file of files) {
    if (file.folderId === folderId) {
      file.folderId = null;
      await idbPut('files', file);
    }
  }
  await idbDelete('folders', folderId);
}

export async function loadVaultNotes(
  space: VaultSpace,
  masterKey: CryptoKey
): Promise<VaultNote[]> {
  const records = await idbGetAllBySpace<VaultNoteRecord>('notes', space);
  records.sort((a, b) => b.updatedAt - a.updatedAt);

  const notes: VaultNote[] = [];
  for (const rec of records) {
    try {
      const payload = await decryptJSON<{ title: string; content: string }>(
        rec.encryptedPayload,
        rec.iv,
        masterKey
      );
      notes.push({
        id: rec.id,
        space: rec.space,
        title: payload.title,
        content: payload.content,
        createdAt: rec.createdAt,
        updatedAt: rec.updatedAt,
        pinned: rec.pinned,
      });
    } catch {
      // Skip undecryptable note
    }
  }
  return notes;
}

export async function saveVaultNote(
  note: Omit<VaultNote, 'createdAt' | 'updatedAt'> & { createdAt?: number },
  masterKey: CryptoKey
): Promise<VaultNote> {
  const now = Date.now();
  const createdAt = note.createdAt ?? now;
  const { iv, ciphertext } = await encryptJSON(
    { title: note.title, content: note.content },
    masterKey
  );

  const record: VaultNoteRecord = {
    id: note.id,
    space: note.space,
    createdAt,
    updatedAt: now,
    pinned: note.pinned,
    iv,
    encryptedPayload: ciphertext,
  };

  await idbPut('notes', record);
  return {
    ...note,
    createdAt,
    updatedAt: now,
  };
}

export async function deleteVaultNote(noteId: string): Promise<void> {
  await idbDelete('notes', noteId);
}

export async function wipeVaultSpace(space: VaultSpace): Promise<void> {
  const files = await idbGetAllBySpace<VaultFileRecord>('files', space);
  const notes = await idbGetAllBySpace<VaultNoteRecord>('notes', space);
  const folders = await idbGetAllBySpace<VaultFolder>('folders', space);
  for (const f of files) await idbDelete('files', f.id);
  for (const n of notes) await idbDelete('notes', n.id);
  for (const d of folders) await idbDelete('folders', d.id);
}

interface SerializedBackup {
  format: 'c007-vault-backup';
  version: 1;
  exportedAt: number;
  config: {
    pinSalt: string;
    primaryPinHash: string;
    wrappedMasterKeyPrimary: string;
    wrappedMasterKeyPrimaryIv: string;
    decoyPinHash?: string;
    wrappedMasterKeyDecoy?: string;
    wrappedMasterKeyDecoyIv?: string;
    isPinCustomized: boolean;
    autoLockSeconds: number;
    lockOnHide: boolean;
    language: AppLanguage;
    theme: AppTheme;
  };
  folders: VaultFolder[];
  files: Array<{
    id: string;
    space: VaultSpace;
    folderId: string | null;
    name: string;
    mimeType: string;
    size: number;
    category: VaultFileRecord['category'];
    createdAt: number;
    updatedAt: number;
    starred: boolean;
    iv: string;
    encryptedData: string;
    thumbnailIv?: string;
    encryptedThumbnail?: string;
  }>;
  notes: Array<{
    id: string;
    space: VaultSpace;
    updatedAt: number;
    createdAt: number;
    pinned: boolean;
    iv: string;
    encryptedPayload: string;
  }>;
}

export async function exportEncryptedBackup(): Promise<Blob> {
  const config = await ensureVaultConfig();
  const folders = await idbGetAll<VaultFolder>('folders');
  const files = await idbGetAll<VaultFileRecord>('files');
  const notes = await idbGetAll<VaultNoteRecord>('notes');

  const payload: SerializedBackup = {
    format: 'c007-vault-backup',
    version: 1,
    exportedAt: Date.now(),
    config: {
      pinSalt: bytesToBase64(config.pinSalt),
      primaryPinHash: config.primaryPinHash,
      wrappedMasterKeyPrimary: bufferToBase64(config.wrappedMasterKeyPrimary),
      wrappedMasterKeyPrimaryIv: bytesToBase64(config.wrappedMasterKeyPrimaryIv),
      decoyPinHash: config.decoyPinHash,
      wrappedMasterKeyDecoy: config.wrappedMasterKeyDecoy
        ? bufferToBase64(config.wrappedMasterKeyDecoy)
        : undefined,
      wrappedMasterKeyDecoyIv: config.wrappedMasterKeyDecoyIv
        ? bytesToBase64(config.wrappedMasterKeyDecoyIv)
        : undefined,
      isPinCustomized: config.isPinCustomized,
      autoLockSeconds: config.autoLockSeconds,
      lockOnHide: config.lockOnHide,
      language: config.language,
      theme: config.theme,
    },
    folders,
    files: files.map((f) => ({
      ...f,
      iv: bytesToBase64(f.iv),
      encryptedData: bufferToBase64(f.encryptedData),
      thumbnailIv: f.thumbnailIv ? bytesToBase64(f.thumbnailIv) : undefined,
      encryptedThumbnail: f.encryptedThumbnail ? bufferToBase64(f.encryptedThumbnail) : undefined,
    })),
    notes: notes.map((n) => ({
      ...n,
      iv: bytesToBase64(n.iv),
      encryptedPayload: bufferToBase64(n.encryptedPayload),
    })),
  };

  return new Blob([JSON.stringify(payload)], { type: 'application/octet-stream' });
}

export async function importEncryptedBackup(file: File): Promise<boolean> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as SerializedBackup;
    if (parsed.format !== 'c007-vault-backup' || parsed.version !== 1) return false;

    const restoredConfig: VaultConfig = {
      id: 'main',
      pinSalt: base64ToBytes(parsed.config.pinSalt),
      primaryPinHash: parsed.config.primaryPinHash,
      wrappedMasterKeyPrimary: base64ToBuffer(parsed.config.wrappedMasterKeyPrimary),
      wrappedMasterKeyPrimaryIv: base64ToBytes(parsed.config.wrappedMasterKeyPrimaryIv),
      decoyPinHash: parsed.config.decoyPinHash,
      wrappedMasterKeyDecoy: parsed.config.wrappedMasterKeyDecoy
        ? base64ToBuffer(parsed.config.wrappedMasterKeyDecoy)
        : undefined,
      wrappedMasterKeyDecoyIv: parsed.config.wrappedMasterKeyDecoyIv
        ? base64ToBytes(parsed.config.wrappedMasterKeyDecoyIv)
        : undefined,
      isPinCustomized: parsed.config.isPinCustomized,
      hintDismissed: true,
      autoLockSeconds: parsed.config.autoLockSeconds,
      lockOnHide: parsed.config.lockOnHide,
      language: parsed.config.language,
      theme: parsed.config.theme,
    };

    await idbPut('config', restoredConfig);

    for (const folder of parsed.folders) {
      await idbPut('folders', folder);
    }

    for (const f of parsed.files) {
      const rec: VaultFileRecord = {
        id: f.id,
        space: f.space,
        folderId: f.folderId,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size,
        category: f.category,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        starred: f.starred,
        iv: base64ToBytes(f.iv),
        encryptedData: base64ToBuffer(f.encryptedData),
        thumbnailIv: f.thumbnailIv ? base64ToBytes(f.thumbnailIv) : undefined,
        encryptedThumbnail: f.encryptedThumbnail ? base64ToBuffer(f.encryptedThumbnail) : undefined,
      };
      await idbPut('files', rec);
    }

    for (const n of parsed.notes) {
      const rec: VaultNoteRecord = {
        id: n.id,
        space: n.space,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        pinned: n.pinned,
        iv: base64ToBytes(n.iv),
        encryptedPayload: base64ToBuffer(n.encryptedPayload),
      };
      await idbPut('notes', rec);
    }

    return true;
  } catch {
    return false;
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
