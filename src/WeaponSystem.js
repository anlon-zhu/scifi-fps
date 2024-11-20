import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

// Import the model as a URL
const fpsRigUrl = new URL('./static/models/Fps Rig.glb', import.meta.url).href;

export class WeaponSystem {
    constructor(scene, camera, audioSystem) {
        this.scene = scene;
        this.camera = camera;
        this.audioSystem = audioSystem;

        // Ammo system configuration
        this.ammoConfig = {
            magazineSize: 20,
            reloadTime: 1800, // ms
            totalAmmo: 140    // Total ammo including current magazine
        };
        this.currentAmmo = this.ammoConfig.magazineSize;
        this.reserveAmmo = this.ammoConfig.totalAmmo - this.ammoConfig.magazineSize;
        this.isReloading = false;
        this.reloadCancelled = false;

        // Hit effects system
        this.hitEffects = new Map();
        this.hitEffectConfig = {
            radius: 0.03,
            segments: 8,
            color: 0xffff00,
            duration: 100 // ms
        };

        // Recoil and accuracy configuration
        this.recoilConfig = {
            // Visual recoil
            positionAmount: 0.1,      // How far the gun moves back
            heightAmount: 0.05,       // How far the gun moves up
            rotationAmount: 0.1,      // How much the gun rotates
            recoverySpeed: 8,         // Speed of visual and accuracy recovery (higher = faster)
            
            // Accuracy and spread
            spreadIncrement: 0.1,     // How much spread increases per shot
            maxSpread: 0.3,          // Maximum possible spread
            horizontalRatio: 0.15,    // Horizontal spread ratio
            
            // Timing
            resetDelay: 400,         // Ms before recovery starts
            minRecoveryThreshold: 0.01 // Minimum value before snapping to 0
        };

        // Runtime states
        this.currentRecoil = 0;
        this.lastShotTime = 0;
        this.baseGunPosition = null;
        this.baseGunRotation = null;
        this.isRecovering = false;
        this.canShoot = true;
        this.shootDelay = 100;

        // Animation mixer
        this.mixer = null;
        this.shootAction = null;
        this.reloadAction = null;

        // Tracer system
        this.activeTracers = [];
        this.tracerMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffff00,
            transparent: true,
            opacity: 0.7
        });

        // Initialize weapon systems
        this.setupWeapon();
        this.createAmmoDisplay();
    }

    setupWeapon() {
        // Load FPS rig model
        const loader = new GLTFLoader();
        loader.load(
            fpsRigUrl,
            (gltf) => {
                this.gun = gltf.scene;
                
                // Setup animations
                this.mixer = new THREE.AnimationMixer(this.gun);
                const animations = gltf.animations;
                if (animations && animations.length > 0) {
                    // Assuming animations[0] is shoot and animations[1] is reload
                    this.shootAction = this.mixer.clipAction(animations[0]);
                    if (animations.length > 1) {
                        this.reloadAction = this.mixer.clipAction(animations[1]);
                    }
                }

                // Scale and position the rig
                this.gun.scale.set(0.15, 0.15, 0.15);
                this.gun.position.set(0, -0.4, -0.6);
                this.gun.rotation.set(0, -Math.PI * 1.5, 0);

                // Log the model structure to help debug
                console.log('Model structure:', this.gun);
                
                // Log gun's position in different coordinate spaces
                const worldPos = new THREE.Vector3();
                this.gun.getWorldPosition(worldPos);
                console.log('Gun positions:', {
                    local: this.gun.position.clone(),
                    world: worldPos,
                    cameraSpace: this.camera.worldToLocal(worldPos.clone())
                });
                
                this.gun.traverse((child) => {
                    console.log('Child:', child.name, child.type);
                    if (child.type === 'Mesh') {
                        const meshWorldPos = new THREE.Vector3();
                        child.getWorldPosition(meshWorldPos);
                        console.log(`Mesh ${child.name} world position:`, meshWorldPos);
                    }
                });

                // Add gun to camera
                this.camera.add(this.gun);

                // Store the initial position and rotation
                this.baseGunPosition = this.gun.position.clone();
                this.baseGunRotation = this.gun.rotation.clone();

                console.log('FPS Rig loaded successfully');
            },
            // Progress callback
            (xhr) => {
                console.log((xhr.loaded / xhr.total * 100) + '% loaded');
            },
            // Error callback
            (error) => {
                console.error('Error loading FPS Rig:', error);
            }
        );

        // Setup click event for shooting
        document.addEventListener('click', (event) => {
            if (event.button === 0 && document.pointerLockElement) {
                this.shoot();
            }
        });

        // Setup reload key event
        document.addEventListener('keydown', (event) => {
            if (event.code === 'KeyR' && document.pointerLockElement) {
                this.reload();
            }
        });
    }

    createAmmoDisplay() {
        const ammoContainer = document.createElement('div');
        ammoContainer.style.position = 'fixed';
        ammoContainer.style.bottom = '20px';
        ammoContainer.style.right = '20px';
        ammoContainer.style.color = 'white';
        ammoContainer.style.fontFamily = 'Arial, sans-serif';
        ammoContainer.style.fontSize = '24px';
        ammoContainer.style.padding = '10px';
        ammoContainer.style.background = 'rgba(0, 0, 0, 0.5)';
        ammoContainer.style.borderRadius = '5px';
        ammoContainer.style.userSelect = 'none';
        this.ammoDisplay = ammoContainer;
        this.updateAmmoDisplay();
        document.body.appendChild(ammoContainer);
    }

    updateAmmoDisplay() {
        if (!this.ammoDisplay) return;
        this.ammoDisplay.textContent = `${this.currentAmmo} / ${this.reserveAmmo}`;
        
        // Visual feedback for low ammo
        if (this.currentAmmo <= 5) {
            this.ammoDisplay.style.color = '#ff4444';
        } else {
            this.ammoDisplay.style.color = 'white';
        }
    }

    update(currentTime) {
        // Update animation mixer
        if (this.mixer) {
            this.mixer.update(currentTime / 1000); // Convert to seconds
        }

        // Update tracers
        this.updateTracers(currentTime);
        
        // Update hit effects
        this.updateHitEffects(currentTime);
    }

    updateTracers(currentTime) {
        const tracerDuration = 100; // Tracer visible for 100ms
        
        this.activeTracers = this.activeTracers.filter(tracer => {
            const age = currentTime - tracer.creationTime;
            
            if (age > tracerDuration) {
                // Remove old tracer
                this.scene.remove(tracer.line);
                return false;
            }
            
            // Fade out tracer
            const opacity = 1 - (age / tracerDuration);
            tracer.line.material.opacity = opacity * 0.7;
            
            return true;
        });
    }

    updateHitEffects(currentTime) {
        this.hitEffects.forEach((creationTime, hitEffect) => {
            const age = currentTime - creationTime;
            if (age > this.hitEffectConfig.duration) {
                this.scene.remove(hitEffect);
                this.hitEffects.delete(hitEffect);
            }
        });
    }

    createHitEffect(hitPoint) {
        const hitEffect = new THREE.Mesh(
            new THREE.SphereGeometry(
                this.hitEffectConfig.radius, 
                this.hitEffectConfig.segments, 
                this.hitEffectConfig.segments
            ),
            new THREE.MeshBasicMaterial({ color: this.hitEffectConfig.color })
        );
        hitEffect.position.copy(hitPoint);
        this.scene.add(hitEffect);
        this.hitEffects.set(hitEffect, performance.now());
    }

    handleHit(hitPoint, target) {
        // Create hit effect
        this.createHitEffect(hitPoint);

        // Handle damage
        if (target && target.userData) {
            if (target.userData.type === 'obstacle' && 
                target.userData.obstacleData && 
                target.userData.obstacleData.destructible) {
                target.userData.obstacleData.health -= 25;
            } else if (target.userData.type === 'enemy' && 
                      target.userData.enemyData) {
                target.userData.enemyData.health -= 25;
            }
        }
    }

    shoot() {
        if (!this.canShoot || this.isReloading || this.currentAmmo <= 0) return;
        
        // Play shoot animation if available
        if (this.shootAction) {
            this.shootAction.reset();
            this.shootAction.play();
        }

        // Cancel reload if in progress
        if (this.isReloading) {
            this.reloadCancelled = true;
            this.isReloading = false;
        }
        
        // Decrease ammo
        this.currentAmmo--;
        this.updateAmmoDisplay();
        
        // Auto-reload when empty
        if (this.currentAmmo === 0 && this.reserveAmmo > 0) {
            this.reload();
        }

        // Apply recoil and update accuracy
        this.applyRecoil();
        
        // Calculate current accuracy spread based on recoil
        const currentTime = performance.now();
        const timeSinceLastShot = currentTime - this.lastShotTime;
        
        if (timeSinceLastShot < this.recoilConfig.resetDelay) {
            this.currentRecoil = Math.min(
                this.recoilConfig.maxSpread,
                this.currentRecoil + this.recoilConfig.spreadIncrement
            );
        }
        
        // Calculate spread based on current recoil
        const spread = this.currentRecoil;
        
        // Calculate ray from camera with spread
        const raycaster = new THREE.Raycaster();
        const center = new THREE.Vector2(
            (Math.random() - 0.5) * spread * this.recoilConfig.horizontalRatio,
            (Math.random() * spread)
        );
        raycaster.setFromCamera(center, this.camera);
        
        // Update last shot time
        this.lastShotTime = currentTime;

        // Get gun muzzle position (slightly in front of gun model)
        if (!this.gun) return;
        const muzzlePosition = new THREE.Vector3();
        this.gun.getWorldPosition(muzzlePosition);
        
        // Calculate offset in camera's direction
        const muzzleOffset = new THREE.Vector3(0, 0, 0.9);
        muzzleOffset.applyQuaternion(this.camera.quaternion);
        muzzleOffset.multiplyScalar(0.4);
        muzzlePosition.add(muzzleOffset);

        // Log shooting positions
        console.log('Shooting positions:', {
            muzzle: muzzlePosition.clone(),
            camera: this.camera.position.clone(),
            gun: this.gun.getWorldPosition(new THREE.Vector3()),
            cameraDirection: this.camera.getWorldDirection(new THREE.Vector3())
        });

        // Handle shooting cooldown
        this.canShoot = false;
        setTimeout(() => {
            this.canShoot = true;
        }, this.shootDelay);

        // Find all intersections with scene objects
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        let hitPoint = null;
        let hitObstacle = null;
        
        if (intersects.length > 0) {
            const hit = intersects[0];
            hitPoint = hit.point;

            // Find the obstacle by traversing up the parent hierarchy
            let currentObject = hit.object;
            while (currentObject) {
                if (currentObject.userData && currentObject.userData.type === 'obstacle') {
                    hitObstacle = currentObject.userData.obstacleData;
                    break;
                }
                currentObject = currentObject.parent;
            }
        }

        console.log('Raycast intersections:', intersects.length);

        if (intersects.length > 0) {
            const hit = intersects[0];
            console.log('Hit object:', hit.object);
            console.log('Hit object userData:', hit.object.userData);

            // Find the root object (container) that has the enemy data
            let targetObject = hit.object;
            while (targetObject.parent && !targetObject.userData.type) {
                targetObject = targetObject.parent;
            }
            console.log('Target object:', targetObject);
            console.log('Target object userData:', targetObject.userData);

            // Call onHit with the root object
            if (this.onHit) {
                this.onHit(hit.point, targetObject);
            }

            // Create visual tracer
            if (hitPoint) {
                // Create tracer to hit point
                const tracerGeometry = new THREE.BufferGeometry().setFromPoints([
                    muzzlePosition,
                    hitPoint
                ]);
                const tracer = new THREE.Line(tracerGeometry, this.tracerMaterial);
                this.scene.add(tracer);
                
                this.activeTracers.push({
                    line: tracer,
                    creationTime: performance.now()
                });
            } else {
                // If no hit, extend tracer to a reasonable distance
                const farPoint = raycaster.ray.direction.clone();
                farPoint.multiplyScalar(1000);
                farPoint.add(muzzlePosition);
                
                const tracerGeometry = new THREE.BufferGeometry().setFromPoints([
                    muzzlePosition,
                    farPoint
                ]);
                const tracer = new THREE.Line(tracerGeometry, this.tracerMaterial);
                this.scene.add(tracer);
                
                this.activeTracers.push({
                    line: tracer,
                    creationTime: performance.now()
                });
            }
        }
        
        // Play shooting sound
        this.audioSystem.play('shoot');
    }

    applyRecoil() {
        if (!this.gun || !this.baseGunPosition || !this.baseGunRotation) return;

        // If already recovering, don't start a new recoil
        if (this.isRecovering) {
            // Add additional recoil to current position
            this.gun.position.z += this.recoilConfig.positionAmount * 0.5;
            this.gun.position.y += this.recoilConfig.heightAmount * 0.5;
            this.gun.rotation.x += this.recoilConfig.rotationAmount * 0.5;
            return;
        }

        this.isRecovering = true;
        
        // Apply immediate recoil relative to base position
        this.gun.position.z = this.baseGunPosition.z + this.recoilConfig.positionAmount;
        this.gun.position.y = this.baseGunPosition.y + this.recoilConfig.heightAmount;
        this.gun.rotation.x = this.baseGunRotation.x + this.recoilConfig.rotationAmount;
        
        // Smooth recovery animation
        const animate = () => {
            if (!this.gun) return;
            
            const delta = 1.0 / 60;
            const recovery = this.recoilConfig.recoverySpeed * delta;
            
            // Recover position and rotation towards base position
            this.gun.position.z = THREE.MathUtils.lerp(
                this.gun.position.z,
                this.baseGunPosition.z,
                recovery
            );
            this.gun.position.y = THREE.MathUtils.lerp(
                this.gun.position.y,
                this.baseGunPosition.y,
                recovery
            );
            this.gun.rotation.x = THREE.MathUtils.lerp(
                this.gun.rotation.x,
                this.baseGunRotation.x,
                recovery
            );
            
            // Recover accuracy over time
            if (performance.now() - this.lastShotTime > this.recoilConfig.resetDelay) {
                this.currentRecoil = THREE.MathUtils.lerp(
                    this.currentRecoil,
                    0,
                    recovery
                );
                
                if (this.currentRecoil < this.recoilConfig.minRecoveryThreshold) {
                    this.currentRecoil = 0;
                }
            }
            
            // Check if fully recovered
            const posZDiff = Math.abs(this.gun.position.z - this.baseGunPosition.z);
            const posYDiff = Math.abs(this.gun.position.y - this.baseGunPosition.y);
            const rotXDiff = Math.abs(this.gun.rotation.x - this.baseGunRotation.x);
            
            if (
                posZDiff <= this.recoilConfig.minRecoveryThreshold &&
                posYDiff <= this.recoilConfig.minRecoveryThreshold &&
                rotXDiff <= this.recoilConfig.minRecoveryThreshold &&
                this.currentRecoil <= 0
            ) {
                // Snap to exact base position
                this.gun.position.copy(this.baseGunPosition);
                this.gun.rotation.copy(this.baseGunRotation);
                this.isRecovering = false;
            } else {
                requestAnimationFrame(animate);
            }
        };
        
        // Start recovery animation
        requestAnimationFrame(animate);
    }

    reload() {
        if (this.isReloading || this.currentAmmo === this.ammoConfig.magazineSize || this.reserveAmmo <= 0) return;
        
        // Play reload animation if available
        if (this.reloadAction) {
            this.reloadAction.reset();
            this.reloadAction.play();
        }

        // Cancel recoil recovery if in progress
        if (this.isRecovering) {
            this.isRecovering = false;
            // Reset gun position to base position before starting reload
            this.gun.position.copy(this.baseGunPosition);
            this.gun.rotation.copy(this.baseGunRotation);
        }

        this.isReloading = true;
        this.reloadCancelled = false;
        this.audioSystem.play('reload');

        const originalPos = this.gun.position.clone();
        const originalRot = this.gun.rotation.clone();
        const startTime = performance.now();
        
        // Animation constants
        const RELOAD_TIME = this.ammoConfig.reloadTime;
        const ANGLES = {
            DOWN: Math.PI / 10,
            CLOCKWISE: Math.PI / 10
        };
        const OFFSETS = {
            MAGAZINE: -0.04
        };
        const TIMINGS = {
            DOWN_TILT_END: 0.25,
            CLOCKWISE_START: 0.15,
            CLOCKWISE_END: 0.4,
            MAG_DROP_START: 0.4,
            MAG_DROP_END: 0.46,
            MAG_HOLD_END: 0.56,
            MAG_RISE_END: 0.64,
            RETURN_START: 0.7
        };

        // Easing functions
        const ease = {
            inOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
            out: t => 1 - Math.pow(1 - t, 2)
        };

        const animate = () => {
            if (this.reloadCancelled) {
                // Reset gun position and state
                this.gun.position.copy(originalPos);
                this.gun.rotation.copy(originalRot);
                this.isReloading = false;
                return;
            }

            const progress = (performance.now() - startTime) / RELOAD_TIME;
            
            if (progress >= 1) {
                // Reset gun position
                this.gun.position.copy(originalPos);
                this.gun.rotation.copy(originalRot);
                
                // Update ammo counts
                const ammoNeeded = this.ammoConfig.magazineSize - this.currentAmmo;
                const ammoToAdd = Math.min(ammoNeeded, this.reserveAmmo);
                this.currentAmmo += ammoToAdd;
                this.reserveAmmo -= ammoToAdd;
                this.updateAmmoDisplay();
                
                // Reset states
                this.isReloading = false;
                this.currentRecoil = 0;
                return;
            }

            // Calculate rotations
            let downTilt = 0;
            if (progress < TIMINGS.DOWN_TILT_END) {
                downTilt = ease.inOut(progress / TIMINGS.DOWN_TILT_END) * ANGLES.DOWN;
            } else if (progress < TIMINGS.RETURN_START) {
                downTilt = ANGLES.DOWN;
            } else {
                downTilt = ANGLES.DOWN * (1 - ease.out((progress - TIMINGS.RETURN_START) / (1 - TIMINGS.RETURN_START)));
            }

            let clockwiseTilt = 0;
            if (progress > TIMINGS.CLOCKWISE_START && progress < TIMINGS.CLOCKWISE_END) {
                clockwiseTilt = ease.inOut((progress - TIMINGS.CLOCKWISE_START) / (TIMINGS.CLOCKWISE_END - TIMINGS.CLOCKWISE_START)) * ANGLES.CLOCKWISE;
            } else if (progress >= TIMINGS.CLOCKWISE_END && progress < TIMINGS.RETURN_START) {
                clockwiseTilt = ANGLES.CLOCKWISE;
            } else if (progress >= TIMINGS.RETURN_START) {
                clockwiseTilt = ANGLES.CLOCKWISE * (1 - ease.out((progress - TIMINGS.RETURN_START) / (1 - TIMINGS.RETURN_START)));
            }

            // Calculate magazine motion
            let verticalOffset = 0;
            if (progress > TIMINGS.MAG_DROP_START && progress < TIMINGS.MAG_DROP_END) {
                const dropProgress = (progress - TIMINGS.MAG_DROP_START) / (TIMINGS.MAG_DROP_END - TIMINGS.MAG_DROP_START);
                verticalOffset = OFFSETS.MAGAZINE * ease.out(dropProgress);
            } else if (progress >= TIMINGS.MAG_DROP_END && progress < TIMINGS.MAG_HOLD_END) {
                verticalOffset = OFFSETS.MAGAZINE;
            } else if (progress >= TIMINGS.MAG_HOLD_END && progress < TIMINGS.MAG_RISE_END) {
                const riseProgress = (progress - TIMINGS.MAG_HOLD_END) / (TIMINGS.MAG_RISE_END - TIMINGS.MAG_HOLD_END);
                verticalOffset = OFFSETS.MAGAZINE * (1 - ease.inOut(riseProgress));
            }

            // Apply transformations
            this.gun.rotation.x = originalRot.x - downTilt;
            this.gun.rotation.y = originalRot.y + clockwiseTilt;
            this.gun.position.y = originalPos.y + verticalOffset;
            
            requestAnimationFrame(animate);
        };
        
        requestAnimationFrame(animate);
    }
}
