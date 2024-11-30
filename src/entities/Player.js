import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DestructibleEntity } from './DestructibleEntity.js';

export class Player extends DestructibleEntity {
    constructor(scene, world, position) {
        super(scene, world, position, 100); // 100 is default max health
        
        this.camera = this.scene.camera;
        this.renderer = this.scene.renderer;
        
        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isJumping = false;
        this.canJump = true;
        this.jumpCooldown = false;

        // Crouching properties
        this.isCrouching = false;
        this.crouchHeight = 1.0;    // Height when crouched
        this.standHeight = 2.0;     // Height when standing
        this.currentHeight = this.standHeight;
        this.crouchSpeed = 10.0;    // Speed of crouch transition
        this.crouchSpeedMultiplier = 0.2; // 20% of normal speed when crouching
        this.hitRadius = 1.0;       // Default hit radius when standing
        this.crouchHitRadius = 0.5; // Smaller hit radius when crouching
        
        // Physics properties
        this.jumpVelocity = 7.57;  // Initial jump velocity for 1.2m height
        this.knifeSpeed = 4.5;     // Max speed for knife
        this.maxSpeed = this.knifeSpeed;  // Current max speed (changes with weapon)
        this.acceleration = 20;     // Very quick acceleration
        this.scalingFriction = 8;  // Quick initial slowdown
        this.flatFriction = 25;    // Strong stopping power
        this.airStrafeSpeed = 2.5; // More controlled air strafing
        this.counterStrafing = true; // Enable counter-strafe mechanics
        this.mouseRotation = { x: 0, y: 0 };

        this.setupPhysics();
        this.setupHitbox();
    }

