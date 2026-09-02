import { describe, expect, it } from "vitest";
import { categorize } from "./categories";
import { catalogValue } from "./estimate";

describe("categorize", () => {
  it("maps the raw values that leaked onto cards in Phase 7", () => {
    expect(categorize([{ value: "Mens>Apparel>SS Tops>t_shirt", count: 40 }])).toBe("Apparel");
    expect(
      categorize([
        { value: "EYE SHADOW PALETTE", count: 12 },
        { value: "Shadow Palette", count: 3 },
      ]),
    ).toBe("Beauty");
    expect(
      categorize([
        { value: "Stiletto", count: 30 },
        { value: "Sandals", count: 10 },
      ]),
    ).toBe("Footwear");
    expect(
      categorize([
        { value: "Bras", count: 50 },
        { value: "Wovens", count: 20 },
        { value: "Swim", count: 5 },
      ]),
    ).toBe("Apparel");
  });

  it("weights by product count, not by number of distinct tags", () => {
    expect(
      categorize([
        { value: "Coffee", count: 100 },
        { value: "Mug", count: 5 },
        { value: "Hat", count: 5 },
        { value: "Tee", count: 5 },
      ]),
    ).toBe("Food & Drink");
  });

  it("defaults to Other instead of guessing", () => {
    expect(categorize([])).toBe("Other");
    expect(
      categorize([
        { value: "Miscellaneous", count: 9 },
        { value: "Bundle", count: 4 },
      ]),
    ).toBe("Other");
  });
});

describe("catalogValue", () => {
  it("describes listed prices and nothing else", () => {
    expect(catalogValue([10, 20, 30])).toEqual({
      pricedProducts: 3,
      averagePrice: 20,
      listedValue: 60,
    });
    expect(catalogValue([])).toEqual({ pricedProducts: 0, averagePrice: null, listedValue: null });
  });
});
