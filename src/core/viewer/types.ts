// Minimal typings for the LMV globals we touch. The viewer bundle defines
// `Autodesk.Viewing` (with `.Scene` and `.Math` namespaces) on window at
// runtime.
//
// Everything declared here was read off a live 7.x bundle rather than copied
// from the docs, because the shipping Scene API is a little narrower than the
// blog post suggests. Where the two disagree the notes say so.

export interface AccessToken {
  token: string
  expiresIn: number
}

export interface InitializerOptions {
  env: string
  api?: string
  getAccessToken?: (
    onTokenReady: (token: string, expiresIn: number) => void,
  ) => void
}

// --- Math namespace (Autodesk.Viewing.Math, aliased `avm` in docs) ---

export interface Vector3 {
  x: number
  y: number
  z: number
  set(x: number, y: number, z: number): Vector3
  copy(v: Vector3): Vector3
  clone(): Vector3
  add(v: Vector3): Vector3
  sub(v: Vector3): Vector3
  normalize(): Vector3
  length(): number
  multiplyScalar(s: number): Vector3
  distanceTo(v: Vector3): number
}

export interface Quaternion {
  setFromAxisAngle(axis: Vector3, angle: number): Quaternion
  setFromUnitVectors(from: Vector3, to: Vector3): Quaternion
}

export interface Matrix4 {
  elements: ArrayLike<number>
  identity(): Matrix4
  clone(): Matrix4
  compose(position: Vector3, quaternion: Quaternion, scale: Vector3): Matrix4
  multiplyMatrices(a: Matrix4, b: Matrix4): Matrix4
}

export interface MathNamespace {
  Vector3: new (x?: number, y?: number, z?: number) => Vector3
  Matrix4: new () => Matrix4
  Quaternion: new () => Quaternion
  Vector4: new (x?: number, y?: number, z?: number, w?: number) => unknown
  Box3: new (min?: Vector3, max?: Vector3) => unknown
}

// --- Scene namespace (Autodesk.Viewing.Scene, aliased `avs` in docs) ---

export interface BufferGeometry {
  setAttribute(name: string, attribute: unknown): void
  setIndices(indices: Uint16Array | Uint32Array): void
}

/** Constructor options common to the Scene API materials. */
export interface MaterialParams {
  color?: number
  opacity?: number
  transparent?: boolean
  /** 0 = off, 2 = per-vertex `color` attribute. */
  vertexColors?: number
  /** Metallic response on `StandardMaterial`. */
  metal?: boolean
  side?: number
  depthWrite?: boolean
  depthTest?: boolean
  [k: string]: unknown
}

export interface SceneMaterial {
  setColor?(color: number): void
  setOpacity?(opacity: number): void
}

/** `avs.VisibilityState` — used by the `Node3D` scene graph. */
export interface VisibilityStates {
  Visible: number
  Ghosted: number
  Hidden: number
}

export interface SceneNamespace {
  BufferGeometry: new () => BufferGeometry
  BufferAttribute: new (array: ArrayBufferView, itemSize: number) => unknown
  StandardMaterial: new (params?: MaterialParams) => SceneMaterial
  UnlitMaterial: new (params?: MaterialParams) => SceneMaterial
  LineMaterial: new (params?: MaterialParams) => SceneMaterial
  PointsMaterial: new (params?: MaterialParams) => SceneMaterial
  Node3D: new () => unknown
  InstanceNode3D: new (geometry: unknown, material: unknown) => unknown
  VisibilityState: VisibilityStates
  Side: { Front: number; Back: number; Double: number }
  GeometryFactory?: unknown
}

// --- Instances / model ---

export interface InstanceCollection3D {
  /** Binds geometry + material + optional transform; returns the instance id. */
  add(geometry: unknown, material: unknown, transform?: Matrix4): number
  remove(id: number): void
  setMaterial(id: number, material: unknown): void
  /** Per-instance placement. There is no `setTransform` on the shipping build. */
  setTransformLocal(id: number, transform: Matrix4): void
  setTransformWorld(id: number, transform: Matrix4): void
  getCount(): number
  getDbId(id: number): number
  /** Collection-wide only — the build exposes no per-instance visibility. */
  setAllVisibility(visible: boolean): void
  getSceneGraph(): unknown
}

