import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  senderUsername: { type: String, required: true },
  recipientUsername: { type: String, required: true },
  content: { type: String, required: true },
  adData: {
    adLink: { type: String, required: true },
  },
}, {
  timestamps: true,
});

export default mongoose.models.Message || mongoose.model('Message', MessageSchema); 