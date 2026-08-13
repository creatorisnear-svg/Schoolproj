import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export async function connectDatabase() {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
      throw new Error('Invalid MONGODB_URI. Please ensure it starts with mongodb:// or mongodb+srv://');
    }
    await mongoose.connect(uri);
    console.log('[DB] Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('[DB ERROR] MongoDB connection error:', error.message);
    // Don't exit process here, allow bot to start without DB for limited features
    // Or at least log clearly what's wrong.
  }
}

mongoose.connection.on('disconnected', () => {
  console.log('[DB] MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('[DB ERROR] MongoDB error:', error);
});
