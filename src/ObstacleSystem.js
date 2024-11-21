import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Crate } from './entities/Crate.js';
import { Wall } from './entities/Wall.js';

export class ObstacleSystem {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.obstacles = [];
        
        // Set camera reference on scene if not already set
        if (!this.scene.camera && this.scene.game && this.scene.game.camera) {
            this.scene.camera = this.scene.game.camera;
        }
    }

    async createDestructibleCrates(count = 5) {
        console.log('Creating crates. Scene camera:', this.scene.camera);
        
        for (let i = 0; i < count; i++) {
            const position = [
                (Math.random() - 0.5) * 20,
                0.625, // Start at player head height
                (Math.random() - 0.5) * 20
            ];
            
            console.log(`Creating crate ${i} at position:`, position);
            const crate = new Crate(this.scene, this.world, position);
            this.obstacles.push(crate);
        }
    }

    createWalls() {
        // Default wall configuration for the arena
        const wallConfigs = [
            { position: [-25, 5, 0], size: [1, 10, 50] },
            { position: [25, 5, 0], size: [1, 10, 50] },
            { position: [0, 5, -25], size: [50, 10, 1] },
            { position: [0, 5, 25], size: [50, 10, 1] }
        ];

        for (const config of wallConfigs) {
            const wall = new Wall(
                this.scene,
                this.world,
                config.position,
                config.size
            );
            this.obstacles.push(wall);
        }
    }

    update() {
        for (const obstacle of this.obstacles) {
            obstacle.update();
        }
    }

    dispose() {
        for (const obstacle of this.obstacles) {
            obstacle.dispose();
        }
        this.obstacles = [];
    }
}
