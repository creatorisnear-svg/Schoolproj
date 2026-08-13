import express from 'express';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createAuthRouter } from './routes/auth.js';
import { createApiRouter } from './routes/api.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORTAL_PORT || process.env.PORT || 5000;

app.use(cookieParser());
app.use(express.json());

app.use(express.static(join(__dirname, 'public')));

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI || (!MONGO_URI.startsWith('mongodb://') && !MONGO_URI.startsWith('mongodb+srv://'))) {
  console.error('[PORTAL] Invalid or missing MONGODB_URI');
} else {
  mongoose.connect(MONGO_URI).then(() => {
    console.log('[PORTAL] Connected to MongoDB');
  }).catch(err => {
    console.error('[PORTAL] MongoDB connection error:', err.message);
  });
}

app.get('/health', (req, res) => res.send('OK'));

app.use('/', createAuthRouter());
app.use('/api/portal', createApiRouter());

const viewsDir = join(__dirname, 'views');
app.get('/{*splat}', (req, res) => {
  res.sendFile(join(viewsDir, 'portal.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[PORTAL] Running on port ${PORT}`);
});
