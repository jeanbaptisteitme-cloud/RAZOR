export type VaultSpace = 'primary' | 'decoy';

export type VaultFileCategory = 'all' | 'image' | 'video' | 'audio' | 'document';

export type AppLanguage = 'en' | 'fr';

export type AppTheme = 'dark' | 'light';

export interface EncryptedBlob {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export interface VaultFileRecord {
  id: string;
  space: VaultSpace;
  folderId: string | null;
  name: string;
  mimeType: string;
  size: number;
  category: Exclude<VaultFileCategory, 'all'>;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  iv: Uint8Array;
  encryptedData: ArrayBuffer;
  thumbnailIv?: Uint8Array;
  encryptedThumbnail?: ArrayBuffer;
}

export interface VaultFileItem {
  id: string;
  space: VaultSpace;
  folderId: string | null;
  name: string;
  mimeType: string;
  size: number;
  category: Exclude<VaultFileCategory, 'all'>;
  createdAt: number;
  updatedAt: number;
  starred: boolean;
  thumbnailUrl?: string;
}

export interface VaultFolder {
  id: string;
  space: VaultSpace;
  name: string;
  createdAt: number;
}

export interface VaultNoteRecord {
  id: string;
  space: VaultSpace;
  updatedAt: number;
  createdAt: number;
  pinned: boolean;
  iv: Uint8Array;
  encryptedPayload: ArrayBuffer;
}

export interface VaultNote {
  id: string;
  space: VaultSpace;
  title: string;
  content: string;
  updatedAt: number;
  createdAt: number;
  pinned: boolean;
}

export interface VaultConfig {
  id: 'main';
  pinSalt: Uint8Array;
  primaryPinHash: string;
  wrappedMasterKeyPrimary: ArrayBuffer;
  wrappedMasterKeyPrimaryIv: Uint8Array;
  decoyPinHash?: string;
  wrappedMasterKeyDecoy?: ArrayBuffer;
  wrappedMasterKeyDecoyIv?: Uint8Array;
  isPinCustomized: boolean;
  hintDismissed: boolean;
  autoLockSeconds: number;
  lockOnHide: boolean;
  language: AppLanguage;
  theme: AppTheme;
}

export interface CalcHistoryEntry {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}
