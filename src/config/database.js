import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export async function connectDatabase() {
  try {
    const uri = process.env.DATABASE_URL || process.env.MONGODB_URI;
    if (!uri || (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://'))) {
      console.warn('⚠️ MONGODB_URI not found or invalid. Attempting to use local fallback if possible...');
      // If we don't have a valid URI, we can't connect, but let's not crash the whole bot.
      return;
    }
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB Atlas successfully');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    // Don't exit process here, allow bot to start without DB for limited features
    // Or at least log clearly what's wrong.
  }
}

mongoose.connection.on('disconnected', () => {
  console.log('📴 MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  console.error('❌ MongoDB error:', error);
});
