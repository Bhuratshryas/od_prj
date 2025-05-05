// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const rotateCameraBtn = document.getElementById('rotateCameraBtn');
const detectionInfo = document.getElementById('detectionInfo');
const movePrompt = document.getElementById('movePrompt');
const loadingContainer = document.getElementById('loading-container');
const loadingProgress = document.getElementById('loading-progress');
const capturedImageElement = document.getElementById('captured-image');
const resultDiv = document.getElementById('result');
const cameraStatus = document.getElementById('cameraStatus');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');

// Tutorial Modal Elements
const openTutorialBtn = document.getElementById('openTutorialBtn');
const closeTutorialBtn = document.getElementById('closeTutorialBtn');
const tutorialModal = document.getElementById('tutorialModal');

// Audio elements
const shutterSound = document.getElementById('shutterSound');
const processingSound = document.getElementById('processingSound');
const completeSound = document.getElementById('completeSound');

// App State
let isRunning = false;
let model = null;
let audioContext = null;
let oscillator = null;
let gainNode = null;
let lastCaptureTime = 0;
let isCapturing = false;
let isSpeaking = false;
let isPreCapturing = false;
let enableSounds = true;
let enableStopAlert = true;
let enableMovePrompt = true;
let noObjectDetectedTime = null;
let movePromptTimeout = null;
let movePromptActive = false;
let movePromptSpeaking = false;
let movePromptInterval = null;
let isPromptSpeaking = false;

// Camera state
let currentFacingMode = 'user'; // 'user' = front, 'environment' = back

// Initialize the application
async function init() {
  try {
    // Update camera status
    updateCameraStatus('loading');
    
    // Start loading chime immediately
    if (enableSounds) startLoadingChime();

    // Load COCO-SSD model
    model = await cocoSsd.load();

    // Stop chime once model is loaded
    stopLoadingChime();

    // Announce model loaded with text-to-speech
    announceModelLoaded();

    // Start camera immediately
    startCamera();

    // Set initial button text
    rotateCameraBtn.textContent = 'Back Camera';
    
    // Set up event listeners for settings modal
    openSettingsBtn.addEventListener('click', () => {
      stopCamera();
      updateCameraStatus('off');
      settingsModal.classList.add('active');
    });
    
    closeSettingsBtn.addEventListener('click', () => {
      settingsModal.classList.remove('active');
      startCamera();
    });
    
    // Set up event listeners for tutorial modal
    openTutorialBtn.addEventListener('click', () => {
      stopCamera();
      updateCameraStatus('off');
      tutorialModal.classList.add('active');
      speakTutorialContent();
    });
    
    closeTutorialBtn.addEventListener('click', () => {
      tutorialModal.classList.remove('active');
      window.speechSynthesis.cancel(); // Stop any ongoing speech
      startCamera();
    });
    
    // Close modals with ESC key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (settingsModal.classList.contains('active')) {
          settingsModal.classList.remove('active');
          startCamera();
        }
        if (tutorialModal.classList.contains('active')) {
          tutorialModal.classList.remove('active');
          window.speechSynthesis.cancel();
          startCamera();
        }
      }
    });
    
    // Close modals when clicking outside
    settingsModal.addEventListener('mousedown', (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
        startCamera();
      }
    });
    
    tutorialModal.addEventListener('mousedown', (e) => {
      if (e.target === tutorialModal) {
        tutorialModal.classList.remove('active');
        window.speechSynthesis.cancel();
        startCamera();
      }
    });
    
    // Camera rotation button
    rotateCameraBtn.addEventListener('click', rotateCamera);
    
  } catch (error) {
    console.error('Error initializing app:', error);
    updateCameraStatus('error', error.message);
  }
}

// Update camera status indicator
function updateCameraStatus(status, errorMessage = '') {
  switch(status) {
    case 'on':
      cameraStatus.textContent = 'Camera is running';
      cameraStatus.classList.remove('off');
      break;
    case 'off':
      cameraStatus.textContent = 'Camera is turned off';
      cameraStatus.classList.add('off');
      break;
    case 'loading':
      cameraStatus.textContent = 'Camera is starting...';
      cameraStatus.classList.remove('off');
      break;
    case 'error':
      cameraStatus.textContent = 'Camera error: ' + errorMessage;
      cameraStatus.classList.add('off');
      break;
  }
}

// Announce model loaded with text-to-speech
function announceModelLoaded() {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance("COCO SSD Model Loaded");
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    window.speechSynthesis.speak(utterance);
  }
}

// Speak tutorial content
function speakTutorialContent() {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Cancel any ongoing speech
    
    const paragraphs = document.querySelectorAll('#tutorialContent p');
    
    paragraphs.forEach(paragraph => {
      const utterance = new SpeechSynthesisUtterance(paragraph.textContent);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    });
  }
}

