import mongoose from 'mongoose';

const welcomeSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
    unique: true,
  },
  channelId: {
    type: String,
    required: true,
  },
  welcomeMessage: {
    type: String,
    default: 'Welcome to the server, {user}! We\'re glad to have you here.',
  },
  welcomeDM: {
    type: String,
    default: 'Welcome to {server}! Thanks for joining us. If you have any questions, feel free to ask the staff team.',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

welcomeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Welcome', welcomeSchema);
