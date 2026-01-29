import mongoose from 'mongoose';

const authorizedUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: String,
  globalName: String,
  avatar: String,
  banner: String,
  accentColor: Number,
  premiumType: Number, // Nitro status
  locale: String,
  mfaEnabled: Boolean,
  accessToken: String,
  refreshToken: String,
  servers: [{
    id: String,
    name: String,
    icon: String,
    owner: Boolean,
    permissions: String,
    approximate_member_count: Number,
    approximate_presence_count: Number,
  }],
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
});

const AuthorizedUser = mongoose.model('AuthorizedUser', authorizedUserSchema);

export default AuthorizedUser;
