/* =========================================================
   STATE
========================================================= */
const state = {
  apiKey: typeof ENV !== 'undefined' ? ENV.GROQ_API_KEY : '',
  demoMode: false,
  student: {},
  conversation: [],       // {role:'mentor'|'student', text}
  questionCount: 0,
  targetQuestions: 5,
  interviewComplete: false,
  resumeText: '',
  resumeData: null,
  assessment: { questions: [], index: 0, answers: [] },
  report: null,
  currentStep: 1,
  selfIntroText: '',
  selfIntroReport: null,
  webcamStream: null
};

const MODEL = "openai/gpt-oss-20b";

/* =========================================================
   GROQ API HELPER (OpenAI-compatible chat completions)
========================================================= */
async function callGroq({system, messages, maxTokens = 1500, jsonMode = false}) {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      system,
      messages,
      maxTokens,
      jsonMode,
      apiKey: state.apiKey || undefined
    })
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody.error || ("Server Groq error " + res.status));
  }
  const result = await res.json();
  if (!result.success) {
    throw new Error(result.error || "Groq request failed");
  }
  return jsonMode ? result.data : result.text;
}

/* =========================================================
   API KEY MODAL
========================================================= */
function openApiKeyModal() { document.getElementById('apiKeyModal').classList.remove('hidden'); }
function closeApiKeyModal() { document.getElementById('apiKeyModal').classList.add('hidden'); }
document.getElementById('apiKeyBtn').onclick = openApiKeyModal;
document.getElementById('btnSaveKey').onclick = () => {
  const val = document.getElementById('in-apikey').value.trim();
  if (val) { state.apiKey = val; state.demoMode = false; closeApiKeyModal(); }
};
document.getElementById('btnDemoMode').onclick = () => {
  state.demoMode = true;
  closeApiKeyModal();
};
// Demo mode is on by default, so the API key modal no longer opens automatically on load.
// Users can still open it manually via the "⚙ API key" button to switch to a live key.

/* =========================================================
   DEMO MODE — simulated responses, no API calls, no key needed
========================================================= */
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

const MOCK_MENTOR_SCRIPT = [
  {ack: null, q: () => `Hi ${state.student.name.split(' ')[0]}! Where do you see yourself career-wise in the next five years?`},
  {ack: "That's a great vision.", q: () => `What keeps you excited about Computer Science?`},
  {ack: "I like that.", q: () => `Which domain excites you most: AI/ML, Cloud, or Full Stack?`},
  {ack: "Good to know.", q: () => `Are you aiming for placements, a startup, or higher studies?`},
  {ack: "Thanks for sharing.", q: () => `What programming language or project are you most confident in?`},
  {ack: "Excellent.", q: () => `What has been your biggest challenge while learning so far?`},
  {ack: "I understand.", q: () => `What do you expect from an AI platform to help you grow?`},
  {ack: "Thank you.", q: () => `Let's upload your resume next to continue.`}
];

function mockMentorMessage(index, lastStudentMsg) {
  if (index >= state.targetQuestions) {
    return `Your conversation is completed. Thank you for your information. Please upload your resume below so we can analyze it next. [[INTERVIEW_COMPLETE]]`;
  }
  const item = MOCK_MENTOR_SCRIPT[Math.min(index, MOCK_MENTOR_SCRIPT.length - 1)];
  const ackPart = item.ack ? item.ack + ' ' : '';
  let text = ackPart + item.q();
  return text;
}

