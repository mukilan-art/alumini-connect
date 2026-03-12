# Alumni-Student Messaging System Setup

## Overview
This document describes the messaging system that enables real-time communication between alumni and students in the Alumni Connect platform.

## What Has Been Implemented

### Backend Changes

#### 1. **Server-Side Socket.IO Integration** (`backend/server.js`)
- Added HTTP server with Socket.IO support
- Configured CORS for socket connections
- Implemented Socket.IO event handlers:
  - `joinConversation`: User joins a conversation room
  - `leaveConversation`: User leaves a conversation room
  - `sendMessage`: Broadcasts messages to conversation participants
  - `disconnect`: Handles user disconnection

#### 2. **Message API Endpoints** (`backend/server.js`)

**Send a Message:**
```
POST /api/messages
Headers: Authorization: Bearer <token>
Body: {
  conversationId: string,
  to: userId (string),
  text: string
}
```

**Get Messages for a Conversation:**
```
GET /api/messages/:conversationId
Headers: Authorization: Bearer <token>
Response: Array of messages with timestamps (messages deleted for the requesting user are omitted)
```

**Delete a Message (new feature):**
```
DELETE /api/messages/:messageId?scope=me|everyone
Headers: Authorization: Bearer <token>

- `scope=me` (default): hides message only for the requesting user
- `scope=everyone`: sender may permanently remove the message for both parties
```

*(Socket event `messageDeleted` is emitted when a message is removed for everyone.)*

**Get All Conversations for a User:**
```
GET /api/conversations/:userId
Headers: Authorization: Bearer <token>
Response: Array of conversations with last message and time
```

#### 3. **Database Model** (`backend/models/Message.js`)
- Stores conversation ID, sender, recipient, message text, and timestamp
- Indexed on conversationId for efficient retrieval

#### 4. **Dependencies Update**
- Added `socket.io: ^4.7.2` to `backend/package.json`
- Installed via npm

#### 5. **Port Configuration** (`backend/.env`)
- Updated PORT from 5000 to 4000 to avoid conflicts
- Backend now runs on `http://localhost:4000`

### Frontend Changes

#### 1. **Enhanced Chat UI** (`frontend/chat.html`)
- Improved sidebar with contact search functionality
- Better message styling (sent vs received)
- Loading states and error messages
- Responsive design with proper height management

#### 2. **Socket.IO Client** (`frontend/assets/js/chat.js`)
- Complete rewrite with better error handling
- Real-time message reception via Socket.IO
- Automatic conversation ID generation
- Enter key support for sending messages
- Message rendering with timestamps

#### 3. **Configuration Update** (`frontend/config.js`)
- Updated BACKEND_URL to `http://localhost:4000`

## How to Use

### For Students/Alumni

1. **Login** to the platform
2. **Navigate to Messages** (from dashboard)
3. **Select a Contact** from the sidebar
   - Contacts are loaded from your accepted connections
   - Use the search box to filter by name or profession
4. **Type and Send** messages
   - Messages appear in real-time
   - Timestamps show when each message was sent

### Technical Flow

1. **User Authentication**
   - Login generates JWT token
   - Token stored in localStorage
   - Used for all API requests

2. **Conversation Initialization**
   - Unique conversation ID generated from sorted user IDs
   - Example: `507f1f77bcf86cd799439011_507f1f77bcf86cd799439012`

3. **Message Sending**
   - REST API saves message to database
   - Socket.IO broadcasts to both participants
   - Real-time UI update via Socket.IO event listener

4. **Message Retrieval**
   - Fetch existing messages when opening conversation
   - Subscribe to Socket.IO for new messages
   - Display with proper sender distinction

## Key Features

✅ **Real-Time Messaging** - Socket.IO ensures instant message delivery
✅ **Message History** - All messages stored in MongoDB
✅ **Contact Management** - Messages only with accepted connections
✅ **Search Functionality** - Filter contacts by name or profession
✅ **Responsive Design** - Works on desktop and mobile
✅ **Authentication** - Secured with JWT tokens
✅ **User Distinction** - Different styling for sent vs received messages

## Installation & Running

### Backend
```bash
cd backend
npm install         # Already done (socket.io installed)
npm start          # Starts on http://localhost:4000
```

### Frontend
- Open any HTML file in the browser
- Ensure backend is running before accessing chat features

## Database Structure

### Message Collection
```javascript
{
  _id: ObjectId,
  conversationId: String,      // Format: sorted_userid1_userid2
  from: ObjectId (ref User),   // Message sender
  to: ObjectId (ref User),     // Message recipient
  text: String,                // Message content
  createdAt: Date              // Timestamp
}
```

## Testing the System

1. Create two user accounts (one alumni, one student)
2. Send connection requests between them
3. Accept the connection request
4. Both users will have each other in their connections
5. Navigate to Messages
6. Click on the connected user
7. Send test messages
8. Verify real-time delivery via Socket.IO

## Troubleshooting

### "Failed to load contacts"
- Ensure user has accepted connections
- Check authentication token validity
- Verify backend is running on port 4000

### Messages not appearing
- Check backend Socket.IO connection
- Verify Firebase/MongoDB is accessible
- Check browser console for errors
- Ensure both users are authenticated

### Port already in use
- Update PORT in `.env` file
- Or kill existing Node process: `taskkill /F /IM node.exe`

## Future Enhancements

- Message deletion and editing
- Message typing indicators
- Message read receipts
- Image/file sharing
- Voice messages
- Message search within conversation
- Message notifications/badges

## Security Notes

- All endpoints require JWT authentication
- Messages can only be sent to accepted connections
- Users can only view their own messages
- Socket.IO connection includes userId verification

---

**System Status**: ✅ Ready for Testing
**Last Updated**: February 7, 2026
