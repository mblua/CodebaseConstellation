export interface CameraClippingPlanes {
  near: number;
  far: number;
}

export interface FocusNeighborCandidate {
  index: number;
  distance: number;
}

const MIN_NEAR = 0.01;

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function fitDistanceForSphere(
  radius: number,
  verticalFovDegrees: number,
  aspect: number,
  margin = 1.15,
): number {
  const safeRadius = positiveFinite(radius, 0.5);
  const safeAspect = positiveFinite(aspect, 1);
  const verticalHalfFov = Math.min(
    Math.PI * 0.49,
    Math.max(Math.PI / 360, (positiveFinite(verticalFovDegrees, 48) * Math.PI) / 360),
  );
  const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * safeAspect);
  const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov);
  return (safeRadius / Math.sin(limitingHalfFov)) * Math.max(1, margin);
}

export function clippingPlanesForSphere(distance: number, radius: number): CameraClippingPlanes {
  const safeDistance = positiveFinite(distance, 1);
  const safeRadius = Math.max(0, Number.isFinite(radius) ? radius : 0);
  const nearestExpectedContent = Math.max(MIN_NEAR, safeDistance - safeRadius * 1.25);
  const near = Math.max(
    MIN_NEAR,
    Math.min(safeDistance / 1000, nearestExpectedContent * 0.5),
  );
  const far = Math.max(
    1000,
    safeDistance * 4,
    safeDistance + safeRadius * 2.5,
  );
  return { near, far };
}

export function selectFocusNeighbors(
  candidates: readonly FocusNeighborCandidate[],
  maxNeighbors = 12,
  outlierFactor = 1.6,
): FocusNeighborCandidate[] {
  const sorted = candidates
    .filter((candidate) => Number.isFinite(candidate.distance) && candidate.distance >= 0)
    .slice()
    .sort((left, right) => left.distance - right.distance);
  if (sorted.length === 0) return [];
  const pivot = sorted[Math.floor((sorted.length - 1) / 2)]?.distance ?? sorted[0]!.distance;
  const threshold = Math.max(sorted[0]!.distance, pivot * Math.max(1, outlierFactor));
  return sorted
    .filter((candidate) => candidate.distance <= threshold)
    .slice(0, Math.max(1, Math.trunc(maxNeighbors)));
}
