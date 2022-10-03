import * as THREE from './three.module.js';
import * as COLLISIONS from './collisionlibrary.js';
import { OrbitControls } from './OrbitControls.js';
import { GUI } from './dat.gui.module.js';
import { Agent } from './agent.js';
import * as STATS from './stats.js';

const contentDiv = document.getElementById("content");

const stats = STATS.default();
contentDiv.appendChild(stats.dom)



let renderer, scene, camera, controls;
let gui;
let raycaster = new THREE.Raycaster();
let pointer = new THREE.Vector2();

// Simulation Parameters /////////////////
let parameters = {
    numObstacles : 50,
    numNodes : 100,
    numAgents : 2,
    width: 500,
    height: 500,
    k_goal: 50,
    k_avoid: 100,
    goalSpeed: 200,
    showPaths: true,
    editMode: false,
    ResetSimulation: restart,
}

const maxNumNodes = 1000;
const maxNumObstacles = 150;
const maxNumAgents = 10;
const maxKGoal = 200;
const maxKAvoid = 500;
const maxGoalSpeed = 1000;

let floorGeometry, floorMaterial, floorMesh;

let obstaclePos = [];
let obstacleRad = [];
let obstacleUpVectorValue = 22; // how much obstacle should be moved up in the worldspace up vector (y component for threejs)
let obstacleMeshes = [];
let obstacleGeometries = [];
let obstacleMaterials = [];

// arrray of agents
let agents = [];

///////////////////////////////////


// initialize simulation on page load
window.onload=init;

// function that initializes and runs simulation
function init() {
    //console.log("setting up threejs scene");
    //set up Threejs components
    setupThreejs();

    // set up GUI
    gui = new GUI();

    //Edit Mode
    const editModeFolder = gui.addFolder('EditMode');
    editModeFolder.add(parameters, 'editMode');
    editModeFolder.open();

    //environment parameters
    const parametersFolder = gui.addFolder('Parameters');
    parametersFolder.add(parameters, 'numObstacles', 0, maxNumObstacles);
    parametersFolder.add(parameters, 'width', 100, 1000).name('env Width');
    parametersFolder.add(parameters, 'height', 100, 1000).name('env Height');
    parametersFolder.open();

    // agent parameters
    const agentParametersFolder = gui.addFolder('Agent Parameters');
    agentParametersFolder.add(parameters, 'numNodes', 0, maxNumNodes, 1);
    agentParametersFolder.add(parameters, 'numAgents', 0, maxNumAgents, 1);
    agentParametersFolder.add(parameters, 'k_goal', 0, maxKGoal);
    agentParametersFolder.add(parameters, 'k_avoid', 0, maxKAvoid);
    agentParametersFolder.add(parameters, 'goalSpeed', 0, maxGoalSpeed);

    agentParametersFolder.add(parameters, 'showPaths').name("Show Paths");
    agentParametersFolder.open();

    // restart simulation
    const resetSimulationFolder = gui.addFolder('Restart Simulation');
    resetSimulationFolder.add(parameters, 'ResetSimulation').name("Click To Restart The Simulation");
    resetSimulationFolder.open();





    console.log("running simulation");
    // run the simulation
    runSimulation();

    // render scene
    render();
}

// function that initializes the obstacle and agent and runs the simulation
function runSimulation() {
    // place obstacles in random positions
    placeRandomObstacles(parameters.numObstacles);

    // add obstacles to scene
    for(let i = 0; i < parameters.numObstacles; i++) {
        //console.log(obstaclePos[i]);
        const geometry = new THREE.CylinderGeometry( obstacleRad[i] - 5, obstacleRad[i] - 5, 40, 32 ); // make rendering radius smaller for better looking collision avoidance
        const material = new THREE.MeshLambertMaterial( { color: "#a76c3c" } );
        let sphere = new THREE.Mesh( geometry, material );
        sphere.castShadow = true;
        sphere.receiveShadow = true;

        sphere.position.set(obstaclePos[i].x, obstacleUpVectorValue,  obstaclePos[i].y);
        obstacleMeshes.push(sphere);
        obstacleGeometries.push(geometry);
        obstacleMaterials.push(material);
        scene.add(sphere);
    }
  

    // add agents to scene
    for(let i = 0; i < parameters.numAgents; i++) {
        let agent = new Agent();

        // set up agent
        agent.numNodes = parameters.numNodes;
        agent.id = i;
        agent.k_goal = parameters.k_goal;
        agent.k_avoid = parameters.k_avoid;
        agent.goalSpeed = parameters.goalSpeed;
        
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

        //add agent to agents array
        agents.push(agent);
    }
    

}

