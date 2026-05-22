/**
 * RobotSpatialEngine — re-exports the existing presence movement
 * pipeline so the robot stays a single, canonical entity rather than
 * a new positioning system.
 *
 * Keeps API surface stable for QWRobotEntity callers.
 */
export { movementOrchestrator } from "@/agents/presence/MovementOrchestrator";
export { AGENT_OVERLAY_SIZE } from "@/agents/presence/MovementOrchestrator";
