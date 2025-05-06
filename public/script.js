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
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');

// Settings Modal Elements
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const settingsModal = document.getElementById('settingsModal');

// Tutorial Modal Elements
const openTutorialBtn = document.getElementById('openTutorialBtn');
const closeTutorialBtn = document.getElementById('closeTutorialBtn');
const tutorialModal = document.getElementById('tutorialModal');

// Settings checkboxes
const namePromptCheckbox = document.getElementById('name_prompt');
const expirationRangeCheckbox = document.getElementById('expiration_range');
const brandNameCheckbox = document.getElementById('brand_name');
const moldDetectionCheckbox = document.getElementById('mold_detection');
const quickRecipeCheckbox = document.getElementById('quick_recipe');

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
let movePromptCount = 0;
let cameraPausedDueToInactivity = false;


// Camera state
let currentFacingMode = 'environment'; // 'user' = front, 'environment' = back

// Settings
let volume = 0.5;
let minFreq = 200;
let maxFreq = 2000;
let enableBeep = true;
let centerThreshold = 90;
let captureDelay = 1000;
let movePromptDelay = 2000;

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

    // // Start camera immediately
    // setTimeout(() => {
    //   startCamera();
    // }, 1000);

    // Set initial button text
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    rotateCameraBtn.textContent = 'Front Camera';
    
    // Set up event listeners for settings modal
    openSettingsBtn.addEventListener('click', () => {
      stopCamera();
      updateCameraStatus('off');
      settingsModal.classList.add('active');
    });
    
    closeSettingsBtn.addEventListener('click', async () => {
      // Save settings to server
      await saveSettings();
      settingsModal.classList.remove('active');
      setTimeout(() => {
        startCamera();
      }, 1000);
    });
    
    // Set up event listeners for tutorial modal
    openTutorialBtn.addEventListener('click', () => {
      stopCamera();
      updateCameraStatus('off');
      tutorialModal.classList.add('active');
      //speakTutorialContent();
    });

    
    closeTutorialBtn.addEventListener('click', () => {
      tutorialModal.classList.remove('active');
      window.speechSynthesis.cancel(); // Stop any ongoing speech
      setTimeout(() => {
        startCamera();
      }, 1000);
    });
    
    // Close modals with ESC key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (settingsModal.classList.contains('active')) {
          saveSettings().then(() => {
            settingsModal.classList.remove('active');
            setTimeout(() => {
              startCamera();
            }, 1000);
          });
        }
        if (tutorialModal.classList.contains('active')) {
          tutorialModal.classList.remove('active');
          window.speechSynthesis.cancel();
          setTimeout(() => {
            startCamera();
          }, 1000);
        }
      }
    });
    
    // Close modals when clicking outside
    settingsModal.addEventListener('mousedown', (e) => {
      if (e.target === settingsModal) {
        saveSettings().then(() => {
          settingsModal.classList.remove('active');
          setTimeout(() => {
            startCamera();
          }, 1000);
        });
      }
    });
    
    tutorialModal.addEventListener('mousedown', (e) => {
      if (e.target === tutorialModal) {
        tutorialModal.classList.remove('active');
        window.speechSynthesis.cancel();
        setTimeout(() => {
          startCamera();
        }, 1000);
      }
    });
    
    // Camera rotation button
    rotateCameraBtn.addEventListener('click', rotateCamera);
    
  } catch (error) {
    console.error('Error initializing app:', error);
    updateCameraStatus('error', error.message);
  }
}

