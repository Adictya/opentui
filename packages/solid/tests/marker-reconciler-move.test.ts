import { describe, expect, it } from "bun:test"
import { BoxRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { batch, createRoot, createSignal } from "solid-js"
import { createMarkerNode, insert } from "../index.js"

type MoveOrder = "remove-then-insert" | "insert-then-remove"

async function runMoveScenario(order: MoveOrder) {
  const setup = await createTestRenderer({ width: 40, height: 10 })
  const parentA = new BoxRenderable(setup.renderer, {
    id: `marker-parent-a-${order}`,
    width: 10,
    height: 1,
  })
  const parentB = new BoxRenderable(setup.renderer, {
    id: `marker-parent-b-${order}`,
    width: 10,
    height: 1,
  })

  setup.renderer.root.add(parentA)
  setup.renderer.root.add(parentB)

  const marker = createMarkerNode()
  const controls = createRoot((dispose) => {
    const [inParentA, setInParentA] = createSignal(true)
    const [inParentB, setInParentB] = createSignal(false)

    const mountInParentA = () => (inParentA() ? marker : null)
    const mountInParentB = () => (inParentB() ? marker : null)

    if (order === "remove-then-insert") {
      insert(parentA, mountInParentA)
      insert(parentB, mountInParentB)
    } else {
      insert(parentB, mountInParentB)
      insert(parentA, mountInParentA)
    }

    return {
      dispose,
      move(): void {
        batch(() => {
          setInParentB(true)
          setInParentA(false)
        })
      },
    }
  })

  const originalChild = parentA.getChildren()[0]
  if (!originalChild) {
    throw new Error(`Expected marker child in parent A for ${order}`)
  }
  const originalLayoutNode = marker.getLayoutNode()

  controls.move()

  const movedChild = parentB.getChildren()[0]
  if (!movedChild) {
    throw new Error(`Expected marker child in parent B for ${order}`)
  }

  const movedLayoutNode = marker.getLayoutNode()

  await Bun.sleep(0)

  return {
    controls,
    marker,
    movedChild,
    movedLayoutNode,
    originalChild,
    originalLayoutNode,
    parentA,
    parentB,
    setup,
  }
}

describe("marker moves", () => {
  it("moves one marker instance for remove-then-insert moves", async () => {
    const {
      controls,
      marker,
      movedChild,
      movedLayoutNode,
      originalChild,
      originalLayoutNode,
      parentA,
      parentB,
      setup,
    } = await runMoveScenario("remove-then-insert")

    try {
      expect(movedChild).toBe(originalChild)
      expect(movedChild).toBe(marker as unknown as Renderable)
      expect(parentA.getChildren()).toHaveLength(0)
      expect(parentB.getChildren()).toHaveLength(1)
      expect(parentB.getChildren()[0]).toBe(marker as unknown as Renderable)
      expect(marker.parent).toBe(parentB)
      expect(movedLayoutNode).toBe(originalLayoutNode)
      expect(marker.isDestroyed).toBe(false)
    } finally {
      controls.dispose()
      setup.renderer.destroy()
    }
  })

  it("moves one marker instance for insert-then-remove moves", async () => {
    const {
      controls,
      marker,
      movedChild,
      movedLayoutNode,
      originalChild,
      originalLayoutNode,
      parentA,
      parentB,
      setup,
    } = await runMoveScenario("insert-then-remove")

    try {
      expect(movedChild).toBe(originalChild)
      expect(movedChild).toBe(marker as unknown as Renderable)
      expect(parentA.getChildren()).toHaveLength(0)
      expect(parentB.getChildren()).toHaveLength(1)
      expect(parentB.getChildren()[0]).toBe(marker as unknown as Renderable)
      expect(marker.parent).toBe(parentB)
      expect(movedLayoutNode).toBe(originalLayoutNode)
      expect(marker.isDestroyed).toBe(false)
    } finally {
      controls.dispose()
      setup.renderer.destroy()
    }
  })
})
