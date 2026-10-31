
import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());
app.use(express.static("."));
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/health", (req, res) => {
  res.json({ status: "StudyWorld AI is running" });
});

app.post("/api/solve", upload.single("image"), async (req, res) => {
  try {
    const question = req.body.question || "";

    if (!question.trim() && !req.file) {
      return res.status(400).json({ error: "Question ya photo bhejo." });
    }

    const contents = [];

    if (question.trim()) {
      contents.push({
        text: `Student ka doubt simple Hindi/Hinglish mein step-by-step samjhao. Zaroorat par exam-ready English answer bhi do.\n\nQuestion: ${question}`
      });
    }

    if (req.file) {
      contents.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents
    });

    res.json({ answer: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "AI se answer nahi mil paya. Dobara try karo." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`StudyWorld AI running on port ${PORT}`);
});
