import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Wall {
    constructor(scene, world, position, size = [1, 3, 1]) {
        this.scene = scene;
        this.world = world;
        this.position = position;
        this.size = size;
        
        this.setupMesh();
        this.setupPhysics();
    }

    setupMesh() {
        // Create a simple box geometry for the wall
        const geometry = new THREE.BoxGeometry(...this.size);
        const material = new THREE.MeshStandardMaterial({ 
            color: 0x808080,
            roughness: 0.7,
            metalness: 0.3
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(...this.position);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        this.scene.add(this.mesh);
    }

    setupPhysics() {
        // Create physics body
        const shape = new CANNON.Box(new CANNON.Vec3(...this.size.map(s => s/2)));
        this.body = new CANNON.Body({
            mass: 0, // Mass of 0 makes it static/immovable
            position: new CANNON.Vec3(...this.position),
            shape: shape
        });
        
        this.world.addBody(this.body);
    }

    update() {
        // Walls are static, so no update needed
    }

    dispose() {
        if (this.mesh) {
            this.scene.remove(this.mesh);
            this.mesh.geometry.dispose();
            this.mesh.material.dispose();
        }
        if (this.body) {
            this.world.removeBody(this.body);
        }
    }
}
