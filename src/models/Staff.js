import mongoose from 'mongoose';

const staffSchema = new mongoose.Schema({
  guildId: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ['user', 'role'],
    required: true,
  },
  position: {
    type: String,
    enum: ['staff', 'manager'],
    default: 'staff',
  },
  userId: {
    type: String,
    default: null,
  },
  username: {
    type: String,
    default: null,
  },
  roleId: {
    type: String,
    default: null,
  },
  roleName: {
    type: String,
    default: null,
  },
  addedBy: {
    type: String,
    required: true,
  },
  addedAt: {
    type: Date,
    default: Date.now,
  },
});

staffSchema.index({ guildId: 1, type: 1, userId: 1 });
staffSchema.index({ guildId: 1, type: 1, roleId: 1 });

const Staff = mongoose.model('Staff', staffSchema);

export default Staff;
