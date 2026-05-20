import type { TextNodeRenderable } from "@opentui/core"

export const BrandedMarkerRenderable: unique symbol = Symbol.for("@opentui/solid/MarkerRenderable")

const markerIds = new Set<string>()

export function registerMarkerRenderable(id: string): void {
  markerIds.add(id)
}

export function isRegisteredMarkerId(id: string): boolean {
  return markerIds.has(id)
}

export function isMarkerRenderable(obj: any): obj is TextNodeRenderable {
  return !!obj?.[BrandedMarkerRenderable]
}
