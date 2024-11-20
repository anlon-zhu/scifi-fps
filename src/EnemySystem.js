import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import turretUrl from './static/models/Turret Cannon.glb';

export class EnemySystem {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.enemy = null;
        this.maxHealth = 100;
        this.turretModel = null;
        
        // Shooting properties
        this.lastShotTime = 0;
        this.shotCooldown = 2000; // Fire every 2 seconds
        this.tracers = [];
        this.projectiles = [];
        this.projectileSpeed = 40;
        this.tracerMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.projectileGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        this.projectileDamage = 10;

        // Load turret model
        const loader = new GLTFLoader();
        loader.load(turretUrl, (gltf) => {
            this.turretModel = gltf.scene;
            // Spawn initial enemy once model is loaded
            this.spawnEnemy();
        });
    }

    spawnEnemy() {
        if (this.enemy || !this.turretModel) return;

        // Clone the turret model
        const turretMesh = this.turretModel.clone();
        turretMesh.scale.set(2.5,2.5, 2.5); // Adjust scale as needed
        
        // Create container for enemy
        const container = new THREE.Object3D();
        container.add(turretMesh);

        // Position the turret
        const position = new THREE.Vector3(-20, 0, -20);        
        container.position.copy(position);
        
        // Create health bar
        const healthBarGeometry = new THREE.PlaneGeometry(1, 0.1);
        const healthBarMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ff00,
            side: THREE.DoubleSide
        });
        const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
        healthBar.position.y = 1.5;
        container.add(healthBar);

        // Create physics body
        const shape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
        const body = new CANNON.Body({
            mass: 0, // Static body
            position: new CANNON.Vec3(-20, 1, -20),
            shape: shape,
            fixedRotation: true
        });

        this.world.addBody(body);

        // Add to scene
        this.scene.add(container);
        
        // Store enemy data
        this.enemy = {
            container: container,
            mesh: turretMesh,
            healthBar: healthBar,
            body: body,
            health: this.maxHealth,
            position: position,
            muzzlePosition: new THREE.Vector3(0, 0, 1.3) // Store muzzle position for shooting
        };
        
        // Add metadata
        container.userData.type = 'enemy';
        container.userData.enemyData = this.enemy;
    }

    shoot() {
        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.shotCooldown) {
            return;
        }
        this.lastShotTime = currentTime;

        // Calculate shot direction based on player's current position
        const startPos = this.enemy.container.position.clone().add(new THREE.Vector3(0, 1, 0));
        const targetPos = this.player.camera.position.clone();
        const direction = new THREE.Vector3()
            .subVectors(targetPos, startPos)
            .normalize();

        // Create projectile
        const projectile = new THREE.Mesh(this.projectileGeometry, this.projectileMaterial);
        projectile.position.copy(startPos);
        this.scene.add(projectile);

        // Store projectile with its direction
        this.projectiles.push({
            mesh: projectile,
            direction: direction,
            distanceTraveled: 0
        });

        // Create tracer effect for muzzle flash
        const tracerGeometry = new THREE.BufferGeometry().setFromPoints([
            startPos,
            startPos.clone().add(direction.clone().multiplyScalar(2))
        ]);
        const tracer = new THREE.Line(tracerGeometry, this.tracerMaterial);
        this.scene.add(tracer);
        this.tracers.push({
            mesh: tracer,
            createdTime: currentTime
        });
    }

    updateProjectiles(deltaTime) {
        const moveDistance = this.projectileSpeed * deltaTime;
        const maxDistance = 100; // Maximum travel distance before despawning

        this.projectiles = this.projectiles.filter(projectile => {
            // Move projectile
            projectile.mesh.position.add(
                projectile.direction.clone().multiplyScalar(moveDistance)
            );
            projectile.distanceTraveled += moveDistance;

            // Create projectile box for collision
            const projectileBox = new THREE.Box3().setFromCenterAndSize(
                projectile.mesh.position,
                new THREE.Vector3(0.5, 0.5, 0.5) // 0.5 unit cube around projectile
            );

            // Get all collidable objects
            const hitObjects = [];
            this.scene.traverse((object) => {
                if (object.userData && 
                    (object.userData.type === 'obstacle' || 
                     object.userData.type === 'player')) {
                    hitObjects.push(object);
                }
            });

            // Check for collisions
            for (const target of hitObjects) {
                const targetBox = new THREE.Box3().setFromObject(target);
                
                if (projectileBox.intersectsBox(targetBox)) {
                    // Handle collision based on target type
                    if (target.userData.type === 'player') {
                        console.log('Hit player');
                        this.player.takeDamage(this.projectileDamage);
                    } else if (target.userData.type === 'obstacle') {
                        const obstacle = target.userData.obstacleData;
                        if (obstacle && obstacle.destructible) {
                            obstacle.health -= 5;
                            
                            if (obstacle.health <= 0) {
                                this.scene.remove(target);
                                this.world.remove(obstacle.body);
                            }
                        }
                    }

                    // Create impact effect
                    const impactGeometry = new THREE.SphereGeometry(0.1, 8, 8);
                    const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
                    const impact = new THREE.Mesh(impactGeometry, impactMaterial);
                    impact.position.copy(projectile.mesh.position);
                    this.scene.add(impact);

                    setTimeout(() => {
                        this.scene.remove(impact);
                    }, 100);

                    // Remove projectile
                    this.scene.remove(projectile.mesh);
                    return false;
                }
            }

            // Remove if traveled too far
            if (projectile.distanceTraveled > maxDistance) {
                this.scene.remove(projectile.mesh);
                return false;
            }

            return true;
        });
    }

    updateTracers(currentTime) {
        // Remove tracers after 100ms
        this.tracers = this.tracers.filter(tracer => {
            if (currentTime - tracer.createdTime > 100) {
                this.scene.remove(tracer.mesh);
                return false;
            }
            return true;
        });
    }

    update(deltaTime) {
        if (!this.enemy) {
            this.spawnEnemy();
            return;
        }

        const currentTime = performance.now();

        // Get player position
        const playerPos = this.player.camera.position;

        // Calculate direction to player
        const direction = new THREE.Vector3()
            .subVectors(playerPos, this.enemy.container.position)
            .normalize();

        // Update top mesh rotation to track player
        this.enemy.mesh.lookAt(
            this.enemy.container.position.clone().add(
                new THREE.Vector3(direction.x, 0, direction.z)
            )
        );

        // Update health bar to face camera
        this.enemy.healthBar.lookAt(this.player.camera.position);

        // Try to shoot
        this.shoot();
        this.updateTracers(currentTime);
        this.updateProjectiles(deltaTime);
    }

    updateEnemyHealth(enemy, newHealth) {
        if (!enemy) return;

        // Update health
        enemy.health = Math.max(0, newHealth);

        // Update health bar
        const healthPercent = enemy.health / this.maxHealth;
        enemy.healthBar.scale.x = Math.max(0.01, healthPercent);

        // Update color based on health
        if (healthPercent > 0.6) {
            enemy.healthBar.material.color.setHex(0x00ff00); // Green
        } else if (healthPercent > 0.3) {
            enemy.healthBar.material.color.setHex(0xffff00); // Yellow
        } else {
            enemy.healthBar.material.color.setHex(0xff0000); // Red
        }

        // If health reaches 0, destroy and respawn
        if (enemy.health <= 0) {
            this.destroyEnemy();
            this.spawnEnemy();
        }
    }

    destroyEnemy() {
        if (!this.enemy) return;

        // Remove from scene
        this.scene.remove(this.enemy.container);
        
        // Remove physics body
        this.world.removeBody(this.enemy.body);

        // Clear reference
        this.enemy = null;
    }
}