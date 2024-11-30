import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PlayerSystem } from './PlayerSystem.js';
import { WeaponSystem } from './WeaponSystem.js';
import { ObstacleSystem } from './ObstacleSystem.js';
import { EnemySystem } from './EnemySystem.js';
import { EnvironmentSystem } from './EnvironmentSystem.js';
import { UISystem } from './ui/UISystem.js';

class FPSGame {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 5, 0);
        this.scene.add(this.camera);
        
        // Set camera reference on scene
        this.scene.camera = this.camera;
        
        this.isGameOver = false;

        // Setup renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(this.renderer.domElement);

        // Initialize audio system
        this.audioSystem = {
            volume: 1.0,
            isMuted: false,
            sounds: {},
            setVolume: function(value) {
                this.volume = value;
                Object.values(this.sounds).forEach(sound => {
                    if (sound instanceof Audio) {
                        sound.volume = this.isMuted ? 0 : value;
                    }
                });
            },
            loadSound: async (name, url) => {
                const sound = new Audio();
                sound.src = url;
                sound.preload = 'auto';
                sound.volume = this.audioSystem.isMuted ? 0 : this.audioSystem.volume;
                
                return new Promise((resolve, reject) => {
                    sound.addEventListener('canplaythrough', () => {
                        console.log(`Sound "${name}" loaded and ready`);
                        this.audioSystem.sounds[name] = sound;
                        resolve(sound);
                    });
                    
                    sound.addEventListener('error', (error) => {
                        console.error(`Error loading sound "${name}":`, error);
                        reject(error);
                    });
                    
                    sound.load();
                });
            },
            play: (name) => {
                const sound = this.audioSystem.sounds[name];
                if (sound) {
                    const clone = sound.cloneNode();
                    clone.volume = this.audioSystem.isMuted ? 0 : this.audioSystem.volume;
                    clone.play().catch(error => {
                        console.error(`Error playing sound "${name}":`, error);
                    });
                }
            }
        };

        // Load sounds
        const soundURL = new URL('../9mm.ogg', import.meta.url).href;
        this.audioSystem.loadSound('shoot', soundURL).catch(error => {
            console.error('Failed to load shoot sound:', error);
        });

        const reloadSoundURL = new URL('../9mm-reload.mp3', import.meta.url).href;
        this.audioSystem.loadSound('reload', reloadSoundURL).catch(error => {
            console.error('Failed to load reload sound:', error);
        });

        // Initialize environment system
        this.environmentSystem = new EnvironmentSystem(this.scene);
        this.world = this.environmentSystem.getWorld();
        this.textures = this.environmentSystem.getTextures();

        // Set scene references
        this.scene.renderer = this.renderer;
        this.scene.game = this;

        // Initialize systems
        this.weaponSystem = new WeaponSystem(this.scene, this.camera, this.audioSystem);
        this.scene.weaponSystem = this.weaponSystem;
        
        // Initialize player system after weapon system
        this.playerSystem = new PlayerSystem(this.scene, this.camera, this.world);
        
        // Initialize other systems
        this.obstacleSystem = new ObstacleSystem(this.scene, this.world, this.textures);
        this.enemySystem = new EnemySystem(this.scene, this.world, this.playerSystem);
        this.uiSystem = new UISystem(this.scene);
        this.scene.playerSystem = this.playerSystem;
        this.weaponSystem.onHit = (hitPoint, target) => {
            if (target && target.userData) {
                const mesh = target.parent || target; // Get the parent if it exists (for grouped objects)
                
                // Find the entity that owns this mesh
                const entity = [...this.obstacleSystem.obstacles, ...this.enemySystem.getEnemies()]
                    .find(obj => obj.mesh === mesh);
                
                if (entity && typeof entity.takeDamage === 'function') {
                    entity.takeDamage(25); // Apply 25 damage
                }
            }
            this.weaponSystem.handleHit(hitPoint, target);
        };

        this.obstacleSystem.createDestructibleCrates();
        this.obstacleSystem.createWalls();
        
        this.enemySystem.spawnEnemy();
        this.uiSystem = new UISystem(this);

        // Lock mouse pointer
        document.addEventListener('click', () => {
            if (document.pointerLockElement !== this.renderer.domElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        this.lastMoveTime = performance.now();
        this.animate();
    }

    handlePlayerDeath() {
        if (this.isGameOver) return;
        
        console.log('Game handling player death');
        this.isGameOver = true;
        document.exitPointerLock();
        this.uiSystem.showGameOver(this.enemySystem.totalDestroyed);
    }

    startGame() {
        console.log('Starting new game');
        
        // Reset game state
        this.isGameOver = false;
        
        // Reset all systems
        this.playerSystem.reset();
        this.enemySystem.spawnEnemy();
        this.enemySystem.totalDestroyed = 0;
        this.uiSystem.hideGameOver();
        
        // Re-enable pointer lock
        document.body.requestPointerLock();
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastMoveTime) / 1000;
        this.lastMoveTime = currentTime;

        // Don't update game state if game is over
        if (this.isGameOver) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        // Update physics world
        this.world.step(1/60);

        // Update all systems
        this.playerSystem.update();
        this.obstacleSystem.update();
        this.enemySystem.update(deltaTime);
        this.weaponSystem.update(currentTime);

        // Render scene
        this.renderer.render(this.scene, this.camera);
    }
}

// Start the game
new FPSGame();
