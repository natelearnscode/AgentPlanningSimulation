import * as THREE from './three.module.js';
import * as COLLISIONS from './collisionlibrary.js';

// agent class ////////////////////

export class Agent {
    constructor() {
        this.upVectorValue = 11; // how much to raise along world up vector (y vector for Threejs) since we treat everything internally as 2d vectors
        this.pos = new THREE.Vector2(0,0);
        this.startPos = new THREE.Vector2(0,0);
        this.goalPos = new THREE.Vector2(5,5);
        this.radius = 1;
        this.id = -1;

        // create mesh
        this.geometry = new THREE.CapsuleGeometry( 5, 10, 4, 8 );
        let randomColor = new THREE.Color(THREE.MathUtils.randFloat(100, 255) / 255, THREE.MathUtils.randFloat(100, 255) / 255, THREE.MathUtils.randFloat(100, 255) / 255);
        this.material = new THREE.MeshLambertMaterial( { color: randomColor } );

        this.mesh = new THREE.Mesh( this.geometry, this.material );
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;

        this.mesh.position.set(this.pos.x, this.upVectorValue, this.pos.y);

        //PRM attributes
        this.nodePos = [];
        this.numNodes = 100;
        this.neighbors = [];
        this.path = [];
        this.pathArrowHelpers = []; //list of arrows used to visualize path

        //TCC attributes
        this.currentGoal = new THREE.Vector2(); // current goal in path
        this.accelaration = new THREE.Vector2();
        this.velocity = new THREE.Vector2();
        this.k_goal = 50;  //TODO: Tune this parameter to agent stop naturally on their goals
        this.k_avoid = 100;
        this.goalSpeed = 200;
    }

    // resets the agents state
    reset() {
        this.nodePos = [];
        this.numNodes = 100;
        this.neighbors = [];
        this.path = [];
        this.pathArrowHelpers = []; //list of arrows used to visualize path
        this.currentNodeIndex = -1;

        this.currentGoal = new THREE.Vector2(); // current goal in path
        this.accelaration = new THREE.Vector2();
        this.velocity = new THREE.Vector2();
    }

    // returns a random position by sampling points that don't lie within an obstacle
    sampleFreePos(circlePos, circleRad, numObstacles, width, height){
        let randPos = new THREE.Vector2(THREE.MathUtils.randFloat(-width/2 + this.radius, width/2 - this.radius), THREE.MathUtils.randFloat(-height/2 + this.radius, height/2 - this.radius));
        let insideAnyCircle = COLLISIONS.pointInCircleList(circlePos,circleRad,numObstacles,randPos,2);
        while (insideAnyCircle){
          randPos = new THREE.Vector2(THREE.MathUtils.randFloat(-width/2 + this.radius, width/2 - this.radius), THREE.MathUtils.randFloat(-height/2 + this.radius, height/2 - this.radius));
          insideAnyCircle = COLLISIONS.pointInCircleList(circlePos,circleRad,numObstacles,randPos,2);
        }
        return randPos;
    }

    // initializes a valid starting and goal position for agent
    initStartAndGoalPos(circlePos, circleRad, numObstacles, width, height) {
        //console.log("initializing start and goal for agent");
        // add radius of agent to each obstacle radius
        let radiiAdded = [...circleRad];
        for(let i =0; i < numObstacles; i++) {
            radiiAdded[i] += this.radius;
        }

        this.startPos = this.sampleFreePos(circlePos, radiiAdded, numObstacles, width, height);
        this.goalPos = this.sampleFreePos(circlePos, radiiAdded, numObstacles, width, height);

        this.pos = this.startPos;
        this.mesh.position.set(this.pos.x, this.upVectorValue, this.pos.y);
    }

    // generating a probablistic road map for agent
    generatePRM(numNodes, circleCenters, circleRadii, numObstacles, width, height) {
        //console.log("generating PRM");
        // add radius of agent to each obstacle radius
        let radiiAdded = [...circleRadii];
        for(let i =0; i < numObstacles; i++) {
            radiiAdded[i] += this.radius;
        }

        // generate random nodes
        this.generateRandomNodes(numNodes, circleCenters, radiiAdded, numObstacles, width, height);

        // connect neighbors
        this.connectNeighbors(circleCenters, radiiAdded, numObstacles)

        // plan path
        this.planPath(circleCenters, radiiAdded, numObstacles);

    }

