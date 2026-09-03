// Integración Firebase preparada para la siguiente etapa.
// La aplicación funciona actualmente con localStorage para permitir probar UI,
// cámara, GPS y exportación antes de configurar credenciales.
//
// Próximo paso:
// 1. Crear proyecto Firebase.
// 2. Activar Authentication, Firestore y Storage.
// 3. Copiar firebase-config.example.js como firebase-config.js.
// 4. Completar los valores del proyecto.
// 5. Sustituir el adaptador local por las funciones de este módulo.

import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
