import { describe, expect, it } from "bun:test"
import { BoxRenderable, Yoga } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { batch, createRoot, createSignal } from "solid-js"
import { insert } from "../index.js"
import { createSlotAdapter, createSlotMarker, getSlotHost, type SlotMarker } from "../src/elements/slot.js"

type MoveOrder = "remove-then-insert" | "insert-then-remove"

let slotId = 0

function createTestSlotMarker(): SlotMarker {
  return createSlotMarker(`test-slot-${++slotId}`)
}

function assignDistinctLayoutConstructor(parent: BoxRenderable): void {
  const layoutNode = parent.getLayoutNode() as Yoga.Node & { constructor?: { create?: () => Yoga.Node } }

  Object.defineProperty(layoutNode, "constructor", {
    value: { create: () => Yoga.default.Node.create() },
    configurable: true,
  })
}

async function runMoveScenario(order: MoveOrder) {
  const setup = await createTestRenderer({ width: 40, height: 10 })
  const parentA = new BoxRenderable(setup.renderer, {
    id: `slot-parent-a-${order}`,
    width: 10,
    height: 1,
  })
  const parentB = new BoxRenderable(setup.renderer, {
    id: `slot-parent-b-${order}`,
    width: 10,
    height: 1,
  })

  setup.renderer.root.add(parentA)
  setup.renderer.root.add(parentB)
  assignDistinctLayoutConstructor(parentA)
  assignDistinctLayoutConstructor(parentB)

  const slot = createTestSlotMarker()
  const controls = createRoot((dispose) => {
    const [inParentA, setInParentA] = createSignal(true)
    const [inParentB, setInParentB] = createSignal(false)

    const mountInParentA = () => (inParentA() ? slot : null)
    const mountInParentB = () => (inParentB() ? slot : null)

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
    throw new Error(`Expected slot child in parent A for ${order}`)
  }

  controls.move()

  const movedChild = parentB.getChildren()[0]
  if (!movedChild) {
    throw new Error(`Expected slot child in parent B for ${order}`)
  }

  await Bun.sleep(0)

  return {
    controls,
    movedChild,
    originalChild,
    parentA,
    parentB,
    setup,
  }
}

describe("slot placeholder moves", () => {
  it("recreates incompatible layout placeholders for remove-then-insert moves", async () => {
    const { controls, movedChild, originalChild, parentA, parentB, setup } = await runMoveScenario("remove-then-insert")

    try {
      expect(movedChild).not.toBe(originalChild)
      expect(parentA.getChildren()).toHaveLength(0)
      expect(parentB.getChildren()).toHaveLength(1)
      expect(parentB.getChildren()[0]).toBe(movedChild)
      expect(movedChild.parent).toBe(parentB)
      expect((movedChild as any).destroyed).toBe(false)
    } finally {
      controls.dispose()
      setup.renderer.destroy()
    }
  })

  it("recreates incompatible layout placeholders for insert-then-remove moves", async () => {
    const { controls, movedChild, originalChild, parentA, parentB, setup } = await runMoveScenario("insert-then-remove")

    try {
      expect(movedChild).not.toBe(originalChild)
      expect(parentA.getChildren()).toHaveLength(0)
      expect(parentB.getChildren()).toHaveLength(1)
      expect(parentB.getChildren()[0]).toBe(movedChild)
      expect(movedChild.parent).toBe(parentB)
      expect((movedChild as any).destroyed).toBe(false)
    } finally {
      controls.dispose()
      setup.renderer.destroy()
    }
  })

  it("promotes the slot host back to another attached host when the newest placeholder is removed", async () => {
    const setup = await createTestRenderer({ width: 40, height: 10 })
    const parentA = new BoxRenderable(setup.renderer, {
      id: "slot-parent-host-a",
      width: 10,
      height: 1,
    })
    const parentB = new BoxRenderable(setup.renderer, {
      id: "slot-parent-host-b",
      width: 10,
      height: 1,
    })

    setup.renderer.root.add(parentA)
    setup.renderer.root.add(parentB)

    const slotAdapter = createSlotAdapter(() => `test-slot-${++slotId}`)
    const slot = slotAdapter.createMarker()

    try {
      const childA = slotAdapter.materialize(parentA, slot)
      parentA.add(childA)

      const childB = slotAdapter.materialize(parentB, slot)
      parentB.add(childB)

      expect(getSlotHost(slot)).toBe(parentB)

      parentB.remove(childB.id)
      slotAdapter.removed(parentB, slot, childB)

      expect(getSlotHost(slot)).toBe(parentA)
      expect(parentA.getChildren()[0]).toBe(childA)
      expect(parentB.getChildren()).toHaveLength(0)
    } finally {
      setup.renderer.destroy()
    }
  })
})
