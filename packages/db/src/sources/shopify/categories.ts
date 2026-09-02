/**
 * Normalised store categories. `category` on a live store is derived by
 * matching the aggregated product_type values and tags against these keyword
 * rules, weighted by how many products carry each value. Add a rule to
 * extend; unmatched stores are "Other", never a guess.
 */
export const CATEGORIES = [
  "Apparel",
  "Footwear",
  "Beauty",
  "Home",
  "Food & Drink",
  "Fitness",
  "Accessories",
  "Jewelry",
  "Pets",
  "Electronics",
  "Other",
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Keywords are matched as whole words (case-insensitive) inside a tag/type. */
export const CATEGORY_RULES: { category: Exclude<Category, "Other">; keywords: string[] }[] = [
  {
    category: "Footwear",
    keywords: [
      "shoe",
      "shoes",
      "sneaker",
      "sneakers",
      "boot",
      "boots",
      "sandal",
      "sandals",
      "slipper",
      "slippers",
      "footwear",
      "heel",
      "heels",
      "stiletto",
      "loafer",
      "loafers",
      "trainer",
      "trainers",
    ],
  },
  {
    category: "Jewelry",
    keywords: [
      "jewelry",
      "jewellery",
      "necklace",
      "bracelet",
      "bracelets",
      "ring",
      "rings",
      "earring",
      "earrings",
      "pendant",
      "charm",
      "charms",
      "anklet",
    ],
  },
  {
    category: "Beauty",
    keywords: [
      "beauty",
      "skincare",
      "skin care",
      "makeup",
      "cosmetic",
      "cosmetics",
      "lipstick",
      "lip",
      "lips",
      "palette",
      "eyeshadow",
      "eye shadow",
      "shadow",
      "mascara",
      "foundation",
      "serum",
      "moisturizer",
      "moisturiser",
      "cleanser",
      "fragrance",
      "perfume",
      "haircare",
      "hair",
      "nail",
      "nails",
      "blush",
      "concealer",
      "brow",
      "lash",
      "lashes",
      "beard",
      "grooming",
    ],
  },
  {
    category: "Food & Drink",
    keywords: [
      "coffee",
      "tea",
      "food",
      "snack",
      "snacks",
      "drink",
      "drinks",
      "beverage",
      "chocolate",
      "candy",
      "supplement",
      "supplements",
      "protein",
      "vitamin",
      "vitamins",
      "oat",
      "oatly",
      "wine",
      "beer",
      "sauce",
      "spice",
      "spices",
      "grocery",
    ],
  },
  {
    category: "Fitness",
    keywords: [
      "fitness",
      "gym",
      "workout",
      "training",
      "yoga",
      "activewear",
      "sportswear",
      "athletic",
      "running",
      "cycling",
      "leggings",
      "sports bra",
      "compression",
    ],
  },
  {
    category: "Pets",
    keywords: [
      "pet",
      "pets",
      "dog",
      "dogs",
      "cat",
      "cats",
      "puppy",
      "kitten",
      "treats",
      "leash",
      "collar",
    ],
  },
  {
    category: "Electronics",
    keywords: [
      "electronics",
      "headphone",
      "headphones",
      "earbuds",
      "speaker",
      "speakers",
      "charger",
      "cable",
      "phone case",
      "gadget",
      "gadgets",
      "camera",
      "watch band",
      "smartwatch",
    ],
  },
  {
    category: "Home",
    keywords: [
      "home",
      "bedding",
      "sheet",
      "sheets",
      "comforter",
      "duvet",
      "pillow",
      "pillows",
      "towel",
      "towels",
      "rug",
      "rugs",
      "candle",
      "candles",
      "kitchen",
      "furniture",
      "decor",
      "blanket",
      "blankets",
      "bath",
      "mattress",
      "lamp",
      "lighting",
      "cookware",
      "mug",
      "mugs",
      "glassware",
    ],
  },
  {
    category: "Accessories",
    keywords: [
      "accessory",
      "accessories",
      "bag",
      "bags",
      "backpack",
      "wallet",
      "wallets",
      "belt",
      "belts",
      "hat",
      "hats",
      "cap",
      "caps",
      "beanie",
      "scarf",
      "sunglasses",
      "glasses",
      "watch",
      "watches",
      "socks",
      "sock",
      "gloves",
      "keychain",
      "umbrella",
      "tote",
    ],
  },
  {
    category: "Apparel",
    keywords: [
      "apparel",
      "clothing",
      "clothes",
      "shirt",
      "shirts",
      "t-shirt",
      "t_shirt",
      "tshirt",
      "tee",
      "tees",
      "top",
      "tops",
      "hoodie",
      "hoodies",
      "sweatshirt",
      "sweater",
      "jacket",
      "jackets",
      "coat",
      "coats",
      "pants",
      "trousers",
      "jeans",
      "denim",
      "shorts",
      "dress",
      "dresses",
      "skirt",
      "skirts",
      "swim",
      "swimwear",
      "bikini",
      "underwear",
      "bra",
      "bras",
      "lingerie",
      "wovens",
      "knit",
      "knits",
      "outerwear",
      "streetwear",
      "menswear",
      "womenswear",
      "mens",
      "womens",
      "unisex",
      "loungewear",
      "sleepwear",
      "pajamas",
      "bodysuit",
      "shapewear",
    ],
  },
];

export type TagCount = { value: string; count: number };

/**
 * Picks the category whose keywords are carried by the most products.
 * `tags` are aggregated product_type values and tags with product counts.
 * Returns "Other" when nothing matches.
 */
export function categorize(tags: TagCount[]): Category {
  const scores = new Map<Category, number>();
  for (const { value, count } of tags) {
    const words = tokenize(value);
    for (const rule of CATEGORY_RULES) {
      if (rule.keywords.some((k) => matches(words, value, k))) {
        scores.set(rule.category, (scores.get(rule.category) ?? 0) + count);
      }
    }
  }
  let best: Category = "Other";
  let bestScore = 0;
  for (const [category, score] of scores) {
    if (score > bestScore) {
      best = category;
      bestScore = score;
    }
  }
  return best;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function matches(words: Set<string>, value: string, keyword: string): boolean {
  if (keyword.includes(" ") || keyword.includes("-") || keyword.includes("_")) {
    return value.toLowerCase().includes(keyword.toLowerCase());
  }
  return words.has(keyword);
}
