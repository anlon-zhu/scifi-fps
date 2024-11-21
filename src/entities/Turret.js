import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DestructibleEntity } from './DestructibleEntity.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import turretUrl from '../static/models/Turret Cannon.glb';
import bulletUrl from '../static/models/Bullet.glb';

export class Turret extends DestructibleEntity {
    static model = null;
    static bulletModel = null;
    static modelPromise = null;
    static bulletPromise = null;

    static async loadModels() {
        if (!Turret.model) {
            const gltfLoader = new GLTFLoader();
            const turretGltf = await gltfLoader.loadAsync(turretUrl);
            Turret.model = turretGltf.scene;
            console.log('[Turret] Model loaded:', {
                children: Turret.model.children.length,
                structure: Turret.model.children.map(c => c.name)
            });
        }
        
        if (!Turret.bulletModel) {
            const gltfLoader = new GLTFLoader();
            const bulletGltf = await gltfLoader.loadAsync(bulletUrl);
            Turret.bulletModel = bulletGltf.scene;
        }
    }

    constructor(scene, world, position, player) {
        super(scene, world, position, 100);
        this.player = player;
        this.projectiles = [];
        this.projectileSpeed = 15;
        this.shotCooldown = 1000; // ms between shots
        this.lastShotTime = 0;
        this.projectileDamage = 10;
        
        this.setupPhysics();
        this.setupMesh();
    }

    async setupMesh() {
        // Wait for models to be loaded if they aren't already
        if (!Turret.model || !Turret.bulletModel) {
            await Turret.loadModels();
        }

        // Clone the turret model for this instance
        this.mesh = Turret.model.clone();
        this.mesh.scale.set(2.75, 2.75, 2.75); // Make turret bigger
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        // Store reference to this turret instance on ALL objects in the hierarchy
        const setEntityRef = (obj) => {
            obj.userData = obj.userData || {};
            obj.userData.entity = this;
            console.log('[Turret] Set entity ref on:', {
                name: obj.name,
                type: obj.constructor.name
            });
        };

        // Set on root mesh first
        setEntityRef(this.mesh);

        // Then traverse all children
        this.mesh.traverse((child) => {
            setEntityRef(child);
        });
        
        this.scene.add(this.mesh);
    }

    // Helper to dump the full hierarchy for debugging
    dumpHierarchy(obj, level = 0) {
        let result = `${'-'.repeat(level)}${obj.name || 'unnamed'} (${obj.constructor.name}) - hasEntity: ${!!obj.userData?.entity}\n`;
        obj.children.forEach(child => {
            result += this.dumpHierarchy(child, level + 1);
        });
        return result;
    }

    setupPhysics() {
        // Create physics body (simplified as a cylinder)
        const radius = 0.5;
        const height = 2;
        const shape = new CANNON.Cylinder(radius, radius, height, 8);
        this.body = new CANNON.Body({
            mass: 0, // Static body
            position: new CANNON.Vec3(this.position.x, this.position.y, this.position.z),
            shape: shape
        });
        
        this.world.addBody(this.body);
        console.log('[Turret] Physics body created:', {
            position: this.body.position,
            radius,
            height
        });
    }

    update(deltaTime) {
        if (!this.isDestroyed) {
            // Update turret rotation to face player
            if (this.mesh && this.player) {
                const playerPosition = this.player.camera.position.clone();
                playerPosition.y = this.mesh.position.y + 1.6; // Aim at head height
                const direction = new THREE.Vector3();
                direction.subVectors(playerPosition, this.mesh.position);
                direction.y = 0; // Keep turret upright
                
                // Create a target position at the same height as the turret
                const targetPos = this.mesh.position.clone().add(direction);
                this.mesh.lookAt(targetPos);
            }
            
            // Update projectiles
            for (let i = this.projectiles.length - 1; i >= 0; i--) {
                const projectile = this.projectiles[i];
                
                // Move projectile
                const moveDistance = this.projectileSpeed * deltaTime;
                projectile.mesh.position.add(
                    projectile.direction.clone().multiplyScalar(moveDistance)
                );
                projectile.distanceTraveled += moveDistance;
                
                // Update projectile's bounding box
                projectile.bbox.setFromObject(projectile.mesh);
                
                let hit = false;
                // Check collision with all objects in scene
                this.scene.traverse((object) => {
                    if (hit || object === projectile.mesh || this.mesh.getObjectById(object.id)) {
                        return; // Skip if already hit something or is the projectile/turret
                    }
                    
                    // Skip objects without geometry
                    if (!object.geometry) {
                        return;
                    }
                    
                    // Get or compute bounding box
                    if (!object.bbox) {
                        object.bbox = new THREE.Box3().setFromObject(object);
                    }
                    
                    // Check intersection
                    if (projectile.bbox.intersectsBox(object.bbox)) {
                        hit = true;
                        
                        // Find the entity this object belongs to
                        let hitObject = object;
                        while (hitObject && !hitObject.userData?.entity) {
                            hitObject = hitObject.parent;
                        }
                        
                        if (hitObject?.userData?.entity) {
                            const entity = hitObject.userData.entity;
                            
                            // If it's the player or a destructible entity, damage it
                            if (entity === this.player || entity.takeDamage) {
                                console.log('[Turret] Hit entity:', entity);
                                entity.takeDamage(this.projectileDamage);
                            }
                        }
                        
                        // Remove projectile
                        this.scene.remove(projectile.mesh);
                        this.projectiles.splice(i, 1);
                    }
                });
                
                if (!hit && projectile.distanceTraveled > 100) {
                    // Remove if traveled too far
                    this.scene.remove(projectile.mesh);
                    this.projectiles.splice(i, 1);
                }
            }
            
            // Try to shoot
            this.shoot();
            
            // Update health bar
            super.update();
        }
    }

    shoot() {
        if (this.isDestroyed) return;

        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.shotCooldown) {
            return;
        }

        // Get player position from camera, but adjust to head height
        const playerPosition = this.player.camera.position.clone();
        const startPos = this.mesh.position.clone().add(new THREE.Vector3(0, 1.6, 0)); // Shoot from turret head height
        const direction = new THREE.Vector3()
            .subVectors(playerPosition, startPos)
            .normalize();

        // Create projectile
        const projectile = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 8, 8),
            new THREE.MeshBasicMaterial({ color: 0xff0000 })
        );
        projectile.position.copy(startPos);
        
        // Create bounding box for projectile
        projectile.bbox = new THREE.Box3().setFromObject(projectile);
        
        this.scene.add(projectile);

        // Store projectile data
        this.projectiles.push({
            mesh: projectile,
            bbox: projectile.bbox,
            direction: direction,
            distanceTraveled: 0
        });

        this.lastShotTime = currentTime;
    }

    takeDamage(amount) {
        console.log('[Turret] Taking damage:', {
            amount,
            currentHealth: this.currentHealth,
            willDestroy: this.currentHealth - amount <= 0
        });
        super.takeDamage(amount);
    }

    destroy() {
        this.isDestroyed = true;
        
        // Remove all projectiles
        for (const projectile of this.projectiles) {
            this.scene.remove(projectile.mesh);
        }
        this.projectiles = [];
        
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        if (this.body) {
            this.world.removeBody(this.body);
        }

        super.destroy();
    }

    dispose() {
        this.destroy();
        super.dispose();
    }
}