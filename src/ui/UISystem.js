import { gameOverTemplate, volumeControlTemplate } from './templates.js';

export class UISystem {
    constructor(game) {
        this.game = game;
        this.isGameOverVisible = false;
        this.volume = 1.0;
        this.isMuted = false;

        this.createVolumeControl();
    }

    showGameOver() {
        if (this.isGameOverVisible) return;
        
        console.log('Showing game over screen');
        this.isGameOverVisible = true;

        // Create and add game over screen
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = gameOverTemplate;
        const gameOverScreen = tempDiv.firstElementChild;
        document.body.appendChild(gameOverScreen);

        // Add hover effect to button
        const button = document.getElementById('restartButton');
        button.addEventListener('mouseover', () => {
            button.style.transform = 'scale(1.1)';
            button.style.backgroundColor = '#45a049';
        });
        button.addEventListener('mouseout', () => {
            button.style.transform = 'scale(1)';
            button.style.backgroundColor = '#4CAF50';
        });

        // Add restart button listener
        button.addEventListener('click', () => this.game.startGame());
    }

    hideGameOver() {
        const gameOverScreen = document.getElementById('gameOverScreen');
        if (gameOverScreen) {
            gameOverScreen.remove();
        }
        this.isGameOverVisible = false;
    }

    createVolumeControl() {
        // Add volume control to DOM
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = volumeControlTemplate;
        const volumeControl = tempDiv.firstElementChild;
        document.body.appendChild(volumeControl);

        // Get control elements
        const muteButton = document.getElementById('muteButton');
        const volumeSlider = document.getElementById('volumeSlider');

        // Setup event listeners
        muteButton.addEventListener('click', () => {
            this.isMuted = !this.isMuted;
            muteButton.textContent = this.isMuted ? '🔇' : '🔊';
            
            if (this.game.audioSystem) {
                this.game.audioSystem.setVolume(this.isMuted ? 0 : this.volume);
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            this.volume = e.target.value / 100;
            if (!this.isMuted && this.game.audioSystem) {
                this.game.audioSystem.setVolume(this.volume);
            }
        });
    }

    updateVolumeDisplay() {
        const muteButton = document.getElementById('muteButton');
        const volumeSlider = document.getElementById('volumeSlider');
        
        if (muteButton && volumeSlider) {
            muteButton.textContent = this.isMuted ? '🔇' : '🔊';
            volumeSlider.value = this.volume * 100;
        }
    }
}
