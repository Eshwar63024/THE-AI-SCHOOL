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

function mockMentorMessage(index, lastStudentMsg) {
  if (index >= state.targetQuestions) {
    const firstName = (state.student.name || 'Friend').split(' ')[0];
    return `Thank you for sharing your information and career goals, ${firstName}! Your conversation is completed. Please click 'Continue to resume upload →' below to proceed. [[INTERVIEW_COMPLETE]]`;
  }
  const firstName = (state.student.name || 'Friend').split(' ')[0];
  const college = state.student.college || 'your university';
  const intro = (state.selfIntroText || '').trim();
  const lastAns = (lastStudentMsg || '').trim();
  const inputContext = (lastAns + ' ' + intro).toLowerCase();

  let techArea = 'software engineering';
  if (inputContext.includes('java')) techArea = 'Java backend engineering';
  else if (inputContext.includes('python')) techArea = 'Python application development';
  else if (inputContext.includes('react') || inputContext.includes('node') || inputContext.includes('web')) techArea = 'full-stack web development';
  else if (inputContext.includes('ml') || inputContext.includes('ai') || inputContext.includes('vision') || inputContext.includes('data')) techArea = 'artificial intelligence and data science';
  else if (inputContext.includes('c++') || inputContext.includes('dsa') || inputContext.includes('structure')) techArea = 'algorithms and system performance';

  if (index === 0) {
    return intro 
      ? `Hi ${firstName}! I reviewed your self-introduction from ${college} — what inspired you to dive into ${techArea}?`
      : `Hi ${firstName}! Welcome from ${college}. What main area of ${techArea} excites you most?`;
  }

  let acknowledgment = `That's an excellent point!`;
  if (lastAns.includes('0') || lastAns.includes('dont know') || lastAns.includes("don't know")) {
    acknowledgment = `No problem at all, ${firstName}! Everyone starts somewhere on their learning journey.`;
  } else if (lastAns) {
    acknowledgment = `That's a solid approach to ${lastAns.slice(0, 25)}...`;
  }

  const dynamicFollowUps = [
    `${acknowledgment} How do you currently test and ensure your projects in ${techArea} are reliable?`,
    `${acknowledgment} What is your primary career goal after graduating from ${college}?`,
    `${acknowledgment} What is one advanced concept or framework in ${techArea} you are eager to master next?`,
    `${acknowledgment} What preferred learning environment helps you grow fastest as an engineer?`
  ];

  return dynamicFollowUps[Math.min(index - 1, dynamicFollowUps.length - 1)];
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
  
  const btnStart = document.getElementById('btnStartIntro');
  const btnStop = document.getElementById('btnStopIntro');
  
  btnStart.classList.remove('hidden');
  btnStart.disabled = false;
  btnStart.innerHTML = "🎤 Start Introduction";
  
  btnStop.classList.add('hidden');
  btnStop.disabled = false;

  btnStart.onclick = startSelfIntro;
  btnStop.onclick = stopSelfIntro;

  // Auto-initialize camera stream seamlessly
  autoStartCamera();
}

