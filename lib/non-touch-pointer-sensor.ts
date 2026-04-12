"use client"

import { PointerSensor, type PointerSensorOptions } from "@dnd-kit/core"
import type { PointerEvent as ReactPointerEvent } from "react"

/**
 * PointerSensor activates on any pointer, including touch, which bypasses TouchSensor’s
 * long-press. This variant defers real finger contact to TouchSensor; mouse and stylus
 * (pointerType "pen") still use the pointer + distance path.
 */
export class NonTouchPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: "onPointerDown" as const,
      handler(
        reactEvent: ReactPointerEvent<Element>,
        options: PointerSensorOptions
      ) {
        if (reactEvent.nativeEvent.pointerType === "touch") {
          return false
        }
        return PointerSensor.activators[0].handler(reactEvent, options)
      },
    },
  ] as typeof PointerSensor.activators
}
