import { BaseRenderable, isTextNodeRenderable, TextNodeRenderable, TextRenderable, Yoga } from "@opentui/core"

type LayoutNodeProvider = {
  getLayoutNode?: () => Yoga.Node
}

type LayoutNodeConstructor = { create?: () => Yoga.Node } | undefined

function getLayoutNodeConstructor(parent?: BaseRenderable): LayoutNodeConstructor {
  const parentLayoutNode = (parent as LayoutNodeProvider | undefined)?.getLayoutNode?.()
  return parentLayoutNode?.constructor as LayoutNodeConstructor
}

function createLayoutSlotYogaNode(parentNodeConstructor?: LayoutNodeConstructor): Yoga.Node {
  return parentNodeConstructor?.create?.() ?? Yoga.default.Node.create()
}

class SlotBaseRenderable extends BaseRenderable {
  constructor(id: string) {
    super({
      id,
    })
  }

  public add(obj: BaseRenderable | unknown, index?: number): number {
    throw new Error("Can't add children on an Slot renderable")
  }

  public getChildren(): BaseRenderable[] {
    return []
  }

  public remove(id: string): void {}

  public insertBefore(obj: BaseRenderable | unknown, anchor: BaseRenderable | unknown): void {
    throw new Error("Can't add children on an Slot renderable")
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

  public override destroyRecursively(): void {
    this.destroy()
  }
}

export class TextSlotRenderable extends TextNodeRenderable {
  protected slotParent?: SlotRenderable
  protected destroyed: boolean = false

  constructor(id: string, parent?: SlotRenderable) {
    super({ id: id })
    this._visible = false
    this.slotParent = parent
  }

  public detachFromSlot(): void {
    this.slotParent = undefined
  }

  public disposeWithoutSlotCascade(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.detachFromSlot()
  }

  public override destroyRecursively(): void {
    this.destroy()
  }

  public override destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    const slotParent = this.slotParent
    this.slotParent = undefined

    slotParent?.destroy()
    super.destroy()
  }
}

export class LayoutSlotRenderable extends SlotBaseRenderable {
  protected yogaNode: Yoga.Node
  protected slotParent?: SlotRenderable
  protected destroyed: boolean = false
  private yogaNodeConstructor: LayoutNodeConstructor
  private yogaNodeFreed: boolean = false

  constructor(id: string, parent?: SlotRenderable, layoutParent?: BaseRenderable) {
    super(id)

    this._visible = false
    this.slotParent = parent
    this.yogaNodeConstructor = getLayoutNodeConstructor(layoutParent)
    this.yogaNode = createLayoutSlotYogaNode(this.yogaNodeConstructor)
    this.yogaNode.setDisplay(Yoga.Display.None)
  }

  public getLayoutNode(): Yoga.Node {
    return this.yogaNode
  }

  public updateFromLayout() {}

  public updateLayout() {}

  public onRemove() {}

  public isCompatibleWith(layoutParent?: BaseRenderable): boolean {
    return this.yogaNodeConstructor === getLayoutNodeConstructor(layoutParent)
  }

  public detachFromSlot(): void {
    this.slotParent = undefined
  }

  private freeYogaNode(): void {
    if (this.yogaNodeFreed) {
      return
    }

    this.yogaNodeFreed = true

    try {
      this.yogaNode.free()
    } catch {}
  }

  public disposeWithoutSlotCascade(): void {
    if (this.destroyed) {
      return
    }

    this.destroyed = true
    this.detachFromSlot()
    this.freeYogaNode()
  }

  public override destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    const slotParent = this.slotParent
    this.slotParent = undefined

    this.freeYogaNode()
    slotParent?.destroy()
  }
}

export class SlotRenderable extends SlotBaseRenderable {
  protected destroyed: boolean = false
  private layoutSlotNode?: LayoutSlotRenderable
  private textSlotNode?: TextSlotRenderable
  private textSlotHost?: BaseRenderable
  private layoutNodeCount: number = 0
  private textNodeCount: number = 0