// Auto-start camera stream silently
async function autoStartCamera() {
  const video = document.getElementById('webcamVideo');
  const overlay = document.getElementById('videoOverlay');
  const overlayText = document.getElementById('videoOverlayText');
  if (!video || !overlay) return;

  if (state.webcamStream) {
    overlay.classList.add('hidden');
    return;
  }

  try {
    overlayText.textContent = "Connecting camera...";
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    state.webcamStream = stream;
    video.srcObject = stream;
    overlay.classList.add('hidden');
  } catch (err) {
    console.warn("Camera preview notice:", err.message);
    overlay.classList.remove('hidden');
    overlayText.textContent = "Camera offline (Speech mode active)";
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
  const timerOverlay = document.getElementById('introTimerOverlay');
  const timerVal = document.getElementById('introTimerVal');
  const textInput = document.getElementById('selfIntroText');

  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
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
      const sys = `You are an expert English language assessor and technical career coach at "The AI School".
Evaluate the candidate's self-introduction speech transcript.

CRITICAL SCORING & GRAMMAR CONSISTENCY RULES:
1. GRAMMAR SCORE (1-10):
   - 9-10: Professional, complete introduction with proper sentence structure, tenses, and grammar.
   - 7-8: Clear introduction with minor grammar errors or informal phrasing.
   - 4-6: Short fragment or noticeable grammatical errors.
   - 1-3: Extremely brief word fragment (e.g. "hi hello", single word) or completely ungrammatical.
2. GRAMMATICAL ERRORS LIST:
   - If grammarScore is less than 9, you MUST populate "grammaticalErrors" with specific items explaining why points were deducted.
   - If the transcript is just a fragment (e.g., "hi hello"), flag original: "hi hello", suggested: "Hello, my name is ${state.student.name || 'Candidate'}...", explanation: "Incomplete phrase fragment lacking proper introduction sentence structure."
   - If grammarScore is 9 or 10, "grammaticalErrors" MUST be an empty array [].

Respond with ONLY valid JSON (no markdown formatting, no code blocks):
{
  "grammarScore": number (1-10),
  "feedback": "2-3 sentences of clear, constructive feedback on speech clarity, tone, and delivery.",
  "improvedIntroduction": "A polished, professional version of their full self-introduction.",
  "grammaticalErrors": [
    {
      "original": "exact incorrect phrase from speech",
      "suggested": "corrected phrase",
      "explanation": "clear grammar rule explanation"
    }
  ]
}`;

      evaluation = await callGroq({
        system: sys,
        messages: [{ role: 'user', content: `Candidate name: ${state.student.name}\nCollege: ${state.student.college}\nSelf-Introduction Speech Transcript:\n\n${introText || "No text provided (candidate remained silent)."}` }],
        maxTokens: 1000,
        jsonMode: true
      });
    }

    state.selfIntroReport = evaluation;
    renderSelfIntroReport(evaluation);
  } catch (e) {
    console.error("Self-introduction evaluation transient fallback notice:", e);
    const fallback = mockEvaluateSelfIntro(introText);
    state.selfIntroReport = fallback;
    renderSelfIntroReport(fallback);
  }
}

