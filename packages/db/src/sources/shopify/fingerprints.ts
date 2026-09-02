/**
 * App and theme fingerprints matched against the storefront HTML (script
 * srcs, asset hosts, inline markers). Extend by adding an entry; keep
 * patterns specific enough not to match unrelated pages.
 */
export type AppFingerprint = { name: string; patterns: RegExp[] };

export const APP_FINGERPRINTS: AppFingerprint[] = [
  { name: "Klaviyo", patterns: [/static\.klaviyo\.com/i, /klaviyo\.js/i, /_learnq/i] },
  { name: "Gorgias", patterns: [/gorgias\.chat|config\.gorgias\.chat|gorgias\.com\/chat/i] },
  { name: "Judge.me", patterns: [/judge\.me\/|judgeme|cdn\.judge\.me/i] },
  {
    name: "Recharge",
    patterns: [/rechargepayments\.com|rechargeapps\.com|static\.rechargecdn\.com/i],
  },
  {
    name: "Yotpo",
    patterns: [/staticw2\.yotpo\.com|cdn-widgetsrepository\.yotpo\.com|yotpo\.com\/js/i],
  },
  { name: "Loox", patterns: [/loox\.io/i] },
  { name: "PageFly", patterns: [/pagefly/i] },
  { name: "Shopify Inbox", patterns: [/shopify-chat|inbox\.shopify|shopifychat/i] },
  { name: "ReConvert", patterns: [/reconvert/i] },
  { name: "Bold Upsell", patterns: [/boldapps\.net|shappify/i] },
  { name: "Smile.io", patterns: [/js\.smile\.io|smile\.io/i] },
  { name: "Privy", patterns: [/widget\.privy\.com|privy\.com/i] },
  { name: "Okendo", patterns: [/okendo/i] },
  { name: "Stamped", patterns: [/stamped\.io/i] },
  { name: "Rebuy", patterns: [/rebuyengine\.com/i] },
  { name: "Attentive", patterns: [/cdn\.attn\.tv|attentivemobile/i] },
  { name: "Postscript", patterns: [/postscript\.io/i] },
  { name: "Triple Whale", patterns: [/triplewhale/i] },
  { name: "Hotjar", patterns: [/static\.hotjar\.com/i] },
  { name: "Google Analytics", patterns: [/googletagmanager\.com\/gtag|google-analytics\.com/i] },
  { name: "Meta Pixel", patterns: [/connect\.facebook\.net\/[a-z_]+\/fbevents\.js/i] },
  { name: "TikTok Pixel", patterns: [/analytics\.tiktok\.com/i] },
  { name: "Shop Pay", patterns: [/shop\.app\/|shopify\.com\/shop_pay|shop-pay/i] },
];

/** Markers that identify a Shopify storefront. Any one suffices. */
export const SHOPIFY_MARKERS: RegExp[] = [
  /Shopify\.theme\s*=/,
  /cdn\.shopify\.com\//i,
  /shopify-section/i,
  /window\.Shopify\s*=/,
  /content="Shopify"/i,
  /\/cdn\/shop\/(t|files|products)\//i,
];
