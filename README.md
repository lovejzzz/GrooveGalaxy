# Groove Galaxy 🎵🚀

A rhythm-based space shooter game that combines classic arcade action with dynamic beat mechanics. Control your defender ship to the rhythm of the music, shoot down aliens, and create your own cosmic symphony!

## Features

- **Dynamic Rhythm System**: The game's tempo is controlled by adjustable BPM (60-200), affecting both the music and gameplay speed
- **Unique Alien Designs**: Three distinct types of alien ships, each corresponding to different drum sounds:
  - Bass (Row 0): Heavy battleship with wings and turret
  - Snare (Row 1): Triangular fighter with cockpit
  - Hi-hat (Row 2): Classic UFO design
- **Responsive Controls**: 
  - Space bar to shoot
  - Left/Right arrows to move
  - 'P' to pause/unpause
- **Adaptive Speed**: Defender movement speed scales with the BPM, creating an engaging rhythm-based challenge
- **Interactive Beat Grid**: 16-column grid system for precise rhythm-based gameplay
- **Visual Effects**: Custom animations including metallic title effects and explosion animations

## How to Play

1. Click 'Start' to begin the game
2. Use left and right arrow keys to move your defender
3. Press spacebar to shoot at aliens
4. Adjust the BPM slider to control the game's rhythm and speed
5. Try to hit aliens in time with the beat for the best experience
6. Press 'P' to pause/unpause the game

## Technical Details

- Built with vanilla JavaScript, HTML5, and CSS3
- Uses Web Audio API for sound generation
- Canvas-based rendering for smooth graphics
- Responsive design that adapts to window size

## Installation

1. Clone the repository:
```bash
git clone https://github.com/YourUsername/GrooveGalaxy.git
```

2. Open `index.html` in a modern web browser

## Development

The game is structured into several key components:

- `index.html`: Main game structure and layout
- `styles.css`: Game styling and animations
- `game.js`: Core game logic including:
  - DrumMachine class for audio handling
  - Game class for main game mechanics
  - Collision detection and animation systems

## Credits

Created by [Your Name] - A rhythm-based gaming experiment combining classic arcade elements with modern web technologies.