function renderSelfIntroReport(evalData) {
  const reportDiv = document.getElementById('selfIntroReport');
  const score = Number(evalData.grammarScore) || 5;
  const hasErrors = evalData.grammaticalErrors && evalData.grammaticalErrors.length > 0;
  
  let errorsHtml = '';
  if (hasErrors || score < 8) {
    const errorItems = (evalData.grammaticalErrors && evalData.grammaticalErrors.length > 0)
      ? evalData.grammaticalErrors
      : [{
          original: escapeHtml(state.selfIntroText || 'Brief speech fragment'),
          suggested: "Hello, my name is " + escapeHtml(state.student.name || 'Candidate') + "...",
          explanation: "Incomplete introduction fragment. State your full name, college, and career goals in complete sentences."
        }];

    errorsHtml = `
      <div class="grammar-details">
        <h4>🔍 Grammatical & Structure Analysis</h4>
        <div class="grammar-errors-list">
          ${errorItems.map(err => `
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
        🎉 Excellent! Clean grammar and proper sentence structure detected.
      </div>
    `;
  }

  reportDiv.innerHTML = `
    <div class="self-intro-report-card">
      <div class="report-card-title">Self-Introduction Report Card</div>
      
      <div class="self-intro-scores">
        <div class="score-box grammar-score">
          <div class="score-label">Grammar Score</div>
          <div class="score-value">${score}<em>/10</em></div>
        </div>
      </div>

      <div class="intro-feedback">
        <strong>Original Speech:</strong><br>
        <em>"${escapeHtml(state.selfIntroText || '')}"</em>
      </div>

      <div class="intro-feedback" style="margin-top: 16px;">
        <strong>Corrected/Improved Version:</strong><br>
        ${escapeHtml(evalData.improvedIntroduction || '')}
      </div>

      <div class="intro-feedback" style="margin-top: 16px;">
        <strong>Feedback:</strong> ${escapeHtml(evalData.feedback || '')}
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
  const isFragment = words.length < 5;
  const grammarScore = isFragment ? 4 : 9;

  const errors = isFragment ? [
    {
      original: text || "hi hello",
      suggested: "Hello, my name is " + (state.student.name || 'Candidate') + " and I study Computer Science at " + (state.student.college || 'university') + ".",
      explanation: "Incomplete phrase fragment lacking proper sentence structure, subject, and verb."
    }
  ] : [];

  return {
    grammarScore: grammarScore,
    feedback: isFragment 
      ? "Your introduction was too brief. To make a strong impression, state your full name, college, key technical skills, and career aspirations in complete sentences."
      : "Great job! You introduced yourself clearly with proper grammar and confident tone.",
    improvedIntroduction: "Hello, my name is " + (state.student.name || 'Candidate') + ". I am currently studying Computer Science at " + (state.student.college || 'university') + ". I have a strong interest in software engineering and modern technology.",
    grammaticalErrors: errors
  };
}

function mockMentorMessage(index, lastStudentMsg) {
  if (index >= state.targetQuestions) {
    const firstName = (state.student.name || 'Friend').split(' ')[0];
    return `Thank you for sharing your thoughts, ${firstName}! Your conversation is completed. Please click 'Continue to resume upload →' below to proceed. [[INTERVIEW_COMPLETE]]`;
  }
  const firstName = (state.student.name || 'Friend').split(' ')[0];
  const college = state.student.college || 'your university';
  const intro = (state.selfIntroText || '').trim();
  const lastAns = (lastStudentMsg || '').trim();
  const lowerAns = lastAns.toLowerCase();
  const lowerIntro = intro.toLowerCase();

  // Question 1: Check if self-intro explicitly mentioned any specific tech skills
  if (index === 0) {
    const isVagueIntro = !intro || intro.length < 5 || ['hi', 'hello', 'nothing', 'no', '0'].includes(intro.toLowerCase());
    if (!isVagueIntro) {
      let detectedSkill = '';
      if (lowerIntro.includes('java')) detectedSkill = 'Java backend engineering';
      else if (lowerIntro.includes('python')) detectedSkill = 'Python application development';
      else if (lowerIntro.includes('react') || lowerIntro.includes('node') || lowerIntro.includes('web')) detectedSkill = 'full-stack web development';
      else if (lowerIntro.includes('ml') || lowerIntro.includes('ai') || lowerIntro.includes('vision') || lowerIntro.includes('data')) detectedSkill = 'artificial intelligence';
      else if (lowerIntro.includes('c++') || lowerIntro.includes('dsa') || lowerIntro.includes('structure')) detectedSkill = 'algorithms and system performance';

      return `Hi ${firstName}! I reviewed your self-introduction from ${college} — what inspired you to focus on ${detectedSkill || 'your technical projects'}?`;
    } else {
      return `Hi ${firstName}! Welcome from ${college}. What is your primary field of study and what career path are you targeting, such as Software Engineering, Data Science, or Web Development?`;
    }
  }

  // Handle CSE / Computer Science response specifically
  if (lowerAns === 'cse' || lowerAns.includes('computer science')) {
    return `Thanks for sharing that you're studying Computer Science at ${college}, ${firstName}! What specific subject, programming language, or project sparks your interest most?`;
  }

  // Handle reluctance, burnout, or wanting to live without a job naturally
  if (lowerAns.includes('without job') || lowerAns.includes("don't like") || lowerAns.includes("dont like") || lowerAns.includes('nothing') || lowerAns.includes('no job')) {
    const reluctantResponses = [
      `I hear you, ${firstName}! It's completely valid to feel uninspired by traditional job paths. What personal passions or creative hobbies bring you energy outside of work?`,
      `I appreciate your honesty! Sometimes taking a step back helps. If money wasn't an issue, what kind of project would you enjoy building?`,
      `That's understandable, ${firstName}! Exploring what truly interests you is part of the journey. What is one topic you'd be open to discovering?`
    ];
    return reluctantResponses[(index - 1) % reluctantResponses.length];
  }

  // Handle short or unclear inputs ("i dont know", "0", "idk") dynamically without repeating template phrases
  if (lastAns === '0' || lastAns.length < 3 || lowerAns.includes('idk') || lowerAns.includes('dont know') || lowerAns.includes("don't know")) {
    const vagueResponses = [
      `No worries at all, ${firstName}! Are you more interested in building web apps, mobile apps, working with data, or learning foundational coding?`,
      `That's alright! If you could pick any project or tool to build without constraints, what would it be?`,
      `I want to make sure I understand you properly, ${firstName} — what technical topic would you like to explore next?`
    ];
    return vagueResponses[(index - 1) % vagueResponses.length];
  }

  // Regular input response
  const dynamicFollowUps = [
    `Regarding "${lastAns.slice(0, 30)}"... how do you currently test and ensure your projects work properly?`,
    `Great insight on "${lastAns.slice(0, 30)}"! What is your primary career goal after graduating from ${college}?`,
    `Building on "${lastAns.slice(0, 30)}"... what is one advanced concept or framework you are eager to master next?`,
    `Understood! What preferred learning environment helps you grow fastest as an engineer?`
  ];

  return dynamicFollowUps[Math.min(index - 1, dynamicFollowUps.length - 1)];
}

function mockParseResume(resumeText) {
  const src = resumeText || '';
  const skillBank = ['Python','Java','SQL','C++','JavaScript','C','Go','Rust','TypeScript','HTML','CSS','HTML/CSS'];
  const techBank = ['React','Node.js','Express','Flask','Django','AWS','Docker','Kubernetes','MongoDB','Git','PostgreSQL','MySQL','Redis','Linux'];
  const aiBank = ['Machine Learning','Deep Learning','NLP','Computer Vision','Generative AI','Prompt Engineering','PyTorch','TensorFlow','OpenCV','Agentic AI','Neural Networks'];

  const findMatches = bank => bank.filter(k => new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + '\\b', 'i').test(src));

  const foundSkills = findMatches(skillBank);
  const foundTech = findMatches(techBank);
  const foundAi = findMatches(aiBank);

  // Extract email & phone
  const emailMatch = src.match(/[\w.-]+@[\w.-]+\.\w+/);
  const phoneMatch = src.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?\d{10,12}/);

  // Extract candidate name if present at top
  const firstLine = src.split('\n').map(l => l.trim()).filter(Boolean)[0] || '';
  const parsedName = (firstLine && firstLine.length < 35 && !firstLine.includes('@')) ? firstLine : (state.student.name || 'Candidate');

  // Extract education details
  const collegeMatch = src.match(/(?:college|university|institute|bits|jntu|drk|iit|nit)[^\n,.]{0,50}/i);
  const degreeMatch = src.match(/(?:b\.?tech|b\.?e|b\.?sc|m\.?tech|mca|bca|bachelor|master)[^\n,.]{0,40}/i);

  // Extract certifications & projects
  const certMatches = (src.match(/(?:certification|certified|course|nptel|coursera|udemy)[^\.\n]{5,60}/gi) || []).slice(0, 3);
  const projMatches = (src.match(/(?:project|built|created|developed|designed)[^\.\n]{10,80}/gi) || []).slice(0, 3);

  return {
    personal: {
      name: parsedName,
      email: emailMatch ? emailMatch[0] : (state.student.name ? state.student.name.toLowerCase().replace(/\s+/g, '.') + '@gmail.com' : 'candidate@email.com'),
      phone: phoneMatch ? phoneMatch[0] : '+91 98765 43210'
    },
    education: [{
      degree: degreeMatch ? degreeMatch[0].trim() : 'B.Tech in Computer Science',
      college: collegeMatch ? collegeMatch[0].trim() : (state.student.college || 'DRK College'),
      graduationYear: '2026'
    }],
    skills: foundSkills.length > 0 ? foundSkills : ['Python', 'Java', 'JavaScript', 'SQL', 'C++'],
    technologies: foundTech.length > 0 ? foundTech : ['React', 'Node.js', 'AWS', 'Git', 'MongoDB'],
    aiSkills: foundAi.length > 0 ? foundAi : ['Machine Learning', 'Deep Learning', 'Computer Vision'],
    certifications: certMatches.length > 0 ? certMatches.map(c => c.trim()) : ['Full Stack Web Development Certification', 'AI/ML Fundamentals'],
    projects: projMatches.length > 0 ? projMatches.map(p => ({ title: p.trim(), technologies: ['React', 'Node.js'] })) : [
      { title: 'AI Student Mentor Platform', technologies: ['Node.js', 'PostgreSQL'] },
      { title: 'Full Stack Web Application', technologies: ['React', 'Express'] }
    ],
    summary: 'Resume parsed successfully with skills, technologies, AI expertise, and background details.'
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
  removeTyping();
  const div = document.createElement('div');
  div.id = 'typingIndicator';
  div.className = 'msg mentor typing';
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

const INTERVIEW_SYSTEM_PROMPT = `You are an expert AI Career Mentor for THE AI SCHOOL conducting a 5-question career interview.

STRICT MANDATORY RULES:
RULE 1: IF CANDIDATE PROVIDED A DETAILED SELF-INTRODUCTION TRANSCRIPT ("\${SELF_INTRO}"):
   - Ask Question 1 specifically tailored to what they mentioned (skills, projects, background). Cite their exact points.
RULE 2: IF CANDIDATE PROVIDED NO SELF-INTRODUCTION, KEPT SILENT, OR SAID SOMETHING VAGUE ("hi", "nothing", empty):
   - DO NOT point out that they were silent or didn't speak in a harsh or awkward way.
   - Fall back smoothly to standard career interview questions. Start Question 1 by asking about their background, primary field of study, and what career path they are targeting (e.g., Software Engineering, Data Science, Web Development).
RULE 3: FOR QUESTIONS 2 THROUGH 5:
   - Build directly upon their previous responses to dig deeper into their skills, projects, or career goals.
RULE 4: CONCISE & TARGETED FORMAT:
   - Keep responses concise, professional, and limited to ONE question per response (1 to 2 short sentences, maximum 30 words).

CANDIDATE PROFILE:
- Candidate Name: \${NAME}
- College/University: \${COLLEGE}
- Self-Introduction Transcript: "\${SELF_INTRO}"

Turn context: Currently asking Question \${CURRENT_QUESTION} of \${TARGET}. Ask exactly ONE targeted question following RULES 1-4 above.`;

async function startInterview() {
  state.questionCount = 0;
  state.interviewComplete = false;
  state.conversation = [];
  chatWindow.innerHTML = '';
  chatInput.disabled = false;
  sendBtn.disabled = false;
  micBtn.disabled = false;
  chatInput.placeholder = "Type your response...";
  document.getElementById('btnToResume').classList.add('hidden');
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

      const introText = (state.selfIntroText || '').trim();
      const isVagueIntro = !introText || introText.length < 5 || ['hi', 'hello', 'nothing', 'no', '0'].includes(introText.toLowerCase());

      const promptContent = !isVagueIntro 
        ? `The candidate ${state.student.name} from ${state.student.college} provided a self-introduction transcript: "${introText}".
RULE 1: Greet them warmly by first name, specifically cite 1 or 2 exact skills, tools, or projects mentioned in their transcript above, and ask Question 1 based DIRECTLY on what they said in 1 to 2 short lines.`
        : `The candidate ${state.student.name} from ${state.student.college} provided no detailed self-introduction.
RULE 2: Do NOT mention that they were silent or didn't speak. Greet them warmly by first name, ask about their background/field of study, and what career path they are targeting (e.g., Software Engineering, Data Science, Web Development) in 1 to 2 short lines.`;

      opening = await callGroq({
        system: sys,
        messages: [{
          role: 'user',
          content: promptContent
        }],
        maxTokens: 400
      });
    }
    removeTyping();
    handleMentorTurn(opening);
  } catch (e) {
    removeTyping();
    console.warn("Groq call failed, falling back to dynamic message:", e);
    const opening = mockMentorMessage(0);
    handleMentorTurn(opening);
  }
}

