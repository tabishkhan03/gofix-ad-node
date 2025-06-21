import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import dbConnect from './lib/mongodb.js';
import messageRoutes from './routes/message.js';
import { startScraper } from './lib/scraper.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
dbConnect().then(() => {
  console.log('✅ Connected to MongoDB');
  // Start the scraper only after a successful DB connection
  startScraper().catch(err => {
    console.error('❌ Failed to start scraper:', err);
  });
}).catch(err => {
  console.error('❌ MongoDB connection error:', err);
});

// API routes
app.use('/api/message', messageRoutes);

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the messages page
app.get('/message', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'message.html'));
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📱 Messages page: http://localhost:${PORT}/message`);
}); 