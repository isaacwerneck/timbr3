import { initializeApp } from 'firebase/app';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyDx3-6p0jETZRLsFl14PPkeLv_LMywIWXA',
  authDomain: 'timbr3synth.firebaseapp.com',
  projectId: 'timbr3synth',
  storageBucket: 'timbr3synth.firebasestorage.app',
  messagingSenderId: '1082522846607',
  appId: '1:1082522846607:web:7adad1111d28f4126d77fa',
  measurementId: 'G-WDLD7EF1TM',
};

export const firebaseApp = initializeApp(firebaseConfig);

export const initFirebaseAnalytics = async () => {
  if (typeof window === 'undefined') return;
  const supported = await isSupported();
  if (!supported) return;
  getAnalytics(firebaseApp);
};