//function that sets up all the threejs components for rendering a scene
function setupThreejs() {
    // set up renderer
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( contentDiv.clientWidth, contentDiv.clientHeight );
    renderer.setClearColor("#99FFFF");
    renderer.shadowMap.enabled = true;

    contentDiv.appendChild( renderer.domElement );

    // set up scene
    scene = new THREE.Scene();
    
    // set up camera
    camera = new THREE.PerspectiveCamera( 75, contentDiv.clientWidth / contentDiv.clientHeight, 0.5, 5000 );
    camera.position.set( 0, 400, 5 );

    // set up camera controls
    controls = new OrbitControls( camera, renderer.domElement );
    
    // set up listener for window resizing
    window.addEventListener( 'resize', onWindowResize );

    // set up listener to track mouse movements
    window.addEventListener( 'pointermove', onPointerMove );

    // set up listener for click event
    window.addEventListener('mousedown', onClick);

    // set up lights
    const light =  new THREE.PointLight( 0xffffff, 0.5 );
    light.castShadow = true; // default false
    light.position.set(0, 250, 0)
    scene.add(light);

    // Create Floor
    floorGeometry = new THREE.BoxGeometry(parameters.width, 2, parameters.height);
    floorMaterial = new THREE.MeshLambertMaterial({color: "rgb(15, 150, 15)"});

    // load floor texture
    const texture = new THREE.TextureLoader().load('./Vol_42_1_Base_Color.png');
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set( 4, 4 );
    floorMaterial.map = texture;

    // load floor normal map texture
    const normalTexture = new THREE.TextureLoader().load('./Vol_42_1_Normal.png');
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;
    normalTexture.repeat.set( 4, 4 );
    floorMaterial.normalMap = normalTexture;

    floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
    floorMesh.receiveShadow = true;

    scene.add(floorMesh);


    camera.lookAt(floorMesh.position);

    // add hemispher light
    const hemisphereLight =  new THREE.HemisphereLight( 0xffffff, floorMaterial.color, 0.5 );
    scene.add(hemisphereLight);
}

// function that runs everytime the window is resized (used for automatically setting the new size and aspect ratio )
function onWindowResize() {

    renderer.setSize( contentDiv.clientWidth, contentDiv.clientHeight );

    camera.aspect = contentDiv.clientWidth / contentDiv.clientHeight;
    camera.updateProjectionMatrix();

    render();
}

// function that runs each time mouse moves and calc mouse position
function onPointerMove( event ) {
	// calculate pointer position in normalized device coordinates
	// (-1 to +1) for both components

	pointer.x = ( event.clientX / contentDiv.clientWidth ) * 2 - 1;
	pointer.y = - ( event.clientY / contentDiv.clientHeight ) * 2 + 1;
}

