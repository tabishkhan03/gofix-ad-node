import mongoose from 'mongoose';

const MessageSchema = new mongoose.Schema({
  senderUsername: { type: String, required: true }, // Display name
  senderHandle: { type: String, required: false }, // Instagram handle (e.g., p_x_y_c_h_o_)
  recipientUsername: { type: String, required: true },
  content: { type: String, required: true }, // The "replied to an ad" message
  priorMessage: { type: String, required: false }, // The message that was sent before the ad reply
  adData: {
    adLink: { type: String, required: false }, // Made optional since it might not always be found
  },
  timestamp: { type: Date, default: Date.now }, // When the message was processed
}, {
  timestamps: true, // Adds createdAt and updatedAt
});

// Add indexes for better query performance
MessageSchema.index({ senderHandle: 1 });
MessageSchema.index({ senderUsername: 1 });
MessageSchema.index({ createdAt: -1 });
MessageSchema.index({ 'adData.adLink': 1 });

export default mongoose.models.Message || mongoose.model('Message', MessageSchema);