import { auth, db, storage } from './firebase.js';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import {
  getDownloadURL,
  ref,
  uploadBytes
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, cleanObject(item)])
    );
  }
  return value;
}

function dataUrlToBlob(dataUrl) {
  const [meta, encoded] = String(dataUrl || '').split(',');
  if (!meta || !encoded) throw new Error('Fotografía no válida');
  const mime = meta.match(/data:(.*?);base64/)?.[1] || 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export function waitForAuthReady() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user || null);
    });
  });
}

export async function getCurrentRole() {
  const user = await waitForAuthReady();
  if (!user) return null;
  try {
    const snapshot = await getDoc(doc(db, 'users', user.uid));
    return snapshot.exists() ? (snapshot.data().role || 'field') : 'field';
  } catch {
    return 'field';
  }
}

export function currentAuthor() {
  const user = auth.currentUser;
  if (!user) return null;
  return {
    userId: user.uid,
    userName: user.displayName || user.email?.split('@')[0] || 'Usuario',
    userEmail: user.email || '',
    userPhoto: user.photoURL || ''
  };
}

export async function saveRecordToCloud(record, photoDataUrl) {
  const user = await waitForAuthReady();
  if (!user) throw new Error('AUTH_REQUIRED');

  const author = currentAuthor();
  const imagePath = `field-records/${user.uid}/${record.id}/evidencia.jpg`;
  const imageRef = ref(storage, imagePath);
  let imageUrl = '';

  // Si un intento anterior ya alcanzó Storage pero no Firestore,
  // reutilizamos el archivo para no sobrescribir evidencia de campo.
  try {
    imageUrl = await getDownloadURL(imageRef);
  } catch (error) {
    if (error?.code !== 'storage/object-not-found') throw error;
    const blob = dataUrlToBlob(photoDataUrl);
    await uploadBytes(imageRef, blob, {
      contentType: blob.type || 'image/jpeg',
      customMetadata: {
        recordId: record.id,
        userId: user.uid
      }
    });
    imageUrl = await getDownloadURL(imageRef);
  }

  const cleanPayload = cleanObject({
    ...record,
    ...author,
    imageUrl,
    imagePath,
    photoDataUrl: undefined,
    syncStatus: 'synced'
  });
  const payload = {
    ...cleanPayload,
    createdAtServer: serverTimestamp()
  };

  await setDoc(doc(db, 'records', record.id), payload);
  return { ...cleanPayload, imageUrl };
}

function normalizeRecord(snapshot) {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    ...data,
    createdAtServer: data.createdAtServer?.toDate?.()?.toISOString?.() || null
  };
}

export async function fetchRecordsFromCloud() {
  const user = await waitForAuthReady();
  if (!user) return [];

  // Durante la fase de investigación todos los usuarios autenticados
  // trabajan sobre una base compartida y pueden consultar todos los registros.
  const snapshot = await getDocs(collection(db, 'records'));
  return snapshot.docs
    .map(normalizeRecord)
    .sort((a, b) => String(a.createdAt || a.createdAtServer || '').localeCompare(String(b.createdAt || b.createdAtServer || '')));
}
