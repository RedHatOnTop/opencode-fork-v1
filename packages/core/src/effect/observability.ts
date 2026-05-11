import { Effect, Layer, Logger } from "effect"
import * as EffectLogger from "./logger"

// Telemetry functionality has been removed from this fork.
// This file now only provides the basic logging layer.

export const enabled = false

export const layer = EffectLogger.layer

export const Observability = { enabled, layer }
