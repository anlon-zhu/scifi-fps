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

        // Animation system
        this.mixer = null;
        this.shootAction = null;
        this.reloadAction = null;
        this.lastAnimationTime = 0;

        // Accuracy and recoil system
        this.currentRecoil = 0;
        this.lastShotTime = 0;
        this.recoilConfig = {
            maxSpread: 0.15,
            spreadIncrement: 0.03,
            resetDelay: 200,
            recoveryRate: 0.95
        };

        // Shooting configuration
        this.canShoot = true;
        this.shootDelay = 100;

        // Tracer system
        this.activeTracers = [];
        this.tracerMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffff00,
            transparent: true,
            opacity: 0.5
        });
        this.tracerDuration = 50; // ms

        // Hit effects system
        this.hitEffects = new Map();
        this.hitEffectConfig = {
            radius: 0.03,
            segments: 8,
            color: 0xffff00,
            duration: 100 // ms
        };

        // Muzzle position helper
        this.muzzleWorldPosition = new THREE.Vector3();
        this.muzzleLocalPosition = new THREE.Vector3(2.25, 2, 2.25);

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
                
                // Debug animation names
                console.log('Available animations:', animations.map(a => a.name));
                
                if (animations && animations.length > 0) {
                    // Find shoot animation by name
                    const shootAnim = animations.find(a => a.name.toLowerCase().includes('shoot'));
                    if (shootAnim) {
                        this.shootAction = this.mixer.clipAction(shootAnim);
                        this.shootAction.setLoop(THREE.LoopOnce);
                        this.shootAction.clampWhenFinished = true;
                    }
                    
                    // Find reload animation by name
                    const reloadAnim = animations.find(a => a.name.toLowerCase().includes('reload'));
                    if (reloadAnim) {
                        this.reloadAction = this.mixer.clipAction(reloadAnim);
                        this.reloadAction.setLoop(THREE.LoopOnce);
                        this.reloadAction.clampWhenFinished = true;
                    }
                }

                // Scale and position the rig
                this.gun.scale.set(0.15, 0.15, 0.15);
                this.gun.position.set(0, -0.4, -0.6);
                this.gun.rotation.set(0, -Math.PI * 1.5, 0);

                // Add gun to camera
                this.camera.add(this.gun);

                console.log('FPS Rig loaded successfully');

                // Start animation system
                this.lastAnimationTime = performance.now();
                this.animate();
            },
            undefined,
            (error) => {
                console.error('Error loading weapon model:', error);
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

    animate() {
        requestAnimationFrame(() => this.animate());
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastAnimationTime) / 1000;
        this.lastAnimationTime = currentTime;
        
        if (this.mixer) {
            this.mixer.update(deltaTime);
        }
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
        // ammoContainer.style.background = 'rgba(0, 0, 0, 0.5)';
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
        // Update tracers
        this.updateTracers(currentTime);
        
        // Update hit effects
        this.updateHitEffects(currentTime);

        // Update recoil recovery
        if (currentTime - this.lastShotTime > this.recoilConfig.resetDelay) {
            this.currentRecoil *= this.recoilConfig.recoveryRate;
        }
    }

    updateTracers(currentTime) {
        const tracerDuration = this.tracerDuration; // Tracer visible for 50ms
        
        this.activeTracers = this.activeTracers.filter(tracer => {
            const age = currentTime - tracer.creationTime;
            
            if (age > tracerDuration) {
                // Remove old tracer
                this.scene.remove(tracer.line);
                return false;
            }
            
            // Fade out tracer
            const opacity = 1 - (age / tracerDuration);
            tracer.line.material.opacity = opacity * 0.5;
            
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

    shoot() {
        if (!this.canShoot || this.isReloading || this.currentAmmo <= 0) return;
        
        if (this.shootAction) {
            this.shootAction.reset();
            this.shootAction.play();
        }

        if (this.isReloading) {
            this.reloadCancelled = true;
            this.isReloading = false;
        }

        this.audioSystem.play('shoot');
        this.currentAmmo--;
        this.updateAmmoDisplay();
        
        if (this.currentAmmo === 0 && this.reserveAmmo > 0) {
            this.reload();
        }

        const currentTime = performance.now();
        if (currentTime - this.lastShotTime < this.recoilConfig.resetDelay) {
            this.currentRecoil = Math.min(
                this.recoilConfig.maxSpread,
                this.currentRecoil + this.recoilConfig.spreadIncrement
            );
        }
        
        // Raycast from camera
        const raycaster = new THREE.Raycaster();
        const direction = new THREE.Vector3(0, 0, -1);
        
        if (this.currentRecoil > 0) {
            const spread = this.currentRecoil;
            direction.x += (Math.random() - 0.5) * spread;
            direction.y += (Math.random()) * spread;
            direction.normalize();
        }
        
        direction.applyQuaternion(this.camera.quaternion);
        raycaster.set(this.camera.position, direction);
        
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        
        let hitPoint;
        if (intersects.length > 0) {
            const hit = intersects[0];
            hitPoint = hit.point;
            
            // Find the destructible entity
            let hitObject = hit.object;
            let foundEntity = null;

            console.log('[HIT] Initial hit:', {
                name: hitObject.name,
                type: hitObject.constructor.name,
                hasUserData: !!hitObject.userData,
                hasEntity: !!hitObject.userData?.entity
            });

            // First check the direct hit object
            if (hitObject.userData?.entity?.takeDamage) {
                foundEntity = hitObject.userData.entity;
                console.log('[HIT] Found entity on direct hit');
            } else {
                // Walk up the parent chain looking for an entity reference
                while (hitObject && !foundEntity) {
                    console.log('[HIT] Checking parent:', {
                        name: hitObject.name,
                        type: hitObject.constructor.name,
                        hasEntity: !!hitObject.userData?.entity
                    });

                    if (hitObject.userData?.entity?.takeDamage) {
                        foundEntity = hitObject.userData.entity;
                        console.log('[HIT] Found entity on parent');
                        break;
                    }
                    hitObject = hitObject.parent;
                }
            }

            // If we found an entity, deal damage
            if (foundEntity) {
                console.log('[HIT] Applying damage to:', {
                    type: foundEntity.constructor.name,
                    health: foundEntity.currentHealth
                });
                foundEntity.takeDamage(25);
            } else {
                console.log('[HIT] No entity found on hit object or parents');
            }

            this.createHitEffect(hitPoint);
        } else {
            hitPoint = this.camera.position.clone().add(direction.multiplyScalar(100));
        }

        // Create tracer effect
        if (!this.gun) return;
        
        this.muzzleWorldPosition.copy(this.muzzleLocalPosition);
        this.gun.localToWorld(this.muzzleWorldPosition);
        
        const tracerGeometry = new THREE.BufferGeometry().setFromPoints([
            this.muzzleWorldPosition,
            hitPoint
        ]);
        
        const tracerLine = new THREE.Line(tracerGeometry, this.tracerMaterial);
        this.scene.add(tracerLine);
        this.activeTracers.push({
            line: tracerLine,
            creationTime: performance.now()
        });

        this.canShoot = false;
        setTimeout(() => {
            this.canShoot = true;
        }, this.shootDelay);

        this.lastShotTime = currentTime;
    }

    reload() {
        if (this.isReloading || this.currentAmmo === this.ammoConfig.magazineSize || this.reserveAmmo <= 0) return;
        
        // Play reload animation if available
        if (this.reloadAction) {
            this.reloadAction.reset();
            this.reloadAction.play();
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
