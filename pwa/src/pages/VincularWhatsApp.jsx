import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase.js';

export default function VincularWhatsApp() {
  const [qrData, setQrData] = useState(undefined); // undefined=cargando, null=no hay QR

  useEffect(() => {
    return onSnapshot(doc(db, 'configuracion', 'qr'), (snap) => {
      if (!snap.exists()) { setQrData(null); return; }
      const d = snap.data();
      setQrData(d);
    }, (err) => {
      console.error('[VincularWA]', err.message);
      setQrData(null);
    });
  }, []);

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-xl font-bold">Vincular WhatsApp</h2>
        <p className="text-gray-400 text-sm mt-1">
          Escanea el código QR con WhatsApp para conectar el bot.
        </p>
      </div>

      <div className="bg-gray-900 rounded-2xl p-6 flex flex-col items-center gap-5">
        {/* Cargando */}
        {qrData === undefined && (
          <div className="w-64 h-64 flex items-center justify-center">
            <span className="text-gray-500 animate-pulse text-sm">Cargando...</span>
          </div>
        )}

        {/* Ya vinculado */}
        {qrData !== undefined && qrData?.paired === true && (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-3">
            <span className="text-6xl">✅</span>
            <p className="text-green-400 font-semibold text-center">WhatsApp vinculado</p>
            <p className="text-gray-500 text-xs text-center">El bot está activo y conectado.</p>
          </div>
        )}

        {/* Sin QR disponible y no vinculado */}
        {qrData !== undefined && !qrData?.paired && !qrData?.dataUrl && (
          <div className="w-64 h-64 flex flex-col items-center justify-center gap-3">
            <span className="text-5xl">⏳</span>
            <p className="text-gray-400 text-sm text-center">
              El bot no ha generado un QR todavía.
            </p>
            <p className="text-gray-600 text-xs text-center">
              Inicia el bot con <code className="bg-gray-800 px-1 rounded">pm2 start curp-bot</code> y
              regresa aquí.
            </p>
          </div>
        )}

        {/* QR disponible */}
        {qrData?.dataUrl && !qrData?.paired && (
          <>
            <img
              src={qrData.dataUrl}
              alt="QR WhatsApp"
              className="w-64 h-64 rounded-xl border-4 border-indigo-600"
            />
            <p className="text-xs text-gray-400 text-center">
              Abre WhatsApp → Dispositivos vinculados → Vincular dispositivo →
              Escanea este código
            </p>
            <p className="text-xs text-gray-600 text-center animate-pulse">
              El QR se actualiza automáticamente cada vez que caduca
            </p>
          </>
        )}
      </div>

      <div className="bg-gray-900 rounded-xl p-4 space-y-2 text-xs text-gray-500">
        <p className="font-semibold text-gray-400">📱 iOS / Android</p>
        <p>WhatsApp → menú ⋮ → Dispositivos vinculados → Vincular un dispositivo</p>
        <p className="font-semibold text-gray-400 pt-1">⚠️ Nota de seguridad</p>
        <p>El QR expira en ~20 segundos. Si caduca, el bot genera uno nuevo automáticamente.</p>
      </div>
    </div>
  );
}
