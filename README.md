# AI Career Mentor — The AI School

A single-page app that walks a student through: registration → an AI career
conversation → resume upload & parsing → an adaptive technical assessment →
a personalized career evaluation report.

## Folder structure

```
ai-career-mentor/
├── index.html         (page markup)
├── css/
│   └── style.css      (all styling)
├── js/
│   └── script.js      (all app logic — state, Claude API calls, demo mode)
├── assets/
│   └── logo.png        (The AI School logo)
└── README.md
```

## Running it in VS Code

1. Open this folder in VS Code: `File -> Open Folder...` and select `ai-career-mentor`.
2. Install the **Live Server** extension (by Ritwick Dey), then right-click
   `index.html` -> **"Open with Live Server."** It'll launch at
   `http://127.0.0.1:5500`.
   - You can also just double-click `index.html` to open it directly in a
     browser -- no server needed, since there's no backend.
3. On load, the app is configured to use the **Live Groq API** (`llama-3.3-70b-versatile`) by default using the API key in `js/config.js`.
4. You can also click **⚙ API key** (top right) to view, change your Groq API key, or switch to demo mode. Live API calls are made directly from the browser to `api.groq.com`.

## Notes

- No build step, no `npm install` -- plain HTML/CSS/JS plus two CDN scripts
  (`pdf.js` for reading PDF resumes, `mammoth.js` for `.docx`).
- Model used for live calls: `llama-3.3-70b-versatile` (via Groq API).
