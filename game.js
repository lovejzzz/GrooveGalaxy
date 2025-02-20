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
                )
            );



            this.isInitialized = true;
        } catch (error) {
            console.error('Error loading sounds:', error);
        }
    }

    playSound(index) {
        if (!this.isInitialized) return;
        
        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds[this.soundOrder[index]];
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
        
        // AI settings
        this.lastShotTime = 0;
        this.shotDelay = 300; // Slower shooting speed (higher number = slower shooting)
        this.aiAccuracy = 1.0; // Perfect accuracy
        this.aiActive = false; // Track if AI is active, starts false until first beat
        this.defender = {
            x: this.canvas.width / 2,
            y: this.canvas.height - 50,
            width: 40,
            height: 30,
            speed: 5, // Base speed - will be adjusted by BPM
        };
        
        this.gridCols = 16;
        this.gridRows = 3;
        this.cellWidth = this.canvas.width / this.gridCols;
        this.cellHeight = 40;
        this.gridYOffset = 100;
        
        this.grid = Array(this.gridRows).fill().map(() => Array(this.gridCols).fill(false));
        this.aliens = [];
        this.bullets = [];
        this.explosions = [];
        this.currentStep = 0;
        this.lastStepTime = 0;
        this.bpm = 120;
        this.stepInterval = (60 / this.bpm) * 1000 / 4; // 16th notes
        
        this.gameOver = false; // Kept for structure, but no longer triggers end
        this.isPaused = false;
        this.isStarted = false;
        this.controlButton = document.getElementById('controlButton');
        
        this.drumMachine = new DrumMachine();
        // Setup BPM control
        this.bpmControl = document.getElementById('bpm-control');
        this.bpmValue = document.getElementById('bpm-value');
        this.setupEventListeners();
    }

    init() {
        // Initialize game state only
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Setup BPM control
        this.bpmControl.addEventListener('input', () => {
            const newBpm = parseInt(this.bpmControl.value);
            this.bpm = newBpm;
            this.bpmValue.textContent = newBpm;
            this.stepInterval = (60 / this.bpm) * 1000 / 4; // Update step interval
            
            // Update defender speed based on BPM
            // Scale from base speed at 60 BPM to 2.5x speed at 200 BPM
            const speedScale = 1 + ((this.bpm - 60) / (200 - 60)) * 1.5;
            this.defender.speed = Math.round(5 * speedScale); // Base speed is 5
        });

        // Initialize control button
        this.controlButton.onclick = async () => {
            if (!this.isStarted) {
                // First click - Start the game
                await this.drumMachine.init();
                this.isStarted = true;
                this.animate();
                this.controlButton.textContent = 'Pause';
                // Play title animation once
                const titleImage = document.querySelector('.title-image');
                titleImage.classList.add('shine');
                // Remove shine class after animation completes
                setTimeout(() => {
                    titleImage.classList.remove('shine');
                }, 2500); // Same duration as animation
            } else {
                // Subsequent clicks - Toggle pause
                this.togglePause();
                // Just toggle pause, no more shine effect
                
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
            // Removed Enter key logic since AI activates on first beat
        });

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            // Calculate the actual position in the canvas coordinate space
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            const canvasX = (x * scaleX);
            const canvasY = (y * scaleY);
            
            const col = Math.floor(canvasX / this.cellWidth);
            const clickedRow = Math.floor((canvasY - this.gridYOffset) / this.cellHeight);
            
            // Only proceed if click is within valid grid area
            if (canvasY >= this.gridYOffset && 
                canvasY <= this.gridYOffset + this.gridRows * this.cellHeight && 
                col >= 0 && col < this.gridCols &&
                clickedRow >= 0 && clickedRow < this.gridRows) {
                
                // Toggle the beat on/off
                if (this.grid[clickedRow][col]) {
                    // Remove the alien
                    this.grid[clickedRow][col] = false;
                    this.aliens = this.aliens.filter(alien => 
                        !(alien.row === clickedRow && alien.col === col));
                } else {
                    // Add new alien
                    this.grid[clickedRow][col] = true;
                    this.aliens.push({
                        row: clickedRow,
                        col,
                        x: col * this.cellWidth + this.cellWidth / 2,
                        y: clickedRow * this.cellHeight + this.gridYOffset + this.cellHeight / 2,
                        alive: true
                    });
                    // Activate AI on first beat if not already active
                    if (!this.aiActive && this.isStarted) {
                        this.aiActive = true;
                        console.log('AI Activated on first beat');
                    }
                }
            }
        });

        document.getElementById('startButton').addEventListener('click', () => {
            this.init();
        });
    }

    moveDefender(direction) {
        const newX = this.defender.x + direction * this.defender.speed;
        if (newX >= 0 && newX <= this.canvas.width - this.defender.width) {
            this.defender.x = newX;
        }
    }

    updateAI() {
        if (!this.aiActive || this.isPaused) return;

        // Find nearest living alien
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

        // Move towards nearest alien
        if (nearestAlien) {
            const defenderCenter = this.defender.x + this.defender.width / 2;
            const direction = nearestAlien.x > defenderCenter ? 1 : -1;
            this.moveDefender(direction);

            // Shoot if enough time has passed
            const currentTime = Date.now();
            if (currentTime - this.lastShotTime >= this.shotDelay) {
                this.shoot();
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
            
            // Handle audio context state
            if (this.isPaused) {
                this.drumMachine.audioContext.suspend();
            } else {
                this.drumMachine.audioContext.resume();
            }
        }
    }

    update() {
        if (this.isPaused) return;

        // Update AI
        if (this.aiActive) {
            this.updateAI();
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const bullet = this.bullets[i];
            bullet.y -= bullet.speed;
            
            // Check for collisions with aliens
            for (const alien of this.aliens) {
                if (alien.alive && this.checkCollision(bullet, alien)) {
                    alien.alive = false;
                    this.grid[alien.row][alien.col] = false;
                    this.bullets.splice(i, 1);
                    this.createExplosion(alien.x, alien.y);
                    break;
                }
            }
            
            // Remove bullets that are off screen
            if (bullet.y < 0) {
                this.bullets.splice(i, 1);
            }
        }

        // Update drum sequence
        const currentTime = performance.now();
        if (currentTime - this.lastStepTime >= this.stepInterval) {
            this.lastStepTime = currentTime;
            this.currentStep = (this.currentStep + 1) % this.gridCols;
            
            // Play sounds for active aliens and update AI
            let hasBeatsInCurrentStep = false;
            for (let row = 0; row < this.gridRows; row++) {
                if (this.grid[row][this.currentStep]) {
                    this.drumMachine.playSound(row);
                    hasBeatsInCurrentStep = true;
                }
            }
            
            // Update AI on beat
            if (this.aiActive) {
                this.updateAI();
            }
        }

        // Removed game over check to keep game running indefinitely
    }

    createExplosion(x, y) {
        this.explosions.push({
            x,
            y,
            frame: 0,
            maxFrames: 20 // Duration of explosion animation
        });
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

        // Draw grid
        for (let row = 0; row < this.gridRows; row++) {
            for (let col = 0; col < this.gridCols; col++) {
                this.ctx.strokeStyle = col % 4 === 0 ? '#008800' : '#00ff00';
                this.ctx.strokeRect(
                    col * this.cellWidth,
                    row * this.cellHeight + this.gridYOffset,
                    this.cellWidth,
                    this.cellHeight
                );
            }
        }

        // Draw current step indicator
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
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
                        // Main body
                        this.ctx.beginPath();
                        this.ctx.rect(alien.x - 20, alien.y - 8, 40, 16);
                        this.ctx.fill();
                        // Top turret
                        this.ctx.beginPath();
                        this.ctx.rect(alien.x - 10, alien.y - 12, 20, 8);
                        this.ctx.fill();
                        // Side wings
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
                        // Main body
                        this.ctx.beginPath();
                        this.ctx.moveTo(alien.x, alien.y - 15);
                        this.ctx.lineTo(alien.x + 15, alien.y + 5);
                        this.ctx.lineTo(alien.x - 15, alien.y + 5);
                        this.ctx.closePath();
                        this.ctx.fill();
                        // Cockpit
                        this.ctx.beginPath();
                        this.ctx.arc(alien.x, alien.y - 5, 5, 0, Math.PI * 2);
                        this.ctx.fill();
                        break;
                        
                    case 2: // Hi-hat - Classic UFO
                        // UFO body
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y, 20, 8, 0, 0, Math.PI * 2);
                        this.ctx.fill();
                        // UFO dome
                        this.ctx.beginPath();
                        this.ctx.ellipse(alien.x, alien.y - 5, 10, 10, 0, Math.PI, 0);
                        this.ctx.fill();
                        break;
                }
            }
        }

        // Draw defender
        this.ctx.fillStyle = '#00ff00';
        // Draw tank body
        this.ctx.fillRect(
            this.defender.x,
            this.defender.y + 10,
            this.defender.width,
            this.defender.height - 10
        );
        // Draw tank turret
        this.ctx.beginPath();
        this.ctx.roundRect(
            this.defender.x + this.defender.width/4,
            this.defender.y,
            this.defender.width/2,
            15,
            5
        );
        this.ctx.fill();
        // Draw tank barrel
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

        // Draw explosions
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const explosion = this.explosions[i];
            
            const radius = (explosion.frame / explosion.maxFrames) * 30;
            const opacity = 1 - (explosion.frame / explosion.maxFrames);
            
            this.ctx.beginPath();
            this.ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
            this.ctx.fillStyle = `rgba(0, 255, 0, ${opacity})`;
            this.ctx.fill();
            
            explosion.frame++;
            if (explosion.frame >= explosion.maxFrames) {
                this.explosions.splice(i, 1);
            }
        }

        // Removed game over message since game continues indefinitely
    }

    animate() {
        if (!this.isPaused) {
            this.update();
            this.draw();
        }
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize the game
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.init();


    // Set up keyboard controls
    game.keys = {};
    document.addEventListener('keydown', (e) => {
        game.keys[e.key] = true;
    });
    document.addEventListener('keyup', (e) => {
        game.keys[e.key] = false;
    });
});