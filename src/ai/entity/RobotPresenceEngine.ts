/**
 * RobotPresenceEngine — thin façade around the existing presence
 * engine so the robot lifecycle can be inspected/extended without
 * touching legacy modules.
 */
export { presenceEngine } from "@/agents/presence/PresenceEngine";
export { idleTracker } from "@/agents/presence/IdleBehavior";
