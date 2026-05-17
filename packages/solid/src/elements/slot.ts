import { BaseRenderable, isTextNodeRenderable, TextNodeRenderable, TextRenderable, Yoga } from "@opentui/core"
import { getNextId } from "../utils/id-counter.js"
import { log } from "../utils/log.js"

const SlotMarkerBrand: unique symbol = Symbol.for("@opentui/solid/SlotMarker")

export interface SlotMarker {
  readonly id: string
  readonly [SlotMarkerBrand]: true
}

export interface SlotAdapter<NodeType, SlotNode = unknown> {
  createMarker(): SlotNode
  isMarker(node: unknown): node is SlotNode
  getHost(node: SlotNode): NodeType | null | undefined
  materialize(parent: NodeType, node: SlotNode): NodeType
  attached(parent: NodeType, node: SlotNode): NodeType | undefined
  removed(parent: NodeType, node: SlotNode, child?: NodeType): void
}

type LayoutNodeProvider = {
  getLayoutNode?: () => Yoga.Node
}

type LayoutNodeConstructor = { create?: () => Yoga.Node } | undefined
type SlotPlaceholder = TextSlotPlaceholder | LayoutSlotPlaceholder

interface PlaceholderEntry {
  node: SlotPlaceholder
}

interface SlotState {
  host: BaseRenderable | null
  placeholdersByParent: Map<BaseRenderable, PlaceholderEntry>
  layoutNodeCount: number
  textNodeCount: number
}

const slotStates = new WeakMap<SlotMarker, SlotState>()

function getLayoutNodeConstructor(parent?: BaseRenderable): LayoutNodeConstructor {
  const parentLayoutNode = (parent as LayoutNodeProvider | undefined)?.getLayoutNode?.()
  return parentLayoutNode?.constructor as LayoutNodeConstructor
}

function createLayoutSlotYogaNode(parentNodeConstructor?: LayoutNodeConstructor): Yoga.Node {
  return parentNodeConstructor?.create?.() ?? Yoga.default.Node.create()
}

function isSlotMarker(node: unknown): node is SlotMarker {
  return !!(node as SlotMarker | undefined)?.[SlotMarkerBrand]
}

function assertSlotMarker(node: unknown): SlotMarker {
  if (!isSlotMarker(node)) {
    throw new Error("Expected Solid slot marker")
  }

  return node
}

function getSlotState(marker: SlotMarker): SlotState {
  const state = slotStates.get(marker)
  if (!state) {
    throw new Error("Unknown Solid slot marker")
  }

  return state
}

function isTextSlotParent(parent: BaseRenderable): boolean {
  return isTextNodeRenderable(parent) || parent instanceof TextRenderable
}

function getAttachedSlotHost(state: SlotState, excludedNode?: BaseRenderable): BaseRenderable | null {
  for (const entry of state.placeholdersByParent.values()) {
    if (entry.node !== excludedNode && entry.node.parent) {
      return entry.node.parent
    }
  }

  return null
}

function getPlaceholderForParent(state: SlotState, parent: BaseRenderable): PlaceholderEntry | undefined {
  const mappedEntry = state.placeholdersByParent.get(parent)
  if (mappedEntry) {
    return mappedEntry
  }

  for (const [mappedParent, entry] of state.placeholdersByParent) {
    if (entry.node.parent !== parent) {
      continue
    }

    state.placeholdersByParent.delete(mappedParent)
    state.placeholdersByParent.set(parent, entry)
    return entry
  }
}

function disposePlaceholder(node: BaseRenderable): void {
  if (node instanceof TextSlotPlaceholder || node instanceof LayoutSlotPlaceholder) {
    node.destroy()
  }
}

function createSlotState(): SlotState {
  return {
    host: null,
    placeholdersByParent: new Map(),
    layoutNodeCount: 0,
    textNodeCount: 0,
  }
}

export function createSlotMarker(id: string): SlotMarker {
  const marker = {
    id,
    [SlotMarkerBrand]: true,
  } satisfies SlotMarker

  slotStates.set(marker, createSlotState())
  return marker
}

export function getSlotHost(marker: SlotMarker): BaseRenderable | null {
  return getSlotState(marker).host
}

export function destroySlotMarker(marker: SlotMarker): void {
  const state = getSlotState(marker)
  const placeholders = new Set(Array.from(state.placeholdersByParent.values(), (entry) => entry.node))
  state.placeholdersByParent.clear()
  state.host = null

  for (const placeholder of placeholders) {
    if (placeholder.parent) {
      placeholder.parent.remove(placeholder.id)
    }
    placeholder.destroy()
  }
}

