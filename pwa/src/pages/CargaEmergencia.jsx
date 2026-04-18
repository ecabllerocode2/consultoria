import { useEffect, useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Nota: Las variables de R2 deben comenzar con VITE_ para exponerse al cliente
const r2 = new S3Client({
  region: 'auto',
  endpoint: import.meta.env.VITE_R2_ENDPOINT,
  credentials: {
    accessKeyId:     import.meta.env.VITE_R2_ACCESS_KEY_ID,
    secretAccessKey: import.meta.env.VITE_R2_SECRET_ACCESS_KEY,
  },
});

export default function CargaEmergencia() {
  const [pendientes, setPendientes] = useState([]);
  const [curpSel, setCurpSel] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [estado, setEstado] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    async function cargar() {
      const q = query(collection(db, 'solicitudes'), where('esperandoPdf', '==', true));
      const snap = await getDocs(q);
      setPendientes(snap.docs.map((d) => d.data().curp));
    }
    cargar();
  }, []);

  async function subir() {
    if (!curpSel || !archivo) {
      setEstado('⚠️ Selecciona una CURP y un archivo PDF.');
      return;
    }

    setUploading(true);
    setEstado('Subiendo PDF...');

    try {
      const buffer = await archivo.arrayBuffer();
      const key = `${curpSel}/${Date.now()}.pdf`;

      await r2.send(new PutObjectCommand({
        Bucket: import.meta.env.VITE_R2_BUCKET_NAME,
        Key: key,
        Body: new Uint8Array(buffer),
        ContentType: 'application/pdf',
      }));

      const publicUrl = `${import.meta.env.VITE_R2_PUBLIC_URL}/${key}`;

      await updateDoc(doc(db, 'solicitudes', curpSel), {
        status: 'completado',
        esperandoPdf: false,
        ultimaReaccion: '✅',
        r2Url: publicUrl,
      });

      setEstado(`✅ PDF subido y trámite ${curpSel} marcado como completado.`);
      setCurpSel('');
      setArchivo(null);
    } catch (err) {
      setEstado(`❌ Error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-xl font-bold">Carga de Emergencia</h2>
        <p className="text-gray-400 text-sm mt-1">
          Sube manualmente un PDF cuando el bot esté fuera de línea.
        </p>
      </div>

      <div className="bg-gray-900 rounded-xl p-5 space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">CURP pendiente</label>
          <select
            value={curpSel}
            onChange={(e) => setCurpSel(e.target.value)}
            className="w-full bg-gray-800 text-white px-3 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Selecciona una CURP...</option>
            {pendientes.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {pendientes.length === 0 && (
            <p className="text-xs text-gray-600 mt-1">No hay CURPs esperando PDF.</p>
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">Archivo PDF</label>
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setArchivo(e.target.files[0] ?? null)}
            className="w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:text-white file:cursor-pointer hover:file:bg-indigo-500"
          />
        </div>

        <button
          onClick={subir}
          disabled={uploading}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg transition"
        >
          {uploading ? 'Subiendo...' : 'Subir PDF manualmente'}
        </button>

        {estado && (
          <p className="text-sm text-gray-300 bg-gray-800 px-3 py-2 rounded-lg">{estado}</p>
        )}
      </div>
    </div>
  );
}
