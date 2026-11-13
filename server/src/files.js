import express from 'express';
import busboy from 'busboy';
import mongoose from 'mongoose';
import { userFromToken } from './auth.js';
import { Conversation } from './models/index.js';

/**
 * Chat attachments, stored in MongoDB GridFS (bucket "attachments") so files live in the same
 * database as everything else — no separate disk or cloud bucket to configure.
 *
 *   POST /api/upload?conversationId=…   multipart, field "file", Authorization: Bearer <jwt>
 *        → { fileId, name, mime, size }    (then send it with the sendMessage mutation)
 *   GET  /api/files/:id?token=<jwt>       streams the file; only members of its conversation may read it.
 *        (A query-string token because <img src> can't send an Authorization header.)
 */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
const BLOCKED = /\.(exe|bat|cmd|com|msi|scr|ps1|vbs|js|jar|sh)$/i;

const bucket = () => new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'attachments' });

export async function attachmentInfo(fileId) {
  if (!mongoose.isValidObjectId(fileId)) return null;
  const [f] = await bucket().find({ _id: new mongoose.Types.ObjectId(String(fileId)) }).toArray();
  return f ?? null;
}

export async function deleteAttachment(fileId) {
  try { await bucket().delete(new mongoose.Types.ObjectId(String(fileId))); } catch { /* already gone */ }
}

const isMember = (conv, userId) => conv?.members.some((m) => String(m) === String(userId));

export function filesRouter({ corsMiddleware } = {}) {
  const router = express.Router();
  if (corsMiddleware) router.use(corsMiddleware);

  router.post('/upload', async (req, res) => {
    const user = await userFromToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'Log in first' });
    const { conversationId } = req.query;
    if (!mongoose.isValidObjectId(conversationId)) return res.status(400).json({ error: 'conversationId is required' });
    const conv = await Conversation.findById(conversationId).select('members').lean();
    if (!isMember(conv, user._id)) return res.status(403).json({ error: 'You are not in this conversation' });

    let bb;
    try {
      bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_FILE_BYTES } });
    } catch {
      return res.status(400).json({ error: 'Expected a multipart/form-data upload' });
    }
    let handled = false;
    bb.on('file', (_field, stream, info) => {
      handled = true;
      const name = (info.filename || 'file').slice(0, 200);
      if (BLOCKED.test(name)) {
        stream.resume();
        return res.status(400).json({ error: 'That file type is not allowed' });
      }
      const mime = info.mimeType || 'application/octet-stream';
      const upload = bucket().openUploadStream(name, { metadata: { conversation: conv._id, uploader: user._id, mime } });
      let tooBig = false;
      stream.on('limit', () => { tooBig = true; });
      stream.pipe(upload)
        .on('error', () => !res.headersSent && res.status(500).json({ error: 'Upload failed' }))
        .on('finish', async () => {
          if (tooBig) {
            await deleteAttachment(upload.id);
            return res.status(413).json({ error: 'Files are limited to 10 MB' });
          }
          res.json({ fileId: String(upload.id), name, mime, size: upload.gridFSFile?.length ?? upload.length ?? 0 });
        });
    });
    bb.on('close', () => { if (!handled && !res.headersSent) res.status(400).json({ error: 'No file received' }); });
    req.pipe(bb);
  });

  router.get('/files/:id', async (req, res) => {
    const user = await userFromToken(req.query.token || req.headers.authorization);
    if (!user) return res.status(401).send('Log in first');
    const file = await attachmentInfo(req.params.id);
    if (!file) return res.status(404).send('File not found');
    const conv = await Conversation.findById(file.metadata?.conversation).select('members').lean();
    if (!isMember(conv, user._id)) return res.status(403).send('Not allowed');
    const mime = file.metadata?.mime || 'application/octet-stream';
    // SVG can carry script, so it's always a download; everything is served under a sandboxing CSP.
    const inline = (/^(image|video|audio)\//.test(mime) && mime !== 'image/svg+xml') || mime === 'application/pdf';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Length', file.length);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    bucket().openDownloadStream(file._id).on('error', () => res.end()).pipe(res);
  });

  return router;
}
