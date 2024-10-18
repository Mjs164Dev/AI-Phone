require('dotenv').config();
const express = require('express');
const path = require('path');
const twilio = require('twilio');
const expressWs = require('express-ws');
const WebSocket = require('ws');

const app = express();
expressWs(app);

const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Twilio Client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = twilio(accountSid, authToken);

// Landing Page Route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle Form Submission
app.post('/call', (req, res) => {
  const { name, phoneNumber, topic } = req.body;

  if (!name || !phoneNumber || !topic) {
    return res.status(400).send('All fields are required.');
  }

  initiateOutboundCall(name, phoneNumber, topic)
    .then(() => {
      res.send(`Call to ${name} is being initiated.`);
    })
    .catch((error) => {
      console.error('Error initiating call:', error);
      res.status(500).send('An error occurred while initiating the call.');
    });
});

// Function to Initiate Outbound Call
function initiateOutboundCall(name, phoneNumber, topic) {
  const twimlUrl = `${process.env.BASE_URL}/voice-response?topic=${encodeURIComponent(
    topic
  )}&name=${encodeURIComponent(name)}`;

  return twilioClient.calls.create({
    url: twimlUrl,
    to: phoneNumber,
    from: process.env.TWILIO_PHONE_NUMBER,
  });
}

// TwiML Voice Response
const { VoiceResponse } = twilio.twiml;

app.post('/voice-response', (req, res) => {
  const topic = req.query.topic || 'a general topic';
  const name = req.query.name || 'there';

  const twiml = new VoiceResponse();

  const connect = twiml.connect();
  connect.stream({
    url: `${process.env.BASE_URL.replace('http', 'ws')}/media-stream?topic=${encodeURIComponent(
      topic
    )}&name=${encodeURIComponent(name)}`,
    track: 'both_tracks',
  });

  res.type('text/xml');
  res.send(twiml.toString());
});

// Media Stream WebSocket Endpoint
app.ws('/media-stream', (ws, req) => {
  const topic = req.query.topic || 'a general topic';
  const name = req.query.name || 'there';

  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime', {
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  openaiWs.on('open', () => {
    const initialMessage = {
      type: 'conversation_item',
      data: {
        text: `Hello ${name}, let's discuss ${topic}.`,
        sender: 'assistant',
      },
    };
    openaiWs.send(JSON.stringify(initialMessage));
  });

  ws.on('message', (msg) => {
    openaiWs.send(msg);
  });

  openaiWs.on('message', (msg) => {
    ws.send(msg);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });

  openaiWs.on('error', (error) => {
    console.error('OpenAI WebSocket error:', error);
  });
});

// Start the Server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});