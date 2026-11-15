const PBKDF2_ITERATIONS = 120_000;

export function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  return bytesToBase64(new Uint8Array(buffer));
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const bytes = base64ToBytes(base64);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function generateMasterKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function derivePinBits(pin: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  return crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    512
  );
}

export async function derivePinCredentials(
  pin: string,
  salt: Uint8Array
): Promise<{ verifierHash: string; kek: CryptoKey }> {
  const bits = await derivePinBits(pin, salt);
  const verifierBytes = new Uint8Array(bits, 0, 32);
  const kekBytes = new Uint8Array(bits, 32, 32);

  const kek = await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(kekBytes),
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );

  return {
    verifierHash: bytesToBase64(verifierBytes),
    kek,
  };
}

export async function wrapMasterKey(
  masterKey: CryptoKey,
  kek: CryptoKey
): Promise<{ wrapped: ArrayBuffer; iv: Uint8Array }> {
  const iv = generateRandomBytes(12);
  const wrapped = await crypto.subtle.wrapKey('raw', masterKey, kek, {
    name: 'AES-GCM',
    iv: toArrayBuffer(iv),
  });
  return { wrapped, iv };
}

export async function unwrapMasterKey(
  wrapped: ArrayBuffer,
  iv: Uint8Array,
  kek: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

export async function encryptBytes(
  data: ArrayBuffer | Uint8Array,
  key: CryptoKey
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const iv = generateRandomBytes(12);
  const payload = data instanceof Uint8Array ? toArrayBuffer(data) : data;
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    payload
  );
  return { iv, ciphertext };
}

export async function decryptBytes(
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: toArrayBuffer(iv) },
    key,
    ciphertext
  );
}

export async function encryptJSON<T>(
  value: T,
  key: CryptoKey
): Promise<{ iv: Uint8Array; ciphertext: ArrayBuffer }> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return encryptBytes(encoded, key);
}

export async function decryptJSON<T>(
  ciphertext: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<T> {
  const plain = await decryptBytes(ciphertext, iv, key);
  const text = new TextDecoder().decode(plain);
  return JSON.parse(text) as T;
}

export async function createImageThumbnail(file: File): Promise<Uint8Array | null> {
  if (!file.type.startsWith('image/')) return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      try {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          async (blob) => {
            URL.revokeObjectURL(url);
            if (!blob) {
              resolve(null);
              return;
            }
            const buf = await blob.arrayBuffer();
            resolve(new Uint8Array(buf));
          },
          'image/jpeg',
          0.78
        );
      } catch {
        URL.revokeObjectURL(url);
        resolve(null);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });
}
