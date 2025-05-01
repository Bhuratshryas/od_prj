// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const rotateCameraBtn = document.getElementById('rotateCameraBtn'); // NEW
const statusMessage = document.getElementById('statusMessage');
const detectionInfo = document.getElementById('detectionInfo');
const movePrompt = document.getElementById('movePrompt');
const volumeControl = document.getElementById('volumeControl');
const minFreqInput = document.getElementById('minFreq');
const maxFreqInput = document.getElementById('maxFreq');
const beepToggle = document.getElementById('beepToggle');
const centerThresholdInput = document.getElementById('centerThreshold');
const captureDelayInput = document.getElementById('captureDelay');
const soundsToggle = document.getElementById('soundsToggle');
const stopAlertToggle = document.getElementById('stopAlertToggle');
const movePromptToggle = document.getElementById('movePromptToggle');
const movePromptDelayInput = document.getElementById('movePromptDelay');
const loadingContainer = document.getElementById('loading-container');
const loadingProgress = document.getElementById('loading-progress');
const capturedImageElement = document.getElementById('captured-image');
const resultDiv = document.getElementById('result');
const openBtn = document.getElementById('openSettingsBtn');
const closeBtn = document.getElementById('closeSettingsBtn');
const modal = document.getElementById('settingsModal');

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

// Camera state
let currentFacingMode = 'user'; // 'user' = front, 'environment' = back

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
    // Load COCO-SSD model
    statusMessage.textContent = 'Loading object detection model...';
    model = await cocoSsd.load();
    statusMessage.textContent = 'Model loaded. Ready to start.';

    // Set up event listeners
    startBtn.addEventListener('click', startCamera);
    stopBtn.addEventListener('click', stopCamera);
    rotateCameraBtn.addEventListener('click', rotateCamera); // NEW
    volumeControl.addEventListener('input', updateVolume);
    minFreqInput.addEventListener('change', updateFrequencyRange);
    maxFreqInput.addEventListener('change', updateFrequencyRange);
    beepToggle.addEventListener('change', toggleBeep);
    centerThresholdInput.addEventListener('change', updateCenterThreshold);
    captureDelayInput.addEventListener('change', updateCaptureDelay);
    soundsToggle.addEventListener('change', toggleSounds);
    stopAlertToggle.addEventListener('change', toggleStopAlert);
    movePromptToggle.addEventListener('change', toggleMovePrompt);
    movePromptDelayInput.addEventListener('change', updateMovePromptDelay);

    // Initialize settings
    volume = volumeControl.value;
    minFreq = parseInt(minFreqInput.value);
    maxFreq = parseInt(maxFreqInput.value);
    enableBeep = beepToggle.checked;
    centerThreshold = parseInt(centerThresholdInput.value);
    captureDelay = parseInt(captureDelayInput.value);
    enableSounds = soundsToggle.checked;
    enableStopAlert = stopAlertToggle.checked;
    enableMovePrompt = movePromptToggle.checked;
    movePromptDelay = parseInt(movePromptDelayInput.value);

    // Set audio volumes
    shutterSound.volume = 0.7;
    processingSound.volume = 0.3;
    completeSound.volume = 0.5;

    // Set initial button text
    rotateCameraBtn.textContent = 'Switch to Back Camera';
  } catch (error) {
    console.error('Error initializing app:', error);
    statusMessage.textContent = 'Error initializing: ' + error.message;
  }
}

// Start camera and detection
async function startCamera() {
  try {
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
    statusMessage.textContent = 'Camera active, detecting objects...';
    resultDiv.textContent = '';
    capturedImageElement.style.display = 'none';
    hideMovePrompt();

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
    statusMessage.textContent = 'Error accessing camera: ' + error.message;
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
    statusMessage.textContent = 'Camera inactive';
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
    startCamera(); // Restart camera with new facing mode
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
    statusMessage.textContent += ' (Audio error: ' + error.message + ')';
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

    // Speak the prompt if sounds are enabled
    if (enableSounds && !movePromptSpeaking) {
      movePromptSpeaking = true;
      const utterance = new SpeechSynthesisUtterance("Keep moving the object");
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 0.9;

      utterance.onend = () => {
        movePromptSpeaking = false;
      };

      window.speechSynthesis.speak(utterance);
    }
  }
}

// Hide move prompt
function hideMovePrompt() {
  movePromptActive = false;
  movePrompt.classList.remove('visible');
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
    statusMessage.textContent = 'Detection error: ' + error.message;

    // Try to continue despite error
    setTimeout(() => {
      if (isRunning) requestAnimationFrame(detectObjects);
    }, 1000);
  }
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

