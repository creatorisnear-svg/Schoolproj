import mongoose from 'mongoose';

const jobAssignmentSchema = new mongoose.Schema({
  guildId:   { type: String, required: true },
  userId:    { type: String, required: true },
  jobId:     { type: String, required: true },
  roleId:    { type: String, required: true },
  expiresAt: { type: Date,   required: true, index: true },
});

jobAssignmentSchema.index({ guildId: 1, userId: 1, jobId: 1 });

export default mongoose.models.JobAssignment
  || mongoose.model('JobAssignment', jobAssignmentSchema);
