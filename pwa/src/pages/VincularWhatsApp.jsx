import { useEffect, useState, useRef } from 'react';
import { QRCode as QRCodeSVG } from 'react-qr-code';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase.js';

const CODE_TTL = 60; // segundos que dura el pairing code

export default function VincularWhatsApp() {
  const [qrData, setQrData] = useState(undefined);
  const [phone, setPhone] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [countdown, setCountdown] = useState(null); // segundos restantes del código
  const countdownRef = useRef(null);
  const [qrAge, setQrAge] = useState(null); // segundos desde último QR
  const qrAgeRef = useRef(null);

  useEffect(() => {
    return onSnapshot(doc(db, 'configuracion', 'qr'), (snap) => {
      if (!snap.exists()) { setQrData(null); return; }
      setQrData(snap.data());
    }, (err) => {
      console.error('[VincularWA]', err.message);
      setQrData(null);
    });
  }, []);

  // Limpiar "requesting" cuando llega el código o un error
  useEffect(() => {
    if (qrData?.pairingCode || qrData?.pairingCodeError) {
      setRequesting(false);
    }
    if (qrData?.paired) {
      setRestarting(false);
    }
  }, [qrData?.pairingCode, qrData?.pairingCodeError, qrData?.paired]);

  // Contador de edad del QR (segundos desde createdAt)
  useEffect(() => {
    if (qrData?.createdAt && !qrData?.paired) {
      const update = () => {
        const seconds = Math.round((Date.now() - new Date(qrData.createdAt).getTime()) / 1000);
        setQrAge(seconds);
      };
      update();
      if (qrAgeRef.current) clearInterval(qrAgeRef.current);
      qrAgeRef.current = setInterval(update, 1000);
    } else {
      clearInterval(qrAgeRef.current);
      setQrAge(null);
    }
    return () => clearInterval(qrAgeRef.current);
  }, [qrData?.createdAt, qrData?.paired]);

  // Countdown del código de emparejamiento
  useEffect(() => {
    if (qrData?.pairingCode) {
      setCountdown(CODE_TTL);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) { clearInterval(countdownRef.current); return 0; }
          return c - 1;
        });
      }, 1000);
    } else {
      clearInterval(countdownRef.current);
      setCountdown(null);
    }
    return () => clearInterval(countdownRef.current);
  }, [qrData?.pairingCode]);

  async function solicitarCodigo() {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 10) return;
    setRequesting(true);
    await setDoc(doc(db, 'configuracion', 'qr'), {
      pairingCodeRequest: digits,
      pairingCode: null,
      pairingCodeError: null,
    }, { merge: true });
  }

  async function reiniciarQR() {
    setRestarting(true);
    await setDoc(doc(db, 'configuracion', 'qr'), {
      reiniciarQR: true,
      pairingCode: null,
      pairingCodeError: null,
    }, { merge: true });
  }

  const isPaired = qrData?.paired === true;
  const hasQr = !!qrData?.qrString && !isPaired;
  const botAvailable = qrData !== undefined && !isPaired;
  // QR fresco: menos de 18 s (WhatsApp renueva cada ~20 s)
  const qrFresh = qrAge !== null && qrAge < 18;
  const qrAging = qrAge !== null && qrAge >= 18;
  const codeExpired = countdown === 0;

  return (
    <div className="space-y-6 max-w-lg">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Vincular WhatsApp</h2>
          <p className="text-gray-400 text-sm mt-1">
            Conecta el bot escaneando el QR o usando un código por número de teléfono.
          </p>
        </div>
        {/* Botón reiniciar siempre visible (útil cuando el modo QR/teléfono queda en estado roto) */}
        <button
          onClick={reiniciarQR}
          disabled={restarting}
          title="Desvincula la sesión actual y genera un nuevo QR"
          className="shrink-0 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 hover:text-white text-xs rounded-lg transition"
        >
          {restarting ? 'Reiniciando…' : '🔄 Reiniciar'}
        </button>
      </div>

      {/* Cargando */}
      {qrData === undefined && (
        <div className="bg-gray-900 rounded-2xl p-8 flex items-center justify-center">
          <span className="text-gray-500 animate-pulse text-sm">Cargando...</span>
        </div>
      )}

      {/* Ya vinculado */}
      {isPaired && (
        <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-3">
          <span className="text-6xl">✅</span>
          <p className="text-green-400 font-semibold">WhatsApp vinculado</p>
          <p className="text-gray-500 text-xs">El bot está activo y conectado.</p>
          <p className="text-gray-600 text-xs text-center mt-1">
            Si necesitas volver a vincular, usa el botón 🔄 Reiniciar arriba.
          </p>
        </div>
      )}

      {/* Sin QR */}
      {qrData !== undefined && !isPaired && !qrData?.dataUrl && !restarting && (
        <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-3 text-center">
          <span className="text-5xl">⏳</span>
          <p className="text-gray-400 text-sm">El bot no ha generado un QR todavía.</p>
          <p className="text-gray-600 text-xs">
            Inicia el bot con <code className="bg-gray-800 px-1 rounded">pm2 start curp-bot</code> y regresa aquí.
          </p>
        </div>
      )}

      {/* Reiniciando */}
      {restarting && (
        <div className="bg-gray-900 rounded-2xl p-8 flex flex-col items-center gap-3">
          <span className="text-4xl animate-spin">⚙️</span>
          <p className="text-gray-400 text-sm animate-pulse">Reiniciando sesión… espera el nuevo QR.</p>
        </div>
      )}

      {/* QR disponible */}
      {hasQr && !restarting && (
        <div className="bg-gray-900 rounded-2xl p-6 flex flex-col items-center gap-4">
          {/* Indicador de frescura */}
          {qrAge !== null && (
            <div className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-mono ${
              qrAging
                ? 'bg-amber-900/30 text-amber-300 border border-amber-700/50'
                : 'bg-green-900/30 text-green-300 border border-green-700/50'
            }`}>
              <span>{qrAging ? '⚠️ QR envejeciendo — espera el siguiente' : '✅ QR fresco — escanea ahora'}</span>
              <span>{qrAge}s</span>
            </div>
          )}
          <div className="p-3 bg-white rounded-xl">
            <QRCodeSVG
              value={qrData.qrString}
              size={256}
              level="H"
              style={{ display: 'block' }}
            />
          </div>
          <p className="text-xs text-gray-400 text-center">
            WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Escanear QR
          </p>
          <p className="text-xs text-gray-600 text-center">
            El QR se renueva automáticamente cada ~20 s
          </p>
        </div>
      )}

      {/* Código por teléfono */}
      {botAvailable && !restarting && (
        <div className="bg-gray-900 rounded-2xl p-6 space-y-4">
          <div>
            <p className="font-semibold text-sm text-gray-200">📱 Vincular desde este dispositivo</p>
            <p className="text-gray-500 text-xs mt-1">
              Ingresa tu número de WhatsApp. Recibirás un código de 8 dígitos para vincularte sin escanear el QR.
            </p>
          </div>

          {/* Advertencia si ya se usó código (modo cambia de QR a teléfono) */}
          {qrData?.pairingCode && !qrData?.paired && (
            <div className="bg-amber-900/20 border border-amber-700/50 rounded-lg p-2 text-xs text-amber-300">
              ⚠️ Una vez que solicitas el código, el modo QR queda desactivado en esta sesión. Si el código falla, usa 🔄 Reiniciar.
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="tel"
              placeholder="521XXXXXXXXXX (con código de país)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="flex-1 bg-gray-800 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-600"
            />
            <button
              onClick={solicitarCodigo}
              disabled={requesting || phone.replace(/\D/g, '').length < 10 || !!qrData?.pairingCode}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition"
            >
              {requesting ? '...' : 'Obtener código'}
            </button>
          </div>

          {/* Código generado + countdown */}
          {qrData?.pairingCode && (
            <div className={`rounded-xl p-4 text-center space-y-2 border ${
              codeExpired
                ? 'bg-gray-800 border-gray-700'
                : 'bg-indigo-900/40 border-indigo-700'
            }`}>
              {codeExpired ? (
                <>
                  <p className="text-xs text-gray-500">Código expirado</p>
                  <button
                    onClick={reiniciarQR}
                    className="text-sm text-indigo-400 hover:text-indigo-300 underline"
                  >
                    Reiniciar para obtener un nuevo código
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-indigo-300">Ingresa este código en WhatsApp</p>
                  <p className="text-3xl font-mono font-bold tracking-widest text-white">
                    {qrData.pairingCode}
                  </p>
                  <p className="text-xs text-gray-400">
                    WhatsApp → Dispositivos vinculados → Vincular con número de teléfono
                  </p>
                  <p className={`text-xs font-mono ${countdown <= 15 ? 'text-red-400' : 'text-gray-500'}`}>
                    Caduca en {countdown}s
                  </p>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {qrData?.pairingCodeError && (
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-3 space-y-2">
              <p className="text-xs text-red-300">
                ❌ {qrData.pairingCodeError}
              </p>
              <button
                onClick={reiniciarQR}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline"
              >
                Reiniciar sesión para intentar de nuevo
              </button>
            </div>
          )}
        </div>
      )}

      <div className="bg-gray-900 rounded-xl p-4 space-y-1 text-xs text-gray-500">
        <p className="font-semibold text-gray-400">ℹ️ Formato del número (México)</p>
        <p><code className="bg-gray-800 px-1 rounded">52</code> código de país + <code className="bg-gray-800 px-1 rounded">1</code> prefijo móvil + 10 dígitos</p>
        <p>Ejemplo: <code className="bg-gray-800 px-1 rounded">521XXXXXXXXXX</code></p>
        <p className="pt-1 font-semibold text-gray-400">⚠️ QR vs Código — importante</p>
        <p>Son métodos mutuamente excluyentes en la misma sesión. Si uno falla, usa 🔄 Reiniciar para volver al modo QR.</p>
      </div>
    </div>
  );
}