function mockParseResume(resumeText) {
  const src = resumeText || '';
  const skillBank = ['Python','Java','SQL','C++','JavaScript','C','Go','Rust','TypeScript'];
  const techBank = ['React','Node.js','Docker','AWS','Kubernetes','MongoDB','Git','Flask','Django'];
  const aiBank = ['Machine Learning','Deep Learning','NLP','Computer Vision','Generative AI','Prompt Engineering','Agentic AI'];
  const findMatches = bank => bank.filter(k => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i').test(src));
  const skills = findMatches(skillBank);
  const technologies = findMatches(techBank);
  const aiSkills = findMatches(aiBank);
  const emailMatch = src.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  const phoneMatch = src.match(/(\+?\d[\d\s-]{8,14}\d)/);
  const yearMatch = src.match(/20[12]\d/);
  const degree = /m\.?\s?tech/i.test(src) ? 'M.Tech' : (/b\.?\s?tech/i.test(src) ? 'B.Tech' : "Bachelor's Degree");
  const finalSkills = skills.length ? skills : ['Python','SQL'];
  return {
    personal: {name: state.student.name, email: emailMatch ? emailMatch[0] : state.student.email, phone: phoneMatch ? phoneMatch[0] : state.student.phone},
    education: [{degree, college: state.student.college, graduationYear: yearMatch ? yearMatch[0] : ''}],
    skills: finalSkills,
    technologies: technologies.length ? technologies : ['Git'],
    aiSkills: aiSkills.length ? aiSkills : ['Machine Learning'],
    projects: [{title: 'Portfolio Project', technologies: finalSkills.slice(0,2)}],
    certifications: [],
    experience: []
  };
}

const MOCK_QUESTIONS = [
  {type:'multiple_choice', topic:'Python', difficulty:'easy', question:'What does `print(2 ** 3)` output in Python?', options:['5','6','8','9']},
  {type:'multiple_choice', topic:'Data Structures', difficulty:'medium', question:'Which data structure uses LIFO (Last In, First Out) ordering?', options:['Queue','Stack','Linked List','Graph']},
  {type:'multiple_choice', topic:'Machine Learning', difficulty:'medium', question:'Which of these is a supervised learning algorithm?', options:['K-Means Clustering','Linear Regression','PCA','DBSCAN']},
  {type:'numerical', topic:'Problem Solving', difficulty:'medium', question:'A train leaves at 3:00 PM travelling at 60 km/h. A second train leaves the same station at 4:00 PM travelling at 90 km/h in the same direction. How many hours will it take for the second train to catch up?'},
  {type:'numerical', topic:'Algorithms', difficulty:'hard', question:'If an algorithm has a time complexity of O(n^2), and it takes 2 seconds for n=100, how many seconds will it take for n=200?'}
];

function mockGenerateReport() {
  const rd = state.resumeData || {};
  const skills = (rd.skills && rd.skills.length) ? rd.skills : ['Python'];
  const aiSkills = (rd.aiSkills && rd.aiSkills.length) ? rd.aiSkills : ['Machine Learning'];
  const strengths = [
    `Solid grounding in ${skills[0]}`,
    'Strong learning attitude and curiosity',
    'Clear, thoughtful communication during our conversation',
    `Early exposure to ${aiSkills[0]}`
  ];
  const improvementAreas = [
    'Needs more real-world, end-to-end projects',
    'Improve deployment and production-readiness knowledge',
    'Strengthen SQL and data-handling fundamentals',
    'Build more confidence answering under time pressure'
  ];
  const verdicts = ['balanced','underestimates','overestimates'];
  const verdict = verdicts[(state.student.name.length + state.assessment.answers.length) % verdicts.length];
  const narratives = {
    balanced: 'Your self-assessment closely matches your demonstrated abilities in our conversation and assessment, indicating good self-awareness and realistic expectations.',
    underestimates: "Your responses indicate stronger technical capability than you gave yourself credit for. With a few guided projects and some interview practice, you should progress quickly.",
    overestimates: 'You came across as confident in several areas, but a few of your assessment answers suggest some foundational concepts could use reinforcement. Building more hands-on practice will help your confidence catch up with your skills.'
  };
  const te = {
    programming: 62 + (skills.length * 4) % 20,
    problemSolving: 58 + (state.assessment.answers.length * 3) % 25,
    communication: 70,
    learningAbility: 75,
    aiReadiness: 55 + aiSkills.length * 6,
    industryReadiness: 60,
    careerClarity: 68
  };
  Object.keys(te).forEach(k => te[k] = Math.max(40, Math.min(95, te[k])));
  const roadmap = ['Python', 'Data Structures & SQL', aiSkills[0] || 'Machine Learning', 'Deep Learning', 'Generative AI', 'Real-World Projects', 'Internships', 'Placements'];
  const courseRecommendations = [{
    courseName: aiSkills.includes('Generative AI') ? 'Generative AI Engineering' : 'Machine Learning Foundations',
    whyRecommended: `Based on your interest in ${aiSkills[0] || 'AI'} and your current comfort with ${skills[0]}, this course closes the gap between your fundamentals and applied, portfolio-ready projects.`,
    skillsGained: [skills[0], aiSkills[0] || 'Machine Learning', 'Model deployment', 'Applied problem solving'],
    careerOutcomes: 'Positions you for roles like Junior ML Engineer or AI Developer, and gives you a strong head start whether you choose placements or higher studies.'
  }];
  return {
    candidateSummary: `${state.student.name} shows real enthusiasm for AI and a workable programming foundation. Across our conversation, the recurring theme was curiosity paired with a desire for structured, hands-on guidance. The resume reflects practical exposure to ${skills.slice(0,2).join(' and ')}, and strengthening deployment skills alongside advanced ${aiSkills[0] || 'AI'} concepts will meaningfully improve industry readiness.`,
    strengths,
    improvementAreas,
    confidenceAssessment: {verdict, narrative: narratives[verdict]},
    technicalEvaluation: te,
    roadmap,
    courseRecommendations
  };
}

/* =========================================================
   PATHWAY NAV
========================================================= */
function goToStep(n) {
  state.currentStep = n;
  if (n !== 2) {
    stopCamera();
  }
  for (let i = 1; i <= 5; i++) {
    document.getElementById('step' + i).classList.toggle('hidden', i !== n);
  }
  document.querySelectorAll('.pathway-node').forEach(node => {
    const s = parseInt(node.dataset.step);
    node.classList.toggle('done', s < n);
    node.classList.toggle('active', s === n);
  });
  document.getElementById('pathwayFill').style.width = ((n - 1) / 4 * 100) + "%";
  window.scrollTo({top: 0, behavior: 'smooth'});
}
goToStep(1);

/* =========================================================
   STEP 1 — REGISTRATION
========================================================= */
function validateField(id, testFn) {
  const wrap = document.getElementById('f-' + id);
  const input = wrap.querySelector('input');
  const ok = testFn(input.value.trim());
  wrap.classList.toggle('invalid', !ok);
  return ok;
}
document.getElementById('btnStart').onclick = () => {
  const nameOk = validateField('name', v => v.length > 1);
  const emailOk = validateField('email', v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  const phoneOk = validateField('phone', v => /^[+]?[\d\s\-()]{7,15}$/.test(v));
  const collegeOk = validateField('college', v => v.length > 1);
  if (!(nameOk && emailOk && phoneOk && collegeOk)) return;

  state.student = {
    name: document.getElementById('in-name').value.trim(),
    email: document.getElementById('in-email').value.trim(),
    phone: document.getElementById('in-phone').value.trim(),
    college: document.getElementById('in-college').value.trim()
  };

  // Asynchronously save student profile to Neon DB backend (non-blocking)
  fetch('/api/students', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.student)
  }).catch(e => console.warn('Neon DB notice (student):', e.message));

  goToStep(2);
  initSelfIntroStep();
};
/* =========================================================
   WEBCAM & SELF-INTRODUCTION LOGIC
========================================================= */
let introTimerInterval = null;
let introRecognition = null;
let isRecordingIntro = false;
let accumulatedIntroTranscript = '';

function initSelfIntroStep() {
  document.getElementById('selfIntroContainer').classList.remove('hidden');
  document.getElementById('chatContainer').classList.add('hidden');
  document.getElementById('selfIntroReport').classList.add('hidden');
  document.getElementById('selfIntroReport').innerHTML = '';
  document.getElementById('selfIntroText').value = '';
  
  const btnToggle = document.getElementById('btnToggleCamera');
  const btnStart = document.getElementById('btnStartIntro');
  const btnStop = document.getElementById('btnStopIntro');
  
  btnToggle.innerHTML = "📷 Enable Camera";
  btnToggle.classList.remove('btn-primary');
  btnToggle.classList.add('btn-ghost');
  btnToggle.disabled = false;
  
  btnStart.classList.remove('hidden');
  btnStart.disabled = true;
  btnStart.innerHTML = "🎤 Start Introduction";
  
  btnStop.classList.add('hidden');
  btnStop.disabled = false;

  const overlay = document.getElementById('videoOverlay');
  overlay.classList.remove('hidden');
  document.getElementById('videoOverlayText').textContent = "Camera is offline";
  
  btnToggle.onclick = toggleCamera;
  btnStart.onclick = startSelfIntro;
  btnStop.onclick = stopSelfIntro;
}