  constructor(id: string) {
    super(id)

    this._visible = false
  }

  public get layoutNode(): LayoutSlotRenderable | undefined {
    return this.layoutSlotNode
  }

  public get textNode(): TextSlotRenderable | undefined {
    return this.textSlotNode
  }

  private isTextSlotParent(parent: BaseRenderable): boolean {
    return isTextNodeRenderable(parent) || parent instanceof TextRenderable
  }

  private getTextSlotHost(): BaseRenderable | null {
    if (!this.textSlotNode?.parent) {
      return null
    }

    return this.textSlotHost ?? this.textSlotNode.parent
  }

  private getLayoutSlotHost(): BaseRenderable | null {
    return this.layoutSlotNode?.parent ?? null
  }

  private isSlotChildAttachedToParent(parent: BaseRenderable, child: BaseRenderable): boolean {
    if (parent instanceof TextRenderable) {
      return parent.getTextChildren().includes(child)
    }

    return parent.getChildren().includes(child)
  }

  private detachSlotChildFromParent(parent: BaseRenderable, child: BaseRenderable): void {
    if (!this.isSlotChildAttachedToParent(parent, child)) {
      return
    }

    parent.remove(child.id)
  }

  private detachAttachedSlotChildrenExcept(parent: BaseRenderable): void {
    const textNode = this.textSlotNode
    const textHost = this.getTextSlotHost()
    if (textNode && textHost && textHost !== parent) {
      this.detachSlotChildFromParent(textHost, textNode)
    }

    const layoutNode = this.layoutSlotNode
    const layoutHost = this.getLayoutSlotHost()
    if (layoutNode && layoutHost && layoutHost !== parent) {
      this.detachSlotChildFromParent(layoutHost, layoutNode)
    }
  }

  private disposeLayoutNode(): void {
    this.layoutSlotNode?.disposeWithoutSlotCascade()
    this.layoutSlotNode = undefined
  }

  private getAttachedSlotChildForParent(parent: BaseRenderable): BaseRenderable | undefined {
    if (this.isTextSlotParent(parent)) {
      const textNode = this.textSlotNode
      if (textNode && this.getTextSlotHost() === parent) {
        return textNode
      }

      return undefined
    }

    const layoutNode = this.layoutSlotNode
    if (layoutNode?.parent === parent) {
      return layoutNode
    }
  }

  getSlotChild(parent: BaseRenderable) {
    this.detachAttachedSlotChildrenExcept(parent)
    this.parent = parent

    if (this.isTextSlotParent(parent)) {
      this.textSlotNode ??= new TextSlotRenderable(`slot-text-${this.id}-${++this.textNodeCount}`, this)
      this.textSlotHost = parent
      return this.textSlotNode
    }

    if (this.layoutSlotNode && !this.layoutSlotNode.isCompatibleWith(parent)) {
      this.disposeLayoutNode()
    }

    this.layoutSlotNode ??= new LayoutSlotRenderable(`slot-layout-${this.id}-${++this.layoutNodeCount}`, this, parent)
    return this.layoutSlotNode
  }

  getSlotChildForRemoval(parent: BaseRenderable): BaseRenderable | undefined {
    if (this.parent !== parent) {
      return undefined
    }

    return this.getAttachedSlotChildForParent(parent)
  }

  didRemoveSlotChild(parent: BaseRenderable, child: BaseRenderable): void {
    if (this.parent === parent && (child === this.textSlotNode || child === this.layoutSlotNode)) {
      this.parent = null
    }
  }

  public override destroy(): void {
    if (this.destroyed) {
      return
    }
    this.destroyed = true

    const layoutNode = this.layoutSlotNode
    this.layoutSlotNode = undefined
    layoutNode?.destroy()

    const textNode = this.textSlotNode
    this.textSlotNode = undefined
    this.textSlotHost = undefined
    textNode?.destroy()
  }
}
