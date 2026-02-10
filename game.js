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
        
        // NEW: Wave system
        this.currentWave = 1;
        this.currentLoop = 1;
        this.loopsPerWave = 8;
        this.wavePhase = 'playing'; // 'playing', 'prepare', 'complete', 'gameover'
        this.phaseTimer = 0;
        
        // NEW: Defender HP system
        this.defenderMaxHP = 60;
        this.defenderHP = 60;
        this.defenderDamageFlash = 0;
        this.defenderLowHP = false;
        this.defenderSmokeParticles = [];
        
        // AI settings - now scales with waves
        this.lastShotTime = 0;
        this.shotDelay = 900;
        this.aiAccuracy = 0.5;
        this.aiActive = true; // Always active in new mode
        this.aiShotsPerTurn = 1; // Increases at higher waves
        
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
        
        // Score system - now based on damage
        this.score = 0;
        
        // Visual beat feedback
        this.beatFlash = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(0));
        this.stepPulse = 0;
        
        // Instrument colors
        this.instrumentColors = [
            { primary: '#ff4400', secondary: '#ff6600', name: 'Bass' },
            { primary: '#00aaff', secondary: '#ffffff', name: 'Snare' },
            { primary: '#cc00ff', secondary: '#ff00cc', name: 'Hi-hat' }
        ];
        
        // Screen shake system
        this.shake = { x: 0, y: 0, intensity: 0, decay: 0.85 };
        
        // Freeze frame system
        this.freezeFrames = 0;
        
        // Debris system
        this.debris = [];
        this.maxDebris = 100;
        
        // Starfield
        this.stars = [];
        this.initStarfield();
        
        // Intensity tracking for chaos
        this.intensity = 0;
        
        // Kill text popups
        this.popups = [];
        
        // Particles for sound visualization
        this.particles = [];
        
        // Grid represents the master pattern (what player designed)
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
        
        // NEW: Aliens have alive state that resets each loop
        this.aliens = [];
        this.alienProjectiles = []; // NEW: Projectiles fired by aliens
        
        this.bullets = [];
        this.explosions = [];
        this.currentStep = 0;
        this.lastStepTime = 0;
        this.bpm = 120;
        this.stepInterval = (60 / this.bpm) * 1000 / 4;
        
        // NEW: Muzzle flashes when aliens shoot
        this.muzzleFlashes = [];
        
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
        
        btnShoot.addEventListener('touchstart', (e) => { e.preventDefault(); /* AI shoots automatically */ });
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
                if (titleImage) {
                    titleImage.classList.add('shine');
                    setTimeout(() => {
                        titleImage.classList.remove('shine');
                    }, 2500);
                }
            } else {
                this.togglePause();
            }
        };

        document.addEventListener('keydown', (e) => {
            if (e.key === 'p' || e.key === 'P') {
                this.togglePause();
            } else if (e.key === 'r' || e.key === 'R') {
                if (this.wavePhase === 'gameover') {
                    this.restartGame();
                }
            }
        });

        // Canvas click for grid editing — always allowed
        this.canvas.addEventListener('click', (e) => {
            // Tap to restart on game over
            if (this.wavePhase === 'gameover') {
                this.restartGame();
                return;
            }
            
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
                
                this.toggleGridCell(clickedRow, col);
            }
        });

        // Preset pattern buttons
        this.setupPresetButtons();
    }

    toggleGridCell(row, col) {
        if (this.grid[row][col]) {
            // Remove from grid
            this.grid[row][col] = false;
            this.aliens = this.aliens.filter(alien => 
                !(alien.row === row && alien.col === col));
        } else {
            // Add to grid
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

    setupPresetButtons() {
        const presets = {
            rock: [
                [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
                [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0],
                [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
            ],
            funk: [
                [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
                [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0]
            ],
            jazz: [
                [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1],
                [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]
            ],
            hiphop: [
                [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
                [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
                [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0]
            ]
        };
        
        Object.keys(presets).forEach(preset => {
            const btn = document.getElementById(`preset-${preset}`);
            if (btn) {
                btn.addEventListener('click', () => {
                    this.loadPreset(presets[preset]);
                });
            }
        });
        
        const clearBtn = document.getElementById('preset-clear');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.clearGrid();
            });
        }
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
    }

    clearGrid() {
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
        this.aliens = [];
    }

    restartGame() {
        this.currentWave = 1;
        this.currentLoop = 1;
        this.defenderHP = this.defenderMaxHP;
        this.score = 0;
        this.wavePhase = 'playing';
        this.gameOver = false;
        this.defenderLowHP = false;
        
        // Reset defender position
        this.defender.x = this.canvas.width / 2;
        
        // Clear all projectiles and effects
        this.bullets = [];
        this.alienProjectiles = [];
        this.explosions = [];
        this.particles = [];
        this.debris = [];
        this.popups = [];
        this.muzzleFlashes = [];
        this.defenderSmokeParticles = [];
        
        // Reset AI for wave 1
        this.updateAIForWave();
        
        // Respawn all aliens from grid pattern
        this.respawnAliens();
    }

    respawnAliens() {
        // Reset alive state for all aliens in the pattern
        this.aliens = [];
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                if (this.grid[row][col]) {
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
    }

    updateAIForWave() {
        // Scale AI based on wave number
        if (this.currentWave === 1) {
            this.shotDelay = 1500;
            this.aiAccuracy = 0.3;
            this.aiShotsPerTurn = 1;
        } else if (this.currentWave <= 2) {
            this.shotDelay = 1200;
            this.aiAccuracy = 0.4;
            this.aiShotsPerTurn = 1;
        } else if (this.currentWave === 3) {
            this.shotDelay = 900;
            this.aiAccuracy = 0.5;
            this.aiShotsPerTurn = 1;
        } else if (this.currentWave === 4) {
            this.shotDelay = 600;
            this.aiAccuracy = 0.65;
            this.aiShotsPerTurn = 1;
        } else if (this.currentWave === 5) {
            this.shotDelay = 500;
            this.aiAccuracy = 0.7;
            this.aiShotsPerTurn = 2; // Double shot!
        } else if (this.currentWave === 6) {
            this.shotDelay = 450;
            this.aiAccuracy = 0.75;
            this.aiShotsPerTurn = 2;
        } else if (this.currentWave === 7) {
            this.shotDelay = 400;
            this.aiAccuracy = 0.8;
            this.aiShotsPerTurn = 2;
        } else if (this.currentWave >= 10) {
            // Berserk mode
            this.shotDelay = 200;
            this.aiAccuracy = 0.9;
            this.aiShotsPerTurn = 3; // Triple shot!
        } else {
            this.shotDelay = 350;
            this.aiAccuracy = 0.85;
            this.aiShotsPerTurn = 2;
        }
    }

    moveDefender(direction) {
        const newX = this.defender.x + direction * this.defender.speed;
        if (newX >= 0 && newX <= this.canvas.width - this.defender.width) {
            this.defender.x = newX;
        }
    }

    updateAI() {
        if (!this.aiActive || this.isPaused || this.wavePhase !== 'playing') return;

        // Priority 1: Dodge incoming projectiles
        let nearestProjectile = null;
        let minProjDistance = Infinity;
        
        for (const proj of this.alienProjectiles) {
            const distance = Math.abs(proj.x - (this.defender.x + this.defender.width / 2));
            const timeToImpact = (this.defender.y - proj.y) / proj.speed;
            
            if (timeToImpact > 0 && timeToImpact < 60 && distance < minProjDistance) {
                minProjDistance = distance;
                nearestProjectile = proj;
            }
        }

        if (nearestProjectile && minProjDistance < 100) {
            // Dodge left or right
            const defenderCenter = this.defender.x + this.defender.width / 2;
            const dodgeDirection = nearestProjectile.x > defenderCenter ? -1 : 1;
            this.moveDefender(dodgeDirection);
        } else {
            // Priority 2: Find and shoot nearest alien
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
                
                if (Math.abs(nearestAlien.x - defenderCenter) > 10) {
                    this.moveDefender(direction);
                }

                const currentTime = Date.now();
                if (currentTime - this.lastShotTime >= this.shotDelay) {
                    if (Math.random() < this.aiAccuracy) {
                        for (let i = 0; i < this.aiShotsPerTurn; i++) {
                            this.shoot();
                        }
                    }
                    this.lastShotTime = currentTime;
                }
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
            trail: []
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

    addShake(intensity) {
        this.shake.intensity += intensity;
    }

    freezeFrame(frames = 3) {
        this.freezeFrames = frames;
    }

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

    createPopup(x, y, text, color = '#ffff00') {
        this.popups.push({
            x, y,
            text,
            life: 60,
            vy: -1.5,
            color,
            scale: 1.0
        });
    }

    createMuzzleFlash(x, y, row) {
        const colors = this.instrumentColors[row];
        this.muzzleFlashes.push({
            x, y,
            life: 8,
            color: colors.primary
        });
    }

    alienShoot(alien) {
        // Count aliens on same column
        const aliensOnStep = this.aliens.filter(a => 
            a.col === alien.col && a.alive
        ).length;
        
        // Damage scales with crossfire
        let damage = 5;
        if (aliensOnStep === 2) damage = 8;
        if (aliensOnStep === 3) damage = 12;
        
        const colors = this.instrumentColors[alien.row];
        this.alienProjectiles.push({
            x: alien.x,
            y: alien.y,
            width: 6,
            height: 12,
            speed: 4,
            damage,
            color: colors.primary,
            row: alien.row,
            aliensOnStep
        });
        
        // Muzzle flash
        this.createMuzzleFlash(alien.x, alien.y, alien.row);
    }

    update() {
        if (this.isPaused) return;

        // Freeze frame handling
        if (this.freezeFrames > 0) {
            this.freezeFrames--;
            return;
        }

        // Handle wave phase transitions
        if (this.wavePhase === 'prepare') {
            this.phaseTimer++;
            if (this.phaseTimer >= 180) { // 3 seconds at 60fps
                this.wavePhase = 'playing';
                this.phaseTimer = 0;
                this.currentLoop = 1;
                this.currentStep = 0;
                this.lastStepTime = performance.now();
            }
            return; // Don't update game during prepare
        } else if (this.wavePhase === 'complete') {
            this.phaseTimer++;
            if (this.phaseTimer >= 120) { // 2 seconds
                this.currentWave++;
                this.updateAIForWave();
                this.wavePhase = 'prepare';
                this.phaseTimer = 0;
                this.respawnAliens();
            }
            return;
        } else if (this.wavePhase === 'gameover') {
            return; // Game is over
        }

        // Handle mobile touch controls
        if (this.touchControls.left) this.moveDefender(-1);
        if (this.touchControls.right) this.moveDefender(1);

        // Update AI
        if (this.aiActive) {
            this.updateAI();
        }

        // Calculate intensity
        const totalBeats = this.aliens.filter(a => a.alive).length;
        this.intensity = totalBeats / (this.gridRows * this.gridCols);

        // Update screen shake
        if (this.shake.intensity > 0.1) {
            this.shake.x = (Math.random() - 0.5) * this.shake.intensity;
            this.shake.y = (Math.random() - 0.5) * this.shake.intensity;
            this.shake.intensity *= this.shake.decay;
        } else {
            this.shake.x = 0;
            this.shake.y = 0;
            this.shake.intensity = 0;
        }

        // Update starfield
        const starSpeed = 0.5 + (this.bpm / 120) * 0.5 + this.intensity * 2;
        for (const star of this.stars) {
            star.y += star.speed * starSpeed;
            if (star.y > this.canvas.height) {
                star.y = 0;
                star.x = Math.random() * this.canvas.width;
            }
            
            if (star.pulse > 0) {
                star.pulse -= 0.05;
            }
        }

        // Update defender damage flash
        if (this.defenderDamageFlash > 0) {
            this.defenderDamageFlash -= 0.05;
        }

        // Update defender smoke when low HP
        if (this.defenderLowHP) {
            if (Math.random() < 0.3) {
                this.defenderSmokeParticles.push({
                    x: this.defender.x + this.defender.width / 2 + (Math.random() - 0.5) * 20,
                    y: this.defender.y + 10,
                    vx: (Math.random() - 0.5) * 0.5,
                    vy: -1 - Math.random(),
                    life: 60,
                    size: 3 + Math.random() * 4
                });
            }
        }

        // Update smoke particles
        for (let i = this.defenderSmokeParticles.length - 1; i >= 0; i--) {
            const p = this.defenderSmokeParticles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                this.defenderSmokeParticles.splice(i, 1);
            }
        }

        // Update bullets (defender shooting aliens)
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            
            bullet.trail.push({ x: bullet.x, y: bullet.y });
            if (bullet.trail.length > 5) bullet.trail.shift();
            
            bullet.y -= bullet.speed;
            
            let hitAlien = false;
            for (let j = 0; j < this.aliens.length; j++) {
                const alien = this.aliens[j];
                if (alien.alive && this.checkCollision(bullet, alien)) {
                    // Kill alien for this loop only
                    alien.alive = false;
                    this.createDebris(alien.x, alien.y, alien.row);
                    this.createExplosion(alien.x, alien.y, false);
                    this.addShake(4);
                    this.bullets.splice(i, 1);
                    hitAlien = true;
                    break;
                }
            }
            
            if (!hitAlien && bullet.y < 0) {
                this.bullets.splice(i, 1);
            }
        }

        // Update alien projectiles
        for (let i = this.alienProjectiles.length - 1; i >= 0; i--) {
            const proj = this.alienProjectiles[i];
            proj.y += proj.speed;
            
            // Check collision with defender
            if (proj.y >= this.defender.y && 
                proj.y <= this.defender.y + this.defender.height &&
                proj.x >= this.defender.x &&
                proj.x <= this.defender.x + this.defender.width) {
                
                // Defender takes damage!
                this.defenderHP -= proj.damage;
                this.score += proj.damage;
                
                // Bonus score for crossfire
                if (proj.aliensOnStep === 2) {
                    this.score += 10;
                    this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, 
                        `+${proj.damage + 10} CROSSFIRE!`, '#ff00ff');
                } else if (proj.aliensOnStep === 3) {
                    this.score += 30;
                    this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, 
                        `+${proj.damage + 30} FULL BARRAGE!`, '#ff0000');
                } else {
                    this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, 
                        `+${proj.damage}`, '#ffff00');
                }
                
                // Visual feedback
                this.defenderDamageFlash = 1.0;
                this.addShake(8 + proj.aliensOnStep * 3);
                this.freezeFrame(2);
                
                // Check if defender is low HP
                if (this.defenderHP <= this.defenderMaxHP * 0.25 && !this.defenderLowHP) {
                    this.defenderLowHP = true;
                }
                
                // Explosion at defender
                this.createExplosion(proj.x, proj.y, false);
                this.alienProjectiles.splice(i, 1);
                
                // Check win condition
                if (this.defenderHP <= 0) {
                    this.defenderHP = 0;
                    this.waveComplete();
                }
            } else if (proj.y > this.canvas.height) {
                this.alienProjectiles.splice(i, 1);
            }
        }

        // Update debris
        for (let i = this.debris.length - 1; i >= 0; i--) {
            const d = this.debris[i];
            d.x += d.vx;
            d.y += d.vy;
            d.vy += 0.3;
            d.rotation += d.rotationSpeed;
            d.life -= 0.008;
            
            if (d.y > this.canvas.height - 5 && d.vy > 0) {
                d.vy *= -0.5;
                d.vx *= 0.8;
                if (!d.bounced) d.bounced = true;
            }
            
            if (d.x < 0 || d.x > this.canvas.width) {
                d.vx *= -0.8;
            }
            
            if (d.life <= 0) {
                this.debris.splice(i, 1);
            }
        }

        // Update popups
        for (let i = this.popups.length - 1; i >= 0; i--) {
            const p = this.popups[i];
            p.y += p.vy;
            p.life--;
            if (p.life <= 0) {
                this.popups.splice(i, 1);
            }
        }

        // Update muzzle flashes
        for (let i = this.muzzleFlashes.length - 1; i >= 0; i--) {
            this.muzzleFlashes[i].life--;
            if (this.muzzleFlashes[i].life <= 0) {
                this.muzzleFlashes.splice(i, 1);
            }
        }

        // Update drum sequence
        const currentTime = performance.now();
        if (currentTime - this.lastStepTime >= this.stepInterval) {
            this.lastStepTime = currentTime;
            this.currentStep = (this.currentStep + 1) % this.gridCols;
            
            // Check if loop completed
            if (this.currentStep === 0) {
                this.currentLoop++;
                if (this.currentLoop > this.loopsPerWave) {
                    // Wave completed
                    if (this.defenderHP > 0) {
                        // Player loses - defender survived
                        this.gameLost();
                    }
                } else {
                    // Respawn aliens for next loop
                    this.respawnAliens();
                }
            }
            
            this.stepPulse = 1.0;
            
            // Play sounds and aliens shoot
            for (let row = 0; row < this.gridRows; row++) {
                if (this.grid[row][this.currentStep]) {
                    const alien = this.aliens.find(a => a.row === row && a.col === this.currentStep && a.alive);
                    if (alien) {
                        this.drumMachine.playSound(row);
                        this.beatFlash[row][this.currentStep] = 1.0;
                        this.createSoundParticles(alien.x, alien.y, row);
                        
                        // Alien shoots!
                        this.alienShoot(alien);
                        
                        const shakeIntensities = [8 + this.intensity * 4, 5, 2];
                        this.addShake(shakeIntensities[row]);
                        
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
            p.vy += 0.2;
            p.life--;
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // No mid-loop game over — aliens respawn each loop
        // Game over only happens after all loops complete with defender alive
    }

    waveComplete() {
        // Defender destroyed - player wins wave
        this.score += this.currentWave * 500; // Wave completion bonus
        this.defenderMaxHP = 60 + (this.currentWave * 15); // More HP each wave
        this.defenderHP = this.defenderMaxHP; // Reset HP for next wave
        this.defenderLowHP = false;
        this.wavePhase = 'complete';
        this.phaseTimer = 0;
        
        // Clear projectiles
        this.alienProjectiles = [];
        this.bullets = [];
    }

    gameLost() {
        // All aliens destroyed or wave loops completed with defender alive
        this.wavePhase = 'gameover';
        this.gameOver = true;
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
        this.ctx.save();
        this.ctx.translate(this.shake.x, this.shake.y);
        
        // Clear canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(-10, -10, this.canvas.width + 20, this.canvas.height + 20);

        // Draw starfield
        for (const star of this.stars) {
            const brightness = star.brightness + star.pulse * 0.5;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            this.ctx.beginPath();
            this.ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw beat column flash
        if (this.stepPulse > 0 && this.wavePhase === 'playing') {
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

        // Draw grid
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
                
                this.ctx.strokeStyle = col % 4 === 0 ? '#444444' : '#333333';
                this.ctx.strokeRect(
                    col * this.cellWidth,
                    row * this.cellHeight + this.gridYOffset,
                    this.cellWidth,
                    this.cellHeight
                );
            }
        }

        // Draw current step indicator
        if (this.wavePhase === 'playing') {
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
        }

        // Draw aliens
        for (const alien of this.aliens) {
            if (alien.alive) {
                const colors = this.instrumentColors[alien.row];
                this.ctx.fillStyle = colors.primary;
                this.ctx.strokeStyle = colors.secondary;
                this.ctx.lineWidth = 2;
                
                switch(alien.row) {
                    case 0: // Bass
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
                        
                    case 1: // Snare
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
                        
                    case 2: // Hi-hat
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

        // Draw muzzle flashes
        for (const flash of this.muzzleFlashes) {
            const alpha = flash.life / 8;
            this.ctx.globalAlpha = alpha;
            this.ctx.fillStyle = flash.color;
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = flash.color;
            this.ctx.beginPath();
            this.ctx.arc(flash.x, flash.y, 8, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.shadowBlur = 0;
        }
        this.ctx.globalAlpha = 1;

        // Draw defender
        const defenderFlash = this.defenderDamageFlash > 0;
        this.ctx.fillStyle = defenderFlash ? '#ff0000' : '#00ff00';
        
        // Smoke particles
        for (const p of this.defenderSmokeParticles) {
            const alpha = p.life / 60;
            this.ctx.globalAlpha = alpha * 0.5;
            this.ctx.fillStyle = '#888888';
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.globalAlpha = 1;
        
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

        // Draw defender HP bar above ship
        const barWidth = 60;
        const barHeight = 8;
        const barX = this.defender.x + this.defender.width/2 - barWidth/2;
        const barY = this.defender.y - 20;
        
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        const hpPercent = this.defenderHP / this.defenderMaxHP;
        let hpColor = '#00ff00';
        if (hpPercent <= 0.25) hpColor = '#ff0000';
        else if (hpPercent <= 0.5) hpColor = '#ffff00';
        
        this.ctx.fillStyle = hpColor;
        this.ctx.fillRect(barX + 1, barY + 1, (barWidth - 2) * hpPercent, barHeight - 2);

        // Draw bullets
        for (const bullet of this.bullets) {
            for (let i = 0; i < bullet.trail.length; i++) {
                const t = bullet.trail[i];
                const alpha = (i + 1) / bullet.trail.length * 0.5;
                this.ctx.fillStyle = `rgba(0, 255, 0, ${alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(t.x, t.y, bullet.width / 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
            
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#00ff00';
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(bullet.x - bullet.width/2, bullet.y, 
                            bullet.width, bullet.height);
            this.ctx.shadowBlur = 0;
        }

        // Draw alien projectiles
        for (const proj of this.alienProjectiles) {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = proj.color;
            this.ctx.fillStyle = proj.color;
            this.ctx.fillRect(proj.x - proj.width/2, proj.y, proj.width, proj.height);
            this.ctx.shadowBlur = 0;
        }

        // Draw debris
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

        // Draw popups
        this.ctx.font = 'bold 14px "Courier New"';
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

        this.ctx.restore(); // End shake transform

        // Draw UI elements (not affected by shake)
        
        // Score
        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = 'bold 20px "Courier New"';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        
        // Wave counter (top right)
        this.ctx.textAlign = 'right';
        this.ctx.fillStyle = '#00ff00';
        this.ctx.font = 'bold 24px "Courier New"';
        this.ctx.fillText(`WAVE ${this.currentWave}`, this.canvas.width - 10, 30);
        
        // Loop counter
        if (this.wavePhase === 'playing') {
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 16px "Courier New"';
            this.ctx.fillText(`Loop ${this.currentLoop}/${this.loopsPerWave}`, this.canvas.width - 10, 55);
        }
        
        this.ctx.textAlign = 'left';
        
        // HP bar at bottom
        const bottomBarY = this.canvas.height - 25;
        const bottomBarWidth = 200;
        const bottomBarX = this.canvas.width / 2 - bottomBarWidth / 2;
        
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(bottomBarX, bottomBarY, bottomBarWidth, 15);
        
        const bottomHpPercent = Math.max(0, this.defenderHP / this.defenderMaxHP);
        let bottomHpColor = '#00ff00';
        if (bottomHpPercent <= 0.25) bottomHpColor = '#ff0000';
        else if (bottomHpPercent <= 0.5) bottomHpColor = '#ffff00';
        
        this.ctx.fillStyle = bottomHpColor;
        this.ctx.fillRect(bottomBarX + 2, bottomBarY + 2, (bottomBarWidth - 4) * bottomHpPercent, 11);
        
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 12px "Courier New"';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(`DEFENDER HP: ${Math.max(0, this.defenderHP)}/${this.defenderMaxHP}`, 
            this.canvas.width / 2, bottomBarY - 5);
        this.ctx.textAlign = 'left';
        this.ctx.lineWidth = 1;

        // Wave phase overlays
        if (this.wavePhase === 'prepare') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 48px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PREPARE', this.canvas.width / 2, this.canvas.height / 2 - 40);
            
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = 'bold 24px "Courier New"';
            this.ctx.fillText(`Wave ${this.currentWave} Starting...`, this.canvas.width / 2, this.canvas.height / 2 + 20);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '16px "Courier New"';
            this.ctx.fillText('Edit your pattern now!', this.canvas.width / 2, this.canvas.height / 2 + 60);
            this.ctx.textAlign = 'left';
        } else if (this.wavePhase === 'complete') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            const scale = 1 + Math.sin(this.phaseTimer * 0.1) * 0.1;
            this.ctx.save();
            this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2 - 40);
            this.ctx.scale(scale, scale);
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = 'bold 48px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('WAVE COMPLETE!', 0, 0);
            this.ctx.restore();
            
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 32px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(`Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 30);
            this.ctx.textAlign = 'left';
        } else if (this.wavePhase === 'gameover') {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            this.ctx.fillStyle = '#ff0000';
            this.ctx.font = 'bold 48px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('DEFENSE HELD', this.canvas.width / 2, this.canvas.height / 2 - 60);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 32px "Courier New"';
            this.ctx.fillText('GAME OVER', this.canvas.width / 2, this.canvas.height / 2 - 10);
            
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 24px "Courier New"';
            this.ctx.fillText(`Wave Reached: ${this.currentWave}`, this.canvas.width / 2, this.canvas.height / 2 + 40);
            this.ctx.fillText(`Final Score: ${this.score}`, this.canvas.width / 2, this.canvas.height / 2 + 75);
            
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = '18px "Courier New"';
            this.ctx.fillText('Press R or Tap to Restart', this.canvas.width / 2, this.canvas.height / 2 + 120);
            this.ctx.textAlign = 'left';
        }

        // Apply intensity glow
        const glowIntensity = Math.floor(this.intensity * 20);
        this.canvas.style.boxShadow = `0 0 ${glowIntensity}px rgba(0, 255, 0, ${this.intensity * 0.5})`;
    }

    animate() {
        if (!this.isPaused) {
            this.update();
            this.draw();
        } else {
            this.draw();
        }
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
});
