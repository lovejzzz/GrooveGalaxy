class DrumMachine {
    constructor() {
        this.audioContext = null;
        this.isInitialized = false;
        this.soundOrder = [0, 1, 2]; // Maps row index to sound index (bass, snare, hi-hat, tom, cymbal)
        this.currentKit = '808'; // Default kit
        this.noiseBuffer = null; // For noise-based sounds
        
        // Sound kit definitions
        this.kits = {
            '808': {
                name: '808',
                bass: { freq: 80, decay: 0.2, wave: 'sine' },
                snare: { freq: 180, decay: 0.15, wave: 'triangle', noise: true, noiseMix: 0.6 },
                hihat: { freq: 10000, decay: 0.08, wave: 'square', noise: true, noiseMix: 0.9 },
                tom: { freq: 200, decay: 0.15, wave: 'triangle' },
                cymbal: { freq: 3000, decay: 0.5, wave: 'square', noise: true, noiseMix: 0.8 }
            },
            'acoustic': {
                name: 'Acoustic',
                bass: { freq: 60, decay: 0.3, wave: 'sine' },
                snare: { freq: 220, decay: 0.12, wave: 'triangle', noise: true, noiseMix: 0.7 },
                hihat: { freq: 8000, decay: 0.05, wave: 'square', noise: true, noiseMix: 0.95 },
                tom: { freq: 180, decay: 0.2, wave: 'sine' },
                cymbal: { freq: 4000, decay: 0.5, wave: 'square', noise: true, noiseMix: 0.85 }
            },
            'electronic': {
                name: 'Electronic',
                bass: { freq: 40, freq2: 80, decay: 0.1, wave: 'sawtooth' }, // Sub-bass + overtone
                snare: { freq: 200, decay: 0.1, wave: 'square', noise: true, noiseMix: 0.5 },
                hihat: { freq: 12000, freq2: 12100, decay: 0.06, wave: 'square' }, // Detuned for metallic
                tom: { freq: 150, decay: 0.12, wave: 'square' },
                cymbal: { freq: 5000, freq2: 5200, decay: 0.4, wave: 'square' }
            }
        };
    }

    async init() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        // Create noise buffer for snare/hihat sounds
        const bufferSize = this.audioContext.sampleRate * 0.5; // 0.5 seconds of noise
        this.noiseBuffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const output = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        
        this.isInitialized = true;
    }

    setKit(kitName) {
        if (this.kits[kitName]) {
            this.currentKit = kitName;
        }
    }

    playSound(rowIndex) {
        if (!this.isInitialized) return;
        
        const soundTypes = ['bass', 'snare', 'hihat', 'tom', 'cymbal'];
        const soundType = soundTypes[rowIndex] || 'bass';
        const kit = this.kits[this.currentKit];
        const params = kit[soundType];
        
        if (!params) return;
        
        const now = this.audioContext.currentTime;
        const gainNode = this.audioContext.createGain();
        gainNode.connect(this.audioContext.destination);
        
        // Volume envelope
        gainNode.gain.setValueAtTime(0.4, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + params.decay);
        
        // Oscillator component
        if (params.wave) {
            const osc = this.audioContext.createOscillator();
            osc.type = params.wave;
            osc.frequency.setValueAtTime(params.freq, now);
            
            // Frequency envelope for kick/tom (pitch drops)
            if (soundType === 'bass' || soundType === 'tom') {
                osc.frequency.exponentialRampToValueAtTime(params.freq * 0.5, now + params.decay * 0.3);
            }
            
            const oscGain = this.audioContext.createGain();
            oscGain.gain.setValueAtTime(params.noise ? (1 - params.noiseMix) : 1, now);
            
            osc.connect(oscGain);
            oscGain.connect(gainNode);
            osc.start(now);
            osc.stop(now + params.decay);
        }
        
        // Second oscillator for detuned/layered sounds (electronic kit)
        if (params.freq2) {
            const osc2 = this.audioContext.createOscillator();
            osc2.type = params.wave;
            osc2.frequency.setValueAtTime(params.freq2, now);
            
            if (soundType === 'bass') {
                osc2.frequency.exponentialRampToValueAtTime(params.freq2 * 0.5, now + params.decay * 0.3);
            }
            
            const osc2Gain = this.audioContext.createGain();
            osc2Gain.gain.setValueAtTime(0.3, now);
            
            osc2.connect(osc2Gain);
            osc2Gain.connect(gainNode);
            osc2.start(now);
            osc2.stop(now + params.decay);
        }
        
        // Noise component for snare/hihat/cymbal
        if (params.noise && this.noiseBuffer) {
            const noise = this.audioContext.createBufferSource();
            noise.buffer = this.noiseBuffer;
            
            const noiseFilter = this.audioContext.createBiquadFilter();
            noiseFilter.type = soundType === 'cymbal' ? 'bandpass' : 'highpass';
            noiseFilter.frequency.setValueAtTime(soundType === 'hihat' ? params.freq : 1000, now);
            
            const noiseGain = this.audioContext.createGain();
            noiseGain.gain.setValueAtTime(params.noiseMix || 0.5, now);
            
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(gainNode);
            noise.start(now);
            noise.stop(now + params.decay);
        }
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
        this.wavePhase = 'playing'; // 'playing', 'prepare', 'complete', 'cardpick', 'gameover'
        this.phaseTimer = 0;
        
        // NEW: Card upgrade system
        this.upgrades = {}; // Tracks applied upgrades
        this.currentCardChoices = []; // 3 cards shown to player
        this.hoveredCardIndex = -1; // Which card is mouse over
        this.fireZones = []; // For Napalm Rounds upgrade
        
        // NEW: Defender HP system
        this.defenderMaxHP = 60;
        this.defenderHP = 60;
        this.defenderDamageFlash = 0;
        this.defenderLowHP = false;
        this.defenderSmokeParticles = [];
        this.defenderStunned = 0; // Frames remaining of stun
        
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
        
        // Instrument colors (supports up to 5 rows)
        this.instrumentColors = [
            { primary: '#ff4444', secondary: '#ff6600', name: 'Bass' },
            { primary: '#4488ff', secondary: '#ffffff', name: 'Snare' },
            { primary: '#aa44ff', secondary: '#ff00cc', name: 'Hi-hat' },
            { primary: '#00ffff', secondary: '#00aaaa', name: 'Tom' },
            { primary: '#ffd700', secondary: '#ffaa00', name: 'Cymbal' }
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
        
        // NEW: Power-up system
        this.powerUps = [];
        this.activePowerUps = {
            shield: 0, // hits remaining
            speedBoost: 0, // frames remaining
            rapidFire: 0, // frames remaining
            spreadShot: 0  // frames remaining
        };
        
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

    getCardPool() {
        return [
            // Offensive (red)
            {
                id: 'napalmRounds',
                name: 'Napalm Rounds',
                icon: '🔥',
                desc: 'Bass cannons leave fire zones',
                rarity: 'offensive',
                color: '#ff4444'
            },
            {
                id: 'chainLightning',
                name: 'Chain Lightning',
                icon: '⚡',
                desc: 'Snare bursts spawn arc shots',
                rarity: 'offensive',
                color: '#ff4444'
            },
            {
                id: 'homingBoost',
                name: 'Homing Boost',
                icon: '🎯',
                desc: 'Missiles track 2.4x better',
                rarity: 'offensive',
                color: '#ff4444'
            },
            {
                id: 'volleyFire',
                name: 'Volley Fire',
                icon: '🌀',
                desc: 'Aliens fire twice per beat',
                rarity: 'offensive',
                color: '#ff4444'
            },
            // Defensive (blue)
            {
                id: 'alienArmor',
                name: 'Alien Armor',
                icon: '🛡️',
                desc: 'Aliens take 2 hits to kill',
                rarity: 'defensive',
                color: '#4444ff'
            },
            {
                id: 'quickRespawn',
                name: 'Quick Respawn',
                icon: '🔄',
                desc: 'Killed aliens respawn faster',
                rarity: 'defensive',
                color: '#4444ff'
            },
            {
                id: 'lootDenial',
                name: 'Loot Denial',
                icon: '🚫',
                desc: 'Power-up drops halved',
                rarity: 'defensive',
                color: '#4444ff'
            },
            // Utility (green)
            {
                id: 'extraRow',
                name: 'Extra Row',
                icon: '➕',
                desc: 'Adds a 4th grid row',
                rarity: 'utility',
                color: '#44ff44'
            },
            {
                id: 'tempoPush',
                name: 'Tempo Push',
                icon: '🎵',
                desc: 'BPM +20 (more beats)',
                rarity: 'utility',
                color: '#44ff44'
            },
            {
                id: 'doubleTime',
                name: 'Double Time',
                icon: '⏩',
                desc: 'Projectile speed +50%',
                rarity: 'utility',
                color: '#44ff44'
            },
            // Chaotic (purple)
            {
                id: 'scramble',
                name: 'Scramble',
                icon: '🎲',
                desc: 'Fill 30% of empty cells',
                rarity: 'chaotic',
                color: '#aa44ff'
            },
            {
                id: 'mirrorBeat',
                name: 'Mirror Beat',
                icon: '🔀',
                desc: 'Mirror current pattern',
                rarity: 'chaotic',
                color: '#aa44ff'
            }
        ];
    }

    generateCardChoices() {
        const pool = this.getCardPool();
        const available = pool.filter(card => !this.upgrades[card.id]);
        
        // If all cards picked, offer repeatable stat boosts (placeholder for now)
        if (available.length === 0) {
            return [
                {
                    id: 'damageBoost',
                    name: 'Damage Boost',
                    icon: '💥',
                    desc: 'Projectile damage +10%',
                    rarity: 'repeatable',
                    color: '#ffaa00'
                },
                {
                    id: 'hpBoost',
                    name: 'HP Boost',
                    icon: '❤️',
                    desc: 'Max HP +15',
                    rarity: 'repeatable',
                    color: '#ff0000'
                },
                {
                    id: 'speedBoost',
                    name: 'Speed Boost',
                    icon: '🚀',
                    desc: 'Defender speed +1',
                    rarity: 'repeatable',
                    color: '#00ffff'
                }
            ];
        }
        
        // Pick 3 random cards from available pool
        const choices = [];
        const poolCopy = [...available];
        for (let i = 0; i < Math.min(3, poolCopy.length); i++) {
            const index = Math.floor(Math.random() * poolCopy.length);
            choices.push(poolCopy[index]);
            poolCopy.splice(index, 1);
        }
        
        // Fill with duplicates if less than 3 available
        while (choices.length < 3 && available.length > 0) {
            choices.push(available[Math.floor(Math.random() * available.length)]);
        }
        
        return choices;
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

        // Canvas click for grid editing and card selection
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
            
            // Handle card selection during cardpick phase
            if (this.wavePhase === 'cardpick') {
                const cardIndex = this.getClickedCardIndex(canvasX, canvasY);
                if (cardIndex !== -1) {
                    this.selectCard(cardIndex);
                }
                return;
            }
            
            const col = Math.floor(canvasX / this.cellWidth);
            const clickedRow = Math.floor((canvasY - this.gridYOffset) / this.cellHeight);
            
            if (canvasY >= this.gridYOffset && 
                canvasY <= this.gridYOffset + this.gridRows * this.cellHeight && 
                col >= 0 && col < this.gridCols &&
                clickedRow >= 0 && clickedRow < this.gridRows) {
                
                this.toggleGridCell(clickedRow, col);
            }
        });
        
        // Add mousemove for card hover effect
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.wavePhase !== 'cardpick') {
                this.hoveredCardIndex = -1;
                return;
            }
            
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const canvasX = (x * scaleX);
            const canvasY = (y * scaleY);
            
            this.hoveredCardIndex = this.getClickedCardIndex(canvasX, canvasY);
        });

        // Preset pattern buttons
        this.setupPresetButtons();
        
        // Sound kit selector buttons
        this.setupKitButtons();
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

    setupKitButtons() {
        const kitButtons = {
            'kit-808': '808',
            'kit-acoustic': 'acoustic',
            'kit-electronic': 'electronic'
        };
        
        Object.keys(kitButtons).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.addEventListener('click', () => {
                    const kitName = kitButtons[btnId];
                    this.drumMachine.setKit(kitName);
                    
                    // Update active state
                    document.querySelectorAll('.kit-button').forEach(b => {
                        b.classList.remove('active');
                    });
                    btn.classList.add('active');
                });
            }
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
        this.defenderStunned = 0;
        
        // Reset upgrades
        this.upgrades = {};
        this.currentCardChoices = [];
        this.fireZones = [];
        
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
        this.powerUps = [];
        this.activePowerUps = { shield: 0, speedBoost: 0, rapidFire: 0, spreadShot: 0 };
        
        // Reset grid to 3 rows (don't keep extra rows from previous game)
        if (this.gridRows > 3) {
            this.gridRows = 3;
            this.grid = this.grid.slice(0, 3);
            this.beatFlash = this.beatFlash.slice(0, 3);
            this.drumMachine.soundOrder = [0, 1, 2];
        }
        
        // Reset AI for wave 1
        this.updateAIForWave();
        
        // Respawn all aliens from grid pattern
        this.respawnAliens();
    }

    getClickedCardIndex(x, y) {
        if (this.currentCardChoices.length === 0) return -1;
        
        const cardWidth = 180;
        const cardHeight = 250;
        const gap = 20;
        const totalWidth = (cardWidth * 3) + (gap * 2);
        const startX = (this.canvas.width - totalWidth) / 2;
        const startY = this.canvas.height / 2 - cardHeight / 2;
        
        for (let i = 0; i < 3; i++) {
            const cardX = startX + (i * (cardWidth + gap));
            if (x >= cardX && x <= cardX + cardWidth &&
                y >= startY && y <= startY + cardHeight) {
                return i;
            }
        }
        return -1;
    }

    selectCard(index) {
        if (index < 0 || index >= this.currentCardChoices.length) return;
        
        const card = this.currentCardChoices[index];
        this.applyUpgrade(card);
        
        // Mark as picked
        this.upgrades[card.id] = true;
        
        // Advance to next wave
        this.currentWave++;
        this.updateAIForWave();
        
        // Transition to prepare phase
        this.wavePhase = 'prepare';
        this.phaseTimer = 0;
        this.currentCardChoices = [];
        
        // Respawn aliens for new wave
        this.respawnAliens();
    }

    applyUpgrade(card) {
        switch (card.id) {
            case 'napalmRounds':
                // Will be handled in alienProjectile hit code
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'NAPALM ROUNDS!', '#ff4400');
                break;
                
            case 'chainLightning':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'CHAIN LIGHTNING!', '#ffff00');
                break;
                
            case 'homingBoost':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'HOMING BOOST!', '#00ffff');
                break;
                
            case 'volleyFire':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'VOLLEY FIRE!', '#ff00ff');
                break;
                
            case 'alienArmor':
                // Apply to all current aliens
                for (const alien of this.aliens) {
                    if (!alien.hp) alien.hp = 2;
                }
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'ALIEN ARMOR!', '#4444ff');
                break;
                
            case 'quickRespawn':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'QUICK RESPAWN!', '#00aaff');
                break;
                
            case 'lootDenial':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'LOOT DENIAL!', '#ff0000');
                break;
                
            case 'extraRow':
                // Add 4th or 5th row incrementally
                if (this.gridRows < 5) {
                    this.gridRows++;
                    this.grid.push(Array(this.gridCols).fill(false));
                    this.beatFlash.push(Array(this.gridCols).fill(0));
                    
                    if (this.gridRows === 4) {
                        this.drumMachine.soundOrder.push(3); // Tom sound (index 3)
                        this.createPopup(this.canvas.width/2, this.canvas.height/2, 'TOM ROW ADDED!', '#00ffff');
                    } else if (this.gridRows === 5) {
                        this.drumMachine.soundOrder.push(4); // Cymbal sound (index 4)
                        this.createPopup(this.canvas.width/2, this.canvas.height/2, 'CYMBAL ROW ADDED!', '#ffd700');
                    }
                } else {
                    this.createPopup(this.canvas.width/2, this.canvas.height/2, 'MAX ROWS!', '#ff0000');
                }
                break;
                
            case 'tempoPush':
                this.bpm += 20;
                this.bpmControl.value = this.bpm;
                this.bpmValue.textContent = this.bpm;
                this.stepInterval = (60 / this.bpm) * 1000 / 4;
                const speedScale = 1 + ((this.bpm - 60) / (200 - 60)) * 1.5;
                this.defender.speed = Math.round(5 * speedScale);
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'TEMPO PUSH!', '#ffff00');
                break;
                
            case 'doubleTime':
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'DOUBLE TIME!', '#ff8800');
                break;
                
            case 'scramble':
                // Fill 30% of empty cells
                let filled = 0;
                for (let row = 0; row < this.gridRows; row++) {
                    for (let col = 0; col < this.gridCols; col++) {
                        if (!this.grid[row][col] && Math.random() < 0.3) {
                            this.grid[row][col] = true;
                            this.aliens.push({
                                row, col,
                                x: col * this.cellWidth + this.cellWidth / 2,
                                y: row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                                alive: true,
                                hp: this.upgrades.alienArmor ? 2 : 1
                            });
                            filled++;
                        }
                    }
                }
                this.createPopup(this.canvas.width/2, this.canvas.height/2, `SCRAMBLE! +${filled}`, '#aa44ff');
                break;
                
            case 'mirrorBeat':
                // Mirror the pattern
                for (let row = 0; row < this.gridRows; row++) {
                    for (let col = 0; col < this.gridCols / 2; col++) {
                        const mirrorCol = this.gridCols - 1 - col;
                        if (this.grid[row][col] && !this.grid[row][mirrorCol]) {
                            this.grid[row][mirrorCol] = true;
                            this.aliens.push({
                                row,
                                col: mirrorCol,
                                x: mirrorCol * this.cellWidth + this.cellWidth / 2,
                                y: row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                                alive: true,
                                hp: this.upgrades.alienArmor ? 2 : 1
                            });
                        } else if (!this.grid[row][col] && this.grid[row][mirrorCol]) {
                            this.grid[row][col] = true;
                            this.aliens.push({
                                row,
                                col: col,
                                x: col * this.cellWidth + this.cellWidth / 2,
                                y: row * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                                alive: true,
                                hp: this.upgrades.alienArmor ? 2 : 1
                            });
                        }
                    }
                }
                this.createPopup(this.canvas.width/2, this.canvas.height/2, 'MIRROR BEAT!', '#aa44ff');
                break;
                
            // Repeatable upgrades
            case 'damageBoost':
                // TODO: implement damage scaling
                break;
            case 'hpBoost':
                this.defenderMaxHP += 15;
                this.defenderHP += 15;
                break;
            case 'speedBoost':
                this.defender.speed += 1;
                break;
        }
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
                        alive: true,
                        hp: this.upgrades.alienArmor ? 2 : 1,
                        maxHp: this.upgrades.alienArmor ? 2 : 1
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
        // Can't move if stunned
        if (this.defenderStunned > 0) return;
        
        const newX = this.defender.x + direction * this.defender.speed;
        if (newX >= 0 && newX <= this.canvas.width - this.defender.width) {
            this.defender.x = newX;
        }
    }

    updateAI() {
        if (!this.aiActive || this.isPaused || this.wavePhase !== 'playing') return;

        const defenderCenter = this.defender.x + this.defender.width / 2;
        const canvasCenter = this.canvas.width / 2;
        const atLeftWall = this.defender.x <= 5;
        const atRightWall = this.defender.x >= this.canvas.width - this.defender.width - 5;
        
        // Scan ALL incoming threats and find safest position
        let threatMap = new Array(16).fill(0); // divide screen into 16 zones
        const zoneWidth = this.canvas.width / 16;
        
        for (const proj of this.alienProjectiles) {
            const timeToImpact = (this.defender.y - proj.y) / proj.speed;
            if (timeToImpact > 0 && timeToImpact < 50) {
                const zone = Math.floor(proj.x / zoneWidth);
                const urgency = 1 / (timeToImpact + 1); // closer = more dangerous
                // Spread threat to neighboring zones
                for (let z = Math.max(0, zone - 1); z <= Math.min(15, zone + 1); z++) {
                    threatMap[z] += urgency * (z === zone ? 1.0 : 0.5);
                }
            }
        }
        
        const currentZone = Math.floor(defenderCenter / zoneWidth);
        const currentThreat = threatMap[currentZone] || 0;
        
        // Find movement direction
        let moveDir = 0;
        
        if (currentThreat > 0.3) {
            // Under fire — find safest nearby zone
            let bestZone = currentZone;
            let bestScore = Infinity;
            
            for (let z = Math.max(0, currentZone - 4); z <= Math.min(15, currentZone + 4); z++) {
                // Score = threat + distance penalty + wall penalty
                let score = threatMap[z] * 3;
                score += Math.abs(z - currentZone) * 0.1; // prefer nearby
                
                // Penalize corners heavily
                if (z <= 1 || z >= 14) score += 0.5;
                
                // Slight preference for center
                score += Math.abs(z - 8) * 0.02;
                
                if (score < bestScore) {
                    bestScore = score;
                    bestZone = z;
                }
            }
            
            if (bestZone < currentZone) moveDir = -1;
            else if (bestZone > currentZone) moveDir = 1;
            else if (atLeftWall) moveDir = 1;  // Unstick from walls
            else if (atRightWall) moveDir = -1;
        } else {
            // No immediate threat — hunt aliens but prefer center
            let nearestAlien = null;
            let minDistance = Infinity;

            for (const alien of this.aliens) {
                if (!alien.alive) continue;
                const distance = Math.abs(alien.x - defenderCenter);
                if (distance < minDistance) {
                    minDistance = distance;
                    nearestAlien = alien;
                }
            }

            if (nearestAlien && minDistance > 10) {
                moveDir = nearestAlien.x > defenderCenter ? 1 : -1;
            } else if (Math.abs(defenderCenter - canvasCenter) > 100) {
                // Drift back toward center when idle
                moveDir = canvasCenter > defenderCenter ? 1 : -1;
            }
        }
        
        if (moveDir !== 0) this.moveDefender(moveDir);
        
        // Shooting logic (independent of movement)
        const currentTime = Date.now();
        const effectiveShotDelay = this.activePowerUps.rapidFire > 0 ? this.shotDelay / 2 : this.shotDelay;
        if (currentTime - this.lastShotTime >= effectiveShotDelay) {
            const aliveAliens = this.aliens.filter(a => a.alive);
            if (aliveAliens.length > 0 && Math.random() < this.aiAccuracy) {
                for (let i = 0; i < this.aiShotsPerTurn; i++) {
                    this.shoot();
                }
            }
            this.lastShotTime = currentTime;
        }
        
        // Try to collect nearby power-ups when safe
        if (this.powerUps.length > 0 && currentThreat < 0.2) {
            let nearestPowerUp = null;
            let minDist = Infinity;
            
            for (const powerUp of this.powerUps) {
                const dist = Math.abs(powerUp.x - defenderCenter);
                if (dist < minDist && powerUp.y > this.defender.y - 100) {
                    minDist = dist;
                    nearestPowerUp = powerUp;
                }
            }
            
            if (nearestPowerUp && minDist < 150) {
                const powerUpDir = nearestPowerUp.x > defenderCenter ? 1 : -1;
                if (moveDir === 0) moveDir = powerUpDir;
            }
        }
    }

    shoot() {
        // Spread shot fires 3 bullets in a fan
        if (this.activePowerUps.spreadShot > 0) {
            const angles = [-15, 0, 15]; // degrees
            for (const angle of angles) {
                const radians = (angle * Math.PI) / 180;
                this.bullets.push({
                    x: this.defender.x + this.defender.width / 2,
                    y: this.defender.y,
                    width: 4,
                    height: 10,
                    speed: 10,
                    vx: Math.sin(radians) * 10,
                    vy: -Math.cos(radians) * 10,
                    trail: []
                });
            }
        } else {
            // Normal single shot
            this.bullets.push({
                x: this.defender.x + this.defender.width / 2,
                y: this.defender.y,
                width: 4,
                height: 10,
                speed: 10,
                vx: 0,
                vy: -10,
                trail: []
            });
        }
    }

    collectPowerUp(powerUp) {
        switch (powerUp.type) {
            case 'repair':
                this.defenderHP = Math.min(this.defenderHP + 10, this.defenderMaxHP);
                this.createPopup(powerUp.x, powerUp.y, '+10 HP', '#ff0000');
                if (this.defenderHP > this.defenderMaxHP * 0.25) {
                    this.defenderLowHP = false;
                }
                break;
            case 'shield':
                this.activePowerUps.shield += 2;
                this.createPopup(powerUp.x, powerUp.y, 'SHIELD +2', '#0088ff');
                break;
            case 'speed':
                this.activePowerUps.speedBoost = 600; // 10 seconds at 60fps
                const speedScale = 1 + ((this.bpm - 60) / (200 - 60)) * 1.5;
                this.defender.speed = Math.round(5 * speedScale) * 2;
                this.createPopup(powerUp.x, powerUp.y, 'SPEED BOOST!', '#ffff00');
                break;
            case 'rapidfire':
                this.activePowerUps.rapidFire = 600; // 10 seconds
                this.createPopup(powerUp.x, powerUp.y, 'RAPID FIRE!', '#00ff00');
                break;
            case 'spread':
                this.activePowerUps.spreadShot = 600; // 10 seconds
                this.createPopup(powerUp.x, powerUp.y, 'SPREAD SHOT!', '#ff8800');
                break;
        }
        
        // Visual/audio feedback
        this.createExplosion(powerUp.x, powerUp.y, true);
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

    dropPowerUp(x, y) {
        // Determine drop rate based on wave
        let dropChance = 0.2; // 20% default
        if (this.currentWave >= 6) dropChance = 0.4; // 40%
        else if (this.currentWave >= 3) dropChance = 0.3; // 30%
        
        // Loot Denial upgrade halves drop rate
        if (this.upgrades.lootDenial) {
            dropChance *= 0.5;
        }
        
        if (Math.random() > dropChance) return; // No drop
        
        // Weighted random selection
        const types = [
            { name: 'repair', weight: 30, color: '#ff0000', symbol: '+' },
            { name: 'shield', weight: 15, color: '#0088ff', symbol: '🛡' },
            { name: 'speed', weight: 20, color: '#ffff00', symbol: '⚡' },
            { name: 'rapidfire', weight: 20, color: '#00ff00', symbol: '▶▶' },
            { name: 'spread', weight: 15, color: '#ff8800', symbol: '◀▶' }
        ];
        
        const totalWeight = types.reduce((sum, t) => sum + t.weight, 0);
        let rand = Math.random() * totalWeight;
        let selectedType = types[0];
        
        for (const type of types) {
            rand -= type.weight;
            if (rand <= 0) {
                selectedType = type;
                break;
            }
        }
        
        this.powerUps.push({
            x, y,
            width: 20,
            height: 20,
            type: selectedType.name,
            color: selectedType.color,
            symbol: selectedType.symbol,
            speed: 1.5,
            pulse: 0
        });
    }

    alienShoot(alien) {
        // Count aliens on same column
        const aliensOnStep = this.aliens.filter(a => 
            a.col === alien.col && a.alive
        ).length;
        
        const colors = this.instrumentColors[alien.row];
        
        // Different weapons based on row/instrument
        const speedMultiplier = this.upgrades.doubleTime ? 1.5 : 1.0;
        
        if (alien.row === 0) {
            // Bass — Heavy Cannon
            let baseDamage = 12;
            if (aliensOnStep === 2) baseDamage = 15;
            if (aliensOnStep === 3) baseDamage = 18;
            
            this.alienProjectiles.push({
                type: 'cannon',
                x: alien.x,
                y: alien.y,
                width: 16,
                height: 16,
                speed: 2 * speedMultiplier,
                damage: baseDamage,
                color: colors.primary,
                row: alien.row,
                aliensOnStep,
                trail: []
            });
        } else if (alien.row === 1) {
            // Snare — Burst Fire (3 bullets with slight spread)
            let bulletDamage = 3;
            if (aliensOnStep >= 2) bulletDamage = 4;
            
            for (let i = 0; i < 3; i++) {
                const spread = (i - 1) * 8; // -8, 0, +8 pixels
                this.alienProjectiles.push({
                    type: 'burst',
                    x: alien.x + spread,
                    y: alien.y - (i * 6), // stagger vertically so they arrive at different times
                    width: 6,
                    height: 10,
                    speed: (4 + (i * 0.5)) * speedMultiplier,
                    damage: bulletDamage,
                    color: colors.primary,
                    row: alien.row,
                    aliensOnStep
                });
            }
        } else if (alien.row === 2) {
            // Hi-hat — Homing Missile
            let homingDamage = 6;
            if (aliensOnStep === 2) homingDamage = 8;
            if (aliensOnStep === 3) homingDamage = 10;
            
            this.alienProjectiles.push({
                type: 'homing',
                x: alien.x,
                y: alien.y,
                width: 8,
                height: 12,
                speed: 3 * speedMultiplier,
                damage: homingDamage,
                color: colors.primary,
                row: alien.row,
                aliensOnStep,
                trail: []
            });
        } else if (alien.row === 3) {
            // Tom/Perc — Scatter Shot (5 projectiles in wide fan -30° to +30°)
            let scatterDamage = 2; // Each projectile deals 2 damage
            
            const angles = [-30, -15, 0, 15, 30]; // degrees
            for (let i = 0; i < 5; i++) {
                const angle = angles[i];
                const radians = (angle * Math.PI) / 180;
                const speed = 4 * speedMultiplier;
                
                this.alienProjectiles.push({
                    type: 'scatter',
                    x: alien.x,
                    y: alien.y,
                    vx: Math.sin(radians) * speed,
                    vy: Math.cos(radians) * speed, // positive = downward
                    width: 4,
                    height: 8,
                    speed: speed,
                    damage: scatterDamage,
                    color: colors.primary,
                    row: alien.row,
                    aliensOnStep
                });
            }
        } else if (alien.row === 4) {
            // Cymbal/FX — EMP Pulse (expanding ring stun)
            this.alienProjectiles.push({
                type: 'emp',
                x: alien.x,
                y: alien.y,
                width: 0, // starts at 0, expands
                speed: 2 * speedMultiplier, // expansion speed (downward drift)
                damage: 0, // doesn't damage directly, only stuns
                color: colors.primary,
                row: alien.row,
                aliensOnStep,
                radius: 0, // current ring radius
                maxRadius: 80 // max expansion radius
            });
        }
        
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
        } else if (this.wavePhase === 'cardpick') {
            // Player is choosing a card - game is paused
            return;
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

        // Update fire zones (Napalm Rounds)
        for (let i = this.fireZones.length - 1; i >= 0; i--) {
            const zone = this.fireZones[i];
            zone.life--;
            
            // Check if defender is in fire zone
            const dist = Math.sqrt(
                Math.pow(zone.x - (this.defender.x + this.defender.width/2), 2) +
                Math.pow(zone.y - (this.defender.y + this.defender.height/2), 2)
            );
            
            if (dist < 20) {
                // Damage every 30 frames (2 damage per second at 60fps)
                zone.damageTimer = (zone.damageTimer || 0) + 1;
                if (zone.damageTimer >= 30) {
                    if (this.activePowerUps.shield > 0) {
                        this.activePowerUps.shield--;
                    } else {
                        this.defenderHP -= 2;
                        this.score += 2;
                        this.defenderDamageFlash = 0.5;
                        this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, '+2 BURN', '#ff6600');
                    }
                    zone.damageTimer = 0;
                }
            }
            
            if (zone.life <= 0) {
                this.fireZones.splice(i, 1);
            }
        }

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
        
        // Update defender stun
        if (this.defenderStunned > 0) {
            this.defenderStunned--;
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
            
            // Use vx/vy if available (for spread shot), otherwise use speed
            if (bullet.vx !== undefined && bullet.vy !== undefined) {
                bullet.x += bullet.vx;
                bullet.y += bullet.vy;
            } else {
                bullet.y -= bullet.speed;
            }
            
            let hitAlien = false;
            for (let j = 0; j < this.aliens.length; j++) {
                const alien = this.aliens[j];
                if (alien.alive && this.checkCollision(bullet, alien)) {
                    // Decrement alien HP
                    if (!alien.hp) alien.hp = 1; // Backwards compatibility
                    alien.hp--;
                    
                    if (alien.hp <= 0) {
                        // Kill alien for this loop only
                        alien.alive = false;
                        
                        // Quick Respawn - set respawn counter
                        if (this.upgrades.quickRespawn) {
                            alien.respawnIn = 8; // 8 steps
                        }
                        
                        this.createDebris(alien.x, alien.y, alien.row);
                        this.createExplosion(alien.x, alien.y, false);
                        this.addShake(4);
                        
                        // Drop power-up chance
                        this.dropPowerUp(alien.x, alien.y);
                    } else {
                        // Hit but not dead - flash white
                        alien.hitFlash = 10;
                        this.createPopup(alien.x, alien.y, `${alien.hp} HP`, '#ffffff');
                        this.addShake(2);
                    }
                    
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
            
            // Handle different projectile behaviors
            if (proj.type === 'homing') {
                // Homing missile — track defender
                const defenderCenterX = this.defender.x + this.defender.width / 2;
                const dx = defenderCenterX - proj.x;
                const trackingSpeed = this.upgrades.homingBoost ? 1.2 : 0.5;
                proj.x += Math.sign(dx) * Math.min(Math.abs(dx), trackingSpeed);
                
                // Trail for homing missiles
                if (!proj.trail) proj.trail = [];
                proj.trail.push({ x: proj.x, y: proj.y });
                if (proj.trail.length > 8) proj.trail.shift();
            } else if (proj.type === 'cannon') {
                // Heavy cannon — add trail
                if (!proj.trail) proj.trail = [];
                proj.trail.push({ x: proj.x, y: proj.y });
                if (proj.trail.length > 6) proj.trail.shift();
            } else if (proj.type === 'scatter') {
                // Scatter shot — moves in angled direction
                proj.x += proj.vx;
                proj.y += proj.vy;
                
                // Remove if off-screen
                if (proj.x < 0 || proj.x > this.canvas.width) {
                    this.alienProjectiles.splice(i, 1);
                    continue;
                }
            } else if (proj.type === 'emp') {
                // EMP pulse — expands outward
                proj.radius += 3; // expansion rate
                proj.y += proj.speed; // drifts down slowly
                
                // Check if ring reaches defender's Y level
                const defenderCenterY = this.defender.y + this.defender.height / 2;
                if (Math.abs(proj.y - defenderCenterY) < 10 && proj.radius > 20) {
                    const defenderCenterX = this.defender.x + this.defender.width / 2;
                    const dist = Math.abs(proj.x - defenderCenterX);
                    
                    // Check if defender is within ring radius
                    if (dist < proj.radius && dist > proj.radius - 15) {
                        // Stun defender for 0.5 seconds (30 frames at 60fps)
                        this.defenderStunned = 30;
                        this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, 'STUNNED!', '#ffd700');
                        this.addShake(5);
                    }
                }
                
                // Remove if too large or off-screen
                if (proj.radius > proj.maxRadius || proj.y > this.canvas.height + 100) {
                    this.alienProjectiles.splice(i, 1);
                    continue;
                }
            }
            
            // Move projectile downward (except scatter which uses vx/vy, and emp which has custom movement)
            if (proj.type !== 'scatter' && proj.type !== 'emp') {
                proj.y += proj.speed;
            }
            
            // Skip collision for EMP (it handles its own collision above)
            if (proj.type === 'emp') {
                continue;
            }
            
            // Check direct collision with defender
            let hitDefender = false;
            if (proj.y >= this.defender.y && 
                proj.y <= this.defender.y + this.defender.height &&
                proj.x >= this.defender.x &&
                proj.x <= this.defender.x + this.defender.width) {
                hitDefender = true;
            }
            
            // Heavy cannon blast radius
            if (proj.type === 'cannon' && !hitDefender) {
                const defenderCenterX = this.defender.x + this.defender.width / 2;
                const defenderCenterY = this.defender.y + this.defender.height / 2;
                const dist = Math.sqrt(
                    Math.pow(proj.x - defenderCenterX, 2) + 
                    Math.pow(proj.y - defenderCenterY, 2)
                );
                
                if (dist < 30) {
                    // Near miss — half damage
                    hitDefender = true;
                    proj.damage = Math.floor(proj.damage / 2);
                    this.createPopup(proj.x, proj.y, 'BLAST!', '#ff6600');
                }
            }
            
            if (hitDefender) {
                // Check shield first
                if (this.activePowerUps.shield > 0) {
                    this.activePowerUps.shield--;
                    this.createPopup(this.defender.x + this.defender.width/2, this.defender.y, 
                        'BLOCKED!', '#0088ff');
                    this.createExplosion(proj.x, proj.y, false);
                    this.alienProjectiles.splice(i, 1);
                    continue;
                }
                
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
                
                // Napalm Rounds - create fire zone on cannon hit
                if (this.upgrades.napalmRounds && proj.type === 'cannon') {
                    this.fireZones.push({
                        x: proj.x,
                        y: proj.y,
                        life: 180, // 3 seconds at 60fps
                        damageTimer: 0
                    });
                }
                
                // Chain Lightning - spawn arc shot on snare burst hit
                if (this.upgrades.chainLightning && proj.type === 'burst') {
                    const angle = Math.random() * Math.PI * 2;
                    this.alienProjectiles.push({
                        type: 'burst',
                        x: proj.x,
                        y: proj.y,
                        width: 6,
                        height: 10,
                        speed: 4,
                        damage: 3,
                        color: '#ffff00',
                        row: proj.row,
                        aliensOnStep: 1
                    });
                }
                
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

        // Update power-ups
        for (let i = this.powerUps.length - 1; i >= 0; i--) {
            const powerUp = this.powerUps[i];
            powerUp.y += powerUp.speed;
            powerUp.pulse = (powerUp.pulse + 0.1) % (Math.PI * 2);
            
            // Check collision with defender
            if (powerUp.y >= this.defender.y && 
                powerUp.y <= this.defender.y + this.defender.height &&
                powerUp.x >= this.defender.x - 10 &&
                powerUp.x <= this.defender.x + this.defender.width + 10) {
                
                // Collect power-up!
                this.collectPowerUp(powerUp);
                this.powerUps.splice(i, 1);
            } else if (powerUp.y > this.canvas.height) {
                // Missed power-up
                this.powerUps.splice(i, 1);
            }
        }

        // Update active power-up timers
        if (this.activePowerUps.speedBoost > 0) {
            this.activePowerUps.speedBoost--;
            if (this.activePowerUps.speedBoost === 0) {
                // Restore normal speed
                const speedScale = 1 + ((this.bpm - 60) / (200 - 60)) * 1.5;
                this.defender.speed = Math.round(5 * speedScale);
            }
        }
        if (this.activePowerUps.rapidFire > 0) {
            this.activePowerUps.rapidFire--;
        }
        if (this.activePowerUps.spreadShot > 0) {
            this.activePowerUps.spreadShot--;
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
                        
                        // Volley Fire upgrade - shoot twice
                        if (this.upgrades.volleyFire) {
                            this.alienShoot(alien);
                        }
                        
                        const shakeIntensities = [8 + this.intensity * 4, 5, 2];
                        this.addShake(shakeIntensities[row]);
                        
                        this.stars.forEach(star => {
                            if (Math.random() < 0.3) star.pulse = 1.0;
                        });
                    }
                }
            }
        }

        // Update alien respawn counters (Quick Respawn upgrade)
        if (this.upgrades.quickRespawn) {
            for (const alien of this.aliens) {
                if (!alien.alive && alien.respawnIn !== undefined) {
                    alien.respawnIn--;
                    if (alien.respawnIn <= 0) {
                        alien.alive = true;
                        alien.hp = alien.maxHp || 1;
                        delete alien.respawnIn;
                        this.createExplosion(alien.x, alien.y, true);
                        this.createPopup(alien.x, alien.y, 'RESPAWN!', '#00ffff');
                    }
                }
            }
        }
        
        // Decay alien hit flash
        for (const alien of this.aliens) {
            if (alien.hitFlash && alien.hitFlash > 0) {
                alien.hitFlash--;
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
        
        // Show card selection
        this.currentCardChoices = this.generateCardChoices();
        this.wavePhase = 'cardpick';
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
                
                // Hit flash effect - flash white when hit
                if (alien.hitFlash && alien.hitFlash > 0) {
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.strokeStyle = '#ffffff';
                } else {
                    this.ctx.fillStyle = colors.primary;
                    this.ctx.strokeStyle = colors.secondary;
                }
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
                        
                    case 3: // Tom/Perc - Diamond shape
                        this.ctx.beginPath();
                        this.ctx.moveTo(alien.x, alien.y - 12);
                        this.ctx.lineTo(alien.x + 12, alien.y);
                        this.ctx.lineTo(alien.x, alien.y + 12);
                        this.ctx.lineTo(alien.x - 12, alien.y);
                        this.ctx.closePath();
                        this.ctx.fill();
                        this.ctx.stroke();
                        break;
                        
                    case 4: // Cymbal/FX - Star shape (5-pointed)
                        this.ctx.beginPath();
                        const starPoints = 5;
                        const outerRadius = 15;
                        const innerRadius = 6;
                        for (let p = 0; p < starPoints * 2; p++) {
                            const angle = (Math.PI * 2 * p) / (starPoints * 2) - Math.PI / 2;
                            const radius = p % 2 === 0 ? outerRadius : innerRadius;
                            const px = alien.x + Math.cos(angle) * radius;
                            const py = alien.y + Math.sin(angle) * radius;
                            if (p === 0) {
                                this.ctx.moveTo(px, py);
                            } else {
                                this.ctx.lineTo(px, py);
                            }
                        }
                        this.ctx.closePath();
                        this.ctx.fill();
                        this.ctx.stroke();
                        break;
                }
                this.ctx.lineWidth = 1;
                
                // Draw HP bar if alien has more than 1 HP
                if (alien.maxHp && alien.maxHp > 1) {
                    const hpBarWidth = 30;
                    const hpBarHeight = 4;
                    const hpBarX = alien.x - hpBarWidth/2;
                    const hpBarY = alien.y - 25;
                    
                    this.ctx.strokeStyle = '#ffffff';
                    this.ctx.lineWidth = 1;
                    this.ctx.strokeRect(hpBarX, hpBarY, hpBarWidth, hpBarHeight);
                    
                    const hpPercent = (alien.hp || 1) / alien.maxHp;
                    this.ctx.fillStyle = hpPercent > 0.5 ? '#00ff00' : '#ff0000';
                    this.ctx.fillRect(hpBarX + 1, hpBarY + 1, (hpBarWidth - 2) * hpPercent, hpBarHeight - 2);
                }
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
        const defenderStunned = this.defenderStunned > 0;
        this.ctx.fillStyle = defenderFlash ? '#ff0000' : (defenderStunned ? '#8888ff' : '#00ff00');
        
        // Stun visual — yellow electric sparks
        if (defenderStunned) {
            for (let s = 0; s < 5; s++) {
                const angle = Math.random() * Math.PI * 2;
                const dist = 20 + Math.random() * 10;
                const sparkX = this.defender.x + this.defender.width/2 + Math.cos(angle) * dist;
                const sparkY = this.defender.y + this.defender.height/2 + Math.sin(angle) * dist;
                
                this.ctx.strokeStyle = '#ffd700';
                this.ctx.lineWidth = 2;
                this.ctx.globalAlpha = 0.7;
                this.ctx.beginPath();
                this.ctx.moveTo(this.defender.x + this.defender.width/2, this.defender.y + this.defender.height/2);
                this.ctx.lineTo(sparkX, sparkY);
                this.ctx.stroke();
            }
            this.ctx.globalAlpha = 1;
            this.ctx.lineWidth = 1;
        }
        
        // Shield visual — blue pulsing ring
        if (this.activePowerUps.shield > 0) {
            const shieldPulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
            this.ctx.strokeStyle = '#0088ff';
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = shieldPulse * 0.7;
            this.ctx.beginPath();
            this.ctx.arc(
                this.defender.x + this.defender.width / 2,
                this.defender.y + this.defender.height / 2,
                30,
                0,
                Math.PI * 2
            );
            this.ctx.stroke();
            this.ctx.globalAlpha = 1;
            this.ctx.lineWidth = 1;
        }
        
        // Speed boost — yellow afterimages/speed lines
        if (this.activePowerUps.speedBoost > 0) {
            this.ctx.strokeStyle = '#ffff00';
            this.ctx.lineWidth = 2;
            this.ctx.globalAlpha = 0.4;
            for (let i = 0; i < 3; i++) {
                this.ctx.beginPath();
                this.ctx.moveTo(this.defender.x - 5 - i * 8, this.defender.y + 15);
                this.ctx.lineTo(this.defender.x - 15 - i * 8, this.defender.y + 15);
                this.ctx.moveTo(this.defender.x + this.defender.width + 5 + i * 8, this.defender.y + 15);
                this.ctx.lineTo(this.defender.x + this.defender.width + 15 + i * 8, this.defender.y + 15);
                this.ctx.stroke();
            }
            this.ctx.globalAlpha = 1;
            this.ctx.lineWidth = 1;
        }
        
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
        
        // Rapid fire — green glow on gun barrel
        if (this.activePowerUps.rapidFire > 0) {
            this.ctx.shadowBlur = 10;
            this.ctx.shadowColor = '#00ff00';
            this.ctx.fillStyle = '#00ff00';
        }
        this.ctx.fillRect(
            this.defender.x + this.defender.width/2 - 2,
            this.defender.y - 8,
            4,
            12
        );
        this.ctx.shadowBlur = 0;
        
        // Spread shot — orange fan lines on barrel
        if (this.activePowerUps.spreadShot > 0) {
            this.ctx.strokeStyle = '#ff8800';
            this.ctx.lineWidth = 2;
            this.ctx.beginPath();
            this.ctx.moveTo(this.defender.x + this.defender.width/2, this.defender.y - 8);
            this.ctx.lineTo(this.defender.x + this.defender.width/2 - 10, this.defender.y - 15);
            this.ctx.moveTo(this.defender.x + this.defender.width/2, this.defender.y - 8);
            this.ctx.lineTo(this.defender.x + this.defender.width/2 + 10, this.defender.y - 15);
            this.ctx.stroke();
            this.ctx.lineWidth = 1;
        }

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

        // Draw fire zones (Napalm Rounds)
        for (const zone of this.fireZones) {
            const alpha = zone.life / 180;
            const flicker = Math.sin(Date.now() / 50) * 0.3 + 0.7;
            
            this.ctx.globalAlpha = alpha * flicker * 0.6;
            const gradient = this.ctx.createRadialGradient(zone.x, zone.y, 0, zone.x, zone.y, 20);
            gradient.addColorStop(0, '#ff6600');
            gradient.addColorStop(0.5, '#ff3300');
            gradient.addColorStop(1, 'transparent');
            this.ctx.fillStyle = gradient;
            this.ctx.beginPath();
            this.ctx.arc(zone.x, zone.y, 20, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.globalAlpha = 1;
        }

        // Draw power-ups
        for (const powerUp of this.powerUps) {
            const pulse = Math.sin(powerUp.pulse) * 0.3 + 1;
            
            // Glow effect
            this.ctx.shadowBlur = 15 * pulse;
            this.ctx.shadowColor = powerUp.color;
            
            // Draw box
            this.ctx.fillStyle = powerUp.color;
            this.ctx.globalAlpha = 0.8;
            this.ctx.fillRect(
                powerUp.x - powerUp.width/2,
                powerUp.y - powerUp.height/2,
                powerUp.width,
                powerUp.height
            );
            this.ctx.globalAlpha = 1;
            
            // Draw symbol
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(powerUp.symbol, powerUp.x, powerUp.y);
            
            this.ctx.shadowBlur = 0;
        }
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';

        // Draw bullets
        for (const bullet of this.bullets) {
            for (let i = 0; i < bullet.trail.length; i++) {
                const t = bullet.trail[i];
                if (!t || t.x === undefined) continue;
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
            if (!proj || proj.x === undefined || proj.y === undefined) continue;
            if (proj.type === 'cannon') {
                // Heavy Cannon — large glowing orb with trail
                if (proj.trail) {
                    for (let i = 0; i < proj.trail.length; i++) {
                        const t = proj.trail[i];
                        if (!t || t.x === undefined) continue;
                        const alpha = (i + 1) / proj.trail.length * 0.6;
                        this.ctx.globalAlpha = alpha;
                        this.ctx.fillStyle = '#ff6600';
                        this.ctx.beginPath();
                        this.ctx.arc(t.x, t.y, 6, 0, Math.PI * 2);
                        this.ctx.fill();
                    }
                    this.ctx.globalAlpha = 1;
                }
                
                // Main orb
                const gradient = this.ctx.createRadialGradient(proj.x, proj.y, 0, proj.x, proj.y, 8);
                gradient.addColorStop(0, '#ffff00');
                gradient.addColorStop(0.5, '#ff4400');
                gradient.addColorStop(1, '#ff0000');
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = '#ff4400';
                this.ctx.fillStyle = gradient;
                this.ctx.beginPath();
                this.ctx.arc(proj.x, proj.y, 8, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            } else if (proj.type === 'burst') {
                // Burst Fire — blue/white streaks
                this.ctx.shadowBlur = 8;
                this.ctx.shadowColor = '#00aaff';
                this.ctx.fillStyle = '#ffffff';
                this.ctx.fillRect(proj.x - 2, proj.y, 4, 10);
                this.ctx.fillStyle = '#00aaff';
                this.ctx.fillRect(proj.x - 1, proj.y + 2, 2, 6);
                this.ctx.shadowBlur = 0;
            } else if (proj.type === 'homing') {
                // Homing Missile — purple with curved trail
                if (proj.trail && proj.trail.length > 1 && proj.trail[0]) {
                    this.ctx.strokeStyle = '#cc00ff';
                    this.ctx.lineWidth = 2;
                    this.ctx.globalAlpha = 0.5;
                    this.ctx.beginPath();
                    this.ctx.moveTo(proj.trail[0].x, proj.trail[0].y);
                    for (let i = 1; i < proj.trail.length; i++) {
                        if (!proj.trail[i]) continue;
                        this.ctx.lineTo(proj.trail[i].x, proj.trail[i].y);
                    }
                    this.ctx.stroke();
                    this.ctx.globalAlpha = 1;
                    this.ctx.lineWidth = 1;
                }
                
                // Main missile
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = '#cc00ff';
                this.ctx.fillStyle = '#ff00ff';
                this.ctx.fillRect(proj.x - 4, proj.y, 8, 12);
                this.ctx.fillStyle = '#cc00ff';
                this.ctx.beginPath();
                this.ctx.moveTo(proj.x, proj.y);
                this.ctx.lineTo(proj.x - 4, proj.y + 4);
                this.ctx.lineTo(proj.x + 4, proj.y + 4);
                this.ctx.closePath();
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            } else if (proj.type === 'scatter') {
                // Scatter Shot — small cyan bullets
                this.ctx.shadowBlur = 6;
                this.ctx.shadowColor = proj.color;
                this.ctx.fillStyle = proj.color;
                this.ctx.beginPath();
                this.ctx.arc(proj.x, proj.y, 3, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            } else if (proj.type === 'emp') {
                // EMP Pulse — expanding gold ring
                const alpha = 1 - (proj.radius / proj.maxRadius);
                this.ctx.globalAlpha = alpha * 0.8;
                this.ctx.strokeStyle = proj.color;
                this.ctx.lineWidth = 4;
                this.ctx.shadowBlur = 15;
                this.ctx.shadowColor = proj.color;
                this.ctx.beginPath();
                this.ctx.arc(proj.x, proj.y, proj.radius, 0, Math.PI * 2);
                this.ctx.stroke();
                
                // Inner ring
                this.ctx.lineWidth = 2;
                this.ctx.strokeStyle = '#ffff00';
                this.ctx.beginPath();
                this.ctx.arc(proj.x, proj.y, proj.radius - 5, 0, Math.PI * 2);
                this.ctx.stroke();
                
                this.ctx.shadowBlur = 0;
                this.ctx.globalAlpha = 1;
                this.ctx.lineWidth = 1;
            } else {
                // Default/fallback
                this.ctx.shadowBlur = 10;
                this.ctx.shadowColor = proj.color;
                this.ctx.fillStyle = proj.color;
                this.ctx.fillRect(proj.x - proj.width/2, proj.y, proj.width, proj.height);
                this.ctx.shadowBlur = 0;
            }
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

        // Draw active buff icons
        let iconX = 10;
        const iconY = this.canvas.height - 60;
        const iconSize = 30;
        
        if (this.activePowerUps.shield > 0) {
            this.ctx.fillStyle = '#0088ff';
            this.ctx.fillRect(iconX, iconY, iconSize, iconSize);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('🛡', iconX + iconSize/2, iconY + iconSize/2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px "Courier New"';
            this.ctx.fillText(this.activePowerUps.shield, iconX + iconSize/2, iconY + iconSize + 10);
            iconX += iconSize + 5;
        }
        
        if (this.activePowerUps.speedBoost > 0) {
            this.ctx.fillStyle = '#ffff00';
            this.ctx.fillRect(iconX, iconY, iconSize, iconSize);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 20px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('⚡', iconX + iconSize/2, iconY + iconSize/2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px "Courier New"';
            const speedSecs = Math.ceil(this.activePowerUps.speedBoost / 60);
            this.ctx.fillText(speedSecs + 's', iconX + iconSize/2, iconY + iconSize + 10);
            iconX += iconSize + 5;
        }
        
        if (this.activePowerUps.rapidFire > 0) {
            this.ctx.fillStyle = '#00ff00';
            this.ctx.fillRect(iconX, iconY, iconSize, iconSize);
            this.ctx.fillStyle = '#000000';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('▶▶', iconX + iconSize/2, iconY + iconSize/2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px "Courier New"';
            const rapidSecs = Math.ceil(this.activePowerUps.rapidFire / 60);
            this.ctx.fillText(rapidSecs + 's', iconX + iconSize/2, iconY + iconSize + 10);
            iconX += iconSize + 5;
        }
        
        if (this.activePowerUps.spreadShot > 0) {
            this.ctx.fillStyle = '#ff8800';
            this.ctx.fillRect(iconX, iconY, iconSize, iconSize);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 16px Arial';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText('◀▶', iconX + iconSize/2, iconY + iconSize/2);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px "Courier New"';
            const spreadSecs = Math.ceil(this.activePowerUps.spreadShot / 60);
            this.ctx.fillText(spreadSecs + 's', iconX + iconSize/2, iconY + iconSize + 10);
            iconX += iconSize + 5;
        }
        
        this.ctx.textAlign = 'left';
        this.ctx.textBaseline = 'alphabetic';

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
        } else if (this.wavePhase === 'cardpick') {
            // Card selection overlay
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Title
            this.ctx.fillStyle = '#ffff00';
            this.ctx.font = 'bold 36px "Courier New"';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('CHOOSE AN UPGRADE', this.canvas.width / 2, 80);
            
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = '20px "Courier New"';
            this.ctx.fillText(`Wave ${this.currentWave} Complete`, this.canvas.width / 2, 115);
            
            // Draw 3 cards
            const cardWidth = 180;
            const cardHeight = 250;
            const gap = 20;
            const totalWidth = (cardWidth * 3) + (gap * 2);
            const startX = (this.canvas.width - totalWidth) / 2;
            const startY = this.canvas.height / 2 - cardHeight / 2;
            
            for (let i = 0; i < 3; i++) {
                const card = this.currentCardChoices[i];
                if (!card) continue;
                
                const cardX = startX + (i * (cardWidth + gap));
                const isHovered = i === this.hoveredCardIndex;
                const scale = isHovered ? 1.05 : 1.0;
                const glow = isHovered ? 15 : 0;
                
                this.ctx.save();
                this.ctx.translate(cardX + cardWidth/2, startY + cardHeight/2);
                this.ctx.scale(scale, scale);
                this.ctx.translate(-cardWidth/2, -cardHeight/2);
                
                // Card background
                this.ctx.fillStyle = '#1a1a1a';
                this.ctx.roundRect(0, 0, cardWidth, cardHeight, 10);
                this.ctx.fill();
                
                // Border based on rarity
                this.ctx.strokeStyle = card.color;
                this.ctx.lineWidth = isHovered ? 4 : 3;
                if (glow > 0) {
                    this.ctx.shadowBlur = glow;
                    this.ctx.shadowColor = card.color;
                }
                this.ctx.roundRect(0, 0, cardWidth, cardHeight, 10);
                this.ctx.stroke();
                this.ctx.shadowBlur = 0;
                this.ctx.lineWidth = 1;
                
                // Icon/emoji at top
                this.ctx.font = '60px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(card.icon, cardWidth/2, 70);
                
                // Card name
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = 'bold 18px "Courier New"';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(card.name, cardWidth/2, 140);
                
                // Description
                this.ctx.fillStyle = '#aaaaaa';
                this.ctx.font = '14px "Courier New"';
                const words = card.desc.split(' ');
                let line = '';
                let y = 180;
                for (let w = 0; w < words.length; w++) {
                    const testLine = line + words[w] + ' ';
                    const metrics = this.ctx.measureText(testLine);
                    if (metrics.width > cardWidth - 20 && w > 0) {
                        this.ctx.fillText(line, cardWidth/2, y);
                        line = words[w] + ' ';
                        y += 18;
                    } else {
                        line = testLine;
                    }
                }
                this.ctx.fillText(line, cardWidth/2, y);
                
                // Rarity label at bottom
                this.ctx.fillStyle = card.color;
                this.ctx.font = 'bold 12px "Courier New"';
                this.ctx.fillText(card.rarity.toUpperCase(), cardWidth/2, cardHeight - 20);
                
                this.ctx.restore();
            }
            
            this.ctx.textAlign = 'left';
            this.ctx.textBaseline = 'alphabetic';
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