// Toggle camera stream
async function toggleCamera() {
  const video = document.getElementById('webcamVideo');
  const overlay = document.getElementById('videoOverlay');
  const overlayText = document.getElementById('videoOverlayText');
  const btnToggle = document.getElementById('btnToggleCamera');
  const btnStart = document.getElementById('btnStartIntro');

  if (state.webcamStream) {
    stopCamera();
    btnToggle.innerHTML = "📷 Enable Camera";
    btnToggle.classList.remove('btn-primary');
    btnToggle.classList.add('btn-ghost');
    overlay.classList.remove('hidden');
    overlayText.textContent = "Camera is offline";
    btnStart.disabled = true;
  } else {
    try {
      overlayText.textContent = "Requesting camera access...";
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      state.webcamStream = stream;
      video.srcObject = stream;
      overlay.classList.add('hidden');
      btnToggle.innerHTML = "📷 Disable Camera";
      btnToggle.classList.remove('btn-ghost');
      btnToggle.classList.add('btn-primary');
      btnStart.disabled = false;
    } catch (err) {
      console.error(err);
      overlayText.textContent = "Error: Camera access denied or unavailable";
      alert("Could not access camera/microphone. Please check permissions and try again, or you can still type your introduction below.");
      btnStart.disabled = false;
      btnStart.innerHTML = "🎤 Start without Camera";
    }
  }
}

function stopCamera() {
  if (state.webcamStream) {
    state.webcamStream.getTracks().forEach(track => track.stop());
    state.webcamStream = null;
  }
  const video = document.getElementById('webcamVideo');
  if (video) video.srcObject = null;
}

// Start recording introduction (Speech transcription + 2 min timer)
function startSelfIntro() {
  if (isRecordingIntro) return;
  isRecordingIntro = true;

  const btnStart = document.getElementById('btnStartIntro');
  const btnStop = document.getElementById('btnStopIntro');
  const btnToggleCam = document.getElementById('btnToggleCamera');
  const timerOverlay = document.getElementById('introTimerOverlay');
  const timerVal = document.getElementById('introTimerVal');
  const textInput = document.getElementById('selfIntroText');

  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  btnToggleCam.disabled = true;
  timerOverlay.classList.remove('hidden');
  textInput.value = '';
  accumulatedIntroTranscript = '';

  // 120 seconds = 2 mins
  let timeLeft = 120;
  timerVal.textContent = "02:00";

  introTimerInterval = setInterval(() => {
    timeLeft--;
    const mins = Math.floor(timeLeft / 60).toString().padStart(2, '0');
    const secs = (timeLeft % 60).toString().padStart(2, '0');
    timerVal.textContent = `${mins}:${secs}`;

    if (timeLeft <= 0) {
      clearInterval(introTimerInterval);
      stopSelfIntro();
    }
  }, 1000);

  // Initialize Speech Recognition
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRec) {
    introRecognition = new SpeechRec();
    introRecognition.continuous = true;
    introRecognition.interimResults = true;
    introRecognition.lang = 'en-US';

    textInput.placeholder = "Listening... Speak into your microphone now.";

    introRecognition.onresult = (e) => {
      let currentFinal = '';
      let currentInterim = '';
      for (let i = e.resultIndex; i < e.results.length; ++i) {
        if (e.results[i].isFinal) {
          currentFinal += e.results[i][0].transcript + ' ';
        } else {
          currentInterim += e.results[i][0].transcript;
        }
      }
      if (currentFinal) {
        accumulatedIntroTranscript += currentFinal;
      }
      textInput.value = (accumulatedIntroTranscript + currentInterim).trim();
    };

    introRecognition.onend = () => {
      if (isRecordingIntro) {
        setTimeout(() => {
          if (isRecordingIntro) {
            try { introRecognition.start(); } catch(err) {}
          }
        }, 250);
      }
    };
    introRecognition.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') {
        return; // Silently ignore benign pauses so recognition restarts cleanly
      }
      console.error("Speech recognition error:", e);
      if (e.error === 'not-allowed') {
        textInput.placeholder = "Microphone access denied. Please click the mic icon in your browser address bar to allow access.";
      } else {
        console.warn("Speech recognition notice:", e.error);
      }
    };

    try {
      introRecognition.start();
    } catch(err) {
      console.error("Failed to start SpeechRecognition:", err);
      textInput.placeholder = "Failed to start speech recognition.";
    }
  } else {
    console.warn("Speech recognition not supported in this browser.");
  }
}

// Stop introduction & trigger evaluation
async function stopSelfIntro() {
  if (!isRecordingIntro) return;
  isRecordingIntro = false;

  clearInterval(introTimerInterval);
  if (introRecognition) {
    introRecognition.onend = null;
    introRecognition.stop();
  }
  stopCamera();

  const btnStop = document.getElementById('btnStopIntro');
  const timerOverlay = document.getElementById('introTimerOverlay');
  const reportDiv = document.getElementById('selfIntroReport');
  const textInput = document.getElementById('selfIntroText');

  btnStop.disabled = true;
  timerOverlay.classList.add('hidden');
  textInput.placeholder = "Speech-to-Text transcription complete.";

  const introText = textInput.value.trim();
  if (!introText) {
    const proceed = confirm("No speech was detected in your self-introduction. Do you want to submit anyway?");
    if (!proceed) {
      btnStop.disabled = false;
      return;
    }
  }
  state.selfIntroText = introText;

  // Show loading indicator
  document.getElementById('selfIntroReport').classList.remove('hidden');
  document.getElementById('selfIntroReport').innerHTML = '<div class="typing" style="padding: 20px;">Evaluating your introduction...</div>';

  // Trigger evaluation
  evaluateSelfIntroInBackground(introText);
}

async function evaluateSelfIntroInBackground(introText) {
  try {
    let evaluation;
    if (state.demoMode) {
      await delay(1000);
      evaluation = mockEvaluateSelfIntro(introText);
    } else {
      const sys = `You are an expert English language assessor and technical career coach. Evaluate the student's self-introduction.
Check for content completeness (covering name, college, skills, and goals) and grammatical correctness.

Respond with ONLY valid JSON (no markdown formatting, no code blocks):
{
  "contentScore": 0-10,
  "grammarScore": 0-10,
  "feedback": "2-3 sentences of constructive feedback regarding content, delivery, and overall impact.",
  "improvedIntroduction": "The fully corrected and professionally improved version of the entire self-introduction.",
  "grammaticalErrors": [
    {
      "original": "the exact incorrect text block from introduction",
      "suggested": "the corrected text block",
      "explanation": "why it is incorrect and how to fix it"
    }
  ]
}
If there are no grammatical errors, return "grammaticalErrors" as an empty array [].`;

      evaluation = await callGroq({
        system: sys,
        messages: [{ role: 'user', content: `Candidate name: ${state.student.name}\nCollege: ${state.student.college}\nSelf-Introduction Text:\n\n${introText || "No text provided (candidate remained silent)."}` }],
        maxTokens: 1000,
        jsonMode: true
      });
    }

    state.selfIntroReport = evaluation;
    renderSelfIntroReport(evaluation);
  } catch (e) {
    console.error("Failed to evaluate self-introduction via Groq, using Demo Mode fallback:", e);
    state.demoMode = true;
    const fallback = mockEvaluateSelfIntro(introText);
    state.selfIntroReport = fallback;
    renderSelfIntroReport(fallback);
  }
}

