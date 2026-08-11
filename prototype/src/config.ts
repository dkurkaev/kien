// Single tunable config object — the whole point of the prototype is to crank
// these on the fly (see debug.ts / lil-gui panel). Nothing here is sacred.

export const config = {
  world: {
    // World size of one pheromone cell. Grid resolution per surface is derived
    // from this so that shared edges between surfaces have matching cell counts.
    cellSize: 0.125,
    fixedStep: 1 / 60, // seconds, sim runs on this regardless of render fps
    floorY: -0.62,     // world height of the floor (crumbs swept off the edge land here)
  },

  pheromone: {
    evaporation: 0.55, // per-second decay rate (higher = trails fade faster)
    diffusion: 0.08,   // 0..1 light blur per step so trails have width
    antDeposit: 6,     // value an ant drops in its cell each second
    foodStrength: 90,  // value a mess radiates each second (scaled by amount)
    max: 100,          // clamp
  },

  ants: {
    max: 500,           // hard buffer size (instances allocated) — not the live count
    target: 220,        // soft population cap: ants stop arriving above this (tunable)
    maxInfluxRate: 3,   // ceiling on arrivals/sec regardless of how much food there is
    speed: 1.1,        // world units / second along the surface
    noise: 0.5,        // random wander added to the gradient steering
    turnRate: 7,       // how fast heading snaps toward the gradient (per sec)
    sensorDist: 2.5,   // cells ahead the antennae sample
    sensorAngle: 0.7,  // radians between the side antennae
    influxPerFood: 1.6, // ants/sec per unit of active food (before the rate cap)
    leaveChance: 0.4,  // /sec chance a starving ant at an outer edge leaves
  },

  mess: {
    spawnInterval: 3.2,  // seconds between scheduled messes
    spillShare: 0.5,     // chance a scheduled mess is a spill (else a crumb cluster)

    // spills — a real wetness FIELD (mask) you wipe locally; not stamped shapes
    spillMinRadius: 0.3, // world radius range (randomised per spill)
    spillMaxRadius: 0.8,
    spillAmount: 1.1,    // peak wetness a fresh spill stamps

    // crumbs — individual particles with gravity + friction, counter only
    crumbMinCount: 8,    // per scheduled cluster (randomised)
    crumbMaxCount: 34,
    crumbSpread: 0.5,    // world radius the cluster scatters into
    crumbSize: 0.055,    // world size of one crumb
    crumbMaxTotal: 700,  // particle cap
    crumbFriction: 6,    // base kinetic friction (per-crumb multiplier varies it)
    crumbPush: 7,        // max sweep speed cap — a hard flick pushes up to this
    crumbFan: 0.3,       // sideways spread: how much off-axis crumbs squirt out
    crumbGravity: 14,    // fall acceleration once off the edge (dominates the drop)
  },

  swipe: {
    width: 0.55,        // world radius of the wipe path
    fastThreshold: 5.5, // world units/sec — above this a wipe SMEARS instead of cleans
    cleanPerSec: 3.5,   // how much mess amount a slow clean removes
    eraseRadius: 0.7,   // pheromone-erase radius for the wet cloth
    smearSpawn: 2,      // extra crumbs a smear splits off ("из одной точки три")
    pushDist: 0.9,      // how far a broom shoves crumbs along the stroke
    antScatter: 0.9,    // world radius in which a wipe scatters/kills ants
    antKill: 0.55,      // fraction of scattered ants that die (cloth)
  },

  tools: {
    switchTime: 0.4,    // seconds a tool swap costs — grouping actions is rewarded
  },

  spray: {
    range: 1.6,         // world radius of the disc the spray lands as
    killProb: 0.85,     // chance an ant in the cone dies
    noFoodTime: 20,     // seconds a sprayed patch repels ants / kills food pull
  },

  debug: {
    heatmap: false,
  },
};

export type Config = typeof config;
