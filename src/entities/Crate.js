import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { DestructibleEntity } from './DestructibleEntity.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import scifiCrateUrl from '../static/models/Scifi Crate.glb';

export class Crate extends DestructibleEntity {
    static model = null;
    static modelPromise = null;

    static async loadModel() {
        if (!this.modelPromise) {
            this.modelPromise = new Promise((resolve, reject) => {
                const loader = new GLTFLoader();
                loader.load(scifiCrateUrl, 
                    (gltf) => {
                        this.model = gltf.scene;
                        resolve(this.model);
                    },
                    undefined,
                    reject
                );
            });
        }
        return this.modelPromise;
    }

    constructor(scene, world, position, size = [1.25, 1.25, 1.25], maxHealth = 100) {
        super(scene, world, position, maxHealth);
        
        this.size = size;
        this.setupPhysics();
        this.setupMesh();
    }

    async setupMesh() {
        // Wait for model to be loaded if it isn't already
        if (!Crate.model) {
            await Crate.loadModel();
        }

        // Clone the model for this instance
        this.mesh = Crate.model.clone();
        this.mesh.scale.set(2.5, 2.5, 2.5);
        this.mesh.position.copy(this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        // Store reference to this crate instance on all meshes
        this.mesh.traverse((child) => {
            if (child.isMesh) {
                child.userData.entity = this;
            }
        });
        
        this.scene.add(this.mesh);
    }

    setupPhysics() {
        // Create physics body
        const shape = new CANNON.Box(new CANNON.Vec3(...this.size.map(s => s/2)));
        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(this.position.x, this.position.y, this.position.z),
            shape: shape
        });
        
        this.world.addBody(this.body);
    }

    update() {
        // Update position from physics
        if (this.body) {
            const bodyPos = this.body.position;
            this.position.set(bodyPos.x, bodyPos.y, bodyPos.z);
            this.mesh.position.copy(this.position);

            // Update rotation
            const bodyQuat = this.body.quaternion;
            this.mesh.quaternion.set(bodyQuat.x, bodyQuat.y, bodyQuat.z, bodyQuat.w);
        }

        // Update health bar
        super.update();
    }

    destroy() {
        super.destroy();
        
        if (this.mesh) {
            this.scene.remove(this.mesh);
        }
        if (this.body) {
            this.world.removeBody(this.body);
        }
    }

    dispose() {
        super.dispose();
        this.destroy();
    }
}