// function that runs each time mouse is clicked
function onClick( event ) {
    if(parameters.editMode) { // only allow adding/removing obstacles in edit mode
        // raycast from mouse
        raycaster.setFromCamera( pointer, camera );

        if(event.button == 0) { // left click add obstacle
            console.log("left click!");
            // calculate objects intersecting the picking ray
            const intersects = raycaster.intersectObject( floorMesh );
            if(intersects.length != 0) {
                
                // create object
                let radius = THREE.MathUtils.randFloat(10, 20);
                let position = new THREE.Vector2(intersects[0].point.x, intersects[0].point.z);

                const geometry = new THREE.CylinderGeometry( radius - 5, radius - 5, 40, 32 ); // make rendering radius smaller for better looking collision avoidance
                const material = new THREE.MeshLambertMaterial( { color: "#a76c3c" } );
                let sphere = new THREE.Mesh( geometry, material );
                sphere.castShadow = true;
                sphere.receiveShadow = true;
        
                sphere.position.set(position.x, obstacleUpVectorValue,  position.y);
                obstaclePos.push(position);
                obstacleRad.push(radius);
                obstacleMeshes.push(sphere);
                obstacleGeometries.push(geometry);
                obstacleMaterials.push(material);
                scene.add(sphere);

                // regenerate agent PRM and paths
                for(let i = 0; i < agents.length; i++) {
                    let agent = agents[i];
                    // set start pos to current position and keep same goal
                    agent.startPos = agent.pos;

                    // plan new path for agent
                    //agent.generatePRM(agent.numNodes, obstaclePos, obstacleRad, obstaclePos.length, floorGeometry.width, floorGeometry.depth);
                    
                    let radiiAdded = [...obstacleRad];
                    for(let i =0; i < obstacleRad.length; i++) {
                        radiiAdded[i] += agent.radius;
                    }
                    
                    agent.connectNeighbors(obstaclePos, radiiAdded, obstaclePos.length);
                    agent.planPath(obstaclePos, radiiAdded, obstaclePos.length);
                    
                    // remove old path helpers
                    for(let i = 0; i < agent.pathArrowHelpers.length; i++) {
                        scene.remove( agent.pathArrowHelpers[i] );
                    }
                    agent.pathArrowHelpers = []

                    // add agent path helpers to scene
                    if(parameters.showPaths) {
                        agent.generatePathArrowHelpers();
                        for(let i = 0; i < agent.pathArrowHelpers.length; i++) {
                            scene.add( agent.pathArrowHelpers[i] );
                        }
                    }
                }
            }
        }
        else if(event.button == 2) { // right click remove obstacle
            // calculate objects intersecting the picking ray
            const intersects = raycaster.intersectObjects( obstacleMeshes );
            if(intersects.length != 0) {
                let index = 0;
                for(let i = 0; i < obstacleMeshes.length; i++) { //find index of obstacle
                    if(obstacleMeshes[i] === intersects[ 0 ].object) {
                        index = i;
                        break;
                    }
                }
                //remove obstacle
                obstacleGeometries.splice(index, 1);
                obstacleMaterials.splice(index, 1);
                scene.remove(obstacleMeshes[index]);
                obstacleMeshes.splice(index, 1);
                obstaclePos.splice(index, 1);
                obstacleRad.splice(index, 1);
            }
        }
    }

}

// function that is called every frame and renders the scene
function render() {
    stats.begin();


    let fps = stats.getFPS();
    let dt = 1/fps;

    controls.update();


    if(dt != Infinity) { // initially dt is infinity so need to account for this
        // update agents movement
        for (let i = 0; i < agents.length; i++) {
            agents[i].update(agents, obstaclePos, obstacleRad, obstaclePos.length, dt);
        }
    }


    renderer.render( scene, camera );
    stats.end();

    requestAnimationFrame(render);
}

// function that places obstacles randomly in the scene
function placeRandomObstacles() {
    //console.log("generating random obstacles");
  
    //Initial obstacle position
    for (let i = 0; i < parameters.numObstacles; i++){
        let radius = THREE.MathUtils.randFloat(10, 20);
        let position = new THREE.Vector2(THREE.MathUtils.randFloat(-parameters.width/2 + radius,parameters.width/2 - radius), THREE.MathUtils.randFloat((-parameters.height/2) + radius, parameters.height/2 - radius));

        //check if obstacle is intersecting with other obstacle 
        let radiiAdded = [...obstacleRad];
        for(let j =0; j < obstacleRad.length; j++) {
            radiiAdded[j] += radius;
        }
        let insideAnyCircle = COLLISIONS.pointInCircleList(obstaclePos,radiiAdded,obstaclePos.length,position,2);
        while (insideAnyCircle){
            radius = THREE.MathUtils.randFloat(10, 20);
            position = new THREE.Vector2(THREE.MathUtils.randFloat(-parameters.width/2 + radius,parameters.width/2 - radius), THREE.MathUtils.randFloat((-parameters.height/2) + radius, parameters.height/2 - radius));
           
            radiiAdded = [...obstacleRad];
            for(let j =0; j < obstacleRad.length; j++) {
                radiiAdded[j] += radius;
            }

            insideAnyCircle = COLLISIONS.pointInCircleList(obstaclePos,radiiAdded,obstaclePos.length,position,2);
        }


        obstaclePos.push(position);
        obstacleRad.push(radius);
    }
}

//function that restarts the simulation
function restart () {
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
    for(let i = 0; i < agents.length; i++) {
        let agent = agents[i];
        for(let i = 0; i < agent.pathArrowHelpers.length; i++) {
            scene.remove( agent.pathArrowHelpers[i] );
        }
        agent.reset();
        scene.remove(agent.mesh);
        agent.geometry.dispose();
        agent.material.dispose();
    }

    agents = [];



    
    runSimulation();
}
