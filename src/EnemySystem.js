import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class EnemySystem {
    constructor(scene, world, player) {
        this.scene = scene;
        this.world = world;
        this.player = player;
        this.enemy = null;
        this.maxHealth = 100;
        
        // Shooting properties
        this.lastShotTime = 0;
        this.shotCooldown = 2000; // Fire every 2 seconds
        this.tracers = [];
        this.projectiles = [];
        this.projectileSpeed = 40; // Units per second
        this.tracerMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        this.projectileMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        this.projectileGeometry = new THREE.SphereGeometry(0.1, 8, 8);
        this.projectileDamage = 10;

        // Spawn initial enemy
        this.spawnEnemy();
    }

    spawnEnemy() {
        if (this.enemy) return;

        // Create turret base
        const baseGeometry = new THREE.CylinderGeometry(1, 1, 0.5, 8);
        const baseMaterial = new THREE.MeshPhongMaterial({ color: 0x666666 });
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial);
        baseMesh.position.y = -0.75;

        // Create turret top
        const topGeometry = new THREE.BoxGeometry(0.8, 0.8, 1.2);
        const topMaterial = new THREE.MeshPhongMaterial({ color: 0xff0000 });
        const topMesh = new THREE.Mesh(topGeometry, topMaterial);
        topMesh.position.y = 0;

        // Create gun barrel
        const barrelGeometry = new THREE.CylinderGeometry(0.1, 0.1, 1, 8);
        const barrelMaterial = new THREE.MeshPhongMaterial({ color: 0x333333 });
        const barrelMesh = new THREE.Mesh(barrelGeometry, barrelMaterial);
        barrelMesh.rotation.x = Math.PI / 2;
        barrelMesh.position.z = 0.8;
        topMesh.add(barrelMesh);

        // Create container
        const container = new THREE.Object3D();
        container.position.set(-20, 1, -20); // Start at corner
        container.add(baseMesh);
        container.add(topMesh);

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

        // Store enemy data
        this.enemy = {
            baseMesh,
            topMesh,
            container,
            body,
            healthBar,
            health: this.maxHealth,
            muzzlePosition: new THREE.Vector3(0, 0, 1.3) // Store muzzle position for shooting
        };

        // Add metadata for hit detection
        topMesh.userData.type = 'enemy';
        topMesh.userData.enemyData = this.enemy;
        container.userData.type = 'enemy';
        container.userData.enemyData = this.enemy;

        this.scene.add(container);
    }

    shoot() {
        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.shotCooldown) {
            return;
        }
        this.lastShotTime = currentTime;

        // Calculate shot direction based on player's current position
        const startPos = this.enemy.container.position.clone().add(new THREE.Vector3(0, 0, 1.3));
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
        this.enemy.topMesh.lookAt(
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