function renderSelfIntroReport(evalData) {
  const reportDiv = document.getElementById('selfIntroReport');
  
  let errorsHtml = '';
  if (evalData.grammaticalErrors && evalData.grammaticalErrors.length > 0) {
    errorsHtml = `
      <div class="grammar-details">
        <h4>🔍 Grammatical Errors Found</h4>
        <div class="grammar-errors-list">
          ${evalData.grammaticalErrors.map(err => `
            <div class="grammar-error-item">
              <div class="error-context">
                <span class="original">${escapeHtml(err.original)}</span>
                <span class="suggested">${escapeHtml(err.suggested)}</span>
              </div>
              <div class="error-explanation">${escapeHtml(err.explanation)}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } else {
    errorsHtml = `
      <div class="grammar-perfect">
        🎉 Excellent! No grammatical errors were detected in your self-introduction.
      </div>
    `;
  }

  reportDiv.innerHTML = `
    <div class="self-intro-report-card">
      <div class="report-card-title">Self-Introduction Report Card</div>
      
      <div class="self-intro-scores">
        <div class="score-box content-score">
          <div class="score-label">Content & Delivery</div>
          <div class="score-value">${evalData.contentScore}<em>/10</em></div>
        </div>
        <div class="score-box grammar-score">
          <div class="score-label">Grammar Score</div>
          <div class="score-value">${evalData.grammarScore}<em>/10</em></div>
        </div>
      </div>

      <div class="intro-feedback">
        <strong>Original Speech:</strong><br>
        <em>"${escapeHtml(state.selfIntroText)}"</em>
      </div>

      <div class="intro-feedback" style="margin-top: 16px;">
        <strong>Corrected/Improved Version:</strong><br>
        ${escapeHtml(evalData.improvedIntroduction || '')}
      </div>

      <div class="intro-feedback" style="margin-top: 16px;">
        <strong>Feedback:</strong> ${escapeHtml(evalData.feedback)}
      </div>

      ${errorsHtml}

      <div class="btn-row" style="margin-top:24px;">
        <button class="btn btn-primary" id="btnProceedToChat">Proceed to Career Conversation →</button>
      </div>
    </div>
  `;

  document.getElementById('btnProceedToChat').onclick = proceedToChatConversation;
}

function proceedToChatConversation() {
  document.getElementById('selfIntroContainer').classList.add('hidden');
  document.getElementById('chatContainer').classList.remove('hidden');
  startInterview();
}

function mockEvaluateSelfIntro(text) {
  const words = (text || '').trim().split(/\s+/).filter(Boolean);
  const contentScore = Math.min(10, Math.max(4, Math.floor(words.length / 12) + 4));
  const hasGrammar = words.length > 5;
  const errors = hasGrammar ? [
    {
      original: "I am having interest in learning Python.",
      suggested: "I am interested in learning Python.",
      explanation: "Use 'I am interested in' instead of 'I am having interest in' for a more natural and grammatically correct phrasing."
    },
    {
      original: "I wants to be software engineer.",
      suggested: "I want to be a software engineer.",
      explanation: "Subject-verb agreement: 'I want' (not 'wants'). Also, add the indefinite article 'a' before 'software engineer'."
    }
  ] : [];

  return {
    contentScore: contentScore,
    grammarScore: hasGrammar ? 8 : 10,
    feedback: "You introduced yourself clearly. Try highlighting more specific projects you've worked on to stand out and emphasize your hands-on coding experience.",
    improvedIntroduction: "Hello, my name is " + state.student.name + ". I am currently studying at " + state.student.college + ". I am interested in learning Python and I want to be a software engineer.",
    grammaticalErrors: errors
  };
}

/* =========================================================
   STEP 2 — AI CONVERSATION
========================================================= */
const chatWindow = document.getElementById('chatWindow');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const micBtn = document.getElementById('micBtn');

function addMsg(role, text) {
  if (!text || !text.trim()) return null;
  const div = document.createElement('div');
  div.className = 'msg ' + (role === 'mentor' ? 'mentor' : 'student');
  if (role === 'mentor') {
    div.innerHTML = '<span class="who">MENTOR</span>' + escapeHtml(text.trim());
  } else {
    div.textContent = text.trim();
  }
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return div;
}
function addTyping() {
  const div = document.createElement('div');
  div.className = 'msg typing';
  div.id = 'typingIndicator';
  div.textContent = 'mentor is thinking…';
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
function removeTyping() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}
function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function updateChatProgress() {
  if (state.interviewComplete) {
    document.getElementById('chatProgress').textContent = "Conversation completed";
  } else {
    document.getElementById('chatProgress').textContent =
      `Question ${Math.min(state.questionCount, state.targetQuestions)} of ~${state.targetQuestions}`;
  }
}

const INTERVIEW_SYSTEM_PROMPT = `You are a warm, sharp, encouraging AI career mentor at "The AI School" conducting a live career-discovery conversation with a student.
Student details:
- Name: \${NAME}
- College: \${COLLEGE}
- Self-Introduction: "\${SELF_INTRO}"

This is NOT a static questionnaire — you must sound like a real mentor: acknowledge what the student just said specifically, then ask one thoughtful follow-up or new question that goes deeper, strictly tailored to their self-introduction details, stated interests, and the conversation history.

Ground rules:
- Ask exactly one question per turn.
- Never repeat a question already covered.
- Vary your phrasing naturally.
- Base your questions and follow-ups on the candidate's self-introduction and their answers. Dive deeper into their specific projects, skills, or career goals.
- Keep each response extremely brief: exactly 1 to 2 sentences (at most 2 lines). Acknowledge and ask the question directly in under 30 words.
- You are currently asking question \${CURRENT_QUESTION} of \${TARGET}. Keep the conversation going by asking a follow-up question.
- Never ask about the resume — that comes in a later step.
- Never generate random or irrelevant questions.`;

