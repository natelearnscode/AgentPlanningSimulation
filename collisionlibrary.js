import * as THREE from './three.module.js';

//Returns true if the point is inside a circle
//You must consider a point as colliding if it's distance is <= eps
export function pointInCircle(center, r, pointPos, eps) {
    const dist = pointPos.distanceTo(center);
    if (dist <= r + eps){ //small safety factor
      return true;
    }
    return false;
}
  
  //Returns true if the point is inside a list of circle
  //You must consider a point as colliding if it's distance is <= eps
export function pointInCircleList(centers, radii, numObstacles, pointPos, eps){
    for (let i = 0; i < numObstacles; i++){
      let center =  centers[i];
      let r = radii[i];
      if (pointInCircle(center,r,pointPos, eps)){
        return true;
      }
    }
    return false;
  }
  
  
export class hitInfo {
    constructor() {
        this.hit = false;
        this.t = 9999999;
    }
}
  
export function rayCircleIntersect(center, r, l_start, l_dir, max_t){
    let hit = new hitInfo();
    
    //Step 2: Compute W - a displacement vector pointing from the start of the line segment to the center of the circle
      let toCircle = new THREE.Vector2();
      toCircle.subVectors(center, l_start);
      
      //Step 3: Solve quadratic equation for intersection point (in terms of l_dir and toCircle)
      let a = 1;  //Length of l_dir (we normalized it)
      let b = -2 * l_dir.dot(toCircle); //-2*dot(l_dir,toCircle)
      let c = toCircle.lengthSq() - (r)*(r); //different of squared distances
      
      let d = b*b - 4*a*c; //discriminant 
      if (d >=0 ){ 
        //If d is positive we know the line is colliding, but we need to check if the collision line within the line segment
        //  ... this means t will be between 0 and the length of the line segment
        let t1 = (-b - Math.sqrt(d))/(2*a); //Optimization: we only need the first collision
        let t2 = (-b + Math.sqrt(d))/(2*a); //Optimization: we only need the first collision
        //println(hit.t,t1,t2);
        if (t1 > 0 && t1 < max_t){
          hit.hit = true;
          hit.t = t1;
        }
        else if (t1 < 0 && t2 > 0){
          hit.hit = true;
          hit.t = -1;
        }
        
      }
      
    return hit;
}
  
export function rayCircleIntersectTime(center, r, l_start, l_dir, max_t){
  let hit = new hitInfo();
  
  //Step 2: Compute W - a displacement vector pointing from the start of the line segment to the center of the circle
    let toCircle = new THREE.Vector2();
    toCircle.subVectors(center, l_start);
    
    //Step 3: Solve quadratic equation for intersection point (in terms of l_dir and toCircle)
    let a = 1;  //Length of l_dir (we normalized it)
    let b = -2 * l_dir.dot(toCircle); //-2*dot(l_dir,toCircle)
    let c = toCircle.lengthSq() - (r)*(r); //different of squared distances
    
    let d = b*b - 4*a*c; //discriminant 
    if (d >=0 ){ 
      //If d is positive we know the line is colliding, but we need to check if the collision line within the line segment
      //  ... this means t will be between 0 and the length of the line segment
      let t1 = (-b - Math.sqrt(d))/(2*a); //Optimization: we only need the first collision
      let t2 = (-b + Math.sqrt(d))/(2*a); //Optimization: we only need the first collision
      //println(hit.t,t1,t2);
      if (t1 > 0){
        hit.hit = true;
        hit.t = t1;
      }
      
    }
    
  return hit;
}

export function rayCircleListIntersect(centers, radii,  numObstacles, l_start, l_dir, max_t){
    let hit = new hitInfo();
    hit.t = max_t;
    for (let i = 0; i < numObstacles; i++){
      let center = centers[i];
      let r = radii[i];
      
      let circleHit = rayCircleIntersect(center, r, l_start, l_dir, hit.t);
      if (circleHit.t > 0 && circleHit.t < hit.t){
        hit.hit = true;
        hit.t = circleHit.t;
      }
      else if (circleHit.hit && circleHit.t < 0){
        hit.hit = true;
        hit.t = -1;
      }
    }
    return hit;
}
  