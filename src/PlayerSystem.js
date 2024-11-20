import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class PlayerSystem {
    constructor(scene, camera, world) {
        this.scene = scene;
        this.camera = camera;
        this.world = world;
        this.renderer = scene.renderer;
        this.weaponSystem = scene.weaponSystem;
        this.game = scene.game;  // Store reference to game
        
        // Movement state
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
        this.isJumping = false;
        this.canJump = true;
        this.jumpCooldown = false;
        
        // Health system
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.isDead = false;
        this.createHealthBar();

        // Crouching properties
        this.isCrouching = false;
        this.crouchHeight = 1.0;    // Height when crouched
        this.standHeight = 2.0;     // Height when standing
        this.currentHeight = this.standHeight;
        this.crouchSpeed = 10.0;    // Speed of crouch transition
        this.crouchSpeedMultiplier = 0.2; // 20% of normal speed when crouching
        this.hitRadius = 1.0;       // Default hit radius when standing
        this.crouchHitRadius = 0.5; // Smaller hit radius when crouching
        
        // Player physics properties
        this.jumpVelocity = 7.57;  // Initial jump velocity for 1.2m height
        this.knifeSpeed = 4.5;    // Max speed for knife
        this.maxSpeed = this.knifeSpeed;  // Current max speed (changes with weapon)
        this.acceleration = 20;     // Very quick acceleration
        this.scalingFriction = 8;  // Quick initial slowdown
        this.flatFriction = 25;    // Strong stopping power
        this.airStrafeSpeed = 2.5; // More controlled air strafing
        this.counterStrafing = true; // Enable counter-strafe mechanics
        this.mouseRotation = { x: 0, y: 0 };
        
        // Create player hitbox
        this.hitbox = new THREE.Mesh(
            new THREE.BoxGeometry(1, this.standHeight, 1),
            new THREE.MeshBasicMaterial({ visible: false })
        );
        this.hitbox.userData.type = 'player';
        scene.add(this.hitbox);

        this.setupPlayer();
        this.setupEventListeners();
    }

    createHealthBar() {
        // Create health bar container
        this.healthBarContainer = document.createElement('div');
        this.healthBarContainer.style.position = 'fixed';
        this.healthBarContainer.style.bottom = '20px';
        this.healthBarContainer.style.left = '20px';
        this.healthBarContainer.style.width = '200px';
        this.healthBarContainer.style.height = '20px';
        this.healthBarContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.healthBarContainer.style.border = '2px solid white';

        // Create health bar
        this.healthBar = document.createElement('div');
        this.healthBar.style.width = '100%';
        this.healthBar.style.height = '100%';
        this.healthBar.style.backgroundColor = '#00ff00';
        this.healthBar.style.transition = 'width 0.2s ease-out';

        // Create health text
        this.healthText = document.createElement('div');
        this.healthText.style.position = 'absolute';
        this.healthText.style.width = '100%';
        this.healthText.style.textAlign = 'center';
        this.healthText.style.color = 'white';
        this.healthText.style.fontFamily = 'Arial';
        this.healthText.style.lineHeight = '20px';
        this.healthText.textContent = this.health;

        this.healthBarContainer.appendChild(this.healthBar);
        this.healthBarContainer.appendChild(this.healthText);
        document.body.appendChild(this.healthBarContainer);
    }

    takeDamage(amount) {
        if (this.isDead) return;
        
        this.health = Math.max(0, this.health - amount);
        
        // Update health bar
        const healthPercent = (this.health / this.maxHealth) * 100;
        this.healthBar.style.width = healthPercent + '%';
        this.healthText.textContent = Math.round(this.health);

        // Update color based on health
        if (healthPercent > 60) {
            this.healthBar.style.backgroundColor = '#00ff00';
        } else if (healthPercent > 30) {
            this.healthBar.style.backgroundColor = '#ffff00';
        } else {
            this.healthBar.style.backgroundColor = '#ff0000';
        }

        // Handle death
        if (this.health <= 0) {
            this.die();
        }
    }

    die() {
        if (this.isDead) return;
        
        console.log('Player died');
        this.isDead = true;
        this.health = 0;
        
        // Update health bar to show death
        this.healthBar.style.width = '0%';
        this.healthBar.style.backgroundColor = '#ff0000';
        this.healthText.textContent = '0';

        // Stop all movement
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;

        // Notify game of death
        if (this.game) {
            console.log('Notifying game of death');
            this.game.handlePlayerDeath();
        } else {
            console.error('Game reference not found!');
        }
    }

    reset() {
        console.log('Resetting player');
        this.isDead = false;
        this.health = this.maxHealth;
        
        // Reset health bar
        this.healthBar.style.width = '100%';
        this.healthBar.style.backgroundColor = '#00ff00';
        this.healthText.textContent = this.maxHealth;
        
        // Reset position and movement
        this.playerBody.position.set(0, this.standHeight / 2, 0);
        this.playerBody.velocity.setZero();
        this.moveForward = false;
        this.moveBackward = false;
        this.moveLeft = false;
        this.moveRight = false;
    }

    setupPlayer() {
        const playerShape = new CANNON.Box(new CANNON.Vec3(0.5, this.standHeight / 2, 0.5));
        const playerPhysMaterial = new CANNON.Material('playerMaterial');
        
        this.playerBody = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(0, this.standHeight / 2, 0),
            shape: playerShape,
            material: playerPhysMaterial,
            fixedRotation: true,
            linearDamping: 0
        });

        // Create contact material between player and ground
        const groundMaterial = this.world.bodies[0].material;  // Ground is first body added
        const playerGroundContact = new CANNON.ContactMaterial(
            groundMaterial,
            playerPhysMaterial,
            {
                friction: 0.0,  // We handle friction ourselves
                restitution: 0.0  // No bouncing
            }
        );
        this.world.addContactMaterial(playerGroundContact);

        this.world.addBody(this.playerBody);

        // Update camera when player moves
        this.playerBody.addEventListener('collide', (e) => {
            const contact = e.contact;
            const normalY = contact.ni.y;

            if (Math.abs(normalY) > 0.5) {
                this.isJumping = false;
                this.canJump = true;
            }
        });
    }

    setupEventListeners() {
        // Mouse movement
        document.addEventListener('mousemove', (event) => {
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
        });

        // Lock pointer on click
        document.addEventListener('click', () => {
            if (document.pointerLockElement !== this.renderer.domElement) {
                this.renderer.domElement.requestPointerLock();
            }
        });

        // Key handlers
        document.addEventListener('keydown', (event) => {
            switch(event.code) {
                case 'KeyW': this.moveForward = true; break;
                case 'KeyS': this.moveBackward = true; break;
                case 'KeyA': this.moveLeft = true; break;
                case 'KeyD': this.moveRight = true; break;
                case 'Space': 
                    if (this.canJump && !this.jumpCooldown) {
                        this.jump();
                    }
                    break;
                case 'ControlLeft':
                case 'ControlRight':
                    this.isCrouching = true;
                    break;
            }
        });

        document.addEventListener('keyup', (event) => {
            switch(event.code) {
                case 'KeyW': this.moveForward = false; break;
                case 'KeyS': this.moveBackward = false; break;
                case 'KeyA': this.moveLeft = false; break;
                case 'KeyD': this.moveRight = false; break;
                case 'ControlLeft':
                case 'ControlRight':
                    this.isCrouching = false;
                    break;
            }
        });
    }

    jump() {
        if (this.canJump && !this.isJumping && !this.jumpCooldown) {
            this.playerBody.velocity.y = this.jumpVelocity;  
            this.isJumping = true;
            this.canJump = false;
            this.jumpCooldown = true;
            
            setTimeout(() => {
                this.jumpCooldown = false;
            }, 250);
        }
    }

    update() {
        // Update hitbox position and size
        this.hitbox.position.copy(this.camera.position);
        
        // Adjust hitbox height and position for crouching
        const currentHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        this.hitbox.scale.y = currentHeight / this.standHeight;
        
        // Center the hitbox vertically relative to camera
        this.hitbox.position.y -= (this.standHeight - currentHeight) / 2;

        // Handle crouching transition
        const deltaTime = 1/60;
        const targetHeight = this.isCrouching ? this.crouchHeight : this.standHeight;
        const heightDiff = targetHeight - this.currentHeight;
        
        if (Math.abs(heightDiff) > 0.01) {
            const oldHeight = this.currentHeight;
            this.currentHeight += Math.sign(heightDiff) * this.crouchSpeed * deltaTime;
            this.currentHeight = Math.max(this.crouchHeight, 
                                       Math.min(this.standHeight, this.currentHeight));
            
            // Update physics body height
            this.playerBody.shapes[0].halfExtents.y = this.currentHeight / 2;
            this.playerBody.shapes[0].updateConvexPolyhedronRepresentation();
            
            // Adjust body position to maintain feet position
            const heightChange = this.currentHeight - oldHeight;
            this.playerBody.position.y += heightChange / 2;
            
            // Adjust camera height smoothly
            this.camera.position.y = this.playerBody.position.y + this.currentHeight * 0.85;
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

        // Detect counter-strafing (pressing opposite direction)
        const isCounterStrafing = 
            (this.moveLeft && wasMovingRight) ||
            (this.moveRight && wasMovingLeft) ||
            (this.moveForward && wasMovingBackward) ||
            (this.moveBackward && wasMovingForward);

        moveDirection.normalize();
        moveDirection.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.mouseRotation.x);

        // Get current horizontal velocity
        const horizontalVel = new THREE.Vector3(
            this.playerBody.velocity.x,
            0,
            this.playerBody.velocity.z
        );
        const currentSpeed = horizontalVel.length();

        // Check if grounded using raycasting
        const raycaster = new THREE.Raycaster(
            this.camera.position,
            new THREE.Vector3(0, -1, 0),
            0,
            1.01  // Slightly more than player height
        );
        const intersects = raycaster.intersectObjects(this.scene.children);
        const isGrounded = intersects.length > 0 && Math.abs(this.playerBody.velocity.y) < 0.1;

        let desiredSpeed = 0;

        if (isGrounded) {
            // Ground movement
            if (moveDirection.length() > 0) {
                // Apply crouch speed reduction
                const crouchMultiplier = this.isCrouching ? this.crouchSpeedMultiplier : 1.0;
                // Faster acceleration from standstill
                const accelerationMultiplier = currentSpeed < 1 ? 2.0 : 1.0;
                desiredSpeed = Math.min(
                    currentSpeed + this.acceleration * accelerationMultiplier * deltaTime,
                    this.maxSpeed * crouchMultiplier
                );
            } else if (currentSpeed > 0) {
                // Counter-strafing: immediate stop
                if (isCounterStrafing) {
                    desiredSpeed = 0;
                    this.playerBody.velocity.x = 0;
                    this.playerBody.velocity.z = 0;
                } else {
                    // Normal friction when just releasing keys
                    const frictionTime = deltaTime;
                    const newSpeed = Math.max(0, 
                        currentSpeed * Math.exp(-this.scalingFriction * frictionTime) 
                        - this.flatFriction * frictionTime
                    );
                
                    if (newSpeed < 1e-10) {
                        desiredSpeed = 0;
                        this.playerBody.velocity.x = 0;
                        this.playerBody.velocity.z = 0;
                    } else {
                        desiredSpeed = newSpeed;
                        moveDirection.copy(horizontalVel.normalize());
                    }
                }
            }

            // Reset jump state when grounded
            this.isJumping = false;
            this.canJump = true;
        } else {
            // Air movement should be slower when strafing not in the camera direction
            if (moveDirection.length() > 0 && (moveDirection.x != 0 || moveDirection.z > 0)) {
                desiredSpeed = this.airStrafeSpeed;
            } else {
                desiredSpeed = currentSpeed;
            }
        }

        // Apply final velocity
        if (moveDirection.length() > 0 && desiredSpeed > 0) {
            this.playerBody.velocity.x = moveDirection.x * desiredSpeed;
            this.playerBody.velocity.z = moveDirection.z * desiredSpeed;
        }

        // Update camera position to match player body
        this.camera.position.copy(this.playerBody.position);
    }
}