    // function that generates non-colliding PRM nodes
    generateRandomNodes(numNodes, circleCenters, circleRadii, numObstacles, width, height) {
        for (let i=0; i < numNodes; i++) {
            let randPos = new THREE.Vector2(THREE.MathUtils.randFloat(-width/2 + this.radius, width/2 - this.radius), THREE.MathUtils.randFloat((-height/2) + this.radius, height/2 - this.radius));
            let insideAnyCircle = COLLISIONS.pointInCircleList(circleCenters,circleRadii,numObstacles,randPos,2);
            while (insideAnyCircle){
                randPos = new THREE.Vector2(THREE.MathUtils.randFloat(-width/2 + this.radius, width/2 - this.radius), THREE.MathUtils.randFloat((-height/2) + this.radius, height/2 - this.radius));
                insideAnyCircle = COLLISIONS.pointInCircleList(circleCenters,circleRadii,numObstacles,randPos,2);
                //insideBox = pointInBox(boxTopLeft, boxW, boxH, randPos);
            }
            this.nodePos.push(randPos);
        }
    }

    //Set which nodes are connected to which neighbors (graph edges) based on PRM rules
    connectNeighbors(centers, radii, numObstacles){
        //console.log("connecting neighbors");
        for (let i = 0; i < this.numNodes; i++){
            this.neighbors[i] = [];  //Clear neighbors list
            for (let j = 0; j < this.numNodes; j++){
                if (i == j) continue; //don't connect to myself 
                let dir = new THREE.Vector2();
                dir.subVectors(this.nodePos[j], this.nodePos[i]).normalize();
                let distBetween = this.nodePos[i].distanceTo(this.nodePos[j]);
                let circleListCheck = COLLISIONS.rayCircleListIntersect(centers, radii, numObstacles, this.nodePos[i], dir, distBetween);
                if (!circleListCheck.hit){
                    this.neighbors[i].push(j);
                }
            }
        }
    }

    // method that plans a collision free path from the start position to the goal position
    planPath(centers, radii, numObstacles){
        //console.log("planning path");
        let path = [];
        
        let startID = this.closestNode(centers, radii, numObstacles, this.startPos);
        let goalID = this.closestNode(centers, radii, numObstacles, this.goalPos);

        if (startID == -1 || goalID == -1) {
          path = [];
          return path;
        }
        
        this.path = this.runAStar(centers, radii, numObstacles, startID, goalID);
        //console.log("starting at ", this.startPos);
        for(let i = 0; i < path.length; i++) {
            //console.log("going to ", this.nodePos[path[i]]);
        }
        //console.log("going to goal at ", this.goalPos);

        return path;
    }

    // function that returns the closest node to the passed in point without any collisions between node and point
    closestNode(centers, radii, numObstacles, point){
        let closestID = -1;
        let minDist = 999999;
        for (let i = 0; i < this.numNodes; i++){
            let dist = point.distanceTo(this.nodePos[i]);
            let dir = new THREE.Vector2();
            dir.subVectors(this.nodePos[i],point).normalize();
        
            let circleListCheck = COLLISIONS.rayCircleListIntersect(centers, radii, numObstacles, point, dir, dist);
        
            if ((dist < minDist) && (!circleListCheck.hit)){
                closestID = i;
                minDist = dist;
            }
        }
        return closestID;
    }