    setupPhysics() {
        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, this.standHeight / 2, 0.5));
        const playerPhysMaterial = new CANNON.Material('playerMaterial');
        
        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(...this.position),
            shape: playerShape,
            material: playerPhysMaterial,
            fixedRotation: true,
            linearDamping: 0
        });

        // Create contact material between player and ground
        const groundMaterial = this.world.bodies[0].material;
        const playerGroundContact = new CANNON.ContactMaterial(
            groundMaterial,
            playerPhysMaterial,
            {
                friction: 0.0,  // We handle friction ourselves
                restitution: 0.0  // No bouncing
            }
        );
        this.world.addContactMaterial(playerGroundContact);
        this.world.addBody(this.body);

        // Collision handler for jump state
        this.body.addEventListener('collide', (e) => {
            const contact = e.contact;
            const normalY = contact.ni.y;

            if (Math.abs(normalY) > 0.5) {
                this.isJumping = false;
                this.canJump = true;
            }
        });
    }

    setupHitbox() {
        this.hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(1, this.standHeight, 1),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        this.hitbox.userData.type = 'player';
        this.scene.add(this.hitbox);
    }

    jump() {
        if (this.canJump && !this.isJumping && !this.jumpCooldown) {
            this.body.velocity.y = this.jumpVelocity;
            this.isJumping = true;
            this.canJump = false;
            this.jumpCooldown = true;
            
            setTimeout(() => {
                this.jumpCooldown = false;
            }, 250);
        }
    }

    handleMouseMove(event) {
        if (document.pointerLockElement === this.renderer.domElement) {
            this.mouseRotation.x -= event.movementX * 0.002;
            this.mouseRotation.y -= event.movementY * 0.002;

            // Limit vertical rotation
            this.mouseRotation.y = Math.max(-Math.PI/2, Math.min(Math.PI/2, this.mouseRotation.y));
            
            // Apply rotation to camera
            this.camera.rotation.order = 'YXZ';
            this.camera.rotation.x = this.mouseRotation.y;
            this.camera.rotation.y = this.mouseRotation.x;
        }
    }

    update(deltaTime = 1/60) {
        if (this.isDestroyed) return;

        // Update hitbox position and size
        this.hitbox.position.copy(this.camera.position);
        
        // Adjust hitbox height and position for crouching
        const currentHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        this.hitbox.scale.y = currentHeight / this.standHeight;
        
        // Center the hitbox vertically relative to camera
        this.hitbox.position.y -= (this.standHeight - currentHeight) / 2;

        // Handle crouching transition
        const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        const heightDiff = targetHeight - this.currentHeight;
        
        if (Math.abs(heightDiff) > 0.01) {
            const oldHeight = this.currentHeight;
            this.currentHeight += Math.sign(heightDiff) * this.crouchSpeed * deltaTime;
            this.currentHeight = Math.max(this.crouchHeight, 
                                       Math.min(this.standHeight, this.currentHeight));
            
            // Update physics body height
            this.body.shapes[0].halfExtents.y = this.currentHeight / 2;
            this.body.shapes[0].updateConvexPolyhedronRepresentation();
            
            // Adjust body position to maintain feet position
            const heightChange = this.currentHeight - oldHeight;
            this.body.position.y += heightChange / 2;
            
            // Adjust camera height smoothly
            this.camera.position.y = this.body.position.y + this.currentHeight * 0.85;
        }

        // Calculate movement direction based on camera rotation
        const moveDirection = new THREE.Vector3();

        // Track previous movement for counter-strafing
        const wasMovingLeft = this.moveLeft;
        const wasMovingRight = this.moveRight;
        const wasMovingForward = this.moveForward;
        const wasMovingBackward = this.moveBackward;

        if (this.moveForward) moveDirection.z -= 1;
        if (this.moveBackward) moveDirection.z += 1;
        if (this.moveLeft) moveDirection.x -= 1;
        if (this.moveRight) moveDirection.x += 1;

        // Detect counter-strafing
        const isCounterStrafing = 
            (this.moveLeft && wasMovingRight) ||
            (this.moveRight && wasMovingLeft) ||
            (this.moveForward && wasMovingBackward) ||
            (this.moveBackward && wasMovingForward);

        moveDirection.normalize();
        moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mouseRotation.x);

        // Get current horizontal velocity
        const horizontalVel = new THREE.Vector3(
            this.body.velocity.x,
            0,
            this.body.velocity.z
        );
        const currentSpeed = horizontalVel.length();

        // Check if grounded using raycasting
        const raycaster = new THREE.Raycaster(
            this.camera.position,
            new THREE.Vector3(0, -1, 0),
            0,
            1.01
        );
        const intersects = raycaster.intersectObjects(this.scene.children);
        const isGrounded = intersects.length > 0 && Math.abs(this.body.velocity.y) < 0.1;

        let desiredSpeed = 0;

        if (isGrounded) {
            // Ground movement
            if (moveDirection.length() > 0) {
                const crouchMultiplier = this.isCrouching ? this.crouchSpeedMultiplier : 1.0;
                const accelerationMultiplier = currentSpeed < 1 ? 2.0 : 1.0;
                desiredSpeed = Math.min(
                    currentSpeed + this.acceleration * accelerationMultiplier * deltaTime,
                    this.maxSpeed * crouchMultiplier
                );
            } else if (currentSpeed > 0) {
                if (isCounterStrafing) {
                    desiredSpeed = 0;
                    this.body.velocity.x = 0;
                    this.body.velocity.z = 0;
                } else {
                    const frictionTime = deltaTime;
                    const newSpeed = Math.max(0, 
                        currentSpeed * Math.exp(-this.scalingFriction * frictionTime) 
                        - this.flatFriction * frictionTime
                    );
                
                    if (newSpeed < 1e-10) {
                        desiredSpeed = 0;
                        this.body.velocity.x = 0;
                        this.body.velocity.z = 0;
                    } else {
                        desiredSpeed = newSpeed;
                        moveDirection.copy(horizontalVel.normalize());
                    }
                }
            }

            this.isJumping = false;
            this.canJump = true;
        } else {
            // Air movement
            if (moveDirection.length() > 0 && (moveDirection.x != 0 || moveDirection.z > 0)) {
                desiredSpeed = this.airStrafeSpeed;
            } else {
                desiredSpeed = currentSpeed;
            }
        }

        // Apply final velocity
        if (moveDirection.length() > 0 && desiredSpeed > 0) {
            this.body.velocity.x = moveDirection.x * desiredSpeed;
            this.body.velocity.z = moveDirection.z * desiredSpeed;
        }

        // Update camera position to match physics body
        this.camera.position.x = this.body.position.x;
        this.camera.position.z = this.body.position.z;

        // Call parent class update
        super.update();
    }

    destroy() {
        super.destroy();
        if (this.hitbox) {
            this.scene.remove(this.hitbox);
        }
        // Additional cleanup specific to player
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
    }

    reset() {
        this.isDestroyed = false;
        this.currentHealth = this.maxHealth;
        
        // Reset position and movement
        this.body.position.set(0, this.standHeight / 2, 0);
        this.body.velocity.setZero();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
    }
}
