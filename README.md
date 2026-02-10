# Groove Galaxy 🎵🚀

A rhythm-based space shooter game that combines classic arcade action with dynamic beat mechanics. Control your defender ship to the rhythm of the music, shoot down aliens, and create your own cosmic symphony!

## ✨ Features

### Core Gameplay
- **Dynamic Rhythm System**: Adjustable BPM (60-200) affects both music and gameplay speed
- **Interactive Beat Grid**: 16-column x 3-row grid for precise rhythm programming
- **Smart Respawn**: Aliens respawn after being shot, keeping your drum pattern looping
- **AI Auto-Shooter**: Intelligent defender that automatically targets and shoots aliens

### Unique Alien Designs
Three distinct alien types, each with unique sounds and designs:
- **Bass (Row 0)**: Heavy battleship with wings and turret - deep kick drum
- **Snare (Row 1)**: Triangular fighter with cockpit - sharp snare hit
- **Hi-hat (Row 2)**: Classic UFO design - crisp hi-hat

### 🎯 Score System
- **Base Hit**: 10 points for shooting any alien
- **On-Beat Bonus**: 100 points for hitting aliens on or near the beat
- **Combo System**: Chain on-beat hits together for higher combos
- **Max Combo Tracking**: See your best combo performance

### 🎨 Visual Effects
- **Beat Flash**: Grid cells light up when drums trigger
- **Step Pulse**: Current beat column pulses to the rhythm
- **Sound Visualization**: Particle effects burst from aliens when drums hit
- **Enhanced Explosions**: 
  - Multi-colored explosions for on-beat hits (green, yellow, magenta)
  - Standard green explosions for normal hits
  - Dramatic particle systems

### 🎵 Preset Drum Patterns
Four professionally-designed patterns to get you started:
- **Rock**: Classic rock beat with steady quarter notes
- **Funk**: Syncopated groove with emphasis on the one
- **Jazz**: Swing-style pattern with ride cymbal feel
- **Hip-Hop**: Boom-bap style with characteristic snare placement
- **Clear Button**: Wipe the grid clean to start fresh

### 📱 Mobile Support
- **Touch Controls**: Left/Right movement and Fire buttons
- **Responsive Canvas**: Automatically scales to fit mobile screens
- **Touch-Friendly UI**: Large buttons optimized for touch input

### 🎮 Controls

**Desktop:**
- `←/→` or `A/D` - Move defender
- `Space` - Shoot
- `P` - Pause/Resume
- `Mouse Click` - Toggle beats on grid

**Mobile:**
- Touch buttons for movement and shooting
- Tap grid to toggle beats

## 🚀 How to Play

1. **Start the Game**: Click the "Start" button to begin
2. **Create Your Beat**: Click grid cells to place aliens (drum beats)
3. **Shoot to the Rhythm**: Fire at aliens and try to hit them on-beat for bonus points
4. **Use Presets**: Try the preset patterns or create your own
5. **Adjust Tempo**: Use the BPM slider to change the speed (defender speed scales with BPM)
6. **Watch Your Score**: Build combos by hitting on-beat consistently

## 🎨 Retro Aesthetic

Classic green-on-black terminal style with:
- Monospace "Courier New" font
- Neon green (#00ff00) color scheme
- Scanline-inspired grid design
- Metallic title shine animation

## 🔧 Technical Details

### Built With
- **Vanilla JavaScript** - No frameworks, pure JS
- **HTML5 Canvas** - Hardware-accelerated 2D rendering
- **Web Audio API** - Professional audio playback
- **CSS3 Animations** - Smooth visual effects

### Browser Compatibility
- Modern browsers with Canvas and Web Audio support
- Includes `roundRect` polyfill for older browsers
- Mobile browser support (iOS Safari, Chrome Mobile)

### Performance
- Efficient particle systems with automatic cleanup
- Request Animation Frame for smooth 60fps gameplay
- Memory leak fixes - dead entities properly cleaned up
- Optimized collision detection

## 📦 Installation

1. Clone the repository:
```bash
git clone https://github.com/lovejzzz/GrooveGalaxy.git
cd GrooveGalaxy
```

2. Open `index.html` in a modern web browser, or:

```bash
python -m http.server 8000
# Visit http://localhost:8000
```

## 🛠️ Development

### Project Structure
```
GrooveGalaxy/
├── index.html          # Main game structure
├── styles.css          # Retro styling and animations
├── game.js             # Core game engine
├── DrumAudio/          # Drum samples
│   ├── bassdrum.wav
│   ├── snare.wav
│   └── hi-hat.wav
└── Groove-Galaxy.png   # Title logo
```

### Key Classes

**DrumMachine**
- Manages Web Audio API context
- Loads and plays drum samples
- Maps grid rows to drum sounds

**Game**
- Main game loop and state management
- Canvas rendering and animation
- Collision detection
- Score and combo tracking
- AI controller
- Particle systems
- Mobile support

## 🐛 Bug Fixes (v1.1)

- ✅ Fixed double event listener registration
- ✅ Removed dead `#startButton` reference
- ✅ Added alien respawn system (no more permanently dead aliens)
- ✅ Fixed memory leak with proper entity cleanup
- ✅ Added `roundRect` polyfill for browser compatibility

## 🎯 Future Enhancements

- Multiple difficulty levels
- More drum sound options
- Pattern save/load functionality
- Multiplayer mode
- Leaderboard system
- More visual themes

## 📄 License

MIT License - Feel free to use, modify, and distribute!

## 🙏 Credits

Created with ❤️ by lovejzzz

A rhythm-based gaming experiment combining classic arcade elements with modern web audio technology.

---

**Have fun creating beats and shooting aliens! 🎵👾**
