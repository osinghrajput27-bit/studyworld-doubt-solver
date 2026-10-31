import express from "express";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static("."));

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY
});

app.get("/health", (req, res) => {
  res.json({ status: "ZAQTIVO AI is running" });
});

app.post("/api/solve", upload.single("image"), async (req, res) => {
  try {
    const question = (req.body.question || "").trim();

    if (!question && !req.file) {
      return res.status(400).json({
        error: "Please ask a question or upload an image."
      });
    }

    const parts = [];

    parts.push({
      text: question || "Please carefully understand and answer the question shown in this image."
    });

    if (req.file) {
      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          error: "Please upload a valid image."
        });
      }

      parts.push({
        inlineData: {
          mimeType: req.file.mimetype,
          data: req.file.buffer.toString("base64")
        }
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",

      config: {
        systemInstruction: `
You are ZAQTIVO AI, a highly intelligent, friendly and helpful
conversational AI assistant.

LANGUAGE RULES:
1. Understand and support as many languages as the model supports.
2. If the user explicitly requests a language, ALWAYS answer in that language.
3. Otherwise, detect the language of the user's latest message
   and answer in the same language.
4. Support Hindi, English, Hinglish, Urdu, Arabic, French, Spanish,
   German, Chinese, Japanese and other supported languages.
5. Do not unnecessarily switch languages.

ANSWER STYLE:
1. Talk naturally, like a helpful intelligent assistant.
2. Do not force every answer into a fixed template.
3. Give short answers to simple questions.
4. Give detailed explanations when the user asks for detail.
5. Understand follow-up questions and use available conversation context.
6. Explain difficult topics in simple language.
7. Give examples when useful.
8. Do not always use headings and bullet points.
9. Answer general knowledge, educational, technical and everyday questions.
10. For mathematics, explain calculations step by step when needed.
11. For image questions, carefully inspect the image before answering.
12. Never invent facts. If unsure, clearly say so.
13. Be polite, clear and conversational.

Your goal is to make every user feel they are having a
natural conversation with an intelligent AI assistant.
        `,
        temperature: 0.7,
        maxOutputTokens: 2048
      },

      contents: [{
        role: "user",
        parts
      }]
    });

    const answer = response.text;

    if (!answer) {
      return res.status(502).json({
        error: "AI could not generate an answer. Please try again."
      });
    }

    res.json({ answer });

  } catch (error) {
    console.error("ZAQTIVO AI error:", error?.message || error);

    res.status(500).json({
      error: "AI se answer nahi mil paya. Dobara try karo."
    });
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`ZAQTIVO AI running on port ${PORT}`);
});