// Start camera and detection
async function startCamera() {
  try {
    // Update status to loading
    updateCameraStatus('loading');
    
    // Stop any existing stream before starting a new one
    if (video.srcObject) {
      video.srcObject.getTracks().forEach(track => track.stop());
      video.srcObject = null;
    }

    // Use the selected camera
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: currentFacingMode },
      audio: false
    });

    video.srcObject = stream;
    video.style.display = 'block';
    canvas.style.display = 'block';
    document.querySelector('.video-container').style.display = 'block';

    // Wait for video to be ready
    await new Promise(resolve => {
      video.onloadedmetadata = () => {
        resolve();
      };
    });

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Initialize audio context
    initAudio();

    // Update UI
    isRunning = true;
    resultDiv.textContent = '';
    capturedImageElement.style.display = 'none';
    hideMovePrompt();
    
    // Update camera status to on
    updateCameraStatus('on');

    // Reset timers
    noObjectDetectedTime = null;
    if (movePromptTimeout) {
      clearTimeout(movePromptTimeout);
      movePromptTimeout = null;
    }

    // Start detection loop
    detectObjects();
  } catch (error) {
    console.error('Error starting camera:', error);
    updateCameraStatus('error', error.message);
  }
}

// Stop camera and detection
function stopCamera() {
  if (video.srcObject) {
    // Stop all video tracks
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;

    // Stop audio
    stopAudio();
    stopProcessingSound();

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Hide move prompt
    hideMovePrompt();

    // Clear any pending timeouts
    if (movePromptTimeout) {
      clearTimeout(movePromptTimeout);
      movePromptTimeout = null;
    }

    // Update UI
    isRunning = false;
    detectionInfo.textContent = '';
  }
}

// Camera rotate/toggle function
function rotateCamera() {
  if (currentFacingMode === 'user') {
    currentFacingMode = 'environment';
    rotateCameraBtn.textContent = 'Switch to Front Camera';
  } else {
    currentFacingMode = 'user';
    rotateCameraBtn.textContent = 'Switch to Back Camera';
  }
  if (isRunning) {
    startCamera(); // Restart camera with new facing mode immediately
  }
}

// Initialize audio context and oscillator
function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    oscillator = audioContext.createOscillator();
    gainNode = audioContext.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(0, audioContext.currentTime);

    gainNode.gain.setValueAtTime(0, audioContext.currentTime);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
  } catch (error) {
    console.error('Error initializing audio:', error);
  }
}

// Stop audio
function stopAudio() {
  if (oscillator) {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    setTimeout(() => {
      oscillator.stop();
      oscillator = null;
      gainNode = null;
      audioContext = null;
    }, 100);
  }
}

// Play model loaded chime
function playModelLoadedChime() {
  if (!enableSounds) return;

  const notes = [440, 554.37, 659.25]; // A4, C#5, E5
  const duration = 0.2;
  const gap = 0.1;

  const context = new (window.AudioContext || window.webkitAudioContext)();
  let currentTime = context.currentTime;

  notes.forEach((freq) => {
    const osc = context.createOscillator();
    const gain = context.createGain();

    osc.frequency.value = freq;
    osc.type = 'sine';

    osc.connect(gain);
    gain.connect(context.destination);

    gain.gain.setValueAtTime(0.5, currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, currentTime + duration);

    osc.start(currentTime);
    osc.stop(currentTime + duration);

    currentTime += duration + gap;
  });
}

// Model Loading Chime
let loadingChimeOscillator = null;
let loadingChimeGain = null;
let loadingChimeContext = null;

function startLoadingChime() {
  loadingChimeContext = new (window.AudioContext || window.webkitAudioContext)();
  loadingChimeOscillator = loadingChimeContext.createOscillator();
  loadingChimeGain = loadingChimeContext.createGain();

  loadingChimeOscillator.type = 'sine';
  loadingChimeOscillator.frequency.setValueAtTime(660, loadingChimeContext.currentTime); // E5
  loadingChimeGain.gain.setValueAtTime(0.2, loadingChimeContext.currentTime);

  loadingChimeOscillator.connect(loadingChimeGain);
  loadingChimeGain.connect(loadingChimeContext.destination);
  loadingChimeOscillator.start();
}

function stopLoadingChime() {
  if (loadingChimeOscillator) {
    loadingChimeOscillator.stop();
    loadingChimeOscillator.disconnect();
    loadingChimeGain.disconnect();
    loadingChimeContext.close();

    loadingChimeOscillator = null;
    loadingChimeGain = null;
    loadingChimeContext = null;
  }
}

// Hide move prompt
function hideMovePrompt() {
  movePromptActive = false;
  movePrompt.classList.remove('visible');

  if (movePromptInterval) {
    clearInterval(movePromptInterval);
    movePromptInterval = null;
  }
  
  window.speechSynthesis.cancel(); // Stop any current speech
  movePromptSpeaking = false;
}

// Main object detection loop
async function detectObjects() {
  if (!isRunning) return;

  try {
    // Perform object detection
    const predictions = await model.detect(video);

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Continue the detection loop
    requestAnimationFrame(detectObjects);
  } catch (error) {
    console.error('Error in object detection:', error);
    
    // Try to continue despite error
    setTimeout(() => {
      if (isRunning) requestAnimationFrame(detectObjects);
    }, 1000);
  }
}

// Initialize the app when the page loads
window.addEventListener('load', init);
