import mongoose from 'mongoose';

const SessionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  token: { type:String, required: true },
}, {
  timestamps: true,
});

export default mongoose.models.Session || mongoose.model('Session', SessionSchema); 