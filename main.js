import * as THREE from './three.module.js';
import { OrbitControls } from './OrbitControls.js';
import { GUI } from './dat.gui.module.js';
import { Agent } from './agent.js';

let renderer, scene, camera, controls;
let gui;

let debugMode = true;

// Simulation Parameters /////////////////
let parameters = {
    numObstacles : 50,
    numNodes : 100,
    width: 500,
    height: 500,
    showPaths: true,
    ResetSimulation: function() {
        console.log("reseting simulation");
        //clean up and reset floor
        scene.remove(floorMesh);
        floorGeometry.dispose();
        floorGeometry = new THREE.BoxGeometry(parameters.width, 2, parameters.height);
        floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
        floorMesh.receiveShadow = true;
        scene.add(floorMesh);

        //clean up and reset obstacles
        obstaclePos = [];
        obstacleRad = [];
        for (let i=0; i< obstacleMeshes.length; i++) {
            obstacleGeometries[i].dispose();
            obstacleMaterials[i].dispose();
            scene.remove(obstacleMeshes[i]);
        }
        obstacleMeshes = [];
        obstacleGeometries = [];
        obstacleMaterials = [];

        //cleanup and reset agent
        for(let i = 0; i < agent.pathArrowHelpers.length; i++) {
            scene.remove( agent.pathArrowHelpers[i] );
        }
        agent.reset();
        
        runSimulation();
    },
}

const maxNumNodes = 1000;
const maxNumObstacles = 150;

let floorGeometry, floorMaterial, floorMesh;

let obstaclePos = [];
let obstacleRad = [];
let obstacleUpVectorValue = 22; // how much obstacle should be moved up in the worldspace up vector (y component for threejs)
let obstacleMeshes = [];
let obstacleGeometries = [];
let obstacleMaterials = [];

let agent = new Agent();

///////////////////////////////////


// initialize simulation on page load
window.onload=init;

// function that initializes and runs simulation
function init() {
    console.log("setting up threejs scene");
    //set up Threejs components
    setupThreejs();

    // set up GUI
    gui = new GUI();
    const parametersFolder = gui.addFolder('Parameters');
    parametersFolder.add(parameters, 'numObstacles', 0, maxNumObstacles);
    parametersFolder.add(parameters, 'numNodes', 0, maxNumNodes);
    parametersFolder.add(parameters, 'width', 100, 1000);
    parametersFolder.add(parameters, 'height', 100, 1000);
    parametersFolder.add(parameters, 'showPaths').name("Show Paths");

    parametersFolder.add(parameters, 'ResetSimulation').name("Reset The Simulation");

    parametersFolder.open();

    console.log("running simulation");
    // run the simulation
    runSimulation();
}

// function that initializes the obstacle and agent and runs the simulation
function runSimulation() {
    // place obstacles in random positions
    placeRandomObstacles(parameters.numObstacles);

    // add obstacles to scene
    for(let i = 0; i < parameters.numObstacles; i++) {
        //console.log(obstaclePos[i]);
        const geometry = new THREE.CylinderGeometry( obstacleRad[i] - 5, obstacleRad[i] - 5, 40, 32 ); // make rendering radius smaller for better looking collision avoidance
        const material = new THREE.MeshBasicMaterial( { color: "#a76c3c" } );
        let sphere = new THREE.Mesh( geometry, material );
        //sphere.castShadow = true;

        sphere.position.set(obstaclePos[i].x, obstacleUpVectorValue,  obstaclePos[i].y);
        obstacleMeshes.push(sphere);
        obstacleGeometries.push(geometry);
        obstacleMaterials.push(material);
        scene.add(sphere);
    }
  
    // set up agent
    agent.numNodes = parameters.numNodes;
    
    // sample a position for start and goal position
    agent.initStartAndGoalPos(obstaclePos , obstacleRad, parameters.numObstacles, parameters.width, parameters.height);

    // generate PRM for agent
    agent.generatePRM(parameters.numNodes, obstaclePos, obstacleRad, parameters.numObstacles, parameters.width, parameters.height);

    // add agent path helpers to scene
    if(parameters.showPaths) {
        agent.generatePathArrowHelpers();
        for(let i = 0; i < agent.pathArrowHelpers.length; i++) {
            scene.add( agent.pathArrowHelpers[i] );
        }
    }

    //add agent to scene
    scene.add( agent.mesh );
    
    // render scene
    render();
}

//function that sets up all the threejs components for rendering a scene
function setupThreejs() {
    // set up renderer
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.setClearColor("#99FFFF");
    renderer.shadowMap.enabled = true;

    document.body.appendChild( renderer.domElement );

    // set up scene
    scene = new THREE.Scene();
    
    // set up camera
    camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.5, 5000 );
    camera.position.set( 0, 400, 5 );

    // set up camera controls
    controls = new OrbitControls( camera, renderer.domElement );
    
    // set up listener for window resizing
    window.addEventListener( 'resize', onWindowResize );


    // set up lights
    const light =  new THREE.DirectionalLight( 0xffffff, 1 );
    light.castShadow = true; // default false

    light.position.set(-500, 250, 25);
    scene.add(light);

    const helper = new THREE.DirectionalLightHelper( light, 5 );
    scene.add( helper );

    // Create Floor
    floorGeometry = new THREE.BoxGeometry(parameters.width, 2, parameters.height);
    floorMaterial = new THREE.MeshLambertMaterial({color: "rgb(15, 150, 15)"});
    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;

    scene.add(floorMesh);


    camera.lookAt(floorMesh.position);
}

// function that runs everytime the window is resized (used for automatically setting the new size and aspect ratio )
function onWindowResize() {

    renderer.setSize( window.innerWidth, window.innerHeight );

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    render();
}

// function that is called every frame and renders the scene
function render() {
    requestAnimationFrame(render);

    controls.update();

    // update agents movement
    agent.update();

    renderer.render( scene, camera );
}

// function that places obstacles randomly in the scene
function placeRandomObstacles() {
    console.log("generating random obstacles");
  
    //Initial obstacle position
    for (let i = 0; i < parameters.numObstacles; i++){
        let radius = THREE.MathUtils.randFloat(10, 20);
        let position = new THREE.Vector2(THREE.MathUtils.randFloat(-parameters.width/2 + radius,parameters.width/2 - radius), THREE.MathUtils.randFloat((-parameters.height/2) + radius, parameters.height/2 - radius));
        obstaclePos.push(position);
        obstacleRad.push(radius);
        //obstacleRad.push((10+40*Math.pow(THREE.MathUtils.seededRandom(1),3)));
    }
}