export function createSlotAdapter(createId: () => string): SlotAdapter<BaseRenderable, SlotMarker> {
  return {
    createMarker(): SlotMarker {
      return createSlotMarker(createId())
    },

    isMarker(node: unknown): node is SlotMarker {
      return isSlotMarker(node)
    },

    getHost(node: SlotMarker): BaseRenderable | null {
      return getSlotHost(assertSlotMarker(node))
    },

    materialize(parent: BaseRenderable, node: SlotMarker): BaseRenderable {
      const marker = assertSlotMarker(node)
      const state = getSlotState(marker)
      const existingEntry = getPlaceholderForParent(state, parent)
      if (existingEntry) {
        state.host = parent
        return existingEntry.node
      }

      const entry = isTextSlotParent(parent)
        ? createTextPlaceholder(marker, state)
        : createLayoutPlaceholder(marker, state, parent)

      state.host = parent
      state.placeholdersByParent.set(parent, entry)
      return entry.node
    },

    attached(parent: BaseRenderable, node: SlotMarker): BaseRenderable | undefined {
      return getPlaceholderForParent(getSlotState(assertSlotMarker(node)), parent)?.node
    },

    removed(parent: BaseRenderable, node: SlotMarker, child?: BaseRenderable): void {
      const state = getSlotState(assertSlotMarker(node))
      if (child) {
        const entry = getPlaceholderForParent(state, parent)
        if (entry?.node === child) {
          state.placeholdersByParent.delete(parent)
        }

        disposePlaceholder(child)
      }

      if (state.host === parent) {
        state.host = getAttachedSlotHost(state, child)
      }
    },
  }
}

export const solidSlotAdapter = createSlotAdapter(() => {
  const id = getNextId("slot-node")
  log("Creating slot node", id)
  return id
})

function createTextPlaceholder(marker: SlotMarker, state: SlotState): PlaceholderEntry {
  return {
    node: new TextSlotPlaceholder(`slot-text-${marker.id}-${++state.textNodeCount}`),
  }
}

function createLayoutPlaceholder(marker: SlotMarker, state: SlotState, parent: BaseRenderable): PlaceholderEntry {
  return {
    node: new LayoutSlotPlaceholder(`slot-layout-${marker.id}-${++state.layoutNodeCount}`, parent),
  }
}

class TextSlotPlaceholder extends TextNodeRenderable {
  public destroyed: boolean = false

  constructor(id: string) {
    super({ id })
    this._visible = false
  }

  public override destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    super.destroy()
  }
}

class LayoutPlaceholderBase extends BaseRenderable {
  constructor(id: string) {
    super({ id })
  }

  public add(obj: BaseRenderable | unknown, index?: number): number {
    throw new Error("Can't add children on a slot placeholder")
  }

  public getChildren(): BaseRenderable[] {
    return []
  }

  public remove(id: string): void {}

  public insertBefore(obj: BaseRenderable | unknown, anchor: BaseRenderable | unknown): void {
    throw new Error("Can't add children on a slot placeholder")
  }

  public getRenderable(id: string): BaseRenderable | undefined {
    return undefined
  }

  public getChildrenCount(): number {
    return 0
  }

  public requestRender(): void {}

  public findDescendantById(id: string): BaseRenderable | undefined {
    return undefined
  }
}

class LayoutSlotPlaceholder extends LayoutPlaceholderBase {
  protected yogaNode: Yoga.Node
  public destroyed: boolean = false
  private yogaNodeFreed: boolean = false

  constructor(id: string, layoutParent?: BaseRenderable) {
    super(id)

    this._visible = false
    this.yogaNode = createLayoutSlotYogaNode(getLayoutNodeConstructor(layoutParent))
    this.yogaNode.setDisplay(Yoga.Display.None)
  }

  public getLayoutNode(): Yoga.Node {
    return this.yogaNode
  }

  public updateFromLayout() {}

  public updateLayout() {}

  public onRemove() {}

  private freeYogaNode(): void {
    if (this.yogaNodeFreed) {
      return
    }

    this.yogaNodeFreed = true

    try {
      this.yogaNode.free()
    } catch {}
  }

  public override destroy(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.freeYogaNode()
  }
}