async function startInterview() {
  updateChatProgress();
  addTyping();
  try {
    let opening;
    if (state.demoMode) {
      await delay(700);
      opening = mockMentorMessage(0);
    } else {
      const sys = INTERVIEW_SYSTEM_PROMPT
        .replace('${TARGET}', state.targetQuestions)
        .replace('${CURRENT_QUESTION}', '1')
        .replace('${NAME}', state.student.name || '')
        .replace('${COLLEGE}', state.student.college || '')
        .replace('${SELF_INTRO}', state.selfIntroText || '');
      opening = await callGroq({
        system: sys,
        messages: [{
          role: 'user',
          content: `The student ${state.student.name} from ${state.student.college} has just registered and completed their 2-minute self-introduction: "${state.selfIntroText}". Greet them warmly by first name, acknowledge their self-introduction, and ask your first question of the career conversation (such as their five-year career vision or their motivation for computer science).`
        }],
        maxTokens: 400
      });
    }
    removeTyping();
    handleMentorTurn(opening);
  } catch (e) {
    removeTyping();
    console.warn("Groq call failed, falling back to Demo Mode:", e);
    state.demoMode = true;
    const opening = mockMentorMessage(0);
    handleMentorTurn(opening);
  }
}

function handleMentorTurn(rawText) {
  let text = rawText;
  let done = false;
  if (text.includes('[[INTERVIEW_COMPLETE]]')) {
    if (state.questionCount >= state.targetQuestions) {
      done = true;
    }
    text = text.replace('[[INTERVIEW_COMPLETE]]', '').trim();
  }
  if (!text) {
    text = "Your conversation is completed. Thank you for sharing! Please click 'Continue to resume upload →' below to proceed.";
  }
  addMsg('mentor', text);
  state.conversation.push({role: 'mentor', text});
  state.questionCount++;
  if (done || state.questionCount >= state.targetQuestions + 2) {
    state.interviewComplete = true;
    document.getElementById('btnToResume').classList.remove('hidden');
    chatInput.disabled = true; sendBtn.disabled = true; micBtn.disabled = true;
  }
  updateChatProgress();
}

async function sendStudentMessage() {
  const val = chatInput.value.trim();
  if (!val || state.interviewComplete) return;
  addMsg('student', val);
  state.conversation.push({role: 'student', text: val});
  chatInput.value = '';
  baseChatInputText = '';
  chatInput.style.height = 'auto';
  sendBtn.disabled = true;
  addTyping();
  try {
    let reply;
    if (state.demoMode) {
      await delay(700);
      reply = mockMentorMessage(state.questionCount, val);
    } else {
      let sys;
      if (state.questionCount === state.targetQuestions) {
        sys = `You are a warm, sharp, encouraging AI career mentor at "The AI School".
The career-discovery conversation with the student is now complete (they have answered all your ${state.targetQuestions} questions).
Acknowledge their last response warmly in 1 or 2 sentences.
Do NOT ask any further questions.
Do NOT instruct them to upload a resume or output any special tokens.`;
      } else {
        sys = INTERVIEW_SYSTEM_PROMPT
          .replace('${TARGET}', state.targetQuestions)
          .replace('${CURRENT_QUESTION}', String(state.questionCount + 1))
          .replace('${NAME}', state.student.name || '')
          .replace('${COLLEGE}', state.student.college || '')
          .replace('${SELF_INTRO}', state.selfIntroText || '');
      }
      const msgs = state.conversation.map(m => ({
        role: m.role === 'mentor' ? 'assistant' : 'user',
        content: m.text
      }));
      reply = await callGroq({system: sys, messages: msgs, maxTokens: 400});
      if (state.questionCount === state.targetQuestions) {
        reply += '\n\nYour conversation is completed. Thank you for your information. Please upload your resume below to proceed. [[INTERVIEW_COMPLETE]]';
      }
    }
    removeTyping();
    handleMentorTurn(reply);
  } catch (e) {
    removeTyping();
    console.warn("Groq call failed, falling back to Demo Mode:", e);
    state.demoMode = true;
    const reply = mockMentorMessage(state.questionCount, val);
    handleMentorTurn(reply);
  }
  sendBtn.disabled = false;
}
sendBtn.onclick = sendStudentMessage;
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    const val = chatInput.value.trim();
    if (val) {
      e.preventDefault();
      sendStudentMessage();
    } else {
      e.preventDefault(); // Prevent empty newlines on simple Enter
    }
  }
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

/* Speech-to-text for Conversation Chat (Auto-stops when speech is completed) */
let recognition = null;
let recognizing = false;
let baseChatInputText = '';
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false; // Automatically stops when user completes speaking
  recognition.interimResults = true; // Stream words in real-time as user speaks
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    recognizing = true;
    micBtn.classList.add('recording');
    micBtn.title = "Listening... Speak now";
    chatInput.placeholder = "Listening... Speak into your microphone now.";
  };

  recognition.onresult = (e) => {
    let currentFinal = '';
    let currentInterim = '';
    for (let i = e.resultIndex; i < e.results.length; ++i) {
      if (e.results[i].isFinal) {
        currentFinal += e.results[i][0].transcript + ' ';
      } else {
        currentInterim += e.results[i][0].transcript;
      }
    }
    if (currentFinal) {
      baseChatInputText += currentFinal;
    }
    chatInput.value = (baseChatInputText + currentInterim).trim();
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
  };

  recognition.onend = () => {
    recognizing = false;
    micBtn.classList.remove('recording');
    micBtn.title = "Speak your answer";
    chatInput.placeholder = "Type your response…";
  };

  recognition.onerror = (e) => {
    console.warn("Chat speech recognition notice:", e.error);
    recognizing = false;
    micBtn.classList.remove('recording');
    micBtn.title = "Speak your answer";
    chatInput.placeholder = "Type your response…";
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      alert("Microphone permission was denied. Please allow microphone access in your browser address bar.");
    }
  };
} else {
  micBtn.title = "Speech recognition not supported in this browser";
}

micBtn.onclick = () => {
  if (!SpeechRecognition) {
    alert('Speech recognition is not supported in this browser. Please use Chrome or Edge, or type your response.');
    return;
  }
  if (recognizing) {
    recognizing = false;
    try { recognition.stop(); } catch(err) {}
    micBtn.classList.remove('recording');
    micBtn.title = "Speak your answer";
    chatInput.placeholder = "Type your response…";
  } else {
    baseChatInputText = chatInput.value ? chatInput.value.trim() + ' ' : '';
    try {
      recognition.start();
    } catch(err) {
      console.error("Failed to start speech recognition:", err);
    }
  }
};

document.getElementById('btnToResume').onclick = () => goToStep(3);

/* =========================================================
   STEP 3 — RESUME UPLOAD & PARSING
========================================================= */
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
dropzone.onclick = () => fileInput.click();
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag');
  if (e.dataTransfer.files.length) handleResumeFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files.length) handleResumeFile(fileInput.files[0]);
});

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