    //A* search algorithm
    runAStar(centers, radii, numObstacles, startID, goalID) {
        let fringe = [];  //New empty fringe
        let path = [];
        let visited = [];
        let parent = [];
        let costs = [];
        let heuristics = [];
    
        for (let i = 0; i < this.numNodes; i++) { //Clear visit tags and parent pointers
            visited[i] = false;
            parent[i] = -1; //No parent yet
            costs[i] = -1;
            heuristics[i] = -1;
        }
    
        // add start node to fringe
        visited[startID] = true;
        fringe.push(startID);
    
        let currentNode = -1;
        while (fringe.length > 0) {        
            // find node with least f value in fringe and store in q
            let minFValue = 999999;
            let q = 0;
            for (let i=0; i < fringe.length; i++) {
                let fringeNode = fringe[i];
                let fValue = costs[fringeNode] + heuristics[fringeNode];
                if(fValue < minFValue) {
                    minFValue = fValue;
                    q = i;
                }
            }
        
            currentNode = -1;
            // pop off q
            if(q != -1) {
                currentNode = fringe[q];
                fringe.splice(q, 1);
            }
        
            // if currentNode is goal, stop search
            if (currentNode == goalID){
                break;
            }
            
            // generate current node's neighbors and set their parents to current node
            for (let i = 0; i < this.neighbors[currentNode].length; i++){
                let neighborNode = this.neighbors[currentNode][i];
                if (!visited[neighborNode]) {
                    visited[neighborNode] = true;
                    parent[neighborNode] = currentNode;
            
                    // compute cost for neighbor
                    costs[neighborNode] = costs[currentNode] + this.nodePos[currentNode].distanceTo(this.nodePos[neighborNode]);
                    
                    // compute heuristic for neighbor
                    heuristics[neighborNode] = this.nodePos[neighborNode].distanceTo(this.nodePos[goalID]);
                    // add neighbor to fringe
                    fringe.push(neighborNode);
                }
            } 
        }
    
        // construct path from parents array
        let prevNode = parent[goalID];
        path.unshift(goalID);
        while (prevNode >= 0){
            path.unshift(prevNode);
            prevNode = parent[prevNode];
        }
        return path;
    }

    generatePathArrowHelpers() {
        if(this.path.length == 0) { //if clear path to goal
            // create arrow from start position to goal position
            let start = new THREE.Vector3(this.startPos.x, 2, this.startPos.y);
            let end = new THREE.Vector3(this.goalPos.x, 2, this.goalPos.y);
            let length = start.distanceTo(end);
    
            let dir = new THREE.Vector3();
            dir.subVectors(end, start).normalize();
    
            let arrowHelper = new THREE.ArrowHelper( dir, start, length, this.material.color );
            this.pathArrowHelpers.push(arrowHelper);
            return;
        }

        // create arrow from start position to first node in path
        let start = new THREE.Vector3(this.startPos.x, 2, this.startPos.y);
        let end = new THREE.Vector3(this.nodePos[ this.path[0] ].x, 2, this.nodePos[ this.path[0] ].y);
        let length = start.distanceTo(end);

        let dir = new THREE.Vector3();
        dir.subVectors(end, start).normalize();

        let arrowHelper = new THREE.ArrowHelper( dir, start, length, this.material.color );
        this.pathArrowHelpers.push(arrowHelper);

        //create arrow between each node in path
        for(let i = 1; i < this.path.length; i++) {
            start = end;
            end = new THREE.Vector3(this.nodePos[ this.path[i] ].x, 2, this.nodePos[ this.path[i] ].y);
            length = start.distanceTo(end);
            dir = new THREE.Vector3();
            dir.subVectors(end, start).normalize();
            arrowHelper = new THREE.ArrowHelper( dir, start, length, this.material.color );
            this.pathArrowHelpers.push(arrowHelper);
        }

        //create arrow from last node in path to goal
        start = end;
        end = new THREE.Vector3(this.goalPos.x, 2, this.goalPos.y);
        length = start.distanceTo(end);
        dir = new THREE.Vector3();
        dir.subVectors(end, start).normalize();
        arrowHelper = new THREE.ArrowHelper( dir, start, length, this.material.color );
        this.pathArrowHelpers.push(arrowHelper);
    }

