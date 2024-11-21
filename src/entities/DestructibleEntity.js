import * as THREE from 'three';

export class DestructibleEntity {
    constructor(scene, world, position, maxHealth = 100) {
        this.scene = scene;
        this.world = world;
        this.position = new THREE.Vector3(...position);
        this.maxHealth = maxHealth;
        this.currentHealth = maxHealth;
        this.isDestroyed = false;
        
        // Get camera reference from scene
        this.camera = this.scene.camera;
        
        // Health bar setup
        this.setupHealthBar();
    }

    setupHealthBar() {
        if (!this.camera) {
            console.warn('No camera found when setting up health bar');
            return;
        }

        this.healthBarGeometry = new THREE.PlaneGeometry(1, 0.1);
        this.healthBarMaterial = new THREE.MeshBasicMaterial({ 
            color: 0x00ff00,
            side: THREE.DoubleSide,
            depthTest: false // Ensure health bar is always visible
        });
        this.healthBar = new THREE.Mesh(this.healthBarGeometry, this.healthBarMaterial);
        this.healthBar.renderOrder = 999; // Render last to be on top
        
        // Set initial position
        this.updateHealthBarPosition();
        
        // Add to scene
        console.log('Adding health bar to scene at position:', this.position);
        this.scene.add(this.healthBar);
    }

    updateHealthBarPosition() {
        if (!this.healthBar || !this.camera) {
            console.warn('Missing healthBar or camera in updateHealthBarPosition');
            return;
        }

        // Update position
        this.healthBar.position.copy(this.position);
        this.healthBar.position.y += 2; // Position above the entity

        // Make health bar face the camera
        const cameraPos = this.camera.position;
        const dirToCamera = new THREE.Vector3().subVectors(cameraPos, this.healthBar.position).normalize();
        this.healthBar.quaternion.setFromRotationMatrix(
            new THREE.Matrix4().lookAt(dirToCamera, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0))
        );
    }

    takeDamage(amount) {
        if (this.isDestroyed) {
            console.log('[Entity] Already destroyed, ignoring damage');
            return;
        }
        
        console.log('[Entity] Taking damage:', {
            type: this.constructor.name,
            amount,
            currentHealth: this.currentHealth,
            newHealth: Math.max(0, this.currentHealth - amount)
        });
        
        this.currentHealth = Math.max(0, this.currentHealth - amount);
        
        if (this.healthBar) {
            // Update health bar
            const healthPercent = this.currentHealth / this.maxHealth;
            this.healthBar.scale.x = healthPercent;
            this.healthBarMaterial.color.setHex(
                healthPercent > 0.5 ? 0x00ff00 : healthPercent > 0.25 ? 0xffff00 : 0xff0000
            );
        }

        if (this.currentHealth <= 0) {
            console.log('[Entity] Health depleted, destroying');
            this.destroy();
        }
    }

    destroy() {
        this.isDestroyed = true;
        if (this.healthBar) {
            this.scene.remove(this.healthBar);
        }
        // Actual destruction logic will be implemented by child classes
    }

    update() {
        if (this.camera && this.healthBar) {
            this.updateHealthBarPosition();
        }
    }

    dispose() {
        if (this.healthBar) {
            this.scene.remove(this.healthBar);
            this.healthBarGeometry.dispose();
            this.healthBarMaterial.dispose();
        }
    }
}