# GoFix Ad - Message Scanner (Node.js)

A Node.js application that automatically monitors Instagram Direct Messages for ad reply messages and stores them in a MongoDB database.

## Features

- **Automatic Instagram DM Monitoring**: Uses Puppeteer to monitor Instagram DMs for new messages
- **Ad Reply Detection**: Automatically detects and extracts messages containing ad replies
- **Database Storage**: Stores messages with sender, recipient, content, and ad link data
- **Web Interface**: Simple web interface to view scraped messages
- **Real-time Updates**: Messages are displayed in real-time with automatic polling
- **Session Management**: Uses Instagram session cookies for authentication

## Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- Instagram account with session ID

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd gofix-ad-node
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp env.example .env
```

4. Configure environment variables in `.env`:
```env
MONGODB_URI=mongodb://localhost:27017/messaging-scanner
SESSIONID=your_instagram_session_id_here
BASE_URL=http://localhost:3000
PORT=3000
```

## Getting Instagram Session ID

1. Log into Instagram in your browser
2. Open Developer Tools (F12)
3. Go to Application/Storage tab
4. Find Cookies for instagram.com
5. Copy the value of the `sessionid` cookie

## Usage

### Development
```bash
npm run dev
```

### Production
```bash
npm start
```

The application will be available at:
- Main page: http://localhost:3000
- Messages page: http://localhost:3000/message

## API Endpoints

### GET /api/message
Retrieve all messages from the database.

### POST /api/message
Save a new message to the database.

**Request Body:**
```json
{
  "senderUsername": "sender_username",
  "recipientUsername": "recipient_username", 
  "content": "message content",
  "adData": {
    "adLink": "https://example.com/ad"
  }
}
```

## Project Structure

```
gofix-ad-node/
├── lib/
│   ├── mongodb.js      # Database connection
│   └── scraper.js      # Instagram DM scraper
├── models/
│   └── Message.js      # Message data model
├── routes/
│   └── message.js      # API routes
├── public/
│   ├── index.html      # Main page (redirects to /message)
│   └── message.html    # Messages display page
├── server.js           # Express server
├── package.json        # Dependencies and scripts
└── README.md          # This file
```

## How It Works

1. **Scraper Initialization**: When the server starts, the Instagram DM scraper automatically initializes
2. **Session Authentication**: Uses the provided session ID to authenticate with Instagram
3. **DM Monitoring**: Continuously monitors the Instagram DM inbox for new messages
4. **Ad Reply Detection**: When a new message is detected, it scans the conversation for ad replies
5. **Data Extraction**: Extracts sender, recipient, message content, and ad link information
6. **Database Storage**: Saves the extracted data to MongoDB via the API
7. **Web Display**: The web interface polls the API every 10 seconds to display new messages

## Security Notes

- Keep your Instagram session ID secure and don't share it
- The scraper runs in non-headless mode by default for debugging
- Consider running in headless mode for production
- Ensure your MongoDB instance is properly secured

## Troubleshooting

### Common Issues

1. **Session ID Invalid**: Make sure your Instagram session ID is current and valid
2. **MongoDB Connection**: Ensure MongoDB is running and the connection string is correct
3. **Puppeteer Issues**: On some systems, you may need to install additional dependencies for Puppeteer

### Logs

The application provides detailed console logs for debugging:
- ✅ Success messages
- ❌ Error messages  
- 🔄 Retry attempts
- 📝 Message processing
- 💾 Database operations

## License

This project is for educational purposes. Please ensure you comply with Instagram's Terms of Service when using this application. 