    computeAgentForces(agents, centers, radii, numObstacles) {
        let acc = new THREE.Vector2(0,0);
  
        // calculate goal force
        let goalVel = new THREE.Vector2(0,0);
        goalVel.subVectors( this.currentGoal, this.pos);

        // make sure we don't go over goal speed
        if (goalVel.length() > this.goalSpeed) goalVel.clampLength(0, this.goalSpeed);
        

        let goalForce = new THREE.Vector2();
        goalForce.subVectors(goalVel, this.velocity);

        acc.add(goalForce.multiplyScalar(this.k_goal));

        // check if there is clear path to next goal and go straight to it
        let goToNextGoal = false;
        if (this.path.length > 1) { // if next goal is in path
            let dist = this.pos.distanceTo(this.nodePos[this.path[1]]);
            let dir = new THREE.Vector2();
            dir.subVectors(this.nodePos[this.path[1]],this.pos).normalize();
            let circleListCheck = COLLISIONS.rayCircleListIntersect(centers, radii, numObstacles, this.pos, dir, dist);
            //console.log(circleListCheck.hit);
            if(!circleListCheck.hit) {
                goToNextGoal = true;
            }
        }
        else if (this.path.length == 1) { // if next goal is final goalpos
            let dist = this.pos.distanceTo(this.goalPos);
            let dir = new THREE.Vector2();
            dir.subVectors(this.goalPos,this.pos).normalize();
            let circleListCheck = COLLISIONS.rayCircleListIntersect(centers, radii, numObstacles, this.pos, dir, dist);
            if(!circleListCheck.hit) {
                goToNextGoal = true;
            }            
        }

        // at goal or can go to next goal
        if (goalVel.length() < 5 || goToNextGoal) { 
            if(this.path.length != 0) {
                this.path.shift();
            }

            return acc; //if within certain threshold no other force is applied
        }

        // Compute avoidance forces for other agents
        for(let i = 0; i < agents.length; i++) {
            if(i == this.id) continue;
            let ttc = this.computeTTC(agents[i].pos,agents[i].velocity, agents[i].radius);
            //console.log("ttc of ", ttc.hit);
            if(ttc.hit && ttc.t != -1) { // if we're going to collide                    
                let futurePos_this = new THREE.Vector2();
                let addAmount_this = new THREE.Vector2();
                addAmount_this.copy(this.velocity);
                addAmount_this.multiplyScalar(ttc.t);
                futurePos_this.addVectors(this.pos, addAmount_this);

                let futurePos_other = new THREE.Vector2();
                let addAmount_other = new THREE.Vector2();
                addAmount_other.copy(agents[i].velocity);
                addAmount_other.multiplyScalar(ttc.t);
                futurePos_other.addVectors(agents[i].pos, addAmount_other);
                
                //console.log(agents[i]);
                let avoidDir = new THREE.Vector2();
                avoidDir.subVectors(futurePos_this, futurePos_other).normalize();
                avoidDir.multiplyScalar(1/ttc.t)
                let avoidForce = avoidDir;
                avoidForce.multiplyScalar(this.k_avoid);

                if (ttc.hit && ttc.t > 0){
                    //console.log("agent " , this.id, " moving away from agent ", agents[i].id, " with force of ", avoidForce.length());
                    acc.add(avoidForce);
                }
            }

        }

        // TODO: Compute avoidance force for obstacles

        return acc;
    }

    moveAgent() {

    }

    computeTTC(otherPos, otherVel, otherRadius) {
        let combinedRadius = this.radius+otherRadius;
        let relativeVelocity = new THREE.Vector2();
        relativeVelocity.subVectors(this.velocity, otherVel);
        let ttc = COLLISIONS.rayCircleIntersectTime(otherPos, combinedRadius, this.pos, relativeVelocity);
        return ttc;
    }

    update(agents, centers, radii, numObstacles, dt) {
        if(this.path.length == 0) { // going straight to goal
            this.currentGoal = this.goalPos;
        }
        else {
            this.currentGoal = this.nodePos[this.path[0]];
        }

        // add radius of agent to each obstacle radius
        let radiiAdded = [...radii];
        for(let i =0; i < numObstacles; i++) {
            radiiAdded[i] += this.radius;
        }

        // compute agent acceleration
        this.accelaration = this.computeAgentForces(agents, centers, radiiAdded, numObstacles);

        // compute agent velocity
        this.velocity.add(this.accelaration.multiplyScalar(dt)); // v = v_init + a * dt

        // compute agent position
        this.pos.add(this.velocity.multiplyScalar(dt)); // pos = pos_init + v * dt
        this.mesh.position.setX(this.pos.x);
        this.mesh.position.setZ(this.pos.y);


    }
}

///////////////////////////////////