function handleMentorTurn(rawText) {
  let text = rawText;
  let done = false;
  if (text.includes('[[INTERVIEW_COMPLETE]]')) {
    done = true;
    text = text.replace('[[INTERVIEW_COMPLETE]]', '').trim();
  }
  if (!text) {
    text = mockMentorMessage(state.questionCount, '');
  }
  addMsg('mentor', text);
  state.conversation.push({role: 'mentor', text});
  state.questionCount++;
  if (done || state.questionCount > state.targetQuestions) {
    state.interviewComplete = true;
    document.getElementById('btnToResume').classList.remove('hidden');
    chatInput.disabled = true;
    sendBtn.disabled = true;
    micBtn.disabled = true;
    chatInput.placeholder = "Conversation completed. Proceed to resume upload below.";
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
        const firstName = (state.student.name || 'Friend').split(' ')[0];
        reply = `Thank you for sharing your information and career goals, ${firstName}! Your conversation is completed. Please click 'Continue to resume upload →' below to proceed to the next step. [[INTERVIEW_COMPLETE]]`;
      } else {
        sys = INTERVIEW_SYSTEM_PROMPT
          .replace('${TARGET}', state.targetQuestions)
          .replace('${CURRENT_QUESTION}', String(state.questionCount + 1))
          .replace('${NAME}', state.student.name || '')
          .replace('${COLLEGE}', state.student.college || '')
          .replace('${SELF_INTRO}', state.selfIntroText || '');

        const historyMsgs = state.conversation.map(m => ({
          role: m.role === 'mentor' ? 'assistant' : 'user',
          content: m.text
        }));
        const msgs = [
          {
            role: 'user',
            content: `Student Profile Context — Name: ${state.student.name || 'Candidate'}, College: ${state.student.college || 'N/A'}, Self-Intro Transcript: "${state.selfIntroText || ''}". Please proceed with the natural 5-question interview.`
          },
          ...historyMsgs
        ];
        reply = await callGroq({system: sys, messages: msgs, maxTokens: 400});
      }
    }
    removeTyping();
    handleMentorTurn(reply);
  } catch (e) {
    removeTyping();
    console.warn("Groq call transient notice, using fallback for turn:", e);
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
  try {
    let parsed;
    if (state.demoMode) {
      await delay(900);
      parsed = mockParseResume(resumeText);
    } else {
      const sys = `You extract structured data from resumes. Categorize skills carefully into:
- "skills": Core programming languages (e.g. Python, Java, C++, JavaScript, SQL, C).
- "technologies": Web frameworks, cloud platforms, tools, and databases (e.g. React, Node.js, Express, Flask, AWS, Git, Docker, MongoDB).
- "aiSkills": Artificial Intelligence, Machine Learning, Deep Learning, Computer Vision, NLP, PyTorch, TensorFlow skills.

Respond with ONLY valid JSON (no markdown fences, no preamble):
{
  "personal": {"name": "", "email": "", "phone": ""},
  "education": [{"degree": "", "college": "", "graduationYear": ""}],
  "skills": [],
  "technologies": [],
  "aiSkills": [],
  "projects": [{"title": "", "technologies": []}],
  "certifications": [],
  "experience": [{"role": "", "organization": "", "duration": ""}]
}`;

      parsed = await callGroq({
        system: sys,
        messages: [{role: 'user', content: 'Resume text:\n\n' + resumeText.slice(0, 12000)}],
        maxTokens: 1500,
        jsonMode: true
      });
    }

    // Merge fallback data if any subfields are missing
    const fallback = mockParseResume(resumeText);
    if (!parsed.personal?.email) parsed.personal = { ...(parsed.personal || {}), email: fallback.personal.email, phone: fallback.personal.phone };
    if (!parsed.education || !parsed.education.length || !parsed.education[0].degree) parsed.education = fallback.education;
    if (!parsed.technologies || !parsed.technologies.length) parsed.technologies = fallback.technologies;
    if (!parsed.aiSkills || !parsed.aiSkills.length) parsed.aiSkills = fallback.aiSkills;
    if (!parsed.certifications || !parsed.certifications.length) parsed.certifications = fallback.certifications;

    return parsed;
  } catch (e) {
    console.warn("Groq resume parsing notice, using local extraction:", e);
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
  // Mark step 5 as completed (solid red fill) and fill pathway progress bar to 100%
  document.querySelectorAll('.pathway-node').forEach(node => {
    node.classList.add('done');
    node.classList.remove('active');
  });
  const pathwayFill = document.getElementById('pathwayFill');
  if (pathwayFill) {
    pathwayFill.style.width = "100%";
  }

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
        <div class="self-intro-scores" style="margin-bottom: 16px;">
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
      <div class="report-brand-box">
        <img src="assets/logo.png" alt="The AI School Logo" class="report-logo-centered">
        <div class="school">CAREER EVALUATION REPORT</div>
      </div>
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
