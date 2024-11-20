import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class EnvironmentSystem {
    constructor(scene) {
        this.scene = scene;
        this.textures = {};
        this.world = this.setupPhysicsWorld();
        this.loadTextures();
        this.setupLighting();
        this.setupGround();
    }

    setupPhysicsWorld() {
        const world = new CANNON.World();
        world.gravity.set(0, -25, 0);
        return world;
    }

    loadTextures() {
        const textureLoader = new THREE.TextureLoader();
        this.textures = {
            ground: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/terrain/grasslight-big.jpg'),
            wall: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/brick_diffuse.jpg'),
            crate: textureLoader.load('https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/crate.gif')
        };

        // Configure texture repeat
        this.textures.ground.wrapS = this.textures.ground.wrapT = THREE.RepeatWrapping;
        this.textures.ground.repeat.set(25, 25);
        this.textures.wall.wrapS = this.textures.wall.wrapT = THREE.RepeatWrapping;
        this.textures.wall.repeat.set(2, 2);
    }

    setupLighting() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(10, 20, 10);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 500;
        this.scene.add(directionalLight);
    }

    setupGround() {
        // THREE.js ground mesh
        const groundGeometry = new THREE.PlaneGeometry(100, 100);
        const groundMaterial = new THREE.MeshStandardMaterial({ 
            // map: this.textures.ground,
            roughness: 0.8,
            metalness: 0.2
        });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // CANNON.js ground physics
        const groundShape = new CANNON.Plane();
        const groundPhysMaterial = new CANNON.Material('groundPhysMaterial');
        const groundBody = new CANNON.Body({ 
            mass: 0,
            material: groundPhysMaterial,
            shape: groundShape
        });
        groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.world.addBody(groundBody);
    }

    getWorld() {
        return this.world;
    }

    getTextures() {
        return this.textures;
    }
}
