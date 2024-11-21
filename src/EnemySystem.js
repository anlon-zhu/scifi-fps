import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Turret } from './entities/Turret.js';

export class EnemySystem {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.enemies = [];
        this.totalDestroyed = 0;
    }

    spawnEnemy() {
        // Random position around the player
        const angle = Math.random() * Math.PI * 2;
        const distance = 15;
        const x = Math.cos(angle) * distance;
        const z = Math.sin(angle) * distance;
        
        // Create new turret - position y at 1 to be on ground
        const turret = new Turret(this.scene, this.world, [x, 0, z], this.player);
        this.enemies.push(turret);
        
        console.log('[EnemySystem] Spawned turret:', {
            position: [x, 1, z],
            enemyCount: this.enemies.length
        });
    }

    update(deltaTime) {
        // Update existing enemies
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const enemy = this.enemies[i];
            
            if (enemy.isDestroyed) {
                this.totalDestroyed++;
                this.enemies.splice(i, 1);
                console.log('[EnemySystem] Enemy destroyed:', {
                    remaining: this.enemies.length,
                    totalDestroyed: this.totalDestroyed
                });
                
                // Spawn a new enemy when one is destroyed
                this.spawnEnemy();
            } else {
                enemy.update(deltaTime);
            }
        }
        
        // Spawn initial enemy if none exist
        if (this.enemies.length === 0) {
            this.spawnEnemy();
        }
    }

    dispose() {
        // Clean up all enemies
        for (const enemy of this.enemies) {
            enemy.dispose();
        }
        this.enemies = [];
    }
}