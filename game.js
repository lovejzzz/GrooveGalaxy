class DrumMachine {
    constructor() {
        this.audioContext = null;
        this.sounds = [];
        this.isInitialized = false;
        this.soundOrder = [0, 1, 2]; // Maps row index to sound index (bass, snare, hi-hat)
    }

    async init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const soundFiles = ['bassdrum.wav', 'snare.wav', 'hi-hat.wav'];
        
        try {
            this.sounds = await Promise.all(
                soundFiles.map(file => 
                    fetch(`DrumAudio/${file}`)
                        .then(response => response.arrayBuffer())
                        .then(buffer => this.audioContext.decodeAudioData(buffer))
                        .catch(err => {
                            console.warn(`Failed to load ${file}:`, err);
                            return null;
                        })
                )
            );

            this.isInitialized = true;
        } catch (error) {
            console.error('Error loading sounds:', error);
        }
    }

    playSound(index) {
        if (!this.isInitialized) return;
        const buffer = this.sounds[this.soundOrder[index]];
        if (!buffer) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        source.start();
    }
}

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        // Add roundRect polyfill for compatibility
        if (!this.ctx.roundRect) {
            this.ctx.roundRect = function(x, y, width, height, radius) {
                this.beginPath();
                this.moveTo(x + radius, y);
                this.lineTo(x + width - radius, y);
                this.arcTo(x + width, y, x + width, y + radius, radius);
                this.lineTo(x + width, y + height - radius);
                this.arcTo(x + width, y + height, x + width - radius, y + height, radius);
                this.lineTo(x + radius, y + height);
                this.arcTo(x, y + height, x, y + height - radius, radius);
                this.lineTo(x, y + radius);
                this.arcTo(x, y, x + radius, y, radius);
                this.closePath();
            };
        }
        
        // AI settings
        this.lastShotTime = 0;
        this.shotDelay = 900;
        this.aiAccuracy = 0.6;
        this.aiActive = false;
        
        this.defender = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 50,
            width: 40,
            height: 30,
            speed: 5,
        };
        
        this.gridCols = 16;
        this.gridRows = 3;
        this.cellWidth = this.canvas.width / this.gridCols;
        this.cellHeight = 40;
        this.gridYOffset = 100;
        
        // Score system
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.onBeatBonus = 100;
        this.normalHitScore = 10;
        
        // Visual beat feedback
        this.beatFlash = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(0));
        this.stepPulse = 0;
        
        // NEW: Instrument colors
        this.instrumentColors = [
            { primary: '#ff4400', secondary: '#ff6600', name: 'Bass' },      // Red/orange
            { primary: '#00aaff', secondary: '#ffffff', name: 'Snare' },     // Blue/white
            { primary: '#cc00ff', secondary: '#ff00cc', name: 'Hi-hat' }     // Purple/magenta
        ];
        
        // NEW: Screen shake system
        this.shake = { x: 0, y: 0, intensity: 0, decay: 0.85 };
        
        // NEW: Freeze frame system
        this.freezeFrames = 0;
        
        // NEW: Debris system
        this.debris = [];
        this.maxDebris = 100;
        
        // NEW: Starfield
        this.stars = [];
        this.initStarfield();
        
        // NEW: Intensity tracking for chaos
        this.intensity = 0;
        
        // NEW: Kill text popups
        this.popups = [];
        
        // Particles for sound visualization
        this.particles = [];
        
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
        this.aliens = [];
        this.bullets = [];
        this.explosions = [];
        this.currentStep = 0;
        this.lastStepTime = 0;
        this.bpm = 120;
        this.stepInterval = (60 / this.bpm) * 1000 / 4;
        
        this.gameOver = false;
        this.isPaused = false;
        this.isStarted = false;
        this.controlButton = document.getElementById('controlButton');
        
        this.drumMachine = new DrumMachine();
        this.bpmControl = document.getElementById('bpm-control');
        this.bpmValue = document.getElementById('bpm-value');
        
        // Mobile support
        this.touchControls = {
            left: false,
            right: false
        };
        
        // Setup event listeners (called once in constructor)
        this.setupEventListeners();
        this.setupMobileControls();
    }

    // NEW: Initialize starfield
    initStarfield() {
        for (let i = 0; i < 100; i++) {
            this.stars.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 2 + 0.5,
                speed: Math.random() * 0.5 + 0.2,
                brightness: Math.random() * 0.5 + 0.5,
                pulse: 0
            });
        }
    }

    setupMobileControls() {
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const btnShoot = document.getElementById('btn-shoot');
        
        if (!btnLeft) return;
        
        btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchControls.left = true; });
        btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); this.touchControls.left = false; });
        btnLeft.addEventListener('touchcancel', () => { this.touchControls.left = false; });
        
        btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchControls.right = true; });
        btnRight.addEventListener('touchend', (e) => { e.preventDefault(); this.touchControls.right = false; });
        btnRight.addEventListener('touchcancel', () => { this.touchControls.right = false; });
        
        btnShoot.addEventListener('touchstart', (e) => { e.preventDefault(); this.shoot(); });
    }

    setupEventListeners() {
        // Setup BPM control
        this.bpmControl.addEventListener('input', () => {
            const newBpm = parseInt(this.bpmControl.value);
            this.bpm = newBpm;
            this.bpmValue.textContent = newBpm;
            this.stepInterval = (60 / this.bpm) * 1000 / 4;
            
            const speedScale = 1 + ((this.bpm - 60) / (200 - 60)) * 1.5;
            this.defender.speed = Math.round(5 * speedScale);
        });

        // Initialize control button
        this.controlButton.onclick = async () => {
            if (!this.isStarted) {
                try {
                    await this.drumMachine.init();
                } catch (e) {
                    console.warn('Audio init failed (CORS?), continuing without sound:', e);
                }
                this.isStarted = true;
                this.animate();
                this.controlButton.textContent = 'Pause';
                
                const titleImage = document.querySelector('.title-image');
                titleImage.classList.add('shine');
                setTimeout(() => {
                    titleImage.classList.remove('shine');
                }, 2500);
            } else {
                this.togglePause();
            }
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !this.isPaused) {
                this.shoot();
            } else if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
            } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
                this.moveDefender(-1);
            } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
                this.moveDefender(1);
            }
        });

        // Canvas click for grid editing
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const canvasX = (x * scaleX);
            const canvasY = (y * scaleY);
            
            const col = Math.floor(canvasX / this.cellWidth);
            const clickedRow = Math.floor((canvasY - this.gridYOffset) / this.cellHeight);
            
            if (canvasY >= this.gridYOffset && 
                canvasY <= this.gridYOffset + this.gridRows * this.cellHeight && 
                col >= 0 && col < this.gridCols &&
                clickedRow >= 0 && clickedRow < this.gridRows) {
                
                if (this.grid[clickedRow][col]) {
                    this.grid[clickedRow][col] = false;
                    this.aliens = this.aliens.filter(alien => 
                        !(alien.row === clickedRow && alien.col === col));
                } else {
                    this.grid[clickedRow][col] = true;
                    this.aliens.push({
                        row: clickedRow,
                        col,
                        x: col * this.cellWidth + this.cellWidth / 2,
                        y: clickedRow * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                        alive: true
                    });
                    
                    if (!this.aiActive && this.isStarted) {
                        this.aiActive = true;
                    }
                }
            }
        });

        // Preset pattern buttons
        this.setupPresetButtons();
    }

    setupPresetButtons() {
        const presets = {
            rock: [
                [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],  // Bass
                [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],  // Snare
                [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]   // Hi-hat
            ],
            funk: [
                [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],  // Bass
                [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],  // Snare
                [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0]   // Hi-hat
            ],
            jazz: [
                [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],  // Bass
                [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],  // Snare
                [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]   // Hi-hat (swing)
            ],
            hiphop: [
                [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],  // Bass
                [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],  // Snare
                [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]   // Hi-hat
            ]
        };

        const presetsContainer = document.createElement('div');
        presetsContainer.className = 'presets-wrapper';
        presetsContainer.innerHTML = `
            <div class="presets-grid">
                <button id="preset-rock">Rock</button>
                <button id="preset-funk">Funk</button>
                <button id="preset-jazz">Jazz</button>
                <button id="preset-hiphop">Hip-Hop</button>
                <button id="preset-clear">Clear</button>
            </div>
        `;
        
        document.querySelector('.controls-container').appendChild(presetsContainer);
        
        // Add listeners for preset buttons
        Object.keys(presets).forEach(preset => {
            document.getElementById(`preset-${preset}`).addEventListener('click', () => {
                this.loadPreset(presets[preset]);
            });
        });
        
        document.getElementById('preset-clear').addEventListener('click', () => {
            this.clearGrid();
        });
    }

    loadPreset(pattern) {
        this.clearGrid();
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (pattern[row][col] === 1) {
                    this.grid[row][col] = true;
                    this.aliens.push({
                        row,
                        col,
                        x: col * this.cellWidth + this.cellWidth / 2,
                        y: row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                        alive: true
                    });
                }
            }
        }
        
        if (!this.aiActive && this.isStarted) {
            this.aiActive = true;
        }
    }

    clearGrid() {
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
        this.aliens = [];
        this.aiActive = false;
    }

    moveDefender(direction) {
        const newX = this.defender.x + direction * this.defender.speed;
        if (newX >= 0 && newX <= this.canvas.width - this.defender.width) {
            this.defender.x = newX;
        }
    }

    updateAI() {
        if (!this.aiActive || this.isPaused) return;

        let nearestAlien = null;
        let minDistance = Infinity;

        for (const alien of this.aliens) {
            if (!alien.alive) continue;
            const distance = Math.abs(alien.x - (this.defender.x + this.defender.width / 2));
            if (distance < minDistance) {
                minDistance = distance;
                nearestAlien = alien;
            }
        }

        if (nearestAlien) {
            const defenderCenter = this.defender.x + this.defender.width / 2;
            const direction = nearestAlien.x > defenderCenter ? 1 : -1;
            
            // Only move if not already close enough
            if (Math.abs(nearestAlien.x - defenderCenter) > 10) {
                this.moveDefender(direction);
            }

            const currentTime = Date.now();
            if (currentTime - this.lastShotTime >= this.shotDelay) {
                // Miss sometimes based on accuracy
                if (Math.random() < this.aiAccuracy) {
                    this.shoot();
                }
                this.lastShotTime = currentTime;
            }
        }
    }

    shoot() {
        this.bullets.push({
            x: this.defender.x + this.defender.width / 2,
            y: this.defender.y,
            width: 4,
            height: 10,
            speed: 10,
            trail: [] // NEW: Bullet trail
        });
    }

    togglePause() {
        if (this.isStarted) {
            this.isPaused = !this.isPaused;
            this.controlButton.textContent = this.isPaused ? 'Resume' : 'Pause';
            
            if (this.isPaused) {
                this.drumMachine.audioContext.suspend();
            } else {
                this.drumMachine.audioContext.resume();
            }
        }
    }

    // NEW: Add screen shake
    addShake(intensity) {
        this.shake.intensity += intensity;
    }

    // NEW: Trigger freeze frame
    freezeFrame(frames = 3) {
        this.freezeFrames = frames;
    }

    // NEW: Create debris when alien dies
    createDebris(x, y, row) {
        const colors = this.instrumentColors[row];
        const numFragments = 10;
        
        for (let i = 0; i < numFragments; i++) {
            if (this.debris.length >= this.maxDebris) break;
            
            const angle = (Math.PI * 2 * i) / numFragments + (Math.random() - 0.5) * 0.5;
            const speed = Math.random() * 5 + 3;
            
            this.debris.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                rotation: Math.random() * Math.PI * 2,
                rotationSpeed: (Math.random() - 0.5) * 0.3,
                size: Math.random() * 6 + 4,
                color: Math.random() > 0.5 ? colors.primary : colors.secondary,
                life: 1.0,
                bounced: false
            });
        }
    }

    // NEW: Create floating text popup
    createPopup(x, y, text, isOnBeat) {
        this.popups.push({
            x, y,
            text,
            life: 60,
            vy: -1.5,
            color: isOnBeat ? '#ffff00' : '#00ff00',
            scale: isOnBeat ? 1.5 : 1.0
        });
    }

    update() {
        if (this.isPaused) return;

        // NEW: Freeze frame handling
        if (this.freezeFrames > 0) {
            this.freezeFrames--;
            return; // Skip update during freeze
        }

        // Handle mobile touch controls
        if (this.touchControls.left) this.moveDefender(-1);
        if (this.touchControls.right) this.moveDefender(1);

        // Update AI
        if (this.aiActive) {
            this.updateAI();
        }

        // NEW: Calculate intensity (active beats / total possible)
        const totalBeats = this.aliens.filter(a => a.alive).length;
        this.intensity = totalBeats / (this.gridRows * this.gridCols);

        // NEW: Update screen shake
        if (this.shake.intensity > 0.1) {
            this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
            this.shake.y = (Math.random() - 0.5) * this.shake.intensity;
            this.shake.intensity *= this.shake.decay;
        } else {
            this.shake.x = 0;
            this.shake.y = 0;
            this.shake.intensity = 0;
        }

        // NEW: Update starfield
        const starSpeed = 0.5 + (this.bpm / 120) * 0.5 + this.intensity * 2;
        for (const star of this.stars) {
            star.y += star.speed * starSpeed;
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
            
            // Decay pulse
            if (star.pulse > 0) {
                star.pulse -= 0.05;
            }
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            // NEW: Store trail positions
            bullet.trail.push({ x: bullet.x, y: bullet.y });
            if (bullet.trail.length > 5) bullet.trail.shift();
            
            bullet.y -= bullet.speed;
            
            // Check for collisions with aliens
            let hitAlien = false;
            for (let j = 0; j < this.aliens.length; j++) {
                const alien = this.aliens[j];
                if (alien.alive && this.checkCollision(bullet, alien)) {
                    // Calculate if hit was on-beat
                    const isOnBeat = (alien.col === this.currentStep || 
                                     alien.col === (this.currentStep - 1 + this.gridCols) % this.gridCols);
                    
                    if (isOnBeat) {
                        this.score += this.onBeatBonus;
                        this.combo++;
                        if (this.combo > this.maxCombo) this.maxCombo = this.combo;
                        this.createPopup(alien.x, alien.y, `+${this.onBeatBonus} ON BEAT!`, true);
                    } else {
                        this.score += this.normalHitScore;
                        this.combo = 0;
                        this.createPopup(alien.x, alien.y, `+${this.normalHitScore}`, false);
                    }
                    
                    // NEW: Trigger freeze frame and shake on kill
                    this.freezeFrame(2);
                    this.addShake(6 * (1 + this.intensity));
                    
                    // NEW: Create debris
                    this.createDebris(alien.x, alien.y, alien.row);
                    
                    // Remove alien permanently (clears from drum pattern)
                    this.grid[alien.row][alien.col] = false;
                    this.createExplosion(alien.x, alien.y, isOnBeat);
                    this.aliens.splice(j, 1);
                    this.bullets.splice(i, 1);
                    hitAlien = true;
                    break;
                }
            }
            
            // Remove bullets that are off screen
            if (!hitAlien && bullet.y < 0) {
                this.bullets.splice(i, 1);
            }
        }

        // NEW: Update debris
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];
            d.x += d.vx;
            d.y += d.vy;
            d.vy += 0.3; // gravity
            d.rotation += d.rotationSpeed;
            d.life -= 0.008;
            
            // Bounce off bottom
            if (d.y > this.canvas.height - 5 && d.vy > 0) {
                d.vy *= -0.5;
                d.vx *= 0.8;
                if (!d.bounced) d.bounced = true;
            }
            
            // Bounce off walls
            if (d.x < 0 || d.x > this.canvas.width) {
                d.vx *= -0.8;
            }
            
            if (d.life <= 0) {
                this.debris.splice(i, 1);
            }
        }

        // NEW: Update popups
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                this.popups.splice(i, 1);
            }
        }

        // Update drum sequence
        const currentTime = performance.now();
        if (currentTime - this.lastStepTime >= this.stepInterval) {
            this.lastStepTime = currentTime;
            this.currentStep = (this.currentStep + 1) % this.gridCols;
            this.stepPulse = 1.0; // Trigger pulse animation
            
            // Play sounds for active aliens in current step
            for (let row = 0; row < this.gridRows; row++) {
                if (this.grid[row][this.currentStep]) {
                    const alien = this.aliens.find(a => a.row === row && a.col === this.currentStep && a.alive);
                    if (alien) {
                        this.drumMachine.playSound(row);
                        this.beatFlash[row][this.currentStep] = 1.0;
                        this.createSoundParticles(alien.x, alien.y, row);
                        
                        // NEW: Screen shake per instrument
                        const shakeIntensities = [
                            8 + this.intensity * 4,  // Bass - heavy
                            5,                        // Snare - sharp
                            2                         // Hi-hat - subtle
                        ];
                        this.addShake(shakeIntensities[row]);
                        
                        // NEW: Pulse stars on beat
                        this.stars.forEach(star => {
                            if (Math.random() < 0.3) star.pulse = 1.0;
                        });
                    }
                }
            }
        }

        // Decay beat flash and pulse
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (this.beatFlash[row][col] > 0) {
                    this.beatFlash[row][col] -= 0.05;
                }
            }
        }
        if (this.stepPulse > 0) {
            this.stepPulse -= 0.05;
        }

        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.2; // gravity
            p.life--;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }
    }

    createSoundParticles(x, y, row) {
        const colors = this.instrumentColors[row];
        
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2 - 1,
                life: 20,
                color: Math.random() > 0.5 ? colors.primary : colors.secondary
            });
        }
    }

    createExplosion(x, y, isOnBeat = false) {
        this.explosions.push({
            x, y,
            frame: 0,
            maxFrames: 30,
            isOnBeat,
            particles: []
        });
        
        // Create explosion particles
        const numParticles = isOnBeat ? 20 : 12;
        const colors = isOnBeat ? ['#ffff00', '#ff00ff', '#00ffff'] : ['#ff4400', '#00aaff', '#cc00ff'];
        
        for (let i = 0; i < numParticles; i++) {
            const angle = (Math.PI * 2 * i) / numParticles;
            const speed = isOnBeat ? 4 : 3;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: isOnBeat ? 40 : 25,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }
    }

    checkCollision(bullet, alien) {
        const alienSize = 30;
        return bullet.x >= alien.x - alienSize/2 &&
               bullet.x <= alien.x + alienSize/2 &&
               bullet.y >= alien.y - alienSize/2 &&
               bullet.y <= alien.y + alienSize/2;
    }

    draw() {
        // Save context for shake transform
        this.ctx.save();
        
        // NEW: Apply screen shake
        this.ctx.translate(this.shake.x, this.shake.y);
        
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        // NEW: Draw starfield
        for (const star of this.stars) {
            const brightness = star.brightness + star.pulse * 0.5;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // NEW: Draw beat column flash
        if (this.stepPulse > 0) {
            for (let row = 0; row < this.gridRows; row++) {
                if (this.grid[row][this.currentStep]) {
                    const colors = this.instrumentColors[row];
                    const gradient = this.ctx.createLinearGradient(
                        this.currentStep * this.cellWidth,
                        this.gridYOffset,
                        this.currentStep * this.cellWidth + this.cellWidth,
                        this.gridYOffset + this.gridRows * this.cellHeight
                    );
                    gradient.addColorStop(0, `${colors.primary}40`);
                    gradient.addColorStop(1, `${colors.secondary}40`);
                    
                    this.ctx.fillStyle = gradient;
                    this.ctx.globalAlpha = this.stepPulse * 0.4;
                    this.ctx.fillRect(
                        this.currentStep * this.cellWidth,
                        this.gridYOffset,
                        this.cellWidth,
                        this.gridRows * this.cellHeight
                    );
                    this.ctx.globalAlpha = 1;
                }
            }
        }

        // Draw grid with beat flash (NEW: dark gray grid lines)
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                const flashIntensity = this.beatFlash[row][col];
                
                if (flashIntensity > 0) {
                    const colors = this.instrumentColors[row];
                    const gradient = this.ctx.createRadialGradient(
                        col * this.cellWidth + this.cellWidth / 2,
                        row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                        0,
                        col * this.cellWidth + this.cellWidth / 2,
                        row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                        this.cellWidth
                    );
                    gradient.addColorStop(0, `${colors.primary}${Math.floor(flashIntensity * 100).toString(16).padStart(2, '0')}`);
                    gradient.addColorStop(1, 'transparent');
                    
                    this.ctx.fillStyle = gradient;
                    this.ctx.fillRect(
                        col * this.cellWidth,
                        row * this.cellHeight + this.gridYOffset,
                        this.cellWidth,
                        this.cellHeight
                    );
                }
                
                // NEW: Dark gray grid lines
                this.ctx.strokeStyle = col % 4 === 0 ? '#444444' : '#333333';
                this.ctx.strokeRect(
                    col * this.cellWidth,
                    row * this.cellHeight + this.gridYOffset,
                    this.cellWidth,
                    this.cellHeight
                );
            }
        }

        // Draw current step indicator with pulse
        const pulseScale = 1 + (this.stepPulse * 0.3);
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2 * pulseScale;
        this.ctx.strokeRect(
            this.currentStep * this.cellWidth,
            this.gridYOffset,
            this.cellWidth,
            this.gridRows * this.cellHeight
        );
        this.ctx.lineWidth = 1;

        // Draw aliens (NEW: colored by instrument)
        for (const alien of this.aliens) {
            if (alien.alive) {
                const colors = this.instrumentColors[alien.row];
                this.ctx.fillStyle = colors.primary;
                this.ctx.strokeStyle = colors.secondary;
                this.ctx.lineWidth = 2;
                
                switch(alien.row) {
                    case 0: // Bass - Heavy battleship
                        this.ctx.fillRect(alien.x - 20, alien.y - 8, 40, 16);
                        this.ctx.strokeRect(alien.x - 20, alien.y - 8, 40, 16);
                        this.ctx.fillRect(alien.x - 10, alien.y - 12, 20, 8);
                        this.ctx.strokeRect(alien.x - 10, alien.y - 12, 20, 8);
                        this.ctx.beginPath();
                        this.ctx.moveTo(alien.x - 20, alien.y);
                        this.ctx.lineTo(alien.x - 25, alien.y + 5);
                        this.ctx.lineTo(alien.x - 20, alien.y + 5);
                        this.ctx.fill();
                        this.ctx.beginPath();
                        this.ctx.moveTo(alien.x + 20, alien.y);
                        this.ctx.lineTo(alien.x + 25, alien.y + 5);
                        this.ctx.lineTo(alien.x + 20, alien.y + 5);
                        this.ctx.fill();
                        break;
                        
                    case 1: // Snare - Fast fighter
                        this.ctx.beginPath();
                        this.ctx.moveTo(alien.x, alien.y - 15);
                        this.ctx.lineTo(alien.x + 15, alien.y + 5);
                        this.ctx.lineTo(alien.x - 15, alien.y + 5);
                        this.ctx.closePath();
                        this.ctx.fill();
                        this.ctx.stroke();
                        this.ctx.beginPath();
                        this.ctx.arc(alien.x, alien.y - 5, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.stroke();
                        break;
                        
                    case 2: // Hi-hat - Classic UFO
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y, 20, 8, 0, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.stroke();
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y - 5, 10, 10, 0, Math.PI, 0);
                        this.ctx.fill();
                        this.ctx.stroke();
                        break;
                }
                this.ctx.lineWidth = 1;
            }
        }

        // Draw defender (stays green)
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillRect(
            this.defender.x,
            this.defender.y + 10,
            this.defender.width,
            this.defender.height - 10
        );
        this.ctx.beginPath();
        this.ctx.roundRect(
            this.defender.x + this.defender.width/4,
            this.defender.y,
            this.defender.width/2,
            15,
            5
        );
        this.ctx.fill();
        this.ctx.fillRect(
            this.defender.x + this.defender.width/2 - 2,
            this.defender.y - 8,
            4,
            12
        );

        // NEW: Draw bullets with trails
        for (const bullet of this.bullets) {
            // Draw trail
            for (let i = 0; i < bullet.trail.length; i++) {
                const t = bullet.trail[i];
                const alpha = (i + 1) / bullet.trail.length * 0.5;
                this.ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, bullet.width / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            // Draw bullet with glow
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#00ff00';
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(bullet.x - bullet.width/2, bullet.y, 
                            bullet.width, bullet.height);
            this.ctx.shadowBlur = 0;
        }

        // NEW: Draw debris
        for (const d of this.debris) {
            this.ctx.save();
            this.ctx.translate(d.x, d.y);
            this.ctx.rotate(d.rotation);
            this.ctx.globalAlpha = d.life;
            this.ctx.fillStyle = d.color;
            this.ctx.fillRect(-d.size/2, -d.size/2, d.size, d.size);
            this.ctx.restore();
        }
        this.ctx.globalAlpha = 1;

        // Draw particles
        for (const p of this.particles) {
            const alpha = Math.max(0, p.life / 40);
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;

        // Draw explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            
            const progress = explosion.frame / explosion.maxFrames;
            const radius = progress * 40;
            const opacity = 1 - progress;
            
            // Multi-colored explosion rings
            if (explosion.isOnBeat) {
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, radius * 0.7, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(255, 255, 0, ${opacity})`;
                this.ctx.lineWidth = 3;
                this.ctx.stroke();
                
                this.ctx.beginPath();
                this.ctx.arc(explosion.x, explosion.y, radius * 1.2, 0, Math.PI * 2);
                this.ctx.strokeStyle = `rgba(255, 0, 255, ${opacity * 0.7})`;
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            }
            
            this.ctx.beginPath();
            this.ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
            this.ctx.strokeStyle = `rgba(0, 255, 0, ${opacity})`;
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            
            explosion.frame++;
            if (explosion.frame >= explosion.maxFrames) {
                this.explosions.splice(i, 1);
            }
        }

        // NEW: Draw popups
        this.ctx.font = 'bold 16px "Courier New"';
        for (const p of this.popups) {
            const alpha = p.life / 60;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = p.color;
            this.ctx.save();
            this.ctx.translate(p.x, p.y);
            this.ctx.scale(p.scale, p.scale);
            this.ctx.textAlign = 'center';
            this.ctx.fillText(p.text, 0, 0);
            this.ctx.restore();
        }
        this.ctx.globalAlpha = 1;

        // Draw score
        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = '20px "Courier New"';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        
        if (this.combo > 1) {
            this.ctx.fillStyle = '#ffff00';
            this.ctx.fillText(`Combo: ${this.combo}x`, 10, 55);
        }
        
        this.ctx.fillStyle = '#00ff00';
        this.ctx.fillText(`Max Combo: ${this.maxCombo}`, 10, 80);
        
        // Restore context after shake
        this.ctx.restore();
        
        // NEW: Apply intensity-based glow to canvas via CSS
        const glowIntensity = Math.floor(this.intensity * 20);
        this.canvas.style.boxShadow = `0 0 ${glowIntensity}px rgba(0, 255, 0, ${this.intensity * 0.5})`;
    }

    animate() {
        if (!this.isPaused) {
            this.update();
            this.draw();
        } else {
            this.draw(); // Still draw when paused
        }
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
});
