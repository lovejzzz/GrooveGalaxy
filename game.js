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
        this.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        this.touchControls = {
            left: false,
            right: false,
            shoot: false
        };
        
        // Setup event listeners (called once in constructor)
        this.setupEventListeners();
        
        // Add mobile controls to HTML if on mobile
        if (this.isMobile) {
            this.createMobileControls();
            this.adjustCanvasForMobile();
        }
    }

    adjustCanvasForMobile() {
        const maxWidth = Math.min(window.innerWidth - 40, 800);
        const scale = maxWidth / 800;
        this.canvas.style.width = maxWidth + 'px';
        this.canvas.style.height = (600 * scale) + 'px';
    }

    createMobileControls() {
        const controlsHTML = `
            <div id="mobile-controls" style="
                display: flex;
                justify-content: space-around;
                margin-top: 20px;
                gap: 10px;
            ">
                <button id="btn-left" style="flex: 1; padding: 20px; font-size: 20px;">◄</button>
                <button id="btn-shoot" style="flex: 1; padding: 20px; font-size: 20px;">FIRE</button>
                <button id="btn-right" style="flex: 1; padding: 20px; font-size: 20px;">►</button>
            </div>
        `;
        
        const container = document.querySelector('.game-container');
        container.insertAdjacentHTML('beforeend', controlsHTML);
        
        // Touch event listeners
        const btnLeft = document.getElementById('btn-left');
        const btnRight = document.getElementById('btn-right');
        const btnShoot = document.getElementById('btn-shoot');
        
        btnLeft.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchControls.left = true; });
        btnLeft.addEventListener('touchend', (e) => { e.preventDefault(); this.touchControls.left = false; });
        
        btnRight.addEventListener('touchstart', (e) => { e.preventDefault(); this.touchControls.right = true; });
        btnRight.addEventListener('touchend', (e) => { e.preventDefault(); this.touchControls.right = false; });
        
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
        presetsContainer.innerHTML = `
            <div style="margin-top: 15px; padding: 10px; border: 1px solid #00ff00; background-color: rgba(0, 255, 0, 0.05);">
                <label style="display: block; margin-bottom: 10px;">Preset Patterns:</label>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
                    <button id="preset-rock" style="margin: 0;">Rock</button>
                    <button id="preset-funk" style="margin: 0;">Funk</button>
                    <button id="preset-jazz" style="margin: 0;">Jazz</button>
                    <button id="preset-hiphop" style="margin: 0;">Hip-Hop</button>
                </div>
                <button id="preset-clear" style="margin-top: 10px; width: 100%;">Clear</button>
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
            speed: 10
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

    update() {
        if (this.isPaused) return;

        // Handle mobile touch controls
        if (this.isMobile) {
            if (this.touchControls.left) this.moveDefender(-1);
            if (this.touchControls.right) this.moveDefender(1);
        }

        // Update AI
        if (this.aiActive) {
            this.updateAI();
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
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
                    } else {
                        this.score += this.normalHitScore;
                        this.combo = 0;
                    }
                    
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
        const colors = ['#00ff00', '#00cc00', '#00aa00'];
        const color = colors[row % colors.length];
        
        for (let i = 0; i < 8; i++) {
            const angle = (Math.PI * 2 * i) / 8;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * 2,
                vy: Math.sin(angle) * 2 - 1,
                life: 20,
                color
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
        const colors = isOnBeat ? ['#00ff00', '#ffff00', '#ff00ff'] : ['#00ff00', '#00cc00'];
        
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
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw grid with beat flash
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                const flashIntensity = this.beatFlash[row][col];
                
                if (flashIntensity > 0) {
                    this.ctx.fillStyle = `rgba(0, 255, 0, ${flashIntensity * 0.3})`;
                    this.ctx.fillRect(
                        col * this.cellWidth,
                        row * this.cellHeight + this.gridYOffset,
                        this.cellWidth,
                        this.cellHeight
                    );
                }
                
                this.ctx.strokeStyle = col % 4 === 0 ? '#008800' : '#00ff00';
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

        // Draw aliens
        for (const alien of this.aliens) {
            if (alien.alive) {
                this.ctx.fillStyle = '#00ff00';
                
                switch(alien.row) {
                    case 0: // Bass - Heavy battleship
                        this.ctx.beginPath();
                        this.ctx.rect(alien.x - 20, alien.y - 8, 40, 16);
                        this.ctx.fill();
                        this.ctx.beginPath();
                        this.ctx.rect(alien.x - 10, alien.y - 12, 20, 8);
                        this.ctx.fill();
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
                        this.ctx.beginPath();
                        this.ctx.arc(alien.x, alien.y - 5, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        break;
                        
                    case 2: // Hi-hat - Classic UFO
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y, 20, 8, 0, 0, Math.PI * 2);
                        this.ctx.fill();
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y - 5, 10, 10, 0, Math.PI, 0);
                        this.ctx.fill();
                        break;
                }
            }
        }

        // Draw defender
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

        // Draw bullets
        this.ctx.fillStyle = '#00ff00';
        for (const bullet of this.bullets) {
            this.ctx.fillRect(bullet.x - bullet.width/2, bullet.y, 
                            bullet.width, bullet.height);
        }

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