// Update volume setting
function updateVolume() {
  volume = parseFloat(volumeControl.value);
  if (gainNode && enableBeep && !isCapturing && !isSpeaking && !isPreCapturing) {
    gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
  }
}

// Update frequency range settings
function updateFrequencyRange() {
  minFreq = parseInt(minFreqInput.value);
  maxFreq = parseInt(maxFreqInput.value);
  // Validate that max > min
  if (minFreq >= maxFreq) {
    maxFreq = minFreq + 100;
    maxFreqInput.value = maxFreq;
  }
}

// Toggle beep on/off
function toggleBeep() {
  enableBeep = beepToggle.checked;
  if (gainNode) {
    if (enableBeep && !isCapturing && !isSpeaking && !isPreCapturing) {
      gainNode.gain.setValueAtTime(volume, audioContext.currentTime);
    } else {
      gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    }
  }
}

// Toggle sounds on/off
function toggleSounds() {
  enableSounds = soundsToggle.checked;
}

// Toggle stop alert on/off
function toggleStopAlert() {
  enableStopAlert = stopAlertToggle.checked;
}

// Toggle move prompt on/off
function toggleMovePrompt() {
  enableMovePrompt = movePromptToggle.checked;
  if (!enableMovePrompt) {
    hideMovePrompt();
    if (movePromptTimeout) {
      clearTimeout(movePromptTimeout);
      movePromptTimeout = null;
    }
  }
}

// Update center threshold setting
function updateCenterThreshold() {
  centerThreshold = parseInt(centerThresholdInput.value);
  // Validate range
  if (centerThreshold < 50) {
    centerThreshold = 50;
    centerThresholdInput.value = centerThreshold;
  } else if (centerThreshold > 100) {
    centerThreshold = 100;
    centerThresholdInput.value = centerThreshold;
  }
}

// Update capture delay setting
function updateCaptureDelay() {
  captureDelay = parseInt(captureDelayInput.value);
  // Validate range
  if (captureDelay < 500) {
    captureDelay = 500;
    captureDelayInput.value = captureDelay;
  }
}

// Update move prompt delay setting
function updateMovePromptDelay() {
  movePromptDelay = parseInt(movePromptDelayInput.value);
  // Validate range
  if (movePromptDelay < 500) {
    movePromptDelay = 500;
    movePromptDelayInput.value = movePromptDelay;
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
  loadingContainer.style.display = 'block';

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
  capturedImageElement.src = canvas.toDataURL('image/jpeg');
  capturedImageElement.style.display = 'block';

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

      setTimeout(() => {
        loadingContainer.style.display = 'none';

        // Play complete sound
        playCompleteSound();

        // Wait for complete sound to finish before speaking
        setTimeout(async () => {
          // Display result
          resultDiv.textContent = data.description;

          // Check if the response is "unknown" or similar
          const isUnknown = data.description.toLowerCase() === "unknown" ||
                            data.description.toLowerCase() === "unclear" ||
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
              isSpeaking = false;
              isCapturing = false;
              isPreCapturing = false;
              noObjectDetectedTime = null; // Reset no object timer
            };

            window.speechSynthesis.speak(utterance);
          }
        }, 1000);
      }, 500);
    })
    .catch(error => {
      clearInterval(loadingInterval);
      loadingContainer.style.display = 'none';
      stopProcessingSound();
      console.error('Error:', error);
      resultDiv.textContent = 'Error processing image';
      isCapturing = false;
      isSpeaking = false;
      isPreCapturing = false;
      noObjectDetectedTime = null; // Reset no object timer
    });
  }, 'image/jpeg');
}

// Initialize the app when the page loads
window.addEventListener('load', init);

// --- Tutorial Button and TTS Panel Logic ---

window.addEventListener('DOMContentLoaded', function() {
  const tutorialToggle = document.getElementById('tutorial-toggle');
  const tutorialPanel = document.getElementById('tutorial-panel');
  const playTutorialBtn = document.getElementById('play-tutorial');
  const tutorialText = document.getElementById('tutorialText');

  // The text to be spoken
  const tutorialSpeechText = `
    Let's try identifying an object with front facing camera.
  `;

  const tutorialSpeechText2 = `
    Place your phone face up on the table in front of you.
   `;

  const tutorialSpeechText3 = `
   Hold your ingredient above the camera and move it around slowly with the beeping sound until you hear the word "stop." That's it, its that simple!
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
            
            speechSynthesis.speak(utterance);
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
      modal.classList.add('active');
      modal.focus();
    });
  
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('active');
    });
  
    // Close modal on ESC key
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        modal.classList.remove('active');
      }
    });
  
    // Optional: close modal when clicking outside content
    modal.addEventListener('mousedown', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });