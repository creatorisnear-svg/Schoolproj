import mongoose from 'mongoose';

const staffSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
  },
  username: {
    type: String,
    required: true,
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

const Staff = mongoose.model('Staff', staffSchema);

export default Staff;
