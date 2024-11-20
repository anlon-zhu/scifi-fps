import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class ObstacleSystem {
    constructor(scene, world, textures) {
        this.scene = scene;
        this.world = world;
        this.textures = textures;
        this.obstacles = [];
    }

    createDestructibleCrates(count = 5) {
        for (let i = 0; i < count; i++) {
            const size = [1, 1, 1];
            const position = [
                (Math.random() - 0.5) * 20,
                size[1] / 2,
                (Math.random() - 0.5) * 20
            ];
            
            // Create mesh
            const geometry = new THREE.BoxGeometry(...size);
            const material = new THREE.MeshStandardMaterial({ 
                map: this.textures.crate,
                roughness: 0.7,
                metalness: 0.3
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...position);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Create health bar
            const healthBarGeometry = new THREE.PlaneGeometry(1, 0.1);
            const healthBarMaterial = new THREE.MeshBasicMaterial({ 
                color: 0x00ff00,
                side: THREE.DoubleSide
            });
            const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
            healthBar.position.set(...position);
            healthBar.position.y += size[1] + 0.5;

            // Create container for obstacle
            const obstacleContainer = new THREE.Group();
            obstacleContainer.add(mesh);
            obstacleContainer.add(healthBar);
            
            // Create physics body
            const shape = new CANNON.Box(new CANNON.Vec3(...size.map(s => s/2)));
            const body = new CANNON.Body({ 
                mass: 5,
                shape: shape,
                position: new CANNON.Vec3(...position)
            });
            this.world.addBody(body);
            
            // Store obstacle data
            const obstacleData = {
                mesh: mesh,
                body: body,
                healthBar: healthBar,
                health: 100,
                destructible: true,
                initialSize: size
            };
            
            // Add metadata to container
            obstacleContainer.userData.type = 'obstacle';
            obstacleContainer.userData.obstacleData = obstacleData;
            
            // Add to scene and obstacles array
            this.scene.add(obstacleContainer);
            this.obstacles.push(obstacleData);
        }
    }

    createWalls() {
        const wallPositions = [
            { pos: [-25, 5, 0], size: [1, 10, 50] },
            { pos: [25, 5, 0], size: [1, 10, 50] },
            { pos: [0, 5, -25], size: [50, 10, 1] },
            { pos: [0, 5, 25], size: [50, 10, 1] }
        ];

        wallPositions.forEach(wall => {
            const geometry = new THREE.BoxGeometry(...wall.size);
            const material = new THREE.MeshStandardMaterial({ 
                map: this.textures.wall,
                roughness: 0.8,
                metalness: 0.2
            });
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(...wall.pos);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            
            // Create container for wall
            const wallContainer = new THREE.Group();
            wallContainer.add(mesh);
            
            const shape = new CANNON.Box(new CANNON.Vec3(...wall.size.map(s => s/2)));
            const body = new CANNON.Body({ 
                mass: 0,
                shape: shape,
                position: new CANNON.Vec3(...wall.pos)
            });
            this.world.addBody(body);
            
            // Store wall data
            const wallData = {
                mesh: mesh,
                body: body,
                destructible: false
            };
            
            // Add metadata to container
            wallContainer.userData.type = 'obstacle';
            wallContainer.userData.obstacleData = wallData;
            
            // Add to scene and obstacles array
            this.scene.add(wallContainer);
            this.obstacles.push(wallData);
        });
    }

    updateObstacles() {
        this.obstacles.forEach(obstacle => {
            obstacle.mesh.position.copy(obstacle.body.position);
            obstacle.mesh.quaternion.copy(obstacle.body.quaternion);
            if (obstacle.healthBar) {
                obstacle.healthBar.position.copy(obstacle.body.position);
                obstacle.healthBar.position.y += obstacle.initialSize[1] + 0.5;
                obstacle.healthBar.quaternion.copy(this.scene.quaternion);
            }
        });
    }

    updateObstacleHealth(obstacle, newHealth) {
        if (obstacle && obstacle.destructible) {
            obstacle.health = newHealth;
            if (obstacle.healthBar) {
                const healthPercent = obstacle.health / 100;
                obstacle.healthBar.scale.x = Math.max(0, healthPercent);
                obstacle.healthBar.material.color.setRGB(
                    1 - healthPercent,  // More red as health decreases
                    healthPercent,      // More green as health increases
                    0
                );
            }
            if (obstacle.health <= 0) {
                this.destroyObstacle(obstacle);
            }
        }
    }

    destroyObstacle(obstacle) {
        // Remove the obstacle and its physics body from the scene
        if (obstacle.mesh) {
            this.scene.remove(obstacle.mesh.parent); // Remove the entire container
        }
        if (obstacle.body) {
            this.world.removeBody(obstacle.body);
        }
        const index = this.obstacles.indexOf(obstacle);
        if (index > -1) {
            this.obstacles.splice(index, 1);
        }
    }

    getObstacles() {
        return this.obstacles;
    }
}
