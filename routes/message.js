import express from 'express';
import dbConnect from '../lib/mongodb.js';
import Message from '../models/Message.js';

const router = express.Router();

// POST - Save a new message
router.post('/', async (req, res) => {
  try {
    // Validate session ID
    const sessionId = process.env.SESSIONID;
    if (!sessionId) {
      console.error('SESSIONID not found in environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    console.log('Session ID validated:', sessionId ? 'Present' : 'Missing');

    // Connect to database
    await dbConnect();

    // Parse request body
    const {
      senderUsername,
      senderHandle,
      recipientUsername,
      content,
      priorMessage,
      adData
    } = req.body;

    // Validate required fields
    if (!senderUsername || !recipientUsername || !content) {
      return res.status(400).json({
        error: 'Missing required fields: senderUsername, recipientUsername, content'
      });
    }

    // Check if a message from this sender already exists
    const existingMessage = await Message.findOne({
      senderUsername,
      content: { $regex: /replied to an ad/ }
    });

    if (existingMessage) {
      console.log(`📝 Found existing message for ${senderUsername}, updating ad link...`);

      // If new ad link is provided, update it
      if (adData?.adLink) {
        existingMessage.adData.adLink = adData.adLink;
        console.log(`🔗 Updated ad link for ${senderUsername}: ${adData.adLink}`);
      } else {
        console.log(`🔗 Keeping existing ad link for ${senderUsername}: ${existingMessage.adData?.adLink}`);
      }

      // Update other optional fields if provided
      if (senderHandle) {
        existingMessage.senderHandle = senderHandle;
      }
      if (priorMessage) {
        existingMessage.priorMessage = priorMessage;
      }

      existingMessage.updatedAt = new Date();
      const updatedMessage = await existingMessage.save();
      console.log('Message updated:', updatedMessage._id);

      return res.status(200).json(updatedMessage);
    } else {
      // Create new message only if ad link is provided
      if (!adData?.adLink) {
        console.log(`⚠️ Skipping message for ${senderUsername} - no ad link provided`);
        return res.status(200).json({ message: 'Skipped - no ad link' });
      }

      const message = new Message({
        senderUsername,
        senderHandle,
        recipientUsername,
        content,
        priorMessage,
        adData: {
          adLink: adData.adLink
        }
      });

      const savedMessage = await message.save();
      console.log('Message saved:', savedMessage._id);

      return res.status(201).json(savedMessage);
    }
  } catch (error) {
    console.error('Error saving message:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET - Retrieve all messages
router.get('/', async (req, res) => {
  try {
    await dbConnect();
    const messages = await Message.find({}).sort({ createdAt: -1 });
    return res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
