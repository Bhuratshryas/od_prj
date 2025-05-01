const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const api_Key= process.env.OPENAI_API_KEY;

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Ensure sounds directory exists
const soundsDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Set up Google Cloud Storage
const storage = new Storage({
  credentials:{
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  projectId: process.env.GOOGLE_PROJECT_ID,
});
const bucket = storage.bucket('od1_bucket');

// Set up OpenAI with the new v4 syntax
const openai = new OpenAI({
  apiKey: api_Key
});

// Route for the home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/process-image', upload.single('image'), async (req, res) => {
  try {
    // Upload image to Google Cloud Storage
    const file = bucket.file(`images/${Date.now()}_${req.file.originalname}`);
    await file.save(req.file.buffer);

    const imageUrl = file.publicUrl();

    // Using GPT-4o for better image recognition capabilities
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an AI specialized in identifying the object in the image and its expiration date range in months based on the brand. Respond ONLY with the object name and the expiration date range in months, separated by a comma (e.g., Milk, 1-2 months). No explanations, no extra words, just these two pieces of information. If no object is detected in the image, respond with nothing."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "What is the object in the image and its expiration date range in months based on brand? Respond with only the object name and the expiration date range in months, separated by a comma. Do not respond if there is nothing in the image." },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 20,
      temperature: 0.3
    });

    // Extract and format the response
    let aiResponse = response.choices[0].message.content.trim();

    let description = "";
    if (aiResponse) {
      // Expecting format: ObjectName, ExpirationRange
      const [objectName, expirationRange] = aiResponse.split(',').map(s => s.trim());
      if (objectName && expirationRange) {
        description = `Ingredient name is "${objectName}" and the expiration date is around "${expirationRange}"`;
        // Check for "I'm sorry" and "I can't identify any object in the image."
        if (
          objectName === "I'm sorry" ||
          expirationRange === "I can't identify any object in the image."
        ) {
          description = "Try again";
        }
      }
    }
    

    res.json({ description });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while processing the image' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
