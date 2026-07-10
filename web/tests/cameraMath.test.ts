import { describe, expect, it } from "vitest";
import {
  clippingPlanesForSphere,
  fitDistanceForSphere,
  selectFocusNeighbors,
} from "../src/cameraMath";

describe("camera framing math", () => {
  it("fits a large real-layout sphere using the limiting canvas field of view", () => {
    const radius = 1880.29;
    const distance = fitDistanceForSphere(radius, 48, 772 / 836, 1.15);
    expect(distance).toBeGreaterThan(radius * 2);
    expect(distance).toBeLessThan(7000);

    const planes = clippingPlanesForSphere(distance, radius);
    expect(planes.near).toBeGreaterThanOrEqual(0.01);
    expect(planes.near).toBeLessThan(distance - radius);
    expect(planes.far).toBeGreaterThan(distance + radius);
  });

  it("resets the near plane safely when moving from a huge fit to a close focus", () => {
    const overviewDistance = fitDistanceForSphere(3317.57, 48, 1, 1.15);
    const overviewPlanes = clippingPlanesForSphere(overviewDistance, 3317.57);
    expect(overviewPlanes.near).toBeGreaterThan(1);

    const focusedPlanes = clippingPlanesForSphere(4.5, 0.5);
    expect(focusedPlanes.near).toBe(0.01);
    expect(focusedPlanes.near).toBeLessThan(4.5);
    expect(focusedPlanes.far).toBeGreaterThan(4.5);
  });

  it("frames nearby context without allowing a distant relation to dominate focus", () => {
    const selected = selectFocusNeighbors([
      { index: 1, distance: 325.947 },
      { index: 2, distance: 480.455 },
      { index: 3, distance: 1364.301 },
    ]);
    expect(selected.map((candidate) => candidate.index)).toEqual([1, 2]);
  });
});
