import mongoose from 'mongoose';

const authorizedUserSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: String,
  accessToken: String,
  refreshToken: String,
  servers: [{
    id: String,
    name: String,
    icon: String,
    owner: Boolean,
    permissions: String,
  }],
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
});

const AuthorizedUser = mongoose.model('AuthorizedUser', authorizedUserSchema);

export default AuthorizedUser;