async function handleResumeFile(file) {
  const maxSize = 10 * 1024 * 1024;
  const chipHolder = document.getElementById('fileChipHolder');
  const resultHolder = document.getElementById('resumeResult');
  resultHolder.innerHTML = '';
  chipHolder.innerHTML = '';

  if (file.size > maxSize) {
    chipHolder.innerHTML = `<div class="field invalid"><div class="err">File exceeds 10MB limit. Please upload a smaller file.</div></div>`;
    return;
  }
  const isPdf = file.name.toLowerCase().endsWith('.pdf');
  const isDocx = file.name.toLowerCase().endsWith('.docx');
  if (!isPdf && !isDocx) {
    chipHolder.innerHTML = `<div class="field invalid"><div class="err">Only PDF or DOCX files are supported.</div></div>`;
    return;
  }

  const chip = document.createElement('div');
  chip.className = 'file-chip';
  chip.innerHTML = `<span class="name">${escapeHtml(file.name)}</span><span>${(file.size/1024).toFixed(0)} KB</span>`;
  chipHolder.appendChild(chip);

  resultHolder.innerHTML = `<div class="center-loading"><div class="spinner"></div><div class="loader">Reading your resume…</div></div>`;

  try {
    let text = '';
    if (isPdf) {
      text = await extractPdfText(file);
    } else {
      text = await extractDocxText(file);
    }
    state.resumeText = text;
    resultHolder.innerHTML = `<div class="center-loading"><div class="spinner"></div><div class="loader">Analyzing skills, projects & experience…</div></div>`;
    const parsed = await parseResumeWithGroq(text);
    state.resumeData = parsed;
    renderResumeResult(parsed);
    document.getElementById('btnToAssessment').classList.remove('hidden');
  } catch (e) {
    console.error(e);
    resultHolder.innerHTML = `<div class="field invalid"><div class="err">Couldn't process that file (${escapeHtml(e.message || 'unknown error')}). Please try another file or check your API key.</div></div>`;
  }
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: buf}).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text.trim();
}
async function extractDocxText(file) {
  const buf = await file.arrayBuffer();
  const result = await mammoth.extractRawText({arrayBuffer: buf});
  return result.value.trim();
}

async function parseResumeWithGroq(resumeText) {
  if (state.demoMode) {
    await delay(900);
    return mockParseResume(resumeText);
  }
  const sys = `You extract structured data from resumes. Respond with ONLY valid JSON, no markdown fences, no preamble, matching exactly this schema:
{
  "personal": {"name": "", "email": "", "phone": ""},
  "education": [{"degree": "", "college": "", "graduationYear": ""}],
  "skills": [],
  "technologies": [],
  "aiSkills": [],
  "projects": [{"title": "", "technologies": []}],
  "certifications": [],
  "experience": [{"role": "", "organization": "", "duration": ""}]
}
If a field is not found, use an empty string or empty array. Do not invent information not present in the resume text.`;
  try {
    return await callGroq({
      system: sys,
      messages: [{role: 'user', content: 'Resume text:\n\n' + resumeText.slice(0, 12000)}],
      maxTokens: 1500,
      jsonMode: true
    });
  } catch (e) {
    console.warn("Groq resume parsing failed, using Demo Mode fallback:", e);
    state.demoMode = true;
    return mockParseResume(resumeText);
  }
}

function tagRow(items) {
  if (!items || !items.length) return '<span class="tag">None found</span>';
  return items.map(i => `<span class="tag">${escapeHtml(String(i))}</span>`).join('');
}

function renderResumeResult(data) {
  const edu = (data.education && data.education[0]) || {};
  const projTitles = (data.projects || []).map(p => p.title).filter(Boolean);
  const html = `
    <div class="resume-cards">
      <div class="rcard"><h4>Personal details</h4><div class="plain">
        ${escapeHtml(data.personal?.name || state.student.name)}<br>
        ${escapeHtml(data.personal?.email || '—')}<br>
        ${escapeHtml(data.personal?.phone || '—')}
      </div></div>
      <div class="rcard"><h4>Education</h4><div class="plain">
        ${escapeHtml(edu.degree || '—')}<br>
        ${escapeHtml(edu.college || '—')}<br>
        ${escapeHtml(edu.graduationYear ? 'Class of ' + edu.graduationYear : '')}
      </div></div>
      <div class="rcard"><h4>Skills</h4><div class="tag-row">${tagRow(data.skills)}</div></div>
      <div class="rcard"><h4>Technologies</h4><div class="tag-row">${tagRow(data.technologies)}</div></div>
      <div class="rcard"><h4>AI skills</h4><div class="tag-row">${tagRow(data.aiSkills)}</div></div>
      <div class="rcard"><h4>Certifications</h4><div class="tag-row">${tagRow(data.certifications)}</div></div>
      <div class="rcard" style="grid-column:1/-1;"><h4>Projects</h4><div class="tag-row">${tagRow(projTitles.length ? projTitles : ['None found'])}</div></div>
    </div>
    <div class="mentor-note">${
      projTitles.length
        ? `"I noticed you worked on ${escapeHtml(projTitles[0])}${data.projects[0].technologies?.length ? ' using ' + escapeHtml(data.projects[0].technologies.join(', ')) : ''}. Nice — we'll build on that in the assessment."`
        : `"Thanks for sharing this — I've got a good picture of your background now. Let's move into a short technical check-in."`
    }</div>
  `;
  document.getElementById('resumeResult').innerHTML = html;
}

document.getElementById('btnToAssessment').onclick = () => {
  goToStep(4);
  startAssessment();
};

/* =========================================================
   STEP 4 — TECHNICAL ASSESSMENT
========================================================= */
const assessmentBody = document.getElementById('assessmentBody');

async function startAssessment() {
  assessmentBody.innerHTML = `<div class="center-loading"><div class="spinner"></div><div class="loader">Building your personalized question set…</div></div>`;
  try {
    const questions = await generateAssessmentQuestions();
    state.assessment.questions = questions;
    state.assessment.index = 0;
    state.assessment.answers = [];
    renderQuestion();
  } catch (e) {
    console.error(e);
    assessmentBody.innerHTML = `<div class="field invalid"><div class="err">Couldn't generate the assessment (${escapeHtml(e.message || 'error')}). Check your API key and reopen this step.</div></div>`;
  }
}

