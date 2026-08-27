// @layer0/viewer-training — a scenario runtime for the APS Viewer.
//
// The idea: a model already knows where everything is and what feeds what, so
// it can set an exercise and mark the answer. This package is the part that
// does not care which building it is — the schema for a mission, the pure
// marking, and `Layer0.ViewerTraining`, a viewer extension that holds the
// session and turns a step into viewer state.

export * from "./schema"
export * from "./evaluate"
export * from "./extension"
