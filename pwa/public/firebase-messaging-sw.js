// Service Worker para Firebase Cloud Messaging (background notifications)
// Debe estar en la raíz del dominio: /firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

// Valores hardcodeados — los Service Workers no pueden leer variables de Vite
firebase.initializeApp({
  apiKey:            'AIzaSyCRiluFn6_oHS_DtNf-LW5OsiWcUUQW3vw',
  authDomain:        'consultoria-bf3e9.firebaseapp.com',
  projectId:         'consultoria-bf3e9',
  storageBucket:     'consultoria-bf3e9.firebasestorage.app',
  messagingSenderId: '1068776221332',
  appId:             '1:1068776221332:web:bc85d81ff2029f6794a281',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification ?? {};
  self.registration.showNotification(title ?? 'CURP Bot', {
    body: body ?? '',
    icon: '/favicon.ico',
  });
});