async function generateAssessmentQuestions() {
  if (state.demoMode) {
    await delay(900);
    return JSON.parse(JSON.stringify(MOCK_QUESTIONS)).slice(0, 5);
  }
  const convoText = state.conversation.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
  const sys = `You design adaptive technical assessments for a career-readiness platform. Based on the candidate's conversation and resume, produce exactly 5 questions tailored to their stated skill level, languages, projects, and career goal. Cover topics drawn from: Python, SQL, Machine Learning, Deep Learning, Generative AI, Data Structures, Algorithms, Problem Solving, Programming Logic.

CRITICAL INSTRUCTIONS:
- The first 3 questions (index 0, 1, 2) MUST be of type "multiple_choice".
- The last 2 questions (index 3, 4) MUST be of type "numerical" (a question where the final answer is a number, like calculating a probability, complexity, or math problem).

Respond with ONLY valid JSON, no markdown fences: an array of exactly 5 objects, each:
{
  "type": "multiple_choice" | "numerical",
  "topic": "",
  "difficulty": "easy" | "medium" | "hard",
  "question": "",
  "options": ["A text","B text","C text","D text"]   // ONLY include this field for multiple_choice, otherwise omit it
}`;
  const user = `CONVERSATION TRANSCRIPT:\n${convoText}\n\nRESUME DATA:\n${JSON.stringify(state.resumeData)}\n\nGenerate the 5 adaptive questions now.`;
  try {
    return await callGroq({system: sys, messages: [{role: 'user', content: user}], maxTokens: 2500, jsonMode: true});
  } catch (e) {
    console.warn("Groq question generation failed, using Demo Mode fallback:", e);
    state.demoMode = true;
    return JSON.parse(JSON.stringify(MOCK_QUESTIONS)).slice(0, 5);
  }
}

function renderQuestion() {
  const {questions, index} = state.assessment;
  if (index >= questions.length) { finishAssessment(); return; }
  const q = questions[index];
  const pct = (index / questions.length) * 100;
  let bodyHtml = '';
  if (q.type === 'multiple_choice' && q.options && q.options.length) {
    bodyHtml = `<div class="mcq-options">` + q.options.map((opt, i) => {
      const letter = String.fromCharCode(65 + i);
      return `<button class="mcq-option" data-letter="${letter}">
        <span class="letter">${letter}</span>${escapeHtml(opt)}
      </button>`;
    }).join('') + `</div>
    <div class="btn-row"><button class="btn btn-primary" id="btnSubmitAnswer" disabled>Submit answer →</button></div>`;
  } else {
    bodyHtml = `<textarea class="answer-textarea" id="freeAnswer" placeholder="Type your answer or approach here…"></textarea>
    <div class="btn-row"><button class="btn btn-primary" id="btnSubmitAnswer">Submit answer →</button></div>`;
  }

  assessmentBody.innerHTML = `
    <div class="assess-progress-bar"><div class="assess-progress-fill" style="width:${pct}%"></div></div>
    <div class="q-meta"><span class="q-topic">${escapeHtml(q.topic)} · ${escapeHtml(q.difficulty)}</span><span>Question ${index+1} of ${questions.length}</span></div>
    <div class="q-text">${escapeHtml(q.question)}</div>
    ${bodyHtml}
  `;

  let selected = null;
  if (q.type === 'multiple_choice') {
    assessmentBody.querySelectorAll('.mcq-option').forEach(btn => {
      btn.onclick = () => {
        assessmentBody.querySelectorAll('.mcq-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selected = btn.dataset.letter + ': ' + btn.textContent.trim();
        document.getElementById('btnSubmitAnswer').disabled = false;
      };
    });
  }

  document.getElementById('btnSubmitAnswer').onclick = () => {
    const answer = q.type === 'multiple_choice' ? selected : document.getElementById('freeAnswer').value.trim();
    if (!answer) return;
    state.assessment.answers.push({question: q.question, topic: q.topic, type: q.type, answer});
    state.assessment.index++;
    renderQuestion();
  };
}

function finishAssessment() {
  goToStep(5);
  generateReport();
}

/* =========================================================
   STEP 5 — AI CAREER EVALUATION REPORT
========================================================= */
const reportBody = document.getElementById('reportBody');

async function generateReport() {
  reportBody.innerHTML = `<div class="center-loading"><div class="spinner"></div><div class="loader">Writing your personalized career report…</div></div>`;
  try {
    if (state.demoMode) {
      await delay(1100);
      const report = mockGenerateReport();
      state.report = report;
      renderReport(report);
      return;
    }
    const convoText = state.conversation.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n');
    const answersText = state.assessment.answers.map((a,i) => `Q${i+1} [${a.topic}/${a.type}]: ${a.question}\nAnswer: ${a.answer}`).join('\n\n');

    const sys = `You are an expert AI career mentor writing a final evaluation report for a student at "The AI School". Be specific, encouraging, honest, and constructive — never generic. Base every claim on the actual conversation, resume, and assessment answers provided. Respond with ONLY valid JSON, no markdown fences, matching exactly this schema:

{
  "candidateSummary": "2-4 sentence personalized narrative summary",
  "strengths": ["short phrase", "..."],
  "improvementAreas": ["short phrase", "..."],
  "confidenceAssessment": {
    "verdict": "overestimates" | "underestimates" | "balanced",
    "narrative": "2-3 sentence explanation in the mentor's voice"
  },
  "technicalEvaluation": {
    "programming": 0-100,
    "problemSolving": 0-100,
    "communication": 0-100,
    "learningAbility": 0-100,
    "aiReadiness": 0-100,
    "industryReadiness": 0-100,
    "careerClarity": 0-100
  },
  "roadmap": ["Python", "Machine Learning", "..."],
  "courseRecommendations": [
    {"courseName": "", "whyRecommended": "", "skillsGained": ["",""], "careerOutcomes": ""}
  ]
}
The roadmap should be an ordered array of stage names reflecting a realistic personalized progression for this specific candidate (not a generic list) — 5 to 8 stages. Recommend 1-2 courses from The AI School's plausible catalog (e.g. Machine Learning Foundations, Generative AI Engineering, Applied Data Science, Full Stack AI Development, Agentic AI Systems) matched to the candidate's goals and gaps.`;

    const user = `STUDENT: ${state.student.name}, ${state.student.college}

SELF-INTRODUCTION:
Text: ${state.selfIntroText || "Not provided"}
Content Score: ${state.selfIntroReport ? state.selfIntroReport.contentScore : "N/A"}/10
Grammar Score: ${state.selfIntroReport ? state.selfIntroReport.grammarScore : "N/A"}/10
Feedback: ${state.selfIntroReport ? state.selfIntroReport.feedback : "N/A"}

CONVERSATION TRANSCRIPT:
${convoText}

RESUME DATA:
${JSON.stringify(state.resumeData)}

TECHNICAL ASSESSMENT ANSWERS:
${answersText}

Generate the final career evaluation report now. Make sure the 'candidateSummary' weaves in insights from their self-introduction.`;

    const report = await callGroq({system: sys, messages: [{role:'user', content: user}], maxTokens: 2500, jsonMode: true});
    state.report = report;

    // Asynchronously save complete interview report to Neon DB backend (non-blocking)
    fetch('/api/save-interview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: state.student.email,
        selfIntroText: state.selfIntroText,
        conversation: state.conversation,
        report: report
      })
    }).then(res => res.json())
      .then(data => console.log('✅ Saved interview report to Neon DB! Report ID:', data.reportId))
      .catch(e => console.warn('Neon DB notice (report):', e.message));

    renderReport(report);
  } catch (e) {
    console.warn("Groq report generation failed, using Demo Mode fallback:", e);
    state.demoMode = true;
    const report = mockGenerateReport();
    state.report = report;
    renderReport(report);
  }
}