export interface SceneModel {
  getInstances(): InstanceCollection3D
  getObjectTree?(...args: unknown[]): unknown
}

export interface Camera {
  setView(view: { position: Vector3; target: Vector3; up: Vector3 }): void
}

/** `viewer.navigation` — the read/write side of the camera. */
export interface Navigation {
  getPosition(): Vector3
  getTarget(): Vector3
  getCameraUpVector?(): Vector3
  setPosition(position: Vector3): void
  setTarget(target: Vector3): void
  setView?(position: Vector3, target: Vector3): void
  getVerticalFov?(): number
}

/** `viewer.toolController` — which navigation tool has the pointer. */
export interface ToolController {
  getActiveToolName(): string
  activateTool(name: string): boolean
  deactivateTool(name: string): boolean
  setDefaultTool(tool: unknown): boolean
}

/** Base class for viewer extensions; a runtime global, not an import. */
export interface ViewerExtension {
  viewer: Viewer3D
  load(): boolean | Promise<boolean>
  unload(): boolean
  activate?(mode?: string): boolean
  deactivate?(): boolean
}

export interface ExtensionManager {
  registerExtension(id: string, extension: unknown): boolean
  unregisterExtension(id: string): boolean
  getExtension(id: string): unknown
}

export interface HitTestResult {
  distance: number
  point: Vector3
  /** For a dynamic model this is the instance id returned by `instances.add`. */
  fragId: number
  dbId: number
  modelId?: number
}

export interface ViewerImpl {
  hitTest(clientX: number, clientY: number, ignoreTransparent?: boolean): HitTestResult | null
  getCanvasBoundingClientRect(): DOMRect
  clientToWorld(clientX: number, clientY: number): { point: Vector3 } | null
  /** World point → canvas-relative pixels. `z > 1` means behind the camera. */
  worldToClient(point: Vector3): Vector3
  clientToViewport(clientX: number, clientY: number): Vector3
  /** Ray through a viewport point; the return is THREE-shaped. */
  viewportToRay(viewport: Vector3): { origin: Vector3; direction: Vector3 }
  invalidate(needsClear?: boolean, needsRender?: boolean, overlayDirty?: boolean): void
}

export interface Viewer3D {
  start(): number
  showModel(model: SceneModel): void
  refresh(clear?: boolean): void
  /**
   * BimWalk's own first-run controls dialog. Present from 7.x; optional here
   * because a build without the extension will not define it.
   */
  setBimWalkToolPopup?(show: boolean): void
  /** Gradient canvas background, RGB channels from 0–255. */
  setBackgroundColor?(topR: number, topG: number, topB: number, bottomR: number, bottomG: number, bottomB: number): void
  getCamera(): Camera
  loadExtension(id: string, options?: object): Promise<unknown>
  getExtension(id: string): unknown
  addEventListener(type: string, handler: (event: unknown) => void): void
  removeEventListener(type: string, handler: (event: unknown) => void): void
  /** Section planes as Vector4 (nx, ny, nz, d); an empty array clears them. */
  setCutPlanes(planes: unknown[]): void
  getCutPlanes(): unknown[]
  container: HTMLElement
  canvas?: HTMLCanvasElement
  navigation: Navigation
  toolController: ToolController
  impl: ViewerImpl
  finish(): void
  resize(): void
}

export interface AutodeskViewingGlobal {
  Initializer(options: InitializerOptions, onReady: () => void): void
  GuiViewer3D: new (container: HTMLElement, config?: object) => Viewer3D
  Viewer3D: new (container: HTMLElement, config?: object) => Viewer3D
  Model: new () => SceneModel
  Scene: SceneNamespace
  Math: MathNamespace
  FeatureFlags?: { set(flag: string, value: boolean): void }
  PublicFeatureFlags?: { SceneAPI: string }
  /** Subclass this to write an extension; only exists at runtime. */
  Extension: new (viewer: Viewer3D, options?: object) => ViewerExtension
  theExtensionManager: ExtensionManager
  CAMERA_CHANGE_EVENT?: string
  shutdown?: () => void
}

declare global {
  interface Window {
    Autodesk?: { Viewing: AutodeskViewingGlobal }
  }
}
