const express = require('express');
const multer = require('multer');
const { Storage } = require('@google-cloud/storage');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage() });
const api_Key = process.env.OPENAI_API_KEY;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Default settings
let userSettings = {
  name_prompt: true,
  expiration_range: true,
  longer_descrip: false,
  brand_name: false
};

// Ensure sounds directory exists
const soundsDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
  fs.mkdirSync(soundsDir, { recursive: true });
}

// Google Cloud Storage
const storage = new Storage({
  credentials: {
    client_email: process.env.GOOGLE_CLIENT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  },
  projectId: process.env.GOOGLE_PROJECT_ID,
});
const bucket = storage.bucket('od1_bucket');

// OpenAI client
const openai = new OpenAI({ apiKey: api_Key });

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/save-settings', (req, res) => {
  userSettings = req.body;
  console.log('Saved settings:', userSettings);
  res.status(200).json({ message: 'Settings saved' });
});

app.post('/process-image', upload.single('image'), async (req, res) => {
  try {
    const file = bucket.file(`images/${Date.now()}_${req.file.originalname}`);
    await file.save(req.file.buffer);
    const imageUrl = file.publicUrl();

    const { name_prompt: includeName, expiration_range: includeRange, brand_name: includeBrand, mold_detection: includeMold, quick_recipe: includeRecipe } = userSettings;

    // Log to verify actual settings used
    console.log("Settings at image processing time:");
    console.log("includeName:", includeName);
    console.log("includeRange:", includeRange);
    console.log("includeBrand:", includeBrand);
    console.log("includeMold:", includeMold);
    console.log("includeRecipe:", includeRecipe);

    // Compose the system and user prompts based on enabled settings
    const fields = [];
    if (includeBrand) fields.push("brand name");
    if (includeName) fields.push("ingredient name in 1 to 2 words");
    if (includeRange) fields.push("expiration date range in months (e.g., 1 to 2 months)");
    if (includeMold) fields.push("mold detection (e.g., visible mold, no visible mold)");
    if (includeRecipe) fields.push("recipe suggestion URL for the ingredient (e.g., https://example.com/recipe)");


    const systemPrompt = fields.length > 0
      ? `You are an AI specialized in identifying the object in the image. Provide the following: ${fields.join(', ')}. No explanations, no extra words, just these pieces of information, separated by a comma, in this order. If no object is detected, respond with nothing.`
      : "Respond with nothing.";

    const userPrompt = fields.length > 0
      ? `What is the object in the image? Provide only the following: ${fields.join(', ')}, separated by a comma. Do not respond if there is nothing in the image.`
      : "Respond with nothing.";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 150,
      temperature: 0.3
    });

    let aiResponse = response.choices[0].message.content.trim();
    console.log("AI raw response:", aiResponse);

    let description = "";

    if (aiResponse) {
      // Expecting format: Brand, ObjectName, ExpirationRange
      const parts = aiResponse.split(',').map(s => s.trim());
      let i = 0;

      // Only add the parts if the checkboxes are checked
      const brand = includeBrand ? parts[i++] : null;
      const name = includeName ? parts[i++] : null;
      const range = includeRange ? parts[i++] : null;
      const mold = includeMold ? parts[i++] : null;
      const recipe = includeRecipe ? parts[i++] : null;

      // Build description based on the settings
      const descParts = [];
      if (brand) descParts.push(brand);
      if (name) descParts.push(name);
      if (range) descParts.push(`expires in ${range}`);
      if (mold) descParts.push(mold);
      if (recipe) descParts.push(`recipe suggestion link: ${recipe}`);

      // Set description only if any part is included
      if (descParts.length > 0) {
        description = descParts.join(', ');
      } else {
        description = "Try again";  // Handle if no information was returned
      }

      // Fallback for LLM-generated content errors
      if (
        parts.includes("I'm sorry") ||
        parts.includes("I can't identify any object in the image.")
      ) {
        description = "Try again with a different angle.";
      }
    } else {
      description = "Try again";  // Handle if AI doesn't return anything
    }

    res.json({ description });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'An error occurred while processing the image' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