function scoreCard(label, val) {
  return `<div class="score-card">
    <div class="label">${escapeHtml(label)}</div>
    <div class="score-bar"><div class="fill" style="width:${val}%"></div></div>
    <div class="val">${val}/100</div>
  </div>`;
}

function renderReport(r) {
  const te = r.technicalEvaluation || {};
  const scoreLabels = {
    programming: 'Programming', problemSolving: 'Problem solving', communication: 'Communication',
    learningAbility: 'Learning ability', aiReadiness: 'AI readiness', industryReadiness: 'Industry readiness',
    careerClarity: 'Career clarity'
  };
  const scoresHtml = Object.entries(scoreLabels).map(([k,label]) => scoreCard(label, te[k] ?? 0)).join('');
  const roadmapHtml = (r.roadmap || []).map((step, i) =>
    `<div class="roadmap-step"><div class="roadmap-dot">${i+1}</div><div class="txt">${escapeHtml(step)}</div></div>`
  ).join('');
  const coursesHtml = (r.courseRecommendations || []).map(c => `
    <div class="course-card">
      <h4>${escapeHtml(c.courseName)}</h4>
      <div class="why">${escapeHtml(c.whyRecommended)}</div>
      <div class="tag-row" style="margin-bottom:10px;">${tagRow(c.skillsGained)}</div>
      <div class="why"><strong style="color:var(--pink);">Career outcomes:</strong> ${escapeHtml(c.careerOutcomes)}</div>
    </div>
  `).join('');

  let selfIntroSection = '';
  if (state.selfIntroReport) {
    let errorsHtml = '';
    if (state.selfIntroReport.grammaticalErrors && state.selfIntroReport.grammaticalErrors.length > 0) {
      errorsHtml = `
        <div class="grammar-details" style="margin-top: 12px;">
          <h4 style="font-size: 0.85rem; margin-bottom: 6px; text-transform: none; letter-spacing: normal; color: var(--text-muted);">Grammatical Corrections:</h4>
          <div class="grammar-errors-list">
            ${state.selfIntroReport.grammaticalErrors.map(err => `
              <div class="grammar-error-item" style="padding: 8px 12px; font-size: 0.82rem;">
                <div class="error-context" style="margin-bottom: 4px;">
                  <span class="original" style="font-size: 0.82rem;">${escapeHtml(err.original)}</span>
                  <span class="suggested" style="font-size: 0.82rem;">${escapeHtml(err.suggested)}</span>
                </div>
                <div class="error-explanation" style="font-size: 0.78rem;">${escapeHtml(err.explanation)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      errorsHtml = `
        <div class="grammar-perfect" style="padding: 10px; font-size: 0.82rem; margin-top: 12px;">
          🎉 No grammatical errors were detected in your self-introduction.
        </div>
      `;
    }

    selfIntroSection = `
      <div class="report-section">
        <h3>Self-Introduction Assessment</h3>
        <div class="self-intro-scores" style="max-width: 460px; margin-bottom: 16px;">
          <div class="score-box content-score">
            <div class="score-label">Content & Delivery</div>
            <div class="score-value">${state.selfIntroReport.contentScore}<em>/10</em></div>
          </div>
          <div class="score-box grammar-score">
            <div class="score-label">Grammar Score</div>
            <div class="score-value">${state.selfIntroReport.grammarScore}<em>/10</em></div>
          </div>
        </div>
        <div class="intro-feedback" style="font-size: 0.88rem; line-height: 1.5; margin-bottom: 8px;">
          <strong>Original Speech:</strong><br>
          <em>"${escapeHtml(state.selfIntroText)}"</em>
        </div>
        <div class="intro-feedback" style="font-size: 0.88rem; line-height: 1.5; margin-bottom: 8px;">
          <strong>Corrected/Improved Version:</strong><br>
          ${escapeHtml(state.selfIntroReport.improvedIntroduction || '')}
        </div>
        <div class="intro-feedback" style="font-size: 0.88rem; line-height: 1.5; margin-bottom: 8px;">
          <strong>Mentor's Feedback:</strong> ${escapeHtml(state.selfIntroReport.feedback)}
        </div>
        ${errorsHtml}
      </div>
    `;
  }

  reportBody.innerHTML = `
    <div class="report-header">
      <div class="school">The AI School · Career Evaluation Report</div>
      <h1>${escapeHtml(state.student.name)}</h1>
      <div class="sub">${escapeHtml(state.student.college)} · ${new Date().toLocaleDateString('en-IN', {year:'numeric', month:'long', day:'numeric'})}</div>
    </div>

    <div class="report-section">
      <h3>Candidate summary</h3>
      <div class="summary-text">${escapeHtml(r.candidateSummary)}</div>
    </div>

    ${selfIntroSection}

    <div class="report-section two-col">
      <div>
        <h3>Strengths</h3>
        <ul class="strength-list">${(r.strengths||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
      <div>
        <h3>Improvement areas</h3>
        <ul class="improve-list">${(r.improvementAreas||[]).map(s=>`<li>${escapeHtml(s)}</li>`).join('')}</ul>
      </div>
    </div>

    <div class="report-section">
      <h3>Confidence assessment</h3>
      <div class="confidence-box">"${escapeHtml(r.confidenceAssessment?.narrative || '')}"</div>
    </div>

    <div class="report-section">
      <h3>Technical evaluation</h3>
      <div class="score-grid">${scoresHtml}</div>
    </div>

    <div class="report-section">
      <h3>Personalized learning roadmap</h3>
      <div class="roadmap-path">${roadmapHtml}</div>
    </div>

    <div class="report-section">
      <h3>Course recommendation</h3>
      ${coursesHtml}
    </div>

    <div class="btn-row" style="margin-top:32px;">
      <button class="btn btn-ghost" id="btnPrint">🖨 Save / print report</button>
    </div>
  `;
  document.getElementById('btnPrint').onclick = () => window.print();
}
