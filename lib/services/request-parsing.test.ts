import { describe, expect, it } from "vitest"
import { parseMoveItemsRequest } from "@/lib/services/items/move-items"
import { parseMoveBoxesRequest } from "@/lib/services/boxes/move-boxes"
import { parseDeleteBoxesRequest } from "@/lib/services/boxes/delete-boxes"
import { parseDeleteItemsRequest } from "@/lib/services/items/delete-items"
import { parseCreateBoxesRequest } from "@/lib/services/boxes/create-boxes"
import {
  ensurePasteTreesPresent,
  parsePasteBoxesRequest,
} from "@/lib/services/boxes/paste-boxes"

describe("service request parsing", () => {
  describe("parseMoveItemsRequest", () => {
    it("normalizes single-item request", () => {
      expect(parseMoveItemsRequest({ itemId: "item-1", targetBoxId: null })).toEqual({
        itemIds: ["item-1"],
        targetBoxId: null,
      })
    })

    it("throws when no item ids are provided", () => {
      expect(() => parseMoveItemsRequest({})).toThrow("itemId or itemIds array is required")
    })
  })

  describe("parseMoveBoxesRequest", () => {
    it("normalizes multi-box request", () => {
      expect(
        parseMoveBoxesRequest({ boxIds: ["box-a", "box-b"], targetParentBoxId: "box-root" })
      ).toEqual({
        boxIds: ["box-a", "box-b"],
        targetParentBoxId: "box-root",
      })
    })

    it("throws when no box ids are provided", () => {
      expect(() => parseMoveBoxesRequest({})).toThrow("boxId or boxIds array is required")
    })
  })

  describe("parseDeleteBoxesRequest", () => {
    it("accepts batch delete with single mode", () => {
      expect(
        parseDeleteBoxesRequest({
          boxes: [
            { boxId: "box-1", mode: "delete-all" },
            { boxId: "box-2", mode: "delete-all" },
          ],
        })
      ).toEqual({
        boxIds: ["box-1", "box-2"],
        mode: "delete-all",
      })
    })

    it("throws on mixed delete modes", () => {
      expect(() =>
        parseDeleteBoxesRequest({
          boxes: [
            { boxId: "box-1", mode: "delete-all" },
            { boxId: "box-2", mode: "move-to-root" },
          ],
        })
      ).toThrow("All boxes must have the same delete mode in batch operations")
    })
  })

  describe("parseDeleteItemsRequest", () => {
    it("normalizes single-item delete request", () => {
      expect(parseDeleteItemsRequest({ itemId: "item-1" })).toEqual(["item-1"])
    })
  })

  describe("parseCreateBoxesRequest", () => {
    it("normalizes a single box create request", () => {
      expect(parseCreateBoxesRequest({ name: "Root" })).toEqual([{ name: "Root" }])
    })

    it("throws on empty batch", () => {
      expect(() => parseCreateBoxesRequest({ boxes: [] })).toThrow(
        "boxes array must not be empty"
      )
    })
  })

  describe("parsePasteBoxesRequest", () => {
    it("normalizes paste payload", () => {
      expect(parsePasteBoxesRequest({ targetParentBoxId: "box-1" })).toEqual({
        inputTrees: [],
        sourceRootBoxIds: [],
        targetParentBoxId: "box-1",
      })
    })

    it("throws when no trees or source ids are provided", () => {
      expect(() => ensurePasteTreesPresent([], [])).toThrow(
        "trees array or sourceRootBoxIds array is required"
      )
    })
  })
})
