require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { neon } = require('@neondatabase/serverless');

const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Root route: Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize Neon database client
const sql = neon(process.env.DATABASE_URL);

// Route 0: Health Check & DB Verify
app.get('/api/health', async (req, res) => {
  try {
    const result = await sql`SELECT NOW() as current_time;`;
    res.json({ success: true, status: "Connected to Neon DB", serverTime: result[0].current_time });
  } catch (error) {
    console.error("Health check failed:", error.message);
    res.status(500).json({ success: false, error: "Database connection failed. Please check your DATABASE_URL in .env" });
  }
});

// Route 1: Save or Update Student Profile
app.post('/api/students', async (req, res) => {
  const { name, email, phone, college } = req.body;
  if (!email || !name) {
    return res.status(400).json({ success: false, error: "Name and email are required." });
  }
  try {
    const result = await sql`
      INSERT INTO students (name, email, phone, college)
      VALUES (${name}, ${email}, ${phone || ''}, ${college || ''})
      ON CONFLICT (email) 
      DO UPDATE SET 
        name = EXCLUDED.name, 
        phone = EXCLUDED.phone, 
        college = EXCLUDED.college
      RETURNING *;
    `;
    res.json({ success: true, student: result[0] });
  } catch (error) {
    console.error("Error saving student:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route 2: Save Complete Interview & Evaluation Report
app.post('/api/save-interview', async (req, res) => {
  const { email, selfIntroText, conversation, report } = req.body;
  if (!email) {
    return res.status(400).json({ success: false, error: "Student email is required." });
  }
  try {
    const result = await sql`
      INSERT INTO interview_reports (student_email, self_intro_text, chat_transcript, evaluation_report)
      VALUES (${email}, ${selfIntroText || ''}, ${JSON.stringify(conversation || [])}, ${JSON.stringify(report || {})})
      RETURNING id, created_at;
    `;
    console.log("✅ Successfully saved interview report ID:", result[0].id);
    res.json({ success: true, reportId: result[0].id, createdAt: result[0].created_at });
  } catch (error) {
    console.error("Error saving interview report:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route 3: Get All Interview Reports (Admin Dashboard)
app.get('/api/reports', async (req, res) => {
  try {
    const reports = await sql`
      SELECT 
        r.id,
        r.student_email,
        r.self_intro_text,
        r.chat_transcript,
        r.evaluation_report,
        r.created_at,
        s.name as student_name,
        s.phone as student_phone,
        s.college as student_college
      FROM interview_reports r
      LEFT JOIN students s ON r.student_email = s.email
      ORDER BY r.created_at DESC;
    `;
    res.json({ success: true, reports });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Route 4: Secure Server-Side Groq API Proxy
app.post('/api/groq', async (req, res) => {
  const customKey = req.body.apiKey && req.body.apiKey.trim() ? req.body.apiKey.trim() : null;
  const primaryKey = customKey || process.env.GROQ_API_KEY;

  if (!primaryKey) {
    return res.status(400).json({ success: false, error: "GROQ_API_KEY environment variable is not configured on the server." });
  }

  const { system, messages, maxTokens = 1500, jsonMode = false } = req.body;
  const MODEL = "openai/gpt-oss-20b";

  const chatMessages = system
    ? [{ role: "system", content: system }, ...messages]
    : messages;

  const makeGroqRequest = async (keyToUse) => {
    return await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + keyToUse
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        temperature: 0.7,
        messages: chatMessages
      })
    });
  };

  try {
    let response = await makeGroqRequest(primaryKey);

    // If custom user key failed and we have a server env key fallback, retry with server env key
    if (!response.ok && customKey && process.env.GROQ_API_KEY && customKey !== process.env.GROQ_API_KEY) {
      console.warn("Custom API key failed, falling back to server GROQ_API_KEY...");
      response = await makeGroqRequest(process.env.GROQ_API_KEY);
    }

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ success: false, error: `Groq API Error: ${errText}` });
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();

    if (jsonMode) {
      const cleaned = text.replace(/```json|```/g, "").trim();
      try {
        const parsed = JSON.parse(cleaned);
        return res.json({ success: true, data: parsed });
      } catch (e) {
        const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (match) return res.json({ success: true, data: JSON.parse(match[0]) });
        return res.status(500).json({ success: false, error: "Could not parse JSON from model response" });
      }
    }
    return res.json({ success: true, text: text });
  } catch (error) {
    console.error("Groq Proxy Error:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(`🚀 AI Career Mentor Backend running on port ${PORT}`);
  console.log(`🔗 Neon DB status: Ready`);
  console.log(`   Check health at: http://localhost:${PORT}/api/health`);
  console.log(`===================================================`);
});

module.exports = app;
