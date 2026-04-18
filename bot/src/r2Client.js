import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import 'dotenv/config';

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/**
 * Sube un PDF a Cloudflare R2.
 * @param {Buffer} buffer - Contenido del archivo.
 * @param {string} curp - CURP asociada (usada como prefijo de la clave).
 * @returns {string} URL pública del archivo subido.
 */
export async function uploadPdf(buffer, curp) {
  const timestamp = Date.now();
  const key = `${curp}/${timestamp}.pdf`;

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: 'application/pdf',
    })
  );

  const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
  console.log(`[R2] PDF subido: ${publicUrl}`);
  return publicUrl;
}