// Save settings to server
async function saveSettings() {
  try {
    const settings = {
      name_prompt: namePromptCheckbox.checked,
      expiration_range: expirationRangeCheckbox.checked,
      longer_descrip: longerDescripCheckbox.checked,
      brand_name: brandNameCheckbox.checked
    };

    const response = await fetch('/save-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });

    if (!response.ok) {
      throw new Error('Failed to save settings');
    }

    return await response.json();
  } catch (error) {
    console.error('Error saving settings:', error);
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
    const utterance = new SpeechSynthesisUtterance("Welcome to Ident AI.");
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
    //video.style.display = 'block';
    //canvas.style.display = 'block';
    //document.querySelector('.video-container').style.display = 'block';

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
    startBtn.disabled = true;
    stopBtn.disabled = false;
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
    startBtn.disabled = false;
    stopBtn.disabled = true;
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

// Play shutter sound
function playShutterSound() {
  if (enableSounds) {
    shutterSound.currentTime = 0;
    shutterSound.play().catch(err => console.error('Error playing shutter sound:', err));
  }
}

// Start processing sound
function startProcessingSound() {
  if (enableSounds) {
    processingSound.currentTime = 0;
    processingSound.play().catch(err => console.error('Error playing processing sound:', err));
  }
}

// Stop processing sound
function stopProcessingSound() {
  processingSound.pause();
  processingSound.currentTime = 0;
}

// Play complete sound
function playCompleteSound() {
  if (enableSounds) {
    completeSound.currentTime = 0;
    completeSound.play().catch(err => console.error('Error playing complete sound:', err));
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

// Play stop alert using text-to-speech
function playStopAlert() {
  if (enableSounds && enableStopAlert) {
    // Stop beeping
    if (gainNode) {
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    }

    // Use text-to-speech for the stop alert
    const utterance = new SpeechSynthesisUtterance("Stop");
    utterance.rate = 1.2;
    utterance.pitch = 1.2;
    utterance.volume = 1.0;

    // Return a promise that resolves when speech is done
    return new Promise((resolve) => {
      utterance.onend = resolve;
      window.speechSynthesis.speak(utterance);
    });
  } else {
    // If sounds are disabled, resolve immediately
    return Promise.resolve();
  }
}

// Play rotate object prompt using text-to-speech
function playRotateObjectPrompt() {
  if (enableSounds) {
    // Use text-to-speech for the rotate prompt
    const utterance = new SpeechSynthesisUtterance("Please rotate the object");
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    // Return a promise that resolves when speech is done
    return new Promise((resolve) => {
      utterance.onend = resolve;
      window.speechSynthesis.speak(utterance);
    });
  } else {
    // If sounds are disabled, resolve immediately
    return Promise.resolve();
  }
}

// Show move prompt
function showMovePrompt() {
  if (!movePromptActive && enableMovePrompt && !isCapturing && !isSpeaking && !isPreCapturing) {
    movePromptActive = true;
    movePrompt.classList.add('visible');

    const speakPrompt = () => {
      if (!enableSounds || movePromptSpeaking || cameraPausedDueToInactivity) return;

      movePromptSpeaking = true;
      const utterance = new SpeechSynthesisUtterance("Keep moving the object");
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      utterance.onend = () => {
        movePromptSpeaking = false;
        movePromptCount++;

        if (movePromptCount >= 3) {
          pauseCameraDueToInactivity();
        }
      };

      window.speechSynthesis.speak(utterance);
    };

    speakPrompt(); // speak immediately
    movePromptInterval = setInterval(speakPrompt, 5000);
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

function pauseCameraDueToInactivity() {
  cameraPausedDueToInactivity = true;
  stopCamera();
  movePrompt.textContent = "Scanning paused, move object to continue.";
  movePrompt.classList.add('visible');
}


// Draw bounding box and label for detected object
function drawBoundingBox(prediction) {
  const [x, y, width, height] = prediction.bbox;
  const text = `${prediction.class} ${Math.round(prediction.score * 100)}%`;

  // Draw bounding box
  ctx.strokeStyle = '#00FFFF';
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, width, height);

  // Draw background for text
  ctx.fillStyle = '#00FFFF';
  const textWidth = ctx.measureText(text).width;
  ctx.fillRect(x, y - 25, textWidth + 10, 25);

  // Draw text
  ctx.fillStyle = '#000000';
  ctx.font = '18px Arial';
  ctx.fillText(text, x + 5, y - 7);

  // Draw center lines
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 1;

  // Vertical center line of the object
  const centerX = x + width / 2;
  ctx.beginPath();
  ctx.moveTo(centerX, 0);
  ctx.lineTo(centerX, canvas.height);
  ctx.stroke();

  // Vertical center line of the canvas
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
  const videoCenterX = canvas.width / 2;
  ctx.beginPath();
  ctx.moveTo(videoCenterX, 0);
  ctx.lineTo(videoCenterX, canvas.height);
  ctx.stroke();
}

// Update beep frequency based on object position
function updateBeepFrequency(centeredness) {
  if (!enableBeep || !gainNode || isCapturing || isSpeaking || isPreCapturing) return;
  
  // Map centeredness to frequency range
  const frequency = minFreq + centeredness * (maxFreq - minFreq);

  // Update oscillator frequency
  if (oscillator) {
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
  }

  // Set volume based on whether object is detected
  gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
}

// Main object detection loop
async function detectObjects() {
  if (!isRunning) return;

  try {
    // Perform object detection
    const predictions = await model.detect(video);

    // Clear previous drawings
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Check if we have objects and we're not in a special state
    if (predictions.length > 0 && !isCapturing && !isSpeaking && !isPreCapturing) {
      // Reset no object detected time
      noObjectDetectedTime = null;

      // Clear any pending move prompt
      if (movePromptTimeout) {
        clearTimeout(movePromptTimeout);
        movePromptTimeout = null;
      }

      // Hide move prompt if it's showing
      if (movePromptActive) {
        hideMovePrompt();
      }

      // Sort by bounding box size (largest first)
      predictions.sort((a, b) => {
        const areaA = a.bbox[2] * a.bbox[3];
        const areaB = b.bbox[2] * b.bbox[3];
        return areaB - areaA;
      });

      // Take the largest object
      const largestObject = predictions[0];

      // Draw bounding box
      drawBoundingBox(largestObject);

      // Calculate how centered the object is
      const objectCenterX = largestObject.bbox[0] + largestObject.bbox[2] / 2;
      const videoCenterX = canvas.width / 2;

      // Calculate distance from center (normalized from 0 to 1)
      const distanceFromCenter = Math.abs(objectCenterX - videoCenterX) / (canvas.width / 2);

      // Invert so that 1 means centered and 0 means at edge
      const centeredness = 1 - distanceFromCenter;

      // Update beep frequency based on centeredness
      updateBeepFrequency(centeredness);

      // Update info display
      detectionInfo.textContent = `Detected: ${largestObject.class} (${Math.round(largestObject.score * 100)}% confidence)
                                  Centeredness: ${Math.round(centeredness * 100)}%`;

      // Check if object is centered enough and if enough time has passed since last capture
      const currentTime = Date.now();
      const isCentered = centeredness * 100 >= centerThreshold;
      const timeElapsed = currentTime - lastCaptureTime >= captureDelay;

      if (isCentered && timeElapsed && !isCapturing) {
        // Set pre-capturing state to stop beeping
        isPreCapturing = true;

        // Play stop alert and wait for it to finish
        await playStopAlert();

        // Proceed with capture
        captureImage();
      }
    } else if (!isCapturing && !isSpeaking && !isPreCapturing) {
      // No objects detected or processing is happening
      if (gainNode) {
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
      }

      detectionInfo.textContent = 'No objects detected';

      // Start tracking time with no objects
      if (noObjectDetectedTime === null) {
        noObjectDetectedTime = Date.now();

        // Set timeout for move prompt
        if (!movePromptTimeout && enableMovePrompt) {
          movePromptTimeout = setTimeout(() => {
            showMovePrompt();
          }, movePromptDelay);
        }
      } else {
        // Check if we've passed the delay threshold
        const currentTime = Date.now();
        if (currentTime - noObjectDetectedTime >= movePromptDelay && !movePromptActive && !movePromptTimeout) {
          showMovePrompt();
        }
      }
    }

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

// Capture image when object is centered
function captureImage() {
  isCapturing = true;
  lastCaptureTime = Date.now();
  
  // Stop beeping during capture and analysis (already stopped by pre-capture)
  if (gainNode) {
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  }

  // Hide move prompt if it's showing
  if (movePromptActive) {
    hideMovePrompt();
  }

  // Clear any pending move prompt
  if (movePromptTimeout) {
    clearTimeout(movePromptTimeout);
    movePromptTimeout = null;
  }

  // Play shutter sound
  playShutterSound();

  // Clear previous result
  resultDiv.textContent = '';

  // Show loading bar
  //loadingContainer.style.display = 'block';
  //loadingProgress.style.display = 'block';
  //document.querySelector('.loading-bar').style.display = 'block';

  // Animate loading bar
  let progress = 0;
  const loadingInterval = setInterval(() => {
    progress += 5;
    if (progress > 95) {
      clearInterval(loadingInterval);
    }
    loadingProgress.style.width = `${progress}%`;
  }, 150);

  // Capture image
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

  // Display captured image
  //capturedImageElement.src = canvas.toDataURL('image/jpeg');
  //capturedImageElement.style.display = 'block';

  // Start processing sound
  setTimeout(() => {
    startProcessingSound();
  }, 500); // Start processing sound after shutter sound

  // Send image to server for processing
  canvas.toBlob(blob => {
    const formData = new FormData();
    formData.append('image', blob, 'captured-image.jpg');

    fetch('/process-image', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      // Clear loading interval and hide loading bar
      clearInterval(loadingInterval);
      loadingProgress.style.width = '100%';

      // Stop processing sound
      stopProcessingSound();

      // Stop camera before showing alert
      // stopCamera();

      setTimeout(() => {
        loadingContainer.style.display = 'none';
        loadingProgress.style.display = 'none';
        document.querySelector('.loading-bar').style.display = 'none';

        // Play complete sound
        playCompleteSound();

        // Wait for complete sound to finish before speaking
        setTimeout(async () => {
          // Display result
          //window.alert(data.description);
          window.alert(data.description);

          // After user clicks OK on the alert, explicitly restart the camera
          // startCamera().then(() => {
          // console.log('Camera successfully restarted after alert');
          // }).catch(err => {
          //  console.error('Failed to restart camera after alert:', err);
          // // Try again if first attempt fails
          // setTimeout(() => startCamera(), 500);
          // });

          // Reset states
          isCapturing = false;
          isSpeaking = false;
          isPreCapturing = false;
          noObjectDetectedTime = null;

          // Also update the result div for reference
          resultDiv.textContent = data.description;

          // Check if the response is "unknown" or similar
          const isUnknown = data.description.toLowerCase() === "unknown" ||
                            data.description.toLowerCase() === "unclear" ||
                            data.description.toLowerCase() === "try again" ||
                            data.description.toLowerCase() === "unidentified";
          isSpeaking = true;

          if (isUnknown) {
            // First speak the unknown result
            const unknownUtterance = new SpeechSynthesisUtterance(data.description);
            unknownUtterance.rate = 1.0;
            unknownUtterance.pitch = 1.0;

            // Wait for the unknown utterance to finish
            await new Promise((resolve) => {
              unknownUtterance.onend = resolve;
              window.speechSynthesis.speak(unknownUtterance);
            });

            // Then prompt to rotate the object
            await playRotateObjectPrompt();

            // When all speech ends, resume normal operation
            isSpeaking = false;
            isCapturing = false;
            isPreCapturing = false;
            noObjectDetectedTime = null; // Reset no object timer
          } else {
            // Normal case - just speak the result
            const utterance = new SpeechSynthesisUtterance(data.description);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;

            // When speech ends, resume normal operation
            utterance.onend = () => {
              setTimeout(() => {
                isSpeaking = false;
                isCapturing = false;
                isPreCapturing = false;
                noObjectDetectedTime = null; // Reset no object timer
              }, 2000); // 2 second pause before resuming detection
            };
            
            window.speechSynthesis.speak(utterance);
          }
        }, 1000);
      }, 500);
    })
    .catch(error => {
      clearInterval(loadingInterval);
      loadingContainer.style.display = 'none';
      loadingProgress.style.display = 'none';
      document.querySelector('.loading-bar').style.display = 'none';
      stopProcessingSound();
      console.error('Error:', error);

      // Show error in alert
      stopCamera();
      window.alert('Error processing image');
      startCamera();
      
      // Reset states
      resultDiv.textContent = 'Error processing image';
      isCapturing = false;
      isSpeaking = false;
      isPreCapturing = false;
      noObjectDetectedTime = null; // Reset no object timer
    });
  }, 'image/jpeg');
}

// Initialize the app when the page loads
window.addEventListener('load', () => {
  setTimeout(() => {
    playModelLoadedChime();
    init();
  }, 1000); // 5 seconds
});



// --- Tutorial Button and TTS Panel Logic ---

window.addEventListener('DOMContentLoaded', function() {
  const tutorialToggle = document.getElementById('tutorial-toggle');
  const tutorialPanel = document.getElementById('tutorial-panel');
  const playTutorialBtn = document.getElementById('play-tutorial');
  const tutorialText = document.getElementById('tutorialText');

  // The text to be spoken
  const tutorialSpeechText = `
    To practice, you need to place your phone face up on the table in front of you. You can then move your hand above the camera with the beeping sound until you hear the word "stop."
  `;

  const tutorialSpeechText2 = `
    That's it, its that simple! You can also try with an ingredient after your practice for sometime. 
   `;

  const tutorialSpeechText3 = `
   Now press the start button to activate the camera. Press stop after you are done to deactivate the camera.
  `;

  // Toggle the tutorial panel
  if (tutorialToggle && tutorialPanel) {
    tutorialToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      const isOpen = tutorialPanel.style.display === 'block';
      tutorialPanel.style.display = isOpen ? 'none' : 'block';
      tutorialToggle.setAttribute('aria-label', isOpen ? 'Open tutorial' : 'Close tutorial');
      tutorialPanel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    });
  }

  // Play the tutorial using TTS
  if (playTutorialBtn) {
    playTutorialBtn.addEventListener('click', function() {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        
        // Array of speech texts with their delays
        const speechQueue = [
          { text: tutorialSpeechText, delay: 1500 },
          { text: tutorialSpeechText2, delay: 1500 },
          { text: tutorialSpeechText3, delay: 1500 }
        ];
        
        let currentIndex = 0;
        
        function processQueue() {
          if (currentIndex >= speechQueue.length) return;
          
          const item = speechQueue[currentIndex];
          currentIndex++;
          
          setTimeout(() => {
            const utterance = new SpeechSynthesisUtterance(item.text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            
            // Start next speech when current one ends
            utterance.onend = () => {
              if (currentIndex < speechQueue.length) {
                processQueue();
              }
            };
            //stopcamera();
            //speechSynthesis.speak(utterance);
          }, item.delay);
        }
        
        processQueue();
        
      } else {
        alert('Sorry, your browser does not support text-to-speech.');
      }
    });
  }
  

  // Hide panel if clicking outside
  document.addEventListener('click', function(e) {
    if (tutorialPanel && tutorialToggle &&
        !tutorialPanel.contains(e.target) &&
        !tutorialToggle.contains(e.target)) {
      tutorialPanel.style.display = 'none';
      tutorialToggle.setAttribute('aria-label', 'Open tutorial');
      tutorialPanel.setAttribute('aria-hidden', 'true');
    }
  });
});

openBtn.addEventListener('click', () => {
  stopCamera(); // Stop the camera when settings open
  window.speechSynthesis.cancel(); // Stop any speech
  modal.classList.add('active');
  modal.focus();
});

closeBtn.addEventListener('click', () => {
  modal.classList.remove('active');
  setTimeout(() => {
    startCamera();
  }, 1000); // 1-second delay, Restart the camera when settings close
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    modal.classList.remove('active');
    setTimeout(() => {
      startCamera();
    }, 1000); // 1-second delay, Restart the camera when settings close via ESC
  }
});

modal.addEventListener('mousedown', (e) => {
  if (e.target === modal) {
    modal.classList.remove('active');
    setTimeout(() => {
      startCamera();
    }, 1000); // 1-second delay, Restart the camera when settings close by clicking outside
  }
});
window.addEventListener('load', init);

